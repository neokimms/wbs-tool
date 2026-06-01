# frozen_string_literal: true

require "json"

TEMPLATE_IDENTIFIER = "company-standard-si-wbs-template"
TEMPLATE_NAME = "회사 표준 SI WBS 템플릿"

TYPE_NAMES = ["프로젝트", "단계", "산출물", "작업", "마일스톤"].freeze
STATUS_NAMES = ["작성중", "검토중", "승인", "수행중", "검수중", "완료"].freeze
FIELD_NAMES = {
  wbs_code: "WBS 코드",
  deliverable_type: "산출물 유형",
  reviewer: "검토자",
  approver: "승인자",
  contract_phase: "계약 단계",
  inspection_required: "검수 여부",
  weight: "가중치",
  progress_formula: "진척 산식"
}.freeze

TEMPLATE_TREE = {
  code: "SI",
  subject: "회사 표준 SI 프로젝트",
  type: "프로젝트",
  weight: 100,
  progress_formula: "하위 단계 가중치 합산",
  children: [
    {
      code: "SI.1",
      subject: "착수",
      type: "단계",
      weight: 5,
      children: [
        { code: "SI.1.1", subject: "프로젝트 수행계획서", type: "산출물", weight: 3, deliverable_type: "계획서", inspection_required: true },
        { code: "SI.1.M1", subject: "착수 보고 승인", type: "마일스톤", weight: 2, inspection_required: true }
      ]
    },
    {
      code: "SI.2",
      subject: "분석",
      type: "단계",
      weight: 15,
      children: [
        { code: "SI.2.1", subject: "현행 업무 및 시스템 분석", type: "작업", weight: 4 },
        { code: "SI.2.2", subject: "요구사항 정의서", type: "산출물", weight: 7, deliverable_type: "요구사항", inspection_required: true },
        { code: "SI.2.M1", subject: "요구사항 검토 승인", type: "마일스톤", weight: 4, inspection_required: true }
      ]
    },
    {
      code: "SI.3",
      subject: "설계",
      type: "단계",
      weight: 20,
      children: [
        { code: "SI.3.1", subject: "아키텍처 설계서", type: "산출물", weight: 5, deliverable_type: "설계서", inspection_required: true },
        { code: "SI.3.2", subject: "화면 및 기능 설계서", type: "산출물", weight: 6, deliverable_type: "설계서", inspection_required: true },
        { code: "SI.3.3", subject: "인터페이스 및 데이터 설계서", type: "산출물", weight: 5, deliverable_type: "설계서", inspection_required: true },
        { code: "SI.3.M1", subject: "설계 검토 승인", type: "마일스톤", weight: 4, inspection_required: true }
      ]
    },
    {
      code: "SI.4",
      subject: "개발",
      type: "단계",
      weight: 25,
      children: [
        { code: "SI.4.1", subject: "개발 환경 구성", type: "작업", weight: 3 },
        { code: "SI.4.2", subject: "기능 개발", type: "작업", weight: 12 },
        { code: "SI.4.3", subject: "인터페이스 개발", type: "작업", weight: 5 },
        { code: "SI.4.4", subject: "단위 테스트 결과서", type: "산출물", weight: 5, deliverable_type: "테스트 결과서", inspection_required: true }
      ]
    },
    {
      code: "SI.5",
      subject: "테스트",
      type: "단계",
      weight: 20,
      children: [
        { code: "SI.5.1", subject: "통합 테스트 시나리오", type: "산출물", weight: 4, deliverable_type: "테스트 결과서", inspection_required: true },
        { code: "SI.5.2", subject: "통합 테스트 수행", type: "작업", weight: 5 },
        { code: "SI.5.3", subject: "사용자 인수 테스트", type: "작업", weight: 6, inspection_required: true },
        { code: "SI.5.4", subject: "결함 조치 결과서", type: "산출물", weight: 5, deliverable_type: "테스트 결과서", inspection_required: true }
      ]
    },
    {
      code: "SI.6",
      subject: "전환",
      type: "단계",
      weight: 10,
      children: [
        { code: "SI.6.1", subject: "데이터 이관 계획 및 검증", type: "산출물", weight: 4, deliverable_type: "이관 산출물", inspection_required: true },
        { code: "SI.6.2", subject: "운영 전환 계획서", type: "산출물", weight: 3, deliverable_type: "운영 문서", inspection_required: true },
        { code: "SI.6.M1", subject: "전환 리허설 및 본전환", type: "마일스톤", weight: 3, inspection_required: true }
      ]
    },
    {
      code: "SI.7",
      subject: "안정화",
      type: "단계",
      weight: 5,
      children: [
        { code: "SI.7.1", subject: "안정화 지원", type: "작업", weight: 2 },
        { code: "SI.7.2", subject: "운영 인수인계", type: "산출물", weight: 2, deliverable_type: "운영 문서", inspection_required: true },
        { code: "SI.7.M1", subject: "종료 보고 승인", type: "마일스톤", weight: 1, inspection_required: true }
      ]
    }
  ]
}.freeze

def required_by_name(model, name)
  model.find_by(name: name) || raise("#{model.name} '#{name}' is missing. Run scripts/bootstrap-openproject-wbs.sh first.")
end

def list_option_id(field, value)
  return nil if value.nil?

  option = field.custom_options.find_by(value: value)
  option&.id&.to_s || raise("Custom option '#{value}' is missing for '#{field.name}'.")
end

result = ActiveRecord::Base.transaction do
  admin = User.find_by(login: "admin") || User.admin.first || raise("Admin user is missing.")
  types = TYPE_NAMES.to_h { |name| [name, required_by_name(Type, name)] }
  statuses = STATUS_NAMES.to_h { |name| [name, required_by_name(Status, name)] }
  fields = FIELD_NAMES.to_h { |key, name| [key, required_by_name(WorkPackageCustomField, name)] }
  priority = IssuePriority.find_by(name: "보통") || IssuePriority.first || raise("Issue priority is missing.")

  project = Project.find_or_initialize_by(identifier: TEMPLATE_IDENTIFIER)
  project.name = TEMPLATE_NAME
  project.active = true
  project.public = false
  project.workspace_type = "project"
  project.templated = true
  project.save!
  project.types = (project.types.to_a | types.values)
  project.save!

  counts = { created: 0, updated: 0, unchanged: 0 }

  upsert_work_package = lambda do |spec, parent|
    existing_by_code = WorkPackage
      .joins(:custom_values)
      .where(project_id: project.id)
      .where(custom_values: { custom_field_id: fields[:wbs_code].id, value: spec.fetch(:code) })
      .first

    work_package = existing_by_code || WorkPackage.where(project_id: project.id, subject: spec.fetch(:subject)).first_or_initialize
    was_new = work_package.new_record?

    desired_custom_values = {
      fields[:wbs_code].id => spec.fetch(:code),
      fields[:deliverable_type].id => list_option_id(fields[:deliverable_type], spec[:deliverable_type]),
      fields[:reviewer].id => admin.id.to_s,
      fields[:approver].id => admin.id.to_s,
      fields[:contract_phase].id => list_option_id(fields[:contract_phase], spec.fetch(:contract_phase, "수행")),
      fields[:inspection_required].id => spec.fetch(:inspection_required, false) ? "t" : "f",
      fields[:weight].id => spec.fetch(:weight).to_s,
      fields[:progress_formula].id => spec.fetch(:progress_formula, "작업 완료율 x 가중치")
    }
    current_custom_values = work_package
      .custom_values
      .where(custom_field_id: desired_custom_values.keys)
      .pluck(:custom_field_id, :value)
      .to_h
    custom_values_changed = desired_custom_values.any? do |field_id, value|
      current_custom_values[field_id].to_s != value.to_s
    end

    work_package.project = project
    work_package.subject = spec.fetch(:subject)
    work_package.type = types.fetch(spec.fetch(:type))
    work_package.status = statuses.fetch(spec.fetch(:status, "작성중"))
    work_package.priority = priority
    work_package.author ||= admin
    work_package.responsible = admin if work_package.respond_to?(:responsible=)
    work_package.parent = parent

    if was_new || work_package.changed? || custom_values_changed
      work_package.custom_field_values = desired_custom_values
      work_package.save!
      counts[was_new ? :created : :updated] += 1
    else
      counts[:unchanged] += 1
    end

    work_package
  end

  root = upsert_work_package.call(TEMPLATE_TREE, nil)
  phases = []

  TEMPLATE_TREE.fetch(:children).each do |phase|
    phase_work_package = upsert_work_package.call(phase, root)
    phases << phase_work_package
    phase.fetch(:children).each do |child|
      upsert_work_package.call(child, phase_work_package)
    end
  end

  {
    project: {
      id: project.id,
      name: project.name,
      identifier: project.identifier,
      templated: project.templated,
      workspace_type: project.workspace_type
    },
    phases: phases.map(&:subject),
    work_packages: WorkPackage.where(project_id: project.id).count,
    created: counts[:created],
    updated: counts[:updated],
    unchanged: counts[:unchanged],
    url: "http://localhost:8080/projects/#{project.identifier}"
  }
end

puts JSON.pretty_generate(result)
