#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://sever:sever@localhost:5432/sever}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
FILE="$BACKUP_DIR/sever-$STAMP.dump"

command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" --file="$FILE"
pg_restore --list "$FILE" >/dev/null
echo "Backup created and verified: $FILE"
