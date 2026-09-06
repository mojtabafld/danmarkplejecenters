import { distanceKm } from './geolocate';
import type { I18n, TranslationKey } from './i18n';
import { icon, type IconName } from './icons';
import { MAP_APPS } from './mapapps';
import {
  formatPhone,
  jobsHref,
  ownershipDetailKey,
  ownershipGroup,
  prettyHost,
  telHref,
} from './format';
import type { Plejecenter } from './types';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Below the breakpoint the card is a bottom sheet, and only then does it slide. */
const SHEET = window.matchMedia('(max-width: 60rem)');
const STILL = window.matchMedia('(prefers-reduced-motion: reduce)');

/** The card that opens when a dot or a list row is chosen. */
/**
 * How big the name at the top of the panel is allowed to be.
 *
 * Plejecentre are not named to fit a heading. Half of them are around twenty
 * characters -- "Plejecenter Sølund" -- but the tail is long and
 * administrative: "Den selvejende institution Plejehjemmet OK-Fonden
 * Hornbaekhave" is 61, and the longest in the register is 66. At the full 22px
 * those wrap to five and six lines and push the address, the mark and the job
 * link down the panel, so it opens on a name and little else.
 *
 * Two things make a name long, and they need separate answers. The whole
 * string being long is the obvious one. The other is one enormous compound --
 * "Håndværkerforeningens" is a single 21-character word, in a name of only 31
 * -- and that is the worse case: a word wider than the column cannot wrap, so
 * it is broken mid-syllable wherever the edge falls. Stepping on total length
 * alone leaves exactly those names broken, which is why the longest word is
 * measured too.
 *
 * Three steps rather than a continuous scale, because a heading that is a
 * slightly different size on every place reads as an accident, where three
 * sizes read as a decision. The thresholds are where the shipped names sit:
 * three quarters are 24 or shorter and keep the full size, and the word
 * thresholds of 16 and 20 sit at the 95th and 99.5th percentile of the longest
 * word, so they catch the compounds and nothing else.
 *
 * Measured in characters, which is a good enough proxy here -- these are all
 * Latin-script Danish names in one font, so the widest and narrowest twenty
 * characters differ by far less than one step of the scale.
 */
function titleStep(name: string): 'x' | 'l' | 'm' {
  // Split on the places a line can already break, so a hyphenated pair counts
  // as its two halves rather than as one unbreakable run.
  const longest = Math.max(...name.split(/[\s/-]+/).map((w) => w.length));
  if (name.length > 40 || longest >= 20) return 'm';
  if (name.length > 24 || longest >= 16) return 'l';
  return 'x';
}

export class DetailPanel {
  private lastFocus: HTMLElement | null = null;
  /** Timer that puts the copy tile's label back. */
  private copyReset = 0;
  /** Set while the card is animating out, so a second hide() does not stack. */
  private leaving: number | null = null;

  constructor(
    private root: HTMLElement,
    private body: HTMLElement,
    private foot: HTMLElement,
    private i18n: I18n,
    private onClose: () => void,
    /**
     * Called whenever the card settles or is being dragged.
     *
     * The dock floats above whatever sheet is at the bottom of the map, and
     * this card is that sheet whenever it is open. A translate fires no
     * ResizeObserver, so without this the dock has no way to know the card
     * moved under it.
     */
    private onMove: () => void = () => {},
  ) {
    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('.panel__close')) {
        this.onClose();
        return;
      }
      if (el.closest('.addr__button')) {
        this.setMapMenu(this.root.querySelector<HTMLElement>('#addrMenu')?.hidden ?? false);
        return;
      }
      const copyBtn = el.closest<HTMLElement>('[data-copy]');
      if (copyBtn) {
        void this.copyAddress(copyBtn);
        return;
      }
      // Any other press inside the card closes the balloon, including one on a
      // link inside it -- that link is on its way to another application and
      // the card should not be holding an open menu when it comes back.
      this.setMapMenu(false);
    });

    /*
     * And a press anywhere else on the page. On `pointerdown` rather than
     * `click`, so the balloon is gone by the time a drag of the map begins
     * rather than after it -- the same reason the dock's menus use it.
     */
    document.addEventListener('pointerdown', (e) => {
      if (!e.composedPath().includes(this.root)) this.setMapMenu(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.root.hidden) return;
      e.stopPropagation();
      // The balloon first. Escape closes the innermost thing that is open, so
      // a reader who opened the map menu by mistake does not lose the card too.
      const menu = this.root.querySelector<HTMLElement>('#addrMenu');
      if (menu && !menu.hidden) {
        this.setMapMenu(false);
        this.root.querySelector<HTMLElement>('.addr__button')?.focus();
        return;
      }
      this.onClose();
    });
  }

  /**
   * Open or close the balloon at the address.
   *
   * Looked up each time rather than held, because the card's body is rebuilt
   * from markup on every open and any reference kept here would be to an
   * element that is no longer in the document.
   */
  private setMapMenu(open: boolean): void {
    const menu = this.root.querySelector<HTMLElement>('#addrMenu');
    const button = this.root.querySelector<HTMLElement>('.addr__button');
    if (!menu || !button) return;
    if (menu.hidden === !open) return;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    // Into the balloon, so a keyboard lands on the first application rather
    // than tabbing through the rest of the card to reach it.
    if (open) menu.querySelector<HTMLElement>('.mapmenu__app')?.focus();
  }

  /**
   * Put the address on the clipboard, and say so on the tile itself.
   *
   * The confirmation goes where the finger already is rather than in a toast
   * somewhere else on the screen, and it goes back to "Kopiér" after a moment
   * so the control does not end up permanently claiming a thing it did once.
   *
   * The failure path is not decorative. The clipboard API is unavailable
   * outside a secure context and can be refused by permission, and a button
   * that silently does nothing is worse than one that says it could not: the
   * reader would paste whatever was on the clipboard before.
   */
  private async copyAddress(button: HTMLElement): Promise<void> {
    const text = button.dataset.copy ?? '';
    const label = button.querySelector<HTMLElement>('.mapmenu__name');
    if (!text || !label) return;

    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }

    button.dataset.copied = String(ok);
    label.textContent = this.i18n.t(ok ? 'panel.copied' : 'panel.copyFailed');
    // Announced as well as shown: the label changing under a finger is not an
    // event a screen reader reports on its own.
    button.setAttribute('aria-live', 'polite');

    window.clearTimeout(this.copyReset);
    this.copyReset = window.setTimeout(() => {
      // The card may have been re-rendered or closed in the meantime, in which
      // case this element is no longer the one on screen and touching it is
      // harmless but pointless.
      if (!button.isConnected) return;
      delete button.dataset.copied;
      label.textContent = this.i18n.t('panel.copy');
    }, 1800);
  }

  private fact(iconName: IconName, labelKey: TranslationKey, value: string): string {
    return (
      `<div class="fact"><span class="fact__icon">${icon(iconName)}</span>` +
      `<span><span class="fact__label">${esc(this.i18n.t(labelKey))}</span>` +
      `<span class="fact__value">${value}</span></span></div>`
    );
  }

  show(
    p: Plejecenter,
    opts: {
      restoreFocusTo?: HTMLElement | null;
      userAt?: { lat: number; lon: number } | null;
      visited?: boolean;
      canVisit?: boolean;
      note?: string;
    } = {},
  ): void {
    this.lastFocus = opts.restoreFocusTo ?? null;
    this.body.innerHTML = this.markup(p, opts.userAt ?? null, opts.note ?? '');
    this.foot.innerHTML = this.actions(p, opts.canVisit ?? false, opts.note ?? '');
    this.renderVisit(p, opts.visited ?? false, opts.canVisit ?? false);
    // A card opening while the last one is still leaving cancels the exit:
    // otherwise the timer below would hide the new one.
    if (this.leaving !== null) {
      window.clearTimeout(this.leaving);
      this.leaving = null;
    }
    delete this.root.dataset.leave;
    this.root.style.translate = '';
    this.root.hidden = false;

    // Entrance: set the "before" state, then release it on the next frame so
    // the transition actually runs. Under reduced motion the durations are 1ms,
    // so the content still lands — nothing is revealed by the animation alone.
    this.root.dataset.enter = 'pending';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        delete this.root.dataset.enter;
        // The card is at its full height the moment it arrives, so anything
        // positioned against it -- the dock -- can measure it now.
        this.onMove();
      });
    });

    this.root.querySelector<HTMLElement>('.panel__close')?.focus();
  }

  /**
   * Put the card away, sliding it out the way it came in.
   *
   * The card stays in the DOM until the movement has run, which is the only
   * way an exit can be animated at all -- `hidden` is instant. Focus goes back
   * immediately rather than at the end, because a card on its way out should
   * not be holding the caret.
   *
   * The timer is a fallback rather than a nicety: `transitionend` does not
   * fire if the property never changes -- a card already at its resting
   * translate, a browser that skipped the frame -- and without it the card
   * would sit there un-hidden for good.
   */
  hide(): void {
    if (this.root.hidden || this.leaving !== null) return;

    this.lastFocus?.focus();
    this.lastFocus = null;

    if (!SHEET.matches || STILL.matches) {
      this.finishHide();
      return;
    }

    this.root.dataset.leave = 'true';
    this.root.style.translate = '';
    this.leaving = window.setTimeout(() => this.finishHide(), 420);
  }

  private finishHide(): void {
    if (this.leaving !== null) {
      window.clearTimeout(this.leaving);
      this.leaving = null;
    }
    delete this.root.dataset.leave;
    this.root.style.translate = '';
    this.root.hidden = true;
    this.body.innerHTML = '';
    this.foot.innerHTML = '';
    // The card is gone; whatever was floating above it belongs to the sheet
    // underneath again.
    this.onMove();
  }

  private markup(p: Plejecenter, userAt: { lat: number; lon: number } | null, note: string): string {
    const t = this.i18n.t.bind(this.i18n);
    const group = ownershipGroup(p);
    const parts: string[] = [];

    parts.push('<div class="facts">');

    // The address itself stays in Danish: it is a postal address, and a
    // translated one cannot be posted to or read out to a driver.
    // The kommune is not repeated here: it is a chip at the top of the card
    // now, beside the operator.
    let address = `${esc(p.street)}<br>${esc(p.postcode)} ${esc(p.city)}`;
    /*
     * The address is the control that hands itself to a map application.
     *
     * A button rather than a link, because pressing it does not go anywhere --
     * it asks which of two places to go. The two real links are inside the
     * balloon, and each carries the address it opens, so a long press or a
     * middle click on either behaves the way a link should.
     *
     * This replaces two buttons pinned to the bottom of the card. They were
     * the last row of a footer that also holds the website and the note, and
     * they said "Google Maps" and "Apple Maps" without saying what for; the
     * address saying it about itself is shorter and points at the thing it
     * acts on.
     */
    const apps = MAP_APPS.map(
      (app) =>
        `<a class="mapmenu__app" data-app="${app.id}" href="${esc(app.href(p))}"` +
        ` target="_blank" rel="noopener noreferrer">` +
        `<span class="mapmenu__mark">${app.mark}</span>` +
        `<span class="mapmenu__name">${esc(t(app.label))}</span>` +
        `<span class="sr-only"> ${esc(t('panel.routeTo', { name: p.name }))}</span></a>`,
    ).join('');
    /*
     * And a third tile that does not leave the page.
     *
     * Copying is the thing people do with an address that they are not
     * navigating to right now -- pasting it into an application form, or into
     * a message to somebody. A button rather than a link, because it goes
     * nowhere; one line rather than two, because that is what pastes into a
     * field.
     */
    const oneLine = `${p.street}, ${p.postcode} ${p.city}`;
    const copy =
      `<button type="button" class="mapmenu__app" data-copy="${esc(oneLine)}">` +
      `<span class="mapmenu__mark mapmenu__mark--action">${icon('copy')}</span>` +
      `<span class="mapmenu__name">${esc(t('panel.copy'))}</span></button>`;

    address =
      `<span class="addr">` +
      `<button type="button" class="addr__button" id="addrButton"` +
      /*
       * Danish, and laid out left to right, said explicitly.
       *
       * A Danish postal address in a Persian paragraph is a run of Latin text
       * and digits inside right-to-left, and the bidi algorithm reorders it:
       * "2200 København N" rendered as "København N 2200", which is not an
       * address anybody can use. The phone, the e-mail and the website already
       * carry dir="ltr" for the same reason; this line had been getting away
       * without it.
       */
      ` dir="ltr" lang="da"` +
      ` aria-expanded="false" aria-haspopup="dialog"` +
      ` aria-label="${esc(t('panel.chooseMap'))}">${address}</button>` +
      `<span class="mapmenu" id="addrMenu" hidden role="dialog"` +
      ` aria-label="${esc(t('panel.chooseMap'))}">${apps}${copy}</span>` +
      `</span>`;

    if (userAt) {
      const km = distanceKm(userAt, p);
      const shown = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
      address += `<span class="fact__value fact__distance">${esc(t('panel.distance', { n: shown }))}</span>`;
    }

    parts.push(this.fact('pin', 'panel.address', address));
    parts.push(this.fact('building', 'panel.ownership', esc(t(ownershipDetailKey(p)))));

    if (p.phone) {
      parts.push(
        this.fact(
          'phone',
          'panel.phone',
          // The number is dialled, so it is never localised into Persian digits.
          `<a href="${esc(telHref(p.phone))}" dir="ltr">${esc(formatPhone(p.phone))}</a>`,
        ),
      );
    }

    if (p.email) {
      parts.push(
        this.fact('mail', 'panel.email', `<a href="mailto:${esc(p.email)}" dir="ltr">${esc(p.email)}</a>`),
      );
    }

    if (p.web) {
      parts.push(
        this.fact(
          'globe',
          'panel.website',
          `<a href="${esc(p.web)}" target="_blank" rel="noopener noreferrer" dir="ltr">` +
            `${esc(prettyHost(p.web))}</a>`,
        ),
      );
    }

    /*
     * The vacancies, under the centre's own website.
     *
     * A row like the ones above it and styled like their links, but with no
     * label: the rows above pair a label with a value, and this one is a
     * sentence. "Ledige stillinger: Søg job på dette center" says the same
     * thing twice. The search icon fills the column the globe and the envelope
     * use, so the row lines up with them without a word of its own.
     *
     * And no "for <name>" hidden on the end either: the link sits inside a card
     * whose heading is that name, so a screen reader has already said it.
     */
    parts.push(
      `<div class="fact"><span class="fact__icon">${icon('search')}</span>` +
        `<span><span class="fact__value">` +
        `<a href="${esc(jobsHref(p))}" target="_blank" rel="noopener noreferrer">` +
        `${esc(t('jobs.search'))}` +
        `</a></span></span></div>`,
    );

    parts.push('</div>');

    // A note the reader wrote comes first: it is what they already know about
    // this place, and it outranks the register's own fields.
    if (note) {
      parts.unshift(
        `<div class="note"><p class="note__label">${esc(t('note.label'))}</p>` +
          `<p class="note__body">${esc(note)}</p></div>`,
      );
    }

    // The ratings arrive over the network, so the card leaves them a home and
    // ReviewSection fills it in. Opening a card must not wait on a request.
    parts.push('<div class="rv__host" id="reviewHost"></div>');

    return `<span class="sr-only" data-own="${group}"></span>` + parts.join('');
  }

  /**
   * The pinned foot. Kept out of the scrolling body on purpose: routing to the
   * place is the most common reason this card is open, and burying it under
   * the register's small print made it something you had to go looking for.
   */
  private actions(p: Plejecenter, canVisit: boolean, note: string): string {
    const t = this.i18n.t.bind(this.i18n);

    // One row: what you do with this plejecenter -- write something about it,
    // or read what it says about itself. Both buttons look the same because
    // neither outranks the other.
    const top: string[] = [];
    if (canVisit) {
      top.push(
        `<button type="button" class="btn btn--primary" data-note="${esc(p.id)}">` +
          `${icon('pencil')}${esc(t(note ? 'note.edit' : 'note.add'))}</button>`,
      );
    }
    if (p.web) {
      top.push(
        `<a class="btn btn--primary" href="${esc(p.web)}" target="_blank" rel="noopener noreferrer">` +
          `${icon('external')}${esc(t('panel.visit'))}` +
          `<span class="sr-only"> ${esc(t('panel.visitFor', { name: p.name }))}</span></a>`,
      );
    }

    // No route buttons down here any more. Handing the address to a map
    // application is something you do TO the address, so it is offered at the
    // address -- see the balloon in markup() above.
    return (
      '<div class="panel__actions">' +
      (top.length ? `<div class="nav-links">${top.join('')}</div>` : '') +
      '</div>'
    );
  }

  /**
   * The mark, beside the name it belongs to.
   *
   * Icon only, so it takes its whole name from aria-label, and the two states
   * differ by shape -- an open bookmark against a bookmark with a tick -- not
   * only by colour. aria-pressed is what tells a screen reader which it is.
   */
  private renderVisit(p: Plejecenter, visited: boolean, canVisit: boolean): void {
    const slot = this.root.querySelector('#panelVisitSlot');
    if (!slot) return;
    // Shown whether or not anybody is signed in. Hiding it made saving a place
    // invisible to exactly the people who had not discovered accounts yet;
    // signed out it invites a sign-in instead, which is the honest prompt.
    const label = this.i18n.t(
      canVisit ? (visited ? 'visit.unmark' : 'visit.mark') : 'visit.signInFirst',
    );
    slot.innerHTML =
      `<button type="button" class="panel__visit" data-visit="${esc(p.id)}"` +
      (canVisit ? ` aria-pressed="${visited}"` : '') +
      ` aria-label="${esc(label)}" title="${esc(label)}">` +
      `${icon(canVisit && visited ? 'bookmarkCheck' : 'bookmark')}</button>`;
  }

  /**
   * Head is rendered separately so the title can stay above the scroll area.
   *
   * The job search sits here, under the name, rather than in the body: it is
   * about this centre as a place to work, which is the same register of
   * information as the name itself, and up here it survives scrolling.
   */
  renderHead(p: Plejecenter, head: HTMLElement): void {
    const group = ownershipGroup(p);
    const eyebrow = head.querySelector('.panel__eyebrow')!;
    eyebrow.setAttribute('data-own', group);
    eyebrow.textContent = this.i18n.t(`ownership.${group}` as TranslationKey);

    // The kommune, up here with the operator rather than as the last line of
    // the address. It is what a reader is choosing between when they are
    // choosing where to work, so it belongs where they read the name.
    const muni = head.querySelector<HTMLElement>('.panel__eyebrow--muni');
    if (muni) {
      muni.textContent = p.municipality
        ? this.i18n.t('panel.municipalityLine', { name: p.municipality })
        : '';
    }
    const title = head.querySelector<HTMLElement>('.panel__title')!;
    title.textContent = p.name;
    title.dataset.len = titleStep(p.name);
    head
      .querySelector('.panel__close')!
      .setAttribute('aria-label', this.i18n.t('panel.close', { name: p.name }));

  }
}
