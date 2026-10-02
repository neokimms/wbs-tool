-- 014_notes.sql
-- 노트/보고서 관리 기능

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS note_folders (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   TEXT NOT NULL DEFAULT 'default',
    project_id  UUID REFERENCES wbs_projects(id) ON DELETE SET NULL,
    parent_id   UUID REFERENCES note_folders(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    sort_order  INT DEFAULT 0,
    created_by  UUID,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     TEXT NOT NULL DEFAULT 'default',
    folder_id     UUID REFERENCES note_folders(id) ON DELETE SET NULL,
    title         VARCHAR(500) NOT NULL DEFAULT '제목 없음',
    content       TEXT DEFAULT '',
    content_type  VARCHAR(20) DEFAULT 'html',
    template_key  VARCHAR(50),
    report_date   DATE,
    created_by    UUID,
    updated_by    UUID,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_folders_tenant   ON note_folders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_note_folders_parent   ON note_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder          ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_tenant          ON notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notes_title           ON notes USING gin(to_tsvector('simple', title));

-- 기본 폴더 초기화
INSERT INTO note_folders (name, sort_order) VALUES
    ('주간 보고', 0),
    ('월간 보고', 1),
    ('회의록',   2),
    ('기타',     3)
ON CONFLICT DO NOTHING;
