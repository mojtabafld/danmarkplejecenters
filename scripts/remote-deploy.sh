#!/usr/bin/env bash
#
# The server half of an automatic deploy. Runs ON the server, fed over SSH by
# .github/workflows/deploy.yml:
#
#   ssh host 'bash -s' -- /srv/plejekort <commit> 8080 < scripts/remote-deploy.sh
#
# By the time this runs, the workflow has already built and tested the commit
# on GitHub's runner and copied the result into <app>/dist.next. Nothing is
# built here: the build peaks at 536 MB, and on a 1 GB server that is exactly
# what the kernel killed in September. All this does is install three runtime
# dependencies, swap two directories and restart one service.
#
# If the restarted service does not answer /api/health, it puts back the
# previous commit and the previous dist/ and restarts again, then exits
# non-zero so the workflow goes red. A bad deploy costs seconds of a broken
# site, not however long it takes somebody to notice.
#
# Needs: the app already installed by scripts/deploy-vps.sh (a git checkout
# with .env beside it), and `sudo -n systemctl restart plejekort` allowed
# without a password for the deploying user.

set -euo pipefail

APP_DIR="${1:?usage: remote-deploy.sh <app-dir> <commit> [port]}"
SHA="${2:?usage: remote-deploy.sh <app-dir> <commit> [port]}"
PORT="${3:-8080}"

say() { printf '==> %s\n' "$*"; }
die() { printf '!! %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR" || die "$APP_DIR does not exist — run scripts/deploy-vps.sh on this server first"
[ -d .git ] || die "$APP_DIR is not a git checkout"
[ -d dist.next ] || die "dist.next was not uploaded"
[ -f .env ] || die "$APP_DIR/.env is missing — the service would start without its database or mail"

healthy() {
  local i
  for i in $(seq 1 20); do
    curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

install_deps() {
  # Runtime dependencies only: vite and typescript are for the build, which
  # did not happen here.
  npm ci --omit=dev --no-audit --no-fund --loglevel=error
}

PREV="$(git rev-parse HEAD)"
say "deploying ${SHA:0:7} (was ${PREV:0:7})"

# The server's own code -- server.mjs and server/ -- comes from git, so it is
# always the same commit as the dist/ beside it. .env is untracked and a hard
# reset never touches untracked files.
git fetch --quiet origin
git reset --hard --quiet "$SHA"
install_deps

# Swap rather than sync in place, so the site is never serving half of one
# build and half of the next, and the previous build is still there to go
# back to.
rm -rf dist.prev
[ -d dist ] && mv dist dist.prev
mv dist.next dist

sudo -n systemctl restart plejekort

if healthy; then
  say "healthy on :${PORT}"
  curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health"; echo
  exit 0
fi

# ------------------------------------------------------------- rollback ----
printf '!! the new version did not answer /api/health — rolling back to %s\n' "${PREV:0:7}" >&2
sudo -n journalctl -u plejekort -n 30 --no-pager 2>/dev/null || true

git reset --hard --quiet "$PREV"
install_deps
rm -rf dist.failed
mv dist dist.failed
[ -d dist.prev ] && mv dist.prev dist
sudo -n systemctl restart plejekort

if healthy; then
  printf '!! rolled back; %s is serving again. The failed build is in dist.failed\n' "${PREV:0:7}" >&2
else
  printf '!! rollback ALSO did not come up healthy — look at journalctl -u plejekort\n' >&2
fi
exit 1
