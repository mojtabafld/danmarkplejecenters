import type { I18n } from './i18n';
import { icon, star } from './icons';
import { compare, ownershipGroup } from './format';
import type { Store } from './store';
import type { Plejecenter } from './types';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * How many rows go in on the first pass.
 *
 * The whole extract is 907 plejecentre in 98 municipality groups: 7647 DOM
 * nodes and 315KB of markup, which on a four-times-throttled CPU costs 523ms
 * to insert and lay out. All of it went in at startup, in one innerHTML, while
 * the map was trying to come up -- and nobody has scrolled to row 200 in the
 * first second of a visit.
 *
 * Enough to fill the tallest phone twice over, so the first scroll never
 * reaches the end of what has been rendered.
 */
const FIRST_ROWS = 60;

/** requestIdleCallback where it exists, a timer where it does not (Safari). */
const soon: (fn: () => void) => number =
  'requestIdleCallback' in window
    ? (fn) => (window as unknown as {
        requestIdleCallback: (f: () => void, o?: { timeout: number }) => number;
      }).requestIdleCallback(fn, { timeout: 1200 })
    : (fn) => window.setTimeout(fn, 200);

const cancelSoon: (id: number) => void =
  'cancelIdleCallback' in window
    ? (id) => (window as unknown as { cancelIdleCallback: (i: number) => void }).cancelIdleCallback(id)
    : (id) => window.clearTimeout(id);

/**
 * The result list is also the keyboard path to every marker: a map canvas
 * cannot be tabbed through, so each plejecenter gets a real <button> here.
 */
export class ResultList {
  /** The scheduled tail of a long list, so a new render can cancel it. */
  private tail: number | null = null;
  constructor(
    private root: HTMLElement,
    private store: Store,
    private i18n: I18n,
    private onPick: (p: Plejecenter) => void,
  ) {
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.result');
      if (!btn?.dataset.id) return;
      const p = this.store.visible.find((x) => x.id === btn.dataset.id);
      if (p) this.onPick(p);
    });
  }

  render(): void {
    const items = this.store.visible;

    // A render already in flight is answering a question nobody is asking any
    // more. Cancel it before anything else, or its rows land in the new list.
    if (this.tail !== null) {
      cancelSoon(this.tail);
      this.tail = null;
    }

    if (items.length === 0) {
      this.root.innerHTML = this.emptyState();
      this.root.querySelector('#clearFilters')?.addEventListener('click', () => {
        this.store.reset();
      });
      return;
    }

    // Grouped by municipality — the one differentiator that keeps a 148-row
    // list from reading as 148 identical rows while you scroll it.
    const groups = new Map<string, Plejecenter[]>();
    for (const p of items) {
      const g = groups.get(p.municipality) ?? [];
      g.push(p);
      groups.set(p.municipality, g);
    }

    /*
     * Built whole, inserted in two pieces: enough to fill the screen now, the
     * rest once the main thread has nothing better to do.
     *
     * Split on a group boundary rather than mid-municipality, so what is on
     * screen is always a run of complete groups -- a heading with three of its
     * eleven rows under it and the other eight arriving a moment later is worse
     * than waiting.
     */
    const first: string[] = [];
    const rest: string[] = [];
    let placed = 0;
    for (const [muni, rows] of [...groups].sort((a, b) => compare(a[0], b[0]))) {
      const into = placed < FIRST_ROWS ? first : rest;
      into.push(
        `<li><h3 class="results__group">${esc(muni)} ` +
          `<span class="sr-only">${esc(this.i18n.t('results.municipality'))}</span>` +
          ` ${esc(this.i18n.n(rows.length))}</h3><ul>`,
      );
      for (const p of rows) into.push(`<li>${this.row(p)}</li>`);
      into.push('</ul></li>');
      placed += rows.length;
    }

    this.root.innerHTML = `<ul>${first.join('')}</ul>`;
    if (rest.length > 0) {
      const list = this.root.querySelector('ul');
      this.tail = soon(() => {
        this.tail = null;
        list?.insertAdjacentHTML('beforeend', rest.join(''));
        // The selected row may be one of the ones that just arrived, and the
        // first sync could not have found it.
        this.syncSelection();
      });
    }
    this.syncSelection();
  }

  private row(p: Plejecenter): string {
    const group = ownershipGroup(p);
    const beds = p.homes
      ? `<span>${esc(this.i18n.t('result.homes', { n: p.homes }))}</span>`
      : '';

    // The score, only where there is one. A row reading "no ratings" 148 times
    // is a list about the absence of ratings rather than about plejecentre.
    const rating = this.store.ratingFor(p.id);
    const score = rating
      ? `<span class="result__rating">${star(true)}` +
        `<span class="result__score">${esc(this.i18n.n(rating.average))}</span>` +
        `<span class="sr-only">${esc(this.i18n.t('rating.outOf', { n: rating.average }))}, ` +
        `${esc(this.i18n.t('rating.count', { n: rating.count }))}</span></span>`
      : '';
    return (
      `<button type="button" class="result" data-id="${esc(p.id)}" data-own="${group}"` +
      ` aria-current="false">` +
      `<span class="result__mark"></span>` +
      `<span class="result__name">${esc(p.name)}</span>` +
      `<span class="result__meta"><span>${esc(p.street)}</span>` +
      `<span>${esc(p.city)}</span>${beds}${score}</span>` +
      `</button>`
    );
  }

  private emptyState(): string {
    const t = this.i18n.t.bind(this.i18n);
    const q = this.store.filters.query.trim();
    const muni = this.store.filters.municipality;
    const what = q
      ? muni
        ? t('empty.withQueryIn', { q, name: muni })
        : t('empty.withQuery', { q })
      : t('empty.noQuery');
    return (
      `<div class="empty">` +
      `<span class="empty__icon">${icon('slash')}</span>` +
      `<h3 class="empty__title">${esc(t('empty.title'))}</h3>` +
      `<p class="empty__body">${esc(what)} ${esc(t('empty.hint'))}</p>` +
      `<button type="button" class="btn btn--secondary" id="clearFilters">` +
      `${esc(t('empty.reset'))}</button>` +
      `</div>`
    );
  }

  /** Keep the list in step with a marker click, without a full re-render. */
  syncSelection(): void {
    const id = this.store.selectedId;
    for (const el of this.root.querySelectorAll<HTMLElement>('.result')) {
      el.setAttribute('aria-current', el.dataset.id === id ? 'true' : 'false');
    }
    if (!id) return;
    const active = this.root.querySelector<HTMLElement>(`.result[data-id="${CSS.escape(id)}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  }
}
