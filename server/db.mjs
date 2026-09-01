/**
 * Postgres access and schema.
 *
 * App Platform injects the connection string when a database is attached to
 * the component. The binding is not automatic: the component's envs must carry
 * DATABASE_URL = ${<db-name>.DATABASE_URL}, which is why a missing value here
 * is reported as a configuration mistake rather than a crash.
 */
import pg from 'pg';

const { Pool } = pg;

/** Set by init(); a Pool, or the one a test injected. */
let pool = null;
/** True only once the schema has actually been applied. */
let schemaReady = false;
/** Why the database is unusable, as a short code safe to return. */
let lastError = null;

export function connectionString() {
  return process.env.DATABASE_URL ?? process.env.DATABASE_URI ?? null;
}

/**
 * Remove sslmode from the URL, because pg lets it silently win.
 *
 * Passing `ssl: { rejectUnauthorized: false }` alongside a connection string
 * containing `sslmode=require` does NOT do what it looks like: pg parses the
 * string and the parsed value replaces the option, leaving `ssl: {}` -- TLS
 * with verification on. pg also treats `require` as `verify-full`. DigitalOcean
 * signs its certificates with its own CA, which is not in the container's trust
 * store, so the handshake fails and every query dies. Stripping the parameter
 * is what makes the explicit setting below take effect.
 */
function withoutSslMode(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Verify properly when given the CA, encrypt without verifying otherwise.
 *
 * DATABASE_CA_CERT is the certificate DigitalOcean offers on the database's
 * connection page. With it the chain is checked, which is what actually
 * prevents someone impersonating the database. Without it the connection is
 * still encrypted but unauthenticated, which is the usual arrangement inside a
 * provider's private network and is what the platform's own examples do.
 */
function sslConfig(url) {
  if (/[?&]sslmode=disable\b/.test(url)) return false;
  const ca = process.env.DATABASE_CA_CERT;
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

function tlsDescription() {
  const url = connectionString() ?? '';
  if (/[?&]sslmode=disable\b/.test(url)) return 'off';
  return process.env.DATABASE_CA_CERT ? 'verified against DATABASE_CA_CERT' : 'encrypted, certificate not verified';
}

/**
 * The schema, created on start-up.
 *
 * Kept idempotent so a deploy that reuses an existing database is a no-op and
 * a fresh one is set up without a separate migration step. There is exactly one
 * version of this schema; when it needs to change, this is the place.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  email_key     TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS email_tokens_user_id_idx ON email_tokens(user_id);

-- Password resets get their own table rather than sharing email_tokens.
-- Consuming an email token marks the address verified as a side effect, which
-- is exactly wrong here: somebody who never confirmed their address must not
-- be able to confirm it by asking for a password reset.
CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS reset_tokens_user_id_idx ON reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS visits (
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plejecenter_id TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plejecenter_id)
);

-- A note is deliberately its own table rather than a column on visits.
-- Unmarking a place would then delete the text somebody typed about it, and
-- losing written work to an unrelated click is not a trade worth making.
CREATE TABLE IF NOT EXISTS notes (
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plejecenter_id TEXT NOT NULL,
  body           TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plejecenter_id)
);

-- Added after the first release, so it has to be an ALTER rather than part of
-- the CREATE: an existing database already has the table and would skip it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
`;

/**
 * Open the pool and make sure the schema is there.
 *
 * `ssl.rejectUnauthorized: false` is what DigitalOcean's managed Postgres needs
 * from inside the platform: the certificate is signed by their own CA, which is
 * not in the container's trust store. The connection is still encrypted.
 */
export async function init({ injectedPool } = {}) {
  if (injectedPool) {
    pool = injectedPool;
  } else {
    const url = connectionString();
    if (!url) {
      lastError = 'DATABASE_URL is not set';
      throw new Error(
        'DATABASE_URL is not set. Attach the database to this component and add ' +
          'DATABASE_URL = ${<db-name>.DATABASE_URL} to its envs.',
      );
    }
    pool = new Pool({
      connectionString: withoutSslMode(url),
      ssl: sslConfig(url),
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    console.log('database TLS:', tlsDescription());
    // An idle client dropped by the network must not take the process with it.
    pool.on('error', (err) => {
      lastError = short(err);
      console.error('database pool error:', err.message);
    });
  }
  await ensureSchema();
  return pool;
}

/**
 * Apply the schema, and remember whether it worked.
 *
 * Separated from init() and retried, because "the database is there" and "the
 * tables are there" are different facts and the second one used to be assumed.
 * A managed database is also frequently not accepting connections yet in the
 * seconds after a deploy, and a single failed attempt at boot used to leave
 * accounts broken until somebody deployed again.
 */
export async function ensureSchema({ attempts = 3 } = {}) {
  if (schemaReady) return true;
  if (!pool) return false;
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query(SCHEMA);
      schemaReady = true;
      lastError = null;
      return true;
    } catch (err) {
      lastError = short(err);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  return false;
}

/**
 * A short, safe description of what went wrong. Never the driver's full
 * message: it can carry the host and the user name.
 */
function short(err) {
  const code = err?.code;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EHOSTUNREACH') {
    return 'cannot_reach_database';
  }
  if (code === 'ENOTFOUND') return 'host_not_found';
  if (code === '28P01' || code === '28000') return 'credentials_rejected';
  if (code === '3D000') return 'database_does_not_exist';
  if (code === '42501') return 'permission_denied';
  if (/self.signed|certificate/i.test(err?.message ?? '')) return 'tls_rejected';
  return code ? `pg_${code}` : 'unknown';
}

export function query(text, params) {
  if (!pool) throw new Error('db.init() has not run');
  return pool.query(text, params);
}

export async function close() {
  await pool?.end?.();
  pool = null;
  schemaReady = false;
}

/**
 * Usable, meaning a pool AND the tables. It used to mean only the first, so a
 * failed schema left the API reporting itself available and then answering 500
 * to every request that touched a table.
 */
export function isReady() {
  return pool !== null && schemaReady;
}

/** For the health endpoint and the start-up log. */
export function status() {
  if (!connectionString() && !pool) return { database: 'not_configured' };
  if (isReady()) return { database: 'ready' };
  return { database: 'unavailable', reason: lastError ?? 'unknown' };
}
