/**
 * The two map applications an address can be handed to, and their marks.
 *
 * These live here rather than in icons.ts because that set has one rule --
 * lucide strokes drawn in `currentColor` -- and these are the opposite: flat
 * colour, no stroke, and the colours are the whole point. A monochrome outline
 * of a pin would be a worse answer to "which app is this" than a word.
 *
 * ONE THING TO BE CLEAR ABOUT. These are drawings of mine, evocative of each
 * service, not the applications' own icons. Those are trademarked artwork and
 * are not something to reproduce from memory: an approximation passed off as
 * the real mark is both wrong and a claim nobody here is entitled to make. If
 * the official assets are wanted, they come from Apple's and Google's brand
 * resources under their terms, and they drop into `mark` below without
 * anything else changing.
 *
 * The name is always next to the mark for the same reason -- so the control
 * says what it is in words, not only in a picture somebody has to recognise.
 */
import { appleMapsHref, googleMapsHref } from './format';
import type { TranslationKey } from './i18n';
import type { Plejecenter } from './types';

const SVG = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" aria-hidden="true" focusable="false"';

/**
 * Apple's is a map: paper, a park, water, a road across it, and the blue
 * arrow that means "you, here".
 */
const APPLE = `<svg ${SVG}>
  <rect width="40" height="40" rx="9" fill="#F3F1EC"/>
  <path d="M0 9a9 9 0 0 1 9-9h10L4 22V9Z" fill="#B9E0A5"/>
  <path d="M40 31a9 9 0 0 1-9 9H18l22-22v13Z" fill="#9AD2F2"/>
  <path d="M2 27C10 22 14 18 17 11c3-7 9-9 15-9" stroke="#FFFFFF" stroke-width="5"
        fill="none" stroke-linecap="round"/>
  <path d="M2 27C10 22 14 18 17 11c3-7 9-9 15-9" stroke="#E8A33D" stroke-width="2"
        fill="none" stroke-linecap="round"/>
  <path d="M27 20.5 12.5 26l6.2 2.3L21 34.5l6-14Z" fill="#1877F2"/>
</svg>`;

/**
 * Google's is the pin, over the four colours the roads are drawn in on their
 * map.
 */
const GOOGLE = `<svg ${SVG}>
  <rect width="40" height="40" rx="9" fill="#FFFFFF"/>
  <path d="M0 26h40v5a9 9 0 0 1-9 9H9a9 9 0 0 1-9-9v-5Z" fill="#4285F4"/>
  <path d="M0 9a9 9 0 0 1 9-9h7L0 20V9Z" fill="#34A853"/>
  <path d="M31 0h-9L0 24v2h6L31 0Z" fill="#FBBC04"/>
  <path d="M25 6.5c4.7 0 8.5 3.8 8.5 8.5 0 6.4-8.5 16-8.5 16S16.5 21.4 16.5 15c0-4.7 3.8-8.5 8.5-8.5Z"
        fill="#EA4335"/>
  <circle cx="25" cy="15" r="3.2" fill="#FFFFFF"/>
</svg>`;

export interface MapApp {
  /** Which one, for the data attribute and the test that counts them. */
  readonly id: 'apple' | 'google';
  /** The name, as a translation key -- it is a proper noun in every language. */
  readonly label: TranslationKey;
  readonly mark: string;
  href(p: Plejecenter): string;
}

/**
 * Apple first, because the audience is on a phone and more of those phones
 * open an address in the map that came with them.
 */
export const MAP_APPS: readonly MapApp[] = [
  { id: 'apple', label: 'panel.apple', mark: APPLE, href: appleMapsHref },
  { id: 'google', label: 'panel.google', mark: GOOGLE, href: googleMapsHref },
];
