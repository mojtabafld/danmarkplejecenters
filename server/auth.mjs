/**
 * Passwords and sessions.
 *
 * No dependencies: scrypt, randomBytes and timingSafeEqual are all in Node's
 * crypto module, and a password hash is not the place to take on a supply
 * chain. scrypt is memory-hard, which is the property that matters against
 * offline cracking of a stolen table.
 */
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import * as db from './db.mjs';

const scryptAsync = promisify(scrypt);

/** Cost parameters. N=2^15 keeps a single hash around 100ms on small hardware. */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 60;

/* ------------------------------------------------------------- passwords -- */

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/**
 * Compare in constant time. A plain === on hashes leaks, through timing, how
 * many leading bytes matched, which is enough to reconstruct a value byte by
 * byte given enough attempts.
 */
export async function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  let actual;
  try {
    actual = await scryptAsync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* -------------------------------------------------------------- sessions -- */

/**
 * The cookie carries the raw token; the table stores only its SHA-256. Someone
 * who reads the database still cannot mint a cookie from it, which is the same
 * reason passwords are not stored either.
 */
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, expires],
  );
  return { token, expires };
}

export async function userForToken(token) {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function destroySession(token) {
  if (!token) return;
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/* --------------------------------------------------- e-mail verification -- */

const VERIFY_HOURS = 24;

/**
 * Mint a verification token. Only its hash is stored, for the same reason as
 * session tokens: the row is useless to anyone who reads the table.
 *
 * Any earlier token for the same user is dropped, so "resend" invalidates the
 * previous link rather than leaving several live at once.
 */
export async function createEmailToken(userId) {
  const token = randomBytes(32).toString('base64url');
  await db.query('DELETE FROM email_tokens WHERE user_id = $1', [userId]);
  await db.query(
    'INSERT INTO email_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, new Date(Date.now() + VERIFY_HOURS * 3600e3)],
  );
  return token;
}

/**
 * Consume a token. Returns the user id it belonged to, or null.
 *
 * The DELETE decides: it returns a row only if one was actually removed, so two
 * simultaneous clicks on the same link cannot both succeed. Marking the user
 * verified is idempotent, so a second click on an already-used link simply
 * finds nothing and reports failure.
 */
export async function consumeEmailToken(token) {
  if (!token) return null;
  const { rows } = await db.query(
    'DELETE FROM email_tokens WHERE token_hash = $1 AND expires_at > now() RETURNING user_id',
    [hashToken(token)],
  );
  const userId = rows[0]?.user_id;
  if (userId === undefined) return null;
  await db.query('UPDATE users SET verified_at = now() WHERE id = $1 AND verified_at IS NULL', [userId]);
  return userId;
}

export async function isVerified(userId) {
  const { rows } = await db.query('SELECT verified_at FROM users WHERE id = $1', [userId]);
  return Boolean(rows[0]?.verified_at);
}

/* ---------------------------------------------------------------- users --- */

/** Case- and whitespace-insensitive for lookup; the typed form is kept for display. */
export const emailKey = (email) => String(email).trim().toLowerCase();

/**
 * Deliberately loose. The only thing worth rejecting here is input that cannot
 * be an address at all; anything stricter turns into a rule that refuses
 * somebody's real address, and this app never sends mail to it.
 */
export function isPlausibleEmail(email) {
  const e = emailKey(email);
  return e.length >= 3 && e.length <= 254 && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(e);
}

export const PASSWORD_MIN = 10;

export function passwordProblem(password) {
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN) return 'too_short';
  if (p.length > 200) return 'too_long';
  return null;
}

/**
 * Returns the new user, or null when the address is already registered.
 *
 * The unique index decides, and a violation is caught rather than pre-checked:
 * a SELECT-then-INSERT has a window in which two simultaneous sign-ups both see
 * nothing and both insert. 23505 is Postgres' unique_violation.
 */
export async function createUser(email, password) {
  const hash = await hashPassword(password);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (email, email_key, password_hash) VALUES ($1, $2, $3)
       RETURNING id, email`,
      [String(email).trim(), emailKey(email), hash],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err?.code === '23505') return null;
    throw err;
  }
}

export async function findUser(email) {
  const { rows } = await db.query(
    'SELECT id, email, password_hash, verified_at FROM users WHERE email_key = $1',
    [emailKey(email)],
  );
  return rows[0] ?? null;
}

export async function deleteUser(userId) {
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
}
