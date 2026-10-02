-- 018_note_folders_dedupe.sql
-- 014 의 기본 노트 폴더 INSERT 가 고유 제약 없이 'ON CONFLICT DO NOTHING' 이라
-- API 기동(마이그레이션 재실행)마다 기본 폴더가 중복 생성되던 문제 수정.
--  1) 중복 기본 폴더의 노트·하위 폴더를 가장 오래된 폴더로 옮긴 뒤 중복 삭제
--  2) 최상위 기본 폴더에 부분 고유 인덱스를 추가해 재발 방지 (014 의 ON CONFLICT 가 이제 동작)

WITH ranked AS (
  SELECT id,
         first_value(id) OVER w AS keep_id,
         row_number()    OVER w AS rn
  FROM note_folders
  WHERE parent_id IS NULL AND project_id IS NULL
    AND name IN ('주간 보고', '월간 보고', '회의록', '기타')
  WINDOW w AS (PARTITION BY tenant_id, name ORDER BY created_at, id)
)
UPDATE notes n SET folder_id = r.keep_id
FROM ranked r WHERE n.folder_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER w AS keep_id,
         row_number()    OVER w AS rn
  FROM note_folders
  WHERE parent_id IS NULL AND project_id IS NULL
    AND name IN ('주간 보고', '월간 보고', '회의록', '기타')
  WINDOW w AS (PARTITION BY tenant_id, name ORDER BY created_at, id)
)
UPDATE note_folders f SET parent_id = r.keep_id
FROM ranked r WHERE f.parent_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY tenant_id, name ORDER BY created_at, id) AS rn
  FROM note_folders
  WHERE parent_id IS NULL AND project_id IS NULL
    AND name IN ('주간 보고', '월간 보고', '회의록', '기타')
)
DELETE FROM note_folders f USING ranked r WHERE f.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_note_folders_default_root
  ON note_folders (tenant_id, name)
  WHERE parent_id IS NULL AND project_id IS NULL
    AND name IN ('주간 보고', '월간 보고', '회의록', '기타');
