#!/usr/bin/env bash
#
# Install this app onto a VPS that is already doing other work.
#
# Written for the case it is actually going into: a 1 GB Oracle Always Free box
# with other services on it. So it checks before it touches, refuses rather
# than guesses, and never edits a file it did not write.
#
#   bash scripts/deploy-vps.sh --domain plejefinder.online
#   bash scripts/deploy-vps.sh --domain example.org --port 8090 --no-build
#
# Run scripts/server-survey.sh first and read it. This script re-checks the
# things that would break something, but the survey is what tells a person
# whether the plan is right at all.
#
# What it will NOT do, deliberately:
#   - touch an nginx site it did not create
#   - overwrite an existing .env
#   - restart a service that is not this app's
#   - change firewall rules (it prints the commands; you run them)
#   - obtain a TLS certificate (certbot needs DNS pointing here first)

set -euo pipefail

DOMAIN=""
APP_PORT=8080
APP_DIR=/srv/plejekort
DB_NAME=plejekort
DB_USER=pleje
REPO=https://github.com/mojtabafld/danmarkplejecenters.git
BRANCH=main
DO_BUILD=1
# `id -un` rather than $USER: under `set -u` a non-login shell that never
# exported USER would abort here, which is a silly way to fail a deploy.
RUN_USER="${SUDO_USER:-$(id -un)}"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --port) APP_PORT="$2"; shift 2 ;;
    --dir) APP_DIR="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --no-build) DO_BUILD=0; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    ok    %s\n' "$*"; }
warn() { printf '    warn  %s\n' "$*"; }
die()  { printf '\n\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "--domain is required (the name nginx will answer on)"

# --------------------------------------------------------------- preflight --
# Everything that could collide with another service is checked here, before
# anything is installed. A failure at this stage has changed nothing.

say "preflight"

[ "$(id -u)" -ne 0 ] || die "run as an ordinary user with sudo, not as root — the service should not run as root"
# `sudo -n true` first, because `sudo -v` validates against every sudoers rule
# and prompts if ANY of them wants a password -- even when the user also has a
# NOPASSWD: ALL rule that would let every command through. A real box had both
# (ubuntu NOPASSWD, %sudo with a password) and preflight stopped on a machine
# where nothing needed a password.
{ sudo -n true 2>/dev/null || sudo -v; } || die "this needs sudo"

if sudo ss -tln 2>/dev/null | grep -qE "[:.]${APP_PORT}[[:space:]]"; then
  sudo ss -tlnp 2>/dev/null | grep -E "[:.]${APP_PORT}[[:space:]]" | head -1
  die "port ${APP_PORT} is already in use. Pick another with --port."
fi
ok "port ${APP_PORT} is free"

NGINX_SITE="/etc/nginx/sites-available/plejekort.conf"
if [ -e "$NGINX_SITE" ]; then
  warn "$NGINX_SITE exists — it will be left alone. Delete it first to regenerate."
fi
if sudo grep -rlE "server_name[[:space:]]+[^;]*\b${DOMAIN}\b" \
     /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | grep -qv plejekort; then
  die "another nginx site already answers for ${DOMAIN}. Resolve that by hand."
fi
ok "no other nginx site claims ${DOMAIN}"

TOTAL_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
ok "memory: ${TOTAL_MB} MB RAM, ${SWAP_MB} MB swap"

# The build peaks at about 536 MB. On a 1 GB box, with the OS and Postgres
# also resident, that is the difference between a deploy and an OOM kill.
if [ "$DO_BUILD" -eq 1 ] && [ "$TOTAL_MB" -lt 2000 ] && [ "$SWAP_MB" -lt 1000 ]; then
  say "adding swap (RAM is ${TOTAL_MB} MB and the build peaks near 536 MB)"
  if [ ! -e /swapfile ]; then
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    sudo sysctl -q vm.swappiness=10
    ok "2 GB swap added"
  else
    sudo swapon /swapfile 2>/dev/null || true
    ok "/swapfile already present"
  fi
fi

# ------------------------------------------------------------- packages -----

say "packages"
NEED=()
command -v git >/dev/null || NEED+=(git)
command -v nginx >/dev/null || NEED+=(nginx)
command -v psql >/dev/null || NEED+=(postgresql)
# certbot is installed but never run: the certificate needs DNS pointing here
# first, which is a human's job. Installing it anyway means the command this
# script prints at the end actually exists when someone runs it -- it did not,
# and the deploy stopped at `certbot: command not found` with the site up and
# no https.
command -v certbot >/dev/null || NEED+=(certbot python3-certbot-nginx)
if [ ${#NEED[@]} -gt 0 ]; then
  sudo apt-get update -qq
  sudo apt-get install -y "${NEED[@]}"
  ok "installed: ${NEED[*]}"
else
  ok "git, nginx and postgresql already present"
fi

# The app pins node 22 in package.json engines.
NODE_MAJOR=0
command -v node >/dev/null && NODE_MAJOR=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 22 ]; then
  say "installing node 22 (found: ${NODE_MAJOR:-none})"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
ok "node $(node -v)"

# ------------------------------------------------------------- database -----

say "database"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  DB_PASS=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 24)
  sudo -u postgres psql -qc "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
  ok "created role ${DB_USER}"
  echo "    its password: ${DB_PASS}"
  echo "    (put it in ${APP_DIR}/.env — it is not stored anywhere else)"
else
  DB_PASS=""
  warn "role ${DB_USER} already exists; leaving its password alone"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres psql -qc "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  ok "created database ${DB_NAME}"
else
  ok "database ${DB_NAME} already there"
fi
# The schema is not created here: the app does it on first boot with
# CREATE TABLE IF NOT EXISTS, so there is no migration step to get wrong.

# --------------------------------------------------------------- the app ----

say "application"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$(dirname "$APP_DIR")"
  sudo git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
  sudo chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR"
  ok "cloned into $APP_DIR"
else
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
  ok "updated $APP_DIR to origin/$BRANCH"
fi

cd "$APP_DIR"
if [ "$DO_BUILD" -eq 1 ]; then
  # Full install, not --omit=dev: vite and typescript are devDependencies and
  # the build needs them. dist/ is gitignored, so it has to be built here.
  npm ci
  # Cap the heap so V8 collects rather than grows. It sizes itself from total
  # RAM, so on a 1 GB box it happily climbs until the kernel kills it -- which
  # is what happened here, mid-`vite build`, with swap barely touched. 512 MB
  # is above the 536 MB peak this build actually needs once it is made to try.
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}" npm run build
  ok "built dist/ ($(du -sh dist | cut -f1))"
else
  [ -d dist ] || die "--no-build was given but dist/ is not here. rsync it up first."
  npm ci --omit=dev
  ok "runtime dependencies installed; using the dist/ that is already here"
fi

# ------------------------------------------------------------------ .env ----

say "environment"
if [ -e "$APP_DIR/.env" ]; then
  warn ".env exists — left untouched"
else
  cat > "$APP_DIR/.env" <<EOF
# Written by scripts/deploy-vps.sh. Fill in the blanks before starting.
PORT=${APP_PORT}
PUBLIC_URL=https://${DOMAIN}

# sslmode=disable is correct over localhost and the app checks for it.
DATABASE_URL=postgres://${DB_USER}:${DB_PASS:-CHANGE_ME}@127.0.0.1:5432/${DB_NAME}?sslmode=disable

# Without these, sign-up refuses rather than creating accounts nobody can
# confirm. Port 587, not 25 — providers block 25 outbound.
SMTP_HOST=smtp.simply.com
SMTP_PORT=587
SMTP_USER=no-reply@${DOMAIN}
SMTP_PASS=
MAIL_FROM=Plejecentre <no-reply@${DOMAIN}>

# Comma-separated. Empty means /admin refuses everybody, which is the right
# default. Being listed is permission, not a way in: the address still needs a
# confirmed account with a password.
ADMIN_EMAILS=
EOF
  chmod 600 "$APP_DIR/.env"
  ok "wrote .env (mode 600) — SMTP_PASS is still blank"
  if [ -z "${DB_PASS}" ]; then
    warn "DATABASE_URL says CHANGE_ME: the role already existed, so this run"
    warn "never saw its password. Put the real one in .env before starting,"
    warn "or reset it:  sudo -u postgres psql -c \"ALTER USER ${DB_USER} PASSWORD 'new';\""
  fi
fi

# --------------------------------------------------------------- systemd ----

say "service"
sudo tee /etc/systemd/system/plejekort.service >/dev/null <<EOF
[Unit]
Description=Plejecentre map
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=3
# It serves static files and talks to a local database; it needs nothing else.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now plejekort
sleep 2
systemctl is-active --quiet plejekort && ok "plejekort is running" ||
  die "plejekort failed to start — journalctl -u plejekort -n 40"

# ----------------------------------------------------------------- nginx ----

say "nginx"
if [ ! -e "$NGINX_SITE" ]; then
  sudo tee "$NGINX_SITE" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        # Not optional. server.mjs decides whether to mark the session cookie
        # Secure from this header; without it sign-in fails silently, because
        # the browser drops a Secure-less cookie on https and says nothing.
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/plejekort.conf
  sudo nginx -t || die "nginx rejected the new site; it is at $NGINX_SITE"
  sudo systemctl reload nginx
  ok "site added and nginx reloaded (other sites untouched)"
else
  ok "site already present; not regenerated"
fi

# ------------------------------------------------------------------ next ----

IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "<this server's IP>")

cat <<EOF

$(printf '\033[1m')Installed. Three things are left, and they are deliberately not automated:$(printf '\033[0m')

1. Host firewall. Oracle's images DROP inbound traffic apart from SSH, and
   that is separate from the VCN security list in the console. Both have to
   allow 80 and 443:

       R=\$(sudo iptables -L INPUT --line-numbers -n | awk '/REJECT/{print \$1; exit}')
       sudo iptables -I INPUT \${R:-6} -m state --state NEW -p tcp --dport 80 -j ACCEPT
       sudo iptables -I INPUT \${R:-6} -m state --state NEW -p tcp --dport 443 -j ACCEPT
       sudo netfilter-persistent save

   \$R finds the REJECT that ends the chain. The 6 every Oracle guide quotes is
   only right for the stock chain; one extra rule and the new ones land after
   the REJECT, which iptables accepts and which does nothing.

2. DNS. Point ${DOMAIN} at ${IP} with an A record. Leave the MX, SPF, DKIM
   and DMARC records alone — deleting the zone to "start clean" takes the mail
   with it, and without mail nobody can register.

3. TLS, once DNS has propagated:

       sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}

Then check it from the outside:

       curl -s https://${DOMAIN}/api/health

That reports the database state, whether mail is configured, and which SMTP
variable names the process can see — names only, never values. If SMTP_PASS is
missing from that list, .env still has it blank.

EOF
