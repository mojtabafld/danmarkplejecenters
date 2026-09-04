/**
 * The municipality-to-landsdel table, read out of src/regions.ts.
 *
 * Parsed rather than duplicated. The table is a list of 98 facts, and two
 * copies of it is two things to keep in step -- the copy that would drift is
 * always the one nobody looks at, and the failure it causes is a plejecentre
 * quietly filed under the wrong part of the country. The TypeScript module is
 * where the application reads it, so that module is the source and this reads
 * from it.
 *
 * The parse is deliberately narrow: three named arrays of quoted strings. If
 * the shape of that file changes, this throws rather than returning a short
 * list, because a half-read table would classify some rows and silently fail
 * to classify the rest.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '../src/regions.ts');

/** Must match `fold()` in src/regions.ts, for the reasons documented there. */
export function fold(name) {
  return String(name)
    .replace(/\s+(?:Regions)?kommune\s*$/i, '')
    .trim()
    .toLowerCase()
    .replace(/å/g, 'aa')
    .replace(/\s+/g, ' ');
}

function arrayOf(src, name) {
  const open = src.indexOf(`const ${name} = [`);
  if (open === -1) throw new Error(`src/regions.ts: no array named ${name}`);
  const close = src.indexOf('];', open);
  if (close === -1) throw new Error(`src/regions.ts: ${name} is not closed`);
  const names = [...src.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (names.length === 0) throw new Error(`src/regions.ts: ${name} parsed as empty`);
  return names;
}

/** `{ region: [municipality, ...] }` for the three landsdele. */
export function readRegions() {
  const src = readFileSync(SOURCE, 'utf8');
  const groups = {
    sjaelland: arrayOf(src, 'SJAELLAND'),
    fyn: arrayOf(src, 'FYN'),
    jylland: arrayOf(src, 'JYLLAND'),
  };

  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
  // Denmark has had exactly 98 municipalities since the 2007 reform. A table
  // that is not 98 long is a table with a mistake in it, and the mistake is
  // worth finding here rather than as a missing region in the interface.
  if (total !== 98) {
    throw new Error(`src/regions.ts lists ${total} municipalities; Denmark has 98`);
  }
  return groups;
}

/**
 * The spelling this project stores, for a name the register may spell its own
 * way.
 *
 * The register writes a municipality more than one way -- Aarhus and Århus,
 * a genitive here and a plain form there, "Bornholms Regionskommune" for the
 * one that is not a kommune at all. Left alone those are separate strings, and
 * the first national build proved it: 99 municipalities in a country that has
 * 98, which in the interface is one kommune appearing twice in the list.
 *
 * The landsdel table already holds one canonical spelling of each, so that is
 * the one written down. Unknown names come back unchanged; the build refuses
 * them separately.
 */
export function canonicalNames() {
  const byKey = new Map();
  const names = Object.values(readRegions()).flat();

  // The genitive both ways, so "København" and "Københavns" reach the same
  // canonical spelling. Variants go in first and never overwrite an exact
  // name: if some future pair of municipalities collides on a variant, the
  // real name must win rather than be renamed into its neighbour.
  for (const n of names) {
    const k = fold(n);
    for (const variant of [k.replace(/s$/, ''), `${k}s`]) {
      if (!byKey.has(variant)) byKey.set(variant, n);
    }
  }
  for (const n of names) byKey.set(fold(n), n);

  return (municipality) => byKey.get(fold(municipality)) ?? municipality;
}

/** A lookup with the same forgiveness as the one in src/regions.ts. */
export function regionLookup() {
  const byName = new Map();
  for (const [region, names] of Object.entries(readRegions())) {
    for (const n of names) byName.set(fold(n), region);
  }
  return (municipality) => {
    const key = fold(municipality);
    return byName.get(key) ?? byName.get(key.replace(/s$/, '')) ?? byName.get(`${key}s`) ?? null;
  };
}
