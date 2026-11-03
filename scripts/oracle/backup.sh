#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=/var/backups/plejefinder
install -d -m 700 "$backup_dir"
backup_file=$backup_dir/plejefinder-$(date -u +%Y%m%dT%H%M%SZ).dump
runuser -u postgres -- pg_dump -Fc plejefinder > "$backup_file.tmp"
runuser -u postgres -- pg_restore --list < "$backup_file.tmp" >/dev/null
mv "$backup_file.tmp" "$backup_file"
find "$backup_dir" -maxdepth 1 -name 'plejefinder-*.dump' -type f -mtime +7 -delete
printf 'Local PostgreSQL backup created and archive verified.\n'
