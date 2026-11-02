# Cloudflare migration — implementation record

Status: isolated migration branch; no production deployment, database connection, schema change, or DNS change has been made.

Target branch: `migration/cloudflare-workers`
Production branch: `main` (must remain unchanged until acceptance)

## Source audit (current `main`)

- Frontend: TypeScript + Vite, not React. Static output is `dist/`; the production build also creates a separate admin bundle with `vite.admin.config.ts`.
- Map: MapLibre GL with CARTO basemaps; map data is bundled under `src/data/`. No server-side map rendering is needed.
- Backend: Node.js ES modules. `server.mjs` serves static files and delegates API requests to `server/api.mjs`.
- Persistence: PostgreSQL via `pg` in `server/db.mjs`.
- Authentication: custom email/password flow in `server/auth.mjs`; passwords use Node `scrypt` (N=32768, r=8, p=1, 64-byte key); sessions are random 32-byte tokens in HttpOnly, SameSite=Lax cookies, with only SHA-256 token hashes stored in PostgreSQL. Verification and reset tokens are also hashed in the database.
- Mail: `server/mail.mjs` uses Nodemailer and SMTP environment variables.
- API surface includes signup, resend verification, verify link, forgot/reset password, signin/signout/me, account deletion, visits, private notes, tracking, ratings/reviews, and admin routes.
- Existing database initialization runs `ensureSchema()` and executes CREATE/ALTER statements. This behavior MUST NOT be invoked against the live production database during migration.

## Target deployment shape

Use Cloudflare Pages for the Vite static assets and Pages Functions for same-origin API routes. Pages Functions keep browser requests on the current site origin, so the existing HttpOnly cookie model can remain host-only and does not need a cross-origin cookie redesign.

Use Cloudflare Hyperdrive to connect Pages Functions to PostgreSQL through `pg`. Keep the current PostgreSQL provider initially; Hyperdrive can connect to an existing externally reachable PostgreSQL database. The first Cloudflare deployment must use a dedicated staging database, not the live DigitalOcean database.

## Non-negotiable safety boundaries

1. Do not edit `main`, the DigitalOcean App Platform spec, production environment variables, DNS, or production database.
2. Do not run the current `db.init()` against production: it automatically applies schema DDL.
3. Do not copy production database credentials into GitHub files, Wrangler config, or chat. Use encrypted Cloudflare secrets/bindings.
4. Do not run schema migrations automatically at Worker startup. Introduce an explicit, reviewed migration command and test it on a disposable/staging database first.
5. Keep the DigitalOcean deployment available as rollback until Cloudflare passes functional, security, and data-integrity checks.

## Porting work

### 1. Runtime and request handling
- Add a Pages Functions entrypoint for `/api/*` and `/verify`.
- Adapt the current Node request/response contract to the Fetch API, or refactor handlers to accept standard `Request` and return `Response`. Do not try to call `server.listen()` inside Workers.
- Preserve request-size limits, JSON validation, no-store API responses, secure cookie attributes, and the existing API response shapes.
- Keep static asset URLs and both Vite build outputs working on Pages; verify admin routes and deep links.

### 2. PostgreSQL
- Add a Worker-safe database initialization path that accepts the Hyperdrive binding and does not apply schema changes at startup.
- Pin `pg` to a version supported by Hyperdrive (Cloudflare currently documents `pg@8.16.3` or later).
- Keep SQL parameter binding and existing ownership checks. Validate all queries and transaction behavior against staging.
- Add a separate, explicit schema migration workflow; production schema changes are out of scope until separately approved.

### 3. Custom authentication
- Preserve the existing `scrypt` password format and verify existing hashes in the Worker runtime; do not silently downgrade password hashing or replace custom auth with a hosted auth product.
- Preserve token hashing, expiry, one-time token consumption, verified-email requirement, session invalidation on password reset, and cookie flags.
- Re-test scrypt CPU time under the actual Workers plan. Cloudflare's Free plan currently documents a 10 ms CPU limit per HTTP request; if the current scrypt parameters exceed the configured limit, do not deploy until an approved compatible approach is tested. Avoid changing existing password hashes in-place.
- Replace per-isolate in-memory authentication throttles with a shared rate-limiting mechanism before public launch; per-isolate Maps are not a reliable distributed limit.

### 4. Email
- Replace direct SMTP/Nodemailer with an HTTPS email provider API (or a Cloudflare-supported mail workflow). Keep the same verification and reset token lifecycle and message links.
- Keep provider credentials in Cloudflare secrets. Test delivery, bounce/error handling, and resend/reset rate limits.

### 5. Scheduled cleanup and observability
- Replace the Node startup `setInterval` cleanup with a Cloudflare Cron Trigger or an explicit scheduled cleanup workflow.
- Keep health output free of secret values and avoid logging tokens, passwords, full database connection strings, or private user data.

## Acceptance gates before cutover

- Existing `npm run build`, `npm test`, and `./verify.sh` remain green.
- Cloudflare preview passes all map, search, filter, locale (FA/DA/EN), theme, and deep-link checks.
- Auth tests cover signup, duplicate email, verification, resend, signin, signout, expiry, forgot/reset, old-session invalidation, account deletion, and scrypt verification.
- User data tests prove that visits and notes are visible only to their owner; review moderation and admin authorization remain intact.
- Test backup/restore and compare row counts/checksums before any future data migration.
- Only after explicit approval: deploy Cloudflare to a preview/staging hostname, validate, then schedule a controlled cutover. Keep DigitalOcean and its database untouched until rollback is no longer required.

## Current blocker / next implementation slice

The current backend modules are tightly coupled to Node's `IncomingMessage`/`ServerResponse`, `process.env`, module-level DB pool, SMTP transport, and startup timers. The next code change should introduce a Fetch-native API boundary and a DB adapter with schema initialization disabled by default for Workers. This should be done and tested on this branch before binding any real database or deploying.
