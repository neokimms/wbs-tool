-- 013_announcements.sql
-- 공지사항(게시판형) — SMTP 메일과 무관하게 인앱 알림으로 참여자에게 전달
-- project_id가 NULL이면 전사(테넌트 전체) 공지, 값이 있으면 해당 프로젝트 멤버 대상 공지

CREATE TABLE IF NOT EXISTS wbs_announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL DEFAULT 'default',
  project_id  uuid REFERENCES wbs_projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  pinned      boolean NOT NULL DEFAULT false,
  author_id   uuid REFERENCES wbs_users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbs_announcements_tenant
  ON wbs_announcements(tenant_id, pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wbs_announcements_project
  ON wbs_announcements(project_id);
