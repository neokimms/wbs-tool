CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS wbs_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key citext UNIQUE NOT NULL,
  name text NOT NULL,
  project_type text NOT NULL,
  description text NOT NULL,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_key citext NOT NULL REFERENCES wbs_templates(key),
  owner text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  start_date date NOT NULL DEFAULT current_date,
  openproject_project_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  request_type text NOT NULL DEFAULT 'WBS Baseline',
  status text NOT NULL DEFAULT 'Pending',
  requester text NOT NULL DEFAULT 'PMO',
  reviewer text,
  due_date date,
  decision_comment text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'Active',
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS wbs_users
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

CREATE TABLE IF NOT EXISTS wbs_user_sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES wbs_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_system_settings (
  key text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL DEFAULT '',
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_sensitive boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  actor_email citext,
  actor_role text,
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file text NOT NULL,
  template_key citext,
  template_name text,
  project_type text,
  description text,
  status text NOT NULL DEFAULT 'Queued',
  template_version integer,
  total_rows integer NOT NULL DEFAULT 0,
  accepted_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  preview_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  diff_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS wbs_import_jobs
  ADD COLUMN IF NOT EXISTS template_key citext,
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preview_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS diff_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

CREATE TABLE IF NOT EXISTS wbs_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key citext NOT NULL REFERENCES wbs_templates(key) ON DELETE CASCADE,
  code text NOT NULL,
  parent_code text,
  name text NOT NULL,
  item_type text NOT NULL DEFAULT '작업',
  owner text,
  weight numeric(8, 2),
  start_date date,
  finish_date date,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_key, code)
);

CREATE TABLE IF NOT EXISTS wbs_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key citext NOT NULL REFERENCES wbs_templates(key) ON DELETE CASCADE,
  version integer NOT NULL,
  template_name text NOT NULL,
  project_type text NOT NULL,
  description text NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  snapshot_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_key, version)
);

CREATE TABLE IF NOT EXISTS wbs_project_wbs_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  code text NOT NULL,
  parent_code text,
  name text NOT NULL,
  item_type text NOT NULL DEFAULT '작업',
  owner text,
  weight numeric(8, 2),
  start_date date,
  finish_date date,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_import_job_id uuid REFERENCES wbs_import_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS wbs_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  mode text NOT NULL,
  status text NOT NULL,
  actor text NOT NULL DEFAULT 'PMO',
  engine text NOT NULL DEFAULT 'openproject',
  dry_run boolean NOT NULL DEFAULT true,
  create_work_packages boolean NOT NULL DEFAULT true,
  validate_payloads boolean NOT NULL DEFAULT true,
  total_rows integer NOT NULL DEFAULT 0,
  pending_work_packages integer NOT NULL DEFAULT 0,
  synced_work_packages integer NOT NULL DEFAULT 0,
  created_work_packages integer NOT NULL DEFAULT 0,
  openproject_project_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS wbs_project_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  approval_id uuid UNIQUE REFERENCES wbs_approval_requests(id) ON DELETE SET NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'Locked',
  template_key citext NOT NULL,
  template_name text NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  total_weight numeric(10, 2) NOT NULL DEFAULT 0,
  snapshot_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS wbs_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key citext UNIQUE NOT NULL,
  name text NOT NULL,
  report_type text NOT NULL DEFAULT 'weekly_project_status',
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  day_of_week integer NOT NULL DEFAULT 0 CHECK (day_of_week BETWEEN 0 AND 6),
  hour integer NOT NULL DEFAULT 9 CHECK (hour BETWEEN 0 AND 23),
  minute integer NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_subject text NOT NULL DEFAULT '[WBS] 주간 프로젝트 보고서',
  email_body text NOT NULL DEFAULT '주간 WBS 프로젝트 현황 보고서를 첨부합니다.',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES wbs_report_schedules(id) ON DELETE SET NULL,
  schedule_key citext NOT NULL,
  report_type text NOT NULL DEFAULT 'weekly_project_status',
  status text NOT NULL DEFAULT 'Generated',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  artifact_path text,
  delivery_status text NOT NULL DEFAULT 'skipped',
  delivery_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by text NOT NULL DEFAULT 'scheduler',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wbs_projects_status ON wbs_projects(status);
CREATE INDEX IF NOT EXISTS idx_wbs_projects_template ON wbs_projects(template_key);
CREATE INDEX IF NOT EXISTS idx_wbs_approval_requests_project ON wbs_approval_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_approval_requests_status ON wbs_approval_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_users_role ON wbs_users(role, status);
CREATE INDEX IF NOT EXISTS idx_wbs_users_locked ON wbs_users(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wbs_user_sessions_user ON wbs_user_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_user_sessions_expires ON wbs_user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_wbs_system_settings_category ON wbs_system_settings(category, key);
CREATE INDEX IF NOT EXISTS idx_wbs_audit_events_created ON wbs_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_audit_events_type ON wbs_audit_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_audit_events_actor ON wbs_audit_events(actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_import_jobs_status ON wbs_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_wbs_import_jobs_template ON wbs_import_jobs(template_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_template_items_template ON wbs_template_items(template_key, sort_order);
CREATE INDEX IF NOT EXISTS idx_wbs_template_items_parent ON wbs_template_items(template_key, parent_code);
CREATE INDEX IF NOT EXISTS idx_wbs_template_versions_template ON wbs_template_versions(template_key, version DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_project_wbs_items_project ON wbs_project_wbs_items(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_wbs_project_wbs_items_parent ON wbs_project_wbs_items(project_id, parent_code);
CREATE INDEX IF NOT EXISTS idx_wbs_sync_runs_project ON wbs_sync_runs(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_sync_runs_status ON wbs_sync_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_sync_runs_mode ON wbs_sync_runs(mode, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_project_baselines_project ON wbs_project_baselines(project_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_project_baselines_status ON wbs_project_baselines(status, locked_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_report_schedules_enabled ON wbs_report_schedules(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_wbs_report_runs_schedule ON wbs_report_runs(schedule_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_report_runs_status ON wbs_report_runs(status, started_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'wbs_users'
      AND column_name = 'group_id'
  ) THEN
    ALTER TABLE wbs_users ALTER COLUMN group_id DROP NOT NULL;
  END IF;
END $$;

INSERT INTO wbs_users (email, display_name, role, password_hash, status)
VALUES
  ('admin@wbs.local', 'WBS Admin', 'admin', crypt('adminadmin', gen_salt('bf')), 'Active'),
  ('pmo@wbs.local', 'PMO Lead', 'pmo', crypt('pmopmo', gen_salt('bf')), 'Active'),
  ('viewer@wbs.local', 'Project Viewer', 'viewer', crypt('viewonly', gen_salt('bf')), 'Active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO wbs_system_settings (key, label, category, description, value)
VALUES
  (
    'pm_engine',
    'PM Engine Adapter',
    'integration',
    'OpenProject 같은 PM 엔진 구현체를 포털/API의 어댑터 경계 뒤에 둡니다.',
    '{
      "adapter": "openproject",
      "display_name": "OpenProject",
      "mode": "ce-api-adapter",
      "dependency_boundary": "pm-engine-api",
      "actual_sync_control": "OPENPROJECT_SYNC_ENABLED",
      "mock_adapter_available": true,
      "notes": "OpenProject 전용 API 호출은 PM engine adapter 내부에서만 수행합니다."
    }'::jsonb
  ),
  (
    'approval_policy',
    'Approval Policy',
    'workflow',
    '내부 PMO 승인은 기본 자동 승인하고 승인 시 baseline을 잠급니다.',
    '{
      "internal_auto_approve": true,
      "baseline_lock": true,
      "manual_external_required": false
    }'::jsonb
  ),
  (
    'portal_access',
    'Portal Access',
    'security',
    '포털 메뉴와 운영 기능에 적용하는 역할 기준입니다.',
    '{
      "operations_roles": ["admin", "pmo"],
      "audit_roles": ["admin", "pmo"],
      "settings_roles": ["admin", "pmo"],
      "user_admin_roles": ["admin"],
      "mutating_roles": ["admin", "pmo"],
      "viewer_mode": "read_only"
    }'::jsonb
  ),
  (
    'security_policy',
    'Security Policy',
    'security',
    '로그인 실패 제한, 초기 비밀번호 변경, 감사 로그 보존 기준입니다.',
    '{
      "login_failure_limit": 5,
      "login_lock_minutes": 15,
      "new_user_must_change_password": true,
      "audit_retention_days": 365,
      "file_origin_allowed_for_local_dev": true
    }'::jsonb
  ),
  (
    'workflow_policy',
    'Project Workflow Policy',
    'workflow',
    '프로젝트 상태 전이와 승인 후 수정 제한 기준입니다.',
    '{
      "transitions": {
        "Draft": ["Review", "Approved", "Closed"],
        "Review": ["Approved", "Rejected", "Closed"],
        "Rejected": ["Draft", "Review", "Closed"],
        "Approved": ["Synced", "Closed"],
        "Synced": ["Closed"],
        "Closed": []
      },
      "approval_allowed": ["Draft", "Rejected", "Review"],
      "project_wbs_import_allowed": ["Draft", "Rejected", "Review"],
      "actual_sync_requires_status": "Approved",
      "actual_sync_requires_locked_baseline": true
    }'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO wbs_report_schedules
  (key, name, report_type, enabled, timezone, day_of_week, hour, minute, recipients, email_subject, email_body, metadata)
VALUES
  (
    'weekly-pmo',
    'PMO 주간 보고서',
    'weekly_project_status',
    false,
    'Asia/Seoul',
    0,
    9,
    0,
    '[]'::jsonb,
    '[WBS] 주간 프로젝트 보고서',
    '주간 WBS 프로젝트 현황 보고서를 첨부합니다.',
    '{"default_schedule": true, "ui_surface": "notifications"}'::jsonb
  ),
  (
    'risk-escalation',
    '리스크 에스컬레이션',
    'risk_escalation',
    false,
    'Asia/Seoul',
    0,
    8,
    0,
    '[]'::jsonb,
    '[WBS] 고위험 리스크 에스컬레이션',
    '미처리 고위험 리스크 목록을 공유합니다.',
    '{"default_schedule": true, "ui_surface": "notifications", "frequency": "daily"}'::jsonb
  ),
  (
    'approval-reminder',
    '승인 대기 리마인더',
    'approval_reminder',
    false,
    'Asia/Seoul',
    0,
    17,
    0,
    '[]'::jsonb,
    '[WBS] 승인 대기 리마인더',
    '승인 대기 중인 WBS 항목을 확인해 주세요.',
    '{"default_schedule": true, "ui_surface": "notifications", "frequency": "daily"}'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO wbs_templates (key, name, project_type, description, phases)
VALUES
  (
    'si-standard',
    'SI 구축 표준 WBS',
    'System Integration',
    '착수, 분석, 설계, 개발, 테스트, 전환, 안정화 중심의 SI 구축 템플릿',
    '[
      {"code": "1", "name": "착수", "weight": 5},
      {"code": "2", "name": "분석", "weight": 15},
      {"code": "3", "name": "설계", "weight": 20},
      {"code": "4", "name": "개발", "weight": 25},
      {"code": "5", "name": "테스트", "weight": 20},
      {"code": "6", "name": "전환", "weight": 10},
      {"code": "7", "name": "안정화", "weight": 5}
    ]'::jsonb
  ),
  (
    'migration-data',
    '데이터 이관 WBS',
    'Data Migration',
    '소스 분석, 매핑, 정제, 리허설, 본이관, 검증 중심의 데이터 이관 템플릿',
    '[
      {"code": "1", "name": "소스 분석", "weight": 15},
      {"code": "2", "name": "매핑 설계", "weight": 15},
      {"code": "3", "name": "정제 및 변환", "weight": 25},
      {"code": "4", "name": "리허설", "weight": 20},
      {"code": "5", "name": "본이관", "weight": 15},
      {"code": "6", "name": "검증", "weight": 10}
    ]'::jsonb
  ),
  (
    'maintenance',
    '유지보수 운영 WBS',
    'Maintenance',
    '접수, 영향도 분석, 조치, 검증, 릴리스, 회고 중심의 유지보수 템플릿',
    '[
      {"code": "1", "name": "요청 접수", "weight": 10},
      {"code": "2", "name": "영향도 분석", "weight": 20},
      {"code": "3", "name": "조치", "weight": 30},
      {"code": "4", "name": "검증", "weight": 20},
      {"code": "5", "name": "릴리스", "weight": 15},
      {"code": "6", "name": "회고", "weight": 5}
    ]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO wbs_template_items
  (template_key, code, parent_code, name, item_type, owner, weight, sort_order, metadata)
VALUES
  ('si-standard', 'SI', NULL, '회사 표준 SI 프로젝트', '프로젝트', 'PMO', 100, 1, '{"progress_formula": "하위 단계 가중치 합산"}'::jsonb),
  ('si-standard', 'SI.1', 'SI', '착수', '단계', 'PMO', 5, 2, '{}'::jsonb),
  ('si-standard', 'SI.1.1', 'SI.1', '프로젝트 수행계획서', '산출물', 'PMO', 3, 3, '{"deliverable_type": "계획서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.1.M1', 'SI.1', '착수 보고 승인', '마일스톤', 'PMO', 2, 4, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.2', 'SI', '분석', '단계', 'PMO', 15, 5, '{}'::jsonb),
  ('si-standard', 'SI.2.1', 'SI.2', '현행 업무 및 시스템 분석', '작업', 'PMO', 4, 6, '{}'::jsonb),
  ('si-standard', 'SI.2.2', 'SI.2', '요구사항 정의서', '산출물', 'PMO', 7, 7, '{"deliverable_type": "요구사항", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.2.M1', 'SI.2', '요구사항 검토 승인', '마일스톤', 'PMO', 4, 8, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.3', 'SI', '설계', '단계', 'PMO', 20, 9, '{}'::jsonb),
  ('si-standard', 'SI.3.1', 'SI.3', '아키텍처 설계서', '산출물', 'PMO', 5, 10, '{"deliverable_type": "설계서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.3.2', 'SI.3', '화면 및 기능 설계서', '산출물', 'PMO', 6, 11, '{"deliverable_type": "설계서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.3.3', 'SI.3', '인터페이스 및 데이터 설계서', '산출물', 'PMO', 5, 12, '{"deliverable_type": "설계서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.3.M1', 'SI.3', '설계 검토 승인', '마일스톤', 'PMO', 4, 13, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.4', 'SI', '개발', '단계', 'PMO', 25, 14, '{}'::jsonb),
  ('si-standard', 'SI.4.1', 'SI.4', '개발 환경 구성', '작업', 'PMO', 3, 15, '{}'::jsonb),
  ('si-standard', 'SI.4.2', 'SI.4', '기능 개발', '작업', 'PMO', 12, 16, '{}'::jsonb),
  ('si-standard', 'SI.4.3', 'SI.4', '인터페이스 개발', '작업', 'PMO', 5, 17, '{}'::jsonb),
  ('si-standard', 'SI.4.4', 'SI.4', '단위 테스트 결과서', '산출물', 'PMO', 5, 18, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.5', 'SI', '테스트', '단계', 'PMO', 20, 19, '{}'::jsonb),
  ('si-standard', 'SI.5.1', 'SI.5', '통합 테스트 시나리오', '산출물', 'PMO', 4, 20, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.5.2', 'SI.5', '통합 테스트 수행', '작업', 'PMO', 5, 21, '{}'::jsonb),
  ('si-standard', 'SI.5.3', 'SI.5', '사용자 인수 테스트', '작업', 'PMO', 6, 22, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.5.4', 'SI.5', '결함 조치 결과서', '산출물', 'PMO', 5, 23, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.6', 'SI', '전환', '단계', 'PMO', 10, 24, '{}'::jsonb),
  ('si-standard', 'SI.6.1', 'SI.6', '데이터 이관 계획 및 검증', '산출물', 'PMO', 4, 25, '{"deliverable_type": "이관 산출물", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.6.2', 'SI.6', '운영 전환 계획서', '산출물', 'PMO', 3, 26, '{"deliverable_type": "운영 문서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.6.M1', 'SI.6', '전환 리허설 및 본전환', '마일스톤', 'PMO', 3, 27, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.7', 'SI', '안정화', '단계', 'PMO', 5, 28, '{}'::jsonb),
  ('si-standard', 'SI.7.1', 'SI.7', '안정화 지원', '작업', 'PMO', 2, 29, '{}'::jsonb),
  ('si-standard', 'SI.7.2', 'SI.7', '운영 인수인계', '산출물', 'PMO', 2, 30, '{"deliverable_type": "운영 문서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.7.M1', 'SI.7', '종료 보고 승인', '마일스톤', 'PMO', 1, 31, '{"inspection_required": true}'::jsonb),

  -- 데이터 이관 WBS 표준 항목
  ('migration-data', 'MIG',      NULL,     '데이터 이관 프로젝트',         '프로젝트', 'PMO', 100, 1,  '{"progress_formula": "하위 단계 가중치 합산"}'::jsonb),
  ('migration-data', 'MIG.1',    'MIG',    '소스 분석',                    '단계',     'PMO', 15,  2,  '{}'::jsonb),
  ('migration-data', 'MIG.1.1',  'MIG.1',  '소스 시스템 현황 분석',        '작업',     'PMO', 7,   3,  '{}'::jsonb),
  ('migration-data', 'MIG.1.2',  'MIG.1',  '소스 데이터 품질 점검 결과서', '산출물',   'PMO', 5,   4,  '{"deliverable_type": "요구사항", "inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.1.M1', 'MIG.1',  '소스 분석 완료 승인',          '마일스톤', 'PMO', 3,   5,  '{"inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.2',    'MIG',    '매핑 설계',                    '단계',     'PMO', 15,  6,  '{}'::jsonb),
  ('migration-data', 'MIG.2.1',  'MIG.2',  '소스-타깃 컬럼 매핑 설계',    '작업',     'PMO', 7,   7,  '{}'::jsonb),
  ('migration-data', 'MIG.2.2',  'MIG.2',  '데이터 매핑 정의서',           '산출물',   'PMO', 5,   8,  '{"deliverable_type": "설계서", "inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.2.M1', 'MIG.2',  '매핑 설계 검토 승인',          '마일스톤', 'PMO', 3,   9,  '{"inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.3',    'MIG',    '정제 및 변환',                 '단계',     'PMO', 25,  10, '{}'::jsonb),
  ('migration-data', 'MIG.3.1',  'MIG.3',  '데이터 클렌징 규칙 적용',     '작업',     'PMO', 10,  11, '{}'::jsonb),
  ('migration-data', 'MIG.3.2',  'MIG.3',  '변환 로직 개발 및 검증',       '작업',     'PMO', 10,  12, '{}'::jsonb),
  ('migration-data', 'MIG.3.3',  'MIG.3',  '데이터 정제 결과 보고서',      '산출물',   'PMO', 5,   13, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.4',    'MIG',    '리허설',                       '단계',     'PMO', 20,  14, '{}'::jsonb),
  ('migration-data', 'MIG.4.1',  'MIG.4',  '리허설 이관 수행',             '작업',     'PMO', 8,   15, '{}'::jsonb),
  ('migration-data', 'MIG.4.2',  'MIG.4',  '리허설 검증 및 결과서',        '산출물',   'PMO', 7,   16, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.4.M1', 'MIG.4',  '리허설 완료 승인',             '마일스톤', 'PMO', 5,   17, '{"inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.5',    'MIG',    '본이관',                       '단계',     'PMO', 15,  18, '{}'::jsonb),
  ('migration-data', 'MIG.5.1',  'MIG.5',  '본이관 수행',                  '작업',     'PMO', 8,   19, '{}'::jsonb),
  ('migration-data', 'MIG.5.2',  'MIG.5',  '이관 완료 보고서',             '산출물',   'PMO', 4,   20, '{"deliverable_type": "이관 산출물", "inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.5.M1', 'MIG.5',  '본이관 완료 승인',             '마일스톤', 'PMO', 3,   21, '{"inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.6',    'MIG',    '검증',                         '단계',     'PMO', 10,  22, '{}'::jsonb),
  ('migration-data', 'MIG.6.1',  'MIG.6',  '이관 데이터 정합성 검증',      '작업',     'PMO', 5,   23, '{}'::jsonb),
  ('migration-data', 'MIG.6.2',  'MIG.6',  '최종 검증 결과서',             '산출물',   'PMO', 3,   24, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('migration-data', 'MIG.6.M1', 'MIG.6',  '프로젝트 종료 승인',           '마일스톤', 'PMO', 2,   25, '{"inspection_required": true}'::jsonb),

  -- 유지보수 운영 WBS 표준 항목
  ('maintenance',    'OPS',      NULL,     '유지보수 운영',               '프로젝트', 'PMO', 100, 1,  '{"progress_formula": "하위 단계 가중치 합산"}'::jsonb),
  ('maintenance',    'OPS.1',    'OPS',    '요청 접수',                   '단계',     'PMO', 10,  2,  '{}'::jsonb),
  ('maintenance',    'OPS.1.1',  'OPS.1',  '변경/장애 요청 접수 및 분류', '작업',     'PMO', 5,   3,  '{}'::jsonb),
  ('maintenance',    'OPS.1.2',  'OPS.1',  '요청 접수 결과 통보',         '산출물',   'PMO', 3,   4,  '{"deliverable_type": "계획서"}'::jsonb),
  ('maintenance',    'OPS.1.M1', 'OPS.1',  '요청 접수 확인',              '마일스톤', 'PMO', 2,   5,  '{}'::jsonb),
  ('maintenance',    'OPS.2',    'OPS',    '영향도 분석',                 '단계',     'PMO', 20,  6,  '{}'::jsonb),
  ('maintenance',    'OPS.2.1',  'OPS.2',  '변경 영향도 분석',            '작업',     'PMO', 10,  7,  '{}'::jsonb),
  ('maintenance',    'OPS.2.2',  'OPS.2',  '영향도 분석 보고서',          '산출물',   'PMO', 7,   8,  '{"deliverable_type": "설계서", "inspection_required": true}'::jsonb),
  ('maintenance',    'OPS.2.M1', 'OPS.2',  '영향도 분석 승인',            '마일스톤', 'PMO', 3,   9,  '{"inspection_required": true}'::jsonb),
  ('maintenance',    'OPS.3',    'OPS',    '조치',                        '단계',     'PMO', 30,  10, '{}'::jsonb),
  ('maintenance',    'OPS.3.1',  'OPS.3',  '소스 수정 및 단위 테스트',    '작업',     'PMO', 15,  11, '{}'::jsonb),
  ('maintenance',    'OPS.3.2',  'OPS.3',  '조치 내역서',                 '산출물',   'PMO', 10,  12, '{"deliverable_type": "소스코드", "inspection_required": true}'::jsonb),
  ('maintenance',    'OPS.3.M1', 'OPS.3',  '조치 완료 확인',              '마일스톤', 'PMO', 5,   13, '{}'::jsonb),
  ('maintenance',    'OPS.4',    'OPS',    '검증',                        '단계',     'PMO', 20,  14, '{}'::jsonb),
  ('maintenance',    'OPS.4.1',  'OPS.4',  '통합 테스트 수행',            '작업',     'PMO', 10,  15, '{}'::jsonb),
  ('maintenance',    'OPS.4.2',  'OPS.4',  '테스트 결과서',               '산출물',   'PMO', 7,   16, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('maintenance',    'OPS.4.M1', 'OPS.4',  '검증 완료 승인',              '마일스톤', 'PMO', 3,   17, '{"inspection_required": true}'::jsonb),
  ('maintenance',    'OPS.5',    'OPS',    '릴리스',                      '단계',     'PMO', 15,  18, '{}'::jsonb),
  ('maintenance',    'OPS.5.1',  'OPS.5',  '운영 배포 수행',              '작업',     'PMO', 8,   19, '{}'::jsonb),
  ('maintenance',    'OPS.5.2',  'OPS.5',  '배포 확인 체크리스트',        '산출물',   'PMO', 4,   20, '{"deliverable_type": "운영 문서", "inspection_required": true}'::jsonb),
  ('maintenance',    'OPS.5.M1', 'OPS.5',  '릴리스 완료 승인',            '마일스톤', 'PMO', 3,   21, '{"inspection_required": true}'::jsonb),
  ('maintenance',    'OPS.6',    'OPS',    '회고',                        '단계',     'PMO', 5,   22, '{}'::jsonb),
  ('maintenance',    'OPS.6.1',  'OPS.6',  '운영 이슈 회고 보고서',       '산출물',   'PMO', 3,   23, '{"deliverable_type": "운영 문서"}'::jsonb),
  ('maintenance',    'OPS.6.M1', 'OPS.6',  '회고 완료',                   '마일스톤', 'PMO', 2,   24, '{}'::jsonb)
ON CONFLICT (template_key, code) DO NOTHING;
