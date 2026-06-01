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

OpenProject에 회사 표준 WBS 타입, 상태, 커스텀 필드, 기본 워크플로우를 적용합니다.

```bash
bash scripts/bootstrap-openproject-wbs.sh
```

회사 표준 SI WBS 템플릿 프로젝트를 생성하거나 갱신합니다.

```bash
bash scripts/bootstrap-openproject-si-template.sh
```

계층형 WBS Excel 템플릿은 포털의 `Excel 다운로드` 버튼으로 내려받고, 같은 화면의 `Excel 업로드`로 다시 반영할 수 있습니다. API로 직접 사용할 때는 다음 엔드포인트를 사용합니다.

```bash
GET  /api/templates/{template_key}/excel
POST /api/templates/import
POST /api/templates/{template_key}/codes/resequence
```

Excel 업로드 시 `WBS 코드`를 비워두면 `레벨`과 행 순서 기준으로 코드가 자동 생성됩니다. 저장된 템플릿의 코드 체계를 다시 맞출 때는 포털의 `코드 정렬` 버튼을 사용합니다.

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
