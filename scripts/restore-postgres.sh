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

usage() {
  echo "Usage: CONFIRM_RESTORE=YES bash scripts/restore-postgres.sh <backup.dump> [database]"
  echo "Example: CONFIRM_RESTORE=YES bash scripts/restore-postgres.sh backups/postgres/wbs_platform_20260601-120000.dump wbs_platform"
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "Restore is destructive. Re-run with CONFIRM_RESTORE=YES after confirming the target database."
  usage
  exit 1
fi

BACKUP_FILE="$1"
DB_NAME="${2:-${POSTGRES_DB:-wbs_platform}}"
POSTGRES_USER="${POSTGRES_USER:-wbs}"

if [[ "$BACKUP_FILE" != /* ]]; then
  BACKUP_FILE="$ROOT_DIR/$BACKUP_FILE"
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

if ! docker compose --profile api ps --status running --services | grep -qx "postgres"; then
  echo "PostgreSQL container is not running. Start it with: docker compose --profile api up -d postgres"
  exit 1
fi

docker compose --profile api exec -T postgres pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null

docker compose --profile api exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -v dbname="$DB_NAME" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'dbname'
  AND pid <> pg_backend_pid();
SQL

docker compose --profile api exec -T postgres dropdb --if-exists -U "$POSTGRES_USER" "$DB_NAME"
docker compose --profile api exec -T postgres createdb -U "$POSTGRES_USER" "$DB_NAME"

docker compose --profile api exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$DB_NAME" --no-owner --no-acl \
  < "$BACKUP_FILE"

echo "Restore completed: $DB_NAME"
echo "Source: $BACKUP_FILE"
