-- P3-10: tenant-scoped user affiliation groups
-- A user belongs to exactly one group inside its tenant. Existing users are
-- backfilled to the tenant default group.

CREATE TABLE IF NOT EXISTS wbs_user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wbs_user_groups_tenant_name
  ON wbs_user_groups(tenant_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_wbs_user_groups_tenant_status
  ON wbs_user_groups(tenant_id, status);

INSERT INTO wbs_user_groups (tenant_id, name, description, metadata)
SELECT t.id,
       '기본 그룹',
       '테넌트 기본 소속 그룹',
       jsonb_build_object('system', true)
FROM wbs_tenants t
WHERE NOT EXISTS (
  SELECT 1
  FROM wbs_user_groups g
  WHERE g.tenant_id = t.id
    AND lower(g.name) = lower('기본 그룹')
);

ALTER TABLE IF EXISTS wbs_users
  ADD COLUMN IF NOT EXISTS group_id uuid;

UPDATE wbs_users u
SET group_id = g.id
FROM wbs_user_groups g
WHERE g.tenant_id = u.tenant_id
  AND lower(g.name) = lower('기본 그룹')
  AND u.group_id IS NULL;

ALTER TABLE IF EXISTS wbs_users
  ALTER COLUMN group_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wbs_users_group_id_fkey'
  ) THEN
    ALTER TABLE wbs_users
      ADD CONSTRAINT wbs_users_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES wbs_user_groups(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wbs_users_tenant_group
  ON wbs_users(tenant_id, group_id, role);
