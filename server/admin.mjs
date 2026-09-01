/**
 * Who may see the admin panel, and what it can read.
 *
 * Administrators are named in an environment variable rather than flagged in
 * the database, and that is deliberate for a site this size. A flag in a table
 * has to be granted by something, and that something is either a bootstrap
 * rule ("the first account wins") or another admin screen -- the first is a
 * race anybody can win on a fresh database, the second is a chicken with no
 * egg. A variable on the component is set by whoever already controls the
 * deploy, which is the same person the flag would be trying to identify.
 *
 * A consequence worth knowing: changing the list takes a redeploy, and an
 * address listed here still has to hold a verified account with a password.
 * Being named is permission, not a way in.
 */
import * as auth from './auth.mjs';
import * as db from './db.mjs';

export function adminEmails() {
  return String(process.env.ADMIN_EMAILS ?? '')
    .split(/[,\s]+/)
    .map((e) => auth.emailKey(e))
    .filter(Boolean);
}

export function isConfigured() {
  return adminEmails().length > 0;
}

/**
 * True when this signed-in user is an administrator.
 *
 * Verified as well as listed: an unverified account is one nobody has proved
 * they own, and the panel shows every registered address.
 */
export async function isAdmin(user) {
  if (!user) return false;
  if (!adminEmails().includes(auth.emailKey(user.email))) return false;
  return await auth.isVerified(user.id);
}

/**
 * The registered accounts, with what each has actually done.
 *
 * Addresses are shown because the panel exists to administer accounts and
 * there is no way to do that without being able to tell them apart. Nothing
 * else personal is here: no password material, no session tokens, no
 * addresses of any other kind.
 */
export async function users({ limit = 200, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT id, email, created_at, verified_at FROM users
      ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  // Three flat queries and a join in JavaScript, rather than two correlated
  // subqueries in the SELECT list. The correlated form is the prettier SQL and
  // it is what broke first: not every engine resolves the outer alias inside
  // them, and a page of accounts is not worth a query only one database can
  // run. These are grouped counts over two small tables.
  const [saved, reviewed] = await Promise.all([
    db.query('SELECT user_id, count(*)::int AS n FROM visits GROUP BY user_id'),
    db.query('SELECT user_id, count(*)::int AS n FROM reviews GROUP BY user_id'),
  ]);
  const savedBy = new Map(saved.rows.map((r) => [String(r.user_id), r.n]));
  const reviewedBy = new Map(reviewed.rows.map((r) => [String(r.user_id), r.n]));

  const total = await db.query('SELECT count(*)::int AS n FROM users');
  return {
    total: total.rows[0].n,
    users: rows.map((r) => ({
      id: String(r.id),
      email: r.email,
      at: new Date(r.created_at).toISOString(),
      verified: Boolean(r.verified_at),
      saved: savedBy.get(String(r.id)) ?? 0,
      reviews: reviewedBy.get(String(r.id)) ?? 0,
    })),
  };
}

/** Sign-ups per day, so the panel can show growth next to traffic. */
export async function signups(days = 30) {
  // The rows come back raw and the bucketing happens here. Grouping by a cast
  // expression is another thing engines disagree about, and this is at most a
  // few hundred timestamps: counting them in JavaScript costs nothing and
  // works the same everywhere.
  const { rows } = await db.query('SELECT created_at FROM users WHERE created_at >= $1', [
    midnightDaysAgo(days - 1),
  ]);
  const seen = new Map();
  for (const r of rows) {
    const day = new Date(r.created_at).toISOString().slice(0, 10);
    seen.set(day, (seen.get(day) ?? 0) + 1);
  }
  const out = [];
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, n: seen.get(day) ?? 0 });
  }
  return out;
}

/** Midnight UTC, `days` days back, as an ISO timestamp. */
function midnightDaysAgo(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export async function userTotals() {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            sum(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END)::int AS verified,
            sum(CASE WHEN created_at >= $1 THEN 1 ELSE 0 END)::int AS week
       FROM users`,
    [midnightDaysAgo(6)],
  );
  return rows[0];
}
