#!/usr/bin/env bash
# Verify a local backup by restoring into a new disposable database.
set -euo pipefail
backup_file=$(find /var/backups/plejefinder -maxdepth 1 -name 'plejefinder-*.dump' -type f | sort | tail -1)
[[ -n $backup_file ]]
restore_db=plejefinder_restorecheck_$(date -u +%s)_$$
runuser -u postgres -- createdb "$restore_db"
trap 'runuser -u postgres -- dropdb --if-exists "$restore_db"' EXIT
runuser -u postgres -- pg_restore --exit-on-error --no-owner --no-acl -d "$restore_db" < "$backup_file"
[[ $(runuser -u postgres -- psql -X -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','sessions','notes','visits','reviews','email_tokens','reset_tokens','counters','visitor_days','place_days')" "$restore_db") == 10 ]]
echo 'Local backup restored successfully into a disposable database; all ten app tables verified.'
