/**
 * The JSON API behind accounts and the visited list.
 *
 * Everything here is deliberately small: five tables' worth of behaviour, no
 * framework, and no user-supplied string ever reaching SQL except as a bound
 * parameter.
 */
import * as admin from './admin.mjs';
import * as auth from './auth.mjs';
import * as db from './db.mjs';
import * as mail from './mail.mjs';
import * as reviews from './reviews.mjs';
import * as traffic from './traffic.mjs';

const COOKIE = 'plejekort_session';
const MAX_BODY = 4 * 1024;

/* ----------------------------------------------------------------- utils -- */

function send(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(json),
    ...headers,
  });
  res.end(json);
}

/** Reads at most MAX_BODY, so a large upload cannot be used to exhaust memory. */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('bad_json'));
      }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * SameSite=Lax and HttpOnly: the cookie is never readable from JavaScript, so
 * an injected script cannot steal the session, and it is not sent on
 * cross-site requests, which is what makes a CSRF token unnecessary for the
 * same-origin fetches this app makes.
 */
function sessionCookie(token, expires, secure) {
  const bits = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

const clearCookie = (secure) =>
  sessionCookie('', new Date(0), secure) + '; Max-Age=0';

/* ------------------------------------------------------- rate limiting --- */

/**
 * A small in-memory throttle on the credential endpoints.
 *
 * Per-instance and reset on deploy, which is the honest limit of doing this
 * without another table; it still turns online guessing from thousands of tries
 * a minute into a handful.
 *
 * Two deliberate choices. Each endpoint has its own bucket, so somebody
 * registering does not spend the allowance for signing in. And sign-in counts
 * only FAILURES, cleared the moment a password is right: counting successes
 * would lock out an office or a family behind one address after a dozen
 * ordinary logins, which punishes exactly the wrong people.
 */
const buckets = new Map();
const WINDOW_MS = 15 * 60_000;

function overLimit(endpoint, key, max) {
  const rec = buckets.get(`${endpoint}:${key}`);
  return Boolean(rec && Date.now() <= rec.reset && rec.n >= max);
}

function countAttempt(endpoint, key) {
  const id = `${endpoint}:${key}`;
  const now = Date.now();
  const rec = buckets.get(id);
  if (!rec || now > rec.reset) buckets.set(id, { n: 1, reset: now + WINDOW_MS });
  else rec.n += 1;
}

function clearAttempts(endpoint, key) {
  buckets.delete(`${endpoint}:${key}`);
}

// Bounded, so a flood of distinct addresses cannot grow the map without limit.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, WINDOW_MS).unref?.();

const clientKey = (req) =>
  (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
  req.socket.remoteAddress ||
  'unknown';

/* ----------------------------------------------------------------- mail -- */

/**
 * Where the verification link points. PUBLIC_URL when set, otherwise the host
 * the request arrived on, which is right unless a proxy rewrites it.
 */
function publicOrigin(req) {
  const configured = process.env.PUBLIC_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  const proto = req.headers['x-forwarded-proto'] ?? 'http';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

/**
 * Mint a token and mail it. Returns false if the message could not be sent, so
 * the caller can tell the truth rather than claim a mail is on its way.
 */
async function sendVerificationTo(req, user) {
  const token = await auth.createEmailToken(user.id);
  const link = `${publicOrigin(req)}/verify?token=${encodeURIComponent(token)}`;
  try {
    await mail.sendVerification(user.email, link);
    return true;
  } catch (err) {
    // The address is never logged with the link: the log would then be enough
    // to take over the account.
    console.error('verification mail failed:', err?.message);
    return false;
  }
}

/* ------------------------------------------------------------- handlers -- */

/**
 * Returns true when it handled the request. `secure` says whether to mark the
 * cookie Secure, which must be off on plain-http localhost or the browser
 * silently drops it.
 */
export async function handle(req, res, { secure }) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  // /verify is not under /api/ because it is a link someone clicks in a mail
  // client, and it should look like a page rather than an endpoint.
  if (!path.startsWith('/api/') && path !== '/verify') return false;

  // Health is answerable even when nothing else is: it exists to say why.
  if (path === '/api/health') {
    send(res, 200, {
      ...db.status(),
      mail: mail.isConfigured() ? 'configured' : 'not_configured',
      // Variable NAMES the process can see, never their values. Turns "it is
      // not configured" into "the app cannot see SMTP_USER", which is the
      // difference between guessing and knowing.
      mailVars: mail.configuredVars(),
      publicUrl: (process.env.PUBLIC_URL ?? '').trim() !== '',
      // Whether an administrator could sign in at all. The addresses
      // themselves are never in the reply: this endpoint is public.
      admins: admin.adminEmails().length,
    });
    return true;
  }

  if (!db.isReady()) {
    // One more go before refusing. A managed database is often not accepting
    // connections in the seconds after a deploy, and the boot attempt may have
    // been the only one; without this, accounts stay broken until a redeploy.
    const recovered = await db.ensureSchema({ attempts: 1 });
    if (!recovered) {
      // 409, not 503. App Platform intercepts an upstream 5xx and serves its
      // own error page instead, so the JSON body never reaches the browser and
      // the client cannot tell "not configured" from "the app is down". These
      // are expected, explainable states, so they answer in the 4xx range and
      // the client reads the code from the body.
      send(res, 409, { error: 'no_database' });
      return true;
    }
  }

  try {
    const method = req.method ?? 'GET';

    if (path === '/api/auth/signup' && method === 'POST') return await signup(req, res, secure);
    if (path === '/api/auth/resend' && method === 'POST') return await resend(req, res);
    if (path === '/verify' && method === 'GET') return await verify(req, res, url);
    if (path === '/api/auth/forgot' && method === 'POST') return await forgot(req, res);
    if (path === '/api/auth/reset' && method === 'POST') return await resetPassword(req, res);
    if (path === '/api/auth/signin' && method === 'POST') return await signin(req, res, secure);
    if (path === '/api/auth/signout' && method === 'POST') return await signout(req, res, secure);
    if (path === '/api/auth/me' && method === 'GET') return await me(req, res);
    if (path === '/api/auth/account' && method === 'DELETE') return await removeAccount(req, res, secure);
    if (path === '/api/visits' && method === 'GET') return await listVisits(req, res);
    if (path === '/api/notes' && method === 'GET') return await listNotes(req, res);
    if (path.startsWith('/api/notes/') && (method === 'PUT' || method === 'DELETE')) {
      return await changeNote(req, res, decodeURIComponent(path.slice('/api/notes/'.length)), method);
    }
    if (path.startsWith('/api/visits/') && (method === 'PUT' || method === 'DELETE')) {
      return await changeVisit(req, res, decodeURIComponent(path.slice('/api/visits/'.length)), method);
    }
    if (path === '/api/track' && method === 'POST') return await track(req, res);
    if (path === '/api/ratings' && method === 'GET') return await allRatings(req, res);
    if (path.startsWith('/api/reviews/')) {
      const id = decodeURIComponent(path.slice('/api/reviews/'.length));
      if (method === 'GET') return await placeReviews(req, res, id);
      if (method === 'PUT') return await putReview(req, res, id);
      if (method === 'DELETE') return await deleteReview(req, res, id);
    }
    if (path.startsWith('/api/admin/')) return await adminRoutes(req, res, path, method);

    send(res, 404, { error: 'not_found' });
    return true;
  } catch (err) {
    if (err?.message === 'body_too_large') { send(res, 413, { error: 'too_large' }); return true; }
    if (err?.message === 'bad_json') { send(res, 400, { error: 'bad_json' }); return true; }
    // Never echo the driver's message: it can carry table names and values.
    console.error('api error:', err?.message);
    send(res, 500, { error: 'server_error' });
    return true;
  }
}

async function currentUser(req) {
  return auth.userForToken(cookies(req)[COOKIE]);
}

function requireUser(res, user) {
  if (user) return true;
  send(res, 401, { error: 'signed_out' });
  return false;
}

async function signup(req, res, secure) {
  const who = clientKey(req);
  // Every attempt counts here: creating accounts is the expensive thing, and a
  // valid one is as good a reason to slow down as an invalid one.
  if (overLimit('signup', who, 10)) { send(res, 429, { error: 'too_many' }); return true; }
  countAttempt('signup', who);
  const { email, password } = await readJson(req);

  if (!auth.isPlausibleEmail(email ?? '')) { send(res, 400, { error: 'bad_email' }); return true; }
  const problem = auth.passwordProblem(password);
  if (problem) { send(res, 400, { error: problem, min: auth.PASSWORD_MIN }); return true; }

  // Refuse before creating anything: an account that can never be confirmed is
  // worse than no account.
  // 409 rather than 503, for the reason given above: a 5xx never arrives.
  if (!mail.isConfigured()) { send(res, 409, { error: 'mail_unavailable' }); return true; }

  const user = await auth.createUser(email, password);
  // A null row means the unique index rejected it, so the address is taken.
  // Said plainly: hiding it would trade a real usability problem for privacy
  // this app does not otherwise offer, since sign-in reveals the same thing.
  if (!user) { send(res, 409, { error: 'email_taken' }); return true; }

  // No session yet. The account exists but is not usable until the address is
  // confirmed, which is the whole point of confirming it.
  const sent = await sendVerificationTo(req, user);
  // 424: the request failed because something it depended on did. 4xx for the
  // same reason as above.
  if (!sent) { send(res, 424, { error: 'mail_failed' }); return true; }

  send(res, 201, { pending: true, email: user.email });
  return true;
}

/**
 * Send the link again. Deliberately answers the same way whether or not the
 * address exists, so it cannot be used to discover who has an account -- unlike
 * sign-up, where telling the truth is the more useful behaviour.
 */
async function resend(req, res) {
  const who = clientKey(req);
  if (overLimit('resend', who, 6)) { send(res, 429, { error: 'too_many' }); return true; }
  countAttempt('resend', who);
  const { email } = await readJson(req);
  const record = await auth.findUser(email ?? '');
  if (record && !record.verified_at && mail.isConfigured()) {
    await sendVerificationTo(req, { id: record.id, email: record.email });
  }
  send(res, 200, { ok: true });
  return true;
}

/**
 * The link from the mail. A GET, because that is what clicking a link is, and
 * it redirects to the app rather than answering with JSON a person would have
 * to read.
 */
async function verify(req, res, url) {
  const userId = await auth.consumeEmailToken(url.searchParams.get('token'));
  res.writeHead(303, {
    location: userId ? '/?verified=1' : '/?verified=0',
    'cache-control': 'no-store',
  });
  res.end();
  return true;
}

/**
 * Ask for a reset link.
 *
 * Always answers the same way, whether or not the address has an account. The
 * reply to "I forgot my password" must not be a way to find out who is
 * registered here -- and this is a site about care homes, where the list of
 * people with accounts is not a neutral fact about them.
 *
 * That means the rate limit has to count every attempt rather than only the
 * ones that found somebody, or the difference in behaviour would leak the
 * same thing the identical response is hiding.
 */
async function forgot(req, res) {
  const who = clientKey(req);
  if (overLimit('forgot', who, 5)) { send(res, 429, { error: 'too_many' }); return true; }
  countAttempt('forgot', who);

  const { email } = await readJson(req);
  if (!auth.isPlausibleEmail(email ?? '')) { send(res, 400, { error: 'bad_email' }); return true; }
  if (!mail.isConfigured()) { send(res, 409, { error: 'mail_unavailable' }); return true; }

  const record = await auth.findUser(email);
  if (record) {
    const token = await auth.createResetToken(record.id);
    const link = `${publicOrigin(req)}/?reset=${encodeURIComponent(token)}`;
    try {
      await mail.sendReset(record.email, link);
    } catch (err) {
      // Never logged with the address: the log would then be enough to take
      // over the account.
      console.error('reset mail failed:', err?.message);
    }
  }
  send(res, 200, { sent: true });
  return true;
}

/**
 * Set a new password from a reset link.
 *
 * The token is checked before the password is, so a valid-looking password
 * against a dead link cannot be used to tell a real token from an expired one
 * by which error comes back.
 */
async function resetPassword(req, res) {
  const who = clientKey(req);
  if (overLimit('reset', who, 10)) { send(res, 429, { error: 'too_many' }); return true; }
  countAttempt('reset', who);

  const { token, password } = await readJson(req);
  const userId = await auth.consumeResetToken(token);
  if (!userId) { send(res, 400, { error: 'bad_token' }); return true; }

  const problem = auth.passwordProblem(password);
  if (problem) {
    // The token is spent either way -- consumeResetToken deletes it -- so say
    // so plainly rather than leaving somebody typing into a dead form.
    send(res, 400, { error: problem, min: auth.PASSWORD_MIN, spent: true });
    return true;
  }

  await auth.setPassword(userId, password);
  send(res, 200, { reset: true });
  return true;
}

async function signin(req, res, secure) {
  const who = clientKey(req);
  if (overLimit('signin', who, 10)) { send(res, 429, { error: 'too_many' }); return true; }
  const { email, password } = await readJson(req);
  const record = await auth.findUser(email ?? '');

  // Verify even when there is no such user, against a hash that cannot match,
  // so the response time does not reveal whether the address is registered.
  const ok = record
    ? await auth.verifyPassword(password ?? '', record.password_hash)
    : await auth.verifyPassword(password ?? '', 'scrypt$32768$8$1$AAAA$AAAA');

  if (!record || !ok) {
    countAttempt('signin', who);
    send(res, 401, { error: 'bad_credentials' });
    return true;
  }

  // Correct password, unconfirmed address: say so specifically, because "wrong
  // password" would send someone hunting for a problem that is not there.
  if (!record.verified_at) { send(res, 403, { error: 'not_verified', email: record.email }); return true; }

  // A right password clears the record: the limit exists to slow guessing, not
  // to cap how often somebody may legitimately sign in.
  clearAttempts('signin', who);
  const { token, expires } = await auth.createSession(record.id);
  send(res, 200, { user: { email: record.email } }, { 'set-cookie': sessionCookie(token, expires, secure) });
  return true;
}

async function signout(req, res, secure) {
  await auth.destroySession(cookies(req)[COOKIE]);
  send(res, 200, { ok: true }, { 'set-cookie': clearCookie(secure) });
  return true;
}

async function me(req, res) {
  const user = await currentUser(req);
  send(res, 200, { user: user ? { email: user.email } : null });
  return true;
}

async function removeAccount(req, res, secure) {
  const user = await currentUser(req);
  if (!requireUser(res, user)) return true;
  // Sessions and visits carry ON DELETE CASCADE, so this removes everything
  // held about the person in one statement.
  await auth.deleteUser(user.id);
  send(res, 200, { ok: true }, { 'set-cookie': clearCookie(secure) });
  return true;
}

async function listVisits(req, res) {
  const user = await currentUser(req);
  if (!requireUser(res, user)) return true;
  const { rows } = await db.query(
    'SELECT plejecenter_id FROM visits WHERE user_id = $1 ORDER BY created_at DESC',
    [user.id],
  );
  send(res, 200, { visits: rows.map((r) => r.plejecenter_id) });
  return true;
}

const NOTE_MAX = 2000;

async function listNotes(req, res) {
  const user = await currentUser(req);
  if (!requireUser(res, user)) return true;
  const { rows } = await db.query(
    'SELECT plejecenter_id, body FROM notes WHERE user_id = $1',
    [user.id],
  );
  send(res, 200, { notes: Object.fromEntries(rows.map((r) => [r.plejecenter_id, r.body])) });
  return true;
}

/**
 * Write or clear one note. An empty body deletes rather than storing a blank
 * row, so clearing the box is the way to remove it and there is no second
 * control to explain.
 */
async function changeNote(req, res, id, method) {
  const user = await currentUser(req);
  if (!requireUser(res, user)) return true;
  if (!id || id.length > 64) { send(res, 400, { error: 'bad_id' }); return true; }

  if (method === 'DELETE') {
    await db.query('DELETE FROM notes WHERE user_id = $1 AND plejecenter_id = $2', [user.id, id]);
    send(res, 200, { note: null });
    return true;
  }

  const { body } = await readJson(req);
  const text = String(body ?? '').trim();
  if (text.length > NOTE_MAX) { send(res, 400, { error: 'note_too_long', max: NOTE_MAX }); return true; }

  if (text === '') {
    await db.query('DELETE FROM notes WHERE user_id = $1 AND plejecenter_id = $2', [user.id, id]);
    send(res, 200, { note: null });
    return true;
  }

  await db.query(
    `INSERT INTO notes (user_id, plejecenter_id, body) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, plejecenter_id)
     DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
    [user.id, id, text],
  );
  send(res, 200, { note: text });
  return true;
}

async function changeVisit(req, res, id, method) {
  const user = await currentUser(req);
  if (!requireUser(res, user)) return true;
  if (!id || id.length > 64) { send(res, 400, { error: 'bad_id' }); return true; }

  if (method === 'PUT') {
    await db.query(
      `INSERT INTO visits (user_id, plejecenter_id) VALUES ($1, $2)
       ON CONFLICT (user_id, plejecenter_id) DO NOTHING`,
      [user.id, id],
    );
    send(res, 200, { visited: true });
  } else {
    await db.query('DELETE FROM visits WHERE user_id = $1 AND plejecenter_id = $2', [user.id, id]);
    send(res, 200, { visited: false });
  }
  return true;
}

/* --------------------------------------------------------------- reviews -- */

/**
 * One plejecentre's ratings and approved reviews. Public: the score is the
 * point of the feature, and a score nobody can read without an account is not
 * one. Signed in, the reply also carries your own review whatever state it is
 * in, so the form can show you what you said.
 */
async function placeReviews(req, res, id) {
  if (!id || id.length > 64) { send(res, 400, { error: 'bad_id' }); return true; }
  const user = await currentUser(req);
  send(res, 200, await reviews.forPlace(id, user?.id ?? null));
  return true;
}

/** Every plejecentre's score in one reply, for the list and the map. */
async function allRatings(req, res) {
  send(res, 200, { ratings: await reviews.summaries() });
  return true;
}

async function putReview(req, res, id) {
  const user = await currentUser(req);
  if (!requireUser(res, user)) return true;
  if (!id || id.length > 64) { send(res, 400, { error: 'bad_id' }); return true; }

  // Rating is cheap to do and cheap to undo, so the limit is loose; it is here
  // to stop a script rewriting a thousand reviews a minute, not to ration
  // somebody changing their mind.
  const who = clientKey(req);
  if (overLimit('review', who, 60)) { send(res, 429, { error: 'too_many' }); return true; }
  countAttempt('review', who);

  // An unverified account can save places for itself; publishing under the
  // site's name is a different thing, and it waits for the address to be
  // confirmed. Otherwise anybody with a typo'd address can post as anybody.
  if (!(await auth.isVerified(user.id))) { send(res, 403, { error: 'unverified' }); return true; }

  const { stars, body } = await readJson(req);
  if (!reviews.validStars(stars)) { send(res, 400, { error: 'bad_stars' }); return true; }
  if (typeof body !== 'string' && body !== undefined) {
    send(res, 400, { error: 'bad_body' });
    return true;
  }
  const saved = await reviews.put(user.id, id, stars, body ?? '');
  send(res, 200, { mine: saved, ...(await reviews.forPlace(id, user.id)) });
  return true;
}

async function deleteReview(req, res, id) {
  const user = await currentUser(req);
  if (!requireUser(res, user)) return true;
  await reviews.remove(user.id, id);
  send(res, 200, await reviews.forPlace(id, user.id));
  return true;
}

/* --------------------------------------------------------------- traffic -- */

/**
 * The counting beacon. Deliberately fire-and-forget from the browser's side
 * and deliberately cheap here: it answers 204 with no body, so it can never
 * become a way to read anything back out.
 */
async function track(req, res) {
  const { event, id, locale } = await readJson(req);
  try {
    if (event === 'view') {
      await traffic.view({
        ip: clientKey(req),
        agent: req.headers['user-agent'],
        locale: String(locale ?? ''),
      });
    } else if (event === 'place' && typeof id === 'string') {
      await traffic.place(id);
    }
  } catch (err) {
    // Counting must never break the page it is counting.
    console.error('track failed:', err?.message);
  }
  res.writeHead(204, { 'cache-control': 'no-store' }).end();
  return true;
}

/* ----------------------------------------------------------------- admin -- */

/**
 * Everything under /api/admin/. One guard at the top rather than one per
 * handler, because a route added later would otherwise be public by omission.
 */
async function adminRoutes(req, res, path, method) {
  const user = await currentUser(req);
  if (!(await admin.isAdmin(user))) {
    // The same answer whether the caller is signed out, signed in as somebody
    // else, or an administrator who has not verified their address: none of
    // those need to learn which one they are.
    send(res, 403, { error: 'forbidden' });
    return true;
  }

  if (path === '/api/admin/overview' && method === 'GET') {
    const days = 30;
    const [totals, series, locales, top, topTotal, userStats, signups, reviewCounts] = await Promise.all([
      traffic.totals(),
      traffic.series(days),
      traffic.locales(days),
      traffic.topPlaces(days),
      traffic.placeCount(days),
      admin.userTotals(),
      admin.signups(days),
      reviews.counts(),
    ]);
    send(res, 200, {
      days, totals, series, locales, top, topTotal,
      users: userStats, signups, reviews: reviewCounts,
    });
    return true;
  }

  if (path === '/api/admin/users' && method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
    send(res, 200, await admin.users({ offset }));
    return true;
  }

  /*
   * The whole ranked list, rather than the eight the overview carries.
   *
   * A separate request because it is only wanted when somebody expands the
   * card, and sending a hundred and fifty rows to draw eight of them would
   * make every visit to the panel pay for a list most visits never open.
   */
  if (path === '/api/admin/places' && method === 'GET') {
    send(res, 200, { places: await traffic.topPlaces(30, 200) });
    return true;
  }

  if (path === '/api/admin/reviews' && method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const status = url.searchParams.get('status') ?? 'pending';
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      send(res, 400, { error: 'bad_status' });
      return true;
    }
    send(res, 200, { reviews: await reviews.queue(status), counts: await reviews.counts() });
    return true;
  }

  if (path.startsWith('/api/admin/reviews/') && method === 'POST') {
    const id = path.slice('/api/admin/reviews/'.length);
    if (!/^\d{1,19}$/.test(id)) { send(res, 400, { error: 'bad_id' }); return true; }
    const { decision } = await readJson(req);
    if (decision !== 'approve' && decision !== 'reject') {
      send(res, 400, { error: 'bad_decision' });
      return true;
    }
    const done = await reviews.decide(id, decision, user.id);
    send(res, done ? 200 : 409, done ? { ok: true } : { error: 'already_decided' });
    return true;
  }

  send(res, 404, { error: 'not_found' });
  return true;
}
