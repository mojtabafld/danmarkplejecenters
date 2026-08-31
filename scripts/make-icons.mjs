/*
 * Home-screen icons, rendered from the same mark the masthead wears.
 *
 *   node scripts/make-icons.mjs
 *
 * Run it again whenever the brand colour or the pin changes; the PNGs are
 * committed, so a deploy never depends on this script or on a browser.
 *
 * Deliberately full-bleed with no rounding of our own. Both platforms mask the
 * icon themselves -- iOS to its squircle, Android to whatever the launcher
 * uses -- and an icon that arrives pre-rounded gets rounded twice, which is
 * the corner-inside-a-corner look that marks an amateur PWA. The pin sits at
 * 44% of the canvas, inside the 80% circle Android's maskable spec keeps free.
 *
 * The two colours below are the only place in the project where the brand
 * appears as a literal: a PNG cannot read a CSS custom property. They are
 * --p-brand-700 and --p-neutral-0 from src/styles/tokens.css. Change them
 * there first, then here, then re-run.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = '#006D63';
const ON_BRAND = '#FFFFFF';

/** The lucide "map-pin", the same path src/icons.ts draws in the masthead. */
const PIN = '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>';

const page = (size) => `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; }
  body { width: ${size}px; height: ${size}px; background: ${BRAND};
         display: grid; place-items: center; }
  svg { width: ${Math.round(size * 0.44)}px; height: ${Math.round(size * 0.44)}px; }
</style>
<svg viewBox="0 0 24 24" fill="none" stroke="${ON_BRAND}" stroke-width="1.75"
     stroke-linecap="round" stroke-linejoin="round">${PIN}</svg>`;

const OUT = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
];

const browser = await chromium.launch({ channel: 'chrome' });
mkdirSync(join(ROOT, 'public'), { recursive: true });
for (const [file, size] of OUT) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(page(size), { waitUntil: 'load' });
  writeFileSync(join(ROOT, file), await p.screenshot({ omitBackground: false }));
  await ctx.close();
  console.log(`wrote ${file} (${size}x${size})`);
}
await browser.close();
