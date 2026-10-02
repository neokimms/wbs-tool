-- P2-05: 멀티 테넌시 — tenant_id 컬럼 + wbs_tenants 테이블
-- MULTITENANCY_ENABLED=false(기본)이면 API에서 tenant_id를 'default'로 고정하므로
-- 기존 단일 테넌트 운영에 영향 없음.

CREATE TABLE IF NOT EXISTS wbs_tenants (
  id text PRIMARY KEY,                  -- 예: 'default', 'customer-a'
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Active', -- Active / Suspended
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO wbs_tenants (id, name) VALUES ('default', 'Default Tenant')
ON CONFLICT (id) DO NOTHING;

-- 핵심 테이블에 tenant_id 추가 (기존 행 → 'default')
ALTER TABLE IF EXISTS wbs_projects
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE IF EXISTS wbs_templates
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE IF EXISTS wbs_users
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE IF EXISTS wbs_approval_requests
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE IF EXISTS wbs_audit_events
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE IF EXISTS wbs_risks
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE IF EXISTS wbs_issues
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

ALTER TABLE IF EXISTS wbs_notifications
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_wbs_projects_tenant    ON wbs_projects(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wbs_users_tenant       ON wbs_users(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_wbs_risks_tenant       ON wbs_risks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wbs_issues_tenant      ON wbs_issues(tenant_id, status);
