-- 016_meetings_action_items.sql
-- 회의(Meeting)와 Action Item을 독립 데이터로 관리
--  · Action Item: 담당자·기한·상태 + WBS 작업(wbs_code)·이슈(issue_id) 연결
--  · '내 작업'(/api/me/action-items)·알림(wbs_notifications)과 연동
--  · 프로젝트 역할 세분화(PM/팀원/검토자/열람자)에 맞춰 project_role 값 확장 (스키마 변경 없음)

CREATE TABLE IF NOT EXISTS wbs_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  meeting_type text NOT NULL DEFAULT '정기',
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time text,
  location text,
  facilitator text,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  agenda text NOT NULL DEFAULT '',
  minutes text NOT NULL DEFAULT '',
  decisions text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Draft',          -- Draft | Final
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wbs_meetings_project
  ON wbs_meetings(project_id, meeting_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wbs_meetings_tenant
  ON wbs_meetings(tenant_id, meeting_date DESC);

CREATE TABLE IF NOT EXISTS wbs_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES wbs_meetings(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee text,
  assignee_user_id uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT '대기',            -- 대기 | 진행중 | 완료 | 보류 | 취소  (지연은 기한 기준 파생)
  priority text NOT NULL DEFAULT '보통',          -- 높음 | 보통 | 낮음
  wbs_code text,
  issue_id uuid REFERENCES wbs_issues(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',          -- meeting | manual
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbs_action_items_project
  ON wbs_action_items(project_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_wbs_action_items_meeting
  ON wbs_action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_wbs_action_items_assignee
  ON wbs_action_items(tenant_id, assignee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_wbs_action_items_wbs
  ON wbs_action_items(project_id, wbs_code) WHERE wbs_code IS NOT NULL;
