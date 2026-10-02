-- Phase 5 extension: internal Agile / Hybrid WBS sample templates.
-- These templates are managed by WBS Platform directly. OpenProject remains optional.

INSERT INTO wbs_templates (key, name, project_type, description, phases, tenant_id)
VALUES
  (
    'agile-standard',
    'Agile 표준 WBS',
    'Agile',
    'Epic, Story, Sprint, Definition of Done 중심의 Agile WBS 샘플 템플릿',
    '[
      {"code": "AGL.B", "name": "제품 백로그", "weight": 20},
      {"code": "AGL.S1", "name": "Sprint 1", "weight": 35},
      {"code": "AGL.S2", "name": "Sprint 2", "weight": 35},
      {"code": "AGL.R", "name": "릴리스/회고", "weight": 10}
    ]'::jsonb,
    'default'
  ),
  (
    'hybrid-standard',
    'Hybrid 표준 WBS',
    'Hybrid',
    '상위 단계형 WBS 기준선과 Sprint 실행 백로그를 연결하는 Hybrid WBS 샘플 템플릿',
    '[
      {"code": "HYB.1", "name": "착수/기준선", "weight": 10},
      {"code": "HYB.2", "name": "상위 설계/아키텍처", "weight": 20},
      {"code": "HYB.3", "name": "Agile 실행 트랙", "weight": 35},
      {"code": "HYB.4", "name": "통합 테스트/전환", "weight": 25},
      {"code": "HYB.5", "name": "운영 전환/안정화", "weight": 10}
    ]'::jsonb,
    'default'
  )
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    project_type = EXCLUDED.project_type,
    description = EXCLUDED.description,
    phases = EXCLUDED.phases,
    tenant_id = EXCLUDED.tenant_id;

INSERT INTO wbs_template_items
  (template_key, tenant_id, code, parent_code, name, item_type, owner, weight,
   start_date, finish_date, sort_order, metadata)
VALUES
  (
    'agile-standard', 'default', 'AGL', NULL, 'Agile 제품 개발 프로젝트',
    '프로젝트', 'PMO', 100, NULL, NULL, 1,
    '{"delivery_mode": "agile", "progress_formula": "완료 Story Point / 전체 Story Point"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.B', 'AGL', '제품 백로그',
    '단계', 'Product Owner', 20, NULL, NULL, 2,
    '{"delivery_mode": "agile", "progress_formula": "우선순위 및 Ready 상태 기준"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.B.E1', 'AGL.B', '사용자 인증 개선',
    'Epic', 'Product Owner', 8, NULL, NULL, 3,
    '{"delivery_mode": "agile", "agile_type": "Epic", "priority": "Must", "status": "Backlog", "notes": "로그인 안정성과 보안 개선을 묶은 Epic"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.B.E1.S1', 'AGL.B.E1', '비밀번호 정책 강화',
    'Story', '김개발', 3, '2026-06-09', '2026-06-14', 4,
    '{"delivery_mode": "agile", "agile_type": "Story", "story_points": 3, "priority": "Must", "status": "Ready", "sprint": "Sprint 1", "acceptance_criteria": "복잡도 규칙 위반 시 저장이 차단된다.", "definition_of_done": "단위 테스트, 보안 검토, 사용자 안내 문구 반영"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.B.E1.S2', 'AGL.B.E1', '2단계 인증 도입',
    'Story', '박개발', 8, '2026-06-23', '2026-07-02', 5,
    '{"delivery_mode": "agile", "agile_type": "Story", "story_points": 8, "priority": "Should", "status": "Backlog", "sprint": "Sprint 2", "acceptance_criteria": "사용자는 OTP 등록 후 로그인할 수 있다.", "definition_of_done": "등록/해제/복구 플로우 검증 완료"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.B.B1', 'AGL.B', '로그인 오류 메시지 개선',
    'Bug', '이개발', 2, '2026-06-10', '2026-06-12', 6,
    '{"delivery_mode": "agile", "agile_type": "Bug", "story_points": 2, "priority": "Could", "status": "Backlog", "sprint": "Sprint 1", "acceptance_criteria": "실패 원인별 안내 문구가 표시된다.", "definition_of_done": "QA 재현 케이스 통과"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.S1', 'AGL', 'Sprint 1 실행',
    '단계', 'Scrum Master', 35, '2026-06-09', '2026-06-22', 7,
    '{"delivery_mode": "agile", "sprint": "Sprint 1", "sprint_goal": "인증 정책 안정화와 로그인 사용성 개선", "planned_points": 13, "status": "Planning"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.S1.T1', 'AGL.S1', '인증 API 검증 자동화',
    'Task', '김개발', 5, '2026-06-09', '2026-06-18', 8,
    '{"delivery_mode": "agile", "agile_type": "Task", "story_points": 5, "priority": "Must", "status": "Ready", "sprint": "Sprint 1", "acceptance_criteria": "주요 인증 API에 회귀 테스트가 추가된다.", "definition_of_done": "CI 테스트 통과"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.S1.T2', 'AGL.S1', '로그인 UI 검수',
    'Task', 'QA', 3, '2026-06-15', '2026-06-20', 9,
    '{"delivery_mode": "agile", "agile_type": "Task", "story_points": 3, "priority": "Should", "status": "Review", "sprint": "Sprint 1", "acceptance_criteria": "모바일/데스크톱 로그인 화면 검수 완료", "definition_of_done": "검수 체크리스트 승인"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.S1.M1', 'AGL.S1', 'Sprint 1 Review',
    '마일스톤', 'Scrum Master', 4, '2026-06-22', '2026-06-22', 10,
    '{"delivery_mode": "agile", "inspection_required": true, "sprint": "Sprint 1", "notes": "Demo, Review, Retrospective 수행"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.S2', 'AGL', 'Sprint 2 실행',
    '단계', 'Scrum Master', 35, '2026-06-23', '2026-07-06', 11,
    '{"delivery_mode": "agile", "sprint": "Sprint 2", "sprint_goal": "2FA와 감사 로그 확장", "planned_points": 16, "status": "Planning"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.S2.S1', 'AGL.S2', '2FA 등록 플로우 구현',
    'Story', '박개발', 8, '2026-06-23', '2026-07-02', 12,
    '{"delivery_mode": "agile", "agile_type": "Story", "story_points": 8, "priority": "Must", "status": "Backlog", "sprint": "Sprint 2", "acceptance_criteria": "사용자가 2FA 등록과 재설정을 완료할 수 있다.", "definition_of_done": "보안 검토와 QA 통과"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.S2.S2', 'AGL.S2', '감사 로그 확장',
    'Story', 'PMO', 5, '2026-06-27', '2026-07-05', 13,
    '{"delivery_mode": "agile", "agile_type": "Story", "story_points": 5, "priority": "Should", "status": "Backlog", "sprint": "Sprint 2", "acceptance_criteria": "인증 정책 변경 이력이 감사 로그에 남는다.", "definition_of_done": "감사 화면에서 조회 가능"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.R', 'AGL', '릴리스/회고',
    '단계', 'PMO', 10, '2026-07-07', '2026-07-10', 14,
    '{"delivery_mode": "agile", "progress_formula": "릴리스 체크리스트 완료율"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.R.1', 'AGL.R', '릴리스 체크리스트',
    '산출물', 'Release Manager', 6, '2026-07-07', '2026-07-09', 15,
    '{"delivery_mode": "agile", "deliverable_type": "릴리스 산출물", "inspection_required": true, "notes": "배포 승인, 롤백 계획, 운영 공지"}'::jsonb
  ),
  (
    'agile-standard', 'default', 'AGL.R.2', 'AGL.R', 'Sprint 회고 및 액션아이템',
    'Task', 'Scrum Master', 4, '2026-07-10', '2026-07-10', 16,
    '{"delivery_mode": "agile", "agile_type": "Task", "story_points": 2, "priority": "Could", "status": "Backlog", "sprint": "Retrospective", "acceptance_criteria": "개선 액션아이템과 담당자가 등록된다.", "definition_of_done": "다음 Sprint 백로그에 반영"}'::jsonb
  ),

  (
    'hybrid-standard', 'default', 'HYB', NULL, 'Hybrid 단계형 + Agile 실행 프로젝트',
    '프로젝트', 'PMO', 100, NULL, NULL, 1,
    '{"delivery_mode": "hybrid", "progress_formula": "상위 WBS 가중치 + 하위 Agile 완료 Story Point"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.1', 'HYB', '착수/기준선',
    '단계', 'PMO', 10, '2026-06-03', '2026-06-07', 2,
    '{"delivery_mode": "hybrid", "progress_formula": "산출물 승인 기준"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.1.1', 'HYB.1', '프로젝트 수행계획서',
    '산출물', 'PMO', 6, '2026-06-03', '2026-06-06', 3,
    '{"delivery_mode": "hybrid", "deliverable_type": "계획서", "inspection_required": true}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.1.M1', 'HYB.1', '착수 승인',
    '마일스톤', 'PMO Lead', 4, '2026-06-07', '2026-06-07', 4,
    '{"delivery_mode": "hybrid", "inspection_required": true}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.2', 'HYB', '상위 설계/아키텍처',
    '단계', 'Architect', 20, '2026-06-08', '2026-06-21', 5,
    '{"delivery_mode": "hybrid", "progress_formula": "설계 산출물 승인 기준"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.2.1', 'HYB.2', '아키텍처 기준선',
    '산출물', 'Architect', 10, '2026-06-08', '2026-06-15', 6,
    '{"delivery_mode": "hybrid", "deliverable_type": "설계서", "inspection_required": true}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.2.2', 'HYB.2', 'API 인터페이스 설계',
    '산출물', 'Tech Lead', 10, '2026-06-12', '2026-06-21', 7,
    '{"delivery_mode": "hybrid", "deliverable_type": "설계서", "inspection_required": true}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.3', 'HYB', 'Agile 실행 트랙',
    '단계', 'PM', 35, '2026-06-22', '2026-07-19', 8,
    '{"delivery_mode": "hybrid", "sprint": "Sprint 1~2", "progress_formula": "연결된 Story Point 완료율"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.3.E1', 'HYB.3', '대시보드 고도화 Epic',
    'Epic', 'PM', 8, NULL, NULL, 9,
    '{"delivery_mode": "hybrid", "agile_type": "Epic", "priority": "Must", "status": "Backlog", "wbs_code": "HYB.3", "notes": "상위 WBS HYB.3에 연결"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.3.E1.S1', 'HYB.3.E1', 'KPI 카드 실시간 갱신',
    'Story', '이개발', 5, '2026-06-22', '2026-07-03', 10,
    '{"delivery_mode": "hybrid", "agile_type": "Story", "story_points": 5, "priority": "Must", "status": "Ready", "sprint": "Sprint 1", "wbs_code": "HYB.3", "acceptance_criteria": "대시보드 KPI가 최신 프로젝트/WBS 데이터로 갱신된다.", "definition_of_done": "API/화면 스모크 테스트 통과"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.3.E1.S2', 'HYB.3.E1', '위젯 커스터마이징 개선',
    'Story', '박개발', 8, '2026-07-06', '2026-07-17', 11,
    '{"delivery_mode": "hybrid", "agile_type": "Story", "story_points": 8, "priority": "Should", "status": "Backlog", "sprint": "Sprint 2", "wbs_code": "HYB.3", "acceptance_criteria": "사용자별 위젯 표시 설정이 저장된다.", "definition_of_done": "모바일/데스크톱 검수 완료"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.3.E2', 'HYB.3', '리스크/이슈 운영 Epic',
    'Epic', 'PMO', 8, NULL, NULL, 12,
    '{"delivery_mode": "hybrid", "agile_type": "Epic", "priority": "Must", "status": "Backlog", "wbs_code": "HYB.3"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.3.E2.S1', 'HYB.3.E2', '리스크 상세 패널',
    'Story', '김개발', 5, '2026-06-24', '2026-07-03', 13,
    '{"delivery_mode": "hybrid", "agile_type": "Story", "story_points": 5, "priority": "Must", "status": "Review", "sprint": "Sprint 1", "wbs_code": "HYB.3", "acceptance_criteria": "리스크 행 클릭 시 상세 패널이 열린다.", "definition_of_done": "목록 필터와 상세 이동 검증 완료"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.3.E2.S2', 'HYB.3.E2', '승인 알림 자동화',
    'Story', 'PMO', 3, '2026-07-06', '2026-07-12', 14,
    '{"delivery_mode": "hybrid", "agile_type": "Story", "story_points": 3, "priority": "Should", "status": "Backlog", "sprint": "Sprint 2", "wbs_code": "HYB.3", "acceptance_criteria": "승인 대기 알림이 설정된 일정에 발송된다.", "definition_of_done": "스케줄 실행 이력 확인"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.4', 'HYB', '통합 테스트/전환',
    '단계', 'QA Lead', 25, '2026-07-20', '2026-08-02', 15,
    '{"delivery_mode": "hybrid", "progress_formula": "테스트 통과율 및 승인 마일스톤"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.4.1', 'HYB.4', '통합 테스트 수행',
    '작업', 'QA', 15, '2026-07-20', '2026-07-30', 16,
    '{"delivery_mode": "hybrid", "deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.4.M1', 'HYB.4', 'UAT 승인',
    '마일스톤', '고객 PM', 10, '2026-08-02', '2026-08-02', 17,
    '{"delivery_mode": "hybrid", "inspection_required": true}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.5', 'HYB', '운영 전환/안정화',
    '단계', '운영 Lead', 10, '2026-08-03', '2026-08-14', 18,
    '{"delivery_mode": "hybrid", "progress_formula": "운영 인수인계와 회고 완료 기준"}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.5.1', 'HYB.5', '운영 인수인계 산출물',
    '산출물', '운영 Lead', 6, '2026-08-03', '2026-08-10', 19,
    '{"delivery_mode": "hybrid", "deliverable_type": "운영 문서", "inspection_required": true}'::jsonb
  ),
  (
    'hybrid-standard', 'default', 'HYB.5.2', 'HYB.5', 'Sprint 회고 반영 백로그 정리',
    'Task', 'Scrum Master', 4, '2026-08-11', '2026-08-14', 20,
    '{"delivery_mode": "hybrid", "agile_type": "Task", "story_points": 2, "priority": "Could", "status": "Backlog", "sprint": "Stabilization", "wbs_code": "HYB.5", "acceptance_criteria": "잔여 백로그가 운영 개선 과제로 전환된다.", "definition_of_done": "담당자와 목표일 지정 완료"}'::jsonb
  )
ON CONFLICT (template_key, code) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    parent_code = EXCLUDED.parent_code,
    name = EXCLUDED.name,
    item_type = EXCLUDED.item_type,
    owner = EXCLUDED.owner,
    weight = EXCLUDED.weight,
    start_date = EXCLUDED.start_date,
    finish_date = EXCLUDED.finish_date,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    updated_at = now();
