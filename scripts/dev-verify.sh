#!/usr/bin/env bash
# 개발 검증 일괄 실행: 이미지 재빌드 → 헬스체크 → 단위·API 동작 테스트(격리 DB) → 정적 계약 테스트
# 결과는 outputs/verify.log 에 기록된다.
#   사용: ./scripts/dev-verify.sh            (재빌드 포함)
#         SKIP_BUILD=1 ./scripts/dev-verify.sh (테스트만)
set -u
cd "$(dirname "$0")/.."
PROJECT="${COMPOSE_PROJECT:-wbstoolagent}"
API_CONTAINER="${PROJECT}-wbs-api-1"
mkdir -p outputs
LOG=outputs/verify.log
{
  echo "== verify $(date '+%F %T')"
  if [ "${SKIP_BUILD:-0}" != "1" ]; then
    echo "== build"
    docker compose -p "$PROJECT" --profile api up -d --build wbs-api wbs-portal
    echo "BUILD_EXIT=$?"
  fi
  echo "== health"
  ok=0
  for i in $(seq 1 40); do
    if curl -sf http://localhost:8000/health >/dev/null; then ok=1; break; fi
    sleep 2
  done
  echo "API_HEALTH=$ok"
  echo "PORTAL_HTTP=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3010/)"
  for asset in $(grep -oE '\./[a-z-]+\.(js|css)' apps/portal/index.html | sort -u); do
    echo "ASSET ${asset} $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3010/${asset#./}")"
  done
  echo "== tests (container, isolated DB wbs_test)"
  docker exec "$API_CONTAINER" python -m unittest discover -s tests -t . -v
  echo "TEST_EXIT=$?"
  echo "== static contracts (host)"
  python3 -m unittest tests/test_static_contracts.py
  echo "STATIC_EXIT=$?"
  echo "== done $(date '+%F %T')"
} > "$LOG" 2>&1
tail -n 6 "$LOG"
