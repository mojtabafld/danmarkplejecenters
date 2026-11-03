# Oracle Ubuntu deployment

The `migration/oracle-ubuntu` branch builds and tests on GitHub-hosted runners,
then deploys to the dedicated `eu-core` self-hosted Linux x64 runner. Only pushes
to that branch can run this deployment; pull requests do not run on the server.

Node 22 is installed from the official versioned archive, verified against its
SHA-256 manifest. The app runs as the unprivileged `plejefinder` system user,
listening on `127.0.0.1:8080`. PostgreSQL runs locally. The app role owns only the
`plejefinder` database, and its generated password stays in
`/etc/plejefinder/app.env` (root-owned, 0640). This deployment uses the existing
Node backend and custom sessions; Supabase and Hyperdrive are not involved.

Runtime artifacts are built off-server. Secrets are never bundled or logged.
Releases live in `/srv/plejefinder/releases/<commit>`, with `current` pointing to
the active release. A failed startup health check restores the previous release
when one exists. Before later deployments, a database backup is taken. Schema
initialization remains the Node backend's existing additive CREATE/ALTER logic;
rolling code back does not roll database schema back.

## Email

Add all four GitHub repository Actions secrets:

- `OCI_SMTP_HOST`: region-specific OCI Email Delivery SMTP endpoint
- `OCI_SMTP_USER`: OCI SMTP credential username
- `OCI_SMTP_PASS`: OCI SMTP credential password
- `OCI_MAIL_FROM`: an approved sender address (or display name plus address)

The deployment uses port 465 with TLS. All four must be supplied together; when
absent, existing mail configuration is retained. On a fresh install, email and
signup remain disabled until configured. No test mail is sent by deployment.

## Website routing

Create a Published application route on the existing server Cloudflare Tunnel:
HTTP -> `127.0.0.1:8080`. Test with a separate staging hostname before moving
`plejefinder.online` away from Pages. PUBLIC_URL defaults to `https://oracle.plejefinder.online` for staging.
Set the repository Actions variable `ORACLE_PUBLIC_URL` to
`https://plejefinder.online` at production cutover and redeploy.

The website route is public. SSH Access policies remain scoped to the SSH host.
The app trusts forwarded headers from the local tunnel; it must not listen on a
public network interface. No firewall or SSH configuration is changed by deploy.

## Backups and verification

`plejefinder-backup.timer` runs daily. Custom-format pg_dump archives are retained
for seven days under `/var/backups/plejefinder`, root-only. Each deployment also restores a backup into a disposable local database and
checks all ten application tables. An off-server restore test is still required.
**Local backups do not survive deletion of the server disk.** Configure a separate
OCI Object Storage destination before treating the deployment as production.

Useful commands:

```bash
sudo systemctl status plejefinder --no-pager
curl -fsS http://127.0.0.1:8080/api/health
sudo systemctl status plejefinder-backup.timer --no-pager
sudo /usr/local/sbin/plejefinder-backup
```

Production data migration must be done separately before cutover if Supabase has
acquired accounts or other user data. At the initial Oracle preflight on
2026-11-03, users, notes, visits and reviews were all empty; the original database
and Cloudflare Pages deployment were retained.
