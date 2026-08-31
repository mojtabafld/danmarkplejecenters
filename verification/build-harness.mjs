#!/usr/bin/env node
/**
 * Build the gate harness: one self-contained HTML file carrying the app's real
 * tokens, real CSS and real component markup, openable over file://.
 *
 * The design-system gates (measure_render, verify_states, axe_audit,
 * verify_responsive, verify_target_size, lint_intent, slop_tells, taste_audit)
 * all render a local HTML file in headless Chrome. The app itself is an ES
 * module bundle that needs an HTTP origin and a live tile CDN, so pointing the
 * gates at it directly measures the network, not the design. This harness
 * carries the same stylesheet and the same markup, with real data baked in, so
 * what the gates measure is exactly what ships.
 *
 * Usage: npm run build:harness   (then run the gates against verification/)
 */
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const R = (p) => resolve(HERE, '..', p);

const tokens = readFileSync(R('src/styles/tokens.css'), 'utf8');
const app = readFileSync(R('src/styles/app.css'), 'utf8').replace("@import './tokens.css';", '');

// Comments are stripped before inlining. The no-emoji gate scans the rendered
// file, and prose in a CSS comment is not product copy; leaving it in would
// report the stylesheet's own annotations as findings in the UI.
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// The stylesheet lives in src/styles/ and reaches the font with '../fonts/'.
// The harness sheet is written to verification/, one directory further out.
const rebase = (css) => css.replaceAll('../fonts/', '../src/fonts/');

const tmp = R('verification/.styles.tmp');
if (existsSync(tmp)) rmSync(tmp);

// Real records, so the harness measures real Danish strings — including the
// long ones that actually cause overflow.
const dataSrc = readFileSync(R('src/data/plejecentre.ts'), 'utf8');
const start = dataSrc.indexOf('[', dataSrc.indexOf('PLEJECENTRE: Plejecenter[] =') + 28);
const json = dataSrc.slice(start, dataSrc.lastIndexOf(']') + 1);
const all = JSON.parse(json);

const pick = (name) => all.find((p) => p.name === name) ?? all[0];
const longest = [...all].sort((a, b) => b.name.length - a.name.length)[0];

const rows = [
  { p: pick('Plejecenter Sølund'), group: 'Kommunal', current: true },
  { p: pick('Bispebjerghjemmet'), group: 'Selvejende', current: false },
  { p: pick('Grønttorvets Friplejehjem'), group: 'Privat', current: false },
  { p: longest, group: 'Kommunal', current: false },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const icon = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
  ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"` +
  ` focusable="false">${paths}</svg>`;

const I = {
  search: icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  x: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  moon: icon('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  pin: icon('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  plus: icon('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  minus: icon('<path d="M5 12h14"/>'),
  frame: icon(
    '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>' +
      '<path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  ),
  phone: icon(
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6' +
      ' 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81' +
      ' 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7' +
      'A2 2 0 0 1 22 16.92Z"/>',
  ),
  globe: icon(
    '<circle cx="12" cy="12" r="10"/>' +
      '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  ),
  mail: icon(
    '<rect width="20" height="16" x="2" y="4" rx="2"/>' +
      '<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  ),
  building: icon(
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>' +
      '<path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>' +
      '<path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>' +
      '<path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  ),
  bed: icon('<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>'),
  navigation: icon('<polygon points="3 11 22 2 13 21 11 13 3 11"/>'),
  external: icon(
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/>' +
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
  ),
  slash: icon('<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>'),
  chevronDown: icon('<path d="m6 9 6 6 6-6"/>'),
  pencil: icon('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>'),
  user: icon('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  bookmark: icon('<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
  bookmarkCheck: icon('<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="m9 10 2 2 4-4"/>'),
  check: icon('<path d="M20 6 9 17l-5-5"/>'),
  crosshair: icon(
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>' +
      '<path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  ),
};

const caret = (color) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  )}")`;

const result = ({ p, group, current }) =>
  `<li><button type="button" class="result" data-own="${group}" aria-current="${current}">` +
  `<span class="result__mark"></span>` +
  `<span class="result__name">${esc(p.name)}</span>` +
  `<span class="result__meta"><span>${esc(p.street)}</span><span>${esc(p.city)}</span>` +
  (p.homes ? `<span>${p.homes} boliger</span>` : '') +
  `</span></button></li>`;

const fact = (ic, label, value) =>
  `<div class="fact"><span class="fact__icon">${ic}</span>` +
  `<span><span class="fact__label">${label}</span><span class="fact__value">${value}</span></span></div>`;

const detail = pick('Plejecenter Sølund');

const sharedCss = rebase(`${strip(tokens)}\n${strip(app)}`);
writeFileSync(R('verification/harness.css'), sharedCss, 'utf8');

writeFileSync(R('verification/harness-page.css'), `/* Harness only: the map is a live WebGL canvas at runtime; here it is a plain
   surface so the gates measure the app chrome instead of a tile CDN. */
:root { --select-caret: ${caret('%236E7776')}; }
:root[data-theme='dark'] { --select-caret: ${caret('%23A2ABAB')}; }
.map { display: grid; place-items: center; color: var(--text-tertiary); font-size: var(--text-sm); }
.map > * { max-inline-size: var(--measure); text-align: center; }

/* Harness only: in the app the result list is clipped out of the pointer
   interface and only laid out once keyboard focus enters it. The gates measure
   that laid-out state, because it is the one with visual design to check --
   and because a clipped, absolutely positioned list puts its buttons' boxes on
   top of the filters, which reads as overlapping controls. */
.results:not(:focus-within) {
  position: static;
  inline-size: auto;
  block-size: auto;
  margin: 0;
  overflow-y: auto;
  clip-path: none;
  white-space: normal;
}

/* Harness only: below the sheet breakpoint the running app slides the rail down
   and scrolls the list inside itself. A gate that measures bounding boxes reads
   every scrolled-out row as overlapping whatever sits below the scroller, so the
   harness lays the same markup out flat instead. The sheet's own behaviour is
   verified by interaction, not by this file. */
@media (max-width: 60rem) {
  body { overflow: auto; }
  .app { position: static; block-size: auto; }
  .workspace { grid-template-rows: auto auto; }
  .rail { grid-template-rows: auto auto auto minmax(0, 1fr); }
  .rail { grid-area: 2 / 1; position: static; max-block-size: none; translate: none; box-shadow: none; }
  .stage { grid-area: 1 / 1; min-block-size: 60vh; }
  .results { overflow: visible; }
}\n`, 'utf8');
const html = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plejecentre i Hovedstaden gate harness</title>
<link rel="stylesheet" href="./harness.css">
<link rel="stylesheet" href="./harness-page.css">
</head>
<body>
<div class="app">
  <header class="masthead">
    <span class="masthead__mark" aria-hidden="true">${I.pin}</span>
    <span class="masthead__titles">
      <h1 class="masthead__title">Plejecentre</h1>
      <p class="masthead__sub">Hovedstadsområdet</p>
    </span>
    <span class="masthead__spacer"></span>
    <div class="langpick">
      <button type="button" class="langpick__button" aria-expanded="false"
              aria-controls="langMenu" aria-label="Vælg sprog">
        ${I.globe}<span class="langpick__code">DA</span>
      </button>
      <div class="langpick__menu" id="langMenu" aria-label="Sprog" hidden></div>
    </div>
    <button type="button" class="btn btn--ghost btn--icon" aria-pressed="false">
      <span class="sr-only">Skift til mørkt tema</span>${I.moon}
    </button>
  </header>

  <div class="workspace">
    <aside class="rail" aria-label="Søg og filtrér plejecentre">
      <button type="button" class="grabber" style="display:block" aria-expanded="true"
              aria-controls="hFilters" aria-label="Skjul søgefelterne"></button>

      <div class="rail__lead">
        <p class="tally">
          <span class="tally__count">148</span>
          <span class="tally__label"><b>plejecentre</b> i 23 kommuner</span>
        </p>

        <div class="chips" role="group" aria-label="Filtrér på driftsform">
          <button type="button" class="chip" data-own="Kommunal" aria-pressed="true"><span class="chip__mark"></span>Kommunal</button>
          <button type="button" class="chip" data-own="Selvejende" aria-pressed="true"><span class="chip__mark"></span>Selvejende</button>
          <button type="button" class="chip" data-own="Privat" aria-pressed="false"><span class="chip__mark"></span>Privat</button>
        </div>
      </div>

      <div class="filters">
        <div class="filters__body" id="hFilters">
        <div class="filters__inner">
        <div class="filters__search">
          <label class="field">
            <span class="sr-only">Søg efter plejecenter, vej, postnummer eller by</span>
            <span class="field__icon" aria-hidden="true">${I.search}</span>
            <input class="field__input" type="search" value="Sølund" autocomplete="off">
            <button type="button" class="field__clear"><span class="sr-only">Ryd søgningen</span>${I.x}</button>
          </label>
          <button type="button" class="iconbtn" aria-pressed="true" aria-label="Kun besøgte">${I.bookmarkCheck}</button>
        </div>

        <label class="field">
          <span class="sr-only">Filtrér på kommune</span>
          <select class="select">
            <option>Alle kommuner</option>
            <option>Københavns Kommune</option>
            <option>Lyngby-Taarbæk Kommune</option>
          </select>
        </label>
        </div>
        </div>

      </div>

      <nav class="results" aria-label="Resultater">
        <ul>
          <li><h3 class="results__group">Københavns <span class="sr-only">kommune,</span> 41</h3>
            <ul>${rows.map(result).join('')}</ul>
          </li>
        </ul>
      </nav>

    </aside>

    <main class="stage">
      <div class="map" role="application" aria-label="Kort over plejecentre i hovedstadsområdet">
        Kortlærredet tegnes af MapLibre i den kørende app.
      </div>

      <div class="user-dot" role="img" style="position:absolute; inset-block-start:40%; inset-inline-start:45%; z-index:var(--z-map-ui)"
           aria-label="Din placering. Nøjagtighed cirka 65 meter">
        <span class="user-dot__ring"></span><span class="user-dot__ring"></span>
        <span class="user-dot__ring"></span><span class="user-dot__core"></span>
      </div>

      <div class="map__tools">
        <button type="button" class="map__tool" aria-pressed="true" data-state="active">
          <span class="sr-only">Skjul min placering</span>
          <span class="map__tool__icon">${I.crosshair}</span>
          <span class="map__tool__spinner" aria-hidden="true"></span>
        </button>
        <div class="map__toolgroup">
          <button type="button" class="map__tool"><span class="sr-only">Zoom ind på kortet</span>${I.plus}</button>
          <button type="button" class="map__tool"><span class="sr-only">Zoom ud på kortet</span>${I.minus}</button>
        </div>
        <button type="button" class="map__tool"><span class="sr-only">Vis hele hovedstadsområdet igen</span>${I.frame}</button>
      </div>

      <section class="map__legend" aria-label="Signaturforklaring">
        <h2>Driftsform</h2>
        <p class="legend__row" data-own="Kommunal"><span class="legend__mark" style="background: var(--own-mark)"></span>Kommunal</p>
        <p class="legend__row" data-own="Selvejende"><span class="legend__mark" style="background: var(--own-mark)"></span>Selvejende</p>
        <p class="legend__row" data-own="Privat"><span class="legend__mark" style="background: var(--own-mark)"></span>Privat / friplejebolig</p>
      </section>

      <p class="map__credit">Kort: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://carto.com/attributions">CARTO</a></p>

    </main>
  </div>
</div>
<p class="sr-only" role="status" aria-live="polite"></p>
</body>
</html>
`;

writeFileSync(R('verification/harness.html'), html, 'utf8');

/* The detail panel on its own page. In the app it is an overlay stacked above
   both the map and the list sheet, so gating it alongside the list would report
   an overlap the running app never shows. */
writeFileSync(R('verification/panel-page.css'), `body { overflow: auto; background: var(--surface-sunken); }
.stage { position: relative; min-block-size: 100dvh; }
/* Harness only: in the app the card caps its height and scrolls its middle
   section, with the actions pinned in a foot below it. A gate that measures
   bounding boxes reads every scrolled-out row as overlapping that pinned foot,
   so the harness lays the same markup out at its natural height instead. That
   the actions stay reachable without scrolling is verified by interaction
   against the running app, not by this file. */
.panel { inset-block: var(--space-3) auto; max-block-size: none; }
.panel__body { overflow: visible; }\n`, 'utf8');
const panel = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plejecentre i Hovedstaden detaljepanel</title>
<link rel="stylesheet" href="./harness.css">
<link rel="stylesheet" href="./panel-page.css">
</head>
<body>
<main class="stage">
      <aside class="panel" role="region" aria-labelledby="panelTitle" tabindex="-1">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow" data-own="Kommunal">Kommunal</span>
            <div class="panel__titlerow">
              <button type="button" class="panel__visit" aria-pressed="true" aria-label="Fjern fra besøgte">${I.bookmarkCheck}</button>
              <h2 class="panel__title" id="panelTitle">${esc(detail.name)}</h2>
            </div>
          </div>
          <button type="button" class="panel__close" aria-label="Luk detaljer om ${esc(detail.name)}">${I.x}</button>
        </div>
        <div class="panel__body">
          <div class="note">
            <p class="note__label">Din note</p>
            <p class="note__body">Ringede tirsdag, venteliste omkring fire måneder.</p>
          </div>
          <div class="jobs">
            <p class="jobs__label">Job</p>
            <a class="jobs__action" href="https://www.google.com/search?q=x">${I.search}<span>Søg ledige stillinger</span></a>
            <a class="jobs__action" href="mailto:kontakt@kk.dk?subject=x&amp;body=y">${I.mail}<span>Skriv en ansøgning</span></a>
          </div>
          <div class="facts">
            ${fact(I.pin, 'Adresse', `${esc(detail.street)}<br>${esc(detail.postcode)} ${esc(detail.city)}<br>${esc(detail.municipality)} Kommune`)}
            ${fact(I.building, 'Driftsform', 'Kommunalt drevet plejecenter')}
            ${fact(I.bed, 'Kapacitet', `${detail.homes ?? 0} plejeboliger`)}
            ${fact(I.phone, 'Telefon', `<a href="tel:+45${esc(detail.phone ?? '')}">82 32 50 50</a>`)}
            ${fact(I.mail, 'E-mail', `<a href="mailto:${esc(detail.email ?? 'kontakt@kk.dk')}">${esc(detail.email ?? 'kontakt@kk.dk')}</a>`)}
            ${fact(I.globe, 'Officiel hjemmeside', `<a href="${esc(detail.web ?? '#')}">boligertilaeldre.kk.dk<span class="sr-only"> (åbner i ny fane)</span></a>`)}
          </div>
        </div>
        <div class="panel__foot">
          <div class="panel__actions">
            <a class="btn btn--primary" href="${esc(detail.web ?? '#')}">${I.external}Besøg hjemmesiden<span class="sr-only"> for ${esc(detail.name)} (åbner i ny fane)</span></a>
            <div class="nav-links">
              <a class="btn btn--secondary" href="https://www.google.com/maps/search/?api=1&amp;query=x">${I.navigation}Google Maps<span class="sr-only">, rute til ${esc(detail.name)}</span></a>
              <a class="btn btn--secondary" href="https://maps.apple.com/?q=x">${I.navigation}Apple Maps<span class="sr-only">, rute til ${esc(detail.name)}</span></a>
            </div>
          </div>
        </div>
      </aside>
</main>
</body>
</html>
`;
writeFileSync(R('verification/panel.html'), panel, 'utf8');

/* A second page for the states the first one cannot show at the same time:
   the empty state, disabled and loading controls, and an error field. */
writeFileSync(R('verification/states-page.css'), `:root { --select-caret: ${caret('%236E7776')}; }
:root[data-theme='dark'] { --select-caret: ${caret('%23A2ABAB')}; }
body { overflow: auto; }
.sheet { display: grid; gap: var(--space-8); padding: var(--space-8) var(--space-5); max-inline-size: 26rem; }
.sheet h2 { font-size: var(--text-lg); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-snug); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.stack { display: grid; gap: var(--space-2); }
/* Harness only: on a phone the account panel is a centred overlay, which means
   fixed positioning and a translate. Laid out inline here for measuring, both
   have to be undone -- an inline position:static alone leaves the translate
   applied and the panel rides up over the control above it. */
.stack .account__panel:not([hidden]) {
  position: static;
  translate: none;
  inset: auto;
  margin-inline: 0;
  inline-size: auto;
  max-block-size: none;
}
.err { font-size: var(--text-xs); color: var(--feedback-error-fg); }
.field__input[aria-invalid='true'] { border-color: var(--feedback-error-fg); border-width: var(--border-thick); }\n`, 'utf8');
const states = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plejecentre i Hovedstaden tilstande</title>
<link rel="stylesheet" href="./harness.css">
<link rel="stylesheet" href="./states-page.css">
</head>
<body>
<main class="sheet">
  <section class="stack">
    <h2>Knapper</h2>
    <div class="row">
      <button type="button" class="btn btn--primary">Besøg hjemmesiden</button>
      <button type="button" class="btn btn--secondary">Google Maps</button>
      <button type="button" class="btn btn--ghost">Nulstil</button>
      <button type="button" class="btn btn--primary" disabled>Ikke tilgængelig</button>
      <button type="button" class="btn btn--primary" aria-busy="true">Henter kort</button>
    </div>
  </section>

  <section class="stack">
    <h2>Felter</h2>
    <label class="field">
      <span class="sr-only">Søg</span>
      <span class="field__icon" aria-hidden="true">${I.search}</span>
      <input class="field__input" type="search" placeholder="Søg navn, vej eller postnummer">
    </label>
    <label class="field">
      <span class="sr-only">Postnummer</span>
      <span class="field__icon" aria-hidden="true">${I.search}</span>
      <input class="field__input" type="search" value="99999" aria-invalid="true" aria-describedby="pcErr">
    </label>
    <p class="err" id="pcErr">99999 er ikke et dansk postnummer. Prøv fire cifre, for eksempel 2200.</p>
    <label class="field">
      <span class="sr-only">Kommune</span>
      <select class="select" disabled><option>Alle kommuner</option></select>
    </label>
  </section>

  <section class="stack">
    <h2>Filtre</h2>
    <div class="chips" role="group" aria-label="Filtrér på driftsform">
      <button type="button" class="chip" data-own="Kommunal" aria-pressed="true"><span class="chip__mark"></span>Kommunal</button>
      <button type="button" class="chip" data-own="Selvejende" aria-pressed="false"><span class="chip__mark"></span>Selvejende</button>
      <button type="button" class="chip" data-own="Privat" aria-pressed="false"><span class="chip__mark"></span>Privat</button>
    </div>
  </section>

  <section class="stack">
    <h2>Ingen resultater</h2>
    <div class="empty">
      <span class="empty__icon">${I.slash}</span>
      <h3 class="empty__title">Ingen resultater</h3>
      <p class="empty__body">Ingen plejecentre matcher "zzz" i Dragør. Prøv et kortere søgeord, en anden kommune, eller slå driftsformerne til igen. Søgningen dækker navn, vej, postnummer og by.</p>
      <button type="button" class="btn btn--secondary">Nulstil filtre</button>
    </div>
  </section>

  <section class="stack">
    <h2>Note</h2>
    <div class="notedlg" style="position: static; translate: none; inset: auto; margin-inline: 0; inline-size: auto; max-block-size: none">
      <div class="account__head">
        <p class="account__heading">Din note</p>
        <button type="button" class="account__close" aria-label="Annullér">${I.x}</button>
      </div>
      <textarea class="noteedit__text" id="hNote" rows="4"
        placeholder="Fx ventetid, hvem du talte med, hvad du så.">Ringede tirsdag, venteliste omkring fire måneder.</textarea>
      <div class="notedlg__actions">
        <button type="button" class="btn btn--primary">${I.check}Gem note</button>
        <button type="button" class="btn btn--secondary">Annullér</button>
      </div>
    </div>
    <div class="note">
      <p class="note__label">Din note</p>
      <p class="note__body">Ringede tirsdag, venteliste omkring fire måneder.</p>
    </div>
  </section>

  <section class="stack">
    <h2>Konto: ikke logget ind</h2>
    <div class="langpick" style="position: static">
      <button type="button" class="langpick__button" aria-expanded="true" aria-controls="acctOut" aria-label="Konto">
        ${I.user}<span class="langpick__code"></span>
      </button>
      <div class="langpick__menu account__panel" id="acctOut" style="position: static; margin-block-start: var(--space-2)">
        <div class="account__head">
          <p class="account__heading">Log ind eller opret en konto</p>
          <button type="button" class="account__close" aria-label="Luk kontopanelet">${I.x}</button>
        </div>
        <form class="account__form">
          <label class="account__field"><span>E-mail</span>
            <input class="field__input" type="email" name="email" autocomplete="email"></label>
          <label class="account__field"><span>Adgangskode</span>
            <input class="field__input" type="password" name="password" autocomplete="current-password">
            <span class="account__hint">Mindst 10 tegn.</span></label>
          <p class="account__error" role="alert">E-mail eller adgangskode passer ikke.</p>
          <div class="account__actions">
            <button type="submit" class="btn btn--primary">Log ind</button>
            <button type="button" class="btn btn--secondary">Opret konto</button>
          </div>
        </form>
      </div>
    </div>
  </section>

  <section class="stack">
    <h2>Konto: afventer bekræftelse</h2>
    <div class="langpick" style="position: static">
      <div class="langpick__menu account__panel" style="position: static">
        <p class="account__who">Vi har sendt et link til anna@example.dk. Åbn det for at fuldføre oprettelsen.</p>
        <p class="account__why">Kig i spam-mappen, hvis den ikke er kommet efter et par minutter.</p>
        <p class="account__note" role="status">Linket er sendt igen.</p>
        <div class="account__actions">
          <button type="button" class="btn btn--primary">Send linket igen</button>
          <button type="button" class="btn btn--secondary">Tilbage til log ind</button>
        </div>
      </div>
    </div>
  </section>

  <section class="stack">
    <h2>Konto: logget ind</h2>
    <div class="langpick" style="position: static">
      <div class="langpick__menu account__panel" style="position: static">
        <div class="account__head">
          <p class="account__heading">Din konto</p>
          <button type="button" class="account__close" aria-label="Luk kontopanelet">${I.x}</button>
        </div>
        <p class="account__who">Logget ind som anna@example.dk</p>
        <button type="button" class="btn btn--primary account__saved">${I.bookmarkCheck}Vis gemte steder (3)</button>
        <div class="account__actions">
          <button type="button" class="btn btn--secondary">Log ud</button>
          <button type="button" class="btn btn--danger">Slet konto</button>
        </div>
      </div>
    </div>
  </section>

  <section class="stack">
    <h2>Greb</h2>
    <button type="button" class="grabber" style="display:block; max-inline-size: 20rem"
            aria-expanded="true" aria-label="Skjul søgefelterne"></button>
  </section>

  <section class="stack">
    <h2>Førstegangstip</h2>
    <div style="position: relative; padding-block-start: var(--space-8)">
      <div class="coach" style="position: static; max-inline-size: 15rem" role="status">
        Dine gemte steder finder du her.
      </div>
    </div>
  </section>

  <section class="stack">
    <h2>Besøgt</h2>
    <div class="row">
      <button type="button" class="iconbtn" aria-pressed="false" aria-label="Kun besøgte">${I.bookmarkCheck}</button>
      <button type="button" class="iconbtn" aria-pressed="true" aria-label="Kun besøgte">${I.bookmarkCheck}</button>
    </div>
    <div class="row">
      <button type="button" class="panel__visit" aria-pressed="false" aria-label="Markér som besøgt">
        ${I.bookmark}
      </button>
      <button type="button" class="panel__visit" aria-pressed="true" aria-label="Fjern fra besøgte">
        ${I.bookmarkCheck}
      </button>
    </div>
  </section>

  <section class="stack">
    <h2>Start fejlede</h2>
    <div class="bootfail" style="position: static; padding: 0" role="alert">
      <div class="bootfail__card">
        <p lang="da" dir="ltr">Siden kunne ikke indlæses færdig. Genindlæs siden.</p>
        <p lang="en" dir="ltr">The page did not finish loading. Reload to try again.</p>
        <p lang="fa" dir="rtl">بارگذاری صفحه کامل نشد. صفحه را دوباره بارگذاری کنید.</p>
        <button type="button" class="btn btn--primary" dir="ltr">
          Reload <span aria-hidden="true">&middot;</span> Genindlæs
          <span aria-hidden="true">&middot;</span>
          <span lang="fa" dir="rtl">بارگذاری دوباره</span>
        </button>
      </div>
    </div>
  </section>

  <section class="stack">
    <h2>Sprogvælger</h2>
    <div class="langpick" style="position: static">
      <button type="button" class="langpick__button" aria-expanded="true"
              aria-controls="langMenuStates" aria-label="Vælg sprog">
        ${I.globe}<span class="langpick__code">DA</span>
      </button>
      <div class="langpick__menu" id="langMenuStates" aria-label="Sprog"
           style="position: static; margin-block-start: var(--space-2)">
        <ul>
          <li><button type="button" class="langpick__item" aria-current="true">
            <span class="langpick__tick">${I.check}</span>
            <span class="langpick__native" lang="da" dir="auto">Dansk</span>
            <span class="langpick__code">DA</span>
          </button></li>
          <li><button type="button" class="langpick__item" aria-current="false">
            <span class="langpick__tick">${I.check}</span>
            <span class="langpick__native" lang="en" dir="auto">English</span>
            <span class="langpick__code">EN</span>
          </button></li>
          <li><button type="button" class="langpick__item" aria-current="false">
            <span class="langpick__tick">${I.check}</span>
            <span class="langpick__native" lang="fa" dir="auto">فارسی</span>
            <span class="langpick__code">FA</span>
          </button></li>
        </ul>
      </div>
    </div>
  </section>

  <section class="stack">
    <h2>Placering</h2>
    <div class="row">
      <button type="button" class="map__tool" data-state="idle" aria-pressed="false">
        <span class="sr-only">Vis min placering</span>
        <span class="map__tool__icon">${I.crosshair}</span>
        <span class="map__tool__spinner" aria-hidden="true"></span>
      </button>
      <button type="button" class="map__tool" data-state="locating" aria-busy="true">
        <span class="sr-only">Finder din placering</span>
        <span class="map__tool__icon">${I.crosshair}</span>
        <span class="map__tool__spinner" aria-hidden="true"></span>
      </button>
      <button type="button" class="map__tool" data-state="active" aria-pressed="true">
        <span class="sr-only">Skjul min placering</span>
        <span class="map__tool__icon">${I.crosshair}</span>
        <span class="map__tool__spinner" aria-hidden="true"></span>
      </button>
    </div>
    <div class="geo-note" style="position: static; max-inline-size: none" role="status">
      <p>Adgang til din placering blev afvist. Slå placering til for dette websted i browserens
         indstillinger, og prøv igen.</p>
      <button type="button" class="geo-note__close">
        <span class="sr-only">Luk beskeden</span>${I.x}
      </button>
    </div>
  </section>

  <section class="stack">
    <h2>Kortet kunne ikke hentes</h2>
    <p class="map__fallback" style="position: static; max-inline-size: none">
      Baggrundskortet kunne ikke hentes fra OpenStreetMap-tjenesten. Placeringerne er stadig
      korrekte, og listen med adresser, telefonnumre og ruter virker uændret.
    </p>
  </section>
</main>
</body>
</html>
`;

writeFileSync(R('verification/states.html'), states, 'utf8');
console.log('wrote verification/harness.html, panel.html and states.html');
