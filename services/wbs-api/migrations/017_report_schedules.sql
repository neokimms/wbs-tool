-- 017_report_schedules.sql
-- 정기 보고 스케줄/실행 이력 테이블
-- 개발 DB에는 존재했으나 로컬 마이그레이션에 누락되어 신규 설치 시 /api/report-schedules 가 500을 반환하던 문제 수정.
-- (origin/main 의 001_init.sql 정의와 동일, 멱등)

CREATE TABLE IF NOT EXISTS wbs_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key citext UNIQUE NOT NULL,
  name text NOT NULL,
  report_type text NOT NULL DEFAULT 'weekly_project_status',
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Seoul',
  day_of_week integer NOT NULL DEFAULT 0 CHECK (day_of_week BETWEEN 0 AND 6),
  hour integer NOT NULL DEFAULT 9 CHECK (hour BETWEEN 0 AND 23),
  minute integer NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_subject text NOT NULL DEFAULT '[WBS] 주간 프로젝트 보고서',
  email_body text NOT NULL DEFAULT '주간 WBS 프로젝트 현황 보고서를 첨부합니다.',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES wbs_report_schedules(id) ON DELETE SET NULL,
  schedule_key citext NOT NULL,
  report_type text NOT NULL DEFAULT 'weekly_project_status',
  status text NOT NULL DEFAULT 'Generated',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  artifact_path text,
  delivery_status text NOT NULL DEFAULT 'skipped',
  delivery_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by text NOT NULL DEFAULT 'scheduler',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);


CREATE INDEX IF NOT EXISTS idx_wbs_report_schedules_enabled ON wbs_report_schedules(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_wbs_report_runs_schedule ON wbs_report_runs(schedule_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_report_runs_status ON wbs_report_runs(status, started_at DESC);

INSERT INTO wbs_report_schedules
  (key, name, report_type, enabled, timezone, day_of_week, hour, minute, recipients, email_subject, email_body, metadata)
VALUES
  (
    'weekly-pmo',
    'PMO 주간 보고서',
    'weekly_project_status',
    false,
    'Asia/Seoul',
    0,
    9,
    0,
    '[]'::jsonb,
    '[WBS] 주간 프로젝트 보고서',
    '주간 WBS 프로젝트 현황 보고서를 첨부합니다.',
    '{"default_schedule": true, "ui_surface": "notifications"}'::jsonb
  ),
  (
    'risk-escalation',
    '리스크 에스컬레이션',
    'risk_escalation',
    false,
    'Asia/Seoul',
    0,
    8,
    0,
    '[]'::jsonb,
    '[WBS] 고위험 리스크 에스컬레이션',
    '미처리 고위험 리스크 목록을 공유합니다.',
    '{"default_schedule": true, "ui_surface": "notifications", "frequency": "daily"}'::jsonb
  ),
  (
    'approval-reminder',
    '승인 대기 리마인더',
    'approval_reminder',
    false,
    'Asia/Seoul',
    0,
    17,
    0,
    '[]'::jsonb,
    '[WBS] 승인 대기 리마인더',
    '승인 대기 중인 WBS 항목을 확인해 주세요.',
    '{"default_schedule": true, "ui_surface": "notifications", "frequency": "daily"}'::jsonb
  )
ON CONFLICT (key) DO NOTHING;
