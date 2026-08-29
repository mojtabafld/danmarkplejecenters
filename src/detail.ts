import { distanceKm } from './geolocate';
import type { I18n, TranslationKey } from './i18n';
import { icon, type IconName } from './icons';
import {
  appleMapsHref,
  formatPhone,
  googleMapsHref,
  ownershipDetailKey,
  ownershipGroup,
  prettyHost,
  telHref,
} from './format';
import type { Plejecenter } from './types';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The card that opens when a dot or a list row is chosen. */
export class DetailPanel {
  private lastFocus: HTMLElement | null = null;

  constructor(
    private root: HTMLElement,
    private body: HTMLElement,
    private foot: HTMLElement,
    private i18n: I18n,
    private onClose: () => void,
  ) {
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.panel__close')) this.onClose();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) {
        e.stopPropagation();
        this.onClose();
      }
    });
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
    this.root.hidden = false;

    // Entrance: set the "before" state, then release it on the next frame so
    // the transition actually runs. Under reduced motion the durations are 1ms,
    // so the content still lands — nothing is revealed by the animation alone.
    this.root.dataset.enter = 'pending';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        delete this.root.dataset.enter;
      });
    });

    this.root.querySelector<HTMLElement>('.panel__close')?.focus();
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.body.innerHTML = '';
    this.foot.innerHTML = '';
    this.lastFocus?.focus();
    this.lastFocus = null;
  }

  private markup(p: Plejecenter, userAt: { lat: number; lon: number } | null, note: string): string {
    const t = this.i18n.t.bind(this.i18n);
    const group = ownershipGroup(p);
    const parts: string[] = [];

    parts.push('<div class="facts">');

    // The address itself stays in Danish: it is a postal address, and a
    // translated one cannot be posted to or read out to a driver.
    let address =
      `${esc(p.street)}<br>${esc(p.postcode)} ${esc(p.city)}<br>` +
      `<span class="fact__value">${esc(t('filter.municipalitySuffix', { name: p.municipality }))}</span>`;

    if (userAt) {
      const km = distanceKm(userAt, p);
      const shown = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
      address += `<span class="fact__value fact__distance">${esc(t('panel.distance', { n: shown }))}</span>`;
    }

    parts.push(this.fact('pin', 'panel.address', address));
    parts.push(this.fact('building', 'panel.ownership', esc(t(ownershipDetailKey(p)))));

    if (p.homes) {
      parts.push(
        this.fact('bed', 'panel.capacity', esc(t('panel.capacityValue', { n: p.homes }))),
      );
    }

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

    parts.push('</div>');

    // A note the reader wrote outranks the register's own fields, so it sits
    // at the top of the card rather than under them.
    if (note) {
      parts.unshift(
        `<div class="note"><p class="note__label">${esc(t('note.label'))}</p>` +
          `<p class="note__body">${esc(note)}</p></div>`,
      );
    }

    return `<span class="sr-only" data-own="${group}"></span>` + parts.join('');
  }

  /**
   * The pinned foot. Kept out of the scrolling body on purpose: routing to the
   * place is the most common reason this card is open, and burying it under
   * the register's small print made it something you had to go looking for.
   */
  private actions(p: Plejecenter, canVisit: boolean, note: string): string {
    const t = this.i18n.t.bind(this.i18n);
    const parts: string[] = ['<div class="panel__actions">'];

    // Signed in, writing a note takes the wide primary slot: it is the thing
    // only this reader can do here, and everything else is a link outward.
    if (canVisit) {
      parts.push(
        `<button type="button" class="btn btn--primary btn--note" data-note="${esc(p.id)}">` +
          `${icon('pencil')}${esc(t(note ? 'note.edit' : 'note.add'))}</button>`,
      );
    }

    const link = (href: string, iconName: 'external' | 'navigation', label: string, extra: string): string =>
      `<a class="btn btn--secondary" href="${esc(href)}" target="_blank" rel="noopener noreferrer">` +
      `${icon(iconName)}${esc(label)}<span class="sr-only">${extra}</span></a>`;

    // The website joins the route buttons at the same size once the note has
    // the wide slot; on its own it keeps the width, so the row is never one
    // lonely button pretending to be a group.
    const row: string[] = [];
    if (p.web) {
      row.push(link(p.web, 'external', t('panel.visit'), esc(t('panel.visitFor', { name: p.name }))));
    }
    row.push(link(googleMapsHref(p), 'navigation', t('panel.google'), esc(t('panel.routeTo', { name: p.name }))));
    row.push(link(appleMapsHref(p), 'navigation', t('panel.apple'), esc(t('panel.routeTo', { name: p.name }))));

    parts.push(`<div class="nav-links">${row.join('')}</div>`);
    parts.push('</div>');
    return parts.join('');
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
    if (!canVisit) {
      slot.innerHTML = '';
      return;
    }
    const label = this.i18n.t(visited ? 'visit.unmark' : 'visit.mark');
    slot.innerHTML =
      `<button type="button" class="panel__visit" data-visit="${esc(p.id)}"` +
      ` aria-pressed="${visited}" aria-label="${esc(label)}" title="${esc(label)}">` +
      `${icon(visited ? 'bookmarkCheck' : 'bookmark')}</button>`;
  }

  /** Head is rendered separately so the title can stay above the scroll area. */
  renderHead(p: Plejecenter, head: HTMLElement): void {
    const group = ownershipGroup(p);
    const eyebrow = head.querySelector('.panel__eyebrow')!;
    eyebrow.setAttribute('data-own', group);
    eyebrow.textContent = this.i18n.t(`ownership.${group}` as TranslationKey);
    head.querySelector('.panel__title')!.textContent = p.name;
    head
      .querySelector('.panel__close')!
      .setAttribute('aria-label', this.i18n.t('panel.close', { name: p.name }));
  }
}
