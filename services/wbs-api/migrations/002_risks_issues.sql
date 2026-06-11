-- P2-02: 리스크 · 이슈 트래킹 테이블
CREATE TABLE IF NOT EXISTS wbs_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT '보통',   -- 높음 / 보통 / 낮음
  likelihood text NOT NULL DEFAULT '보통', -- 높음 / 보통 / 낮음
  status text NOT NULL DEFAULT 'Open',     -- Open / Mitigated / Closed
  owner text NOT NULL DEFAULT 'PMO',
  mitigation text NOT NULL DEFAULT '',
  wbs_code text,                           -- 연결된 WBS 항목 코드 (선택)
  due_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT '보통',   -- 높음 / 보통 / 낮음
  status text NOT NULL DEFAULT 'Open',     -- Open / In Progress / Resolved / Closed
  assignee text NOT NULL DEFAULT 'PMO',
  wbs_code text,
  due_date date,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbs_risks_project    ON wbs_risks(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_risks_status     ON wbs_risks(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_issues_project   ON wbs_issues(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_issues_status    ON wbs_issues(status, priority, created_at DESC);
