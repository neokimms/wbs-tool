-- 012_project_members.sql
-- 프로젝트 단위 멤버십/역할 — 비멤버는 해당 프로젝트를 조회할 수 없음 (테넌트 격리 위에 추가되는 2단계 격리)
-- admin(전사 관리자)은 멤버십과 무관하게 테넌트 내 모든 프로젝트에 접근 가능

CREATE TABLE IF NOT EXISTS wbs_project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES wbs_users(id) ON DELETE CASCADE,
  project_role text NOT NULL,
  granted_by uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_project_members_project
  ON wbs_project_members(project_id);

CREATE INDEX IF NOT EXISTS idx_wbs_project_members_user
  ON wbs_project_members(tenant_id, user_id);

-- 배포 직후 가시성 변화가 없도록, 기존 사용자 전원을 자기 테넌트의 모든 기존 프로젝트에
-- 현재 글로벌 역할 그대로 멤버로 등록 (이후 admin이 점진적으로 멤버십을 좁혀 나감)
INSERT INTO wbs_project_members (tenant_id, project_id, user_id, project_role)
SELECT p.tenant_id, p.id, u.id, u.role
FROM wbs_projects p
JOIN wbs_users u ON u.tenant_id = p.tenant_id
ON CONFLICT (project_id, user_id) DO NOTHING;
