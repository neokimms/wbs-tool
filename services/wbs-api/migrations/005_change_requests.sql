-- P3-02: 변경 관리 고도화 — wbs_change_requests 테이블 확장
-- 기존 JSONB 기반 CR이 있다면 이 테이블로 분리

CREATE TABLE IF NOT EXISTS wbs_change_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  version         text NOT NULL DEFAULT 'CR-001',   -- CR-001, CR-002 ...
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  impact_scope    text NOT NULL DEFAULT '',          -- 일정/비용/품질/인력 (복수 가능)
  impact_schedule_days integer,                      -- 일정 영향 (일)
  impact_cost     numeric(18,2),                     -- 비용 영향
  priority        text NOT NULL DEFAULT '보통',      -- 높음/보통/낮음
  status          text NOT NULL DEFAULT 'Open',      -- Open/Approved/Rejected/Withdrawn
  wbs_code        text,
  requested_by    text NOT NULL DEFAULT '',
  resolution      text NOT NULL DEFAULT '',
  approved_at     timestamptz,
  rejected_at     timestamptz,
  tenant_id       text NOT NULL DEFAULT 'default',
  created_by      uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbs_cr_project ON wbs_change_requests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_wbs_cr_tenant  ON wbs_change_requests(tenant_id, status);

-- P3-04: 번다운 스냅샷 테이블
CREATE TABLE IF NOT EXISTS wbs_progress_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  total_weight  numeric(18,4) NOT NULL DEFAULT 0,
  earned_weight numeric(18,4) NOT NULL DEFAULT 0,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_wbs_snapshot_project ON wbs_progress_snapshots(project_id, snapshot_date);
