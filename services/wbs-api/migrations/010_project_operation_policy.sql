CREATE TABLE IF NOT EXISTS wbs_project_operation_policies (
  tenant_id text PRIMARY KEY REFERENCES wbs_tenants(id) ON DELETE CASCADE,
  default_delivery_mode text NOT NULL DEFAULT 'waterfall',
  story_point_mode text NOT NULL DEFAULT 'numeric',
  fibonacci_points jsonb NOT NULL DEFAULT '[1,2,3,5,8,13]'::jsonb,
  sprint_length_policy text NOT NULL DEFAULT 'custom',
  dod_management text NOT NULL DEFAULT 'team',
  default_dod_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  openproject_sprint_version_sync boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wbs_project_operation_policies_delivery_mode_check
    CHECK (default_delivery_mode IN ('waterfall', 'agile', 'hybrid')),
  CONSTRAINT wbs_project_operation_policies_story_point_check
    CHECK (story_point_mode IN ('numeric', 'fibonacci')),
  CONSTRAINT wbs_project_operation_policies_sprint_length_check
    CHECK (sprint_length_policy IN ('custom', 'fixed_1w', 'fixed_2w', 'fixed_4w')),
  CONSTRAINT wbs_project_operation_policies_dod_check
    CHECK (dod_management IN ('organization', 'team'))
);

INSERT INTO wbs_project_operation_policies (tenant_id)
SELECT id
FROM wbs_tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_wbs_project_operation_policies_updated
  ON wbs_project_operation_policies(updated_at DESC);
