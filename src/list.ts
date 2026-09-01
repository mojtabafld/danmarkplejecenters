import type { I18n } from './i18n';
import { icon, star } from './icons';
import { compare, ownershipGroup } from './format';
import type { Store } from './store';
import type { Plejecenter } from './types';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The result list is also the keyboard path to every marker: a map canvas
 * cannot be tabbed through, so each plejecenter gets a real <button> here.
 */
export class ResultList {
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

    const html: string[] = [];
    for (const [muni, rows] of [...groups].sort((a, b) => compare(a[0], b[0]))) {
      html.push(
        `<li><h3 class="results__group">${esc(muni)} ` +
          `<span class="sr-only">${esc(this.i18n.t('results.municipality'))}</span>` +
          ` ${esc(this.i18n.n(rows.length))}</h3><ul>`,
      );
      for (const p of rows) html.push(`<li>${this.row(p)}</li>`);
      html.push('</ul></li>');
    }
    this.root.innerHTML = `<ul>${html.join('')}</ul>`;
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
