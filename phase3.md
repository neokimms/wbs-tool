# Phase 3 — 운영 성숙도 · 고급 분석 · 협업

> 기준선: Phase 1(WBS 핵심) + Phase 2(PMO 운영·리스크·알림·멀티테넌시·SSO·Helm) 완료
> 목표: 실제 고객사 운영 환경에서 독립적으로 쓸 수 있는 완성도

---

## Phase 3 항목 (8개)

| ID | 기능 | 우선순위 |
|----|------|----------|
| P3-01 | **프로젝트 상세 페이지** — WBS·리스크·이슈·승인 이력을 탭으로 통합 | 🔴 높음 |
| P3-02 | **변경 관리 (CR) 고도화** — CR 목록 뷰 + 영향도 분석 + 승인 체인 | 🔴 높음 |
| P3-03 | **WBS 버전 비교** — 베이스라인 vs 현재 Diff 뷰 | 🟠 중간 |
| P3-04 | **포트폴리오 번다운 차트** — SVG 누적 진척 트렌드 | 🟠 중간 |
| P3-05 | **자원 배분 뷰** — 담당자별 작업 부하 캘린더/히트맵 | 🟠 중간 |
| P3-06 | **감사 로그 UI 고도화** — 필터·검색·CSV 내보내기 | 🟡 낮음 |
| P3-07 | **백업/복원 UI** — DB 스냅샷 트리거 + 다운로드 | 🟡 낮음 |
| P3-08 | **포털 설정 탭 완성** — LDAP·SMTP·알림·테넌트 설정 UI | 🟡 낮음 |

---

## 구현 순서

### Step 1 — P3-01: 프로젝트 상세 페이지
- `GET /api/projects/{id}` 엔드포인트 신규
- 포털 `#projectDetail` 패널 추가 (탭: WBS / 리스크 / 이슈 / 승인 / 변경요청)
- 프로젝트 카드·목록에서 클릭 → 상세 라우팅

### Step 2 — P3-02: 변경 관리 고도화
- `GET /api/projects/{id}/change-requests` 엔드포인트 + 필터
- `POST /api/projects/{id}/change-requests` — CR 생성 (영향도 필드 추가)
- `PATCH /api/change-requests/{id}/approve|reject` — 승인 체인
- 포털 CR 목록 탭 (상세 페이지 내)

### Step 3 — P3-03: WBS 버전 비교
- `GET /api/projects/{id}/baseline` 기존 활용
- `GET /api/projects/{id}/wbs-diff?baseline_id=` 신규 엔드포인트
- 포털 Diff 뷰: 추가/삭제/변경 항목 색상 구분 테이블

### Step 4 — P3-04: 포트폴리오 번다운 차트
- `GET /api/reports/burndown?from=&to=` 신규 (일별 진척률 스냅샷 집계)
- 포털 대시보드 하단 SVG 번다운 차트 컴포넌트

### Step 5 — P3-05: 자원 배분 뷰
- `GET /api/reports/resource-load?from=&to=` 신규 (담당자별 작업 수·진행률)
- 포털 `#resource` 패널 추가 (담당자 행 × 날짜 열 히트맵)

### Step 6 — P3-06: 감사 로그 UI 고도화
- 기존 `GET /api/audit-events` 쿼리 파라미터 확장 (event_type, entity_type, actor, date range)
- `GET /api/audit-events/export.csv` 신규
- 포털 감사 로그 탭에 필터 바 + CSV 다운로드 버튼

### Step 7 — P3-07: 백업/복원 UI
- 기존 `/api/operations/health` 확장 → `POST /api/operations/backup` 트리거
- `GET /api/operations/backups` 백업 목록
- `GET /api/operations/backups/{filename}` 다운로드
- 포털 설정 → 운영 탭에 백업 섹션

### Step 8 — P3-08: 포털 설정 탭 완성
- 설정 탭에 "인증(LDAP)" 탭 추가 — 서버/DN/필터 폼 + 테스트 연결 버튼
- 설정 탭에 "알림(SMTP)" 탭 추가 — SMTP 폼 + 테스트 발송 버튼
- 설정 탭에 "테넌트" 탭 추가 (admin 전용) — 테넌트 목록/생성

---

## DB 마이그레이션 계획

```
005_change_requests.sql  ← P3-02 (wbs_change_requests 고도화)
006_burndown.sql         ← P3-04 (wbs_progress_snapshots 테이블)
```

---

## 절대 원칙 (Phase 3에서도 동일)

1. PostgreSQL 전용
2. OpenProject 코어 무수정
3. 라이선스 경계 준수
4. 온프레미스 배포 가능
5. 신규 기능은 비활성화 기본값
