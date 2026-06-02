# WBS Platform 관리자 매뉴얼

## 1. 설치

개발 검증은 Docker Compose API 프로필로 시작합니다.

```bash
docker compose --profile api up -d --build
```

고객사 Kubernetes 배포는 Helm chart를 사용합니다.

```bash
helm upgrade --install wbs-platform ./infra/helm/wbs-platform \
  --namespace wbs --create-namespace \
  --set postgresql.auth.password='replace-me' \
  --set api.portalOrigin='https://wbs.example.com' \
  --set portal.apiBaseUrl='https://wbs-api.example.com'
```

별도 migration Job을 쓰려면 `api.migrationJob.enabled=true`, `api.runMigrationsOnStartup=false`로 설정합니다.

## 2. 계정과 권한

기본 역할은 세 가지입니다.

- `admin`: 사용자, 설정, 운영 점검, 모든 PMO 업무 가능
- `pmo`: 프로젝트, 승인, Excel import, PM engine sync 가능
- `viewer`: 포털 조회 전용

운영 배포 전 기본 개발 계정의 비밀번호는 반드시 변경합니다. 신규 계정은 기본적으로 최초 로그인 후 비밀번호 변경이 필요합니다.

Docker Compose 개발 환경의 기본 로그인은 다음 두 방식이 모두 가능합니다.

```text
admin@wbs.local  / adminadmin
admin            / admin

pmo@wbs.local    / pmopmo
pmo              / pmo

viewer@wbs.local / viewonly
viewer           / viewer
```

운영/Helm 배포에서는 기본값으로 별칭 로그인이 꺼져 있습니다. 데모 목적으로만 켤 때는 `api.enableLoginAliases=true`를 사용하고, 운영 전에는 다시 비활성화합니다.

## 3. 승인과 상태

프로젝트 상태 전이는 API에서 강제됩니다.

```text
Draft -> Review / Approved / Closed
Review -> Approved / Rejected / Closed
Rejected -> Draft / Review / Closed
Approved -> Synced / Closed
Synced -> Closed
Closed -> 변경 불가
```

내부 WBS baseline 승인은 기본 자동 승인입니다. 승인되면 baseline snapshot이 `Locked` 상태로 저장됩니다. 실제 PM engine sync는 `Approved` 상태와 locked baseline이 모두 필요합니다.

## 4. Excel Import

포털 `Excel Queue`에서 템플릿 Excel을 내려받고 업로드합니다.

1. `Excel 다운로드`
2. WBS 작성 또는 수정
3. `Excel 업로드`
4. diff와 오류 확인
5. `반영`

오류가 있으면 `오류 Excel`을 내려받아 Issues, Diff, Rows 시트 기준으로 수정합니다. 템플릿 반영 시 `wbs_template_versions`에 버전 snapshot이 저장됩니다.

프로젝트별 WBS가 필요한 경우 API의 `POST /api/projects/{project_id}/imports/{job_id}/apply`를 사용합니다. 프로젝트별 WBS가 저장되면 sync-plan은 템플릿 대신 프로젝트 WBS를 사용합니다.

## 5. PM Engine

기본 adapter는 OpenProject입니다. 실제 sync 전에는 preflight를 확인합니다.

```bash
curl https://wbs-api.example.com/api/pm-engine/preflight
```

설치 검증이나 고객사 사전 데모에서는 mock adapter를 사용할 수 있습니다.

```bash
PM_ENGINE_ADAPTER=mock
```

mock adapter는 외부 OpenProject API를 호출하지 않고 sync 이력과 project metadata만 생성합니다.

## 6. 감사 로그

다음 이벤트는 감사 로그에 저장됩니다.

- 로그인, 로그아웃, 로그인 실패, 계정 잠금
- 비밀번호 변경, 세션 강제 종료
- 사용자 생성/수정
- 설정 변경
- 프로젝트 생성/상태 변경
- 승인/반려
- Excel preview/apply/resequence
- PM engine dry-run/actual sync

포털 `Audit` 메뉴에서 확인하고, API는 `/api/audit-events`를 사용합니다.

## 7. 백업과 복구

PostgreSQL 백업:

```bash
bash scripts/backup-postgres.sh
```

복구는 대상 DB를 재생성하므로 명시 확인값이 필요합니다.

```bash
CONFIRM_RESTORE=YES bash scripts/restore-postgres.sh backups/postgres/wbs_platform_YYYYMMDD-HHMMSS.dump wbs_platform
```

## 8. 운영 점검

포털 `Operations` 메뉴 또는 API로 점검합니다.

```bash
curl https://wbs-api.example.com/api/operations/health
```

점검 항목은 PostgreSQL, schema, template baseline, 사용자/세션 보안, 감사 로그, PM engine preflight, 백업, metrics, CORS 정책을 포함합니다.

Excel/승인/baseline/sync dry-run까지 포함한 데모 검증은 로컬 API 프로필에서 다음 명령으로 실행합니다.

```bash
zsh scripts/demo-e2e.sh
```

결과는 `outputs/demo/demo-e2e-summary.json`에 저장됩니다. OpenProject 실제 sync까지 검증하려면 토큰과 sync 실행 플래그를 설정한 뒤 API를 재기동합니다.
