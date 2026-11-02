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

The migration branch now contains a Fetch-to-legacy adapter. It adapts Web `Request` bodies and headers to the small IncomingMessage-like interface expected by `server/api.mjs`, and converts the existing response writer back to a Web `Response`. The API route and `/verify` route now call the real existing API handlers rather than returning a placeholder 503. Request bodies remain capped at 4 KiB, and the client IP / origin headers are rebuilt from Cloudflare edge metadata rather than trusting an incoming X-Forwarded-For value.

Use Cloudflare Hyperdrive to connect Pages Functions to PostgreSQL through `pg`. Keep the current PostgreSQL provider initially; Hyperdrive can connect to an existing externally reachable PostgreSQL database. The first Cloudflare deployment must use a dedicated staging database, not the live DigitalOcean database. The Pages Function sets `skipSchema: true` and verifies the connection with `SELECT 1`; it never runs the embedded DDL. An explicit starter schema is in `migrations/0001_initial.sql` for a new staging database only.

Cloudflare Pages uses a Hyperdrive binding named `HYPERDRIVE` and a Durable Object binding named `AUTH_RATE_LIMITER` (the latter is deployed separately from `workers/auth-rate-limiter`). Add `RESEND_API_KEY` and `TRAFFIC_HASH_SECRET` as secrets, and `MAIL_FROM`, `PUBLIC_URL`, and `ADMIN_EMAILS` as variables/secrets as appropriate. Do not add the live DigitalOcean database credentials. Use a separate staging database and staging credentials. The Pages runtime sends mail through Resend's HTTPS API; raw SMTP variables are deliberately cleared in this runtime.

## Non-negotiable safety boundaries

1. Do not edit `main`, the DigitalOcean App Platform spec, production environment variables, DNS, or production database.
2. Do not run the current `db.init()` against production: it automatically applies schema DDL.
3. Do not copy production database credentials into GitHub files, Wrangler config, or chat. Use encrypted Cloudflare secrets/bindings.
4. Do not run schema migrations automatically at Worker startup. Introduce an explicit, reviewed migration command and test it on a disposable/staging database first.
5. Keep the DigitalOcean deployment available as rollback until Cloudflare passes functional, security, and data-integrity checks.

## Porting work

### 1. Runtime and request handling
- [x] Add Pages Functions entrypoints for `/api/*` and `/verify`.
- [x] Add a Fetch adapter for the current Node request/response interface. Do not call `server.listen()` inside Workers.
- [x] Preserve the 4 KiB request-size limit, JSON validation, no-store API responses, secure cookie attributes, and existing API response shapes in the adapter.
- [ ] Verify static asset URLs, both Vite build outputs, admin routes, and deep links with a Cloudflare Pages preview.

### 2. PostgreSQL
- [x] Add a Worker-safe database initialization option that skips all schema DDL.
- [x] Add an explicit starter SQL schema for a fresh staging database.
- [x] Add a `HYPERDRIVE` binding only under `env.production` in `wrangler.toml`; preview has no database binding. The production environment repeats the Durable Object binding because Wrangler environments do not inherit bindings.
- [ ] Verify the Hyperdrive origin points to the intended disposable/staging Supabase database, confirm Cloudflare can reach that endpoint (Direct Supabase endpoints may require IPv4 support or the Supabase pooler), and validate all queries and ownership checks against staging.
- Keep SQL parameter binding and production schema changes out of scope until separately approved.

### 3. Custom authentication
- Preserve the existing `scrypt` password format and verify existing hashes in the Worker runtime; do not silently downgrade password hashing or replace custom auth with a hosted auth product.
- Preserve token hashing, expiry, one-time token consumption, verified-email requirement, session invalidation on password reset, and cookie flags.
- Verify that the Workers runtime supports the exact Node.js `scrypt` API used here, then benchmark the existing N=32768 parameters under the selected plan and configured CPU budget. If the operation is unsupported or exceeds the budget, do not deploy until an approved compatible approach is tested. Avoid changing existing password hashes in-place.
- [x] Add a shared Durable Object rate limiter for credential endpoints; the Pages Function fails closed if the configured limiter is unavailable. The old in-memory throttle remains a secondary layer.

### 4. Email
- [x] Add a Resend HTTPS transport adapter while retaining Nodemailer for the unchanged Node/DigitalOcean deployment.
- [x] Keep verification/reset token creation and message content in the existing application modules.
- [ ] Configure a verified sender domain and `RESEND_API_KEY` only in Cloudflare secrets. Test delivery, bounce/error handling, and resend/reset rate limits.

### 5. Scheduled cleanup and observability
- [x] Remove the API rate-limit map's periodic timer; expired entries are pruned opportunistically and the map is bounded.
- [x] Use a daily HMAC salt from `TRAFFIC_HASH_SECRET` so the same visitor hashes consistently across isolates; unique visitor hashes are skipped in Workers if this secret is absent.
- [x] Deduplicate daily place opens in PostgreSQL so multiple isolates cannot double-count the same place.
- [ ] Move the daily traffic retention cleanup to a Cloudflare Cron Trigger before launch.
- Keep health output free of secret values and avoid logging tokens, passwords, full database connection strings, or private user data.

## Acceptance gates before cutover

- Existing `npm run build`, `npm test`, and `./verify.sh` remain green.
- Cloudflare preview passes all map, search, filter, locale (FA/DA/EN), theme, and deep-link checks.
- Auth tests cover signup, duplicate email, verification, resend, signin, signout, expiry, forgot/reset, old-session invalidation, account deletion, and scrypt verification.
- User data tests prove that visits and notes are visible only to their owner; review moderation and admin authorization remain intact.
- Test backup/restore and compare row counts/checksums before any future data migration.
- Only after explicit approval: deploy Cloudflare to a preview/staging hostname, validate, then schedule a controlled cutover. Keep DigitalOcean and its database untouched until rollback is no longer required.

## Current blocker / next implementation slice

The first runtime port and production-only Hyperdrive binding are committed on the isolated migration branch. The preview environment intentionally has no `HYPERDRIVE` binding. The binding references the existing Hyperdrive config `plejefinder-db` (`6fe7a645ae83497c8c95a103797d309b`); this does not prove that its origin is reachable or that it targets a disposable staging database. Before any production deployment, inspect the Hyperdrive origin metadata (without exposing credentials), verify database connectivity, and validate the existing API end-to-end against staging. Other required steps: deploy the separate rate-limiter Worker; configure Resend + the traffic hash secret; move traffic pruning to Cron; and benchmark the existing scrypt cost under the chosen Workers plan. The preview must not be used for real accounts until these gates pass.
