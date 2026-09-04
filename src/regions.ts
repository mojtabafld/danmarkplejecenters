/**
 * Denmark in three parts: Sjælland, Fyn and Jylland.
 *
 * The country has no official three-way division, but it has an obvious one --
 * the three landmasses everybody names when they say where they live, and the
 * three a job seeker actually chooses between, because moving between them
 * means a bridge and an hour. So the split here is by landsdel, not by the five
 * administrative regions: Region Syddanmark straddles the Little Belt and would
 * put Odense and Esbjerg in the same bucket, which is not how anyone thinks
 * about a commute.
 *
 * Assignment is by municipality rather than by coordinate, and that is a
 * deliberate choice rather than a shortcut. The Little Belt at Middelfart is
 * eight hundred metres wide: Fredericia sits at longitude 9.75 on Jylland and
 * Middelfart at 9.73 on Fyn, so any longitude threshold puts one of them in the
 * wrong part of the country. A municipality belongs to a landsdel as a fact,
 * not as an estimate.
 *
 * Three islands need saying out loud, because each is in a bucket its
 * coordinates alone would not predict:
 *
 *   Bornholms  is 150km east of Sjælland in the Baltic, and belongs to Region
 *              Hovedstaden. It counts as Sjælland here.
 *   Samsø      sits in the Kattegat between the two, and belongs to Region
 *              Midtjylland. It counts as Jylland.
 *   Ærø, Langeland, Tåsinge and Fanø follow their own regions: the first three
 *              to Fyn, Fanø to Jylland.
 *
 * None of this is written into the data file. The landsdel is derived from the
 * municipality every row already carries, so the map below is the single place
 * the question is answered and the generated data never has to be regenerated
 * to correct it.
 */
import { PLEJECENTRE } from './data/plejecentre';
import type { Plejecenter } from './types';

export type Region = 'sjaelland' | 'fyn' | 'jylland';

/** The order they are offered in: east to west, as a Dane would list them. */
export const REGIONS: readonly Region[] = ['sjaelland', 'fyn', 'jylland'] as const;

/**
 * All 98 municipalities, by landsdel.
 *
 * Written out in full rather than derived from a rule, because there is no
 * rule -- this is a list of facts about where places are. Spelled as the
 * address register spells them, without the trailing " Kommune"; the lookup
 * below forgives the variants the source register actually produces.
 */
const SJAELLAND = [
  // Region Hovedstaden, which includes Bornholm.
  'Albertslund', 'Allerød', 'Ballerup', 'Bornholms', 'Brøndby', 'Dragør',
  'Egedal', 'Fredensborg', 'Frederiksberg', 'Frederikssund', 'Furesø',
  'Gentofte', 'Gladsaxe', 'Glostrup', 'Gribskov', 'Halsnæs', 'Helsingør',
  'Herlev', 'Hillerød', 'Hvidovre', 'Høje-Taastrup', 'Hørsholm', 'Ishøj',
  'Københavns', 'Lyngby-Taarbæk', 'Rudersdal', 'Rødovre', 'Tårnby', 'Vallensbæk',
  // Region Sjælland, which includes Lolland, Falster and Møn.
  'Faxe', 'Greve', 'Guldborgsund', 'Holbæk', 'Kalundborg', 'Køge', 'Lejre',
  'Lolland', 'Næstved', 'Odsherred', 'Ringsted', 'Roskilde', 'Slagelse',
  'Solrød', 'Sorø', 'Stevns', 'Vordingborg',
];

const FYN = [
  'Assens', 'Faaborg-Midtfyn', 'Kerteminde', 'Langeland', 'Middelfart',
  'Nordfyns', 'Nyborg', 'Odense', 'Svendborg', 'Ærø',
];

const JYLLAND = [
  // Region Nordjylland.
  'Brønderslev', 'Frederikshavn', 'Hjørring', 'Jammerbugt', 'Læsø',
  'Mariagerfjord', 'Morsø', 'Rebild', 'Thisted', 'Vesthimmerlands', 'Aalborg',
  // Region Midtjylland, which includes Samsø.
  'Favrskov', 'Hedensted', 'Herning', 'Holstebro', 'Horsens', 'Ikast-Brande',
  'Lemvig', 'Norddjurs', 'Odder', 'Randers', 'Ringkøbing-Skjern', 'Samsø',
  'Silkeborg', 'Skanderborg', 'Skive', 'Struer', 'Syddjurs', 'Viborg', 'Aarhus',
  // The Jutland half of Region Syddanmark, which includes Fanø and Als.
  'Billund', 'Esbjerg', 'Fanø', 'Fredericia', 'Haderslev', 'Kolding',
  'Sønderborg', 'Tønder', 'Varde', 'Vejen', 'Vejle', 'Aabenraa',
];

/**
 * Fold a municipality name to something the register and the address register
 * can both be matched against.
 *
 * Three differences show up between sources, and all three are spelling rather
 * than meaning:
 *
 *   " Kommune"  the register appends it on some rows and not others -- and for
 *                Bornholm the word is "Regionskommune", because Bornholm is not
 *                a municipality inside a region, it is both at once. That one
 *                name is why this is a pattern rather than a string: stripping
 *                " Kommune" leaves "Bornholms Regionskommune" untouched, which
 *                is exactly the row the national extract stopped on.
 *   å versus aa  both spellings are in use for the same place, officially --
 *                Aarhus and Århus, Tårnby and Taarnby, Faaborg and Fåborg.
 *                Folding å to aa makes the pair one key.
 *   a trailing s  the register writes the genitive on some names: "Københavns",
 *                "Nordfyns", "Vesthimmerlands", "Bornholms". Handled by the
 *                lookup trying both forms rather than by guessing here, since
 *                stripping an s unconditionally would break "Assens".
 */
function fold(name: string): string {
  return name
    .replace(/\s+(?:Regions)?kommune\s*$/i, '')
    .trim()
    .toLowerCase()
    .replace(/å/g, 'aa')
    .replace(/\s+/g, ' ');
}

const BY_MUNICIPALITY = new Map<string, Region>();
for (const [region, names] of [
  ['sjaelland', SJAELLAND],
  ['fyn', FYN],
  ['jylland', JYLLAND],
] as const) {
  for (const name of names) BY_MUNICIPALITY.set(fold(name), region);
}

/**
 * Which part of the country a municipality is in, or null if the name is not
 * one of the 98.
 *
 * Null rather than a guess: a place whose municipality cannot be recognised is
 * a data problem to be fixed at the source, and silently filing it under
 * Jylland because it happens to be west of somewhere would hide that. The
 * build script refuses to write a row it cannot classify, and a test asserts
 * that every municipality in the shipped data resolves here, so null should
 * never reach a reader.
 */
export function regionOfMunicipality(municipality: string): Region | null {
  const key = fold(municipality);
  return (
    BY_MUNICIPALITY.get(key) ??
    // The genitive: "Københavns" for København, "Nordfyns" for Nordfyn. Tried
    // in both directions so the map can hold either spelling.
    BY_MUNICIPALITY.get(key.replace(/s$/, '')) ??
    BY_MUNICIPALITY.get(`${key}s`) ??
    null
  );
}

export function regionOf(p: Plejecenter): Region | null {
  return regionOfMunicipality(p.municipality);
}

/* ------------------------------------------------------------- geography -- */

/** South-west corner, then north-east: the order MapLibre's fitBounds wants. */
export type Box = [[number, number], [number, number]];

/**
 * Where each part of the country is, for the case where we have no places to
 * frame instead.
 *
 * These are a fallback and nothing else. When a part has plejecentre in it the
 * camera is fitted to those, which is both tighter and self-correcting; this is
 * what "show me Fyn" means while the data covers only Sjælland, so that
 * choosing an empty part still lands somewhere recognisable rather than on the
 * whole of Europe.
 *
 * Corners are the extremes of each landmass with a little air: Skagen at 57.74
 * and Gedser at 54.56 north to south, Blåvandshuk at 8.08 and Christiansø at
 * 15.19 west to east.
 */
export const REGION_BOX: Record<Region, Box> = {
  // Zealand, Lolland-Falster, Møn and Bornholm. Wide, because Bornholm is a
  // long way out; the data-derived fit is what is normally used.
  sjaelland: [
    [10.85, 54.5],
    [15.2, 56.25],
  ],
  // Fyn with Langeland, Tåsinge and Ærø.
  fyn: [
    [9.6, 54.7],
    [11.05, 55.65],
  ],
  // The peninsula with Als, Fanø, Samsø, Mors and Læsø.
  jylland: [
    [8.05, 54.75],
    [11.2, 57.8],
  ],
};

/** The whole country, used the same way and for the same reason. */
export const DENMARK_BOX: Box = [
  [8.05, 54.5],
  [15.2, 57.8],
];

/**
 * The extent of a set of places, or null when there are none to measure.
 *
 * A single place has no extent, so it gets a small box around it rather than a
 * degenerate one: fitting a zero-area bounds asks the map for infinite zoom.
 */
export function boxOf(items: readonly Plejecenter[]): Box | null {
  if (items.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of items) {
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
  }
  const pad = 0.02;
  return [
    [west - pad, south - pad],
    [east + pad, north + pad],
  ];
}

/**
 * How many plejecentre are in each part, counted once at load.
 *
 * The picker shows these beside the names. A part with nothing in it is worth
 * saying out loud rather than leaving to be discovered by selecting it and
 * finding an empty map -- especially while the shipped extract covers only
 * Greater Copenhagen, where two of the three are genuinely empty.
 */
export const REGION_COUNT: Record<Region, number> = { sjaelland: 0, fyn: 0, jylland: 0 };

/** Everything, which is what "Danmark" counts. */
export const TOTAL_COUNT = PLEJECENTRE.length;

for (const p of PLEJECENTRE) {
  const r = regionOfMunicipality(p.municipality);
  if (r) REGION_COUNT[r] += 1;
}

/**
 * The default view: everything we actually have.
 *
 * Derived from the data rather than fixed to the country, so it is right for
 * whatever extract is shipped -- Greater Copenhagen today, the whole of Denmark
 * once the national extract is built. The country box is the fallback for an
 * empty dataset, which should never happen but must not open the map on the
 * Atlantic if it does.
 */
export const HOME_BOX: Box = boxOf(PLEJECENTRE) ?? DENMARK_BOX;
