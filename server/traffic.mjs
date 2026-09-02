/**
 * How many people read the site, counted without following anybody.
 *
 * The rule this file is built around: nothing that identifies a visitor is
 * ever written down. No address, no browser string, no cookie, no row per
 * request. What is stored is a day, a metric name and a number -- plus, for
 * counting distinct people, an opaque hash under a salt that exists only in
 * this process's memory and is thrown away at midnight.
 *
 * That salt is what makes the hash safe rather than a rename. Hashing an
 * address with a fixed salt gives every visitor a stable identifier for life,
 * which is a pseudonym rather than anonymity: anyone with the table and a list
 * of addresses can rebuild it. Rotating the salt daily means today's hash and
 * tomorrow's are unrelated, so the table cannot say that the person who came
 * on Monday came back on Friday. It can only say how many came each day, which
 * is the question actually being asked.
 *
 * The cost is real and worth stating: restarting the process mid-day mints a
 * new salt, so visitors already counted that day are counted a second time.
 * Unique visitors are therefore a floor that drifts high across a deploy, not
 * an exact figure. Being approximately right without a surveillance table is
 * the better trade for a public map of care homes.
 */
import { createHash, randomBytes } from 'node:crypto';

import * as db from './db.mjs';

/** How long the visitor hashes are kept. They answer nothing older. */
const RETAIN_DAYS = 400;

/** Locales the site actually has. Anything else is not counted at all. */
const LOCALES = new Set(['da', 'en', 'fa']);

/** A plejecentre id, as the data files write them. */
const PLACE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * A per-instance ceiling on how many distinct places one day may count.
 *
 * The beacon is public and its `id` comes from the page, so a determined
 * person could post a few thousand invented ids and pad the table. The shape
 * check above stops the ugliest of that; this stops the volume.
 */
const PLACE_CAP = 600;

let salt = randomBytes(32);
let saltDay = today();
let placesToday = new Set();

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The salt for right now, rotated lazily rather than on a timer.
 *
 * A timer would have to survive a process that sleeps, and would keep this
 * module alive on an idle instance. Checking the date when a visit arrives is
 * the same guarantee with nothing running in between.
 */
function currentSalt() {
  const day = today();
  if (day !== saltDay) {
    salt = randomBytes(32);
    saltDay = day;
    placesToday = new Set();
  }
  return salt;
}

/**
 * An opaque per-day identity for one visitor.
 *
 * Address and browser together, because an address alone counts a whole
 * household or office as one person and a browser alone counts half the
 * internet as one. Neither is stored; only this digest is.
 */
function visitorHash(ip, agent) {
  return createHash('sha256')
    .update(currentSalt())
    .update(String(ip ?? ''))
    .update('|')
    .update(String(agent ?? '').slice(0, 200))
    .digest('base64url')
    .slice(0, 22);
}

async function bump(day, metric) {
  await db.query(
    `INSERT INTO counters (day, metric, n) VALUES ($1, $2, 1)
     ON CONFLICT (day, metric) DO UPDATE SET n = counters.n + 1`,
    [day, metric],
  );
}

/**
 * Record one page view: the view itself, the language it was read in, and
 * whether this is a visitor today has not seen before.
 */
export async function view({ ip, agent, locale }) {
  const day = today();
  const hash = visitorHash(ip, agent);
  await bump(day, 'view');
  if (LOCALES.has(locale)) await bump(day, `locale:${locale}`);
  // ON CONFLICT DO NOTHING is what makes this a set rather than a log: the
  // second view from the same visitor on the same day writes nothing.
  await db.query('INSERT INTO visitor_days (day, visitor) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    day,
    hash,
  ]);
}

/** Record that somebody opened one plejecentre's card. */
export async function place(id) {
  if (!PLACE_ID.test(id)) return;
  currentSalt();
  if (!placesToday.has(id)) {
    if (placesToday.size >= PLACE_CAP) return;
    placesToday.add(id);
  }
  await bump(today(), `place:${id}`);
}

/**
 * A day, `days` days back, as an ISO date string.
 *
 * Cut-offs are computed here and passed as parameters rather than written as
 * `current_date - $1::int` in SQL. Date arithmetic against a timestamptz
 * column is a coercion the database is free to refuse -- and one of them did,
 * with "cannot cast type date to timestamptz", which turned the whole admin
 * overview into a 500. An explicit bound is one less thing for a dialect to
 * have an opinion about.
 */
function daysAgo(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Drop what is past the retention window. Cheap, and only ever deletes.
 *
 * The cut-off is interpolated rather than bound, which is safe here and only
 * here: it is not user input, it is a date this function just built out of a
 * constant, and it is checked against a strict pattern on the way in. A bound
 * parameter is still the rule everywhere a value could have come from outside.
 */
export async function prune() {
  const cut = daysAgo(RETAIN_DAYS);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cut)) return;
  await db.query(`DELETE FROM visitor_days WHERE day < DATE '${cut}'`);
  await db.query(`DELETE FROM counters WHERE day < DATE '${cut}'`);
}

/* --------------------------------------------------------------- reading -- */

/**
 * Views and visitors per day for the last `days` days, with the empty days
 * filled in.
 *
 * The gaps matter: a chart drawn only from the days that have rows draws a
 * quiet week as a straight line between two busy ones, which is a graph of a
 * different, better-looking site.
 */
export async function series(days = 30) {
  const since = daysAgo(days - 1);
  const views = await db.query(
    `SELECT day, n FROM counters WHERE metric = 'view' AND day >= $1::date ORDER BY day`,
    [since],
  );
  const visitors = await db.query(
    `SELECT day, count(*)::int AS n FROM visitor_days
      WHERE day >= $1::date GROUP BY day ORDER BY day`,
    [since],
  );
  const key = (d) => d.toISOString().slice(0, 10);
  const v = new Map(views.rows.map((r) => [key(r.day), Number(r.n)]));
  const u = new Map(visitors.rows.map((r) => [key(r.day), r.n]));

  const out = [];
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, views: v.get(day) ?? 0, visitors: u.get(day) ?? 0 });
  }
  return out;
}

export async function locales(days = 30) {
  const { rows } = await db.query(
    `SELECT metric, sum(n)::int AS n FROM counters
      WHERE metric LIKE 'locale:%' AND day >= $1::date
      GROUP BY metric ORDER BY n DESC`,
    [daysAgo(days - 1)],
  );
  return rows.map((r) => ({ locale: r.metric.slice('locale:'.length), n: r.n }));
}

export async function topPlaces(days = 30, limit = 8) {
  const { rows } = await db.query(
    `SELECT metric, sum(n)::int AS n FROM counters
      WHERE metric LIKE 'place:%' AND day >= $1::date
      GROUP BY metric ORDER BY n DESC LIMIT $2`,
    [daysAgo(days - 1), limit],
  );
  return rows.map((r) => ({ place: r.metric.slice('place:'.length), n: r.n }));
}

/**
 * How many distinct plejecentre were opened at all in the window.
 *
 * The panel needs this before it needs the list: the control that expands the
 * ranked card has to know whether there is anything behind it, and saying so
 * costs one count rather than a hundred and fifty rows nobody asked for.
 */
export async function placeCount(days = 30) {
  const { rows } = await db.query(
    `SELECT count(DISTINCT metric)::int AS n FROM counters
      WHERE metric LIKE 'place:%' AND day >= $1::date`,
    [daysAgo(days - 1)],
  );
  return rows[0]?.n ?? 0;
}

/**
 * Totals for the tiles at the top of the panel.
 *
 * Five separate queries rather than five scalar subqueries in one SELECT, for
 * the same reason as the users list: subqueries in a select list are where
 * engines differ, and one of them handed back each total wrapped in an array,
 * which the panel would have rendered as "[1]" beside the word "today".
 */
export async function totals() {
  const day = today();
  const week = daysAgo(6);
  const one = async (sql, params) => {
    const { rows } = await db.query(sql, params);
    return Number(rows[0]?.n ?? 0);
  };
  const [viewsAll, viewsToday, viewsWeek, visitorsToday] = await Promise.all([
    one(`SELECT coalesce(sum(n), 0)::int AS n FROM counters WHERE metric = 'view'`),
    one(`SELECT coalesce(sum(n), 0)::int AS n FROM counters WHERE metric = 'view' AND day = $1::date`, [day]),
    one(`SELECT coalesce(sum(n), 0)::int AS n FROM counters WHERE metric = 'view' AND day >= $1::date`, [week]),
    one('SELECT count(*)::int AS n FROM visitor_days WHERE day = $1::date', [day]),
  ]);
  // There is deliberately no weekly visitor figure. Counting rows across seven
  // days answers person-days, not people -- somebody who came on three days
  // counts three -- and the daily salt makes the real question unanswerable by
  // design. A number that would be read as one thing and mean another is worth
  // less than the query it costs.
  return {
    views_all: viewsAll,
    views_today: viewsToday,
    views_week: viewsWeek,
    visitors_today: visitorsToday,
  };
}
