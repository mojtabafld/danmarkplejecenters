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

export function connectionString() {
  return process.env.DATABASE_URL ?? process.env.DATABASE_URI ?? null;
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

CREATE TABLE IF NOT EXISTS visits (
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plejecenter_id TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
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
      throw new Error(
        'DATABASE_URL is not set. Attach the database to this component and add ' +
          'DATABASE_URL = ${<db-name>.DATABASE_URL} to its envs.',
      );
    }
    pool = new Pool({
      connectionString: url,
      ssl: url.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  await pool.query(SCHEMA);
  return pool;
}

export function query(text, params) {
  if (!pool) throw new Error('db.init() has not run');
  return pool.query(text, params);
}

export async function close() {
  await pool?.end?.();
  pool = null;
}

export function isReady() {
  return pool !== null;
}
