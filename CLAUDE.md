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
- admin / (로컬 `.env` 또는 비밀 관리 도구 참조 — 저장소에 평문 기록 금지)

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
표준/일반 WBS 관리
설정          ← 6개 탭: 플랫폼설정·승인이력·운영점검·사용자·감사로그·OpenProject
사용자 가이드
```

---

## 개발 워크플로우

### 코드 변경 후 배포
```bash
# 포털 파일 배포
docker cp apps/portal/index.html wbstoolagent-wbs-portal-1:/usr/share/nginx/html/index.html
docker cp apps/portal/app.js     wbstoolagent-wbs-portal-1:/usr/share/nginx/html/app.js
docker cp apps/portal/styles.css wbstoolagent-wbs-portal-1:/usr/share/nginx/html/styles.css
docker exec wbstoolagent-wbs-portal-1 nginx -s reload

# API 변경 배포
docker cp services/wbs-api/app/main.py wbstoolagent-wbs-api-1:/app/app/main.py
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
OPENPROJECT_API_TOKEN=<REDACTED — 로컬 .env 또는 비밀 관리 도구 참조>
OPENPROJECT_SYNC_ENABLED=true
OPENPROJECT_AUTH_MODE=basic
PM_ENGINE_ADAPTER=openproject
```

**Webhook URL** (OP에 등록): `http://localhost:8000/api/webhooks/openproject`
