#!/usr/bin/env bash
# Run only on the dedicated eu-core Ubuntu runner with a GitHub-built artifact.
set -euo pipefail
set +x
umask 077
[[ $(id -un) == ubuntu && $(hostname -s) == eu-core ]] || { echo 'Unexpected deployment host'; exit 1; }
sudo -n true
[[ ${RELEASE_SHA:-} =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ -f release.tar.gz ]]
app_root=/srv/plejefinder
if [[ ! -e $app_root/current ]] && sudo ss -tln | awk '{print $4}' | grep -qE ':8080$'; then
  echo 'Port 8080 belongs to another service'; exit 1
fi
export DEBIAN_FRONTEND=noninteractive
sudo -n apt-get update -qq
sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql curl ca-certificates xz-utils python3
# No builds run here. A small swap file covers package installation and bursts.
if [[ $(free -m | awk '/^Swap:/{print $2}') == 0 && ! -e /var/swap.plejefinder ]]; then
  sudo fallocate -l 1G /var/swap.plejefinder
  sudo chmod 600 /var/swap.plejefinder
  sudo mkswap /var/swap.plejefinder >/dev/null
  sudo swapon /var/swap.plejefinder
  echo '/var/swap.plejefinder none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
stage_dir=$(mktemp -d)
trap 'rm -rf "$stage_dir"' EXIT
tar -xzf release.tar.gz -C "$stage_dir"
node_version=$(cat "$stage_dir/node.version")
[[ $node_version =~ ^v22\.[0-9]+\.[0-9]+$ ]] || exit 2
node_dir=/opt/plejefinder-node/$node_version
if [[ ! -x $node_dir/bin/node ]]; then
  node_archive=node-$node_version-linux-x64.tar.xz
  curl -fLsS --retry 3 "https://nodejs.org/dist/$node_version/$node_archive" -o "$stage_dir/$node_archive"
  curl -fLsS --retry 3 "https://nodejs.org/dist/$node_version/SHASUMS256.txt" -o "$stage_dir/SHASUMS256.txt"
  (cd "$stage_dir"; grep "  $node_archive\$" SHASUMS256.txt | sha256sum -c -)
  sudo install -d "$node_dir"
  sudo tar -xJf "$stage_dir/$node_archive" -C "$node_dir" --strip-components=1
  rm "$stage_dir/$node_archive" "$stage_dir/SHASUMS256.txt"
fi
export PATH="$node_dir/bin:$PATH"
(cd "$stage_dir"; npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
if ! id plejefinder >/dev/null 2>&1; then
  sudo useradd --system --user-group --home-dir /var/lib/plejefinder --create-home --shell /usr/sbin/nologin plejefinder
fi
sudo install -d -m 755 "$app_root/releases"
sudo install -d -m 750 -o root -g plejefinder /etc/plejefinder
sudo systemctl enable --now postgresql
# Values remain in the process environment and root-owned config, never logs.
sudo -n --preserve-env=OCI_SMTP_HOST,OCI_SMTP_USER,OCI_SMTP_PASS,OCI_MAIL_FROM python3 "$stage_dir/scripts/oracle/configure.py"
# The service owns this database only; tune its own connection usage via PGOPTIONS.
release_dir=$app_root/releases/$RELEASE_SHA
if [[ ! -d $release_dir ]]; then
  sudo cp -a "$stage_dir" "$release_dir"
  sudo chown -R root:root "$release_dir"
  sudo chmod -R a+rX "$release_dir"
fi
sudo tee /etc/systemd/system/plejefinder.service >/dev/null <<UNIT
[Unit]
Description=Plejefinder website and API
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service
[Service]
Type=simple
User=plejefinder
Group=plejefinder
WorkingDirectory=$app_root/current
EnvironmentFile=/etc/plejefinder/app.env
ExecStart=$node_dir/bin/node --max-old-space-size=192 server.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
# Make a backup before deploying a future release. First boot has no tables yet.
if sudo -u postgres psql -d plejefinder -tAc "SELECT to_regclass('public.users') IS NOT NULL" | grep -qx t; then
  sudo bash "$stage_dir/scripts/oracle/backup.sh"
fi
previous=$(readlink "$app_root/current" || true)
sudo ln -sfn "$release_dir" "$app_root/current.next"
sudo mv -Tf "$app_root/current.next" "$app_root/current"
sudo systemctl daemon-reload
sudo systemctl enable plejefinder
sudo systemctl restart plejefinder
healthy=0
for attempt in {1..30}; do
  if curl -fsS --max-time 3 http://127.0.0.1:8080/api/health -o "$stage_dir/health.json" && python3 -c 'import json,sys; sys.exit(json.load(open(sys.argv[1])).get("database") != "ready")' "$stage_dir/health.json"; then
    healthy=1; break
  fi
  sleep 2
done
if [[ $healthy != 1 ]]; then
  echo 'New release failed health check'
  if [[ -n $previous ]]; then
    sudo ln -sfn "$previous" "$app_root/current"
    sudo systemctl restart plejefinder
    echo 'Previous release restored'
  fi
  exit 1
fi
sudo install -m 755 "$stage_dir/scripts/oracle/backup.sh" /usr/local/sbin/plejefinder-backup
sudo install -d -m 700 /var/backups/plejefinder
sudo tee /etc/systemd/system/plejefinder-backup.service >/dev/null <<'UNIT'
[Unit]
Description=Back up the local Plejefinder PostgreSQL database
After=postgresql.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/plejefinder-backup
UMask=0077
UNIT
sudo tee /etc/systemd/system/plejefinder-backup.timer >/dev/null <<'UNIT'
[Unit]
Description=Daily Plejefinder database backup
[Timer]
OnCalendar=*-*-* 03:15:00 UTC
Persistent=true
RandomizedDelaySec=10m
[Install]
WantedBy=timers.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now plejefinder-backup.timer
sudo /usr/local/sbin/plejefinder-backup
curl -fsS http://127.0.0.1:8080/api/ratings
curl -fsS http://127.0.0.1:8080/api/auth/me
curl -fsS http://127.0.0.1:8080/admin/ -o /dev/null
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("Application health:",json.dumps(d))' "$stage_dir/health.json"
echo 'Oracle release is running on 127.0.0.1:8080 with local PostgreSQL.'
