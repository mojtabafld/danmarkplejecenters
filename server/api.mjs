/**
 * The JSON API behind accounts and the visited list.
 *
 * Everything here is deliberately small: five tables' worth of behaviour, no
 * framework, and no user-supplied string ever reaching SQL except as a bound
 * parameter.
 */
import * as db from './db.mjs';
import * as auth from './auth.mjs';
import * as mail from './mail.mjs';

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
    send(res, 200, { ...db.status(), mail: mail.isConfigured() ? 'configured' : 'not_configured' });
    return true;
  }

  if (!db.isReady()) {
    // One more go before refusing. A managed database is often not accepting
    // connections in the seconds after a deploy, and the boot attempt may have
    // been the only one; without this, accounts stay broken until a redeploy.
    const recovered = await db.ensureSchema({ attempts: 1 });
    if (!recovered) {
      send(res, 503, { error: 'no_database' });
      return true;
    }
  }

  try {
    const method = req.method ?? 'GET';

    if (path === '/api/auth/signup' && method === 'POST') return await signup(req, res, secure);
    if (path === '/api/auth/resend' && method === 'POST') return await resend(req, res);
    if (path === '/verify' && method === 'GET') return await verify(req, res, url);
    if (path === '/api/auth/signin' && method === 'POST') return await signin(req, res, secure);
    if (path === '/api/auth/signout' && method === 'POST') return await signout(req, res, secure);
    if (path === '/api/auth/me' && method === 'GET') return await me(req, res);
    if (path === '/api/auth/account' && method === 'DELETE') return await removeAccount(req, res, secure);
    if (path === '/api/visits' && method === 'GET') return await listVisits(req, res);
    if (path.startsWith('/api/visits/') && (method === 'PUT' || method === 'DELETE')) {
      return await changeVisit(req, res, decodeURIComponent(path.slice('/api/visits/'.length)), method);
    }

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
  if (!mail.isConfigured()) { send(res, 503, { error: 'mail_unavailable' }); return true; }

  const user = await auth.createUser(email, password);
  // A null row means the unique index rejected it, so the address is taken.
  // Said plainly: hiding it would trade a real usability problem for privacy
  // this app does not otherwise offer, since sign-in reveals the same thing.
  if (!user) { send(res, 409, { error: 'email_taken' }); return true; }

  // No session yet. The account exists but is not usable until the address is
  // confirmed, which is the whole point of confirming it.
  const sent = await sendVerificationTo(req, user);
  if (!sent) { send(res, 502, { error: 'mail_failed' }); return true; }

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
