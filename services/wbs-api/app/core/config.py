"""환경 변수·상수·선택 의존성(apscheduler) — 다른 모듈에 의존하지 않는 최하위 계층.
"""
import logging
import os
from pathlib import Path


logger = logging.getLogger("wbs_api")


try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
except ImportError:  # pragma: no cover - allows static checks before container deps are installed
    AsyncIOScheduler = None
    CronTrigger = None


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://wbs:wbs_dev_password@localhost:5432/wbs_platform",
)
OPENPROJECT_BASE_URL = os.getenv("OPENPROJECT_BASE_URL", "http://localhost:8080")
OPENPROJECT_HOST_HEADER = os.getenv("OPENPROJECT_HOST_HEADER", "")
OPENPROJECT_SYNC_ENABLED = os.getenv("OPENPROJECT_SYNC_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
OPENPROJECT_API_TOKEN = os.getenv("OPENPROJECT_API_TOKEN", "")
OPENPROJECT_AUTH_MODE = os.getenv("OPENPROJECT_AUTH_MODE", "bearer").lower()
OPENPROJECT_DEFAULT_TYPE_ID = os.getenv("OPENPROJECT_DEFAULT_TYPE_ID", "")
OPENPROJECT_TYPE_MAP_JSON = os.getenv("OPENPROJECT_TYPE_MAP_JSON", "{}")
OPENPROJECT_SYNC_PARENT_LINKS = os.getenv("OPENPROJECT_SYNC_PARENT_LINKS", "true").lower() in {"1", "true", "yes", "on"}
PM_ENGINE_ADAPTER = os.getenv("PM_ENGINE_ADAPTER", "openproject").strip().lower()
PORTAL_ORIGIN = os.getenv("PORTAL_ORIGIN", "http://localhost:3010")
ALLOW_FILE_ORIGIN = os.getenv("WBS_ALLOW_FILE_ORIGIN", "true").lower() in {"1", "true", "yes", "on"}
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "/tmp/wbs-backups"))
REPORT_OUTPUT_DIR = Path(os.getenv("WBS_REPORT_OUTPUT_DIR", "/app/outputs/reports"))
MIGRATION_PATH = Path(__file__).resolve().parents[2] / "migrations" / "001_init.sql"
# migrations/NNN_*.sql 전체를 파일명 순서로 적용 (migrate.py 와 동일 규칙 — 목록 수동 관리 불필요)
MIGRATION_PATHS = sorted((Path(__file__).resolve().parents[2] / "migrations").glob("[0-9][0-9][0-9]_*.sql"))
RUN_MIGRATIONS_ON_STARTUP = os.getenv("WBS_RUN_MIGRATIONS_ON_STARTUP", "true").lower() in {"1", "true", "yes", "on"}
SESSION_TTL_HOURS = int(os.getenv("WBS_SESSION_TTL_HOURS", "12"))
LOGIN_FAILURE_LIMIT = int(os.getenv("WBS_LOGIN_FAILURE_LIMIT", "5"))
LOGIN_LOCK_MINUTES = int(os.getenv("WBS_LOGIN_LOCK_MINUTES", "15"))
ENABLE_LOGIN_ALIASES = os.getenv("WBS_ENABLE_LOGIN_ALIASES", "false").lower() in {"1", "true", "yes", "on"}
MULTITENANCY_ENABLED = os.getenv("MULTITENANCY_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
DEFAULT_TENANT_ID = os.getenv("DEFAULT_TENANT_ID", "default")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
# P2-06: SSO/LDAP
AUTH_BACKEND = os.getenv("AUTH_BACKEND", "local").strip().lower()  # local | ldap
LDAP_SERVER = os.getenv("LDAP_SERVER", "")
LDAP_PORT = int(os.getenv("LDAP_PORT", "389"))
LDAP_USE_SSL = os.getenv("LDAP_USE_SSL", "false").lower() in {"1", "true", "yes", "on"}
LDAP_BIND_DN = os.getenv("LDAP_BIND_DN", "")
LDAP_BIND_PASSWORD = os.getenv("LDAP_BIND_PASSWORD", "")
LDAP_BASE_DN = os.getenv("LDAP_BASE_DN", "")
LDAP_USER_FILTER = os.getenv("LDAP_USER_FILTER", "(mail={email})")
LDAP_ATTR_EMAIL = os.getenv("LDAP_ATTR_EMAIL", "mail")
LDAP_ATTR_NAME = os.getenv("LDAP_ATTR_NAME", "cn")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
NOTIFY_FROM_EMAIL = os.getenv("NOTIFY_FROM_EMAIL", SMTP_USER)
REPORT_SCHEDULER_ENABLED = os.getenv("WBS_REPORT_SCHEDULER_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
REPORT_DEFAULT_TIMEZONE = os.getenv("WBS_REPORT_TIMEZONE", "Asia/Seoul")
REPORT_SMTP_HOST = os.getenv("WBS_SMTP_HOST", SMTP_HOST).strip()
REPORT_SMTP_PORT = int(os.getenv("WBS_SMTP_PORT", str(SMTP_PORT)))
REPORT_SMTP_USERNAME = os.getenv("WBS_SMTP_USERNAME", SMTP_USER).strip()
REPORT_SMTP_PASSWORD = os.getenv("WBS_SMTP_PASSWORD", SMTP_PASSWORD)
REPORT_SMTP_FROM = os.getenv(
    "WBS_SMTP_FROM",
    NOTIFY_FROM_EMAIL or REPORT_SMTP_USERNAME or "wbs-platform@localhost",
).strip()
REPORT_SMTP_USE_TLS = os.getenv("WBS_SMTP_USE_TLS", "true").lower() in {"1", "true", "yes", "on"}
REPORT_SMTP_USE_SSL = os.getenv("WBS_SMTP_USE_SSL", "false").lower() in {"1", "true", "yes", "on"}
AUDIT_RETENTION_DAYS = int(os.getenv("WBS_AUDIT_RETENTION_DAYS", "365"))
MAX_EXCEL_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_WORK_ITEM_ATTACHMENT_BYTES = int(os.getenv("WBS_WORK_ITEM_ATTACHMENT_MAX_BYTES", str(2 * 1024 * 1024)))
EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
ALLOWED_USER_ROLES = {"admin", "pmo", "viewer"}
ALLOWED_USER_STATUSES = {"Active", "Suspended"}
MUTATING_ROLES = {"admin", "pmo"}
ADMIN_ROLES = {"admin"}
# ── 프로젝트 단위 역할 (wbs_project_members.project_role) ──────────────────
#   admin    프로젝트 관리자 — 모든 권한 + 멤버 관리
#   pmo      PMO           — WBS·리스크·이슈·변경 편집
#   pm       PM            — WBS·리스크·이슈·변경 편집 + 멤버 관리(관리자 지정 제외)
#   member   팀원          — 본인 작업 진척 입력, 회의·Action Item·이슈 등록
#   reviewer 검토자        — 열람 + 검토 대상 작업 갱신, 회의·Action Item 등록
#   viewer   열람자        — 읽기 전용
PROJECT_ROLES = {"admin", "pmo", "pm", "member", "reviewer", "viewer"}
PROJECT_ROLE_LABELS = {
    "admin": "프로젝트 관리자", "pmo": "PMO", "pm": "PM",
    "member": "팀원", "reviewer": "검토자", "viewer": "열람자",
}
PROJECT_MUTATING_ROLES = {"admin", "pmo", "pm"}
PROJECT_MANAGE_ROLES = {"admin", "pm"}
PROJECT_COLLAB_ROLES = {"admin", "pmo", "pm", "member", "reviewer"}
WORK_ITEM_STATUSES = {"대기", "진행중", "완료", "지연", "보류"}
WORK_ITEM_PRIORITIES = {"높음", "보통", "낮음"}
PROJECT_DELIVERY_MODES = {"waterfall", "agile", "hybrid"}
AGILE_SPRINT_STATUSES = {"Planning", "Active", "Review", "Retrospective", "Closed"}
AGILE_ITEM_TYPES = {"Epic", "Story", "Task", "Spike", "Bug"}
AGILE_ITEM_STATUSES = {"Backlog", "Ready", "In Progress", "Review", "Done"}
AGILE_ITEM_PRIORITIES = {"Must", "Should", "Could", "Wont"}
STORY_POINT_MODES = {"numeric", "fibonacci"}
SPRINT_LENGTH_POLICIES = {"custom", "fixed_1w", "fixed_2w", "fixed_4w"}
DOD_MANAGEMENT_MODES = {"organization", "team"}
SPRINT_LENGTH_DAYS = {"fixed_1w": 7, "fixed_2w": 14, "fixed_4w": 28}
DEFAULT_PROJECT_OPERATION_POLICY = {
    "default_delivery_mode": "waterfall",
    "story_point_mode": "numeric",
    "fibonacci_points": [1, 2, 3, 5, 8, 13],
    "sprint_length_policy": "custom",
    "dod_management": "team",
    "default_dod_items": [],
    "openproject_sprint_version_sync": False,
    "metadata": {},
}
DEFAULT_USER_GROUP_NAME = "기본 그룹"
PROJECT_WORKFLOW_TRANSITIONS = {
    "Draft": {"Review", "Approved", "Closed"},
    "Review": {"Approved", "Rejected", "Closed"},
    "Rejected": {"Draft", "Review", "Closed"},
    "Approved": {"Synced", "Closed"},
    "Synced": {"Closed"},
    "Closed": set(),
}
APPROVAL_ALLOWED_PROJECT_STATUSES = {"Draft", "Rejected", "Review"}
PROJECT_WBS_IMPORT_ALLOWED_STATUSES = {"Draft", "Rejected", "Review", "Approved"}
ACTUAL_SYNC_REQUIRED_STATUS = "Approved"
DEFAULT_LOGIN_ALIASES = {
    "admin": {"email": "admin@wbs.local", "password": "admin"},
    "pmo": {"email": "pmo@wbs.local", "password": "pmo"},
    "viewer": {"email": "viewer@wbs.local", "password": "viewer"},
}
USER_SELECT = """
id, email, display_name, role, status, tenant_id, group_id, failed_login_count, locked_until,
must_change_password, last_login_at, password_changed_at, created_at
"""
USER_SELECT_U = """
u.id, u.email, u.display_name, u.role, u.status, u.tenant_id, u.group_id, u.failed_login_count,
u.locked_until, u.must_change_password, u.last_login_at, u.password_changed_at,
u.created_at
"""
USER_SELECT_G = """
u.id, u.email, u.display_name, u.role, u.status, u.tenant_id, u.group_id, u.failed_login_count,
u.locked_until, u.must_change_password, u.last_login_at, u.password_changed_at,
u.created_at, g.name AS group_name, g.status AS group_status
"""


IMPORT_JOB_RETURNING = """
id, source_file, template_key, template_name, project_type, description, status,
total_rows, accepted_rows, rejected_rows, errors, warnings, preview_rows,
diff_rows, template_version, applied_at, created_at
"""
APPROVAL_SELECT = """
a.id, a.project_id, p.name AS project_name, p.template_key, a.title,
a.request_type, a.status, a.requester, a.reviewer, a.due_date,
a.decision_comment, a.metadata, a.created_at, a.decided_at, a.updated_at
"""
SYNC_RUN_SELECT = """
s.id, s.project_id, p.name AS project_name, p.template_key, s.mode,
s.status, s.actor, s.engine, s.dry_run, s.create_work_packages,
s.validate_payloads, s.total_rows, s.pending_work_packages,
s.synced_work_packages, s.created_work_packages, s.openproject_project_id,
s.metadata, s.error, s.started_at, s.completed_at
"""
BASELINE_SELECT = """
b.id, b.project_id, p.name AS project_name, b.approval_id, b.version,
b.status, b.template_key, b.template_name, b.item_count, b.total_weight,
b.snapshot_rows, b.metadata, b.locked_at, b.created_at
"""
REPORT_SCHEDULE_SELECT = """
id, key, name, report_type, enabled, timezone, day_of_week, hour, minute,
recipients, email_subject, email_body, metadata, last_run_at, next_run_at,
created_at, updated_at
"""
REPORT_RUN_SELECT = """
id, schedule_id, schedule_key, report_type, status, period_start,
period_end, recipient_count, artifact_path, delivery_status,
delivery_detail, error, metadata, triggered_by, started_at, completed_at
"""
AGILE_SPRINT_SELECT = """
id, project_id, tenant_id, name, goal, status, start_date, end_date,
capacity_points, metadata, created_at, updated_at
"""


PROJECT_OPERATION_POLICY_SELECT = """
tenant_id, default_delivery_mode, story_point_mode, fibonacci_points,
sprint_length_policy, dod_management, default_dod_items,
openproject_sprint_version_sync, metadata, updated_by, created_at, updated_at
"""

EXCEL_COLUMNS = [
    ("level", "레벨"),
    ("code", "WBS 코드"),
    ("parent_code", "상위 WBS 코드"),
    ("name", "작업명"),
    ("item_type", "유형"),
    ("owner", "담당"),
    ("weight", "가중치"),
    ("start_date", "시작일"),
    ("finish_date", "종료일"),
    ("deliverable_type", "산출물 유형"),
    ("inspection_required", "검수 여부"),
    ("progress_formula", "진척 산식"),
    ("notes", "비고"),
]

HEADER_ALIASES = {
    "레벨": "level",
    "level": "level",
    "wbs코드": "code",
    "wbscode": "code",
    "code": "code",
    "상위wbs코드": "parent_code",
    "상위코드": "parent_code",
    "parentcode": "parent_code",
    "parentwbscode": "parent_code",
    "작업명": "name",
    "작업": "name",
    "name": "name",
    "taskname": "name",
    "subject": "name",
    "유형": "item_type",
    "type": "item_type",
    "itemtype": "item_type",
    "담당": "owner",
    "담당자": "owner",
    "owner": "owner",
    "assignee": "owner",
    "가중치": "weight",
    "weight": "weight",
    "시작일": "start_date",
    "start": "start_date",
    "startdate": "start_date",
    "종료일": "finish_date",
    "finish": "finish_date",
    "finishdate": "finish_date",
    "duedate": "finish_date",
    "산출물유형": "deliverable_type",
    "deliverabletype": "deliverable_type",
    "검수여부": "inspection_required",
    "inspectionrequired": "inspection_required",
    "approvalrequired": "inspection_required",
    "진척산식": "progress_formula",
    "progressformula": "progress_formula",
    "비고": "notes",
    "notes": "notes",
}


_WBS_TO_AGILE_STATUS: dict[str, str] = {
    "대기": "Backlog", "계획": "Backlog", "보류": "Backlog",
    "시작": "In Progress", "진행중": "In Progress", "수행중": "In Progress", "지연": "In Progress",
    "검수중": "Review", "검토": "Review",
    "완료": "Done",
}

_WBS_TO_AGILE_TYPE: dict[str, str] = {
    "마일스톤": "Epic",
    "단계": "Story", "산출물": "Story", "패키지": "Story",
    "작업": "Task", "태스크": "Task", "하위작업": "Task", "서브태스크": "Task",
}


RESOURCE_DEFAULT_TASK_HOURS = 8.0


_NOTE_ROLES = {"admin", "pmo", "viewer"}


MEETING_TYPES = {"정기", "착수", "검토", "이슈", "고객", "기타"}
MEETING_STATUSES = {"Draft", "Final"}
ACTION_ITEM_STATUSES = {"대기", "진행중", "완료", "보류", "취소"}
ACTION_ITEM_CLOSED = {"완료", "취소"}


ACTION_ITEM_SELECT = """
    a.id, a.tenant_id, a.project_id, a.meeting_id, a.title, a.description, a.assignee,
    a.assignee_user_id, a.due_date, a.status, a.priority, a.wbs_code, a.issue_id, a.source,
    a.completed_at, a.metadata, a.created_by, a.created_by_name, a.created_at, a.updated_at,
    p.name AS project_name, m.title AS meeting_title, m.meeting_date,
    i.title AS issue_title, w.name AS wbs_name
"""
ACTION_ITEM_FROM = """
    FROM wbs_action_items a
    JOIN wbs_projects p ON p.id = a.project_id
    LEFT JOIN wbs_meetings m ON m.id = a.meeting_id
    LEFT JOIN wbs_issues i ON i.id = a.issue_id
    LEFT JOIN wbs_project_wbs_items w ON w.project_id = a.project_id AND w.code = a.wbs_code
"""
