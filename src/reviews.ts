/**
 * Ratings and reviews inside the detail card.
 *
 * The section is fetched rather than rendered with the card, because the card
 * opens from data already in the browser and this needs a round trip. Opening
 * a card must not wait on the network, so the section renders its heading and
 * a quiet placeholder first and fills in when the reply lands.
 *
 * Two things are deliberately different from the rest of this app:
 *
 *   - The star control is five real radio inputs. A row of buttons would need
 *     roving tabindex, arrow-key handling and an ARIA radiogroup to match what
 *     the browser already does for free -- and would still be worse with a
 *     screen reader. The stars are drawn by CSS on top of the inputs.
 *   - Everybody can read the ratings, signed in or not. A score nobody can see
 *     without an account is not a score.
 */
import type { I18n } from './i18n';
import { icon, star } from './icons';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type OwnReview = { stars: number; body: string; status: string };

export type PlaceReviews = {
  count: number;
  average: number | null;
  spread: [number, number, number, number, number];
  reviews: Array<{ id: string; stars: number; body: string; at: string }>;
  mine: OwnReview | null;
};

/** Why somebody cannot rate right now, which decides what the section offers. */
export type Gate = 'ok' | 'signin' | 'unverified';

type Ctx = {
  i18n: I18n;
  /** Where the sign-in prompt leads. */
  onSignIn(): void;
  /** Called after a successful save, so the map's average can catch up. */
  onChanged(placeId: string, data: PlaceReviews): void;
  gate(): Gate;
  announce(message: string): void;
};

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A row of five stars, as many solid as the score rounds to. */
function starRow(value: number, cls: string): string {
  let out = `<span class="${cls}">`;
  for (let i = 1; i <= 5; i++) out += star(i <= Math.round(value));
  return out + '</span>';
}

export class ReviewSection {
  /** Which place the host element is currently showing, so a late reply for a
   * card the reader has already left is dropped rather than painted. */
  private showing: string | null = null;
  private host: HTMLElement | null = null;
  private data: PlaceReviews | null = null;
  private busy = false;

  constructor(private ctx: Ctx) {}

  /** Point the section at one plejecentre. Safe to call on every card open. */
  open(host: HTMLElement, placeId: string): void {
    this.host = host;
    this.showing = placeId;
    this.data = null;
    host.innerHTML = this.frame(`<p class="rv__quiet">${esc(this.t('rating.none'))}</p>`);
    void this.load(placeId);
  }

  close(): void {
    this.showing = null;
    this.host = null;
    this.data = null;
  }

  /** Re-render in place, for a locale change or a sign-in while the card is open. */
  refresh(): void {
    if (this.host && this.data) this.paint(this.data);
  }

  private t(key: Parameters<I18n['t']>[0], params?: Record<string, string | number>): string {
    return this.ctx.i18n.t(key, params);
  }

  private async load(placeId: string): Promise<void> {
    try {
      const res = await call('GET', `/api/reviews/${encodeURIComponent(placeId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as PlaceReviews;
      // The reader may have moved on while this was in flight.
      if (this.showing !== placeId) return;
      this.data = data;
      this.paint(data);
    } catch {
      /* Offline is not an error worth a banner here: the card still works. */
    }
  }

  private frame(inner: string): string {
    return (
      `<section class="rv" aria-labelledby="rvTitle">` +
      `<h3 class="rv__title" id="rvTitle">${esc(this.t('rating.title'))}</h3>` +
      inner +
      `</section>`
    );
  }

  private paint(d: PlaceReviews): void {
    const host = this.host;
    if (!host) return;
    host.innerHTML = this.frame(this.summary(d) + this.own(d) + this.comments(d));
    this.wire();
  }

  private summary(d: PlaceReviews): string {
    const n = this.ctx.i18n.n.bind(this.ctx.i18n);
    if (!d.count || d.average === null) {
      return `<p class="rv__quiet">${esc(this.t('rating.none'))}</p>`;
    }

    // The spread is not decoration. An average of three from two people who
    // said one and five is a different fact from three from six who all said
    // three, and only the spread tells them apart.
    let bars = '<ul class="rv__spread">';
    for (let s = 5; s >= 1; s--) {
      const count = d.spread[s - 1];
      const pct = d.count ? Math.round((count / d.count) * 100) : 0;
      bars +=
        `<li class="rv__spreadRow">` +
        `<span class="rv__spreadStar">${n(s)}</span>` +
        `<span class="rv__bar"><span class="rv__barFill" style="inline-size:${pct}%"></span></span>` +
        `<span class="rv__spreadN">${n(count)}</span>` +
        `<span class="sr-only">${esc(this.t('rating.spread', { stars: n(s), n: count }))}</span>` +
        `</li>`;
    }
    bars += '</ul>';

    return (
      `<div class="rv__summary">` +
      `<p class="rv__score">${n(d.average)}</p>` +
      `<div class="rv__scoreSide">` +
      // One image with one label, rather than five graphics a screen reader
      // would read out one at a time.
      `<span class="rv__stars" role="img" aria-label="${esc(this.t('rating.outOf', { n: d.average }))}">` +
      starRow(d.average, 'rv__starsInner') +
      `</span>` +
      `<p class="rv__count">${esc(this.t('rating.count', { n: d.count }))}</p>` +
      `</div></div>` +
      bars
    );
  }

  private own(d: PlaceReviews): string {
    const gate = this.ctx.gate();
    if (gate === 'signin') {
      return (
        `<div class="rv__gate"><button type="button" class="btn btn--secondary rv__signin">` +
        `${icon('user')}${esc(this.t('rating.signIn'))}</button></div>`
      );
    }
    if (gate === 'unverified') {
      return `<p class="rv__quiet rv__gate">${esc(this.t('rating.unverified'))}</p>`;
    }

    const mine = d.mine;
    const picked = mine?.stars ?? 0;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars +=
        `<label class="rv__pick">` +
        `<input type="radio" name="rvStars" value="${i}" class="sr-only rv__radio"` +
        `${i === picked ? ' checked' : ''}>` +
        `<span class="rv__pickMark" aria-hidden="true">${star(true)}</span>` +
        `<span class="sr-only">${esc(this.t('rating.pick', { n: i }))}</span>` +
        `</label>`;
    }

    // The state of a review that has already been sent. "Rejected" is said
    // plainly rather than hidden: somebody who wrote something deserves to
    // know it was not published, and that their rating still counted.
    let state = '';
    if (mine && mine.body) {
      const key =
        mine.status === 'approved'
          ? 'rating.approved'
          : mine.status === 'rejected'
            ? 'rating.rejected'
            : 'rating.pending';
      state = `<p class="rv__state" data-state="${esc(mine.status)}">${esc(this.t(key))}</p>`;
    }

    return (
      `<form class="rv__form" novalidate>` +
      `<fieldset class="rv__fieldset">` +
      `<legend class="rv__legend">${esc(this.t('rating.yours'))}</legend>` +
      `<span class="sr-only">${esc(this.t('rating.pickLegend'))}</span>` +
      `<div class="rv__picks">${stars}</div>` +
      `</fieldset>` +
      `<label class="rv__label" for="rvBody">${esc(this.t('rating.comment'))}</label>` +
      `<textarea class="rv__body" id="rvBody" rows="3" maxlength="1500" ` +
      `placeholder="${esc(this.t('rating.placeholder'))}">${esc(mine?.body ?? '')}</textarea>` +
      `<p class="rv__hint">${esc(this.t('rating.commentHint'))}</p>` +
      state +
      `<div class="rv__actions">` +
      `<button type="submit" class="btn btn--primary rv__save">${esc(this.t('rating.save'))}</button>` +
      (mine
        ? `<button type="button" class="btn btn--ghost rv__remove">${esc(this.t('rating.remove'))}</button>`
        : '') +
      `</div>` +
      `<p class="rv__msg" role="status"></p>` +
      `</form>`
    );
  }

  private comments(d: PlaceReviews): string {
    const fmt = new Intl.DateTimeFormat(this.ctx.i18n.locale, { dateStyle: 'long' });
    let out = `<h4 class="rv__subtitle">${esc(this.t('rating.comments'))}</h4>`;
    if (!d.reviews.length) return out + `<p class="rv__quiet">${esc(this.t('rating.noComments'))}</p>`;

    out += '<ol class="rv__list">';
    for (const r of d.reviews) {
      // Reviews carry no name. Attribution would mean either publishing part
      // of an address or inventing a handle, and neither adds anything a date
      // and a score do not already say.
      out +=
        `<li class="rv__item">` +
        `<p class="rv__itemHead">` +
        `<span class="rv__stars rv__stars--sm" role="img" ` +
        `aria-label="${esc(this.t('rating.outOf', { n: r.stars }))}">` +
        starRow(r.stars, 'rv__starsInner') +
        `</span>` +
        `<time class="rv__when" datetime="${esc(r.at)}">${esc(fmt.format(new Date(r.at)))}</time>` +
        `</p>` +
        `<p class="rv__text">${esc(r.body)}</p>` +
        `</li>`;
    }
    return out + '</ol>';
  }

  private wire(): void {
    const host = this.host;
    if (!host) return;

    host.querySelector<HTMLButtonElement>('.rv__signin')?.addEventListener('click', () => {
      this.ctx.onSignIn();
    });

    const form = host.querySelector<HTMLFormElement>('.rv__form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.save();
    });

    host.querySelector<HTMLButtonElement>('.rv__remove')?.addEventListener('click', () => {
      void this.remove();
    });
  }

  private message(text: string, bad = false): void {
    const el = this.host?.querySelector<HTMLElement>('.rv__msg');
    if (!el) return;
    el.textContent = text;
    el.dataset.bad = String(bad);
    // Said out loud as well as shown: the card is long, and the line that
    // changed may be off-screen for somebody who submitted from the keyboard.
    this.ctx.announce(text);
  }

  private async save(): Promise<void> {
    const host = this.host;
    const placeId = this.showing;
    if (!host || !placeId || this.busy) return;

    const picked = host.querySelector<HTMLInputElement>('.rv__radio:checked');
    if (!picked) {
      this.message(this.t('rating.needStars'), true);
      host.querySelector<HTMLInputElement>('.rv__radio')?.focus();
      return;
    }
    const body = host.querySelector<HTMLTextAreaElement>('.rv__body')?.value ?? '';

    this.busy = true;
    const save = host.querySelector<HTMLButtonElement>('.rv__save');
    if (save) save.disabled = true;
    this.message(this.t('rating.saving'));

    try {
      const res = await call('PUT', `/api/reviews/${encodeURIComponent(placeId)}`, {
        stars: Number(picked.value),
        body,
      });
      if (!res.ok) {
        this.message(this.t('rating.failed'), true);
        return;
      }
      const data = (await res.json()) as PlaceReviews;
      if (this.showing !== placeId) return;
      this.data = data;
      this.paint(data);
      this.message(this.t('rating.saved'));
      this.ctx.onChanged(placeId, data);
    } catch {
      this.message(this.t('rating.failed'), true);
    } finally {
      this.busy = false;
      const again = this.host?.querySelector<HTMLButtonElement>('.rv__save');
      if (again) again.disabled = false;
    }
  }

  private async remove(): Promise<void> {
    const placeId = this.showing;
    if (!placeId || this.busy) return;
    this.busy = true;
    try {
      const res = await call('DELETE', `/api/reviews/${encodeURIComponent(placeId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as PlaceReviews;
      if (this.showing !== placeId) return;
      this.data = data;
      this.paint(data);
      this.message(this.t('rating.removed'));
      this.ctx.onChanged(placeId, data);
    } catch {
      this.message(this.t('rating.failed'), true);
    } finally {
      this.busy = false;
    }
  }
}
