import type { I18n, TranslationKey } from './i18n';
import { KOMMUNE_COUNT, TOTAL_COUNT } from './regions';

const KEY = 'plejekort.intro';

/**
 * Bump when the tour changes enough to be worth showing again. Everyone who
 * has seen an older one sees the new one once; nobody sees the same one twice.
 */
const VERSION = '1';

/*
 * The three drawings.
 *
 * Not icons -- icons carry meaning next to a label, and these carry the whole
 * step on their own -- so they live here rather than in icons.ts, at a size
 * where a stroke can be a road and a rectangle can be a card. Every colour
 * comes from a class the stylesheet fills in, and every animation is declared
 * there too: this file only decides which drawing is on screen.
 *
 * The three glyph paths are the lucide map-pin, search and bookmark, drawn on
 * their own 24-unit grid and placed with a transform.
 */
const PIN = 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z';
const PIN_DOT = '<circle cx="12" cy="10" r="3"/>';
const LENS = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>';
const MARK = 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z';

const ART: Record<number, string> = {
  0: `<svg class="intro__svg" viewBox="0 0 160 120" fill="none" aria-hidden="true" focusable="false">
    <rect class="intro__plate" x="6" y="10" width="148" height="100" rx="16"/>
    <path class="intro__road" d="M6 84C40 84 40 50 78 50s44 26 76 14"/>
    <path class="intro__road intro__road--late" d="M50 110c0-22 22-24 34-40"/>
    <circle class="intro__spot" cx="34" cy="88" r="4"/>
    <circle class="intro__spot intro__spot--late" cx="126" cy="36" r="4"/>
    <g class="intro__pin" transform="translate(60 20) scale(1.7)">
      <path d="${PIN}"/>${PIN_DOT}
    </g>
  </svg>`,
  1: `<svg class="intro__svg" viewBox="0 0 160 120" fill="none" aria-hidden="true" focusable="false">
    <rect class="intro__plate" x="18" y="12" width="124" height="96" rx="14"/>
    <rect class="intro__line" x="34" y="32" width="60" height="8" rx="4"/>
    <rect class="intro__line intro__line--late" x="34" y="50" width="88" height="8" rx="4"/>
    <rect class="intro__line intro__line--later" x="34" y="68" width="46" height="8" rx="4"/>
    <g class="intro__lens" transform="translate(78 46) scale(2.1)">${LENS}</g>
  </svg>`,
  2: `<svg class="intro__svg" viewBox="0 0 160 120" fill="none" aria-hidden="true" focusable="false">
    <rect class="intro__plate" x="18" y="14" width="124" height="94" rx="14"/>
    <rect class="intro__line" x="34" y="60" width="76" height="8" rx="4"/>
    <rect class="intro__line intro__line--late" x="34" y="78" width="52" height="8" rx="4"/>
    <g class="intro__mark" transform="translate(58 4) scale(2.4)">
      <path d="${MARK}"/>
    </g>
  </svg>`,
};

const STEPS: { title: TranslationKey; body: TranslationKey }[] = [
  { title: 'intro.map.title', body: 'intro.map.body' },
  { title: 'intro.jobs.title', body: 'intro.jobs.body' },
  { title: 'intro.saved.title', body: 'intro.saved.body' },
];

/** Everything that can hold focus, in document order. */
const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * How far a finger travels before it is a swipe rather than a tap that wobbled.
 *
 * Comfortably past the ~10px slop a browser allows before it stops treating a
 * touch as a click, so the two gestures cannot both fire from one movement.
 */
const SWIPE_MIN = 45;

/**
 * The three-step tour, shown once.
 *
 * Once means once per person, not once per session: the seen-flag is written
 * the moment the tour opens, so closing the tab halfway through does not bring
 * it back. Somebody who has used the site for months has no flag either, which
 * is the point -- they see it a single time and never again.
 */
export class Intro {
  private step = 0;
  private lastFocus: HTMLElement | null = null;
  /** Where a one-finger gesture started, while it is still in progress. */
  private touch: { x: number; y: number } | null = null;
  /** When a swipe was last acted on, so the click it may spawn is ignored. */
  private swipedAt = 0;

  constructor(
    private root: HTMLElement,
    private app: HTMLElement,
    private i18n: I18n,
    private onClose?: () => void,
  ) {
    this.root.addEventListener('click', (e) => {
      // A swipe that happens to end on a button is not a press of it. Browsers
      // suppress the click once a touch has travelled far enough, but not all
      // of them agree on how far, and being wrong here skips a step.
      if (Date.now() - this.swipedAt < 500) return;
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-intro]')?.dataset.intro;
      if (act === 'next') this.advance();
      else if (act === 'skip') this.close();
    });

    this.root.addEventListener('keydown', (e) => this.onKey(e));

    /*
     * Swiping between the steps. A tour on a phone is a thing you flick
     * through, and the button was the only way onward.
     *
     * Only a decisively horizontal gesture counts. The overlay scrolls
     * vertically when the card is taller than the window -- landscape, or the
     * text size turned up -- and stealing that would put the buttons out of
     * reach again by another route. Both listeners are passive: neither calls
     * preventDefault, and saying so keeps the scroll off the main thread.
     */
    this.root.addEventListener(
      'touchstart',
      (e) => {
        // One finger only: two is a pinch or a stray palm, not a swipe.
        const t = e.touches.length === 1 ? e.touches[0] : null;
        this.touch = t ? { x: t.clientX, y: t.clientY } : null;
      },
      { passive: true },
    );

    this.root.addEventListener('touchcancel', () => { this.touch = null; }, { passive: true });

    this.root.addEventListener(
      'touchend',
      (e) => {
        const from = this.touch;
        const to = e.changedTouches[0];
        this.touch = null;
        if (!from || !to) return;

        const dx = to.clientX - from.x;
        const dy = to.clientY - from.y;
        if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;

        this.swipedAt = Date.now();
        // Onward follows the reading direction, exactly as the arrow keys do:
        // the card moves the way the page of a book moves, so in Persian the
        // next step is a drag to the right and everywhere else to the left.
        if (rtl() ? dx > 0 : dx < 0) this.advance();
        else this.back();
      },
      { passive: true },
    );

    // The tour is built in script, not from data-i18n attributes, so it has to
    // be told when the language changes -- same as the account panel.
    this.i18n.onChange(() => {
      if (!this.root.hidden) this.render();
    });
  }

  /** True the first time somebody arrives, and once more after a VERSION bump. */
  private unseen(): boolean {
    // Persian only. The tour is addressed to the people this site was built
    // for, and Persian is what it opens in; a Danish reader gets the map
    // straight away rather than a tour written past them. The Danish and
    // English strings stay in the dictionary -- it is keyed off Danish -- so
    // widening this is one condition, not a translation job.
    if (this.i18n.locale !== 'fa') return false;
    try {
      return localStorage.getItem(KEY) !== VERSION;
    } catch {
      // Private mode: no way to remember it was shown, and a tour that opens on
      // every single visit is worse than one that never opens.
      return false;
    }
  }

  openIfUnseen(): void {
    if (this.unseen()) this.open();
  }

  open(): void {
    try {
      localStorage.setItem(KEY, VERSION);
    } catch {
      /* nothing to do: unseen() already refused this case */
    }
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.step = 0;
    this.render();
    this.root.hidden = false;
    // Nothing behind the tour is reachable while it is up -- not by Tab, not by
    // a screen reader's own cursor, which aria-modal alone does not stop in
    // every reader.
    this.app.inert = true;
    this.root.querySelector<HTMLElement>('.intro__card')?.focus();
  }

  private advance(): void {
    if (this.step >= STEPS.length - 1) {
      this.close();
      return;
    }
    this.step += 1;
    this.render();
  }

  private back(): void {
    if (this.step === 0) return;
    this.step -= 1;
    this.render();
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.app.inert = false;
    this.lastFocus?.focus();
    this.lastFocus = null;
    this.onClose?.();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
      return;
    }

    // Arrow keys read as "onward" and "back" along the reading direction, so
    // they swap in Persian rather than pointing the wrong way.
    if (e.key === (rtl() ? 'ArrowLeft' : 'ArrowRight')) {
      e.preventDefault();
      this.advance();
      return;
    }
    if (e.key === (rtl() ? 'ArrowRight' : 'ArrowLeft')) {
      e.preventDefault();
      this.back();
      return;
    }

    if (e.key !== 'Tab') return;
    const stops = [...this.root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null,
    );
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const on = document.activeElement;
    if (e.shiftKey && (on === first || on === this.root.querySelector('.intro__card'))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && on === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private render(): void {
    const t = this.i18n.t.bind(this.i18n);
    const { title, body } = STEPS[this.step];
    const last = this.step === STEPS.length - 1;

    this.root.querySelector('.intro__card')!.setAttribute('aria-label', t('intro.label'));

    // Replacing the markup is what restarts the drawing's animation. Assigning
    // the same nodes new attributes would leave the running animation alone.
    const art = this.root.querySelector('#introArt')!;
    art.innerHTML = ART[this.step];

    const text = this.root.querySelector('#introText')!;
    text.innerHTML =
      `<h2 class="intro__title" id="introTitle">${esc(t(title))}</h2>` +
      // The counts come from the data. A step that does not mention them is
      // unaffected -- an unused placeholder is simply never substituted.
      `<p class="intro__body">${esc(t(body, { n: this.i18n.n(TOTAL_COUNT), k: this.i18n.n(KOMMUNE_COUNT) }))}</p>`;

    this.root.querySelector('#introDots')!.innerHTML = STEPS.map(
      (_, i) => `<span class="intro__dot"${i === this.step ? ' data-on="true"' : ''}></span>`,
    ).join('');

    this.root.querySelector('#introProgress')!.textContent = t('intro.progress', {
      n: this.step + 1,
      total: STEPS.length,
    });

    this.root.querySelector('[data-intro="next"]')!.textContent = t(last ? 'intro.start' : 'intro.next');
    this.root.querySelector('[data-intro="skip"]')!.textContent = t('intro.skip');
    this.root.dataset.step = String(this.step);
  }
}

/** The reading direction the document is currently in. */
const rtl = (): boolean => document.documentElement.dir === 'rtl';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
