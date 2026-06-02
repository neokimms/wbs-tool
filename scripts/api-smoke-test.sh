#!/usr/bin/env zsh
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8000}"

login() {
  local email="$1"
  local password="$2"
  curl -fsS -X POST "${API_BASE}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}"
}

json_token() {
  python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])'
}

admin_token="$(login admin admin | json_token)"
viewer_token="$(login viewer viewer | json_token)"

curl -fsS "${API_BASE}/api/dashboard" -H "Authorization: Bearer ${viewer_token}" >/dev/null

viewer_users_status="$(
  curl -s -o /dev/null -w '%{http_code}' "${API_BASE}/api/users" \
    -H "Authorization: Bearer ${viewer_token}"
)"
test "${viewer_users_status}" = "403"

viewer_create_status="$(
  curl -s -o /dev/null -w '%{http_code}' -X POST "${API_BASE}/api/projects" \
    -H "Authorization: Bearer ${viewer_token}" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Viewer blocked project","template_key":"si-standard","owner":"Viewer"}'
)"
test "${viewer_create_status}" = "403"

curl -fsS "${API_BASE}/api/users" -H "Authorization: Bearer ${admin_token}" >/dev/null
curl -fsS "${API_BASE}/api/settings" -H "Authorization: Bearer ${admin_token}" >/dev/null
curl -fsS "${API_BASE}/api/operations/health" -H "Authorization: Bearer ${admin_token}" >/dev/null

echo "WBS API smoke test passed"
