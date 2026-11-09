#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

backup_path=${1:-"backups/kisii-library-$(date -u +%Y%m%dT%H%M%SZ).archive"}
mkdir -p "$(dirname -- "$backup_path")"

docker compose exec -T mongo mongodump --db kisii-library --archive > "$backup_path"
test -s "$backup_path"
printf 'Database backup written to %s\n' "$backup_path"
