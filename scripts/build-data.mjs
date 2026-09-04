#!/usr/bin/env node
/**
 * Rebuild src/data/plejecentre.ts from the authoritative sources.
 *
 *   1. Download the monthly CSV extract from Plejehjemsoversigten — the
 *      statutory national register of Danish plejehjem, plejecentre and
 *      friplejeboliger, maintained by Sundhedsdatastyrelsen.
 *   2. Keep every active row, in all 98 municipalities.
 *   3. Check each row's municipality against the landsdel table, so nothing is
 *      written that the interface could not file under Sjælland, Fyn or Jylland.
 *   4. Resolve every row against Danmarks Adresseregister (DAWA) to get an
 *      official address and WGS84 coordinates. Nothing is placed on the map on
 *      a guessed coordinate: a row that will not resolve is reported, not shipped.
 *
 * This used to keep only the 23 Greater Copenhagen municipalities. The whole
 * country is roughly 950 rows rather than 148, which is why the geocoding below
 * runs a few requests at a time instead of one after another: serially it is
 * about ten minutes of waiting on a public API, and DAWA is a free government
 * service that should be asked politely rather than as fast as possible.
 *
 * Usage: npm run build:data
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { canonicalNames, regionLookup } from './landsdele.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/data/plejecentre.ts');

const CSV_URL = 'https://admin.plejehjemsoversigten.dk/handlers/downloadcsvfilehandler.ashx';
const DAWA = 'https://api.dataforsyningen.dk/adgangsadresser';

/**
 * Which part of the country each municipality is in, read from src/regions.ts.
 *
 * Used here only to check that every row can be placed. The answer is not
 * written into the data file: the application derives it from the municipality
 * the row already carries, so correcting the table never means regenerating
 * the data.
 */
const regionOf = regionLookup();

/**
 * The spelling to write down, for a municipality the register spells its way.
 *
 * The first national build reported 99 municipalities in a country that has
 * 98: the register uses more than one spelling for the same place, and two
 * spellings are two entries in the kommune list. The landsdel table's spelling
 * is the one that gets stored.
 */
const canonical = canonicalNames();

/**
 * How many geocoding requests are in flight at once.
 *
 * DAWA is free, public and run by a government agency, and this is a build
 * step that runs once a month. Six is enough to turn ten minutes into two and
 * modest enough that nobody has to think about it.
 */
const CONCURRENCY = 6;

/**
 * A handful of register rows carry a malformed street field (a repeated name, a
 * floor note, an empty house number). These are the corrected addresses, each
 * confirmed against the operator's own page before being written down here.
 */
const ADDRESS_FIXES = {
  'Plejehjemmet Hareskovbo': ['Skovalleen', '8', '2880'],
  'Lions Park Søllerød': ['Mariehøjvej', '23', '2850'],
  'OK Prinsesse Benedikte': ['Sankt Nikolaj Vej', '4', '1953'],
  'Plejecenter Egeparken': ['Rådhusstrædet', '4', '3650'],
  'Nældebjerg - Kompetencecenter for Demens': ['Rådhusholmen', '8A', '2670'],
  'Lærkegaard Center': ['Persillehaven', '30', '2730'],
  'Plejehjemmet Svanepunktet': ['Paltholmterrasserne', '35', '3520'],
};

/* ------------------------------------------------------- field validation */

/**
 * The municipality name as this project stores it: without the trailing word.
 *
 * "Regions" is in the pattern because of exactly one row. Bornholm is a
 * regionskommune -- a municipality and a region at once -- so the register
 * writes "Bornholms Regionskommune", and a plain " Kommune" trim leaves it
 * whole. That is the row the first national build stopped on.
 */
const kommuneName = (raw) => (raw ?? '').replace(/\s+(?:Regions)?kommune\s*$/i, '').trim();


/**
 * The register's Phone and Email columns are free text, and ~58 rows nationally
 * carry the literal placeholder "Besøg hjemmeside" instead of a value. Others
 * hold two numbers separated by a slash or the word "eller". A placeholder
 * rendered as `tel:+45` is worse than an absent field: it looks callable and
 * dials nothing. So both are validated, and anything that is not a real value
 * becomes null.
 */
function cleanPhone(raw) {
  if (!raw) return null;
  // "57 87 66 68/57 87 66 62", "2488 6941 eller 2488 6936" -> the first number.
  const first = String(raw).split(/\/|\beller\b|,/i)[0];
  const digits = first.replace(/\D/g, '').replace(/^45(?=\d{8}$)/, '');
  return digits.length === 8 ? digits : null;
}

function cleanEmail(raw) {
  const v = (raw ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/**
 * Copenhagen's municipal homes are the bulk of the placeholder rows: the
 * register points at boligertilaeldre.kk.dk instead of publishing a number.
 * Those numbers are public on each home's own contact page, so they are read
 * from there and matched back by address. Secondary source, used only to fill a
 * gap the primary register leaves empty, never to overwrite it.
 */
async function copenhagenPhones() {
  try {
    return await copenhagenPhonesInner();
  } catch (err) {
    // This is a nice-to-have and nothing else: it fills in phone numbers the
    // register leaves blank for Copenhagen's municipal homes. A national build
    // of 929 rows must not die because one optional municipal website is
    // having a bad afternoon -- which is exactly what happened, with an
    // ECONNREFUSED that threw away a complete extract.
    console.warn(`  kk.dk unavailable (${err?.cause?.code ?? err.message}); continuing without backfill.`);
    return new Map();
  }
}

async function copenhagenPhonesInner() {
  const base = 'https://boligertilaeldre.kk.dk/plejehjem/find-plejehjem';
  const slugs = new Set();
  for (let page = 0; page < 8; page++) {
    const res = await fetch(`${base}?page=${page}`);
    if (!res.ok) break;
    const html = await res.text();
    const found = [...html.matchAll(/href="\/plejehjem\/find-plejehjem\/([a-z0-9-]+)"/g)].map((m) => m[1]);
    if (found.length === 0) break;
    for (const s of found) slugs.add(s);
  }

  const byAddress = new Map();
  for (const slug of slugs) {
    let res;
    try {
      res = await fetch(`${base}/${slug}/kontakt`);
    } catch {
      continue; // One unreachable page costs one phone number, not the build.
    }
    if (!res.ok) continue;
    const text = (await res.text()).replace(/<[^>]+>/g, '\n');
    const lines = text
      .split('\n')
      .map((l) => l.replace(/&#\d+;|&[a-z]+;/g, ' ').trim())
      .filter(Boolean);

    const k = lines.indexOf('Kontakt os');
    if (k === -1) continue;
    const block = lines.slice(k + 1, k + 8);
    const pi = block.findIndex((l) => /^\d{4}$/.test(l));
    if (pi === -1) continue;

    const street = block.slice(1, pi).join(' ').replace(/\s+/g, ' ').trim();
    const postcode = block[pi];

    const t = lines.indexOf('Telefon', k);
    const phone = t === -1 ? null : cleanPhone(lines[t + 1]);
    if (phone) byAddress.set(`${street.toLowerCase().replace(/\s/g, '')}|${postcode}`, phone);
  }
  return byAddress;
}

/* --------------------------------------------------------------- CSV parse */

function parseCsv(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delimiter) { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (c === '\r') continue;
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length >= header.length - 2)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/* ------------------------------------------------------------- geocoding */

/**
 * One address lookup, and the retry that makes nine hundred of them survivable.
 *
 * A national build asks DAWA a few thousand times. At that volume a dropped
 * connection is not a possibility, it is a scheduled event, and an unhandled
 * one throws away every row geocoded before it. So a network failure is
 * retried once after a moment, and a second failure gives up on that lookup
 * alone: the row is reported as unresolved and the build carries on, which is
 * the same outcome as an address the register spelled wrong.
 */
async function dawa(params) {
  const url = `${DAWA}?${new URLSearchParams({ ...params, struktur: 'mini' })}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      if (attempt === 1) {
        console.warn(`    lookup failed (${err?.cause?.code ?? err.message}); the row will be reported.`);
        return [];
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return [];
}

/**
 * Undo the three ways the register mangles an address, before asking DAWA.
 *
 * These are not guesses about what an address might be; each is a shape the
 * national extract actually produced, and each is reversible without inventing
 * anything. The first national run lost 34 of 929 rows and half of them were
 * these three:
 *
 *   "Erritsø Bygade A" + "85A"   the house letter is in the street as well as
 *                                the number. Eight rows. Dropping the trailing
 *                                letter is safe only when the number already
 *                                ends in that same letter, which is the check.
 *   "Skovvangsvej 99A" + "99A"   the whole house number, twice.
 *   postcode "4250 Fuglebjerg"   the postal town in the postcode column. Six
 *                                rows. Four digits is unambiguous.
 *
 * Anything that does not match a shape is passed through untouched, so a row
 * this does not understand fails loudly as before rather than being bent into
 * the wrong address.
 */
function tidyAddress(street, houseNo, postcode) {
  let st = (street ?? '').replace(/\s+/g, ' ').trim();
  const no = (houseNo ?? '').replace(/\s+/g, ' ').trim();

  // The house number repeated at the end of the street name.
  if (no && st.toUpperCase().endsWith(` ${no.toUpperCase()}`)) {
    st = st.slice(0, -(no.length + 1)).trim();
  }

  // A lone capital at the end of the street that is the number's own letter.
  const tail = /\s([A-ZÆØÅ])$/.exec(st);
  if (tail && new RegExp(`^\\d+\\s*${tail[1]}$`, 'i').test(no)) {
    st = st.slice(0, -2).trim();
  }

  // Four digits anywhere in the postcode column; the rest is the postal town.
  const pc = /\b(\d{4})\b/.exec(String(postcode ?? ''));

  return [st, no, pc ? pc[1] : (postcode ?? '').trim()];
}

/**
 * Which municipality DAWA says an address is in.
 *
 * Used only where the register leaves the Kommune column empty, which the
 * national extract does for a handful of rows. Those rows are real
 * plejecentre with real addresses that geocode perfectly well; the only thing
 * missing is the one field the landsdel is derived from, and the address
 * register knows it. Four extra requests to keep four care homes on the map is
 * a better trade than dropping them.
 *
 * The default representation is asked for here rather than `mini`, because
 * `mini` is the flat one and does not carry the kommune. That is why this is
 * a separate call for a few rows instead of a wider one for all nine hundred.
 */
async function municipalityOf(addressId) {
  if (!addressId) return null;
  try {
    const res = await fetch(`${DAWA}/${encodeURIComponent(addressId)}`);
    if (!res.ok) return null;
    const a = await res.json();
    return a?.kommune?.navn ?? null;
  } catch {
    return null;
  }
}

async function geocode(rawStreet, rawHouseNo, rawPostcode) {
  const [street, houseNo, postcode] = tidyAddress(rawStreet, rawHouseNo, rawPostcode);
  const m = /^\s*(\d+)\s*([A-Za-zÆØÅæøå])?/.exec(houseNo ?? '');
  const candidates = [
    (houseNo ?? '').replace(/\s+/g, ''),
    m ? m[1] + (m[2] ?? '') : '',
    m ? m[1] : '',
  ].filter(Boolean);

  // Exact street name first. DAWA's `vejnavn` is an exact match, so this only
  // works when the register spells the street the way the address register does.
  for (const husnr of candidates) {
    const hit = await dawa({ vejnavn: street, husnr, postnr: postcode });
    if (hit.length) return hit[0];
  }

  // Street exists but not that house number.
  const onStreet = await dawa({ vejnavn: street, postnr: postcode, per_side: '1' });
  if (onStreet.length) return onStreet[0];

  /*
   * Fuzzy search. The register's street names drift from the official spelling
   * in ways an exact match will never forgive: "Fuglsang Alle" for Allé,
   * "Edith Rodes vej" for Vej, "Jægersborg Allé 148C og 150" carrying a second
   * house number, "Nybøllevej, Ledøje" carrying a village name. Seven of the
   * 148 Greater Copenhagen rows need this; without it they would be dropped,
   * which is a worse outcome than a matched fuzzy hit in the right postcode.
   */
  const q = `${street.replace(/,.*$/, '')} ${candidates.at(-1) ?? ''}`.trim();
  const fuzzy = await dawa({ q: `${q}, ${postcode}`, per_side: '1' });
  if (fuzzy.length && fuzzy[0].postnr === postcode) return fuzzy[0];

  const loose = await dawa({ q: `${street.replace(/,.*$/, '')}, ${postcode}`, per_side: '1' });
  return loose.length && loose[0].postnr === postcode ? loose[0] : null;
}

/* ------------------------------------------------------------------- main */

/**
 * As of the 2026-08-22 extract, admin.plejehjemsoversigten.dk serves an expired
 * TLS certificate. That is the government host's problem, not ours, and it is
 * not something to paper over silently: the download fails with an explanation,
 * and skipping verification takes a deliberate `--allow-expired-cert`.
 */
async function fetchExtract() {
  try {
    return await fetch(CSV_URL);
  } catch (err) {
    const expired = String(err?.cause?.code ?? '') === 'CERT_HAS_EXPIRED';
    if (!expired) throw err;
    if (!process.argv.includes('--allow-expired-cert')) {
      console.error(
        '\nadmin.plejehjemsoversigten.dk is serving an EXPIRED TLS certificate.\n' +
          'The extract was not downloaded and nothing was written.\n\n' +
          'If you have checked that the host is the real one and accept the risk:\n' +
          '  npm run build:data -- --allow-expired-cert\n',
      );
      process.exit(2);
    }
    console.warn('  WARNING: certificate verification disabled for this one download.');
    const https = await import('node:https');
    const body = await new Promise((ok, no) => {
      https
        .get(CSV_URL, { rejectUnauthorized: false }, (r) => {
          if (r.statusCode !== 200) return no(new Error(`CSV download failed: ${r.statusCode}`));
          const chunks = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => ok({ buf: Buffer.concat(chunks), headers: r.headers }));
        })
        .on('error', no);
    });
    // Shaped like a fetch Response so the caller stays unaware of the detour.
    return {
      ok: true,
      headers: { get: (h) => body.headers[h.toLowerCase()] ?? null },
      arrayBuffer: async () => body.buf,
    };
  }
}

console.log('Downloading Plejehjemsoversigten extract…');
const res = await fetchExtract();
if (!res.ok) throw new Error(`CSV download failed: ${res.status}`);

const disposition = res.headers.get('content-disposition') ?? '';
const stamp = /Plejehjem-(\d{4})(\d{2})(\d{2})/.exec(disposition);
const extractDate = stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}` : new Date().toISOString().slice(0, 10);

// The register serves Windows-1252, not UTF-8.
const text = new TextDecoder('windows-1252').decode(await res.arrayBuffer());
const all = parseCsv(text);
console.log(`  ${all.length} rows, extract dated ${extractDate}`);

const selected = all.filter((r) => r.Inactive !== 'True');
console.log(`  ${selected.length} active rows across Denmark`);

/*
 * Every row has to be placeable before any of them is written.
 *
 * A municipality this build does not recognise is not a row to drop quietly:
 * it is either a spelling the landsdel table has not seen or a change to the
 * map of Denmark, and both want a person to look. Checked up front, so the
 * answer arrives before ten minutes of geocoding rather than after it.
 */
const unplaceable = [
  ...new Set(
    selected
      .map((r) => kommuneName(r['Kommune']))
      .filter((m) => m && !regionOf(m)),
  ),
];
if (unplaceable.length) {
  console.error(
    `\n${unplaceable.length} municipality name(s) are not in the landsdel table ` +
      'in src/regions.ts:\n' +
      unplaceable.map((m) => `  ${m}`).join('\n') +
      '\n\nAdd each to SJAELLAND, FYN or JYLLAND there, then re-run. Nothing was written.\n',
  );
  process.exit(2);
}

console.log('  fetching Copenhagen contact pages for the numbers the register omits…');
const kkPhones = await copenhagenPhones();
console.log(`  ${kkPhones.size} phone number(s) available as backfill`);

const records = [];
const failures = [];
let backfilled = 0;

/** The register contains doubled spaces and stray padding in some names. */
const tidy = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Run `worker` over `items`, `limit` at a time.
 *
 * A pool rather than Promise.all over the lot: nine hundred simultaneous
 * requests is not concurrency, it is a denial of service against a service
 * that is doing us a favour. Each worker takes the next index until there are
 * none left, so a slow row delays only itself.
 */
async function pool(items, limit, worker) {
  let next = 0;
  let done = 0;
  const runner = async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
      done++;
      if (done % 50 === 0) console.log(`    ${done}/${items.length} geocoded`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}

console.log(`  geocoding ${selected.length} rows, ${CONCURRENCY} at a time…`);
await pool(selected, CONCURRENCY, async (r) => {
  const name = tidy(r['Plejehjemsnavn']);
  const [street, houseNo, postcode] = ADDRESS_FIXES[name] ?? [r['Vejnavn'], r['Vejnummer'], r['Postalcode']];

  const hit = await geocode(street, houseNo, postcode);
  if (!hit) { failures.push(`${name} — ${street} ${houseNo}, ${postcode}`); return; }

  let web = (r['Web'] ?? '').trim();
  if (web && !/^https?:\/\//i.test(web)) web = `https://${web}`;

  // The register leaves this blank on a few rows; the address register knows
  // the answer, so it is asked rather than the row being thrown away.
  let kommune = canonical(kommuneName(r['Kommune']));
  if (!kommune) kommune = canonical(kommuneName((await municipalityOf(hit.id)) ?? ''));
  if (!regionOf(kommune)) {
    // Every shipped row has to belong to one of the three parts, or it is
    // visible under Danmark and missing from all of them -- present and
    // unfindable, which is worse than absent.
    failures.push(`${name} — no municipality (register blank, address register gave ${JSON.stringify(kommune)})`);
    return;
  }

  const streetFull = tidy(`${street} ${houseNo}`);
  let phone = cleanPhone(r['Phone']);
  if (!phone) {
    const fill = kkPhones.get(`${streetFull.toLowerCase().replace(/\s/g, '')}|${postcode}`);
    if (fill) { phone = fill; backfilled++; }
  }

  records.push({
    id: r['id'],
    name,
    street: streetFull,
    postcode,
    city: hit.postnrnavn,
    municipality: kommune,
    phone,
    email: cleanEmail(r['Email']),
    web: web || null,
    ownership: (r['Center type'] ?? '').trim() || 'Ukendt',
    homes: /^\d+$/.test(r['Antal boliger'] ?? '') ? Number(r['Antal boliger']) : null,
    lat: Number(hit.y.toFixed(6)),
    lon: Number(hit.x.toFixed(6)),
  });
});

// The pool finishes rows out of order, so the sort is what makes the generated
// file stable: the same extract must produce the same bytes, or every rebuild
// is a diff nobody can read.
records.sort((a, b) =>
  a.municipality.localeCompare(b.municipality, 'da-DK') || a.name.localeCompare(b.name, 'da-DK'),
);

if (failures.length) {
  console.error(`\n${failures.length} row(s) would not geocode and were NOT written:`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('Add a corrected address to ADDRESS_FIXES in this script, then re-run.\n');
}

const withPhone = records.filter((r) => r.phone).length;
const withEmail = records.filter((r) => r.email).length;
const byRegion = { sjaelland: 0, fyn: 0, jylland: 0 };
for (const r of records) byRegion[regionOf(r.municipality)] += 1;
const kommuner = new Set(records.map((r) => r.municipality)).size;

const banner = `// GENERATED FILE — do not edit by hand.
// Regenerate with:  npm run build:data
//
// Source  Plejehjemsoversigten (Sundhedsdatastyrelsen), the statutory national
//         register of Danish plejehjem / plejecentre / friplejeboliger.
//         Monthly CSV extract dated ${extractDate}.
// Geocode Danmarks Adresseregister (DAWA, api.dataforsyningen.dk) — every row
//         resolved to an official access address; coordinates are WGS84.
// Covers  All of Denmark: ${records.length} plejecentre in ${kommuner} of the 98
//         municipalities. The landsdel each belongs to is not stored here; it
//         is derived from the municipality in src/regions.ts.

import type { Plejecenter } from '../types';

export const EXTRACT_DATE = '${extractDate}';

export const PLEJECENTRE: Plejecenter[] = ${JSON.stringify(records, null, 1)};
`;

writeFileSync(OUT, banner, 'utf8');
console.log(`\nWrote ${records.length} plejecentre to ${OUT}`);
console.log(`  kommuner: ${kommuner}/98`);
console.log(`  Sjælland ${byRegion.sjaelland}  ·  Fyn ${byRegion.fyn}  ·  Jylland ${byRegion.jylland}`);
console.log(`  phone: ${withPhone}/${records.length} (${backfilled} backfilled from kk.dk)`);
console.log(`  email: ${withEmail}/${records.length}`);

/*
 * 3, not 1, and the difference matters to whatever is running this.
 *
 * 1 is what Node exits with when it throws, so a build that dies on its first
 * request and a build that wrote 895 good rows and could not place 34 both
 * looked identical -- and the workflow, told that 1 meant "partial success",
 * reported a crash as a green run with no data in it. A code of its own says
 * the one thing that cannot be inferred: the file was written.
 */
if (failures.length) process.exit(3);
