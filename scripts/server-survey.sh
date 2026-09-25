#!/usr/bin/env bash
#
# Read-only survey of a server before deploying this app onto it.
#
# Changes nothing. Run it, read it, and hand the output to whoever is planning
# the deploy -- it answers the questions that decide whether the install can go
# ahead unattended: is anything already on port 80, is there an nginx to add a
# site to rather than replace, is there a Postgres, is there enough memory to
# build, and is the host firewall letting anything in at all.
#
#   bash scripts/server-survey.sh | tee survey.txt
#
# Some of it needs root to be useful -- `ss` only names the process holding a
# port when it can read /proc for other users -- so it asks for sudo. Every
# command below reads; none writes.

set -uo pipefail

h() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

h "system"
if [ -r /etc/os-release ]; then . /etc/os-release; echo "os:     $PRETTY_NAME"; fi
echo "arch:   $(uname -m)"
echo "kernel: $(uname -r)"
echo "uptime: $(uptime -p 2>/dev/null || uptime)"

h "memory and disk"
free -h
echo
echo "--- swap ---"
swapon --show || echo "(no swap — a 1 GB box needs some to build this app)"
echo
# One line per filesystem, not per path: / /srv and /var are usually the same
# device, and printing it three times says nothing three times.
df -h / /srv /var 2>/dev/null | awk '!seen[$0]++'

h "listening ports"
# -p needs root to show which process owns a socket, which is the whole point.
if have ss; then
  sudo ss -tlnp 2>/dev/null || ss -tln
elif have netstat; then
  sudo netstat -tlnp 2>/dev/null || netstat -tln
else
  echo "(neither ss nor netstat is installed — install iproute2 to see this)"
fi

h "running services"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null |
  awk '{print $1}' || echo "(no systemd)"

h "web server"
for s in nginx apache2 httpd caddy; do
  have $s && echo "$s: $($s -v 2>&1 | head -1)"
done
if [ -d /etc/nginx ]; then
  echo "--- enabled nginx sites ---"
  ls -1 /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
  echo "--- their listen / server_name lines ---"
  sudo grep -rhE '^[[:space:]]*(server_name|listen)' \
    /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null |
    sed 's/^[[:space:]]*//' | sort -u
  echo "--- config test ---"
  sudo nginx -t 2>&1 | tail -2
fi

h "TLS certificates"
if have certbot; then
  sudo certbot certificates 2>/dev/null |
    grep -E 'Certificate Name|Domains|Expiry' || echo "(certbot installed, no certificates)"
else
  echo "(certbot not installed)"
fi

h "node"
have node && echo "node: $(node -v)" || echo "node: not installed (this app needs 22.x)"
have npm && echo "npm:  $(npm -v)"

h "postgres"
if have psql; then
  psql --version
  echo "--- databases ---"
  sudo -u postgres psql -tAc \
    "SELECT datname FROM pg_database WHERE datistemplate = false;" 2>/dev/null ||
    echo "(could not read the database list)"
  echo "--- roles ---"
  sudo -u postgres psql -tAc "SELECT rolname FROM pg_roles WHERE rolcanlogin;" 2>/dev/null
  echo "--- tuning that matters on a small box ---"
  sudo -u postgres psql -tAc \
    "SELECT name || ' = ' || setting FROM pg_settings
      WHERE name IN ('max_connections','shared_buffers','work_mem','effective_cache_size');" 2>/dev/null
else
  echo "(not installed)"
fi

h "docker"
if have docker; then
  sudo docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null || echo "(docker present but not readable)"
else
  echo "(not installed)"
fi

h "host firewall"
# Oracle's images ship iptables rules that DROP inbound except SSH, which is
# separate from the VCN security list and is the usual reason a new site is
# unreachable while everything looks correctly configured.
sudo iptables -S INPUT 2>/dev/null | head -30 || echo "(could not read iptables)"
have firewall-cmd && { echo "--- firewalld ---"; sudo firewall-cmd --list-all 2>/dev/null; }

h "ports this deploy wants"
if have ss || have netstat; then
  LISTEN=$( { sudo ss -tlnp 2>/dev/null || sudo netstat -tlnp 2>/dev/null; } )
  for p in 80 443 8080; do
    if printf '%s' "$LISTEN" | grep -qE "[:.]$p[[:space:]]"; then
      printf '%-5s BUSY  — %s\n' "$p" \
        "$(printf '%s' "$LISTEN" | grep -E "[:.]$p[[:space:]]" | head -1 | tr -s ' ')"
    else
      printf '%-5s free\n' "$p"
    fi
  done
else
  echo "(cannot tell — no ss or netstat)"
fi

h "outbound mail"
# Providers block 25; this app uses 587, so that is the one worth testing.
for hp in smtp.simply.com:587 smtp.simply.com:25; do
  host=${hp%:*}; port=${hp#*:}
  if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null; then
    echo "$hp reachable"
  else
    echo "$hp BLOCKED"
  fi
done

printf '\n===== done — nothing was changed =====\n'
