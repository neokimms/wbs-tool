-- P2-04: 인앱 알림 테이블
CREATE TABLE IF NOT EXISTS wbs_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES wbs_users(id) ON DELETE CASCADE,
  event_type text NOT NULL,          -- approval.requested / approval.approved / risk.created 등
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  entity_type text,
  entity_id text,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbs_notifications_user    ON wbs_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_notifications_created ON wbs_notifications(created_at DESC);
