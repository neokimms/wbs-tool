"""API 요청/응답 Pydantic 모델.
"""
from datetime import date, timezone
from typing import Any
from uuid import UUID
from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    template_key: str = Field(..., min_length=2, max_length=80)
    owner: str = Field("PMO", min_length=2, max_length=80)
    start_date: date | None = None
    delivery_mode: str = Field("waterfall", pattern="^(waterfall|agile|hybrid)$")
    # 선택 상세 필드 (metadata에 저장)
    end_date: date | None = None
    description: str | None = Field(None, max_length=500)
    client_name: str | None = Field(None, max_length=120)
    budget: str | None = Field(None, max_length=80)
    project_manager: str | None = Field(None, max_length=80)


class WbsImportRow(BaseModel):
    level: int | None = Field(None, ge=1, le=20)
    code: str | None = Field(None, min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=160)
    parent_code: str | None = Field(None, max_length=40)
    item_type: str = Field("작업", min_length=1, max_length=40)
    owner: str | None = Field(None, max_length=80)
    weight: float | None = Field(None, ge=0, le=100)
    start_date: date | None = None
    finish_date: date | None = None
    deliverable_type: str | None = Field(None, max_length=80)
    inspection_required: bool = False
    progress_formula: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=500)
    metadata: dict[str, Any] = Field(default_factory=dict)


class WbsImportValidation(BaseModel):
    source_file: str = Field("wbs-upload.xlsx", min_length=1, max_length=160)
    rows: list[WbsImportRow]


class ApprovalCreate(BaseModel):
    project_id: UUID
    title: str | None = Field(None, max_length=160)
    request_type: str = Field("WBS Baseline", min_length=1, max_length=80)
    requester: str = Field("PMO", min_length=1, max_length=80)
    reviewer: str | None = Field("PMO Lead", max_length=80)
    due_date: date | None = None
    auto_approve_internal: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class ApprovalDecision(BaseModel):
    reviewer: str = Field("PMO Lead", min_length=1, max_length=80)
    comment: str | None = Field(None, max_length=500)


class ProjectSyncRequest(BaseModel):
    dry_run: bool = True
    create_work_packages: bool = True
    force_project_create: bool = False
    validate_payloads: bool = True
    actor: str = Field("PMO", min_length=1, max_length=80)


class ProjectStatusUpdate(BaseModel):
    status: str = Field(..., min_length=4, max_length=20)
    comment: str | None = Field(None, max_length=500)


class ProjectDeliveryModeUpdate(BaseModel):
    delivery_mode: str = Field(..., pattern="^(waterfall|agile|hybrid)$")
    comment: str | None = Field(None, max_length=500)


class ProjectMemberCreate(BaseModel):
    user_id: UUID
    project_role: str = Field(..., min_length=2, max_length=20)


class ProjectMemberUpdate(BaseModel):
    project_role: str = Field(..., min_length=2, max_length=20)


class WbsItemsBatch(BaseModel):
    rows: list[WbsImportRow]
    source: str = Field("portal-editor", max_length=80)


class WorkPackageDateUpdate(BaseModel):
    start_date: date | None = None
    finish_date: date | None = None


class WorkItemUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=160)
    owner: str | None = Field(None, max_length=80)
    status: str | None = Field(None, pattern="^(대기|진행중|완료|지연|보류)$")
    progress: int | None = Field(None, ge=0, le=100)
    priority: str | None = Field(None, pattern="^(높음|보통|낮음)$")
    start_date: date | None = None
    finish_date: date | None = None
    reviewer: str | None = Field(None, max_length=80)
    approver: str | None = Field(None, max_length=80)
    team: str | None = Field(None, max_length=80)
    effort: float | None = Field(None, ge=0, le=10000)
    comment: str | None = Field(None, max_length=1000)
    attachment_name: str | None = Field(None, max_length=160)
    attachment_url: str | None = Field(None, max_length=1000)


class AgileSprintCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    goal: str | None = Field("", max_length=1000)
    status: str = Field("Planning", pattern="^(Planning|Active|Review|Retrospective|Closed)$")
    start_date: date | None = None
    end_date: date | None = None
    capacity_points: float | None = Field(0, ge=0, le=10000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgileSprintUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    goal: str | None = Field(None, max_length=1000)
    status: str | None = Field(None, pattern="^(Planning|Active|Review|Retrospective|Closed)$")
    start_date: date | None = None
    end_date: date | None = None
    capacity_points: float | None = Field(None, ge=0, le=10000)
    metadata: dict[str, Any] | None = None


class AgileItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    item_type: str = Field("Story", pattern="^(Epic|Story|Task|Spike|Bug)$")
    description: str | None = Field("", max_length=4000)
    story_points: float | None = Field(0, ge=0, le=10000)
    priority: str = Field("Should", pattern="^(Must|Should|Could|Wont)$")
    status: str = Field("Backlog", pattern="^(Backlog|Ready|In Progress|Review|Done)$")
    sprint_id: UUID | None = None
    parent_id: UUID | None = None
    wbs_code: str | None = Field(None, max_length=50)
    assignee: str | None = Field(None, max_length=120)
    reviewer: str | None = Field(None, max_length=120)
    acceptance_criteria: str | None = Field("", max_length=4000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgileItemUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    item_type: str | None = Field(None, pattern="^(Epic|Story|Task|Spike|Bug)$")
    description: str | None = Field(None, max_length=4000)
    story_points: float | None = Field(None, ge=0, le=10000)
    priority: str | None = Field(None, pattern="^(Must|Should|Could|Wont)$")
    status: str | None = Field(None, pattern="^(Backlog|Ready|In Progress|Review|Done)$")
    sprint_id: UUID | None = None
    parent_id: UUID | None = None
    wbs_code: str | None = Field(None, max_length=50)
    assignee: str | None = Field(None, max_length=120)
    reviewer: str | None = Field(None, max_length=120)
    acceptance_criteria: str | None = Field(None, max_length=4000)
    metadata: dict[str, Any] | None = None


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=160)
    password: str = Field(..., min_length=1, max_length=200)


# P2-02: 리스크 · 이슈 모델
class RiskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=2000)
    severity: str = Field("보통", pattern="^(높음|보통|낮음)$")
    likelihood: str = Field("보통", pattern="^(높음|보통|낮음)$")
    owner: str = Field("PMO", max_length=80)
    mitigation: str = Field("", max_length=2000)
    wbs_code: str | None = Field(None, max_length=50)
    due_date: str | None = None


class RiskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    severity: str | None = Field(None, pattern="^(높음|보통|낮음)$")
    likelihood: str | None = Field(None, pattern="^(높음|보통|낮음)$")
    status: str | None = Field(None, pattern="^(Open|Mitigated|Closed)$")
    owner: str | None = Field(None, max_length=80)
    mitigation: str | None = Field(None, max_length=2000)
    wbs_code: str | None = Field(None, max_length=50)
    due_date: str | None = None


class IssueCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=2000)
    priority: str = Field("보통", pattern="^(높음|보통|낮음)$")
    assignee: str = Field("PMO", max_length=80)
    wbs_code: str | None = Field(None, max_length=50)
    due_date: str | None = None


class IssueUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    priority: str | None = Field(None, pattern="^(높음|보통|낮음)$")
    status: str | None = Field(None, pattern="^(Open|In Progress|Resolved|Closed)$")
    assignee: str | None = Field(None, max_length=80)
    wbs_code: str | None = Field(None, max_length=50)
    due_date: str | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)


class UserCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=160)
    display_name: str = Field(..., min_length=2, max_length=120)
    role: str = Field("viewer", min_length=3, max_length=20)
    password: str = Field(..., min_length=8, max_length=200)
    status: str = Field("Active", min_length=5, max_length=20)
    must_change_password: bool = True
    group_id: UUID | None = None


class UserUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=2, max_length=120)
    role: str | None = Field(None, min_length=3, max_length=20)
    password: str | None = Field(None, min_length=8, max_length=200)
    status: str | None = Field(None, min_length=5, max_length=20)
    must_change_password: bool | None = None
    group_id: UUID | None = None


class UserGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field("", max_length=500)


class UserGroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    status: str | None = Field(None, pattern="^(Active|Suspended)$")


class SettingUpdate(BaseModel):
    value: dict[str, Any] = Field(default_factory=dict)


class ProjectOperationPolicyUpdate(BaseModel):
    default_delivery_mode: str | None = Field(None, pattern="^(waterfall|agile|hybrid)$")
    story_point_mode: str | None = Field(None, pattern="^(numeric|fibonacci)$")
    fibonacci_points: list[float] | None = Field(None, max_length=20)
    sprint_length_policy: str | None = Field(None, pattern="^(custom|fixed_1w|fixed_2w|fixed_4w)$")
    dod_management: str | None = Field(None, pattern="^(organization|team)$")
    default_dod_items: list[str] | None = Field(None, max_length=20)
    openproject_sprint_version_sync: bool | None = None
    metadata: dict[str, Any] | None = None


class ReportScheduleUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    enabled: bool | None = None
    timezone: str | None = Field(None, min_length=2, max_length=80)
    day_of_week: int | None = Field(None, ge=0, le=6)
    hour: int | None = Field(None, ge=0, le=23)
    minute: int | None = Field(None, ge=0, le=59)
    recipients: list[str] | None = Field(None, max_length=10)
    email_subject: str | None = Field(None, min_length=1, max_length=200)
    email_body: str | None = Field(None, min_length=1, max_length=2000)
    metadata: dict[str, Any] | None = None


class ReportRunRequest(BaseModel):
    send_email: bool = True
    triggered_by: str = Field("manual", min_length=1, max_length=80)


class TenantCreate(BaseModel):
    id: str = Field(..., min_length=2, max_length=60, pattern=r"^[a-z0-9\-]+$")
    name: str = Field(..., min_length=1, max_length=100)


class LdapTestRequest(BaseModel):
    email: str
    password: str


class LdapDiagnosticsRequest(BaseModel):
    email: str | None = None
    password: str | None = None


class ChangeRequestCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    impact_scope: str = ""          # 범위: 일정/비용/품질/인력
    impact_schedule_days: int | None = None
    impact_cost: float | None = None
    priority: str = "보통"          # 높음/보통/낮음
    wbs_code: str | None = None
    requested_by: str = ""


class ChangeRequestUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    impact_scope: str | None = None
    impact_schedule_days: int | None = None
    impact_cost: float | None = None
    priority: str | None = None
    status: str | None = None       # Open/Approved/Rejected/Withdrawn
    resolution: str | None = None


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field("", max_length=4000)
    project_id: str | None = None   # None = 전사 공지
    pinned: bool = False


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    body: str | None = Field(None, max_length=4000)
    pinned: bool | None = None


class ActionItemInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=4000)
    assignee: str | None = Field(None, max_length=80)
    assignee_user_id: UUID | None = None
    due_date: date | None = None
    status: str = Field("대기", pattern="^(대기|진행중|완료|보류|취소)$")
    priority: str = Field("보통", pattern="^(높음|보통|낮음)$")
    wbs_code: str | None = Field(None, max_length=120)
    issue_id: UUID | None = None


class ActionItemUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=4000)
    assignee: str | None = Field(None, max_length=80)
    assignee_user_id: UUID | None = None
    due_date: date | None = None
    status: str | None = Field(None, pattern="^(대기|진행중|완료|보류|취소)$")
    priority: str | None = Field(None, pattern="^(높음|보통|낮음)$")
    wbs_code: str | None = Field(None, max_length=120)
    issue_id: UUID | None = None
    comment: str | None = Field(None, max_length=1000)


class MeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    meeting_type: str = Field("정기", max_length=20)
    meeting_date: date | None = None
    start_time: str | None = Field(None, max_length=20)
    location: str | None = Field(None, max_length=200)
    facilitator: str | None = Field(None, max_length=80)
    attendees: list[str] = Field(default_factory=list, max_length=100)
    agenda: str = Field("", max_length=20000)
    minutes: str = Field("", max_length=50000)
    decisions: str = Field("", max_length=20000)
    status: str = Field("Draft", pattern="^(Draft|Final)$")
    action_items: list[ActionItemInput] = Field(default_factory=list, max_length=100)


class MeetingUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    meeting_type: str | None = Field(None, max_length=20)
    meeting_date: date | None = None
    start_time: str | None = Field(None, max_length=20)
    location: str | None = Field(None, max_length=200)
    facilitator: str | None = Field(None, max_length=80)
    attendees: list[str] | None = Field(None, max_length=100)
    agenda: str | None = Field(None, max_length=20000)
    minutes: str | None = Field(None, max_length=50000)
    decisions: str | None = Field(None, max_length=20000)
    status: str | None = Field(None, pattern="^(Draft|Final)$")
