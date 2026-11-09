#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

backup_path=${1:?Usage: sh scripts/restore-to-new-db.sh BACKUP_FILE [TARGET_DATABASE]}
target_db=${2:-"kisii-library-recovery-$(date -u +%Y%m%d%H%M%S)"}

case "$target_db" in
    *[!A-Za-z0-9_-]*|'')
        printf 'Target database name may contain only letters, numbers, underscores, and hyphens.\n' >&2
        exit 2
        ;;
esac
test -s "$backup_path"

docker compose exec -T mongo mongorestore \
    --archive \
    --nsFrom='kisii-library.*' \
    --nsTo="${target_db}.*" \
    < "$backup_path"
printf 'Restored backup into %s. Verify it before changing the API MONGO_URI.\n' "$target_db"
