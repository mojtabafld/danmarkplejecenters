import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/app.css';

import { Account, type AuthError } from './account';
import { DetailPanel } from './detail';
import { Geolocator, type GeoStatus } from './geolocate';
import { I18n, LOCALES, LOCALE_META, type Locale, type TranslationKey } from './i18n';
import { icon, iconDataUri } from './icons';
import { ResultList } from './list';
import { PlejecenterMap } from './map';
import { setCollatorLocale } from './format';
import { MUNICIPALITIES, Store, resortForLocale } from './store';
import { ThemeController, token } from './theme';
import type { OwnershipGroup, Plejecenter } from './types';

/**
 * If the script dies before the interface exists, say so.
 *
 * Everything visible here is built by this file, so a throw during start-up
 * leaves the markup standing with no text, no icons and no map: a page that
 * looks broken without saying anything. This turns that into a sentence and a
 * reload button. It is armed only until start-up finishes.
 */
let booted = false;
window.addEventListener('error', () => {
  if (booted) return;
  const el = document.getElementById('bootFail');
  if (el) el.hidden = false;
});
document.getElementById('bootFailReload')?.addEventListener('click', () => location.reload());

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
const account = new Account();

// The store filters on visits without holding a copy of them.
store.isVisited = (id) => account.isVisited(id);

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
const live = $('#live');
const langButton = $<HTMLButtonElement>('#langButton');
const langMenu = $('#langMenu');
const langCode = $('#langCode');
const accountEl = $('#account');
const accountButton = $<HTMLButtonElement>('#accountButton');
const accountPanel = $('#accountPanel');
const accountCode = $('#accountCode');
const visitedFilter = $<HTMLButtonElement>('#visitedFilter');
const accountScrim = $('#accountScrim');

const t = (key: TranslationKey, params?: Record<string, string | number>): string =>
  i18n.t(key, params);

const esc = (v: string): string => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* Static icon slots. Every glyph in this app is a lucide path — never an emoji. */
$('#brandMark').innerHTML = icon('pin');
$('#searchIcon').innerHTML = icon('search');
searchClear.insertAdjacentHTML('beforeend', icon('x'));
resetViewBtn.insertAdjacentHTML('beforeend', icon('frame'));
$('#zoomIn').insertAdjacentHTML('beforeend', icon('plus'));
$('#zoomOut').insertAdjacentHTML('beforeend', icon('minus'));
$('#locateIcon').innerHTML = icon('crosshair');
accountButton.insertAdjacentHTML('afterbegin', icon('user'));
visitedFilter.insertAdjacentHTML('beforeend', icon('bookmarkCheck'));
$('#geoNoteClose').insertAdjacentHTML('beforeend', icon('x'));
$('.panel__close').insertAdjacentHTML('beforeend', icon('x'));
langButton.insertAdjacentHTML('afterbegin', icon('globe'));

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

/*
 * composedPath(), not contains(). The path is fixed when the event is
 * dispatched, so it still names the real ancestors even when the handler that
 * ran first replaced the panel's contents -- at which point the original target
 * is detached, contains() says false, and the panel closes itself on its own
 * button.
 */
document.addEventListener('click', (e) => {
  if (langMenu.hidden) return;
  if (!e.composedPath().includes($('#langpick'))) setLangMenuOpen(false);
});

/* --------------------------------------------------------------- account */

/** True while a request is in flight, so the form cannot be submitted twice. */
let accountBusy = false;

/**
 * The outcome of following a confirmation link, held as state rather than
 * written straight into the panel: `account.load()` finishes a moment later and
 * re-renders, which would wipe a message that was only in the DOM.
 */
let verifiedNotice: 'ok' | 'failed' | null = null;

function setAccountOpen(open: boolean): void {
  accountPanel.hidden = !open;
  accountScrim.hidden = !open;
  accountButton.setAttribute('aria-expanded', String(open));
  if (open) accountPanel.querySelector<HTMLElement>('input, button')?.focus();
}

function renderAccount(): void {
  // No database bound on the server: leave the feature out rather than offer a
  // button that can only fail.
  accountEl.hidden = !account.available;
  if (!account.available) return;

  accountCode.textContent = account.user ? account.user.email.slice(0, 1).toUpperCase() : '';
  accountButton.setAttribute(
    'aria-label',
    account.user ? t('account.signedInAs', { email: account.user.email }) : t('account.open'),
  );
  accountButton.dataset.state = account.user ? 'in' : 'out';

  const notice = verifiedNotice
    ? `<p class="account__${verifiedNotice === 'ok' ? 'note' : 'error'}">` +
      `${esc(t(verifiedNotice === 'ok' ? 'verify.ok' : 'verify.failed'))}</p>`
    : '';

  const heading = account.user || account.pendingEmail ? t('account.title') : t('account.why');
  // The close button is part of the panel rather than of each state, so it is
  // there whichever state the panel is in.
  const head =
    `<div class="account__head"><p class="account__heading">${esc(heading)}</p>` +
    `<button type="button" class="account__close" data-act="close" ` +
    `aria-label="${esc(t('account.close'))}">${icon('x')}</button></div>`;

  accountPanel.innerHTML =
    head +
    (account.user
      ? signedInMarkup()
      : notice +
        (account.pendingEmail ? pendingMarkup(account.pendingEmail) : signedOutMarkup()));

  // The visited filter only means anything to someone with visits.
  visitedFilter.hidden = !account.user;
  if (!account.user && store.filters.visitedOnly) store.setVisitedOnly(false);
}

function signedInMarkup(): string {
  const saved = account.visited.size;
  // With nothing saved the button would filter the map down to nothing and
  // read as broken, so it says so instead.
  const savedRow = saved
    ? `<button type="button" class="btn btn--primary account__saved" data-act="saved">` +
      `${icon('bookmarkCheck')}${esc(t('visit.showSaved', { n: saved }))}</button>`
    : `<p class="account__why">${esc(t('visit.none'))}</p>`;

  return (
    `<p class="account__who">${esc(t('account.signedInAs', { email: account.user!.email }))}</p>` +
    savedRow +
    `<div class="account__actions">` +
    `<button type="button" class="btn btn--secondary" data-act="signout">${esc(t('account.signOut'))}</button>` +
    `<button type="button" class="btn btn--danger" data-act="delete">${esc(t('account.deleteAccount'))}</button>` +
    `</div>`
  );
}

/**
 * After sign-up: the account exists but the address is not confirmed, so there
 * is nothing to sign in to yet. Shows where the link went, says to check spam
 * because that is where it usually is, and offers to send it again.
 */
function pendingMarkup(email: string): string {
  return (
    `<p class="account__who">${esc(t('verify.sent', { email }))}</p>` +
    `<p class="account__why">${esc(t('verify.checkSpam'))}</p>` +
    `<p class="account__note" id="accountNote" role="status" hidden></p>` +
    `<div class="account__actions">` +
    `<button type="button" class="btn btn--primary" data-act="resend" data-email="${esc(email)}">` +
    `${esc(t('verify.resend'))}</button>` +
    `<button type="button" class="btn btn--secondary" data-act="back">${esc(t('verify.back'))}</button>` +
    `</div>`
  );
}

function signedOutMarkup(): string {
  return (
    `<p class="account__why">${esc(t('account.why'))}</p>` +
    `<form class="account__form" id="accountForm" novalidate>` +
    `<label class="account__field"><span>${esc(t('account.email'))}</span>` +
    `<input class="field__input" type="email" name="email" autocomplete="email" required></label>` +
    `<label class="account__field"><span>${esc(t('account.password'))}</span>` +
    `<input class="field__input" type="password" name="password" autocomplete="current-password" required>` +
    `<span class="account__hint">${esc(t('account.passwordHint', { n: 10 }))}</span></label>` +
    `<p class="account__error" id="accountError" role="alert" hidden></p>` +
    `<div class="account__actions">` +
    `<button type="submit" class="btn btn--primary" data-act="signin">${esc(t('account.signIn'))}</button>` +
    `<button type="button" class="btn btn--secondary" data-act="signup">${esc(t('account.signUp'))}</button>` +
    `</div></form>`
  );
}

function showAuthError(err: AuthError): void {
  // An unconfirmed address is not really an error in the form; it is a state
  // with its own next step, so it takes over the panel instead.
  if (err === 'not_verified' && account.unverifiedEmail) {
    accountPanel.innerHTML = pendingMarkup(account.unverifiedEmail);
    return;
  }
  const box = accountPanel.querySelector<HTMLElement>('#accountError');
  if (!box) return;
  box.textContent = t(`error.${err}` as TranslationKey, {
    n: 10,
    email: account.unverifiedEmail ?? '',
  });
  box.hidden = false;
}

async function submitCredentials(kind: 'signin' | 'signup'): Promise<void> {
  if (accountBusy) return;
  const form = accountPanel.querySelector<HTMLFormElement>('#accountForm');
  if (!form) return;
  const data = new FormData(form);
  const email = String(data.get('email') ?? '');
  const password = String(data.get('password') ?? '');

  accountBusy = true;
  accountPanel.dataset.busy = 'true';
  const err = kind === 'signin' ? await account.signIn(email, password) : await account.signUp(email, password);
  accountBusy = false;
  delete accountPanel.dataset.busy;

  if (err) {
    showAuthError(err);
    return;
  }
  // Signing in is finished, so the panel gets out of the way. Signing up is
  // not: it now shows which address the link went to, which is the one thing
  // the person needs next.
  verifiedNotice = null;
  if (kind === 'signin') setAccountOpen(false);
}

accountButton.addEventListener('click', () => setAccountOpen(accountPanel.hidden));

accountPanel.addEventListener('submit', (e) => {
  e.preventDefault();
  void submitCredentials('signin');
});

accountPanel.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'signup') void submitCredentials('signup');
  else if (act === 'signout') void account.signOut().then(() => setAccountOpen(false));
  else if (act === 'close') {
    setAccountOpen(false);
    accountButton.focus();
  } else if (act === 'saved') {
    // Show the saved ones on the map, and get out of the way to reveal them.
    store.setVisitedOnly(true);
    visitedFilter.setAttribute('aria-pressed', 'true');
    setAccountOpen(false);
  } else if (act === 'back') account.clearPending();
  else if (act === 'resend') {
    const email = (e.target as HTMLElement).closest<HTMLElement>('[data-email]')?.dataset.email ?? '';
    void account.resend(email).then(() => {
      const note = accountPanel.querySelector<HTMLElement>('#accountNote');
      if (note) {
        note.textContent = t('verify.resent');
        note.hidden = false;
      }
    });
  }
  else if (act === 'delete') {
    // A destructive, irreversible action gets an explicit confirmation.
    if (confirm(t('account.deleteConfirm'))) void account.deleteAccount().then(() => setAccountOpen(false));
  }
});

accountPanel.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    setAccountOpen(false);
    accountButton.focus();
  }
});

document.addEventListener('click', (e) => {
  if (accountPanel.hidden) return;
  if (!e.composedPath().includes(accountEl)) setAccountOpen(false);
});

visitedFilter.addEventListener('click', () => {
  store.setVisitedOnly(!store.filters.visitedOnly);
  visitedFilter.setAttribute('aria-pressed', String(store.filters.visitedOnly));
});

/** Icon only, so the label is the accessible name and the title on hover. */
function paintVisitedFilter(): void {
  const label = t('visit.filter');
  visitedFilter.setAttribute('aria-label', label);
  visitedFilter.setAttribute('title', label);
}

/** Marking a plejecenter visited, from the detail card. */
async function toggleVisited(id: string): Promise<void> {
  if (!account.user) {
    setAccountOpen(true);
    return;
  }
  const p = store.byId(id);
  const wasVisited = account.isVisited(id);
  const ok = await account.toggleVisited(id);
  if (!ok) {
    live.textContent = t('visit.failed');
    return;
  }
  live.textContent = t(wasVisited ? 'live.visitRemoved' : 'live.visitAdded', { name: p?.name ?? '' });
}

// The mark is re-rendered on every open, so the listener sits on the card,
// which does not go away.
panelEl.addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-visit]')?.dataset.visit;
  if (id) void toggleVisited(id);
});

account.onChange(() => {
  renderAccount();
  // The map and the card both show visited state, so both are rebuilt.
  map.setData(store.visible);
  const selected = store.selected;
  if (selected) {
    detail.show(selected, {
      userAt: userPoint(),
      visited: account.isVisited(selected.id),
      canVisit: account.available,
    });
  }
  lastVisibleKey = '';
  render();
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

/** Slide the filter sheet fully away, so nothing frames the detail card. */
function setRailOffscreen(off: boolean): void {
  if (off) railEl.dataset.offscreen = 'true';
  else delete railEl.dataset.offscreen;
}

// Above the breakpoint the sheet is a column, not an overlay, so it must never
// stay slid away just because a card happened to be open.
NARROW.addEventListener('change', (e) => {
  setRailOffscreen(e.matches && !panelEl.hidden);
});

/* --------------------------------------------------------------- renderer */

let lastVisibleKey = '';
let lastSelected: string | null = null;


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
      detail.show(p, {
        restoreFocusTo: lastTrigger,
        userAt: userPoint(),
        visited: account.isVisited(p.id),
        canVisit: account.available,
      });
      // On a phone the panel is the answer to the tap. Leaving the list sheet
      // open behind it puts two overlays on the same screen competing for the
      // same thumb. Remember what it was so closing can put it back; only on
      // the first open, so moving between homes does not overwrite it.
      if (NARROW.matches) setRailOffscreen(true);
    } else {
      detail.hide();
      setRailOffscreen(false);
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
      if (selected) {
        detail.show(selected, {
          userAt: { lat: status.lat, lon: status.lon },
          visited: account.isVisited(selected.id),
          canVisit: account.available,
        });
      }
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
  paintVisitedFilter();
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
renderGeo(geo.status);
renderAccount();
paintVisitedFilter();
// Told once: every setData afterwards carries the marks with it.
map.setVisitedPredicate((id) => account.isVisited(id));
render();
void account.load();

/**
 * The return trip from the confirmation link. The server redirects to
 * /?verified=1 or 0; this turns that into a sentence and then removes the
 * parameter, so a reload or a shared URL does not repeat the message.
 */
{
  const verified = new URLSearchParams(location.search).get('verified');
  if (verified !== null) {
    history.replaceState(null, '', location.pathname);
    verifiedNotice = verified === '1' ? 'ok' : 'failed';
    live.textContent = t(verifiedNotice === 'ok' ? 'verify.ok' : 'verify.failed');
    renderAccount();
    setAccountOpen(true);
  }
}
map.setData(store.visible);

// Dev-only handle, so the map can be inspected from the console during
// development. Stripped from the production bundle by the bundler.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__kort = map;
}

booted = true;
