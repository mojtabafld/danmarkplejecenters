/**
 * Ratings and written reviews.
 *
 * The central decision in this file is that a rating and a review are two
 * different things wearing one form. A star is a number that disappears into
 * an average; a paragraph is a statement published under this site's name to
 * everybody who looks up that plejecentre, including its staff and its
 * residents' families. So the star counts the moment it is cast and the words
 * wait for a human to read them.
 *
 * That is why `status` gates only the body. A person who rates without writing
 * anything has nothing to moderate, and their rating is live immediately.
 */
import * as db from './db.mjs';

export const BODY_MAX = 1500;

/** Which written reviews the public may read. */
const PUBLIC = `status = 'approved' AND body <> ''`;

export function validStars(n) {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

/**
 * Store or replace one person's review of one plejecentre.
 *
 * Rewriting the text sends it back to the queue even if the previous version
 * was approved -- otherwise an approved review is a slot that can be quietly
 * refilled with anything. Changing only the stars leaves an approved text
 * approved, because nothing was published that a moderator has not seen.
 */
export async function put(userId, placeId, stars, body) {
  const text = body.trim().slice(0, BODY_MAX);
  const { rows } = await db.query(
    'SELECT body, status FROM reviews WHERE user_id = $1 AND plejecenter_id = $2',
    [userId, placeId],
  );
  const before = rows[0];
  // Nothing written is nothing to moderate, and is therefore not pending.
  const status = text === '' ? 'approved' : before && before.body === text ? before.status : 'pending';

  const { rows: saved } = await db.query(
    `INSERT INTO reviews (user_id, plejecenter_id, stars, body, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id, plejecenter_id) DO UPDATE
       SET stars = EXCLUDED.stars,
           body = EXCLUDED.body,
           status = EXCLUDED.status,
           updated_at = now(),
           decided_at = CASE WHEN EXCLUDED.status = 'pending' THEN NULL ELSE reviews.decided_at END,
           decided_by = CASE WHEN EXCLUDED.status = 'pending' THEN NULL ELSE reviews.decided_by END
     RETURNING stars, body, status`,
    [userId, placeId, stars, text, status],
  );
  return saved[0];
}

export async function remove(userId, placeId) {
  await db.query('DELETE FROM reviews WHERE user_id = $1 AND plejecenter_id = $2', [
    userId,
    placeId,
  ]);
}

/**
 * What one plejecentre's page needs: the score, how the votes are spread, the
 * approved writing, and -- when somebody is signed in -- their own review
 * whatever state it is in.
 *
 * The distribution is not decoration. An average of three from two people who
 * said one and five is a different fact from three from six people who all
 * said three, and only the spread tells them apart.
 */
export async function forPlace(placeId, userId) {
  const summary = await db.query(
    // sum(CASE ...) rather than count(*) FILTER (...). FILTER is standard SQL
    // and correct on Postgres, but it is not universally implemented -- the
    // in-memory database the tests run against accepts it and ignores the
    // condition, so every bucket came back with the total. A query whose bugs
    // only appear in production is not one worth keeping for its elegance.
    `SELECT count(*)::int AS count, avg(stars)::float AS average,
            coalesce(sum(CASE WHEN stars = 1 THEN 1 ELSE 0 END), 0)::int AS s1,
            coalesce(sum(CASE WHEN stars = 2 THEN 1 ELSE 0 END), 0)::int AS s2,
            coalesce(sum(CASE WHEN stars = 3 THEN 1 ELSE 0 END), 0)::int AS s3,
            coalesce(sum(CASE WHEN stars = 4 THEN 1 ELSE 0 END), 0)::int AS s4,
            coalesce(sum(CASE WHEN stars = 5 THEN 1 ELSE 0 END), 0)::int AS s5
       FROM reviews WHERE plejecenter_id = $1`,
    [placeId],
  );
  const s = summary.rows[0];

  const list = await db.query(
    `SELECT id, stars, body, created_at FROM reviews
      WHERE plejecenter_id = $1 AND ${PUBLIC}
      ORDER BY created_at DESC LIMIT 50`,
    [placeId],
  );

  let mine = null;
  if (userId) {
    const own = await db.query(
      'SELECT stars, body, status FROM reviews WHERE user_id = $1 AND plejecenter_id = $2',
      [userId, placeId],
    );
    mine = own.rows[0] ?? null;
  }

  return {
    count: s.count,
    average: s.count ? Math.round(s.average * 10) / 10 : null,
    spread: [s.s1, s.s2, s.s3, s.s4, s.s5],
    reviews: list.rows.map((r) => ({
      id: String(r.id),
      stars: r.stars,
      body: r.body,
      at: r.created_at.toISOString(),
    })),
    mine,
  };
}

/**
 * Scores for every plejecentre at once, for the list and the map.
 *
 * One query rather than one per centre: the alternative is 148 round trips to
 * draw a screen.
 */
export async function summaries() {
  const { rows } = await db.query(
    `SELECT plejecenter_id, count(*)::int AS count, avg(stars)::float AS average
       FROM reviews GROUP BY plejecenter_id`,
  );
  const out = {};
  for (const r of rows) {
    out[r.plejecenter_id] = { count: r.count, average: Math.round(r.average * 10) / 10 };
  }
  return out;
}

/* ------------------------------------------------------------ moderation -- */

export async function queue(status = 'pending', limit = 100) {
  const { rows } = await db.query(
    `SELECT r.id, r.plejecenter_id, r.stars, r.body, r.status, r.created_at, u.email
       FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.status = $1 AND r.body <> ''
      ORDER BY r.created_at ASC LIMIT $2`,
    [status, limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    place: r.plejecenter_id,
    stars: r.stars,
    body: r.body,
    status: r.status,
    at: r.created_at.toISOString(),
    email: r.email,
  }));
}

/**
 * Approve or reject one review.
 *
 * Rejecting keeps the row rather than deleting it: the star still counts (it
 * was never the thing under review), and the person who wrote it can see that
 * their text was not published rather than watching it vanish.
 */
export async function decide(id, decision, adminId) {
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const { rowCount } = await db.query(
    `UPDATE reviews SET status = $1, decided_at = now(), decided_by = $2
      WHERE id = $3 AND status = 'pending'`,
    [status, adminId, id],
  );
  return rowCount > 0;
}

export async function counts() {
  const { rows } = await db.query(
    // coalesce on every sum: a sum over no rows is NULL, not zero, and the
    // panel would have shown an empty queue as a blank tile rather than a 0.
    `SELECT count(*)::int AS total,
            coalesce(sum(CASE WHEN status = 'pending' AND body <> '' THEN 1 ELSE 0 END), 0)::int AS pending,
            coalesce(sum(CASE WHEN status = 'approved' AND body <> '' THEN 1 ELSE 0 END), 0)::int AS approved,
            coalesce(sum(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0)::int AS rejected,
            avg(stars)::float AS average
       FROM reviews`,
  );
  const r = rows[0];
  return {
    total: r.total,
    pending: r.pending,
    approved: r.approved,
    rejected: r.rejected,
    average: r.total ? Math.round(r.average * 10) / 10 : null,
  };
}
