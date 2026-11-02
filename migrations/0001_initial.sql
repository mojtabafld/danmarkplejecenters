-- Initial schema for an isolated Cloudflare migration/staging database.
-- This file is intentionally NOT executed by application startup.
-- Apply manually only to a new, disposable/staging PostgreSQL database after review.
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

-- One review per person per plejecenter, upserted rather than appended: a
-- second visit changes your mind, it does not give you a second vote.
--
-- The stars and the words are moderated differently on purpose. A star is a
-- number in an average and counts the moment it is cast; written text is
-- published under the site's name to everybody, so it waits for a human. That
-- is why the status column gates the body and never the rating; see reviews.mjs.
CREATE TABLE IF NOT EXISTS reviews (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plejecenter_id TEXT NOT NULL,
  stars          SMALLINT NOT NULL,
  body           TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,
  decided_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (user_id, plejecenter_id)
);

CREATE INDEX IF NOT EXISTS reviews_place_idx ON reviews(plejecenter_id);
CREATE INDEX IF NOT EXISTS reviews_pending_idx ON reviews(created_at) WHERE status = 'pending';

-- Traffic, as counters rather than events.
--
-- There is no row per visit and nothing that identifies a person: a day, what
-- is being counted, and how many. The metric is 'view' for a page load,
-- 'locale:<code>' for which language it was read in, and 'place:<id>' for a
-- plejecenter someone opened.
CREATE TABLE IF NOT EXISTS counters (
  day    DATE NOT NULL,
  metric TEXT NOT NULL,
  n      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);

-- Unique visitors, and the reason this is one row per visitor per day rather
-- than a counter: counting distinct people needs to know whether this one has
-- been seen today, which a running total cannot answer.
--
-- What is stored is a hash of the address and browser under a random salt that
-- this process invents at start-up and throws away at midnight. It cannot be
-- reversed to an address, and the same visitor tomorrow hashes to something
-- unrelated, so there is nothing here that follows anybody between days. Rows
-- older than the retention window are deleted outright.
CREATE TABLE IF NOT EXISTS visitor_days (
  day     DATE NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (day, visitor)
);

-- Added after the first release, so it has to be an ALTER rather than part of
-- the CREATE: an existing database already has the table and would skip it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Also added later: the day the note is ABOUT, which the reader picks.
--
-- Not the same fact as updated_at, and that is the whole reason for the
-- column: updated_at is when the row was written, and somebody typing up four
-- visits on a Sunday evening needs to say which day each of them was. A DATE
-- rather than a timestamp, because nobody wants to record the minute they
-- walked in, and nullable, because a note without a date is still a note.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS visited_on DATE;
