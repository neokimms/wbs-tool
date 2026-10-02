-- P3-09: WBS tenant recovery
-- Existing project/template rows already received tenant_id in 004_multitenancy.
-- This migration makes each WBS row tenant-visible and backfills it from its owner.

ALTER TABLE IF EXISTS wbs_project_wbs_items
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

UPDATE wbs_project_wbs_items i
SET tenant_id = p.tenant_id
FROM wbs_projects p
WHERE i.project_id = p.id
  AND i.tenant_id IS DISTINCT FROM p.tenant_id;

CREATE INDEX IF NOT EXISTS idx_wbs_project_items_tenant
  ON wbs_project_wbs_items(tenant_id, project_id, sort_order);

ALTER TABLE IF EXISTS wbs_template_items
  ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';

UPDATE wbs_template_items i
SET tenant_id = t.tenant_id
FROM wbs_templates t
WHERE i.template_key = t.key
  AND i.tenant_id IS DISTINCT FROM t.tenant_id;

CREATE INDEX IF NOT EXISTS idx_wbs_template_items_tenant
  ON wbs_template_items(tenant_id, template_key, sort_order);
