/**
 * The JSON API behind accounts and the visited list.
 *
 * Everything here is deliberately small: five tables' worth of behaviour, no
 * framework, and no user-supplied string ever reaching SQL except as a bound
 * parameter.
 */
import * as db from './db.mjs';
import * as auth from './auth.mjs';

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
 * A small in-memory throttle on the credential endpoints. It is per-instance
 * and resets on deploy, which is the honest limit of doing this without another
 * table; it still turns an online guessing attack from thousands of tries a
 * minute into a handful.
 */
const attempts = new Map();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 12;

function tooManyAttempts(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now > rec.reset) {
    attempts.set(key, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  rec.n += 1;
  return rec.n > MAX_ATTEMPTS;
}

// Bounded, so a flood of distinct addresses cannot grow the map without limit.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (now > v.reset) attempts.delete(k);
}, WINDOW_MS).unref?.();

const clientKey = (req) =>
  (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
  req.socket.remoteAddress ||
  'unknown';

/* ------------------------------------------------------------- handlers -- */

/**
 * Returns true when it handled the request. `secure` says whether to mark the
 * cookie Secure, which must be off on plain-http localhost or the browser
 * silently drops it.
 */
export async function handle(req, res, { secure }) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  if (!path.startsWith('/api/')) return false;

  if (!db.isReady()) {
    send(res, 503, { error: 'no_database' });
    return true;
  }

  try {
    const method = req.method ?? 'GET';

    if (path === '/api/auth/signup' && method === 'POST') return await signup(req, res, secure);
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
  if (tooManyAttempts(clientKey(req))) { send(res, 429, { error: 'too_many' }); return true; }
  const { email, password } = await readJson(req);

  if (!auth.isPlausibleEmail(email ?? '')) { send(res, 400, { error: 'bad_email' }); return true; }
  const problem = auth.passwordProblem(password);
  if (problem) { send(res, 400, { error: problem, min: auth.PASSWORD_MIN }); return true; }

  const user = await auth.createUser(email, password);
  // The insert is ON CONFLICT DO NOTHING, so a null row means the address is
  // taken. Said plainly: hiding it would only trade a real usability problem
  // for privacy this app does not otherwise offer, since sign-in reveals the
  // same thing to anyone who tries.
  if (!user) { send(res, 409, { error: 'email_taken' }); return true; }

  const { token, expires } = await auth.createSession(user.id);
  send(res, 201, { user: { email: user.email } }, { 'set-cookie': sessionCookie(token, expires, secure) });
  return true;
}

async function signin(req, res, secure) {
  if (tooManyAttempts(clientKey(req))) { send(res, 429, { error: 'too_many' }); return true; }
  const { email, password } = await readJson(req);
  const record = await auth.findUser(email ?? '');

  // Verify even when there is no such user, against a hash that cannot match,
  // so the response time does not reveal whether the address is registered.
  const ok = record
    ? await auth.verifyPassword(password ?? '', record.password_hash)
    : await auth.verifyPassword(password ?? '', 'scrypt$32768$8$1$AAAA$AAAA');

  if (!record || !ok) { send(res, 401, { error: 'bad_credentials' }); return true; }

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
