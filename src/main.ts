import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/app.css';

import { DetailPanel } from './detail';
import { EXTRACT_DATE } from './data/plejecentre';
import { Geolocator, type GeoStatus } from './geolocate';
import { I18n, LOCALES, LOCALE_META, type Locale, type TranslationKey } from './i18n';
import { icon, iconDataUri } from './icons';
import { ResultList } from './list';
import { PlejecenterMap } from './map';
import { setCollatorLocale } from './format';
import { MUNICIPALITIES, Store, resortForLocale } from './store';
import { ThemeController, token } from './theme';
import type { OwnershipGroup, Plejecenter } from './types';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

/* ------------------------------------------------------------------ setup */

const i18n = new I18n();
setCollatorLocale(i18n.locale);
resortForLocale();
i18n.applyDocument();

const store = new Store();
const theme = new ThemeController();
const geo = new Geolocator();

const searchInput = $<HTMLInputElement>('#search');
const searchClear = $<HTMLButtonElement>('#searchClear');
const muniSelect = $<HTMLSelectElement>('#municipality');
const resultsEl = $('#results');
const tallyCount = $('#tallyCount');
const tallyLabel = $('#tallyLabel');
const panelEl = $('#panel');
const panelHead = $('#panelHead');
const panelBody = $('#panelBody');
const panelFoot = $('#panelFoot');
const themeToggle = $<HTMLButtonElement>('#themeToggle');
const resetViewBtn = $<HTMLButtonElement>('#resetView');
const locateBtn = $<HTMLButtonElement>('#locate');
const geoNote = $('#geoNote');
const geoNoteText = $('#geoNoteText');
const railEl = $('#rail');
const railToggle = $<HTMLButtonElement>('#railToggle');
const live = $('#live');
const langButton = $<HTMLButtonElement>('#langButton');
const langMenu = $('#langMenu');
const langCode = $('#langCode');

const t = (key: TranslationKey, params?: Record<string, string | number>): string =>
  i18n.t(key, params);

/* Static icon slots. Every glyph in this app is a lucide path — never an emoji. */
$('#brandMark').innerHTML = icon('pin');
$('#searchIcon').innerHTML = icon('search');
searchClear.insertAdjacentHTML('beforeend', icon('x'));
resetViewBtn.insertAdjacentHTML('beforeend', icon('frame'));
$('#zoomIn').insertAdjacentHTML('beforeend', icon('plus'));
$('#zoomOut').insertAdjacentHTML('beforeend', icon('minus'));
$('#locateIcon').innerHTML = icon('crosshair');
$('#geoNoteClose').insertAdjacentHTML('beforeend', icon('x'));
$('.panel__close').insertAdjacentHTML('beforeend', icon('x'));
langButton.insertAdjacentHTML('afterbegin', icon('globe'));
$('#extractDate').textContent = EXTRACT_DATE;

/* --------------------------------------------------------------- language */

/**
 * One pass over everything marked up for translation. Cheap enough to re-run on
 * every language change, which keeps the language switch a single code path
 * instead of a list of places to remember.
 */
function applyStaticTranslations(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n as TranslationKey);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as TranslationKey));
  }
  for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-ph]')) {
    el.placeholder = t(el.dataset.i18nPh as TranslationKey);
  }
}

function renderMunicipalityOptions(): void {
  const current = store.filters.municipality;
  muniSelect.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('filter.allMunicipalities');
  muniSelect.append(all);
  for (const m of MUNICIPALITIES) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = t('filter.municipalitySuffix', { name: m });
    muniSelect.append(opt);
  }
  muniSelect.value = current ?? '';
}

/**
 * A disclosure, not an ARIA menu.
 *
 * `role="menu"` is a contract: it promises a roving-tabindex arrow-key model,
 * and a widget that declares it without implementing it is worse for a screen
 * reader than plain buttons. Three mutually exclusive choices do not need that
 * machinery. A button with `aria-expanded` revealing a list of ordinary
 * buttons is Tab-navigable by default, needs no JavaScript to be operable, and
 * says what it is. Arrow keys are still wired below, as a convenience rather
 * than a promise.
 */
function renderLangMenu(): void {
  langCode.textContent = LOCALE_META[i18n.locale].short;
  langButton.setAttribute('aria-label', t('header.language'));
  langMenu.setAttribute('aria-label', t('header.languageMenu'));
  langMenu.innerHTML =
    '<ul>' +
    LOCALES.map((l) => {
      const meta = LOCALE_META[l];
      const on = l === i18n.locale;
      // `lang` so the name gets the right font and is announced in its own
      // language; `dir="auto"` on the SPAN so the Persian string renders
      // correctly without flipping the row's tick/name/code order.
      return (
        `<li><button type="button" class="langpick__item"` +
        ` aria-current="${on ? 'true' : 'false'}" data-locale="${l}">` +
        `<span class="langpick__tick">${icon('check')}</span>` +
        `<span class="langpick__native" lang="${l}" dir="auto">${meta.name}</span>` +
        `<span class="langpick__code">${meta.short}</span>` +
        `</button></li>`
      );
    }).join('') +
    '</ul>';
}

function setLangMenuOpen(open: boolean): void {
  langMenu.hidden = !open;
  langButton.setAttribute('aria-expanded', String(open));
  if (open) langMenu.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
}

langButton.addEventListener('click', () => setLangMenuOpen(langMenu.hidden));

langMenu.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('[data-locale]');
  if (!item) return;
  setLangMenuOpen(false);
  langButton.focus();
  i18n.set(item.dataset.locale as Locale);
});

// Roving arrow keys inside the menu, Escape back to the button: the ARIA menu
// keyboard model, not just a div that happens to be clickable.
langMenu.addEventListener('keydown', (e) => {
  const items = [...langMenu.querySelectorAll<HTMLElement>('[data-locale]')];
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? at + 1 : at - 1;
    items[(next + items.length) % items.length]?.focus();
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    (e.key === 'Home' ? items[0] : items.at(-1))?.focus();
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    setLangMenuOpen(false);
    langButton.focus();
  }
});

document.addEventListener('click', (e) => {
  if (!langMenu.hidden && !$('#langpick').contains(e.target as Node)) setLangMenuOpen(false);
});

/* ------------------------------------------------------------------- map */

const map = new PlejecenterMap($('#map'), theme.current, {
  onSelect: (id) => {
    lastTrigger = null;
    store.select(id);
  },
  onDeselect: () => store.select(null),
  onBasemapError: () => {
    $('#mapFallback').hidden = false;
    live.textContent = t('live.basemapDown');
  },
});

/* ----------------------------------------------------------------- panel */

const detail = new DetailPanel(panelEl, panelBody, panelFoot, i18n, () => store.select(null));

/** Remembered so closing the panel returns focus where it came from. */
let lastTrigger: HTMLElement | null = null;

/* ------------------------------------------------------------------ list */

/**
 * How much of the map is hidden behind the detail card right now. Measured, not
 * assumed: the card's height depends on how much the register holds about that
 * plejecenter, and on the language it is being read in.
 */
function panelInset(): number {
  if (!NARROW.matches || panelEl.hidden) return 0;
  const r = panelEl.getBoundingClientRect();
  return r.height > 0 ? r.height + 12 : 0;
}

const list = new ResultList(resultsEl, store, i18n, (p) => {
  lastTrigger = document.activeElement as HTMLElement;
  store.select(p.id);
  map.focus(p, panelInset());
});

/* ------------------------------------------------- mobile rail (sheet) --- */

const NARROW = window.matchMedia('(max-width: 60rem)');

/**
 * How much of the sheet stays on screen when collapsed. Measured from the lead
 * block rather than guessed in CSS, so the sheet always closes on a clean edge
 * instead of clipping the search field in half at some font size.
 */
/**
 * How much of the sheet stays on screen when collapsed: the count, the filters
 * and the control that opens the list. Measured rather than guessed in CSS, so
 * the sheet always closes on a clean edge instead of clipping a field in half
 * at some font size or in some language.
 */
const PEEK_PARTS = ['.rail__lead', '.filters'] as const;

function syncPeek(): void {
  // getBoundingClientRect, not offsetHeight: three separately rounded integers
  // summed ten pixels short of the real total, which cropped the bottom of the
  // control that opens the list.
  const rows = PEEK_PARTS.map(
    (sel) => railEl.querySelector<HTMLElement>(sel)?.getBoundingClientRect().height ?? 0,
  ).reduce((a, b) => a + b, 0);
  if (rows > 0) railEl.style.setProperty('--collapsed-peek', `${Math.ceil(rows)}px`);
}

/**
 * Keep the peek honest for the life of the page.
 *
 * Measuring once at startup was wrong in both directions. The tally is still
 * empty at that point, so the first reading was short and the sheet closed
 * across the bottom of its own button. And the reading was taken before
 * Vazirmatn arrived, so once the Persian text reflowed into the real font the
 * blocks got shorter while the stale, larger peek stayed put, leaving a band of
 * empty sheet below the last control. Anything that changes those three blocks
 * -- the count landing, the font swapping, a language change, a rotation, the
 * reader's text size -- now re-measures them.
 */
function watchPeek(): void {
  const ro = new ResizeObserver(() => syncPeek());
  for (const sel of PEEK_PARTS) {
    const el = railEl.querySelector<HTMLElement>(sel);
    if (el) ro.observe(el);
  }
  // A font swap changes metrics without resizing the observed boxes in every
  // engine, so wait on it explicitly too.
  document.fonts?.ready.then(() => syncPeek()).catch(() => {});
}

/** Slide the list sheet fully away, so nothing frames the detail card. */
function setRailOffscreen(off: boolean): void {
  if (off) railEl.dataset.offscreen = 'true';
  else delete railEl.dataset.offscreen;
}

function setRailCollapsed(collapsed: boolean): void {
  railEl.dataset.collapsed = String(collapsed);
  railToggle.setAttribute('aria-expanded', String(!collapsed));
  railToggle.innerHTML =
    `<span>${t(collapsed ? 'rail.showList' : 'rail.hideList')}</span>` +
    icon(collapsed ? 'chevronUp' : 'chevronDown');
  // After the label is written: the peek has to include the control at its
  // final height, or the sheet closes across the middle of it.
  syncPeek();
}

railToggle.addEventListener('click', () => {
  setRailCollapsed(railEl.dataset.collapsed !== 'true');
});

/** On a phone the map should lead; the list opens on demand. */
NARROW.addEventListener('change', (e) => {
  setRailCollapsed(e.matches);
  // Above the breakpoint the rail is a column, not an overlay, so it must
  // never stay slid away just because a card happened to be open.
  setRailOffscreen(e.matches && !panelEl.hidden);
});

/* --------------------------------------------------------------- renderer */

let lastVisibleKey = '';
let lastSelected: string | null = null;

/**
 * Whether the list sheet was open before the detail panel took the screen.
 * Opening a plejecenter on a phone collapses the sheet, and closing the panel
 * has to give back what was there: otherwise you tap a home from an open list,
 * close it, and the list is gone with no sign of where it went.
 */
let railOpenBeforePanel: boolean | null = null;

function userPoint(): { lat: number; lon: number } | null {
  return geo.status.kind === 'found'
    ? { lat: geo.status.lat, lon: geo.status.lon }
    : null;
}

function render(): void {
  const items = store.visible;
  const key = `${items.length}:${items[0]?.id ?? ''}:${items.at(-1)?.id ?? ''}`;

  if (key !== lastVisibleKey) {
    lastVisibleKey = key;
    list.render();
    map.setData(items);
    renderTally(items);
    announce(items);
  }

  if (store.selectedId !== lastSelected) {
    lastSelected = store.selectedId;
    map.setSelected(store.selectedId);
    list.syncSelection();
    const p = store.selected;
    if (p) {
      detail.renderHead(p, panelHead);
      detail.show(p, { restoreFocusTo: lastTrigger, userAt: userPoint() });
      // On a phone the panel is the answer to the tap. Leaving the list sheet
      // open behind it puts two overlays on the same screen competing for the
      // same thumb. Remember what it was so closing can put it back; only on
      // the first open, so moving between homes does not overwrite it.
      if (NARROW.matches) {
        if (railOpenBeforePanel === null) {
          railOpenBeforePanel = railEl.dataset.collapsed !== 'true';
        }
        setRailCollapsed(true);
        setRailOffscreen(true);
      }
    } else {
      detail.hide();
      setRailOffscreen(false);
      if (railOpenBeforePanel !== null) {
        if (NARROW.matches) setRailCollapsed(!railOpenBeforePanel);
        railOpenBeforePanel = null;
      }
      // The map deliberately stays where it is. Closing a card is not a
      // request to go somewhere else, and snapping back to the whole region
      // threw away the position someone had just navigated to. The reset
      // control on the map is there for when that IS what they want.
    }
  }

  searchClear.hidden = store.filters.query === '';
}

function renderTally(items: Plejecenter[]): void {
  tallyCount.textContent = i18n.n(items.length);
  const noun = t('tally.noun', { n: items.length });

  // "0 plejecentre i 0 kommuner" counts something that is not there. When the
  // filters match nothing, say that instead.
  if (items.length === 0) {
    // The space is explicit: the noun and the phrase after it used to be
    // separated by the <b> being a block, and they run together without it.
    tallyLabel.innerHTML = `<b>${noun}</b> ${t('tally.noMatch')}`;
    return;
  }

  const munis = new Set(items.map((p) => p.municipality)).size;
  const where = store.filters.municipality
    ? t('tally.inMunicipality', { name: store.filters.municipality })
    : t('tally.inMunicipalities', { n: munis });
  tallyLabel.innerHTML =
    `<b>${noun}</b> ${store.isFiltered ? `${t('tally.found')} ` : ''}${where}`;
}

let announceTimer: number | undefined;
function announce(items: Plejecenter[]): void {
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    live.textContent =
      items.length === 0 ? t('live.noResults') : t('live.results', { n: items.length });
  }, 350);
}

store.subscribe(render);

/* ----------------------------------------------------------------- events */

let searchTimer: number | undefined;
searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  const value = searchInput.value;
  searchTimer = window.setTimeout(() => {
    store.setQuery(value);
    if (value.trim().length >= 2) map.fitTo(store.visible);
  }, 160);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchInput.value !== '') {
    e.stopPropagation();
    clearSearch();
  }
});

function clearSearch(): void {
  searchInput.value = '';
  store.setQuery('');
  searchInput.focus();
}
searchClear.addEventListener('click', clearSearch);

muniSelect.addEventListener('change', () => {
  store.setMunicipality(muniSelect.value || null);
  map.fitTo(store.visible);
});

for (const chip of document.querySelectorAll<HTMLButtonElement>('.chip[data-group]')) {
  chip.addEventListener('click', () => {
    store.toggleOwnership(chip.dataset.group as OwnershipGroup);
    for (const c of document.querySelectorAll<HTMLButtonElement>('.chip[data-group]')) {
      const on = store.filters.ownership.has(c.dataset.group as OwnershipGroup);
      c.setAttribute('aria-pressed', String(on));
    }
  });
}

resetViewBtn.addEventListener('click', () => {
  map.resetView();
  live.textContent = t('live.resetView');
});

$<HTMLButtonElement>('#zoomIn').addEventListener('click', () => map.zoomBy(1));
$<HTMLButtonElement>('#zoomOut').addEventListener('click', () => map.zoomBy(-1));

/* ---------------------------------------------------------- geolocation */

let geoFramed = false;

function showGeoNote(message: string): void {
  geoNoteText.textContent = message;
  geoNote.hidden = false;
}

$<HTMLButtonElement>('#geoNoteClose').addEventListener('click', () => {
  geoNote.hidden = true;
  locateBtn.focus();
});

function renderGeo(status: GeoStatus): void {
  const label = $('#locateLabel');

  switch (status.kind) {
    case 'idle':
      locateBtn.dataset.state = 'idle';
      locateBtn.setAttribute('aria-pressed', 'false');
      locateBtn.removeAttribute('aria-busy');
      label.textContent = t('locate.action');
      map.hideUserLocation();
      geoFramed = false;
      break;

    case 'locating':
      // Busy, not disabled. A dimmed control reads as "you cannot do this"
      // rather than "this is happening".
      locateBtn.dataset.state = 'locating';
      locateBtn.setAttribute('aria-busy', 'true');
      label.textContent = t('locate.searching');
      live.textContent = t('locate.searching');
      geoNote.hidden = true;
      break;

    case 'found': {
      locateBtn.dataset.state = 'active';
      locateBtn.setAttribute('aria-pressed', 'true');
      locateBtn.removeAttribute('aria-busy');
      label.textContent = t('locate.stop');

      const name = `${t('locate.you')}. ${t('locate.accuracy', { n: status.accuracy })}`;
      map.showUserLocation(status.lat, status.lon, status.accuracy, name);

      // Fly there once, on the first fix. Later refinements must not yank the
      // map out from under someone who has since panned somewhere else.
      if (!geoFramed) {
        geoFramed = true;
        map.focusUser(status.lat, status.lon, panelInset());
        live.textContent = t('locate.found');
        const [[w, s], [e, n]] = [
          [12.12, 55.52],
          [12.73, 55.95],
        ];
        if (status.lon < w || status.lon > e || status.lat < s || status.lat > n) {
          showGeoNote(t('locate.far'));
        }
      }

      // The panel gains a distance line once we know where the reader is.
      const selected = store.selected;
      if (selected) detail.show(selected, { userAt: { lat: status.lat, lon: status.lon } });
      break;
    }

    case 'error': {
      locateBtn.dataset.state = 'idle';
      locateBtn.setAttribute('aria-pressed', 'false');
      locateBtn.removeAttribute('aria-busy');
      label.textContent = t('locate.action');
      map.hideUserLocation();
      geoFramed = false;
      const key = (
        {
          denied: 'locate.denied',
          unavailable: 'locate.unavailable',
          timeout: 'locate.timeout',
          insecure: 'locate.insecure',
          unsupported: 'locate.unsupported',
        } as const
      )[status.reason];
      showGeoNote(t(key));
      live.textContent = t(key);
      break;
    }
  }
}

geo.onChange(renderGeo);
locateBtn.addEventListener('click', () => geo.toggle());

/* ------------------------------------------------------------------ theme */

function paintThemeToggle(): void {
  const dark = theme.current === 'dark';
  themeToggle.innerHTML =
    `<span class="sr-only">${t(dark ? 'header.toLight' : 'header.toDark')}</span>` +
    icon(dark ? 'sun' : 'moon');
  themeToggle.setAttribute('aria-pressed', String(dark));
}

/** The select caret is an icon too, recoloured whenever the theme flips. */
function paintCaret(): void {
  document.documentElement.style.setProperty(
    '--select-caret',
    iconDataUri('chevronDown', token('--text-tertiary')),
  );
}

themeToggle.addEventListener('click', () => theme.toggle());
theme.onChange(() => {
  paintThemeToggle();
  paintCaret();
  map.setTheme(theme.current, store.visible);
});

/* --------------------------------------------- language change: re-render */

i18n.onChange((locale) => {
  setCollatorLocale(locale);
  resortForLocale();

  applyStaticTranslations();
  renderMunicipalityOptions();
  renderLangMenu();
  paintThemeToggle();
  setRailCollapsed(railEl.dataset.collapsed === 'true');
  renderGeo(geo.status);

  // Force the data-driven views to rebuild: the records are unchanged, but
  // every label around them is not.
  lastVisibleKey = '';
  lastSelected = null;
  store.select(store.selectedId);
  render();

  live.textContent = t('live.language');
});

/* ------------------------------------------------------------------- boot */

applyStaticTranslations();
renderMunicipalityOptions();
renderLangMenu();
paintThemeToggle();
paintCaret();
setRailCollapsed(NARROW.matches);
watchPeek();
renderGeo(geo.status);
render();
map.setData(store.visible);

// Dev-only handle, so the map can be inspected from the console during
// development. Stripped from the production bundle by the bundler.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__kort = map;
}
