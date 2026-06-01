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
  template_key citext,
  template_name text,
  project_type text,
  description text,
  status text NOT NULL DEFAULT 'Queued',
  total_rows integer NOT NULL DEFAULT 0,
  accepted_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  preview_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS wbs_import_jobs
  ADD COLUMN IF NOT EXISTS template_key citext,
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preview_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

CREATE TABLE IF NOT EXISTS wbs_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key citext NOT NULL REFERENCES wbs_templates(key) ON DELETE CASCADE,
  code text NOT NULL,
  parent_code text,
  name text NOT NULL,
  item_type text NOT NULL DEFAULT '작업',
  owner text,
  weight numeric(8, 2),
  start_date date,
  finish_date date,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_key, code)
);

CREATE INDEX IF NOT EXISTS idx_wbs_projects_status ON wbs_projects(status);
CREATE INDEX IF NOT EXISTS idx_wbs_projects_template ON wbs_projects(template_key);
CREATE INDEX IF NOT EXISTS idx_wbs_import_jobs_status ON wbs_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_wbs_import_jobs_template ON wbs_import_jobs(template_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wbs_template_items_template ON wbs_template_items(template_key, sort_order);
CREATE INDEX IF NOT EXISTS idx_wbs_template_items_parent ON wbs_template_items(template_key, parent_code);

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

INSERT INTO wbs_template_items
  (template_key, code, parent_code, name, item_type, owner, weight, sort_order, metadata)
VALUES
  ('si-standard', 'SI', NULL, '회사 표준 SI 프로젝트', '프로젝트', 'PMO', 100, 1, '{"progress_formula": "하위 단계 가중치 합산"}'::jsonb),
  ('si-standard', 'SI.1', 'SI', '착수', '단계', 'PMO', 5, 2, '{}'::jsonb),
  ('si-standard', 'SI.1.1', 'SI.1', '프로젝트 수행계획서', '산출물', 'PMO', 3, 3, '{"deliverable_type": "계획서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.1.M1', 'SI.1', '착수 보고 승인', '마일스톤', 'PMO', 2, 4, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.2', 'SI', '분석', '단계', 'PMO', 15, 5, '{}'::jsonb),
  ('si-standard', 'SI.2.1', 'SI.2', '현행 업무 및 시스템 분석', '작업', 'PMO', 4, 6, '{}'::jsonb),
  ('si-standard', 'SI.2.2', 'SI.2', '요구사항 정의서', '산출물', 'PMO', 7, 7, '{"deliverable_type": "요구사항", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.2.M1', 'SI.2', '요구사항 검토 승인', '마일스톤', 'PMO', 4, 8, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.3', 'SI', '설계', '단계', 'PMO', 20, 9, '{}'::jsonb),
  ('si-standard', 'SI.3.1', 'SI.3', '아키텍처 설계서', '산출물', 'PMO', 5, 10, '{"deliverable_type": "설계서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.3.2', 'SI.3', '화면 및 기능 설계서', '산출물', 'PMO', 6, 11, '{"deliverable_type": "설계서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.3.3', 'SI.3', '인터페이스 및 데이터 설계서', '산출물', 'PMO', 5, 12, '{"deliverable_type": "설계서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.3.M1', 'SI.3', '설계 검토 승인', '마일스톤', 'PMO', 4, 13, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.4', 'SI', '개발', '단계', 'PMO', 25, 14, '{}'::jsonb),
  ('si-standard', 'SI.4.1', 'SI.4', '개발 환경 구성', '작업', 'PMO', 3, 15, '{}'::jsonb),
  ('si-standard', 'SI.4.2', 'SI.4', '기능 개발', '작업', 'PMO', 12, 16, '{}'::jsonb),
  ('si-standard', 'SI.4.3', 'SI.4', '인터페이스 개발', '작업', 'PMO', 5, 17, '{}'::jsonb),
  ('si-standard', 'SI.4.4', 'SI.4', '단위 테스트 결과서', '산출물', 'PMO', 5, 18, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.5', 'SI', '테스트', '단계', 'PMO', 20, 19, '{}'::jsonb),
  ('si-standard', 'SI.5.1', 'SI.5', '통합 테스트 시나리오', '산출물', 'PMO', 4, 20, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.5.2', 'SI.5', '통합 테스트 수행', '작업', 'PMO', 5, 21, '{}'::jsonb),
  ('si-standard', 'SI.5.3', 'SI.5', '사용자 인수 테스트', '작업', 'PMO', 6, 22, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.5.4', 'SI.5', '결함 조치 결과서', '산출물', 'PMO', 5, 23, '{"deliverable_type": "테스트 결과서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.6', 'SI', '전환', '단계', 'PMO', 10, 24, '{}'::jsonb),
  ('si-standard', 'SI.6.1', 'SI.6', '데이터 이관 계획 및 검증', '산출물', 'PMO', 4, 25, '{"deliverable_type": "이관 산출물", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.6.2', 'SI.6', '운영 전환 계획서', '산출물', 'PMO', 3, 26, '{"deliverable_type": "운영 문서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.6.M1', 'SI.6', '전환 리허설 및 본전환', '마일스톤', 'PMO', 3, 27, '{"inspection_required": true}'::jsonb),
  ('si-standard', 'SI.7', 'SI', '안정화', '단계', 'PMO', 5, 28, '{}'::jsonb),
  ('si-standard', 'SI.7.1', 'SI.7', '안정화 지원', '작업', 'PMO', 2, 29, '{}'::jsonb),
  ('si-standard', 'SI.7.2', 'SI.7', '운영 인수인계', '산출물', 'PMO', 2, 30, '{"deliverable_type": "운영 문서", "inspection_required": true}'::jsonb),
  ('si-standard', 'SI.7.M1', 'SI.7', '종료 보고 승인', '마일스톤', 'PMO', 1, 31, '{"inspection_required": true}'::jsonb)
ON CONFLICT (template_key, code) DO NOTHING;
