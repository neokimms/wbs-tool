CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS wbs_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key citext UNIQUE NOT NULL,
  name text NOT NULL,
  project_type text NOT NULL,
  description text NOT NULL,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_key citext NOT NULL REFERENCES wbs_templates(key),
  owner text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  start_date date NOT NULL DEFAULT current_date,
  openproject_project_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wbs_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file text NOT NULL,
  status text NOT NULL DEFAULT 'Queued',
  total_rows integer NOT NULL DEFAULT 0,
  accepted_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbs_projects_status ON wbs_projects(status);
CREATE INDEX IF NOT EXISTS idx_wbs_projects_template ON wbs_projects(template_key);
CREATE INDEX IF NOT EXISTS idx_wbs_import_jobs_status ON wbs_import_jobs(status);

INSERT INTO wbs_templates (key, name, project_type, description, phases)
VALUES
  (
    'si-standard',
    'SI 구축 표준 WBS',
    'System Integration',
    '착수, 분석, 설계, 개발, 테스트, 전환, 안정화 중심의 SI 구축 템플릿',
    '[
      {"code": "1", "name": "착수", "weight": 5},
      {"code": "2", "name": "분석", "weight": 15},
      {"code": "3", "name": "설계", "weight": 20},
      {"code": "4", "name": "개발", "weight": 25},
      {"code": "5", "name": "테스트", "weight": 20},
      {"code": "6", "name": "전환", "weight": 10},
      {"code": "7", "name": "안정화", "weight": 5}
    ]'::jsonb
  ),
  (
    'migration-data',
    '데이터 이관 WBS',
    'Data Migration',
    '소스 분석, 매핑, 정제, 리허설, 본이관, 검증 중심의 데이터 이관 템플릿',
    '[
      {"code": "1", "name": "소스 분석", "weight": 15},
      {"code": "2", "name": "매핑 설계", "weight": 15},
      {"code": "3", "name": "정제 및 변환", "weight": 25},
      {"code": "4", "name": "리허설", "weight": 20},
      {"code": "5", "name": "본이관", "weight": 15},
      {"code": "6", "name": "검증", "weight": 10}
    ]'::jsonb
  ),
  (
    'maintenance',
    '유지보수 운영 WBS',
    'Maintenance',
    '접수, 영향도 분석, 조치, 검증, 릴리스, 회고 중심의 유지보수 템플릿',
    '[
      {"code": "1", "name": "요청 접수", "weight": 10},
      {"code": "2", "name": "영향도 분석", "weight": 20},
      {"code": "3", "name": "조치", "weight": 30},
      {"code": "4", "name": "검증", "weight": 20},
      {"code": "5", "name": "릴리스", "weight": 15},
      {"code": "6", "name": "회고", "weight": 5}
    ]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;
