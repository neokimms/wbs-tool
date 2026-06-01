#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-wbs}"
POSTGRES_DB="${POSTGRES_DB:-wbs_platform}"
WBS_API_PORT="${WBS_API_PORT:-8000}"
WBS_PORTAL_PORT="${WBS_PORTAL_PORT:-3010}"
OPENPROJECT_HOST_NAME="${OPENPROJECT_HOST_NAME:-localhost:8080}"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
POSTGRES_EXPORTER_PORT="${POSTGRES_EXPORTER_PORT:-9187}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
FAILURES=0
WARNINGS=0

ok() {
  printf 'OK   %s\n' "$1"
}

warn() {
  printf 'WARN %s\n' "$1"
  WARNINGS=$((WARNINGS + 1))
}

fail() {
  printf 'FAIL %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

is_running() {
  docker compose --profile api --profile openproject ps --status running --services 2>/dev/null | grep -qx "$1"
}

check_required_service() {
  if is_running "$1"; then
    ok "Container running: $1"
  else
    fail "Container not running: $1"
  fi
}

check_http() {
  local name="$1"
  local url="$2"
  local code

  if ! command -v curl >/dev/null 2>&1; then
    warn "curl is not installed; skipped HTTP check for $name"
    return
  fi

  code="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)"
  if [[ "$code" =~ ^(2|3) ]]; then
    ok "$name HTTP $code: $url"
  else
    fail "$name HTTP check failed: $url"
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  fail "docker is not installed or not in PATH"
  exit 1
fi

check_required_service postgres
check_required_service wbs-api
check_required_service wbs-portal

if is_running postgres; then
  if docker compose --profile api exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    ok "PostgreSQL ready: $POSTGRES_DB"
  else
    fail "PostgreSQL is not ready: $POSTGRES_DB"
  fi
fi

check_http "WBS API" "http://localhost:$WBS_API_PORT/health"
check_http "WBS API metrics" "http://localhost:$WBS_API_PORT/metrics"
check_http "WBS Portal" "http://localhost:$WBS_PORTAL_PORT"

if is_running openproject; then
  check_http "OpenProject" "http://$OPENPROJECT_HOST_NAME"
elif [[ "${REQUIRE_OPENPROJECT:-0}" == "1" ]]; then
  fail "OpenProject container is not running"
else
  warn "OpenProject container is not running; skipped optional check"
fi

if is_running prometheus; then
  check_http "Prometheus" "http://localhost:$PROMETHEUS_PORT/-/healthy"
elif [[ "${REQUIRE_MONITORING:-0}" == "1" ]]; then
  fail "Prometheus container is not running"
else
  warn "Prometheus container is not running; skipped optional check"
fi

if is_running postgres-exporter; then
  check_http "PostgreSQL exporter" "http://localhost:$POSTGRES_EXPORTER_PORT/metrics"
elif [[ "${REQUIRE_MONITORING:-0}" == "1" ]]; then
  fail "PostgreSQL exporter container is not running"
else
  warn "PostgreSQL exporter container is not running; skipped optional check"
fi

if compgen -G "$BACKUP_DIR/*.dump" >/dev/null; then
  LATEST_BACKUP="$(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | head -n 1)"
  ok "Latest PostgreSQL backup: $LATEST_BACKUP"
else
  warn "No PostgreSQL backup found in $BACKUP_DIR"
fi

echo "Summary: $FAILURES failure(s), $WARNINGS warning(s)"

if [[ "$FAILURES" -gt 0 ]]; then
  exit 1
fi
