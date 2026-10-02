# AX WBS Platform — Claude Code Harness

> **하네스 엔지니어링 지침서**
> Claude Code가 이 프로젝트에서 작업할 때 항상 참조하는 파일입니다.

---

## 프로젝트 개요

온프레미스 엔터프라이즈 WBS 플랫폼. OpenProject Community Edition을 PM 엔진으로,
PostgreSQL을 데이터베이스 표준으로, 자체 확장 레이어(wbs-api + wbs-portal)로 구성됩니다.

**현재 실행 환경**
- 포털: http://localhost:3010 (Docker: `wbstoolagent-wbs-portal-1`)
- API: http://localhost:8000 (Docker: `wbstoolagent-wbs-api-1`)
- DB: PostgreSQL 17 (Docker: `wbstoolagent-postgres-1`)
- OpenProject CE 17: http://localhost:8080 (Docker: `wbstoolbyclaude-openproject-1`)

**기본 계정**
- 관리자 계정·비밀번호: `.env` 또는 팀 비밀 저장소 참조 (저장소에 평문 기재 금지)

---

## 필수 참조 파일

코드 변경 전 반드시 읽어야 하는 파일:

| 파일 | 용도 |
|------|------|
| `agent.md` | 아키텍처 가드레일 및 미션 정의 |
| `design.md` | Apple 영감 디자인 시스템 (색상·타이포·모션) |
| `README.md` | OpenProject 코어 + 확장 레이어 전략 |

---

## 절대 원칙 (Non-Negotiables)

1. **PostgreSQL 전용** — 다른 DB 지원 추가 금지
2. **OpenProject 코어 무수정** — 플러그인·외부 API·설정으로만 확장
3. **라이선스 경계 준수** — Enterprise add-on 우회 코드 작성 금지
4. **온프레미스 배포 가능** — 모든 기능은 고객 인프라에서 실행 가능해야 함
5. **보안·감사·백업은 제품 요구사항** — 나중으로 미루지 않음

---

## 아키텍처 레이어 책임

```
wbs-portal  ← PMO·경영진 포털 UI (Vanilla JS, nginx)
wbs-api     ← WBS 템플릿, 코드 생성, Excel I/O, PMO 집계 (FastAPI + Python)
OpenProject ← 작업패키지, 계층, 관계, 일정, 이슈/리스크/변경 (Rails + Angular)
PostgreSQL  ← 단일 데이터베이스 (wbs_platform + openproject DB)
```

---

## 데이터 모델 표준

**WBS 항목 유형:** 프로그램, 프로젝트, 단계, 산출물, 작업, 마일스톤, 리스크, 이슈, 변경요청

**필수 필드:** WBS 코드, 산출물 유형, 검토자, 승인자, 계약 단계, 검수 여부, 가중치, 진척 산식

**기본 워크플로우:**
```
초안 → 검토 → 승인 → 수행중 → 검수중 → 완료
```

---

## 현재 메뉴 구조

```
대시보드
프로젝트 현황
WBS 현황      ← OpenProject 동기화 뷰 (작업패키지 + 간트)
WBS 관리      ← WBS CRUD (Professional Table, Phase 1 기능 포함)
작업 현황      ← 내 작업 + 내 Action Item
회의·Action Item ← 회의록 + Action Item(담당자·기한·상태, WBS/이슈 연결)
표준/일반 WBS 관리
설정          ← 6개 탭: 플랫폼설정·승인이력·운영점검·사용자·감사로그·OpenProject
사용자 가이드
```

---

## 개발 워크플로우

### 백엔드 코드 구조 (2026-10 리팩토링)
```
services/wbs-api/app/
├─ main.py        앱 생성·미들웨어·lifespan·라우터 등록만
├─ core/          config(환경변수·상수) · db · security(인증·RBAC·테넌트) · audit · notify
├─ schemas.py     Pydantic 요청 모델
├─ domain/        wbs_rules.py (진척 롤업·SPI·계층 규칙 — 순수 함수)
├─ services/      projects · wbs · meetings · approvals · excel · reports · pm_engine · agile
├─ routers/       auth · users · settings · system · reports · templates · imports · projects
│                 wbs · pm_engine · approvals · agile · risks · notifications · notes · meetings
└─ migrate.py     Helm migration Job (migrations/*.sql 전체 적용)
```
의존 방향: routers → services → core (역방향 import 금지). 새 엔드포인트는 해당 routers/*.py 에 `@router.<method>` 로 추가.

### 검증 (변경 후 필수)
```bash
./scripts/dev-verify.sh          # 재빌드 + 격리 DB(wbs_test) API 동작 테스트 + 정적 계약 테스트 → outputs/verify.log
SKIP_BUILD=1 ./scripts/dev-verify.sh
```

### 코드 변경 후 배포
```bash
# 포털 파일 배포
docker cp apps/portal/index.html wbstoolagent-wbs-portal-1:/usr/share/nginx/html/index.html
docker cp apps/portal/app.js     wbstoolagent-wbs-portal-1:/usr/share/nginx/html/app.js
docker cp apps/portal/styles.css wbstoolagent-wbs-portal-1:/usr/share/nginx/html/styles.css
docker exec wbstoolagent-wbs-portal-1 nginx -s reload

# API 변경 배포
# (권장) ./scripts/dev-verify.sh 로 재빌드·검증. 수동 반영 시:
docker cp services/wbs-api/app/. wbstoolagent-wbs-api-1:/app/app/
docker restart wbstoolagent-wbs-api-1
```

### 캐시 버스팅
`index.html`의 `styles.css?v=` 및 `app.js?v=` 버전 문자열 갱신 필요.

### 검증 순서
1. `node -e "new Function(js)"` — JS 구문 확인
2. DOM ID 크래시 체크 (`querySelector.addEventListener` 패턴)
3. `curl http://localhost:3010/` + `http://localhost:8000/health` 응답 확인

---

## Phase 1 구현 현황 (WBS 핵심 기능)

| 기능 | 상태 |
|------|------|
| WBS 계층 구조 (Phase→Task→Sub-task) | ✅ |
| WBS 코드 자동 생성 | ✅ (서버 사이드) |
| 행 접기/펼치기 + 전체 토글 | ✅ |
| 드래그 앤 드롭 순서 변경 | ✅ |
| WBS 사전 (DoD + 산출물 + 범위 정의) | ✅ |
| R&R (담당자R·검토자A·승인자C) | ✅ |
| RACI 배지 시각화 | ✅ |
| 변경 관리 CR (폼 + 버전 자동 증가) | ✅ |
| 인라인 편집 (작업명·담당자·상태·진행률) | ✅ |
| 상태 드롭다운 즉시 변경 | ✅ |
| 승인 워크플로우 (수동 승인) | ✅ |
| 승인 시 OpenProject 자동 동기화 | ✅ |
| Webhook 실시간 역방향 동기화 | ✅ |
| CSV / Excel 내보내기 | ✅ |
| 코멘트 스레드 | ✅ |

---

## PM 핵심 규칙 (2026-10 적용)

| 규칙 | 위치 | 내용 |
|------|------|------|
| 진척률 공통 산식 | `services/wbs-api/app/wbs_rules.py` `compute_wbs_rollup()` | 최하위 작업만 입력, 상위는 leaf 가중 롤업. 모든 화면(대시보드·상세·히트맵·주간보고·번다운)은 이 함수만 사용 |
| SPI | 同 | EV ÷ PV, 계획 일정(시작~종료) 선형 기준. PV=0이면 None |
| 계층 규칙 | `validate_hierarchy()` | 최대 깊이 `WBS_MAX_DEPTH`(기본 5), 부모-자식 유형 규칙. `WBS_HIERARCHY_MODE=strict/warn/off` |
| 프로젝트 역할 | `main.py` `PROJECT_ROLES` | admin(관리자)·pm·pmo=편집 / member·reviewer=협업 / viewer=열람. 멤버 관리=admin·pm |
| 회의·Action Item | migration `016_meetings_action_items.sql` | `/api/projects/{id}/meetings`, `/api/projects/{id}/action-items`, `/api/me/action-items` |

포털 JS는 `app.js` + `meetings.js`(회의·Action·멤버 탭). 진척 롤업은 `computeWbsRollupMap()`이 서버 산식과 동일하게 계산.

## 디자인 시스템 요약

`design.md` 전문 참조. 핵심 원칙:

- **느낌**: Apple 생산성 도구 — 명확한 계층, 절제, 부드러운 표면, 강한 타이포
- **폰트**: `-apple-system`, `BlinkMacSystemFont` 우선
- **색상**: `--blue: #0071e3`, `--green: #1f9d55`, `--red: #d92d20`
- **반경**: `--radius: 8px`
- **모션**: 180ms 미만, 장식 금지
- **버튼**: 레이블 변경 시 크기 고정

---

## 작업 완료 보고 형식

```
## 변경 내용
- 무엇이 변경됐는지

## 변경 위치
- 어떤 파일의 어떤 함수/컴포넌트

## 검증
- 구문 확인, 크래시 체크, 배포 HTTP 코드

## 남은 위험
- 운영 리스크 또는 추가 작업 필요 사항
```

---

## OpenProject 연동 정보

```
OPENPROJECT_BASE_URL=http://openproject (Docker 내부)
OPENPROJECT_API_TOKEN=<.env 참조 — 저장소에 커밋 금지>
OPENPROJECT_SYNC_ENABLED=true
OPENPROJECT_AUTH_MODE=basic
PM_ENGINE_ADAPTER=openproject
```

**Webhook URL** (OP에 등록): `http://localhost:8000/api/webhooks/openproject`
