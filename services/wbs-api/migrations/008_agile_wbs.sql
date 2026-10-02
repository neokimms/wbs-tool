ALTER TABLE IF EXISTS wbs_projects
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'waterfall';

UPDATE wbs_projects
SET delivery_mode = 'waterfall'
WHERE delivery_mode IS NULL
   OR delivery_mode NOT IN ('waterfall', 'agile', 'hybrid');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wbs_projects_delivery_mode_check'
  ) THEN
    ALTER TABLE wbs_projects
      ADD CONSTRAINT wbs_projects_delivery_mode_check
      CHECK (delivery_mode IN ('waterfall', 'agile', 'hybrid'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wbs_agile_sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  tenant_id text NOT NULL DEFAULT 'default',
  name text NOT NULL,
  goal text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Planning',
  start_date date NOT NULL DEFAULT current_date,
  end_date date NOT NULL DEFAULT (current_date + 13),
  capacity_points numeric(8, 2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name),
  CONSTRAINT wbs_agile_sprints_status_check
    CHECK (status IN ('Planning', 'Active', 'Review', 'Retrospective', 'Closed')),
  CONSTRAINT wbs_agile_sprints_date_check
    CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS wbs_agile_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES wbs_projects(id) ON DELETE CASCADE,
  tenant_id text NOT NULL DEFAULT 'default',
  sprint_id uuid REFERENCES wbs_agile_sprints(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES wbs_agile_items(id) ON DELETE SET NULL,
  wbs_code text,
  item_type text NOT NULL DEFAULT 'Story',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  story_points numeric(8, 2) NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'Should',
  status text NOT NULL DEFAULT 'Backlog',
  assignee text,
  reviewer text,
  acceptance_criteria text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wbs_agile_items_type_check
    CHECK (item_type IN ('Epic', 'Story', 'Task', 'Spike', 'Bug')),
  CONSTRAINT wbs_agile_items_priority_check
    CHECK (priority IN ('Must', 'Should', 'Could', 'Wont')),
  CONSTRAINT wbs_agile_items_status_check
    CHECK (status IN ('Backlog', 'Ready', 'In Progress', 'Review', 'Done'))
);

CREATE INDEX IF NOT EXISTS idx_wbs_projects_delivery_mode
  ON wbs_projects(delivery_mode);

CREATE INDEX IF NOT EXISTS idx_wbs_agile_sprints_tenant_project
  ON wbs_agile_sprints(tenant_id, project_id, status, start_date);

CREATE INDEX IF NOT EXISTS idx_wbs_agile_items_tenant_project
  ON wbs_agile_items(tenant_id, project_id, status, sort_order);

CREATE INDEX IF NOT EXISTS idx_wbs_agile_items_sprint
  ON wbs_agile_items(tenant_id, sprint_id, status);

CREATE INDEX IF NOT EXISTS idx_wbs_agile_items_wbs_link
  ON wbs_agile_items(tenant_id, project_id, wbs_code);
