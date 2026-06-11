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

포털은 로그인 후 사용할 수 있습니다. 개발용 기본 계정은 PostgreSQL migration에서 시드되며, 운영 배포 전 반드시 교체해야 합니다.

```text
admin@wbs.local  / adminadmin  / admin
pmo@wbs.local    / pmopmo      / pmo
viewer@wbs.local / viewonly    / viewer
```

Docker Compose 개발 환경에서는 짧은 별칭 로그인도 켜져 있습니다.

```text
admin  / admin  / admin
pmo    / pmo    / pmo
viewer / viewer / viewer
```

운영에서는 `WBS_ENABLE_LOGIN_ALIASES=false`로 별칭 로그인을 끄는 것을 권장합니다. 별칭 구성이 필요하면 `WBS_LOGIN_ALIASES_JSON`에 `{"alias":{"email":"user@example.com","password":"alias-password"}}` 형식으로 지정합니다.

API는 `/api/auth/login`을 제외한 `/api/*` 요청에 Bearer 세션 토큰을 요구합니다.

```bash
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
POST /api/auth/password
GET  /api/users
POST /api/users
PATCH /api/users/{user_id}
POST /api/users/{user_id}/sessions/revoke
GET  /api/audit-events
GET  /api/settings
PUT  /api/settings/{setting_key}
```

포털의 `Users` 메뉴는 `admin`만 사용할 수 있고, 계정 생성, 역할 변경, 상태 변경, 비밀번호 재설정, 세션 강제 종료를 처리합니다. `Audit`과 `Settings` 메뉴는 `admin`, `pmo`가 조회할 수 있으며 설정 저장은 `admin`만 가능합니다. 로그인 실패는 기본 5회 후 15분 잠기며, 신규 계정은 기본적으로 최초 비밀번호 변경이 필요합니다. 로그인, 로그아웃, 사용자/설정 변경, 프로젝트 생성/상태 변경, 승인, Excel 반영, PM 엔진 sync 시도는 `wbs_audit_events`에 감사 이력으로 저장됩니다.

계층형 WBS Excel 템플릿은 포털의 `Excel 다운로드` 버튼으로 내려받고, 같은 화면의 `Excel 업로드`로 검증 미리보기를 확인한 뒤 `반영` 버튼으로 적용합니다. API로 직접 사용할 때는 다음 엔드포인트를 사용합니다.

```bash
GET  /api/templates/{template_key}/excel
GET  /api/imports
GET  /api/imports/{job_id}
POST /api/templates/import/preview
POST /api/imports/{job_id}/apply
GET  /api/imports/{job_id}/errors.xlsx
POST /api/templates/import
POST /api/templates/{template_key}/codes/resequence
GET  /api/templates/{template_key}/versions
POST /api/projects/{project_id}/imports/{job_id}/apply
```

Excel 업로드 시 `WBS 코드`를 비워두면 `레벨`과 행 순서 기준으로 코드가 자동 생성됩니다. 미리보기 상태에서는 PostgreSQL의 import job에 검증 결과, 계층형 rows, 기존 템플릿 대비 diff가 저장되고, 실제 템플릿 교체는 승인 반영 시점에 수행됩니다. 오류가 있으면 `오류 Excel`을 내려받아 Issues/Diff/Rows 시트 기준으로 수정합니다. 템플릿 반영 시 `wbs_template_versions`에 버전 snapshot이 저장됩니다. 프로젝트별 WBS에 적용할 때는 `POST /api/projects/{project_id}/imports/{job_id}/apply`를 사용합니다.

PMO 승인 워크플로우는 프로젝트별 승인 요청을 PostgreSQL에 감사 이력으로 남깁니다. 내부 WBS baseline 승인은 기본적으로 자동 승인되며, 승인 시점의 WBS는 `wbs_project_baselines`에 `Locked` 스냅샷으로 저장됩니다. 포털의 `승인 이력`과 프로젝트 WBS 상세의 `Baseline` 상태에서 처리 결과를 확인합니다. 수동 대기열이 필요한 요청은 `auto_approve_internal=false`로 생성합니다.

```bash
GET  /api/approvals
POST /api/approvals
POST /api/approvals/{approval_id}/approve
POST /api/approvals/{approval_id}/reject
GET  /api/projects/{project_id}/baseline
PATCH /api/projects/{project_id}/status
```

프로젝트 상태는 `Draft -> Review/Approved/Closed`, `Review -> Approved/Rejected/Closed`, `Rejected -> Draft/Review/Closed`, `Approved -> Synced/Closed`, `Synced -> Closed` 순서로만 전이됩니다. 실제 sync는 `Approved` 상태와 locked baseline이 필요합니다.

OpenProject 실제 연동은 PM engine adapter 경계 뒤에 둡니다. 기본값은 dry-run/disabled라서 토큰을 넣기 전에는 외부 OpenProject API를 호출하지 않습니다. 포털의 `Settings` 메뉴와 `/api/settings`는 `pm_engine` 설정을 노출하며, 실제 런타임 토큰/동기화 플래그는 환경변수로 제어합니다.

```bash
GET  /api/pm-engine
GET  /api/pm-engine/preflight
GET  /api/projects/{project_id}/sync-plan
GET  /api/projects/{project_id}/sync-runs
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
PM_ENGINE_ADAPTER=openproject
```

외부 OpenProject 호출 없이 제품 흐름만 검증하려면 mock adapter를 사용할 수 있습니다.

```bash
PM_ENGINE_ADAPTER=mock
```

Docker Compose에서는 API 컨테이너가 `http://openproject`로 OpenProject에 접근하므로, 로컬 개발 기본값은 `OPENPROJECT_HOST_HEADER=localhost:8080`입니다. 토큰 적용 후에는 먼저 preflight를 확인합니다. 이 단계는 OpenProject API root, 토큰 존재 여부, 현재 인증 사용자, 프로젝트별 샘플 Work Package payload를 보여주며 실제 데이터는 생성하지 않습니다.
포털의 OpenProject 패널도 같은 preflight 결과를 사용하며, `ready_for_actual_sync=true`일 때만 실제 `Sync` 버튼이 활성화됩니다.

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

dry-run과 실제 sync 시도는 `wbs_sync_runs`에 감사 이력으로 저장됩니다. 포털의 OpenProject 패널에서 최근 실행 이력을 확인할 수 있고, API로는 다음처럼 조회합니다.

```bash
curl http://localhost:8000/api/projects/{project_id}/sync-runs
```

## 주간 보고서 자동 발송

API는 APScheduler로 주간 보고서 스케줄을 실행합니다. 기본 `weekly-pmo` 스케줄은 비활성 상태로 생성되며, 활성화하면 프로젝트/승인/Excel import/OpenProject sync 현황을 Excel로 생성합니다. SMTP가 설정되어 있으면 수신자에게 첨부 발송하고, SMTP가 없으면 `WBS_REPORT_OUTPUT_DIR`에 파일만 남긴 뒤 실행 이력을 저장합니다.

```bash
GET   /api/report-schedules
PATCH /api/report-schedules/weekly-pmo
POST  /api/report-schedules/weekly-pmo/run
GET   /api/report-runs
GET   /api/report-runs/{run_id}/artifact
```

실제 메일 발송에는 다음 환경변수를 사용합니다.

```bash
WBS_REPORT_SCHEDULER_ENABLED=true
WBS_REPORT_TIMEZONE=Asia/Seoul
WBS_SMTP_HOST=smtp.example.com
WBS_SMTP_PORT=587
WBS_SMTP_USERNAME=wbs@example.com
WBS_SMTP_PASSWORD=replace-me
WBS_SMTP_FROM=wbs@example.com
WBS_SMTP_USE_TLS=true
```

스케줄 설정 예시:

```bash
curl -X PATCH http://localhost:8000/api/report-schedules/weekly-pmo \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"day_of_week":0,"hour":9,"minute":0,"recipients":["pmo@example.com"]}'
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

Excel 업로드부터 프로젝트 WBS 적용, 자동 승인, baseline lock, sync preflight, dry-run까지 한 번에 검증하려면 데모 E2E 스크립트를 실행합니다. 스크립트는 `outputs/demo/wbs-demo-import.xlsx` 샘플 파일과 `outputs/demo/demo-e2e-summary.json` 결과 요약을 생성합니다.

```bash
zsh scripts/demo-e2e.sh
```

OpenProject 실제 sync는 `OPENPROJECT_SYNC_ENABLED=true`, `OPENPROJECT_API_TOKEN`, `OPENPROJECT_AUTH_MODE`, 필요 시 `OPENPROJECT_DEFAULT_TYPE_ID`를 설정한 뒤 API를 재기동해야 실행됩니다. 준비되지 않은 환경에서는 E2E 스크립트가 actual sync를 건너뛰고 dry-run 결과까지만 검증합니다.

관리자 매뉴얼은 [docs/admin-manual.md](docs/admin-manual.md)에 있습니다.

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

WBS API는 Prometheus text format의 `/metrics`를 제공합니다. `monitoring` 프로필을 켜면 Prometheus가 WBS API와 PostgreSQL exporter를 수집하고, Grafana가 Prometheus datasource와 WBS 운영 대시보드를 자동 로드합니다.

```bash
curl http://localhost:8000/metrics
docker compose --profile api --profile monitoring up -d --build
```

모니터링 기본 주소:

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (`admin` / `admin`, 운영에서는 `GRAFANA_ADMIN_PASSWORD` 변경)
- PostgreSQL exporter: http://localhost:9187/metrics
- WBS API metrics: http://localhost:8000/metrics

Grafana provisioning 파일은 `infra/monitoring/grafana/provisioning`, 기본 대시보드는 `infra/monitoring/grafana/dashboards/wbs-platform.json`에 있습니다.

상태 점검에서 모니터링 컨테이너까지 필수로 확인하려면 다음을 사용합니다.

```bash
REQUIRE_MONITORING=1 bash scripts/status-check.sh
```

## 배포 옵션 (온프레미스/노트북 vs Azure)

상용 배포 대상은 옵션으로 선택합니다. 두 옵션 모두 동일한 `services/wbs-api`,
`apps/portal` 소스와 `infra/helm/wbs-platform` Helm chart를 공유하며,
대상별 차이는 환경변수/Helm values 오버레이로만 분기됩니다(OpenProject 코어 무수정,
PostgreSQL 단일 표준 원칙 유지).

| 옵션 | 진입점 | 설명 |
|---|---|---|
| 온프레미스 / 노트북 | `docker-compose.yml` (+ `scripts/deploy.sh onprem`) | 단일 호스트에 Docker Compose 프로필(`api`, `openproject`, `monitoring`)로 실행 |
| 온프레미스 K8s | `infra/helm/wbs-platform/values-onprem.yaml` | 고객사 Kubernetes 클러스터, 번들 PostgreSQL StatefulSet 사용 |
| Azure (AKS) | `infra/azure/` (Bicep) + `infra/helm/wbs-platform/values-azure.yaml` (+ `scripts/deploy.sh azure`) | AKS/ACR/Azure Database for PostgreSQL Flexible Server/Key Vault 프로비저닝 후 Helm 배포 |

```bash
# 온프레미스/노트북: docker compose 실행
scripts/deploy.sh onprem up [--monitoring]

# Azure: 인프라 프로비저닝 -> 앱 배포 (infra/azure/README.md 참고)
WBS_AZURE_POSTGRES_PASSWORD='<강력한-비밀번호>' scripts/deploy.sh azure infra
scripts/deploy.sh azure app
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

별도 migration Job을 사용하려면 다음 값을 추가합니다.

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  --set api.migrationJob.enabled=true \
  --set api.runMigrationsOnStartup=false
```

운영 DB를 별도로 쓰는 경우:

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  --set postgresql.enabled=false \
  --set externalPostgresql.host='postgres.internal' \
  --set externalPostgresql.password='replace-me'
```

### 온프레미스 K8s 오버레이

단일/소수 노드 클러스터를 가정한 사전 정의 값입니다(번들 PostgreSQL, HPA/PDB 비활성화,
nginx Ingress, externalSecret 비활성화).

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  -f infra/helm/wbs-platform/values-onprem.yaml \
  --set postgresql.auth.password='replace-me'
```

### Azure(AKS) 오버레이

`infra/azure/`의 Bicep으로 AKS/ACR/Azure Database for PostgreSQL Flexible Server/Key Vault를
먼저 프로비저닝한 뒤, External Secrets Operator를 통해 Key Vault 시크릿을 동기화하고
`values-azure.yaml`로 배포합니다. 전체 절차는 `infra/azure/README.md`를 참고하세요.

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  -f infra/helm/wbs-platform/values-azure.yaml \
  --set api.image.repository='<ACR_LOGIN_SERVER>/wbs-api' \
  --set portal.image.repository='<ACR_LOGIN_SERVER>/wbs-portal' \
  --set externalPostgresql.host='<POSTGRES_FLEXIBLE_SERVER_FQDN>'
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
