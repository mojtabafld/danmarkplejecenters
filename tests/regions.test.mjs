#!/usr/bin/env node
/**
 * The landsdel table, checked against the data it has to classify.
 *
 * The interface offers three parts of the country and derives which one a
 * plejecenter is in from its municipality. That derivation is the whole
 * mechanism, and it fails silently: a municipality the table does not know
 * returns null, and a place with a null landsdel simply is not in Sjælland, Fyn
 * or Jylland -- it stays visible under Danmark and vanishes from all three
 * parts, with nothing on screen to say why.
 *
 * Nothing in a type checker or a build catches that. It is a fact about a
 * generated data file meeting a hand-written list, so it is checked here, on
 * every push, against whatever extract is actually shipped.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { canonicalNames, readRegions, regionLookup, fold } from '../scripts/landsdele.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../src/data/plejecentre.ts');

let failed = 0;
let passed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ''}`);
  }
}

/** The generated module is TypeScript, but its payload is plain JSON. */
function shippedPlaces() {
  const src = readFileSync(DATA, 'utf8');
  const start = src.indexOf('= [', src.indexOf('PLEJECENTRE')) + 2;
  return JSON.parse(src.slice(start, src.lastIndexOf(']') + 1));
}

console.log('\nthe landsdel table');

const groups = readRegions(); // throws unless it parses to exactly 98
const all = Object.values(groups).flat();
check('names all 98 Danish municipalities', all.length === 98, `got ${all.length}`);

const folded = all.map(fold);
const duplicated = [...new Set(folded.filter((n, i) => folded.indexOf(n) !== i))];
check(
  'files each municipality under exactly one part',
  duplicated.length === 0,
  duplicated.length ? `in two parts at once: ${duplicated.join(', ')}` : '',
);

const regionOf = regionLookup();
const canonical = canonicalNames();

// The three spellings the source register is known to vary on. Each is a real
// failure this lookup has to absorb, not a hypothetical.
check('reads the genitive the register writes', regionOf('Københavns') === 'sjaelland');
check('reads the plain form too', regionOf('København') === 'sjaelland');
check('reads it with the word Kommune attached', regionOf('Odense Kommune') === 'fyn');
// Bornholm is a regionskommune -- a municipality and a region at once -- so the
// register writes a word that a plain " Kommune" trim does not touch. The first
// national build stopped on exactly this row.
check(
  'reads Bornholm, which is a Regionskommune rather than a Kommune',
  regionOf('Bornholms Regionskommune') === 'sjaelland',
);
check('treats aa and å as the same letter', regionOf('Århus') === regionOf('Aarhus'));
check('and does not strip a final s that belongs to the name', regionOf('Assens') === 'fyn');
check('answers null for a name that is not a municipality', regionOf('Atlantis') === null);

// The three islands whose landsdel their coordinates would not predict.
check('puts Bornholm with Sjælland', regionOf('Bornholm') === 'sjaelland');
check('puts Samsø with Jylland', regionOf('Samsø') === 'jylland');
check('puts Ærø with Fyn', regionOf('Ærø') === 'fyn');
// The pair either side of the Little Belt, which is why this is not done by
// longitude: Middelfart is west of Fredericia and on the other landmass.
check('puts Middelfart on Fyn', regionOf('Middelfart') === 'fyn');
check('and Fredericia on Jylland', regionOf('Fredericia') === 'jylland');

console.log('\nthe shipped extract');

const places = shippedPlaces();
check('has plejecentre in it', places.length > 0, `${places.length} rows`);

const municipalities = [...new Set(places.map((p) => p.municipality))];
const unplaceable = municipalities.filter((m) => !regionOf(m));
check(
  'every municipality in it resolves to a part of the country',
  unplaceable.length === 0,
  unplaceable.length
    // Quoted, because the name that broke this was the empty string and an
    // unquoted list of it printed as nothing at all.
    ? `not in the table in src/regions.ts: ${unplaceable.map((m) => JSON.stringify(m)).join(', ')}\n` +
      '         Add each to SJAELLAND, FYN or JYLLAND there.'
    : '',
);

// Denmark has 98 municipalities, so more than 98 distinct names in the data
// means the register spelled one of them two ways and the kommune list would
// offer the same place twice. The first national build produced exactly that:
// 99 of 98.
check(
  'holds no more municipality names than Denmark has municipalities',
  municipalities.length <= 98,
  `${municipalities.length} distinct names`,
);
check(
  'and each is spelled the way the landsdel table spells it',
  municipalities.every((m) => canonical(m) === m),
  municipalities.filter((m) => canonical(m) !== m).map((m) => `${m} -> ${canonical(m)}`).join(', '),
);

const counts = { sjaelland: 0, fyn: 0, jylland: 0 };
for (const p of places) {
  const r = regionOf(p.municipality);
  if (r) counts[r] += 1;
}
const summed = counts.sjaelland + counts.fyn + counts.jylland;
check(
  'the three parts account for every place',
  summed === places.length,
  `${summed} of ${places.length} classified`,
);

// Not an assertion about which parts have data -- the extract may cover the
// whole country or one corner of it -- but the split is worth printing, because
// it is the number the picker shows and the quickest way to see what shipped.
console.log(
  `\n  ${places.length} places in ${municipalities.length} municipalities · ` +
    `Sjælland ${counts.sjaelland} · Fyn ${counts.fyn} · Jylland ${counts.jylland}`,
);

console.log(`\n${passed}/${passed + failed} landsdel checks pass`);
process.exit(failed ? 1 : 0);
