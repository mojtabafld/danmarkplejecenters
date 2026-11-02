# Cloudflare Pages preview setup

This checklist is for the isolated `migration/cloudflare-workers` branch only.

## 1. Create a staging PostgreSQL database

Create a new database or a disposable clone of the current schema. Do not use the production database or production credentials.

Apply `migrations/0001_initial.sql` manually to that staging database. The application deliberately skips all schema DDL at runtime.

## 2. Create a Hyperdrive configuration

Create a Hyperdrive configuration targeting the staging PostgreSQL database. Attach it to the Pages project as a binding named exactly:

`HYPERDRIVE`

The binding's connection string is consumed by the existing `pg` pool. Do not add a direct `DATABASE_URL` secret for production.

## 3. Configure Pages variables and secrets

Set these variables for the Preview environment first:

- `PUBLIC_URL`: the Cloudflare Pages preview URL (include `https://`, no trailing slash).
- `MAIL_FROM`: a sender address on a domain verified with Resend.
- `ADMIN_EMAILS`: comma-separated administrator email addresses.

Add these as encrypted secrets:

- `RESEND_API_KEY`: Resend API key for the verified sender domain.
- `TRAFFIC_HASH_SECRET`: a random secret used to derive a different, stable-per-day HMAC salt across Workers isolates. Generate locally with `openssl rand -hex 32`; do not commit it or paste it into GitHub.

The Pages runtime disables SMTP/Nodemailer. Do not configure `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, or `SMTP_URL` for this project.

## 4. Deploy only a Preview build

Connect the repository to Cloudflare Pages with:

- Production branch: leave unchanged / do not select the migration branch as production.
- Preview branch: `migration/cloudflare-workers`.
- Build command: `npm ci && npm run build`.
- Build output directory: `dist`.

Keep all bindings and secrets scoped to Preview until the full acceptance checklist passes.

## 5. Smoke checks

- Open `/api/health`: it should report a ready database and configured mail, without returning secret values.
- Confirm `/admin/` and the main map load from the Pages preview.
- Test signup, email verification, sign-in, sign-out, password reset, saved places, private notes, reviews, and admin moderation with disposable test accounts.
- Confirm a second account cannot read or edit another account's notes or saved places.
- Check Cloudflare logs for database TLS, mail, CPU-limit, and runtime errors.

Do not point production DNS at Pages, merge the branch, or attach production credentials until all tests pass and a separate cutover is approved.
