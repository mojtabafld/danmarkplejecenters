# Plejecentre i Hovedstaden

An interactive map of every registered plejecenter, plejehjem and friplejebolig
in Greater Copenhagen. Click a dot to get the full address, the operator, the
capacity, the phone number, the official website, and a route in Google Maps or
Apple Maps. Search by name, street, postcode or town; filter by municipality and
by how the home is run. Show where you are, and see how far each home is from
there. Danish, English or Persian; light or dark; keyboard-operable, and usable
down to a 280px-wide screen.

On a phone the map leads, with the count, the search field and the municipality
picker always on screen beneath it: those are how you narrow 148 homes down, and
putting them behind a drawer would have put a step in front of the primary task.
Only the result list itself is behind "Vis liste".

The basemap is OpenStreetMap data, rendered as free vector tiles. There is no
API key anywhere in this project, and no account to sign up for.

> **Running the quality gates.** `npm run dev`, `build` and `preview` need
> nothing but this repo. The `./verify.sh` gate suite is different: the gates
> themselves live in the design-system kit this app was built against, so point
> `KIT` at a checkout of it:
> `KIT=../ux-ui-agent-skills ./verify.sh`. Without it the script says so and
> exits rather than reporting a false pass.

---

## Run it

```bash
npm install
```

```bash
npm run dev
```

That opens `http://localhost:5173`. For a production build:

```bash
npm run build && npm run preview
```

`npm run build` type-checks first, then writes `dist/` — a plain static folder
you can serve from anywhere (`dist/` is a single IIFE bundle plus one
stylesheet; no server-side anything). The map does need outbound network access
to the tile CDN; if it cannot reach it, the app says so on screen and the list,
addresses, phone numbers and route links keep working.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:data` | Re-download and re-geocode the plejecenter dataset |
| `npm run build:harness` | Regenerate the static pages the quality gates measure |
| `./verify.sh` | Run every quality gate and print one verdict |

---

## Deploy

The output is a plain static folder, so any static host serves it. The repo
ships a DigitalOcean App Platform spec at `.do/app.yaml`.

**From the App Platform UI:** create an app, pick this GitHub repo and the
`main` branch. It detects a Node static site; confirm the settings match the
spec:

| Setting | Value |
|---|---|
| Type | Static Site |
| Build command | `npm run build` |
| Output directory | `dist` |
| HTTP routes | `/` |

**From the command line**, using the spec as-is:

```bash
doctl apps create --spec .do/app.yaml
```

`deploy_on_push` is on, so every push to `main` redeploys.

Some notes that matter for this app specifically:

- **The build needs devDependencies.** `npm run build` runs `tsc --noEmit`
  before Vite, and TypeScript is a devDependency. App Platform installs them at
  build time by default; do not set `NPM_CONFIG_PRODUCTION=true`.
- **Node 20 or newer**, declared in `engines`. Vite 6 needs it.
- **HTTPS is what makes "show my location" work.** Geolocation is refused
  outside a secure context, and the app checks `isSecureContext` and says so
  rather than failing silently. App Platform terminates TLS for you, so the
  feature that cannot work on a plain-http local server does work once deployed.
- **Outbound network access to the tile CDN** is required at runtime, from the
  visitor's browser rather than from the server. If it is blocked the app says
  so on screen and the list, addresses, phone numbers and routes keep working.
- **No environment variables, no secrets, no database.** The register data is
  compiled into the bundle at build time, and the basemap needs no API key.
- **A catchall to `index.html`** is set in the spec. There is no client-side
  router, but it means a stray deep link or a refresh lands on the app rather
  than a 404.

Verified before publishing: a clean `npm ci && npm run build` from a fresh
clone, then the built `dist/` served by a plain static server and loaded in a
browser -- no console errors, no failed requests, tiles rendering, all 148
records listed, and the detail card opening with its three action buttons.

### "Deploy Error: Container Terminated"

This means the component was created as a **Web Service** rather than a Static
Site. A static site has no runtime container at all -- the platform builds it
and a CDN serves the files -- so a terminated container can only come from a
service. The build succeeds, the platform then runs the service's start
command, nothing binds to `$PORT`, and the container is killed for failing its
health check.

Either fix works.

**Preferred: make it a Static Site.** Cheaper, faster, and correct for four
static files. Apply the committed spec to the existing app:

```bash
doctl apps update <APP_ID> --spec .do/app.yaml
```

`doctl apps list` prints the id. In the UI the equivalent is to delete the
service component and add a Static Site component in its place; App Platform
does not convert one into the other.

**Or keep it as a Web Service.** `npm start` now runs `server.mjs`, a
dependency-free static file server that binds `0.0.0.0:$PORT`, serves `dist/`,
and sends any unknown path to `index.html`. Set the component's run command to
`npm start` and its HTTP port to `8080`, or use this spec:

```yaml
name: danmarkplejecenters
region: fra
services:
  - name: web
    environment_slug: node-js
    github:
      repo: mojtabafld/danmarkplejecenters
      branch: main
      deploy_on_push: true
    build_command: npm run build
    run_command: npm start
    http_port: 8080
    instance_count: 1
    instance_size_slug: apps-s-1vcpu-0.5gb
```

The server is worth having either way: `npm start` gives you the production
bundle locally, exactly as it will be served.

---

## The data

**148 plejecentre across 23 municipalities.** Every record comes from a public
authority, not from scraping a directory site.

**Source — Plejehjemsoversigten.** The statutory national register of Danish
plejehjem, plejecentre and friplejeboliger, run by Sundhedsdatastyrelsen for the
Ministry of the Interior and Health. Municipal and private operators are legally
obliged to keep their own entry current. It publishes a full CSV extract monthly;
this dataset is built from the extract dated **2026-08-22**.

**Geocoding — Danmarks Adresseregister (DAWA).** Every row is resolved against
`api.dataforsyningen.dk`, the official Danish address register, which returns the
canonical address and its WGS84 coordinates. Nothing is placed on the map on a
guessed or approximate coordinate: `scripts/build-data.mjs` reports a row it
cannot resolve and refuses to write it.

All 148 rows resolve to a distinct coordinate. Coverage of the optional fields:
**145/148 phone**, **98/148 e-mail**, **143/148 website**.

The register is only as current as the operators keep it. The app says which
extract it is showing, in the footer, and the detail panel tells people to phone
the plejecenter for waiting times and vacancies rather than trusting a map.

### Three things the register gets wrong, and what the pipeline does

**Malformed street fields.** Seven rows carry a repeated facility name, a floor
note, or an empty house number. Those seven addresses were each confirmed
against the operator's own page and are listed explicitly in `ADDRESS_FIXES` in
`scripts/build-data.mjs`, so the correction is visible rather than silently
baked into the data.

**Placeholders in the contact columns.** Phone and Email are free text, and 58
rows nationally hold the literal string `Besøg hjemmeside` ("visit website")
instead of a value — mostly Copenhagen's municipal homes, which point at
boligertilaeldre.kk.dk. Rendered naively that becomes a `tel:+45` link that
looks callable and dials nothing, which is worse than an absent field. So both
columns are validated (`cleanPhone`, `cleanEmail`) and anything that is not a
real value becomes `null` and simply does not render. The Copenhagen numbers
themselves are public on each home's own contact page, so the pipeline reads
them from there and matches them back by address — 35 of the 148 get their
number that way. That is a secondary source used only to fill a gap the primary
register leaves empty; it never overwrites a value the register does provide.

**An expired TLS certificate.** `admin.plejehjemsoversigten.dk`, which serves the
extract, presents an expired certificate. `npm run build:data` refuses the
download and explains why; skipping verification takes a deliberate
`npm run build:data -- --allow-expired-cert`, and warns when it does.

Street names also drift from the official spelling — `Fuglsang Alle` for Allé,
`Edith Rodes vej` for Vej, `Jægersborg Allé 148C og 150` carrying two house
numbers. DAWA's `vejnavn` lookup is exact, so the geocoder falls back to fuzzy
search constrained to the same postcode. Seven rows need that; without it they
would silently vanish from the map.

### Refreshing it

```bash
npm run build:data -- --allow-expired-cert
```

That re-downloads the current extract, re-geocodes every row against DAWA,
re-reads the Copenhagen contact pages, and rewrites `src/data/plejecentre.ts`
(including the extract date shown in the footer). It exits non-zero and names
the rows if anything fails to geocode, and writes nothing it could not resolve.
The `--allow-expired-cert` flag is needed for as long as the government host's
certificate stays expired; see below.

### Municipalities covered

København, Frederiksberg, Gentofte, Gladsaxe, Herlev, Rødovre, Hvidovre,
Brøndby, Glostrup, Albertslund, Ballerup, Tårnby, Dragør, Lyngby-Taarbæk,
Rudersdal, Furesø, Vallensbæk, Ishøj, Høje-Taastrup, Hørsholm, Egedal, Allerød,
Greve.

Widening or narrowing that is one edit to `MUNICIPALITIES` in
`scripts/build-data.mjs`, then `npm run build:data`.

---

## Your location

The crosshair button on the map answers "which of these is near me". It uses
`watchPosition` rather than a single fix, because the first reading indoors is
usually a coarse network estimate and the GPS refinement a few seconds later is
the one worth showing. The map flies to you once, on the first fix; later
refinements move the dot but never yank the map out from under someone who has
since panned somewhere else.

Two things are drawn. A translucent disc for the accuracy radius the device
reports, as a GeoJSON polygon so that 65 metres stays 65 metres at every zoom
rather than becoming a fixed number of pixels. And the dot itself as an HTML
marker, so its pulse is a CSS animation: three rings on one keyframe, staggered,
reading as a repeating ripple instead of one blinking circle. A WebGL circle
layer could not have that, and more to the point could not have this:

```css
@media (prefers-reduced-motion: reduce) {
  .user-dot__ring { animation: none; opacity: 0.35; transform: scale(1.9); }
}
```

The ripple stops; the marker does not. The rings settle into one static halo and
the dot stays exactly as visible. Reduced motion never costs content, and the
gate checks that it does not.

Once your position is known, the detail panel gains a distance line: "3.2 km
from you", great-circle, localised.

Geolocation is the one feature guaranteed to fail for some people, so each way
it fails is a distinct message with a way forward rather than a dead button:
permission denied, device location off, fix timed out, page served over plain
http (`isSecureContext` is checked up front, because the browser's own error for
that case is generic), browser without support, and "you are outside Greater
Copenhagen" when the fix lands far from the data. While locating, the button is
`aria-busy`, not disabled: a dimmed control reads as "you cannot do this" rather
than "this is happening".

---

## Three languages

Danish, English and Persian, chosen from the globe button beside the theme
toggle and remembered in `localStorage`.

**Persian is the default**, set in `DEFAULT_LOCALE` (`src/i18n.ts`), and
**light is the default theme**, set in `DEFAULT_THEME` (`src/theme.ts`).
Neither follows the browser or the operating system: the audience is known, and
`navigator.language` / `prefers-color-scheme` are poor proxies for it. Both are
one click away in the header and both are remembered once chosen.

Because Persian is the opening language, Vazirmatn is now fetched on a first
visit rather than never. Switching to Danish or English still costs nothing
extra: the `unicode-range` means the Latin locales never request it.

Persian is set in **Vazirmatn**, self-hosted from `src/fonts/` under the SIL
OFL. One variable file carries every weight the app uses, so it is a single
111KB request rather than four static ones, and self-hosting keeps the promise
the rest of the project makes: no CDN, no account, nobody told who is reading
the page. Its `unicode-range` is limited to Arabic script, which means a Danish
or English reader never downloads it at all: measured, zero font requests in
Danish, one in Persian.

Persian brings the whole page to `dir="rtl"`. That works because the stylesheet
was written in logical properties from the start (`inline-size`,
`inset-inline-start`, `padding-inline`, `border-inline-end`), so mirroring is a
document attribute rather than a second stylesheet. The gate confirms it:
`verify_rtl.mjs` renders every page both ways and fails on layout that only
breaks when mirrored.

What is **not** translated, deliberately:

- **Plejecenter names and street addresses stay Danish.** They are proper nouns
  and real postal addresses. A translated address cannot be posted to, searched
  for, or read out to a taxi driver. Inside the Persian UI they are held LTR
  with `unicode-bidi: plaintext`, so "Humlehusene 1A" reads correctly in an
  otherwise right-to-left column.
- **Phone numbers keep Latin digits**, because they are dialled. Counts do not:
  they go through `Intl.NumberFormat`, so Persian shows ۱۴۸ where Danish shows
  148.

Sorting follows the reader, not the data: Danish orders Æ, Ø and Å after Z,
which is not what an English or Persian reader expects of the same list, so the
collator and both sorted lists are rebuilt on every language change.

The switcher is a **disclosure**, not an ARIA menu. `role="menu"` is a contract
that promises a roving-tabindex arrow-key model, and a widget that declares it
without implementing it is worse for a screen reader than plain buttons. Three
mutually exclusive choices do not need that machinery: a button with
`aria-expanded` revealing a list of ordinary buttons is Tab-navigable by
default and operable with no JavaScript at all. Arrow keys are wired anyway, as
a convenience rather than a promise.

---

## The detail card

The card has three regions, and which region a thing lives in is the whole
design: a head that never moves, a body that scrolls, and a **pinned foot**.

The card carries the record and nothing else. The provenance note that used to
sit under the facts is gone from it: attribution belongs once, in the rail
footer, not repeated on all 148 records, and in the card it was pushing the
contact rows out of view. The "(opens in a new tab)" announcements are gone
with it, in all three languages. The external-link icon on the button remains
as the visual cue; a screen reader no longer hears the phrase.

Opening is a real entrance: fade, a short travel, and a slight scale on the
spring easing, so the card reads as arriving from where it is anchored. The
travel direction is a custom property rather than a fixed offset, because the
card is anchored to the inline start on a wide screen and to the bottom on a
phone, and it flips again in Persian. Measured: fifteen distinct opacity and
scale steps on desktop, nineteen on a phone. Under `prefers-reduced-motion` the
durations collapse to 1ms and the entrance becomes a cut, with the card and all
six rows present, so nothing is revealed by the animation alone.

The route buttons and the website button are in the foot. Routing to the place
is the most common reason the card is open at all, and while they sat at the
end of the scrolling body they were something you had to go looking for, past
the register's small print. In the foot they are on screen the moment the card
opens, at every size and in every language: measured across five device and
language combinations, `panelBody.scrollTop === 0` and all three buttons fully
inside the viewport.

On a phone the whole list sheet slides away while the card is open. It sits a
layer below the card, and the card is inset from the bottom and sides, so a
collapsed sheet framed it with a strip of unrelated chrome on three edges.
`visibility: hidden` takes it out of the tab order and the accessibility tree
too, so it is gone for a keyboard and a screen reader, not just visually.

With nothing to compete with, the card caps at `min(82dvh, 44rem)` so that all
six contact rows - address, operator, capacity, phone, e-mail, website - are
readable without scrolling. Measured against the fullest record in the
register, checking each row against the scroll container's own visible box
rather than the viewport:

| Device            | Result |
|-------------------|--------|
| iPhone SE 375x667 | all six rows visible |
| old Android 360x640 | five of six; the last needs a short scroll |
| Galaxy A 360x800  | all six rows visible |
| iPhone 14 390x844 | all six rows visible |
| Pixel 8 393x852   | all six rows visible |
| iPhone Pro Max 430x932 | all six rows visible |

Screens 667px and under needed their own step: six rows, a head and three
pinned buttons do not fit there at the normal rhythm, and the rows that fell
off the end were e-mail and website, which is exactly what the card is for.
Under `max-height: 46rem` the card takes 91dvh and the vertical rhythm tightens
by one step. The provenance note still scrolls, which is the right thing to
lose first.

The trade is real and worth stating: on a 844px phone this leaves roughly 84px
of map above the card. The fly-to lifts the marker into that strip using the
card's own measured height, so the place being described stays visible, but the
map is a sliver while the card is open.

Closing the card leaves the map exactly where it is. Closing a card is not a
request to go somewhere else, and snapping back to the whole region threw away
the position someone had just navigated to -- usually the street they were
about to look around. The reset control on the map is what returns to the
opening view, for when that is actually what is wanted.

---

## The map

**MapLibre GL JS** with **CARTO's OpenStreetMap-derived vector basemaps** —
`positron` for light, `dark-matter` for dark. Free, no key, and the reason they
beat raster OSM tiles here is that dark mode gets a genuinely dark map rather
than an inverted light one. Attribution to OpenStreetMap and CARTO is rendered
on the map, as their terms require.

- **Clustering** — 148 points over a metropolitan area overlap badly at city
  zoom. Clusters expand on click to the exact zoom that separates them.
- **Colour by operator** — municipal (teal), self-governing (ochre), private and
  friplejebolig (plum). Colour is never the only carrier: the operator is
  written out in the list row, in the legend, and in the detail panel.
- **Names appear at zoom 12.5**, once they can no longer collide.
- **The list is the keyboard path.** A WebGL canvas cannot be tabbed through, so
  every plejecenter is a real `<button>` in the result list; selecting one flies
  the map to it and vice versa.
- **Zoom and reset are ordinary app buttons**, not MapLibre's controls, so they
  inherit the theme and meet the 24px target-size floor.

---

## Design system

One token layer, in `src/styles/tokens.css`, in three tiers: primitive ->
semantic -> component. Nothing outside that file contains a raw hex, px or
duration — including the map layers, which read their colours off the live theme
through `getComputedStyle` so a theme switch repaints the dots too.

The palette is generated in OKLCH for perceptually even steps: a Nordic teal
brand (h=184) rather than the default SaaS indigo, ochre and plum for the other
two operator types, clay for errors, and cool-leaning neutrals (h=196) that sit
under the teal. Dark mode overrides the semantic tier only; the primitives never
move.

Every glyph is a [lucide](https://lucide.dev) icon inlined as SVG in
`currentColor`. There are no emoji anywhere in this project — not in the UI, the
code, the comments, or the commit messages. That is enforced, not just intended.

---

## Verification

```bash
./verify.sh
```

**33/33 gates pass** as of the last run. The suite renders the app's real
stylesheet and real markup in headless Chrome and measures:

- WCAG 2.2 AA contrast on every rendered text element, **light and dark**, from
  true alpha-composited pixels — not from hand-typed ratios
- the same contrast in **default, hover and focus** for every interactive element
- axe-core WCAG 2.2 A/AA (ARIA, labels, landmarks, roles)
- keyboard reachability and operability
- WCAG 2.5.8 target sizes
- no horizontal overflow at 280 / 320 / 414px, and again at 1.25x root font
- RTL mirroring, for the Persian UI
- reduced-motion parity: the pulse stops and nothing disappears with it
- no silently clipped text and no overlapping controls
- token-by-intent, no hardcoded values, no emoji, and the render-based
  anti-slop and type-scale signals

`verification/` holds three generated pages that the gates open over `file://`:
the app shell, the detail panel, and a states page (disabled, loading, error,
empty). They are built from `src/styles/*` and real records by
`verification/build-harness.mjs`, so what the gates measure is what ships. They
exist because the app itself is a module bundle that needs an HTTP origin and a
live tile CDN — pointing the gates straight at it would measure the network
rather than the design.

**What none of this proves is that it looks good.** No script scores taste. The
gates prove correctness; the visual judgement is a human's.

### Bugs these gates actually caught

Worth recording, because they were all invisible in a happy-path screenshot:

- `--text-tertiary` failed contrast at 3.93:1 on sunken surfaces (the footer,
  small print). Fixed at the primitive.
- The masthead overflowed by 32px at 280px, because the title block had no
  `min-inline-size: 0` and would not shrink.
- The detail panel and the mobile list sheet shared a z-index, so on a phone two
  overlays competed for the same tap.
- `<option>` elements did not inherit the theme, so the dropdown list came back
  black-on-white in dark mode.
- `type="search"` drew its own clear button on top of ours — two crosses in one
  field.
- `aria-label` on the bare `<div>` holding the location dot is prohibited ARIA;
  it is a meaningful graphic, so it needed `role="img"`.
- The language switcher declared `role="menu"` without implementing the menu
  keyboard model. Rebuilt as a disclosure.
- **A band of empty sheet under the list, which survived closing the card.**
  Two causes, both in the same measurement. The collapsed sheet's visible
  height comes from a CSS variable set by measuring three blocks, and that
  measurement ran once at startup: before the count had rendered, so it was
  short and the sheet closed across the bottom of its own button; and before
  Vazirmatn had arrived, so once the Persian text reflowed into the real font
  the blocks shrank while the stale, larger value stayed put, leaving a strip
  of blank sheet below the last control. A `ResizeObserver` on those three
  blocks plus `document.fonts.ready` now re-measures on anything that moves
  them: the count landing, the font swapping, a language change, a rotation, a
  larger text size. Reproduced and fixed against WebKit, since it only showed
  in Safari.
- **`100dvh` on the app shell.** Different engines resolve it differently, and
  when it comes up short the page background shows through beneath the app as
  another stray band. The shell is now `position: fixed; inset: 0`, which is
  exact everywhere and needs no unit arithmetic; the sheet and the card size in
  per-cent against it instead of viewport units.
- The sticky municipality heading in the list intercepted taps meant for the
  first row beneath it on short screens. Rows now carry `scroll-margin-block-start`
  so `scrollIntoView` parks them below the heading instead of under it.
- The mobile list toggle had its colours inside the `max-width: 60rem` block, so
  outside that breakpoint it fell back to a raw grey UA button under light text.
  Only `display` is a breakpoint concern; the styling moved to the base rule.

And two the gates were blind to, because both pages still passed every check
while the thing was visibly wrong:

- **The detail card grew with the window.** It was pinned top *and* bottom, so
  it was always the full height of the map; its body is a grid, and grid rows
  stretch by default, so the address block, the buttons and the note spread out
  to fill whatever height that was. On a 2560x1440 screen the card was 1360px
  tall and the buttons had gained 180px each. It is now anchored at the top,
  sized by its content, capped with `max-block-size`, and every row is
  `align-content: start`. Measured: 561px at 1440x900, 1512x982 and 2560x1440
  alike, and it still caps and scrolls on a short screen.
- **Closing the card left the list gone.** Opening a plejecenter on a phone
  collapses the list sheet so the two overlays do not fight for the same thumb,
  but closing it never put the sheet back: you tapped a home from an open list,
  closed it, and the list had vanished with no sign of where it went. The sheet
  state before the card opened is now remembered and restored.

And one the gates could not have caught, that only showed up on screen: the
detail panel rendered `Besøg hjemmeside` where the phone number should be,
because that is literally what the national register stores in the Phone column
for 58 homes. Gates prove correctness; looking at the thing catches the rest.

---

## Layout

```
src/
  main.ts                  wiring: DOM, events, render loop
  store.ts                 filter state + search index over the 148 records
  map.ts                   MapLibre: sources, layers, clustering, theme swap
  list.ts                  result list, grouped by municipality
  detail.ts                the detail panel
  theme.ts                 light/dark, persisted, follows the OS until told not to
  format.ts                Danish phone/address formatting, map deep links
  icons.ts                 the lucide subset, inline SVG
  types.ts                 the Plejecenter record
  i18n.ts                  da / en / fa strings, plurals, Intl number formatting
  geolocate.ts             watchPosition, permission states, distance
  fonts/                   Vazirmatn variable + its OFL licence, self-hosted
  data/plejecentre.ts      GENERATED - do not edit; see npm run build:data
  styles/tokens.css        the whole design system
  styles/app.css           components, built only from tokens
scripts/build-data.mjs     register download -> DAWA geocode -> data module
verification/              generated gate pages + the script that writes them
verify.sh                  the full gate suite, one verdict
```

---

## Attribution and licence

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
tiles by [CARTO](https://carto.com/attributions). Plejecenter data from
[Plejehjemsoversigten](https://plejehjemsoversigten.dk) (Sundhedsdatastyrelsen).
Addresses from [Danmarks Adresseregister](https://dawadocs.dataforsyningen.dk).
Icons from [lucide](https://lucide.dev) (ISC).
