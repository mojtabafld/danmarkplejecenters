/**
 * The admin panel.
 *
 * A separate page and a separate bundle from the map, for one reason worth
 * stating: nobody visiting a map of care homes should download a moderation
 * queue and a charting library to look at it. The map's bundle is unchanged by
 * everything here.
 *
 * The page has no idea whether the person looking at it is an administrator,
 * and never guesses. It asks the server, and the server's 403 is the only
 * answer it trusts -- there is no client-side check to bypass because there is
 * no client-side check.
 */
import '../styles/tokens.css';
import './admin.css';

import { PLEJECENTRE } from '../data/plejecentre';
import { columnChart, lineChart, rankedBars, stackedShare, type Point } from './charts';
import { detectLocale, DIR, translator, type AdminKey, type AdminLocale } from './strings';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const locale: AdminLocale = detectLocale();
const t = translator(locale);
const nf = new Intl.NumberFormat(locale);
const n = (v: number): string => nf.format(v);
const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

type Overview = {
  days: number;
  totals: {
    views_all: number;
    views_today: number;
    views_week: number;
    visitors_today: number;
    visitor_days_week: number;
  };
  series: Array<{ day: string; views: number; visitors: number }>;
  locales: Array<{ locale: string; n: number }>;
  top: Array<{ place: string; n: number }>;
  /** How many distinct plejecentre were opened; the top list is a slice of it. */
  topTotal: number;
  users: { total: number; verified: number; week: number };
  signups: Array<{ day: string; n: number }>;
  reviews: { total: number; pending: number; approved: number; rejected: number; average: number | null };
};

type UserRow = {
  id: string;
  email: string;
  at: string;
  verified: boolean;
  saved: number;
  reviews: number;
};

type QueueRow = {
  id: string;
  place: string;
  stars: number;
  body: string;
  status: string;
  at: string;
  email: string;
};

const root = document.getElementById('admin') as HTMLElement;
const LOCALE_NAME: Record<string, string> = { da: 'Dansk', en: 'English', fa: 'فارسی' };

/**
 * Names for the ids the counters store.
 *
 * The server counts ids because ids are what the browser sends and what stays
 * stable when a name is corrected. But a chart of the most-read plejecentre
 * that lists UUIDs answers nothing, so the panel carries the register with it
 * and resolves them here. It costs the admin bundle the data file; the map
 * already ships it, and this page is read by a handful of people.
 */
const PLACE_NAME = new Map(PLEJECENTRE.map((p) => [p.id, p.name]));

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: 'same-origin', ...init });
}

/* ------------------------------------------------------------------ shell -- */

function shell(inner: string, tab: string): string {
  const tabs: Array<[string, AdminKey]> = [
    ['traffic', 'tabTraffic'],
    ['users', 'tabUsers'],
    ['reviews', 'tabReviews'],
  ];
  return (
    `<header class="head">` +
    `<div><h1 class="head__title">${esc(t('title'))}</h1>` +
    `<p class="head__sub">${esc(t('subtitle'))}</p></div>` +
    `<a class="btn btn--ghost" href="../">${esc(t('backToMap'))}</a>` +
    `</header>` +
    `<nav class="tabs" aria-label="${esc(t('title'))}">` +
    tabs
      .map(
        ([id, key]) =>
          `<button type="button" class="tab" data-tab="${id}" ` +
          `aria-current="${id === tab ? 'page' : 'false'}">${esc(t(key))}</button>`,
      )
      .join('') +
    `</nav>` +
    `<main class="panelbody" id="panelbody">${inner}</main>`
  );
}

function tile(label: string, value: string, note?: string): string {
  return (
    `<div class="tile"><p class="tile__label">${esc(label)}</p>` +
    `<p class="tile__value">${esc(value)}</p>` +
    (note ? `<p class="tile__note">${esc(note)}</p>` : '') +
    `</div>`
  );
}

function card(title: string, note: string, body: string, legend = ''): string {
  return (
    `<section class="card">` +
    `<h2 class="card__title">${esc(title)}</h2>` +
    (note ? `<p class="card__note">${esc(note)}</p>` : '') +
    legend +
    `<div class="card__body">${body}</div>` +
    `</section>`
  );
}

/* --------------------------------------------------------------- traffic -- */

function trafficView(d: Overview): string {
  const points: Point[] = d.series.map((r) => ({
    label: dayFmt.format(new Date(r.day + 'T00:00:00Z')),
    a: r.views,
    b: r.visitors,
  }));
  const signups: Point[] = d.signups.map((r) => ({
    label: dayFmt.format(new Date(r.day + 'T00:00:00Z')),
    a: r.n,
  }));

  // Two series, so a legend is always present; the series are also the only
  // two things on the chart with an end-dot, which the legend keys match.
  const legend =
    `<ul class="legend"><li class="legend__item"><span class="legend__key" data-series="0"></span>` +
    `${esc(t('views'))}</li>` +
    `<li class="legend__item"><span class="legend__key" data-series="1"></span>` +
    `${esc(t('visitors'))}</li></ul>`;

  return (
    `<div class="tiles">` +
    tile(t('viewsToday'), n(d.totals.views_today)) +
    tile(t('visitorsToday'), n(d.totals.visitors_today)) +
    tile(t('viewsWeek'), n(d.totals.views_week)) +
    tile(t('viewsAll'), n(d.totals.views_all)) +
    `</div>` +
    card(
      t('trafficTitle'),
      t('trafficNote'),
      lineChart(points, {
        labelA: t('views'),
        labelB: t('visitors'),
        fmt: n,
        rtl: DIR[locale] === 'rtl',
      }) + `<div class="tip" id="tip" hidden></div>`,
      legend,
    ) +
    `<div class="grid2">` +
    card(t('signupsTitle'), t('signupsNote'), columnChart(signups, { label: t('signupsTitle'), fmt: n })) +
    card(
      t('localeTitle'),
      '',
      stackedShare(
        d.locales.map((r) => ({ label: LOCALE_NAME[r.locale] ?? r.locale, value: r.n })),
        { fmt: n, empty: t('noData') },
      ),
    ) +
    `</div>` +
    card(t('topTitle'), '', topBody(d)) +
    `<p class="privacy">${esc(t('privacy'))}</p>`
  );
}

/**
 * The ranked list, and the control that opens the rest of it.
 *
 * The overview carries the top eight; everything past that is fetched only if
 * somebody asks for it. The bars stay comparable across the two states because
 * the scale comes from the first row either way, and the first row does not
 * change when the tail arrives.
 */
function topBody(d: Overview): string {
  const rows = (topAll ?? d.top).map((r) => ({
    label: PLACE_NAME.get(r.place) ?? r.place,
    value: r.n,
  }));
  const shown = topOpen ? rows : rows.slice(0, d.top.length);
  const list =
    `<div class="ranked__wrap" data-open="${topOpen}" id="topList">` +
    rankedBars(shown, { fmt: n, empty: t('noData') }) +
    `</div>`;

  // No control when there is nothing behind it. A button that expands to the
  // same eight rows is a button that lies.
  const total = topMore ?? d.topTotal;
  const more = total <= d.top.length ? '' :
    `<button type="button" class="btn btn--secondary ranked__more" id="topToggle" ` +
    `aria-expanded="${topOpen}" aria-controls="topList">` +
    `${esc(topOpen ? t('showFewer') : t('showAll', { n: n(total) }))}</button>`;

  return list + more;
}

/* ----------------------------------------------------------------- users -- */

function usersView(d: Overview, rows: UserRow[], total: number): string {
  const body = rows
    .map(
      (u) =>
        `<tr><td class="mono">${esc(u.email)}</td>` +
        `<td>${esc(dateFmt.format(new Date(u.at)))}</td>` +
        `<td>${esc(u.verified ? t('yes') : t('no'))}</td>` +
        `<td class="num">${esc(n(u.saved))}</td>` +
        `<td class="num">${esc(n(u.reviews))}</td></tr>`,
    )
    .join('');

  return (
    `<div class="tiles">` +
    tile(t('registered'), n(d.users.total)) +
    tile(t('verified'), n(d.users.verified)) +
    tile(t('newThisWeek'), n(d.users.week)) +
    `</div>` +
    `<section class="card"><h2 class="card__title">${esc(t('usersTitle'))}</h2>` +
    `<div class="tablewrap"><table class="table">` +
    `<thead><tr><th>${esc(t('colEmail'))}</th><th>${esc(t('colJoined'))}</th>` +
    `<th>${esc(t('colVerified'))}</th><th class="num">${esc(t('colSaved'))}</th>` +
    `<th class="num">${esc(t('colReviews'))}</th></tr></thead>` +
    `<tbody>${body}</tbody></table></div>` +
    (rows.length < total
      ? `<button type="button" class="btn btn--secondary" id="moreUsers">${esc(t('moreUsers'))}</button>`
      : '') +
    `</section>`
  );
}

/* ------------------------------------------------------------ moderation -- */

function queueView(rows: QueueRow[], status: string, counts: Overview['reviews']): string {
  const filters: Array<[string, AdminKey, number]> = [
    ['pending', 'showPending', counts.pending],
    ['approved', 'showApproved', counts.approved],
    ['rejected', 'showRejected', counts.rejected],
  ];

  const list = rows.length
    ? rows
        .map(
          (r) =>
            `<li class="rev" data-id="${esc(r.id)}">` +
            `<p class="rev__meta">` +
            `<span class="rev__stars">${esc(t('stars', { n: n(r.stars) }))}</span>` +
            `<span class="rev__place">${esc(PLACE_NAME.get(r.place) ?? r.place)}</span>` +
            `<span class="rev__who mono">${esc(r.email)}</span>` +
            `<time datetime="${esc(r.at)}">${esc(dateFmt.format(new Date(r.at)))}</time>` +
            `</p>` +
            `<p class="rev__body">${esc(r.body)}</p>` +
            (r.status === 'pending'
              ? `<p class="rev__acts">` +
                `<button type="button" class="btn btn--primary" data-decide="approve">${esc(t('approve'))}</button>` +
                `<button type="button" class="btn btn--ghost" data-decide="reject">${esc(t('reject'))}</button>` +
                `</p>`
              : `<p class="rev__state">${esc(t(r.status === 'approved' ? 'approved' : 'rejected'))}</p>`) +
            `</li>`,
        )
        .join('')
    : `<li class="quiet">${esc(t('queueEmpty'))}</li>`;

  return (
    `<div class="tiles">` +
    tile(t('pending'), n(counts.pending)) +
    tile(t('approved'), n(counts.approved)) +
    tile(t('rejected'), n(counts.rejected)) +
    `</div>` +
    `<section class="card"><h2 class="card__title">${esc(t('queueTitle'))}</h2>` +
    `<div class="filters">` +
    filters
      .map(
        ([id, key, count]) =>
          `<button type="button" class="chipbtn" data-status="${id}" ` +
          `aria-pressed="${id === status}">${esc(t(key))} <span class="chipbtn__n">${esc(n(count))}</span></button>`,
      )
      .join('') +
    `</div>` +
    `<ul class="revs" id="revs">${list}</ul></section>`
  );
}

/* ----------------------------------------------------------------- state -- */

let overview: Overview | null = null;
let tab = 'traffic';
let userRows: UserRow[] = [];
let userTotal = 0;
let queueStatus = 'pending';
let queueRows: QueueRow[] = [];
/** The full ranked list, once somebody has asked for it. */
let topAll: Array<{ place: string; n: number }> | null = null;
/** How many there are in total, which is what the button has to say. */
let topMore: number | null = null;
let topOpen = false;

function refused(noAdmins: boolean): void {
  root.innerHTML =
    `<div class="gate"><h1 class="gate__title">${esc(t('refused'))}</h1>` +
    `<p class="gate__body">${esc(t(noAdmins ? 'refusedNoAdmins' : 'refusedWhy'))}</p>` +
    `<a class="btn btn--primary" href="../">${esc(t('signIn'))}</a></div>`;
}

async function loadOverview(): Promise<boolean> {
  const res = await api('/api/admin/overview');
  if (res.status === 403) {
    // Whether anybody could sign in at all is a configuration question, and
    // the health endpoint answers it without saying who the admins are.
    let noAdmins = false;
    try {
      const health = (await (await api('/api/health')).json()) as { admins?: number };
      noAdmins = health.admins === 0;
    } catch {
      /* the refusal stands either way */
    }
    refused(noAdmins);
    return false;
  }
  if (!res.ok) throw new Error('load_failed');
  overview = (await res.json()) as Overview;
  return true;
}

async function paint(): Promise<void> {
  if (!overview) return;
  let inner = '';
  if (tab === 'traffic') inner = trafficView(overview);
  else if (tab === 'users') inner = usersView(overview, userRows, userTotal);
  else inner = queueView(queueRows, queueStatus, overview.reviews);
  root.innerHTML = shell(inner, tab);
  wire();
}

async function loadUsers(offset = 0): Promise<void> {
  const res = await api(`/api/admin/users?offset=${offset}`);
  if (!res.ok) return;
  const data = (await res.json()) as { total: number; users: UserRow[] };
  userTotal = data.total;
  userRows = offset === 0 ? data.users : [...userRows, ...data.users];
}

async function loadPlaces(): Promise<void> {
  const res = await api('/api/admin/places');
  if (!res.ok) return;
  const data = (await res.json()) as { places: Array<{ place: string; n: number }> };
  topAll = data.places;
  topMore = data.places.length;
}

async function loadQueue(): Promise<void> {
  const res = await api(`/api/admin/reviews?status=${encodeURIComponent(queueStatus)}`);
  if (!res.ok) return;
  const data = (await res.json()) as { reviews: QueueRow[]; counts: Overview['reviews'] };
  queueRows = data.reviews;
  if (overview) overview.reviews = data.counts;
}

async function go(next: string): Promise<void> {
  tab = next;
  if (tab === 'users' && userRows.length === 0) await loadUsers(0);
  if (tab === 'reviews') await loadQueue();
  await paint();
}

/* ----------------------------------------------------------------- wiring -- */

function wire(): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.tab')) {
    btn.addEventListener('click', () => void go(btn.dataset.tab ?? 'traffic'));
  }

  root.querySelector<HTMLButtonElement>('#topToggle')?.addEventListener('click', async () => {
    topOpen = !topOpen;
    if (topOpen && topAll === null) await loadPlaces();
    await paint();
    // Focus follows the control, which has just been re-rendered: without this
    // the keyboard lands back at the top of the document on every press.
    root.querySelector<HTMLButtonElement>('#topToggle')?.focus();
  });

  root.querySelector<HTMLButtonElement>('#moreUsers')?.addEventListener('click', async () => {
    await loadUsers(userRows.length);
    await paint();
  });

  for (const btn of root.querySelectorAll<HTMLButtonElement>('[data-status]')) {
    btn.addEventListener('click', async () => {
      queueStatus = btn.dataset.status ?? 'pending';
      await loadQueue();
      await paint();
    });
  }

  root.querySelector('#revs')?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-decide]');
    const item = (e.target as HTMLElement).closest<HTMLElement>('.rev');
    if (!btn || !item?.dataset.id) return;
    btn.disabled = true;
    const res = await api(`/api/admin/reviews/${encodeURIComponent(item.dataset.id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: btn.dataset.decide }),
    });
    if (res.ok || res.status === 409) {
      await loadQueue();
      await paint();
    } else {
      btn.disabled = false;
    }
  });

  wireTooltip();
}

/**
 * The hover layer on the traffic chart.
 *
 * A crosshair and a readout rather than a label on every point: thirty days of
 * two series is sixty numbers, and printing them all is how a chart stops
 * being readable.
 */
function wireTooltip(): void {
  const svg = root.querySelector<SVGSVGElement>('.card .chart');
  const tip = root.querySelector<HTMLElement>('#tip');
  const cross = svg?.querySelector<SVGLineElement>('.cross');
  if (!svg || !tip || !overview) return;
  const series = overview.series;

  const show = (i: number, clientX: number): void => {
    const row = series[i];
    if (!row) return;
    const hit = svg.querySelector<SVGRectElement>(`.hit[data-i="${i}"]`);
    if (hit && cross) {
      const x = Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2;
      cross.setAttribute('x1', String(x));
      cross.setAttribute('x2', String(x));
      // `hidden` on an SVG element is a content attribute, not a property, so
      // it is set the long way round.
      cross.removeAttribute('hidden');
    }
    tip.innerHTML =
      `<p class="tip__day">${esc(dateFmt.format(new Date(row.day + 'T00:00:00Z')))}</p>` +
      `<p class="tip__row"><span class="legend__key" data-series="0"></span>` +
      `${esc(t('views'))} <b>${esc(n(row.views))}</b></p>` +
      `<p class="tip__row"><span class="legend__key" data-series="1"></span>` +
      `${esc(t('visitors'))} <b>${esc(n(row.visitors))}</b></p>`;
    tip.hidden = false;
    const box = svg.getBoundingClientRect();
    const left = Math.min(Math.max(clientX - box.left, 8), box.width - 8);
    tip.style.insetInlineStart = `${left}px`;
  };

  svg.addEventListener('pointermove', (e) => {
    const hit = (e.target as Element).closest('.hit');
    if (hit) show(Number((hit as HTMLElement).dataset.i), e.clientX);
  });
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true;
    cross?.setAttribute('hidden', '');
  });
}

/* ------------------------------------------------------------------ boot -- */

document.documentElement.lang = locale;
document.documentElement.dir = DIR[locale];
document.title = `${t('title')} — ${t('subtitle')}`;

root.innerHTML = `<p class="quiet gate">${esc(t('loading'))}</p>`;
void (async () => {
  try {
    if (await loadOverview()) await paint();
  } catch {
    root.innerHTML =
      `<div class="gate"><p class="quiet">${esc(t('failed'))}</p>` +
      `<button type="button" class="btn btn--secondary" id="retry">${esc(t('retry'))}</button></div>`;
    root.querySelector('#retry')?.addEventListener('click', () => location.reload());
  }
})();
