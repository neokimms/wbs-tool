#!/bin/sh
set -eu

# WBS_API_BASE_URL이 주어지면 정적 config.js를 컨테이너 시작 시점에 덮어써서
# 빌드 타임에 API 주소를 알 수 없는 환경(Azure Container Apps 등)에서도
# 같은 이미지를 그대로 재사용할 수 있게 한다.
if [ -n "${WBS_API_BASE_URL:-}" ]; then
  printf 'window.WBS_API_BASE_URL = "%s";\n' "$WBS_API_BASE_URL" > /usr/share/nginx/html/config.js
fi

exec nginx -g 'daemon off;'
