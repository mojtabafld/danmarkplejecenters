# Deploying to a VPS

Written for an Oracle Always Free box, which is where this app went after
DigitalOcean App Platform, but nothing here is Oracle-specific except the
firewall section — and that section is the one people lose a day to.

English, like `DEVELOPMENT.md`, because it documents scripts whose own
comments are English. The README is Persian because it is for readers of the
site rather than whoever is operating it.

---

## What the app costs to run

Measured, not estimated:

| | |
|---|---|
| Server process, resident | **5 MB** (add ~40 MB once the Postgres pool is open) |
| `dist/`, the whole site | **2.1 MB** |
| Peak RAM during `npm run build` | **536 MB**, for about 11 seconds |

So the running app fits anywhere. The only thing that does not fit on a 1 GB
box is the *build*, and only for a few seconds. Two ways round it:

1. **Swap, and a heap cap.** 2 GB of swapfile, which `deploy-vps.sh` adds when
   RAM is under 2 GB and none exists — plus `--max-old-space-size=512`, which
   it now passes. Swap alone was not enough on a 954 MB box: V8 sizes its heap
   from total RAM, so it grew into the OOM killer mid-`vite build` with the
   swap barely touched. Capping the heap makes it collect instead.

   **Nothing else large should be running.** That build died with two Claude
   Code sessions resident on the same 954 MB. Run the deploy from a plain SSH
   session.
2. **Build elsewhere.** `dist/` is 2.1 MB, so building on a laptop and
   `rsync`-ing the result is fast and keeps the server at 5 MB the whole time.
   Use `--no-build` for this.

## Two scripts

```bash
bash scripts/server-survey.sh | tee survey.txt     # reads, changes nothing
bash scripts/deploy-vps.sh --domain example.org    # installs
```

Run the survey first and read it. It answers the questions that decide whether
the install can proceed unattended on a box that is already doing other work:
what holds port 80, whether there is an nginx to add a site to, whether
Postgres is there, how much memory is actually free, and whether the host
firewall is letting anything in.

`deploy-vps.sh` re-checks the things that could break something and **refuses
rather than guesses**. It will not touch an nginx site it did not create, will
not overwrite an existing `.env`, will not restart another service, will not
change firewall rules, and will not obtain a certificate. Flags:

| | |
|---|---|
| `--domain` | required; the name nginx answers on |
| `--port` | default 8080; it exits if that port is taken |
| `--dir` | default `/srv/plejekort` |
| `--no-build` | use a `dist/` that is already there |

## Environment

`deploy-vps.sh` writes `/srv/plejekort/.env` mode 600 and never overwrites it.
Coming from App Platform, three things change:

| Variable | On a VPS |
|---|---|
| `DATABASE_URL` | **changes** → `postgres://pleje:…@127.0.0.1:5432/plejekort?sslmode=disable` |
| `DATABASE_CA_CERT` | **drop it** — it existed for DigitalOcean's managed Postgres |
| `PORT` | **add it** — App Platform injected this; now you set it |
| `PUBLIC_URL` | unchanged |
| `SMTP_*`, `MAIL_FROM`, `ADMIN_EMAILS` | unchanged |

`sslmode=disable` is not laziness: the code checks for it explicitly and skips
TLS, which is right over localhost and wrong over a network.

`FORCE_SECURE_COOKIES` is not needed as long as nginx sends
`X-Forwarded-Proto` — see below, because that one is load-bearing.

The schema creates itself on first boot with `CREATE TABLE IF NOT EXISTS`.
There is no migration step.

## The three things the script deliberately leaves to a human

### 1. The host firewall

Oracle's images ship iptables rules that DROP inbound traffic apart from SSH.
This is **separate** from the VCN security list in the console, and both have
to allow the port. The console half cannot be done from inside the machine. Skip either and the site is unreachable while every piece
of configuration looks correct.

```bash
# In the console: VCN → Subnet → Security List → Ingress, 0.0.0.0/0 TCP 80,443
# Insert BEFORE the REJECT that ends the chain, wherever it happens to be.
# `-I INPUT 6` is the number every Oracle guide quotes, and it is only right
# for the stock chain. A real box had an extra rule in it, which would have
# put these two after the REJECT -- accepted by iptables, and useless.
REJECT_LINE=$(sudo iptables -L INPUT --line-numbers -n | awk '/REJECT/{print $1; exit}')
sudo iptables -I INPUT "${REJECT_LINE:-6}" -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT "${REJECT_LINE:-6}" -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 2. DNS

Point the domain at the server with an `A` record.

**Leave the MX, SPF, DKIM and DMARC records alone.** They are what makes mail
deliverable, and this app refuses sign-up when mail is unconfigured — so
deleting a DNS zone to "start clean" takes accounts down while the map carries
on working, which is a confusing way to find out.

The records this domain needs are in `DEVELOPMENT.md` under *Getting the mail
delivered*.

Lower the record's TTL to 300 a few hours before the switch, so a mistake is
five minutes of damage rather than a day of it.

### 3. TLS

Once DNS resolves to the server:

```bash
sudo certbot --nginx -d example.org -d www.example.org
```

App Platform did this invisibly. Certbot installs its own renewal timer, so it
is once per domain, not once per certificate lifetime.

## The nginx header that breaks sign-in

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

`server.mjs` decides whether to mark the session cookie `Secure` by reading
this header. Without it, on an https site, the browser is handed a cookie that
it drops — so sign-in fails, and nothing anywhere logs an error. `deploy-vps.sh`
writes it; if you hand-roll the config, do not lose it.

## Order of work, so the site never goes dark

1. Bring the new server all the way up and test it **by IP**. Change nothing
   at the old host yet.
2. Lower the DNS TTL to 300. Wait for the old TTL to expire.
3. Move the database, if there is one worth moving:
   ```bash
   pg_dump "$OLD_URL" --no-owner --no-acl -Fc -f pleje.dump
   pg_restore -d "postgres://pleje:…@127.0.0.1:5432/plejekort" --no-owner pleje.dump
   ```
4. Point the `A` record at the new IP. There is a short window without https.
5. Run certbot immediately.
6. Check from outside: `curl -s https://example.org/api/health`
7. Leave the old host alone for a week. Then delete it.

## `/api/health` is the first thing to check

It reports the database state, whether mail is configured, **which SMTP
variable names the process can see** — names only, never values — whether
`PUBLIC_URL` is set, and how many admin addresses are configured.

That turns "it does not work" into "the app cannot see `SMTP_PASS`", which is
the difference between guessing and knowing.

## Keeping it updated

App Platform rebuilt on every push to `main`. A VPS does not. Either:

```bash
cd /srv/plejekort && git pull && npm ci && npm run build && sudo systemctl restart plejekort
```

or, building locally and shipping only the 2.1 MB of output:

```bash
npm run build
rsync -az --delete dist/ user@server:/srv/plejekort/dist/
ssh user@server sudo systemctl restart plejekort
```
