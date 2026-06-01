#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_NAME="${1:-${POSTGRES_DB:-wbs_platform}}"
POSTGRES_USER="${POSTGRES_USER:-wbs}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SAFE_DB_NAME="$(printf '%s' "$DB_NAME" | tr -c 'A-Za-z0-9_.-' '_')"
BACKUP_FILE="$BACKUP_DIR/${SAFE_DB_NAME}_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

if ! docker compose --profile api ps --status running --services | grep -qx "postgres"; then
  echo "PostgreSQL container is not running. Start it with: docker compose --profile api up -d postgres"
  exit 1
fi

docker compose --profile api exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$DB_NAME" >/dev/null

docker compose --profile api exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$DB_NAME" -Fc --no-acl --no-owner \
  > "$BACKUP_FILE"

BYTES="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"
echo "Backup created: $BACKUP_FILE"
echo "Database: $DB_NAME"
echo "Size: $BYTES bytes"

if command -v shasum >/dev/null 2>&1; then
  LC_ALL=C LANG=C shasum -a 256 "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
  echo "Checksum: $BACKUP_FILE.sha256"
fi
