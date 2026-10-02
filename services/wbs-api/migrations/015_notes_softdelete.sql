-- 015_notes_softdelete.sql
-- 노트 소프트 딜리트 + 이력 관리

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID;

-- 일반 조회 성능 (삭제되지 않은 노트만 빠르게)
CREATE INDEX IF NOT EXISTS idx_notes_active
  ON notes(tenant_id, folder_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- 복구·관리자 조회용
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at)
  WHERE deleted_at IS NOT NULL;
