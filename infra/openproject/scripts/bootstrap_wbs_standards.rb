# frozen_string_literal: true

require "json"

type_specs = [
  { name: "프로그램", milestone: false, description: "회사 표준 WBS 최상위 프로그램 단위" },
  { name: "프로젝트", milestone: false, description: "계약 또는 수행 조직 기준의 프로젝트 단위" },
  { name: "단계", milestone: false, description: "분석, 설계, 개발, 테스트 등 수행 단계" },
  { name: "산출물", milestone: false, description: "검토와 승인이 필요한 산출물 단위" },
  { name: "작업", milestone: false, description: "담당자에게 배정되는 실행 작업" },
  { name: "마일스톤", milestone: true, description: "일정 기준점 또는 주요 의사결정 지점" },
  { name: "리스크", milestone: false, description: "일정, 범위, 품질, 비용 리스크" },
  { name: "이슈", milestone: false, description: "프로젝트 수행 중 해결이 필요한 이슈" },
  { name: "변경요청", milestone: false, description: "범위, 일정, 비용 변경 요청" }
]

status_specs = [
  { name: "작성중", closed: false, done: 0 },
  { name: "검토중", closed: false, done: 20 },
  { name: "승인", closed: false, done: 40 },
  { name: "수행중", closed: false, done: 60 },
  { name: "검수중", closed: false, done: 90 },
  { name: "완료", closed: true, done: 100 }
]

field_specs = [
  {
    name: "WBS 코드",
    format: "string",
    required: true,
    searchable: true,
    filter: true,
    max_length: 40
  },
  {
    name: "산출물 유형",
    format: "list",
    filter: true,
    options: ["계획서", "요구사항", "설계서", "소스코드", "테스트 결과서", "이관 산출물", "운영 문서", "기타"]
  },
  {
    name: "검토자",
    format: "user",
    filter: true
  },
  {
    name: "승인자",
    format: "user",
    filter: true
  },
  {
    name: "계약 단계",
    format: "list",
    filter: true,
    options: ["제안", "착수", "수행", "검수", "운영", "종료"]
  },
  {
    name: "검수 여부",
    format: "bool",
    filter: true
  },
  {
    name: "가중치",
    format: "float",
    filter: true
  },
  {
    name: "진척 산식",
    format: "text",
    filter: false
  }
]

def next_position(model)
  model.maximum(:position).to_i + 1
end

result = ActiveRecord::Base.transaction do
  type_position = next_position(Type)
  types = type_specs.map do |spec|
    type = Type.find_or_initialize_by(name: spec[:name])
    type.position ||= type_position
    type_position += 1 if type.new_record?
    type.is_in_roadmap = true
    type.is_milestone = spec[:milestone]
    type.is_default = false
    type.is_standard = true if type.respond_to?(:is_standard=)
    type.description = spec[:description] if type.respond_to?(:description=)
    type.save!
    type
  end

  status_position = next_position(Status)
  statuses = status_specs.map do |spec|
    status = Status.find_or_initialize_by(name: spec[:name])
    status.position ||= status_position
    status_position += 1 if status.new_record?
    status.is_closed = spec[:closed]
    status.default_done_ratio = spec[:done]
    status.save!
    status
  end

  fields = field_specs.map do |spec|
    field = WorkPackageCustomField.find_or_initialize_by(name: spec[:name])
    if field.new_record?
      field.field_format = spec[:format]
    elsif field.field_format != spec[:format]
      raise "#{field.name} already exists with field_format=#{field.field_format}, expected #{spec[:format]}"
    end
    field.is_required = spec.fetch(:required, false)
    field.is_for_all = true
    field.is_filter = spec.fetch(:filter, true)
    field.searchable = spec.fetch(:searchable, false)
    field.editable = true
    field.max_length = spec.fetch(:max_length, 0)
    field.save!

    Array(spec[:options]).each_with_index do |value, index|
      option = field.custom_options.find_or_initialize_by(value: value)
      option.position = index + 1
      option.save!
    end

    field.types = (field.types.to_a | types)
    field
  end

  Project.find_each do |project|
    project.types = (project.types.to_a | types)
    project.save!
  end

  workflow_role_names = ["멤버", "프로젝트 관리자", "작업 패키지 편집자", "스태프 및 프로젝트 관리자"]
  workflow_roles = Role.where(name: workflow_role_names).to_a.uniq(&:id).sort_by(&:id)
  observer_workflows_removed = Workflow
    .joins(:role)
    .where(roles: { name: "참관자" })
    .where(type_id: types.map(&:id), old_status_id: statuses.map(&:id), new_status_id: statuses.map(&:id))
    .delete_all

  workflow_count = 0
  workflow_roles.each do |role|
    types.each do |type|
      statuses.each do |old_status|
        statuses.each do |new_status|
          workflow = Workflow.find_or_create_by!(
            role_id: role.id,
            type_id: type.id,
            old_status_id: old_status.id,
            new_status_id: new_status.id,
            assignee: false,
            author: false
          )
          workflow_count += 1 if workflow.previously_new_record?
        end
      end
    end
  end

  {
    types: types.map(&:name),
    statuses: statuses.map(&:name),
    custom_fields: fields.map(&:name),
    projects_updated: Project.count,
    workflow_roles: workflow_roles.map(&:name),
    workflows_created: workflow_count,
    observer_workflows_removed: observer_workflows_removed
  }
end

puts JSON.pretty_generate(result)
