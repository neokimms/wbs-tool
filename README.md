# wbs-tool

OpenProject Community Edition을 WBS/PM 엔진으로 사용하고, 회사 표준 WBS 기능은 별도 API와 포털로 확장하는 온프레미스 플랫폼 스캐폴드입니다. 데이터베이스는 PostgreSQL 17을 기본으로 사용합니다.

GitHub 저장소: https://github.com/neokimms/wbs-tool

## 구성

- `openproject`: WBS/PM 코어 엔진
- `postgres`: OpenProject와 회사 확장 API가 함께 쓰는 PostgreSQL 17
- `memcached`: OpenProject 캐시
- `wbs-api`: 회사 표준 WBS, 템플릿, Excel 왕복 검증, PMO 대시보드용 확장 API
- `wbs-portal`: Apple 스타일 `design.md`를 따르는 운영 포털

## 실행 모드

```bash
cp .env.example .env
OPENPROJECT_SECRET_KEY_BASE=$(openssl rand -hex 64)
sed -i.bak "s/^OPENPROJECT_SECRET_KEY_BASE=.*/OPENPROJECT_SECRET_KEY_BASE=${OPENPROJECT_SECRET_KEY_BASE}/" .env
```

포털 UI만 가볍게 확인할 때는 PostgreSQL과 OpenProject를 켜지 않습니다.

```bash
docker compose up --build
```

WBS 확장 API와 PostgreSQL까지 확인할 때만 `api` 프로필을 사용합니다.

```bash
docker compose --profile api up --build
```

OpenProject 엔진까지 포함한 전체 스택은 `api`, `openproject` 프로필을 함께 사용합니다.

```bash
docker compose --profile api --profile openproject up --build
```

운영 모니터링까지 포함할 때는 `monitoring` 프로필을 추가합니다.

```bash
docker compose --profile api --profile monitoring up --build
```

OpenProject에 회사 표준 WBS 타입, 상태, 커스텀 필드, 기본 워크플로우를 적용합니다.

```bash
bash scripts/bootstrap-openproject-wbs.sh
```

회사 표준 SI WBS 템플릿 프로젝트를 생성하거나 갱신합니다.

```bash
bash scripts/bootstrap-openproject-si-template.sh
```

계층형 WBS Excel 템플릿은 포털의 `Excel 다운로드` 버튼으로 내려받고, 같은 화면의 `Excel 업로드`로 검증 미리보기를 확인한 뒤 `반영` 버튼으로 적용합니다. API로 직접 사용할 때는 다음 엔드포인트를 사용합니다.

```bash
GET  /api/templates/{template_key}/excel
POST /api/templates/import/preview
POST /api/imports/{job_id}/apply
POST /api/templates/import
POST /api/templates/{template_key}/codes/resequence
```

Excel 업로드 시 `WBS 코드`를 비워두면 `레벨`과 행 순서 기준으로 코드가 자동 생성됩니다. 미리보기 상태에서는 PostgreSQL의 import job에 검증 결과와 계층형 rows만 저장되고, 실제 템플릿 교체는 승인 반영 시점에 수행됩니다. 저장된 템플릿의 코드 체계를 다시 맞출 때는 포털의 `코드 정렬` 버튼을 사용합니다.

PMO 승인 워크플로우는 프로젝트별 승인 요청을 PostgreSQL에 감사 이력으로 남기고, 포털의 `승인 대기열`에서 승인 또는 반려할 수 있습니다.

```bash
GET  /api/approvals
POST /api/approvals
POST /api/approvals/{approval_id}/approve
POST /api/approvals/{approval_id}/reject
```

OpenProject 실제 연동은 PM engine adapter 경계 뒤에 둡니다. 기본값은 dry-run/disabled라서 토큰을 넣기 전에는 외부 OpenProject API를 호출하지 않습니다.

```bash
GET  /api/pm-engine
GET  /api/pm-engine/preflight
GET  /api/projects/{project_id}/sync-plan
GET  /api/projects/{project_id}/sync-preflight
POST /api/projects/{project_id}/sync
```

실제 실행이 필요하면 `.env`에 API 토큰과 실행 플래그를 지정합니다. OpenProject API v3는 bearer token 또는 `apikey:$API_KEY` Basic Auth를 지원합니다. Work Package 생성 전 payload 검증은 OpenProject의 `/api/v3/work_packages/form` 흐름을 사용합니다. 참고: [OpenProject API](https://www.openproject.org/docs/api/), [Work packages API](https://www.openproject.org/docs/api/endpoints/work-packages/).

```bash
OPENPROJECT_SYNC_ENABLED=true
OPENPROJECT_API_TOKEN=opapi-...
OPENPROJECT_AUTH_MODE=bearer
OPENPROJECT_HOST_HEADER=localhost:8080
OPENPROJECT_DEFAULT_TYPE_ID=1
```

Docker Compose에서는 API 컨테이너가 `http://openproject`로 OpenProject에 접근하므로, 로컬 개발 기본값은 `OPENPROJECT_HOST_HEADER=localhost:8080`입니다. 토큰 적용 후에는 먼저 preflight를 확인합니다. 이 단계는 OpenProject API root, 토큰 존재 여부, 현재 인증 사용자, 프로젝트별 샘플 Work Package payload를 보여주며 실제 데이터는 생성하지 않습니다.

```bash
curl http://localhost:8000/api/pm-engine/preflight
curl http://localhost:8000/api/projects/{project_id}/sync-preflight
```

`POST /api/projects/{project_id}/sync`의 기본 요청은 dry-run입니다. 실제 생성 시에는 다음처럼 호출합니다.

```bash
curl -X POST http://localhost:8000/api/projects/{project_id}/sync \
  -H 'Content-Type: application/json' \
  -d '{"dry_run": false, "create_work_packages": true, "validate_payloads": true}'
```

서비스 기본 주소:

- 포털: http://localhost:3010
- 확장 API: http://localhost:8000
- OpenProject: http://localhost:8080

리소스를 내리고 싶을 때:

```bash
docker compose stop
```

컨테이너까지 제거하고 데이터 볼륨은 유지할 때:

```bash
docker compose down
```

## 운영 점검과 백업

고객사 온프레미스 배포에서는 API 프로필을 기준으로 PostgreSQL, 확장 API, 포털 상태를 먼저 점검합니다. OpenProject까지 필수로 확인해야 하면 `REQUIRE_OPENPROJECT=1`을 함께 지정합니다.

```bash
bash scripts/status-check.sh
REQUIRE_OPENPROJECT=1 bash scripts/status-check.sh
```

포털의 `제품화 체크` 패널은 운영 상태 API를 사용합니다. PostgreSQL, 스키마, 템플릿, 승인/Excel 대기열, OpenProject preflight, 백업 리허설, metrics 노출 여부를 한 번에 확인합니다.

```bash
curl http://localhost:8000/api/operations/health
```

PostgreSQL 백업은 `backups/postgres` 아래에 custom dump 형식으로 생성됩니다. 기본 대상은 `.env`의 `POSTGRES_DB`이며, 인자로 다른 DB를 지정할 수 있습니다.
Docker Compose에서는 이 디렉터리가 API 컨테이너의 `/app/backups/postgres`에 읽기 전용으로 마운트되어 포털의 `제품화 체크`에서 최신 백업 상태를 확인할 수 있습니다.

```bash
bash scripts/backup-postgres.sh
bash scripts/backup-postgres.sh openproject
```

복구는 대상 DB를 재생성하는 파괴적 작업이므로 명시 확인값이 필요합니다. 운영 복구 전에는 현재 볼륨과 최신 백업 파일을 별도로 보존해 두세요.

```bash
CONFIRM_RESTORE=YES bash scripts/restore-postgres.sh backups/postgres/wbs_platform_YYYYMMDD-HHMMSS.dump wbs_platform
CONFIRM_RESTORE=YES bash scripts/restore-postgres.sh backups/postgres/openproject_YYYYMMDD-HHMMSS.dump openproject
```

## 모니터링

WBS API는 Prometheus text format의 `/metrics`를 제공합니다. `monitoring` 프로필을 켜면 Prometheus가 WBS API와 PostgreSQL exporter를 수집합니다.

```bash
curl http://localhost:8000/metrics
docker compose --profile api --profile monitoring up -d --build
```

모니터링 기본 주소:

- Prometheus: http://localhost:9090
- PostgreSQL exporter: http://localhost:9187/metrics
- WBS API metrics: http://localhost:8000/metrics

상태 점검에서 모니터링 컨테이너까지 필수로 확인하려면 다음을 사용합니다.

```bash
REQUIRE_MONITORING=1 bash scripts/status-check.sh
```

## Kubernetes 배포

고객사 Kubernetes 환경에는 Helm chart 초안을 사용할 수 있습니다. Chart는 WBS API, 포털, 선택형 PostgreSQL StatefulSet, Ingress, Prometheus scrape annotation을 포함합니다.

```bash
helm template wbs-platform ./infra/helm/wbs-platform
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  --set postgresql.auth.password='replace-me' \
  --set api.portalOrigin='https://wbs.example.com' \
  --set portal.apiBaseUrl='https://wbs-api.example.com'
```

운영 DB를 별도로 쓰는 경우:

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  --set postgresql.enabled=false \
  --set externalPostgresql.host='postgres.internal' \
  --set externalPostgresql.password='replace-me'
```

## 개발 원칙

1. OpenProject 코어 수정은 최소화하고, 설정/플러그인/API 확장으로 제품화합니다.
2. PostgreSQL을 단일 표준 DB로 사용합니다.
3. 포털 UI는 루트의 `design.md`를 먼저 읽고 적용합니다.
4. 하네스 엔지니어링 에이전트는 루트의 `agent.md`를 기준으로 작업합니다.

## 우선순위

1. 회사 표준 WBS 템플릿과 커스텀 필드 모델링
2. 계층형 Excel import/export
3. WBS 코드 자동 생성
4. PMO 대시보드와 승인 워크플로우
5. 고객사 온프레미스 배포, 백업/복구, 모니터링
