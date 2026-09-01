import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/app.css';

import { Account, type AuthError } from './account';
import { DetailPanel } from './detail';
import { Geolocator, type GeoStatus } from './geolocate';
import { Intro } from './intro';
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
const stageEl = $('.stage');
const legendSaved = $('#legendSaved');
const live = $('#live');
const langButton = $<HTMLButtonElement>('#langButton');
const langMenu = $('#langMenu');
const langCode = $('#langCode');
const accountEl = $('#account');
const accountButton = $<HTMLButtonElement>('#accountButton');
const accountPanel = $('#accountPanel');
const accountCode = $('#accountCode');
const savedHint = $('#savedHint');
const dock = $('#dock');
const dockSearchBtn = $<HTMLButtonElement>('#dockSearchBtn');
const dockSearchIcon = $('#dockSearchIcon');
const dockSplit = $('#dockSplit');
const dockSavedBtn = $<HTMLButtonElement>('#dockSaved');
const dockFields = $('#dockFields');
const dockSearchInput = $<HTMLInputElement>('#dockSearch');
const dockClear = $<HTMLButtonElement>('#dockClear');
const dockMuni = $<HTMLSelectElement>('#dockMunicipality');
const accountScrim = $('#accountScrim');
const noteDialog = $('#noteDialog');
const noteScrim = $('#noteScrim');
const noteText = $<HTMLTextAreaElement>('#noteText');
const noteError = $('#noteError');

const t = (key: TranslationKey, params?: Record<string, string | number>): string =>
  i18n.t(key, params);

const esc = (v: string): string => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* Static icon slots. Every glyph in this app is a lucide path — never an emoji. */
$('#brandMark').innerHTML = icon('pin');
resetViewBtn.insertAdjacentHTML('beforeend', icon('frame'));
$('#zoomIn').insertAdjacentHTML('beforeend', icon('plus'));
$('#zoomOut').insertAdjacentHTML('beforeend', icon('minus'));
$('#locateIcon').innerHTML = icon('crosshair');
accountButton.insertAdjacentHTML('afterbegin', icon('user'));
$('#geoNoteClose').insertAdjacentHTML('beforeend', icon('x'));
$('.panel__close').insertAdjacentHTML('beforeend', icon('x'));
langButton.insertAdjacentHTML('afterbegin', icon('globe'));
$('#dockFieldIcon').innerHTML = icon('search');
dockClear.insertAdjacentHTML('beforeend', icon('x'));
$('#dockSavedIcon').innerHTML = icon('bookmark');

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
  dockMuni.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('filter.allMunicipalities');
  dockMuni.append(all);
  for (const m of MUNICIPALITIES) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = t('filter.municipalitySuffix', { name: m });
    dockMuni.append(opt);
  }
  dockMuni.value = current ?? '';
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

/**
 * True while the panel is asking for an address to send a reset link to.
 *
 * A flag rather than something on `account`, because nothing has happened on
 * the server yet -- it is which form is on screen, not what the account is.
 */
let forgotMode = false;

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

  const heading = account.resetToken
    ? t('reset.newTitle')
    : forgotMode || account.resetSentTo
      ? t('reset.title')
      : account.user || account.pendingEmail
        ? t('account.title')
        : t('account.why');
  // The close button is part of the panel rather than of each state, so it is
  // there whichever state the panel is in.
  const head =
    `<div class="account__head"><p class="account__heading">${esc(heading)}</p>` +
    `<button type="button" class="account__close" data-act="close" ` +
    `aria-label="${esc(t('account.close'))}">${icon('x')}</button></div>`;

  accountPanel.innerHTML =
    head +
    (account.resetToken
      ? resetMarkup()
      : forgotMode || account.resetSentTo
        ? forgotMarkup()
        : account.user
          ? signedInMarkup()
          : notice +
            (account.pendingEmail ? pendingMarkup(account.pendingEmail) : signedOutMarkup()));

  paintDock();
  paintLegendSaved();
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

/**
 * "I have forgotten it": ask for the address, and say the same thing back
 * whatever the server found.
 *
 * The message names the address without claiming an account exists for it --
 * "if there is an account for X" -- because the endpoint deliberately answers
 * identically either way, and a client that phrased it as a fact would give
 * away exactly what the server is refusing to.
 */
function forgotMarkup(): string {
  if (account.resetSentTo) {
    return (
      `<p class="account__who">${esc(t('reset.sent', { email: account.resetSentTo }))}</p>` +
      `<p class="account__why">${esc(t('verify.checkSpam'))}</p>` +
      `<div class="account__actions">` +
      `<button type="button" class="btn btn--secondary" data-act="back">${esc(t('verify.back'))}</button>` +
      `</div>`
    );
  }
  return (
    `<form class="account__form" id="accountForm" novalidate>` +
    `<p class="account__why">${esc(t('reset.why'))}</p>` +
    `<label class="account__field"><span>${esc(t('account.email'))}</span>` +
    `<input class="field__input" type="email" name="email" autocomplete="email" required></label>` +
    `<p class="account__error" id="accountError" role="alert" hidden></p>` +
    `<div class="account__actions">` +
    `<button type="submit" class="btn btn--primary" data-act="forgot">${esc(t('reset.send'))}</button>` +
    `<button type="button" class="btn btn--secondary" data-act="back">${esc(t('verify.back'))}</button>` +
    `</div></form>`
  );
}

/** Arrived by the link in the mail: one field, and the token is already held. */
function resetMarkup(): string {
  return (
    `<form class="account__form" id="accountForm" novalidate>` +
    `<label class="account__field"><span>${esc(t('reset.newPassword'))}</span>` +
    `<input class="field__input" type="password" name="password" autocomplete="new-password" required>` +
    `<span class="account__hint">${esc(t('account.passwordHint', { n: 10 }))}</span></label>` +
    `<p class="account__error" id="accountError" role="alert" hidden></p>` +
    `<div class="account__actions">` +
    `<button type="submit" class="btn btn--primary" data-act="reset">${esc(t('reset.save'))}</button>` +
    `</div></form>`
  );
}

function signedOutMarkup(): string {
  return (
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
    `</div>` +
    `<button type="button" class="account__link" data-act="forgotstart">${esc(t('account.forgot'))}</button>` +
    `</form>`
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
  if (kind === 'signin') {
    setAccountOpen(false);
    showSavedHint();
  }
}

accountButton.addEventListener('click', () => setAccountOpen(accountPanel.hidden));

accountPanel.addEventListener('submit', (e) => {
  e.preventDefault();
  if (account.resetToken) void submitReset();
  else if (forgotMode) void submitForgot();
  else void submitCredentials('signin');
});

/** Ask for the link, and say so whatever the server found. */
async function submitForgot(): Promise<void> {
  const form = accountPanel.querySelector<HTMLFormElement>('#accountForm');
  const email = (new FormData(form!).get('email') as string | null)?.trim() ?? '';
  const err = await account.forgot(email);
  if (err) {
    showAuthError(err);
    return;
  }
  forgotMode = false;   // resetSentTo now decides what the panel shows
  renderAccount();
}

/** Set the new password from the link, then hand back to sign-in. */
async function submitReset(): Promise<void> {
  const form = accountPanel.querySelector<HTMLFormElement>('#accountForm');
  const password = (new FormData(form!).get('password') as string | null) ?? '';
  const err = await account.resetPassword(password);
  // The token is spent either way, so it must not survive in the address bar
  // to be pasted, shared or reloaded into a dead form.
  history.replaceState(null, '', location.pathname);
  if (err) {
    // A spent or expired token has already cleared itself, so the panel is
    // back on the sign-in form and the message belongs there.
    renderAccount();
    showAuthError(err);
    return;
  }
  renderAccount();
  const note = document.createElement('p');
  note.className = 'account__note';
  note.setAttribute('role', 'status');
  note.textContent = t('reset.done');
  accountPanel.append(note);
}

accountPanel.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'signup') void submitCredentials('signup');
  else if (act === 'signout') {
    void account.signOut().then(() => {
      hideSavedHint();
      setAccountOpen(false);
    });
  }
  else if (act === 'close') {
    setAccountOpen(false);
    accountButton.focus();
  } else if (act === 'saved') {
    // Show the saved ones on the map, and get out of the way to reveal them.
    store.setVisitedOnly(true);
    setAccountOpen(false);
  } else if (act === 'forgotstart') {
    forgotMode = true;
    renderAccount();
    accountPanel.querySelector<HTMLInputElement>('input[name=email]')?.focus();
  } else if (act === 'back') {
    // One "back" for both detours: whichever the panel is in, it returns to
    // the sign-in form.
    forgotMode = false;
    account.clearReset();
    account.clearPending();
  }
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

// Capture, not bubble. A control elsewhere on the page can open this panel --
// the bookmark on the detail card does -- and on the bubbling phase this
// listener would run after that control's own handler, see a panel that is now
// open, find the click outside it, and close it again in the same gesture.
// In the capture phase the panel is still closed at this point, so it stands.
document.addEventListener(
  'click',
  (e) => {
    if (accountPanel.hidden) return;
    if (!e.composedPath().includes(accountEl)) setAccountOpen(false);
  },
  true,
);

/**
 * The one-time tip pointing at the saved-places control.
 *
 * Shown once and never again, on whichever comes first: signing in, or simply
 * arriving with a session that is still valid. The flag lives in
 * localStorage, so "once" means once on this device rather than once per
 * account -- which is the right unit anyway: the tip explains where a control
 * is, and that is something you learn on the device you are holding.
 *
 * It fades after five seconds and can be dismissed sooner by touching it. It
 * is supplementary throughout: the control it points at carries its own
 * accessible name, so nothing is lost if the tip is missed.
 */
const HINT_KEY = 'plejekort.savedHintSeen';
let hintShownThisSession = false;
let hintTimers: number[] = [];

function showSavedHint(): void {
  if (!account.user || hintShownThisSession) return;
  try {
    if (localStorage.getItem(HINT_KEY)) return;
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // Private mode: no way to remember, so show it once for this page and
    // leave it at that rather than on every sign-in.
  }
  hintShownThisSession = true;

  savedHint.textContent = t('visit.hint');
  savedHint.setAttribute('title', t('visit.hintDismiss'));
  delete savedHint.dataset.fading;
  savedHint.hidden = false;
  pointHintAtSaved();

  hintTimers.push(
    window.setTimeout(() => {
      savedHint.dataset.fading = 'true';
      // Hidden only once the fade has finished, so it does not vanish mid-way.
      hintTimers.push(window.setTimeout(() => hideSavedHint(), 400));
    }, 5000),
  );
}

/**
 * Put the tip's pointer on the saved segment, measured rather than assumed.
 *
 * The obvious constant -- the dock's padding plus half a segment -- is wrong,
 * because the segments are centred in a bar wider than they are and the slack
 * either side moves with the dock's width and with how many segments there
 * are. Reading the two boxes is exact at any width and mirrors for free: the
 * offset is taken from whichever edge is the inline end in the current
 * direction, so Persian needs no second rule.
 */
function pointHintAtSaved(): void {
  const tip = savedHint.getBoundingClientRect();
  const seg = dockSavedBtn.getBoundingClientRect();
  if (!tip.width || !seg.width) return;
  const centre = seg.left + seg.width / 2;
  const fromEnd =
    document.documentElement.dir === 'rtl' ? centre - tip.left : tip.right - centre;
  savedHint.style.setProperty('--coach-arrow', `${fromEnd}px`);
}

function hideSavedHint(): void {
  for (const id of hintTimers) window.clearTimeout(id);
  hintTimers = [];
  savedHint.hidden = true;
  delete savedHint.dataset.fading;
}

savedHint.addEventListener('click', () => hideSavedHint());

/* ------------------------------------------------------------------- dock */

/*
 * The pill over the map.
 *
 * It holds no state of its own beyond whether it is open: the query, the
 * kommune and the visited filter all live in the store, and both this and the
 * pair of fields in the rail are views onto it. That is what keeps the two
 * from disagreeing -- there is nothing to disagree about.
 */
let dockOpen = false;

/**
 * True when the dock's own two controls are narrowing the list.
 *
 * Its own two, deliberately -- not `store.isFiltered`, which also counts the
 * ownership chips and the saved toggle. Those are separate controls with their
 * own visible state, and a button that offered to clear them from over here
 * would be undoing things somebody set somewhere else.
 */
function dockFiltered(): boolean {
  return store.filters.query !== '' || store.filters.municipality !== null;
}

function setDockOpen(open: boolean): void {
  dockOpen = open;
  dock.dataset.open = String(open);
  dockFields.hidden = !open;
  dockSearchBtn.setAttribute('aria-expanded', String(open));
  paintDock();
  // Focusing the field here is right where it was wrong on the way out of the
  // tour: somebody has just pressed a search button, so the keyboard coming up
  // is the thing they asked for.
  if (open) dockSearchInput.focus();
}

/**
 * The legend's saved row, shown only once there is something saved.
 *
 * A legend explaining a colour that is not on the map is worse than no row at
 * all -- and signed out there are no saved places, so the blue never appears.
 */
function paintLegendSaved(): void {
  legendSaved.hidden = !account.user || account.visited.size === 0;
}

/** Icon only, so the label is the accessible name and the title on hover. */
function paintDock(): void {
  /*
   * The saved segment is always there -- but only where an account is possible
   * at all. Without a database the server disables accounts outright, and a
   * button whose whole job is to reach them would be a dead end rather than an
   * invitation. That is the one case it stays away for.
   */
  dockSavedBtn.hidden = !account.available;
  dockSplit.hidden = !account.available;

  /*
   * The search segment has three jobs, and wears a different face for each.
   *
   *   open              an x, and pressing it closes the panel
   *   filtered, closed  a funnel, filled, and pressing it clears the filters
   *   otherwise         the magnifier, and pressing it opens the panel
   *
   * The funnel rather than a second x: an x closed and an x open would be the
   * same button doing two different things while looking identical. A filled
   * funnel says "these results are narrowed" on its own, which is the state
   * somebody needs to notice before they wonder where the other centres went.
   */
  const filtered = !dockOpen && dockFiltered();
  const face = dockOpen ? 'x' : filtered ? 'filter' : 'search';
  dockSearchIcon.innerHTML = icon(face);
  dockSearchBtn.dataset.filtered = String(filtered);
  const search = t(dockOpen ? 'dock.close' : filtered ? 'dock.clearFilters' : 'dock.search');
  dockSearchBtn.setAttribute('aria-label', search);
  dockSearchBtn.setAttribute('title', search);

  /*
   * Signed out it is not a toggle, and must not claim to be one. `aria-pressed`
   * would announce it as a two-state control that is currently off, when what
   * it actually does is open the account panel -- so the attribute comes off
   * and `aria-haspopup` goes on, and the name says what pressing it gets you.
   */
  const signedIn = Boolean(account.user);
  const saved = t(signedIn ? 'visit.filter' : 'dock.savedSignedOut');
  dockSavedBtn.setAttribute('aria-label', saved);
  dockSavedBtn.setAttribute('title', saved);
  if (signedIn) {
    dockSavedBtn.removeAttribute('aria-haspopup');
    dockSavedBtn.setAttribute('aria-pressed', String(store.filters.visitedOnly));
  } else {
    dockSavedBtn.removeAttribute('aria-pressed');
    dockSavedBtn.setAttribute('aria-haspopup', 'dialog');
  }
}

/**
 * Point both copies of a control at what the store currently says.
 *
 * The field somebody is typing in is left alone. The query is debounced, so
 * for a moment after each keystroke the store is behind the input, and writing
 * that stale value back would eat the letter just typed and move the caret.
 */
function syncDock(): void {
  const query = store.filters.query;
  // Never while it has the caret: the query is debounced, so for a moment
  // after each keystroke the store is behind the field, and writing that
  // stale value back would eat the letter just typed.
  if (dockSearchInput !== document.activeElement && dockSearchInput.value !== query) {
    dockSearchInput.value = query;
  }
  dockClear.hidden = query === '';

  const muni = store.filters.municipality ?? '';
  if (dockMuni !== document.activeElement && dockMuni.value !== muni) dockMuni.value = muni;

  // Only when it is a toggle; paintDock owns the signed-out shape of it.
  if (account.user) dockSavedBtn.setAttribute('aria-pressed', String(store.filters.visitedOnly));

  // The search segment's face depends on the filters, so it is repainted with
  // them rather than only when the dock is opened or the language changes.
  paintDock();
  paintLegendSaved();
}

/**
 * How high the dock floats.
 *
 * On a narrow screen the sheet owns the bottom of the map and its height is
 * whatever its contents come to, so the gap is measured rather than guessed --
 * a constant would be wrong the moment the tally wraps to two lines or the
 * text size is turned up. Above the breakpoint the sheet is a column beside
 * the map and there is nothing to clear, so the dock sits on the gutter.
 */
function paintDockLift(): void {
  const lift = NARROW.matches && !railEl.dataset.offscreen ? railEl.offsetHeight : 0;
  stageEl.style.setProperty('--dock-lift', `${lift}px`);
}

// The sheet changes height when the filters change the tally, when the
// language changes the wrapping, and when the phone turns.
new ResizeObserver(() => paintDockLift()).observe(railEl);
window.addEventListener('resize', paintDockLift);

dockSearchBtn.addEventListener('click', () => {
  // Filtered and closed, the segment is the way out of the filter rather than
  // the way into the panel. One press puts every plejecentre back on the map;
  // the face returns to the magnifier with it, so searching again is the next
  // press rather than something you have to go looking for.
  if (!dockOpen && dockFiltered()) {
    dockSearchInput.value = '';
    store.setQuery('');
    store.setMunicipality(null);
    map.fitTo(store.visible);
    return;
  }
  setDockOpen(!dockOpen);
});

dockSavedBtn.addEventListener('click', () => {
  // Signed out the button is the way in rather than a filter: somebody
  // pressing "saved places" is asking for their saved places, and the honest
  // answer is the sign-in panel rather than nothing happening.
  if (!account.user) {
    setAccountOpen(true);
    return;
  }
  store.setVisitedOnly(!store.filters.visitedOnly);
});

dockClear.addEventListener('click', () => {
  dockSearchInput.value = '';
  store.setQuery('');
  dockSearchInput.focus();
});

/*
 * Escape clears the field, and clears the dock away once there is nothing left
 * to clear -- the same two-step the rail's search field has, with a closing
 * move on the end because this one can be put away.
 */
dock.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !dockOpen) return;
  e.stopPropagation();
  if (dockSearchInput.value !== '') {
    dockSearchInput.value = '';
    store.setQuery('');
    return;
  }
  setDockOpen(false);
  dockSearchBtn.focus();
});

/*
 * A press anywhere else puts it away. The map is the thing underneath, and
 * reaching for it is a good enough sign that the search is done with.
 * `pointerdown` rather than `click`, so it closes on the press that starts a
 * drag of the map rather than after it.
 */
document.addEventListener('pointerdown', (e) => {
  if (dockOpen && !dock.contains(e.target as Node)) setDockOpen(false);
});

/**
 * The note editor: a small dialog in the middle of the screen.
 *
 * It was rendered into the card body, which meant the plejecenter it is about
 * scrolled away the moment you started writing. One field and two buttons do
 * not need a whole card, and centring it puts the caret where the eye already
 * is.
 */
let noteFor: string | null = null;
let noteReturnFocus: HTMLElement | null = null;

function openNoteEditor(id: string): void {
  const p = store.byId(id);
  if (!p || !account.user) return;

  noteFor = id;
  noteReturnFocus = document.activeElement as HTMLElement;
  $('#noteDialogTitle').textContent = t('note.label');
  $('#noteClose').setAttribute('aria-label', t('note.cancel'));
  $('#noteClose').innerHTML = icon('x');
  $('#noteSave').innerHTML = icon('check') + esc(t('note.save'));
  $('#noteCancel').textContent = t('note.cancel');
  noteText.placeholder = t('note.placeholder');
  noteText.value = account.noteFor(id);
  noteError.hidden = true;

  noteDialog.hidden = false;
  noteScrim.hidden = false;
  noteText.focus();
  noteText.setSelectionRange(noteText.value.length, noteText.value.length);
}

function closeNoteEditor(): void {
  noteFor = null;
  noteDialog.hidden = true;
  noteScrim.hidden = true;
  noteReturnFocus?.focus();
  noteReturnFocus = null;
}

function refreshCard(): void {
  const p = store.selected;
  if (!p) return;
  detail.show(p, {
    userAt: userPoint(),
    visited: account.isVisited(p.id),
    canVisit: Boolean(account.user),
    note: account.noteFor(p.id),
  });
}

$('#noteSave').addEventListener('click', () => {
  if (!noteFor) return;
  const id = noteFor;
  void account.saveNote(id, noteText.value).then((ok) => {
    if (!ok) {
      noteError.textContent = t('note.failed');
      noteError.hidden = false;
      return;
    }
    live.textContent = t('note.saved');
    closeNoteEditor();
    refreshCard();
  });
});

for (const el of [$('#noteCancel'), $('#noteClose')]) {
  el.addEventListener('click', () => closeNoteEditor());
}
noteScrim.addEventListener('click', () => closeNoteEditor());

/*
 * It declares aria-modal, so it has to behave like one: Tab stays inside and
 * Escape leaves. Declaring modality without keeping focus in is worse than not
 * declaring it, because a screen reader is then told the rest of the page is
 * inert while a keyboard walks straight out into it.
 */
noteDialog.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeNoteEditor();
    return;
  }
  if (e.key !== 'Tab') return;
  const stops = [...noteDialog.querySelectorAll<HTMLElement>('textarea, button')].filter(
    (el) => !el.hasAttribute('disabled'),
  );
  if (stops.length === 0) return;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
});

panelEl.addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-note]')?.dataset.note;
  if (id) openNoteEditor(id);
});

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
  // Recompute first. With "visited only" on, unmarking a place changes what
  // the filter selects, and everything below reads store.visible.
  store.refresh();
  // The map and the card both show visited state, so both are rebuilt.
  map.setData(store.visible);
  const selected = store.selected;
  if (selected) {
    detail.show(selected, {
      userAt: userPoint(),
      visited: account.isVisited(selected.id),
      canVisit: Boolean(account.user),
      note: account.noteFor(selected.id),
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
  // The card takes the bottom of the map when the sheet leaves it, and the
  // dock was floating exactly there. It goes with the sheet and comes back
  // with it; the search it holds is about the list, not about the one card
  // that is open.
  dock.dataset.away = String(off);
  paintDockLift();
}

// Above the breakpoint the sheet is a column, not an overlay, so it must never
// stay slid away just because a card happened to be open.
NARROW.addEventListener('change', (e) => {
  setRailOffscreen(e.matches && !panelEl.hidden);
  paintDockLift();
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
        canVisit: Boolean(account.user),
        note: account.noteFor(p.id),
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

  syncDock();
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
function typeSearch(value: string): void {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    store.setQuery(value);
    if (value.trim().length >= 2) map.fitTo(store.visible);
  }, 160);
}
dockSearchInput.addEventListener('input', () => typeSearch(dockSearchInput.value));

dockMuni.addEventListener('change', () => {
  store.setMunicipality(dockMuni.value || null);
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
          canVisit: Boolean(account.user),
          note: account.noteFor(selected.id),
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
  paintDock();
  renderGeo(geo.status);
  // The account panel's contents are built from strings in JS, not marked up
  // with data-i18n, so the pass above does not reach them: signed out and
  // switching language left the sign-in form in the language before it.
  renderAccount();
  // The note editor too, if it happens to be open.
  if (!noteDialog.hidden && noteFor) openNoteEditor(noteFor);

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
paintDock();
paintDockLift();
// Told once: every setData afterwards carries the marks with it.
map.setVisitedPredicate((id) => account.isVisited(id));
render();
// Also when a session is simply still valid. Somebody who signed up before
// this tip existed never performs a sign-in -- their cookie lasts two months --
// so hanging the tip off the sign-in alone would mean the people who most
// need pointing at the control are the only ones who never get pointed at it.
void account.load().then(() => showSavedHint());

/*
 * The tour, last of all, so it opens over a page that has already drawn. It
 * decides for itself whether anybody needs it.
 *
 * Nothing is focused on the way out, and that is the point. Handing focus to
 * the search box read well on a desktop -- the first step is about searching --
 * but on a phone focusing a text field summons the on-screen keyboard, so
 * pressing "start" traded the tour for a keyboard covering half the map. What
 * somebody wants at that moment is to see the thing they were just told about.
 * Focus falls back to the document, so a Tab from there starts at the skip
 * link, which is the top of the page.
 */
const intro = new Intro($('#intro'), $('.app'), i18n);
intro.openIfUnseen();

/**
 * The return trip from the confirmation link. The server redirects to
 * /?verified=1 or 0; this turns that into a sentence and then removes the
 * parameter, so a reload or a shared URL does not repeat the message.
 */
/*
 * Arrived by a reset link. The token comes out of the address bar and into
 * memory immediately: it is a key to the account, and leaving it in the URL
 * leaves it in the history, in a shared link and in whatever the browser syncs.
 */
{
  const token = new URLSearchParams(location.search).get('reset');
  if (token) {
    history.replaceState(null, '', location.pathname);
    account.resetToken = token;
    renderAccount();
    setAccountOpen(true);
  }
}

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
