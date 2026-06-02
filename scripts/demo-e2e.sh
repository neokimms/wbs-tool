#!/usr/bin/env zsh
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"
OUTPUT_DIR="${OUTPUT_DIR:-outputs/demo}"
TEMPLATE_KEY="${TEMPLATE_KEY:-si-standard}"
PROJECT_NAME="${PROJECT_NAME:-WBS Demo E2E $(date +%Y%m%d-%H%M%S)}"
PROJECT_OWNER="${PROJECT_OWNER:-PMO}"
DEFAULT_PYTHON="/Users/minsungkim/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
PYTHON_BIN="${PYTHON_BIN:-$DEFAULT_PYTHON}"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="python3"
fi
if [[ ! -x "$CURL_BIN" ]]; then
  CURL_BIN="curl"
fi

mkdir -p "$OUTPUT_DIR"
WORKBOOK_PATH="${OUTPUT_DIR}/wbs-demo-import.xlsx"
RUN_SUMMARY_PATH="${OUTPUT_DIR}/demo-e2e-summary.json"

json_get() {
  "$PYTHON_BIN" -c 'import json,sys; data=json.load(sys.stdin); cur=data
for key in sys.argv[1].split("."):
    if not key:
        continue
    cur = cur[int(key)] if isinstance(cur, list) else cur.get(key)
print("" if cur is None else cur)' "$1"
}

json_pretty_file() {
  "$PYTHON_BIN" -c 'import json,sys,pathlib; pathlib.Path(sys.argv[1]).write_text(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=2), encoding="utf-8")' "$1"
}

api_json() {
  local method="$1"
  local path="$2"
  local token="$3"
  local body="${4:-}"
  if [[ -n "$body" ]]; then
    "$CURL_BIN" -fsS -X "$method" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${token}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    "$CURL_BIN" -fsS -X "$method" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${token}"
  fi
}

login_response="$("$CURL_BIN" -fsS -X POST "${API_BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin","password":"admin"}')"
token="$(print -r -- "$login_response" | json_get token)"

"$PYTHON_BIN" scripts/generate-demo-wbs-workbook.py "$WORKBOOK_PATH" >/dev/null

project_payload="$("$PYTHON_BIN" -c 'import json,sys; print(json.dumps({"name":sys.argv[1],"template_key":sys.argv[2],"owner":sys.argv[3],"start_date":"2026-06-02"}, ensure_ascii=False))' "$PROJECT_NAME" "$TEMPLATE_KEY" "$PROJECT_OWNER")"
project_response="$(api_json POST /api/projects "$token" "$project_payload")"
project_id="$(print -r -- "$project_response" | json_get id)"

preview_response="$("$CURL_BIN" -fsS -X POST "${API_BASE}/api/templates/import/preview" \
  -H "Authorization: Bearer ${token}" \
  -F "file=@${WORKBOOK_PATH}" \
  -F "template_key=${TEMPLATE_KEY}" \
  -F "template_name=SI 구축 표준 WBS 데모" \
  -F "project_type=System Integration" \
  -F "description=Demo E2E Excel upload")"
import_job_id="$(print -r -- "$preview_response" | json_get id)"
import_status="$(print -r -- "$preview_response" | json_get status)"

if [[ "$import_status" != "Preview" ]]; then
  print -r -- "$preview_response" | json_pretty_file "${OUTPUT_DIR}/import-preview-error.json"
  print "Import preview failed. See ${OUTPUT_DIR}/import-preview-error.json" >&2
  exit 1
fi

project_apply_response="$(api_json POST "/api/projects/${project_id}/imports/${import_job_id}/apply" "$token")"
approval_payload="$("$PYTHON_BIN" -c 'import json,sys; print(json.dumps({"project_id":sys.argv[1],"title":"Demo WBS baseline approval","request_type":"WBS Baseline","requester":"PMO","reviewer":"PMO Lead","auto_approve_internal":True,"metadata":{"source":"scripts/demo-e2e.sh"}}, ensure_ascii=False))' "$project_id")"
approval_response="$(api_json POST /api/approvals "$token" "$approval_payload")"
baseline_response="$(api_json GET "/api/projects/${project_id}/baseline" "$token")"
preflight_response="$(api_json GET "/api/projects/${project_id}/sync-preflight" "$token")"
dry_run_response="$(api_json POST "/api/projects/${project_id}/sync" "$token" '{"dry_run":true,"create_work_packages":true,"validate_payloads":true,"actor":"PMO"}')"

ready_for_actual_sync="$(print -r -- "$preflight_response" | json_get preflight.ready_for_actual_sync)"
actual_sync_response="null"
actual_sync_status="skipped"

if [[ "$ready_for_actual_sync" == "True" || "$ready_for_actual_sync" == "true" ]]; then
  actual_sync_response="$(api_json POST "/api/projects/${project_id}/sync" "$token" '{"dry_run":false,"create_work_packages":true,"validate_payloads":true,"actor":"PMO"}')"
  actual_sync_status="$(print -r -- "$actual_sync_response" | json_get status)"
fi

"$PYTHON_BIN" -c 'import json,sys,pathlib
summary = {
  "api_base": sys.argv[1],
  "workbook": sys.argv[2],
  "project": json.loads(sys.argv[3]),
  "import_preview": json.loads(sys.argv[4]),
  "project_apply": json.loads(sys.argv[5]),
  "approval": json.loads(sys.argv[6]),
  "baseline": json.loads(sys.argv[7]),
  "sync_preflight": json.loads(sys.argv[8]),
  "dry_run": json.loads(sys.argv[9]),
  "actual_sync_status": sys.argv[10],
  "actual_sync": json.loads(sys.argv[11]),
}
pathlib.Path(sys.argv[12]).write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
' "$API_BASE" "$WORKBOOK_PATH" "$project_response" "$preview_response" "$project_apply_response" "$approval_response" "$baseline_response" "$preflight_response" "$dry_run_response" "$actual_sync_status" "$actual_sync_response" "$RUN_SUMMARY_PATH"

print "WBS demo E2E passed"
print "Project: ${PROJECT_NAME} (${project_id})"
print "Import job: ${import_job_id}"
print "Workbook: ${WORKBOOK_PATH}"
print "Summary: ${RUN_SUMMARY_PATH}"
print "Actual sync: ${actual_sync_status}"
