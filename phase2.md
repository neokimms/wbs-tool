# AX WBS Platform — Phase 2 범위 정의

> **기준일**: 2026-06-08  
> **Phase 1 완료 기준**: CLAUDE.md Phase 1 구현 현황 전 항목 ✅  
> **Phase 2 목표**: PMO 실운영 가능 수준 완성 — 리포팅·알림·리스크·이슈 트래킹·멀티 테넌시·운영 고도화

---

## Phase 1 완료 기준선

Phase 2는 아래 Phase 1 범위가 모두 완료된 이후를 전제합니다.

| 기능 | 상태 |
|------|------|
| WBS 계층 구조 (단계→산출물→작업→하위작업) | ✅ |
| WBS 코드 자동 생성 (서버 사이드) | ✅ |
| 행 접기/펼치기 + 전체 토글 | ✅ |
| 드래그 앤 드롭 순서 변경 | ✅ |
| WBS 사전 (DoD + 산출물 + 범위 정의) | ✅ |
| RACI 배지 (담당자R · 검토자A · 승인자C) | ✅ |
| 변경 관리 CR (폼 + 버전 자동 증가) | ✅ |
| 인라인 편집 (작업명·담당자·상태·진행률) | ✅ |
| 상태 드롭다운 즉시 변경 | ✅ |
| 승인 워크플로우 (수동 승인) | ✅ |
| 승인 시 OpenProject 자동 동기화 | ✅ |
| Webhook 실시간 역방향 동기화 | ✅ |
| CSV / Excel 내보내기 | ✅ |
| 코멘트 스레드 | ✅ |
| 포털 로그인 + RBAC (admin / pmo / viewer) | ✅ |
| 감사 로그 (wbs_audit_events) | ✅ |
| 운영 헬스체크 대시보드 | ✅ |
| PostgreSQL 백업 / 복구 스크립트 | ✅ |
| Prometheus metrics 노출 | ✅ |
| Helm chart 초안 (Kubernetes 배포) | ✅ |

---

## Phase 2 작업 항목

### P2-01 · PMO 대시보드 고도화

**목적**: 카드 수준 집계를 넘어 포트폴리오 전체를 한 화면에서 판단할 수 있는 실운영 PMO 뷰 제공

**현재 상태**  
- `renderPortfolioMeta()`는 프로젝트 수·승인 대기 수·OpenProject 상태만 표시  
- `state.dashboard.metrics`는 클라이언트에서 로컬 집계 후 채움 (`/api/dashboard` 응답을 거의 활용하지 않음)

**구현 범위**

| 항목 | 내용 |
|------|------|
| SPI / CPI 지표 | 계획 대비 실적 일정·비용 효율 지수, 프로젝트별 카드에 표시 |
| 진척률 히트맵 | 단계(Phase)별 완료율을 색상 매트릭스로 시각화 |
| 승인 파이프라인 요약 | Pending → 승인/반려 흐름을 한 눈에 파악하는 Kanban 스타일 열 |
| 리스크·이슈 카운터 | 포트폴리오 전체 Open 리스크 수·이슈 수를 대시보드 상단 메트릭에 추가 |
| `/api/dashboard` 서버 사이드 집계 | 현재 클라이언트 집계를 API로 이전, 응답에 SPI/CPI/risk_count/issue_count 포함 |

**수락 기준**  
- `/api/dashboard` 호출 한 번으로 전체 PMO 지표 반환  
- 대시보드 첫 화면에서 스크롤 없이 10개 이상 프로젝트 상태 파악 가능

---

### P2-02 · 리스크 · 이슈 트래킹 전용 뷰

**목적**: `agent.md` 데이터 모델에 정의된 Risk·Issue 항목 유형을 WBS 트리 내 원소로 관리하는 것을 넘어, 포트폴리오 단위 추적·에스컬레이션 워크플로우 제공

**현재 상태**  
- WBS 항목 `item_type`에 `리스크`, `이슈` 값은 지원되나 전용 UI 뷰 없음  
- 필터링·집계·에스컬레이션 로직 미구현

**구현 범위**

| 항목 | 내용 |
|------|------|
| 리스크 레지스터 뷰 | 전체 프로젝트 리스크 목록, 심각도(High/Med/Low)·발생 가능성·대응 전략 컬럼 |
| 이슈 트래커 뷰 | 전체 프로젝트 이슈 목록, 우선순위·담당자·목표 해결일 컬럼 |
| 에스컬레이션 워크플로우 | 리스크·이슈 → OpenProject Work Package 자동 연결 및 상태 동기화 |
| `/api/projects/{id}/risks` | 프로젝트별 리스크 목록 및 집계 엔드포인트 |
| `/api/projects/{id}/issues` | 프로젝트별 이슈 목록 및 집계 엔드포인트 |
| 메뉴 구조 추가 | 현재 7개 메뉴에 "리스크·이슈" 메뉴 추가 또는 "WBS 관리" 탭 내 서브 뷰로 통합 |

**DB 변경**  
- `wbs_items` 테이블에 `severity`, `likelihood`, `mitigation`, `due_date_override` 컬럼 추가  
- migration `002_risks_issues.sql`

**수락 기준**  
- PMO가 전체 프로젝트 High 리스크를 한 화면에서 조회 가능  
- 리스크·이슈 상태 변경 시 감사 로그 기록

---

### P2-03 · PMO 리포팅 — Excel / PDF 내보내기 고도화

**목적**: 현재 CSV/단순 Excel 내보내기를 넘어 경영진 보고용 정형 보고서 자동 생성

**현재 상태**  
- `/api/templates/{key}/excel`: 템플릿 Excel 다운로드  
- `/api/projects/{id}/wbs-docx`: DOCX 내보내기 존재  
- 경영진 요약 보고서(PDF) 미구현

**구현 범위**

| 항목 | 내용 |
|------|------|
| PMO 주간 보고서 Excel | 프로젝트별 진척·리스크·이슈를 시트별로 구성한 주간 보고 양식 |
| 경영진 요약 PDF | 포트폴리오 진척률 차트·SPI/CPI 포함 1~2페이지 PDF (`reportlab` 또는 `weasyprint`) |
| 포털 내 내보내기 버튼 | 대시보드·프로젝트 상세 드로어에 "보고서 내보내기" 버튼 추가 |
| `/api/reports/weekly-excel` | 기간 지정 PMO 주간 보고서 Excel 생성 엔드포인트 |
| `/api/reports/executive-pdf` | 경영진 요약 PDF 생성 엔드포인트 |

**수락 기준**  
- 보고서 생성 10초 이내 응답  
- 회사 로고·표준 양식 적용 가능한 템플릿 구조

---

### P2-04 · 알림 시스템

**목적**: 승인 요청·리스크 에스컬레이션·동기화 실패 시 담당자에게 자동 알림

**현재 상태**  
- 알림 체계 전무. 승인 요청 시 수동 확인 필요  
- `wbs_audit_events`에 이벤트는 기록되지만 알림 발송 없음

**구현 범위**

| 항목 | 내용 |
|------|------|
| 이메일 알림 (SMTP) | 승인 요청·승인 완료·반려·리스크 에스컬레이션 시 담당자 이메일 발송 |
| 포털 인앱 알림 | 로그인 후 상단 벨 아이콘에 미읽음 알림 카운트 표시 |
| 알림 설정 탭 | 설정 메뉴에 "알림" 탭 추가 — SMTP 설정·이벤트별 수신 여부 토글 |
| `/api/notifications` | 인앱 알림 목록 및 읽음 처리 엔드포인트 |
| DB 변경 | `wbs_notifications` 테이블, migration `003_notifications.sql` |
| 환경 변수 | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `NOTIFY_FROM_EMAIL` |

**수락 기준**  
- SMTP 미설정 시 graceful degradation (인앱 알림만 동작)  
- 알림 발송 실패가 메인 워크플로우를 블록하지 않음 (비동기 처리)

---

### P2-05 · 멀티 테넌시 (고객사별 격리)

**목적**: 단일 인프라에서 복수 고객사 운영 — 데이터 격리·독립 설정·개별 관리자 계정

**현재 상태**  
- 단일 테넌트 구조. `wbs_platform` DB에 모든 데이터 혼재  
- 사용자 역할은 admin/pmo/viewer 3단계이며 테넌트 개념 없음

**구현 범위**

| 항목 | 내용 |
|------|------|
| `tenant_id` 컬럼 추가 | 핵심 테이블(`wbs_projects`, `wbs_items`, `wbs_users`, `wbs_audit_events` 등) 전반 |
| 테넌트별 관리자 | `tenant_admin` 역할 추가 — 자신의 테넌트 사용자만 관리 가능 |
| 테넌트 프로비저닝 API | `/api/tenants` (super-admin 전용) — 테넌트 생성·정지·삭제 |
| 포털 도메인 라우팅 | 서브도메인 또는 URL prefix로 테넌트 식별 (`tenant` 쿼리 파라미터 또는 `X-Tenant-ID` 헤더) |
| 테넌트별 OpenProject 설정 | 각 테넌트가 독립 OpenProject 인스턴스를 연결할 수 있도록 설정 분리 |
| migration `004_multitenancy.sql` | 기존 데이터를 `default` 테넌트로 마이그레이션 |

**수락 기준**  
- 테넌트 A의 사용자가 테넌트 B 데이터에 접근 불가 (API 레벨 격리)  
- 기존 단일 테넌트 배포와 호환 (테넌트 기능 비활성화 모드 지원)

---

### P2-06 · SSO / LDAP 인증 연동

**목적**: 고객사 기존 디렉터리 서비스(AD, LDAP, SAML IdP)와 연동하여 별도 계정 관리 불필요

**현재 상태**  
- 이메일/패스워드 자체 인증만 지원  
- `wbs_users` 테이블에 bcrypt 해시 저장

**구현 범위**

| 항목 | 내용 |
|------|------|
| LDAP/AD 연동 | `ldap3` 라이브러리 사용, DN 바인딩·그룹 매핑으로 역할 자동 부여 |
| SAML 2.0 SP | `python3-saml` 사용, IdP 메타데이터 XML 업로드로 설정 |
| 설정 메뉴 연동 탭 | LDAP 서버 주소·DN·그룹 매핑 UI |
| 환경 변수 | `AUTH_BACKEND` (`local` / `ldap` / `saml`), `LDAP_URL`, `LDAP_BIND_DN` 등 |
| 혼합 모드 | `local` 계정과 SSO 계정 공존 가능 (fallback 순서 설정) |

**수락 기준**  
- SSO 미설정 시 기존 로컬 인증 그대로 동작  
- LDAP 그룹 → pmo/admin 역할 자동 매핑

---

### P2-07 · 간트 차트 포털 내재화

**목적**: 현재 "📊 간트 차트" 버튼은 OpenProject 외부 페이지로 이동. 포털 내에서 직접 렌더링

**현재 상태**  
- `renderSyncedProjectsList()`에서 OpenProject 간트 URL로 외부 링크 제공  
- WBS 현황 탭의 간트는 OpenProject iframe 또는 외부 링크 의존

**구현 범위**

| 항목 | 내용 |
|------|------|
| Vanilla JS 간트 렌더러 | SVG 기반 경량 간트 바 렌더링 (외부 라이브러리 최소화) |
| 포털 WBS 현황 탭 내 간트 뷰 | 작업패키지 목록과 간트를 수평 분할 레이아웃으로 표시 |
| 오늘 기준선·진척률 바 | 현재 날짜 세로선, 완료율(%) 채움 바 |
| 마일스톤 다이아몬드 마커 | `item_type=마일스톤` 항목을 다이아몬드 심볼로 표시 |
| `/api/projects/{id}/op-work-packages` 활용 | 기존 엔드포인트 데이터 재사용 |

**수락 기준**  
- OpenProject 접속 없이 포털에서 간트 조회 가능  
- 100개 행 기준 렌더링 200ms 이내

---

### P2-08 · Helm Chart 운영 고도화

**목적**: Helm chart 초안을 실제 고객사 배포 가능 수준으로 완성

**현재 상태**  
- `infra/helm/wbs-platform` 초안 존재  
- HA, Rolling Update 전략, Secret 관리, HPA 미구성

**구현 범위**

| 항목 | 내용 |
|------|------|
| HPA (Horizontal Pod Autoscaler) | API Pod CPU 70% 기준 2~10 replica 자동 확장 |
| Rolling Update 전략 | `maxUnavailable: 0`, `maxSurge: 1` — 무중단 배포 |
| External Secret 연동 | `ExternalSecret` CRD 지원 (Vault, AWS Secrets Manager) |
| PodDisruptionBudget | `minAvailable: 1` — 노드 드레인 시 서비스 유지 |
| Readiness / Liveness probe 고도화 | `/health` 응답 코드 기반 → DB 연결·마이그레이션 상태까지 확인 |
| NetworkPolicy 기본 템플릿 | API ↔ DB, 포털 ↔ API 허용, 외부 egress 제한 |
| Chart 버전 관리 | `Chart.yaml`의 `version`을 `appVersion`과 독립 관리 |

**수락 기준**  
- `helm upgrade --install` 한 번으로 실운영 구성 완료  
- `helm test` 통과

---

## 구현 우선순위 매트릭스

| 항목 | 비즈니스 가치 | 구현 복잡도 | 권장 순서 |
|------|-------------|------------|---------|
| P2-01 PMO 대시보드 고도화 | 높음 | 낮음 | **1순위** |
| P2-02 리스크·이슈 트래킹 | 높음 | 중간 | **2순위** |
| P2-04 알림 시스템 | 높음 | 중간 | **3순위** |
| P2-03 PMO 리포팅 | 중간 | 중간 | **4순위** |
| P2-07 간트 차트 내재화 | 중간 | 높음 | **5순위** |
| P2-05 멀티 테넌시 | 중간 | 높음 | **6순위** |
| P2-06 SSO / LDAP | 낮음~중간 | 높음 | **7순위** |
| P2-08 Helm 고도화 | 낮음 | 낮음 | 병행 가능 |

---

## DB 마이그레이션 계획

```
001_init.sql          ← Phase 1 (완료)
002_risks_issues.sql  ← P2-02 (severity, likelihood, mitigation 컬럼)
003_notifications.sql ← P2-04 (wbs_notifications 테이블)
004_multitenancy.sql  ← P2-05 (tenant_id 컬럼, wbs_tenants 테이블)
```

---

## 환경 변수 추가 목록

| 변수 | 기본값 | 항목 |
|------|--------|------|
| `SMTP_HOST` | — | P2-04 |
| `SMTP_PORT` | `587` | P2-04 |
| `SMTP_USER` | — | P2-04 |
| `SMTP_PASSWORD` | — | P2-04 |
| `NOTIFY_FROM_EMAIL` | — | P2-04 |
| `AUTH_BACKEND` | `local` | P2-06 |
| `LDAP_URL` | — | P2-06 |
| `LDAP_BIND_DN` | — | P2-06 |
| `MULTITENANCY_ENABLED` | `false` | P2-05 |
| `DEFAULT_TENANT_ID` | `default` | P2-05 |

---

## 절대 원칙 (Phase 2에서도 동일 적용)

1. PostgreSQL 전용 — 다른 DB 지원 추가 금지
2. OpenProject 코어 무수정 — API·Webhook·플러그인으로만 확장
3. 라이선스 경계 준수 — Enterprise add-on 우회 금지
4. 온프레미스 배포 가능 — 외부 클라우드 의존 없이 실행 가능해야 함
5. 신규 기능은 비활성화 기본값 — `FEATURE_FLAG` 또는 설정 메뉴에서 활성화
