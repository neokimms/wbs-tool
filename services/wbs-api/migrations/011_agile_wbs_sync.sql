-- 011_agile_wbs_sync.sql
-- WBS → Agile 자동 동기화를 위한 source 컬럼 추가
-- source = 'wbs'  : WBS에서 자동 동기화된 항목 (재동기화 시 업데이트)
-- source = 'manual': 백로그에서 직접 생성한 항목 (재동기화 시 보존)

ALTER TABLE wbs_agile_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

UPDATE wbs_agile_items
  SET source = 'wbs'
  WHERE wbs_code IS NOT NULL AND source = 'manual';

CREATE INDEX IF NOT EXISTS idx_wbs_agile_items_source
  ON wbs_agile_items(tenant_id, project_id, source);

CREATE INDEX IF NOT EXISTS idx_wbs_agile_items_wbs_code_project
  ON wbs_agile_items(project_id, wbs_code)
  WHERE wbs_code IS NOT NULL;
