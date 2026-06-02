from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
import json
import os
from pathlib import Path
import re
import secrets
from typing import Any
from uuid import UUID

import asyncpg
import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Side, Border
from openpyxl.worksheet.datavalidation import DataValidation
from pydantic import BaseModel, Field


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
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "/app/backups/postgres"))
MIGRATION_PATH = Path(__file__).resolve().parent.parent / "migrations" / "001_init.sql"
RUN_MIGRATIONS_ON_STARTUP = os.getenv("WBS_RUN_MIGRATIONS_ON_STARTUP", "true").lower() in {"1", "true", "yes", "on"}
SESSION_TTL_HOURS = int(os.getenv("WBS_SESSION_TTL_HOURS", "12"))
LOGIN_FAILURE_LIMIT = int(os.getenv("WBS_LOGIN_FAILURE_LIMIT", "5"))
LOGIN_LOCK_MINUTES = int(os.getenv("WBS_LOGIN_LOCK_MINUTES", "15"))
AUDIT_RETENTION_DAYS = int(os.getenv("WBS_AUDIT_RETENTION_DAYS", "365"))
MAX_EXCEL_UPLOAD_BYTES = 8 * 1024 * 1024
EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
ALLOWED_USER_ROLES = {"admin", "pmo", "viewer"}
ALLOWED_USER_STATUSES = {"Active", "Suspended"}
MUTATING_ROLES = {"admin", "pmo"}
ADMIN_ROLES = {"admin"}
PROJECT_WORKFLOW_TRANSITIONS = {
    "Draft": {"Review", "Approved", "Closed"},
    "Review": {"Approved", "Rejected", "Closed"},
    "Rejected": {"Draft", "Review", "Closed"},
    "Approved": {"Synced", "Closed"},
    "Synced": {"Closed"},
    "Closed": set(),
}
APPROVAL_ALLOWED_PROJECT_STATUSES = {"Draft", "Rejected", "Review"}
PROJECT_WBS_IMPORT_ALLOWED_STATUSES = {"Draft", "Rejected", "Review"}
ACTUAL_SYNC_REQUIRED_STATUS = "Approved"
USER_SELECT = """
id, email, display_name, role, status, failed_login_count, locked_until,
must_change_password, last_login_at, password_changed_at, created_at
"""
USER_SELECT_U = """
u.id, u.email, u.display_name, u.role, u.status, u.failed_login_count,
u.locked_until, u.must_change_password, u.last_login_at, u.password_changed_at,
u.created_at
"""
SETTING_SELECT = "key, label, category, description, value, is_sensitive, updated_by, created_at, updated_at"
AUDIT_SELECT = """
id, actor_user_id, actor_email, actor_role, event_type, entity_type, entity_id,
summary, metadata, created_at
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


async def init_connection(connection: asyncpg.Connection) -> None:
    await connection.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await connection.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=1,
        max_size=8,
        init=init_connection,
    )
    if RUN_MIGRATIONS_ON_STARTUP:
        async with pool.acquire() as connection:
            await connection.execute(MIGRATION_PATH.read_text(encoding="utf-8"))
    app.state.pool = pool
    yield
    await pool.close()


app = FastAPI(
    title="WBS Platform Extension API",
    version="0.1.0",
    lifespan=lifespan,
)

allowed_origins = [PORTAL_ORIGIN, "http://localhost:3010", "http://127.0.0.1:3010"]
if ALLOW_FILE_ORIGIN:
    allowed_origins.append("null")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    template_key: str = Field(..., min_length=2, max_length=80)
    owner: str = Field("PMO", min_length=2, max_length=80)
    start_date: date | None = None


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


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=160)
    password: str = Field(..., min_length=1, max_length=200)


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


class UserUpdate(BaseModel):
    display_name: str | None = Field(None, min_length=2, max_length=120)
    role: str | None = Field(None, min_length=3, max_length=20)
    password: str | None = Field(None, min_length=8, max_length=200)
    status: str | None = Field(None, min_length=5, max_length=20)
    must_change_password: bool | None = None


class SettingUpdate(BaseModel):
    value: dict[str, Any] = Field(default_factory=dict)


def normalize_record(record: asyncpg.Record) -> dict[str, Any]:
    data = dict(record)
    for key, value in data.items():
        if isinstance(value, date):
            data[key] = value.isoformat()
        if isinstance(value, Decimal):
            data[key] = float(value)
        if key in {"errors", "warnings", "metadata", "phases", "preview_rows", "snapshot_rows", "error"} and isinstance(data[key], str):
            try:
                data[key] = json.loads(data[key])
            except json.JSONDecodeError:
                pass
    return data


def normalize_metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
            return decoded if isinstance(decoded, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.pool


def auth_token_from_request(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def user_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    user = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "display_name": user["display_name"],
        "role": user["role"],
        "status": user["status"],
        "must_change_password": bool(user.get("must_change_password", False)),
        "last_login_at": user.get("last_login_at"),
        "password_changed_at": user.get("password_changed_at"),
        "created_at": user.get("created_at"),
    }


def managed_user_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    user = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    return {
        **user_response(user),
        "updated_at": user.get("updated_at"),
        "active_sessions": int(user.get("active_sessions") or 0),
        "failed_login_count": int(user.get("failed_login_count") or 0),
        "locked_until": user.get("locked_until"),
    }


async def fetch_user_by_token(connection: asyncpg.Connection, token: str) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"""
        SELECT {USER_SELECT_U}
        FROM wbs_user_sessions s
        JOIN wbs_users u ON u.id = s.user_id
        WHERE s.token = $1
          AND s.expires_at > now()
          AND u.status = 'Active'
        """,
        token,
    )
    return user_response(record) if record else None


def require_roles(request: Request, allowed_roles: set[str]) -> dict[str, Any]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient role")
    return user


def require_mutating_role(request: Request) -> dict[str, Any]:
    return require_roles(request, MUTATING_ROLES)


def require_admin_role(request: Request) -> dict[str, Any]:
    return require_roles(request, ADMIN_ROLES)


def validate_project_status(status: str) -> str:
    normalized_status = status.strip().title()
    if normalized_status not in PROJECT_WORKFLOW_TRANSITIONS:
        raise HTTPException(status_code=400, detail="Invalid project status")
    return normalized_status


def ensure_project_status_allowed(project: dict[str, Any] | asyncpg.Record, allowed_statuses: set[str], action: str) -> None:
    status = project["status"]
    if status not in allowed_statuses:
        raise HTTPException(
            status_code=409,
            detail=f"{action} is not allowed while project status is {status}",
        )


def ensure_project_transition(current_status: str, next_status: str) -> None:
    current = validate_project_status(current_status)
    target = validate_project_status(next_status)
    if target == current:
        return
    if target not in PROJECT_WORKFLOW_TRANSITIONS[current]:
        raise HTTPException(
            status_code=409,
            detail=f"Project status cannot move from {current} to {target}",
        )


def safe_uuid(value: Any) -> UUID | None:
    if not value:
        return None
    try:
        return value if isinstance(value, UUID) else UUID(str(value))
    except ValueError:
        return None


def validate_user_role(role: str) -> str:
    normalized_role = role.strip().lower()
    if normalized_role not in ALLOWED_USER_ROLES:
        raise HTTPException(status_code=400, detail="Invalid user role")
    return normalized_role


def validate_user_status(status: str) -> str:
    normalized_status = status.strip().title()
    if normalized_status not in ALLOWED_USER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid user status")
    return normalized_status


def setting_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    setting = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    if setting.get("is_sensitive"):
        setting["value"] = {"masked": True}
    return setting


def audit_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    event = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    if event.get("actor_user_id"):
        event["actor_user_id"] = str(event["actor_user_id"])
    return event


async def insert_audit_event(
    connection: asyncpg.Connection,
    *,
    request: Request | None = None,
    event_type: str,
    summary: str,
    entity_type: str | None = None,
    entity_id: Any = None,
    metadata: dict[str, Any] | None = None,
    actor: dict[str, Any] | None = None,
    actor_email: str | None = None,
    actor_role: str | None = None,
) -> None:
    request_user = getattr(request.state, "user", None) if request else None
    resolved_actor = actor or request_user or {}
    email = actor_email or resolved_actor.get("email")
    role = actor_role or resolved_actor.get("role")
    await connection.execute(
        """
        INSERT INTO wbs_audit_events
          (actor_user_id, actor_email, actor_role, event_type, entity_type,
           entity_id, summary, metadata)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        """,
        safe_uuid(resolved_actor.get("id")),
        email,
        role,
        event_type,
        entity_type,
        str(entity_id) if entity_id is not None else None,
        summary,
        metadata or {},
    )


def apply_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.middleware("http")
async def authenticate_api_requests(request: Request, call_next):
    path = request.url.path
    public_paths = {"/api/auth/login"}
    if request.method == "OPTIONS" or not path.startswith("/api/") or path in public_paths:
        return apply_security_headers(await call_next(request))

    token = auth_token_from_request(request)
    if not token:
        return apply_security_headers(JSONResponse(status_code=401, content={"detail": "Authentication required"}))

    async with get_pool(request).acquire() as connection:
        user = await fetch_user_by_token(connection, token)

    if not user:
        return apply_security_headers(JSONResponse(status_code=401, content={"detail": "Invalid or expired session"}))

    request.state.user = user
    return apply_security_headers(await call_next(request))


def parse_json_object(value: str, *, default: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        decoded = json.loads(value or "{}")
        return decoded if isinstance(decoded, dict) else (default or {})
    except json.JSONDecodeError:
        return default or {}


def normalize_header(value: Any) -> str:
    return re.sub(r"[\s_./-]+", "", str(value or "").strip().lower())


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_code(value: Any) -> str | None:
    text = normalize_text(value)
    return re.sub(r"\s+", "", text) if text else None


def normalize_template_key(value: str) -> str:
    key = re.sub(r"[^a-z0-9_-]+", "-", value.strip().lower())
    key = re.sub(r"-{2,}", "-", key).strip("-")
    if not key:
        raise HTTPException(status_code=400, detail="Template key is required")
    return key[:80]


def normalize_openproject_identifier(value: str, fallback: str) -> str:
    identifier = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower())
    identifier = re.sub(r"-{2,}", "-", identifier).strip("-")
    return (identifier or fallback)[:100]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if text.endswith("%"):
        text = text[:-1]
    try:
        return float(text)
    except ValueError as exc:
        raise ValueError(f"Invalid number: {value}") from exc


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    return text in {"1", "true", "t", "yes", "y", "예", "검수", "필수", "o"}


def as_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Invalid date: {value}")


def infer_parent_from_code(code: str) -> str | None:
    if "." not in code:
        return None
    return code.rsplit(".", 1)[0]


def template_code_prefix(template_key: str) -> str:
    known_prefixes = {
        "si-standard": "SI",
        "migration-data": "MIG",
        "maintenance": "OPS",
    }
    if template_key in known_prefixes:
        return known_prefixes[template_key]
    words = re.findall(r"[A-Z0-9]+", template_key.upper())
    if not words:
        return "WBS"
    return "".join(word[0] for word in words)[:6]


def parent_depth(code: str, parent_map: dict[str, str | None]) -> int:
    depth = 1
    seen = {code}
    parent = parent_map.get(code)
    while parent and parent not in seen:
        seen.add(parent)
        depth += 1
        parent = parent_map.get(parent)
    return depth


def code_depth(code: str) -> int:
    return len(code.split(".")) if code else 1


def generated_child_code(parent_code: str, item_type: str, counters: dict[str, dict[str, int]], used_codes: set[str]) -> str:
    bucket = counters.setdefault(parent_code, {"normal": 0, "milestone": 0})
    if item_type == "마일스톤":
        while True:
            bucket["milestone"] += 1
            candidate = f"{parent_code}.M{bucket['milestone']}"
            if candidate not in used_codes:
                return candidate

    while True:
        bucket["normal"] += 1
        candidate = f"{parent_code}.{bucket['normal']}"
        if candidate not in used_codes:
            return candidate


def assign_missing_wbs_codes(rows: list[dict[str, Any]], root_code: str) -> list[dict[str, Any]]:
    assigned_rows = [dict(row) for row in rows]
    used_codes = {row["code"] for row in assigned_rows if row.get("code")}
    level_stack: dict[int, str] = {}
    counters: dict[str, dict[str, int]] = {}
    root_assigned = root_code in used_codes

    for row in assigned_rows:
        level = row.get("level")
        code = normalize_code(row.get("code"))
        parent_code = normalize_code(row.get("parent_code"))
        item_type = row.get("item_type") or "작업"

        if code:
            if not parent_code and level and level > 1:
                parent_code = level_stack.get(level - 1)
            if not parent_code:
                parent_code = infer_parent_from_code(code)
            row["code"] = code
            row["parent_code"] = parent_code
            resolved_level = level or code_depth(code)
            level_stack[resolved_level] = code
            for stale_level in [key for key in level_stack if key > resolved_level]:
                del level_stack[stale_level]
            used_codes.add(code)
            continue

        if not parent_code and level and level > 1:
            parent_code = level_stack.get(level - 1)

        if not parent_code and not root_assigned:
            code = root_code
            root_assigned = True
        elif parent_code:
            code = generated_child_code(parent_code, item_type, counters, used_codes)
        else:
            code = generated_child_code(root_code, item_type, counters, used_codes)
            parent_code = root_code if root_assigned else None

        row["code"] = code
        row["parent_code"] = parent_code
        row["code_generated"] = True
        used_codes.add(code)
        resolved_level = level or (parent_depth(code, {item["code"]: item.get("parent_code") for item in assigned_rows if item.get("code")}))
        level_stack[resolved_level] = code
        for stale_level in [key for key in level_stack if key > resolved_level]:
            del level_stack[stale_level]

    return assigned_rows


def auto_code_warnings(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "row": row.get("row_number"),
            "field": "code",
            "message": f"WBS code was generated as {row['code']}",
        }
        for row in rows
        if row.get("code_generated")
    ]


def root_code_from_rows(rows: list[dict[str, Any]]) -> str | None:
    roots = [row for row in rows if row.get("code") and not row.get("parent_code")]
    if len(roots) == 1:
        return roots[0]["code"]
    return None


def renumber_wbs_rows(rows: list[dict[str, Any]], root_code: str | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not rows:
        return [], []

    ordered_rows = sorted(rows, key=lambda row: (row.get("sort_order") or 0, row.get("code") or ""))
    children_by_parent: dict[str | None, list[dict[str, Any]]] = {}
    for row in ordered_rows:
        children_by_parent.setdefault(row.get("parent_code"), []).append(dict(row))

    roots = children_by_parent.get(None, [])
    if not roots:
        roots = [ordered_rows[0]]
        children_by_parent.setdefault(None, roots)

    resolved_root_code = root_code or roots[0].get("code") or "WBS"
    changes: list[dict[str, Any]] = []
    renumbered_rows: list[dict[str, Any]] = []

    def walk(row: dict[str, Any], new_code: str, new_parent_code: str | None) -> None:
        old_code = row.get("code")
        if old_code != new_code or row.get("parent_code") != new_parent_code:
            changes.append(
                {
                    "name": row.get("name"),
                    "old_code": old_code,
                    "new_code": new_code,
                    "old_parent_code": row.get("parent_code"),
                    "new_parent_code": new_parent_code,
                }
            )

        next_row = dict(row)
        next_row["code"] = new_code
        next_row["parent_code"] = new_parent_code
        renumbered_rows.append(next_row)

        counters = {"normal": 0, "milestone": 0}
        for child in children_by_parent.get(old_code, []):
            if child.get("item_type") == "마일스톤":
                counters["milestone"] += 1
                child_code = f"{new_code}.M{counters['milestone']}"
            else:
                counters["normal"] += 1
                child_code = f"{new_code}.{counters['normal']}"
            walk(child, child_code, new_code)

    for index, root in enumerate(roots, start=1):
        new_root_code = resolved_root_code if index == 1 else f"{resolved_root_code}.{index}"
        walk(root, new_root_code, None)

    for index, row in enumerate(renumbered_rows, start=1):
        row["sort_order"] = index

    return renumbered_rows, changes


def parse_wbs_workbook(contents: bytes) -> list[dict[str, Any]]:
    if len(contents) > MAX_EXCEL_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Excel file is too large")

    try:
        workbook = load_workbook(BytesIO(contents), data_only=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Excel workbook: {exc}") from exc

    worksheet = workbook[workbook.sheetnames[0]]
    header_row = None
    header_map: dict[str, int] = {}

    for row_number in range(1, min(worksheet.max_row, 10) + 1):
        candidate: dict[str, int] = {}
        for column_number in range(1, worksheet.max_column + 1):
            header = HEADER_ALIASES.get(normalize_header(worksheet.cell(row_number, column_number).value))
            if header:
                candidate[header] = column_number
        if "name" in candidate:
            header_row = row_number
            header_map = candidate
            break

    if not header_row:
        raise HTTPException(status_code=400, detail="작업명 헤더를 찾을 수 없습니다")

    rows: list[dict[str, Any]] = []
    level_stack: dict[int, str] = {}

    for row_number in range(header_row + 1, worksheet.max_row + 1):
        raw = {
            field: worksheet.cell(row_number, column_number).value
            for field, column_number in header_map.items()
        }
        if not any(normalize_text(raw.get(field)) for field in ("code", "parent_code", "name")):
            continue

        try:
            level_value = as_float(raw.get("level"))
            level = int(level_value) if level_value else None
            code = normalize_code(raw.get("code"))
            parent_code = normalize_code(raw.get("parent_code"))
            if code and not parent_code and level and level > 1:
                parent_code = level_stack.get(level - 1)
            if code and not parent_code:
                parent_code = infer_parent_from_code(code)
            if code and level:
                level_stack[level] = code
                for stale_level in [key for key in level_stack if key > level]:
                    del level_stack[stale_level]

            rows.append(
                {
                    "row_number": row_number,
                    "level": level,
                    "code": code,
                    "name": normalize_text(raw.get("name")),
                    "parent_code": parent_code,
                    "item_type": normalize_text(raw.get("item_type")) or "작업",
                    "owner": normalize_text(raw.get("owner")),
                    "weight": as_float(raw.get("weight")),
                    "start_date": as_date(raw.get("start_date")),
                    "finish_date": as_date(raw.get("finish_date")),
                    "deliverable_type": normalize_text(raw.get("deliverable_type")),
                    "inspection_required": as_bool(raw.get("inspection_required")),
                    "progress_formula": normalize_text(raw.get("progress_formula")),
                    "notes": normalize_text(raw.get("notes")),
                }
            )
        except ValueError as exc:
            rows.append(
                {
                    "row_number": row_number,
                    "code": normalize_code(raw.get("code")),
                    "name": normalize_text(raw.get("name")),
                    "parent_code": normalize_code(raw.get("parent_code")),
                    "item_type": normalize_text(raw.get("item_type")) or "작업",
                    "parse_error": str(exc),
                }
            )

    return rows


def validate_wbs_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    codes: dict[str, int] = {}

    if not rows:
        return ([{"row": None, "field": "file", "message": "No WBS rows found"}], warnings)

    for index, row in enumerate(rows, start=1):
        row_number = row.get("row_number", index)
        code = row.get("code")
        name = row.get("name")

        if row.get("parse_error"):
            errors.append({"row": row_number, "field": "format", "message": row["parse_error"]})
        if not code:
            errors.append({"row": row_number, "field": "code", "message": "WBS code is required"})
        elif code in codes:
            errors.append({"row": row_number, "field": "code", "message": "Duplicate WBS code"})
        else:
            codes[code] = row_number
        if not name:
            errors.append({"row": row_number, "field": "name", "message": "Task name is required"})

        weight = row.get("weight")
        if weight is not None and not 0 <= weight <= 100:
            errors.append({"row": row_number, "field": "weight", "message": "Weight must be between 0 and 100"})

        if row.get("finish_date") and row.get("start_date") and row["finish_date"] < row["start_date"]:
            errors.append({"row": row_number, "field": "finish_date", "message": "Finish date is earlier than start date"})

    parent_map = {row["code"]: row.get("parent_code") for row in rows if row.get("code")}
    weight_map = {row["code"]: row.get("weight") for row in rows if row.get("code")}
    child_weight: dict[str, float] = {}

    for row in rows:
        code = row.get("code")
        parent_code = row.get("parent_code")
        if not code:
            continue
        if parent_code and parent_code not in codes:
            errors.append(
                {
                    "row": row.get("row_number"),
                    "field": "parent_code",
                    "message": "Parent code does not exist in import file",
                }
            )
        parent_key = parent_code or "__root__"
        child_weight[parent_key] = child_weight.get(parent_key, 0) + float(row.get("weight") or 0)

    for code in parent_map:
        seen = {code}
        parent_code = parent_map.get(code)
        while parent_code:
            if parent_code in seen:
                errors.append({"row": codes.get(code), "field": "parent_code", "message": "Circular hierarchy detected"})
                break
            seen.add(parent_code)
            parent_code = parent_map.get(parent_code)

    for parent_code, total_weight in child_weight.items():
        if not total_weight:
            continue
        expected = 100 if parent_code == "__root__" else weight_map.get(parent_code)
        if expected is not None and abs(total_weight - float(expected)) > 0.01:
            warnings.append(
                {
                    "parent_code": None if parent_code == "__root__" else parent_code,
                    "message": f"Sibling weights add up to {total_weight:.2f}, expected {float(expected):.2f}",
                }
            )

    return errors, warnings


def serialize_wbs_row(row: dict[str, Any]) -> dict[str, Any]:
    serialized = dict(row)
    for key in ("start_date", "finish_date"):
        if isinstance(serialized.get(key), date):
            serialized[key] = serialized[key].isoformat()
    return serialized


def comparable_wbs_row(row: dict[str, Any]) -> dict[str, Any]:
    metadata = normalize_metadata(row.get("metadata"))
    return {
        "parent_code": row.get("parent_code"),
        "name": row.get("name"),
        "item_type": row.get("item_type") or "작업",
        "owner": row.get("owner"),
        "weight": float(row["weight"]) if row.get("weight") is not None else None,
        "start_date": row.get("start_date").isoformat() if isinstance(row.get("start_date"), date) else row.get("start_date"),
        "finish_date": row.get("finish_date").isoformat() if isinstance(row.get("finish_date"), date) else row.get("finish_date"),
        "deliverable_type": row.get("deliverable_type", metadata.get("deliverable_type")),
        "inspection_required": row.get("inspection_required", metadata.get("inspection_required", False)),
        "progress_formula": row.get("progress_formula", metadata.get("progress_formula")),
        "notes": row.get("notes", metadata.get("notes")),
    }


def build_wbs_diff_rows(existing_rows: list[dict[str, Any]], next_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    existing_by_code = {row["code"]: row for row in existing_rows if row.get("code")}
    next_by_code = {row["code"]: row for row in next_rows if row.get("code")}
    diff_rows: list[dict[str, Any]] = []

    for code, row in next_by_code.items():
        existing = existing_by_code.get(code)
        if not existing:
            diff_rows.append({"change": "added", "code": code, "name": row.get("name")})
            continue

        before = comparable_wbs_row(existing)
        after = comparable_wbs_row(row)
        changed_fields = [
            {"field": field, "before": before.get(field), "after": after.get(field)}
            for field in sorted(after)
            if before.get(field) != after.get(field)
        ]
        if changed_fields:
            diff_rows.append(
                {
                    "change": "changed",
                    "code": code,
                    "name": row.get("name"),
                    "fields": changed_fields,
                }
            )

    for code, row in existing_by_code.items():
        if code not in next_by_code:
            diff_rows.append({"change": "removed", "code": code, "name": row.get("name")})

    return sorted(diff_rows, key=lambda item: (item["code"], item["change"]))


def restore_wbs_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    restored_rows: list[dict[str, Any]] = []
    for row in rows:
        restored = dict(row)
        for key in ("start_date", "finish_date"):
            value = restored.get(key)
            if isinstance(value, str) and value:
                restored[key] = date.fromisoformat(value)
        restored_rows.append(restored)
    return restored_rows


def template_phases(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    roots = [row for row in rows if not row.get("parent_code")]
    root_code = roots[0]["code"] if len(roots) == 1 else None
    phase_rows = [row for row in rows if row.get("parent_code") == root_code] if root_code else roots
    return [
        {
            "code": row["code"],
            "name": row["name"],
            "weight": row.get("weight"),
        }
        for row in phase_rows
        if row.get("code") and row.get("name")
    ]


def build_template_workbook(template: dict[str, Any], rows: list[dict[str, Any]]) -> BytesIO:
    parent_map = {row["code"]: row.get("parent_code") for row in rows if row.get("code")}
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "WBS"
    worksheet.freeze_panes = "A2"

    header_fill = PatternFill("solid", fgColor="1D1D1F")
    header_font = Font(color="FFFFFF", bold=True)
    thin = Side(style="thin", color="D8DCE2")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    worksheet.append([label for _, label in EXCEL_COLUMNS])
    for cell in worksheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border

    for row in rows:
        metadata = normalize_metadata(row.get("metadata"))
        start_date = row.get("start_date")
        finish_date = row.get("finish_date")
        worksheet.append(
            [
                parent_depth(row["code"], parent_map),
                row["code"],
                row.get("parent_code"),
                row["name"],
                row.get("item_type") or "작업",
                row.get("owner"),
                float(row["weight"]) if row.get("weight") is not None else None,
                start_date,
                finish_date,
                metadata.get("deliverable_type"),
                "Y" if metadata.get("inspection_required") else "N",
                metadata.get("progress_formula")
                or ("하위 단계 가중치 합산" if not row.get("parent_code") else "작업 완료율 x 가중치"),
                metadata.get("notes"),
            ]
        )

    for row in worksheet.iter_rows(min_row=2):
        for cell in row:
            cell.border = border
            cell.alignment = Alignment(vertical="center", wrap_text=True)
        row[7].number_format = "yyyy-mm-dd"
        row[8].number_format = "yyyy-mm-dd"

    widths = [8, 18, 18, 30, 14, 16, 10, 14, 14, 18, 12, 24, 28]
    for index, width in enumerate(widths, start=1):
        worksheet.column_dimensions[worksheet.cell(1, index).column_letter].width = width
    worksheet.auto_filter.ref = worksheet.dimensions

    item_type_validation = DataValidation(
        type="list",
        formula1='"프로젝트,단계,산출물,작업,마일스톤,리스크,이슈,변경요청"',
        allow_blank=False,
    )
    inspection_validation = DataValidation(type="list", formula1='"Y,N"', allow_blank=True)
    worksheet.add_data_validation(item_type_validation)
    worksheet.add_data_validation(inspection_validation)
    item_type_validation.add("E2:E1000")
    inspection_validation.add("K2:K1000")

    guide = workbook.create_sheet("Guide")
    guide.append(["Template", template["name"]])
    guide.append(["Key", template["key"]])
    guide.append(["Project Type", template["project_type"]])
    guide.append(["Rule", "작업명은 필수입니다. WBS 코드는 비워두면 레벨과 행 순서 기준으로 자동 생성합니다."])
    guide.column_dimensions["A"].width = 18
    guide.column_dimensions["B"].width = 96
    for row in guide.iter_rows():
        for cell in row:
            cell.alignment = Alignment(vertical="center", wrap_text=True)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output


def build_import_errors_workbook(job: dict[str, Any]) -> BytesIO:
    workbook = Workbook()
    issues = workbook.active
    issues.title = "Issues"
    issues.append(["Type", "Row", "Field", "Code", "Message"])
    for issue_type, entries in (("Error", job.get("errors") or []), ("Warning", job.get("warnings") or [])):
        for issue in entries:
            issues.append(
                [
                    issue_type,
                    issue.get("row"),
                    issue.get("field") or issue.get("parent_code"),
                    issue.get("code") or issue.get("parent_code"),
                    issue.get("message"),
                ]
            )

    diff = workbook.create_sheet("Diff")
    diff.append(["Change", "Code", "Name", "Field", "Before", "After"])
    for item in job.get("diff_rows") or []:
        fields = item.get("fields") or [{}]
        for field in fields:
            diff.append(
                [
                    item.get("change"),
                    item.get("code"),
                    item.get("name"),
                    field.get("field"),
                    field.get("before"),
                    field.get("after"),
                ]
            )

    rows = workbook.create_sheet("Rows")
    rows.append([label for _, label in EXCEL_COLUMNS])
    for row in job.get("preview_rows") or []:
        rows.append([row.get(key) for key, _ in EXCEL_COLUMNS])

    for worksheet in workbook.worksheets:
        for cell in worksheet[1]:
            cell.fill = PatternFill("solid", fgColor="1D1D1F")
            cell.font = Font(color="FFFFFF", bold=True)
            cell.alignment = Alignment(horizontal="center", vertical="center")
        worksheet.freeze_panes = "A2"
        worksheet.auto_filter.ref = worksheet.dimensions
        for column in range(1, worksheet.max_column + 1):
            worksheet.column_dimensions[worksheet.cell(1, column).column_letter].width = 22

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output


async def fetch_template(connection: asyncpg.Connection, template_key: str) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        """
        SELECT key, name, project_type, description, phases
        FROM wbs_templates
        WHERE key = $1
        """,
        template_key,
    )
    return normalize_record(record) if record else None


async def fetch_project(connection: asyncpg.Connection, project_id: UUID) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        """
        SELECT id, name, template_key, owner, status, start_date,
               openproject_project_id, metadata, created_at, updated_at
        FROM wbs_projects
        WHERE id = $1
        """,
        project_id,
    )
    return normalize_record(record) if record else None


async def fetch_template_items(connection: asyncpg.Connection, template_key: str) -> list[dict[str, Any]]:
    records = await connection.fetch(
        """
        SELECT code, parent_code, name, item_type, owner, weight,
               start_date, finish_date, sort_order, metadata
        FROM wbs_template_items
        WHERE template_key = $1
        ORDER BY sort_order, code
        """,
        template_key,
    )
    return [normalize_record(record) for record in records]


async def fetch_project_wbs_items(connection: asyncpg.Connection, project_id: UUID) -> list[dict[str, Any]]:
    records = await connection.fetch(
        """
        SELECT code, parent_code, name, item_type, owner, weight,
               start_date, finish_date, sort_order, metadata
        FROM wbs_project_wbs_items
        WHERE project_id = $1
        ORDER BY sort_order, code
        """,
        project_id,
    )
    return [normalize_record(record) for record in records]


async def replace_project_wbs_items(
    connection: asyncpg.Connection,
    *,
    project_id: UUID,
    rows: list[dict[str, Any]],
    source_import_job_id: UUID | None = None,
) -> None:
    await connection.execute("DELETE FROM wbs_project_wbs_items WHERE project_id = $1", project_id)
    for index, row in enumerate(rows, start=1):
        existing_metadata = normalize_metadata(row.get("metadata"))
        metadata = {
            "deliverable_type": row.get("deliverable_type", existing_metadata.get("deliverable_type")),
            "inspection_required": row.get("inspection_required", existing_metadata.get("inspection_required", False)),
            "progress_formula": row.get("progress_formula")
            or existing_metadata.get("progress_formula")
            or ("하위 단계 가중치 합산" if not row.get("parent_code") else "작업 완료율 x 가중치"),
            "notes": row.get("notes", existing_metadata.get("notes")),
        }
        await connection.execute(
            """
            INSERT INTO wbs_project_wbs_items
              (project_id, code, parent_code, name, item_type, owner, weight,
               start_date, finish_date, sort_order, metadata, source_import_job_id)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
            """,
            project_id,
            row["code"],
            row.get("parent_code"),
            row["name"],
            row.get("item_type") or "작업",
            row.get("owner"),
            row.get("weight"),
            row.get("start_date"),
            row.get("finish_date"),
            index,
            metadata,
            source_import_job_id,
        )


async def replace_template_items(
    connection: asyncpg.Connection,
    *,
    template_key: str,
    template_name: str,
    project_type: str,
    description: str,
    rows: list[dict[str, Any]],
) -> None:
    phases = template_phases(rows)
    await connection.execute(
        """
        INSERT INTO wbs_templates (key, name, project_type, description, phases)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (key) DO UPDATE
        SET name = EXCLUDED.name,
            project_type = EXCLUDED.project_type,
            description = EXCLUDED.description,
            phases = EXCLUDED.phases
        """,
        template_key,
        template_name,
        project_type,
        description,
        phases,
    )
    await connection.execute("DELETE FROM wbs_template_items WHERE template_key = $1", template_key)

    for index, row in enumerate(rows, start=1):
        existing_metadata = normalize_metadata(row.get("metadata"))
        metadata = {
            "deliverable_type": row.get("deliverable_type", existing_metadata.get("deliverable_type")),
            "inspection_required": row.get("inspection_required", existing_metadata.get("inspection_required", False)),
            "progress_formula": row.get("progress_formula")
            or existing_metadata.get("progress_formula")
            or ("하위 단계 가중치 합산" if not row.get("parent_code") else "작업 완료율 x 가중치"),
            "notes": row.get("notes", existing_metadata.get("notes")),
        }
        await connection.execute(
            """
            INSERT INTO wbs_template_items
              (template_key, code, parent_code, name, item_type, owner, weight,
               start_date, finish_date, sort_order, metadata)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
            """,
            template_key,
            row["code"],
            row.get("parent_code"),
            row["name"],
            row.get("item_type") or "작업",
            row.get("owner"),
            row.get("weight"),
            row.get("start_date"),
            row.get("finish_date"),
            index,
            metadata,
        )

    version = await connection.fetchval(
        "SELECT COALESCE(max(version), 0) + 1 FROM wbs_template_versions WHERE template_key = $1",
        template_key,
    )
    await connection.execute(
        """
        INSERT INTO wbs_template_versions
          (template_key, version, template_name, project_type, description,
           item_count, snapshot_rows, metadata)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
        """,
        template_key,
        version,
        template_name,
        project_type,
        description,
        len(rows),
        [serialize_wbs_row(row) for row in rows],
        {"source": "replace_template_items"},
    )


async def prepare_template_import(
    connection: asyncpg.Connection,
    *,
    template_key: str,
    parsed_rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    existing_rows = await fetch_template_items(connection, template_key)
    root_code = root_code_from_rows(existing_rows) or template_code_prefix(template_key)
    rows = assign_missing_wbs_codes(parsed_rows, root_code)
    errors, warnings = validate_wbs_rows(rows)
    warnings = [*warnings, *auto_code_warnings(rows)]
    serialized_rows = [serialize_wbs_row(row) for row in rows]
    diff_rows = build_wbs_diff_rows(existing_rows, rows)
    return rows, errors, warnings, serialized_rows, diff_rows


async def insert_import_job(
    connection: asyncpg.Connection,
    *,
    source_file: str,
    status: str,
    total_rows: int,
    accepted_rows: int,
    rejected_rows: int,
    errors: list[dict[str, Any]],
    warnings: list[dict[str, Any]],
    preview_rows: list[dict[str, Any]],
    diff_rows: list[dict[str, Any]] | None = None,
    template_version: int | None = None,
    template_key: str | None = None,
    template_name: str | None = None,
    project_type: str | None = None,
    description: str | None = None,
    applied: bool = False,
) -> asyncpg.Record:
    return await connection.fetchrow(
        f"""
        INSERT INTO wbs_import_jobs
          (source_file, template_key, template_name, project_type, description,
           status, template_version, total_rows, accepted_rows, rejected_rows,
           errors, warnings, preview_rows, diff_rows, applied_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
           $13::jsonb, $14::jsonb, CASE WHEN $15::boolean THEN now() ELSE NULL END)
        RETURNING {IMPORT_JOB_RETURNING}
        """,
        source_file,
        template_key,
        template_name,
        project_type,
        description,
        status,
        template_version,
        total_rows,
        accepted_rows,
        rejected_rows,
        errors,
        warnings,
        preview_rows,
        diff_rows or [],
        applied,
    )


def sync_error_payload(error: Exception | HTTPException | str) -> dict[str, Any]:
    if isinstance(error, HTTPException):
        return {
            "status_code": error.status_code,
            "detail": error.detail,
        }
    if isinstance(error, str):
        return {"message": error}
    return {
        "type": error.__class__.__name__,
        "message": str(error),
    }


async def insert_sync_run(
    connection: asyncpg.Connection,
    *,
    project_id: UUID,
    mode: str,
    status: str,
    actor: str,
    dry_run: bool,
    create_work_packages: bool,
    validate_payloads: bool,
    total_rows: int = 0,
    pending_work_packages: int = 0,
    synced_work_packages: int = 0,
    created_work_packages: int = 0,
    openproject_project_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = await connection.fetchrow(
        f"""
        WITH inserted AS (
          INSERT INTO wbs_sync_runs
            (project_id, mode, status, actor, engine, dry_run,
             create_work_packages, validate_payloads, total_rows,
             pending_work_packages, synced_work_packages, created_work_packages,
             openproject_project_id, metadata, error, completed_at)
          VALUES
            ($1, $2, $3, $4, 'openproject', $5, $6, $7, $8, $9, $10,
             $11, $12, $13::jsonb, $14::jsonb, now())
          RETURNING *
        )
        SELECT {SYNC_RUN_SELECT}
        FROM inserted s
        JOIN wbs_projects p ON p.id = s.project_id
        """,
        project_id,
        mode,
        status,
        actor,
        dry_run,
        create_work_packages,
        validate_payloads,
        total_rows,
        pending_work_packages,
        synced_work_packages,
        created_work_packages,
        openproject_project_id,
        metadata or {},
        error,
    )
    return normalize_record(record)


def baseline_snapshot_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    snapshot_rows: list[dict[str, Any]] = []
    for row in rows:
        snapshot_rows.append(
            serialize_wbs_row(
                {
                    "code": row.get("code"),
                    "parent_code": row.get("parent_code"),
                    "name": row.get("name"),
                    "item_type": row.get("item_type") or "작업",
                    "owner": row.get("owner"),
                    "weight": row.get("weight"),
                    "start_date": row.get("start_date"),
                    "finish_date": row.get("finish_date"),
                    "sort_order": row.get("sort_order"),
                    "metadata": normalize_metadata(row.get("metadata")),
                }
            )
        )
    return snapshot_rows


def baseline_total_weight(rows: list[dict[str, Any]]) -> float:
    root_weight = next(
        (row.get("weight") for row in rows if not row.get("parent_code") and row.get("weight") is not None),
        None,
    )
    if root_weight is not None:
        return float(root_weight)

    top_level_weights = [
        float(row["weight"])
        for row in rows
        if not row.get("parent_code") and row.get("weight") is not None
    ]
    if top_level_weights:
        return sum(top_level_weights)

    return sum(float(row["weight"]) for row in rows if row.get("weight") is not None)


def baseline_summary(baseline: dict[str, Any] | None) -> dict[str, Any]:
    if not baseline:
        return {
            "locked": False,
            "status": "Unlocked",
        }

    return {
        "locked": baseline.get("status") == "Locked",
        "id": baseline.get("id"),
        "approval_id": baseline.get("approval_id"),
        "version": baseline.get("version"),
        "status": baseline.get("status"),
        "template_key": baseline.get("template_key"),
        "template_name": baseline.get("template_name"),
        "item_count": baseline.get("item_count"),
        "total_weight": baseline.get("total_weight"),
        "locked_at": baseline.get("locked_at"),
        "metadata": normalize_metadata(baseline.get("metadata")),
    }


async def fetch_latest_project_baseline(
    connection: asyncpg.Connection,
    project_id: UUID,
) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"""
        SELECT {BASELINE_SELECT}
        FROM wbs_project_baselines b
        JOIN wbs_projects p ON p.id = b.project_id
        WHERE b.project_id = $1
        ORDER BY b.version DESC
        LIMIT 1
        """,
        project_id,
    )
    return normalize_record(record) if record else None


async def create_project_baseline(
    connection: asyncpg.Connection,
    *,
    project_id: UUID,
    approval_id: UUID,
    template_key: str,
    actor: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    existing = await connection.fetchrow(
        f"""
        SELECT {BASELINE_SELECT}
        FROM wbs_project_baselines b
        JOIN wbs_projects p ON p.id = b.project_id
        WHERE b.approval_id = $1
        """,
        approval_id,
    )
    if existing:
        return normalize_record(existing)

    template = await fetch_template(connection, template_key)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found for baseline")
    rows = template_rows_or_phases(template, await fetch_template_items(connection, template_key))
    snapshot_rows = baseline_snapshot_rows(rows)
    version = await connection.fetchval(
        "SELECT COALESCE(max(version), 0) + 1 FROM wbs_project_baselines WHERE project_id = $1",
        project_id,
    )
    record = await connection.fetchrow(
        f"""
        WITH inserted AS (
          INSERT INTO wbs_project_baselines
            (project_id, approval_id, version, status, template_key, template_name,
             item_count, total_weight, snapshot_rows, metadata)
          VALUES
            ($1, $2, $3, 'Locked', $4, $5, $6, $7, $8::jsonb, $9::jsonb)
          RETURNING *
        )
        SELECT {BASELINE_SELECT}
        FROM inserted b
        JOIN wbs_projects p ON p.id = b.project_id
        """,
        project_id,
        approval_id,
        version,
        template["key"],
        template["name"],
        len(snapshot_rows),
        baseline_total_weight(rows),
        snapshot_rows,
        {
            "locked_by": actor,
            "source": "approval",
            **(metadata or {}),
        },
    )
    return normalize_record(record)


async def record_project_sync_run(
    request: Request,
    *,
    project_id: UUID,
    plan: dict[str, Any],
    payload: ProjectSyncRequest,
    mode: str,
    status: str,
    created_work_packages: int = 0,
    openproject_project_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    summary = normalize_metadata(plan.get("summary"))
    async with get_pool(request).acquire() as connection:
        sync_run = await insert_sync_run(
            connection,
            project_id=project_id,
            mode=mode,
            status=status,
            actor=payload.actor,
            dry_run=payload.dry_run,
            create_work_packages=payload.create_work_packages,
            validate_payloads=payload.validate_payloads,
            total_rows=int(summary.get("total_rows") or 0),
            pending_work_packages=int(summary.get("pending_work_packages") or 0),
            synced_work_packages=int(summary.get("synced_work_packages") or 0),
            created_work_packages=created_work_packages,
            openproject_project_id=openproject_project_id or normalize_metadata(plan.get("openproject")).get("project_id"),
            metadata=metadata,
            error=error,
        )
        await insert_audit_event(
            connection,
            request=request,
            event_type="pm_engine.sync_recorded",
            entity_type="project",
            entity_id=project_id,
            summary=f"PM engine sync {status}",
            metadata={
                "mode": mode,
                "dry_run": payload.dry_run,
                "engine": sync_run.get("engine"),
                "sync_run_id": str(sync_run.get("id")) if sync_run.get("id") else None,
            },
        )
        return sync_run


async def fetch_import_job_for_update(connection: asyncpg.Connection, job_id: UUID) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"""
        SELECT {IMPORT_JOB_RETURNING}
        FROM wbs_import_jobs
        WHERE id = $1
        FOR UPDATE
        """,
        job_id,
    )
    return normalize_record(record) if record else None


def import_job_response(record: asyncpg.Record, *, include_rows: bool = False, row_limit: int = 50) -> dict[str, Any]:
    job = normalize_record(record)
    preview_rows = job.get("preview_rows") or []
    diff_rows = job.get("diff_rows") or []
    job["preview_count"] = len(preview_rows)
    job["diff_count"] = len(diff_rows)
    if include_rows:
        job["rows"] = preview_rows[:row_limit]
        job["diff_rows"] = diff_rows[:row_limit]
    job.pop("preview_rows", None)
    return job


async def fetch_approval(connection: asyncpg.Connection, approval_id: UUID) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"""
        SELECT {APPROVAL_SELECT}
        FROM wbs_approval_requests a
        JOIN wbs_projects p ON p.id = a.project_id
        WHERE a.id = $1
        """,
        approval_id,
    )
    return normalize_record(record) if record else None


async def fetch_approval_for_update(connection: asyncpg.Connection, approval_id: UUID) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"""
        SELECT {APPROVAL_SELECT}
        FROM wbs_approval_requests a
        JOIN wbs_projects p ON p.id = a.project_id
        WHERE a.id = $1
        FOR UPDATE OF a
        """,
        approval_id,
    )
    return normalize_record(record) if record else None


class OpenProjectClient:
    def __init__(
        self,
        base_url: str,
        api_token: str,
        auth_mode: str = "bearer",
        host_header: str = OPENPROJECT_HOST_HEADER,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.auth_mode = auth_mode
        self.host_header = host_header

    def request_options(self) -> dict[str, Any]:
        headers = {"Accept": "application/hal+json", "Content-Type": "application/json"}
        if self.host_header:
            headers["Host"] = self.host_header
        options: dict[str, Any] = {"headers": headers}
        if self.api_token:
            if self.auth_mode == "basic":
                options["auth"] = ("apikey", self.api_token)
            else:
                headers["Authorization"] = f"Bearer {self.api_token}"
        return options

    async def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
                response = await client.request(
                    method,
                    f"{self.base_url}{path}",
                    json=payload,
                    **self.request_options(),
                )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "OpenProject API is unreachable",
                    "base_url": self.base_url,
                    "error": str(exc),
                },
            ) from exc

        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "OpenProject API request failed",
                    "status_code": response.status_code,
                    "response": self.response_detail(response),
                },
            )
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="OpenProject API returned invalid JSON") from exc

    @staticmethod
    def response_detail(response: httpx.Response) -> Any:
        try:
            return response.json()
        except ValueError:
            return response.text[:1000]

    async def probe(
        self,
        *,
        name: str,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        accepted_error_statuses: set[int] | None = None,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": name,
            "method": method,
            "path": path,
            "base_url": self.base_url,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                response = await client.request(
                    method,
                    f"{self.base_url}{path}",
                    json=payload,
                    **self.request_options(),
                )
        except httpx.RequestError as exc:
            return {
                **result,
                "ok": False,
                "status": "fail",
                "message": "OpenProject endpoint is unreachable",
                "error": str(exc),
            }

        result["status_code"] = response.status_code
        accepted_error_statuses = accepted_error_statuses or set()
        if 200 <= response.status_code < 400 or response.status_code in accepted_error_statuses:
            result.update({"ok": True, "status": "pass"})
            if response.content:
                detail = self.response_detail(response)
                if isinstance(detail, dict):
                    result["resource_type"] = detail.get("_type")
                    if detail.get("id"):
                        result["resource_id"] = detail["id"]
                    if detail.get("name"):
                        result["resource_name"] = detail["name"]
                    if response.status_code >= 400:
                        result["message"] = detail.get("message", "Endpoint is reachable")
                        result["response"] = detail
            return result

        return {
            **result,
            "ok": False,
            "status": "fail",
            "message": "OpenProject endpoint returned an error",
            "response": self.response_detail(response),
        }

    async def create_project(self, project: dict[str, Any], identifier: str) -> dict[str, Any]:
        return await self.request(
            "POST",
            "/api/v3/projects",
            {
                "_type": "Project",
                "name": project["name"],
                "identifier": identifier,
                "active": True,
            },
        )

    def build_work_package_payload(
        self,
        *,
        openproject_project_id: str,
        row: dict[str, Any],
        parent_href: str | None = None,
    ) -> dict[str, Any]:
        type_map = parse_json_object(OPENPROJECT_TYPE_MAP_JSON)
        type_id = type_map.get(row.get("item_type") or "") or OPENPROJECT_DEFAULT_TYPE_ID
        links: dict[str, Any] = {
            "project": {"href": f"/api/v3/projects/{openproject_project_id}"},
        }
        if type_id:
            links["type"] = {"href": f"/api/v3/types/{type_id}"}
        if parent_href and OPENPROJECT_SYNC_PARENT_LINKS:
            links["parent"] = {"href": parent_href}

        metadata = normalize_metadata(row.get("metadata"))
        description_lines = [
            f"WBS code: {row['code']}",
            f"Type: {row.get('item_type') or '작업'}",
        ]
        if row.get("owner"):
            description_lines.append(f"Owner: {row['owner']}")
        if row.get("weight") is not None:
            description_lines.append(f"Weight: {row['weight']}")
        if metadata.get("deliverable_type"):
            description_lines.append(f"Deliverable: {metadata['deliverable_type']}")

        payload: dict[str, Any] = {
            "_type": "WorkPackage",
            "subject": f"{row['code']} {row['name']}"[:255],
            "description": {
                "format": "markdown",
                "raw": "\n".join(description_lines),
            },
            "_links": links,
        }
        if row.get("start_date"):
            payload["startDate"] = row["start_date"]
        if row.get("finish_date"):
            payload["dueDate"] = row["finish_date"]

        return payload

    async def validate_work_package_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self.request("POST", "/api/v3/work_packages/form", payload)
        embedded = normalize_metadata(response.get("_embedded"))
        validation_errors = normalize_metadata(embedded.get("validationErrors"))
        if validation_errors:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "OpenProject rejected the work package payload during form validation",
                    "validation_errors": validation_errors,
                },
            )
        return response

    async def create_work_package_from_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request("POST", "/api/v3/work_packages?notify=false", payload)

    async def create_work_package(
        self,
        *,
        openproject_project_id: str,
        row: dict[str, Any],
        parent_href: str | None = None,
    ) -> dict[str, Any]:
        payload = self.build_work_package_payload(
            openproject_project_id=openproject_project_id,
            row=row,
            parent_href=parent_href,
        )
        return await self.create_work_package_from_payload(payload)


def openproject_engine_status() -> dict[str, Any]:
    return {
        "adapter": "openproject",
        "base_url": OPENPROJECT_BASE_URL,
        "host_header_configured": bool(OPENPROJECT_HOST_HEADER),
        "enabled": OPENPROJECT_SYNC_ENABLED,
        "token_configured": bool(OPENPROJECT_API_TOKEN),
        "auth_mode": OPENPROJECT_AUTH_MODE,
        "default_type_configured": bool(OPENPROJECT_DEFAULT_TYPE_ID),
        "type_map_configured": bool(parse_json_object(OPENPROJECT_TYPE_MAP_JSON)),
        "parent_links": OPENPROJECT_SYNC_PARENT_LINKS,
    }


def pm_engine_status(setting_value: dict[str, Any] | None = None) -> dict[str, Any]:
    setting_value = setting_value or {}
    runtime = openproject_engine_status()
    adapter = PM_ENGINE_ADAPTER or setting_value.get("adapter") or runtime["adapter"]
    display_name = "Mock PM Engine" if adapter == "mock" else setting_value.get("display_name") or "OpenProject"
    actual_sync_ready = adapter == "mock" or (runtime["enabled"] and bool(OPENPROJECT_API_TOKEN))
    return {
        **runtime,
        "adapter": adapter,
        "display_name": display_name,
        "provider": runtime["adapter"],
        "mode": setting_value.get("mode") or "ce-api-adapter",
        "dependency_boundary": setting_value.get("dependency_boundary") or "pm-engine-api",
        "actual_sync_control": setting_value.get("actual_sync_control") or "OPENPROJECT_SYNC_ENABLED",
        "capabilities": {
            "preflight": True,
            "dry_run": True,
            "actual_sync": actual_sync_ready,
            "work_package_payload_validation": True,
            "hierarchy_parent_links": runtime["parent_links"],
            "mock_adapter": adapter == "mock",
        },
        "runtime": runtime,
    }


def openproject_preflight_check(name: str, status: str, message: str, **extra: Any) -> dict[str, Any]:
    return {
        "name": name,
        "status": status,
        "ok": status == "pass",
        "message": message,
        **extra,
    }


async def run_openproject_preflight() -> dict[str, Any]:
    if PM_ENGINE_ADAPTER == "mock":
        return {
            "engine": pm_engine_status({"adapter": "mock", "display_name": "Mock PM Engine"}),
            "state": "ready",
            "ready_for_actual_sync": True,
            "checks": [
                openproject_preflight_check(
                    "pm_engine_adapter",
                    "pass",
                    "Mock PM engine adapter is ready for local product validation",
                ),
                openproject_preflight_check(
                    "external_api",
                    "skip",
                    "OpenProject API calls are skipped by the mock adapter",
                ),
            ],
        }

    client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
    checks: list[dict[str, Any]] = []

    api_root_check = await client.probe(
        name="api_root",
        method="GET",
        path="/api/v3",
        accepted_error_statuses={401, 403},
    )
    checks.append(api_root_check)
    checks.append(
        openproject_preflight_check(
            "sync_enabled",
            "pass" if OPENPROJECT_SYNC_ENABLED else "warn",
            "Actual OpenProject sync is enabled"
            if OPENPROJECT_SYNC_ENABLED
            else "Actual OpenProject sync is disabled; dry-run and planning endpoints remain available",
        )
    )
    checks.append(
        openproject_preflight_check(
            "api_token",
            "pass" if OPENPROJECT_API_TOKEN else "warn",
            "OPENPROJECT_API_TOKEN is configured"
            if OPENPROJECT_API_TOKEN
            else "OPENPROJECT_API_TOKEN is not configured; actual sync will be blocked",
        )
    )

    if OPENPROJECT_API_TOKEN:
        checks.append(await client.probe(name="authenticated_user", method="GET", path="/api/v3/users/me"))
    else:
        checks.append(
            openproject_preflight_check(
                "authenticated_user",
                "skip",
                "Skipped because OPENPROJECT_API_TOKEN is not configured",
            )
        )

    failed = any(check.get("status") == "fail" for check in checks)
    api_root_failed = any(check.get("name") == "api_root" and check.get("status") == "fail" for check in checks)
    auth_failed = any(
        check.get("name") == "authenticated_user" and check.get("status") == "fail" for check in checks
    )
    ready = (
        not failed
        and OPENPROJECT_SYNC_ENABLED
        and bool(OPENPROJECT_API_TOKEN)
        and any(check.get("name") == "authenticated_user" and check.get("ok") for check in checks)
    )
    if api_root_failed:
        state = "offline"
    elif auth_failed:
        state = "auth_failed"
    elif failed:
        state = "blocked"
    elif ready:
        state = "ready"
    else:
        state = "dry_run_only"

    return {
        "engine": pm_engine_status(),
        "state": state,
        "ready_for_actual_sync": ready,
        "checks": checks,
    }


def build_openproject_sync_plan(
    project: dict[str, Any],
    template: dict[str, Any],
    rows: list[dict[str, Any]],
    baseline: dict[str, Any] | None = None,
) -> dict[str, Any]:
    project_uuid = str(project["id"])
    identifier = normalize_openproject_identifier(
        f"{project['name']}-{project_uuid[:8]}",
        f"wbs-{project_uuid[:8]}",
    )
    metadata = normalize_metadata(project.get("metadata"))
    engine_metadata = normalize_metadata(metadata.get("pm_engine"))
    synced_work_packages = normalize_metadata(engine_metadata.get("work_packages"))

    planned_rows = []
    for row in rows:
        planned_rows.append(
            {
                "code": row["code"],
                "parent_code": row.get("parent_code"),
                "name": row["name"],
                "item_type": row.get("item_type") or "작업",
                "owner": row.get("owner"),
                "weight": row.get("weight"),
                "subject": f"{row['code']} {row['name']}"[:255],
                "start_date": row.get("start_date"),
                "finish_date": row.get("finish_date"),
                "metadata": normalize_metadata(row.get("metadata")),
                "already_synced": row["code"] in synced_work_packages,
            }
        )

    return {
        "engine": pm_engine_status(),
        "project": project,
        "template": template,
        "wbs_source": project.get("wbs_source", "template"),
        "openproject": {
            "project_id": project.get("openproject_project_id") or engine_metadata.get("project_id"),
            "project_identifier": engine_metadata.get("project_identifier") or identifier,
            "project_already_synced": bool(project.get("openproject_project_id") or engine_metadata.get("project_id")),
        },
        "baseline": baseline_summary(baseline),
        "rows": planned_rows,
        "summary": {
            "total_rows": len(planned_rows),
            "pending_work_packages": len([row for row in planned_rows if not row["already_synced"]]),
            "synced_work_packages": len([row for row in planned_rows if row["already_synced"]]),
        },
    }


def build_openproject_payload_sample(
    project: dict[str, Any],
    rows: list[dict[str, Any]],
) -> dict[str, Any] | None:
    metadata = normalize_metadata(project.get("metadata"))
    engine_metadata = normalize_metadata(metadata.get("pm_engine"))
    work_packages = normalize_metadata(engine_metadata.get("work_packages"))
    openproject_project_id = project.get("openproject_project_id") or engine_metadata.get("project_id")
    sample_project_id = openproject_project_id or "OPENPROJECT_PROJECT_ID"
    href_by_code = {
        code: item.get("href")
        for code, item in work_packages.items()
        if isinstance(item, dict) and item.get("href")
    }
    sample_row = next((row for row in rows if row.get("code") not in work_packages), rows[0] if rows else None)
    if not sample_row:
        return None

    client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
    payload = client.build_work_package_payload(
        openproject_project_id=str(sample_project_id),
        row=sample_row,
        parent_href=href_by_code.get(sample_row.get("parent_code")),
    )
    return {
        "row_code": sample_row["code"],
        "project_id_source": "stored" if openproject_project_id else "placeholder",
        "form_endpoint": "/api/v3/work_packages/form",
        "create_endpoint": "/api/v3/work_packages?notify=false",
        "payload": payload,
    }


def operation_check(
    key: str,
    label: str,
    status: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "status": status,
        "message": message,
        "metadata": metadata or {},
    }


def backup_health_check() -> dict[str, Any]:
    backup_files = sorted(BACKUP_DIR.glob("*.dump"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not backup_files:
        return operation_check(
            "backup_rehearsal",
            "Backup rehearsal",
            "warn",
            f"No PostgreSQL backup found in {BACKUP_DIR}",
            {"backup_dir": str(BACKUP_DIR), "latest_backup": None},
        )

    latest = backup_files[0]
    latest_at = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
    age_hours = round((datetime.now(timezone.utc) - latest_at).total_seconds() / 3600, 1)
    status = "pass" if age_hours <= 168 else "warn"
    message = f"Latest backup {latest.name}, {age_hours}h old"
    return operation_check(
        "backup_rehearsal",
        "Backup rehearsal",
        status,
        message,
        {
            "backup_dir": str(BACKUP_DIR),
            "latest_backup": latest.name,
            "latest_backup_at": latest_at.isoformat(),
            "age_hours": age_hours,
        },
    )


def template_rows_or_phases(template: dict[str, Any], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if rows:
        return rows
    return [
        {
            "code": phase["code"],
            "parent_code": None,
            "name": phase["name"],
            "item_type": "단계",
            "owner": "PMO",
            "weight": phase.get("weight"),
            "start_date": None,
            "finish_date": None,
            "metadata": {},
        }
        for phase in template.get("phases", [])
    ]


async def fetch_project_sync_context(
    request: Request,
    project_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    async with get_pool(request).acquire() as connection:
        project = await fetch_project(connection, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        template = await fetch_template(connection, project["template_key"])
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        project_rows = await fetch_project_wbs_items(connection, project_id)
        rows = project_rows or await fetch_template_items(connection, project["template_key"])
        project["wbs_source"] = "project" if project_rows else "template"

    return project, template, template_rows_or_phases(template, rows)


def prometheus_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def prometheus_metric(name: str, value: int | float, labels: dict[str, str] | None = None) -> str:
    if labels:
        label_text = ",".join(f'{key}="{prometheus_escape(str(label_value))}"' for key, label_value in labels.items())
        return f"{name}{{{label_text}}} {value}"
    return f"{name} {value}"


@app.get("/health")
async def health(request: Request) -> dict[str, str]:
    async with get_pool(request).acquire() as connection:
        await connection.fetchval("SELECT 1")
    return {
        "status": "ok",
        "database": "postgresql",
        "openproject_base_url": OPENPROJECT_BASE_URL,
    }


@app.post("/api/auth/login")
async def login(payload: LoginRequest, request: Request) -> dict[str, Any]:
    normalized_email = payload.email.strip().lower()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)
    token = secrets.token_urlsafe(32)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            await connection.execute("DELETE FROM wbs_user_sessions WHERE expires_at <= now()")
            user_record = await connection.fetchrow(
                f"""
                SELECT {USER_SELECT}, password_hash
                FROM wbs_users
                WHERE email = $1
                """,
                normalized_email,
            )
            password_ok = bool(
                user_record
                and user_record["status"] == "Active"
                and not (user_record["locked_until"] and user_record["locked_until"] > datetime.now(timezone.utc))
                and await connection.fetchval(
                    "SELECT $1 = crypt($2, $1)",
                    user_record["password_hash"],
                    payload.password,
                )
            )

            if user_record and user_record["locked_until"] and user_record["locked_until"] > datetime.now(timezone.utc):
                await insert_audit_event(
                    connection,
                    event_type="auth.login_locked",
                    entity_type="user",
                    entity_id=user_record["id"],
                    summary="Login blocked because account is locked",
                    metadata={"email": normalized_email, "locked_until": user_record["locked_until"].isoformat()},
                    actor_email=normalized_email,
                    actor_role=user_record["role"],
                )
                raise HTTPException(status_code=423, detail="Account is temporarily locked")

            if not password_ok:
                failed_count = int(user_record["failed_login_count"] or 0) + 1 if user_record else 1
                locked_until = (
                    datetime.now(timezone.utc) + timedelta(minutes=LOGIN_LOCK_MINUTES)
                    if user_record and failed_count >= LOGIN_FAILURE_LIMIT
                    else None
                )
                if user_record:
                    await connection.execute(
                        """
                        UPDATE wbs_users
                        SET failed_login_count = $2,
                            locked_until = $3,
                            updated_at = now()
                        WHERE id = $1
                        """,
                        user_record["id"],
                        failed_count,
                        locked_until,
                    )
                await insert_audit_event(
                    connection,
                    event_type="auth.login_failed",
                    entity_type="user",
                    entity_id=user_record["id"] if user_record else normalized_email,
                    summary="Login failed",
                    metadata={
                        "email": normalized_email,
                        "failed_login_count": failed_count,
                        "locked_until": locked_until.isoformat() if locked_until else None,
                    },
                    actor_email=normalized_email,
                    actor_role=user_record["role"] if user_record else None,
                )
                raise HTTPException(status_code=401, detail="Invalid email or password")

            await connection.execute(
                """
                UPDATE wbs_users
                SET last_login_at = now(),
                    failed_login_count = 0,
                    locked_until = NULL,
                    updated_at = now()
                WHERE id = $1
                """,
                user_record["id"],
            )
            await connection.execute(
                """
                INSERT INTO wbs_user_sessions (token, user_id, expires_at)
                VALUES ($1, $2, $3)
                """,
                token,
                user_record["id"],
                expires_at,
            )
            updated_user = await connection.fetchrow(
                f"SELECT {USER_SELECT} FROM wbs_users WHERE id = $1",
                user_record["id"],
            )
            await insert_audit_event(
                connection,
                event_type="auth.login",
                entity_type="user",
                entity_id=user_record["id"],
                summary="User logged in",
                actor=user_response(updated_user),
            )

    return {
        "token": token,
        "expires_at": expires_at.isoformat(),
        "user": user_response(updated_user),
    }


@app.get("/api/auth/me")
async def current_user(request: Request) -> dict[str, Any]:
    return {"user": user_response(request.state.user)}


@app.post("/api/auth/logout")
async def logout(request: Request) -> dict[str, str]:
    token = auth_token_from_request(request)
    if token:
        async with get_pool(request).acquire() as connection:
            await connection.execute("DELETE FROM wbs_user_sessions WHERE token = $1", token)
            await insert_audit_event(
                connection,
                request=request,
                event_type="auth.logout",
                entity_type="user",
                entity_id=request.state.user["id"],
                summary="User logged out",
            )
    return {"status": "ok"}


@app.post("/api/auth/password")
async def change_password(payload: PasswordChangeRequest, request: Request) -> dict[str, Any]:
    token = auth_token_from_request(request)
    current = request.state.user

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            password_ok = await connection.fetchval(
                """
                SELECT password_hash = crypt($2, password_hash)
                FROM wbs_users
                WHERE id = $1 AND status = 'Active'
                """,
                safe_uuid(current["id"]),
                payload.current_password,
            )
            if not password_ok:
                await insert_audit_event(
                    connection,
                    request=request,
                    event_type="auth.password_change_failed",
                    entity_type="user",
                    entity_id=current["id"],
                    summary="Password change failed",
                    metadata={"reason": "current_password_mismatch"},
                )
                raise HTTPException(status_code=401, detail="Current password is invalid")

            updated = await connection.fetchrow(
                f"""
                UPDATE wbs_users
                SET password_hash = crypt($2, gen_salt('bf')),
                    must_change_password = false,
                    password_changed_at = now(),
                    updated_at = now()
                WHERE id = $1
                RETURNING {USER_SELECT}
                """,
                safe_uuid(current["id"]),
                payload.new_password,
            )
            if token:
                await connection.execute(
                    "DELETE FROM wbs_user_sessions WHERE user_id = $1 AND token <> $2",
                    safe_uuid(current["id"]),
                    token,
                )
            await insert_audit_event(
                connection,
                request=request,
                event_type="auth.password_changed",
                entity_type="user",
                entity_id=current["id"],
                summary="Password changed",
                metadata={"other_sessions_revoked": True},
            )

    return {"status": "ok", "user": user_response(updated)}


@app.get("/api/users")
async def list_users(request: Request) -> list[dict[str, Any]]:
    require_admin_role(request)
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            """
            SELECT u.id, u.email, u.display_name, u.role, u.status,
                   u.failed_login_count, u.locked_until, u.must_change_password,
                   u.last_login_at, u.password_changed_at, u.created_at, u.updated_at,
                   count(s.token)::integer AS active_sessions
            FROM wbs_users u
            LEFT JOIN wbs_user_sessions s
              ON s.user_id = u.id
             AND s.expires_at > now()
            GROUP BY u.id
            ORDER BY
              CASE u.role WHEN 'admin' THEN 0 WHEN 'pmo' THEN 1 ELSE 2 END,
              u.email
            """
        )
    return [managed_user_response(record) for record in records]


@app.post("/api/users", status_code=201)
async def create_user(payload: UserCreate, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    normalized_email = payload.email.strip().lower()
    role = validate_user_role(payload.role)
    status = validate_user_status(payload.status)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            email_exists = await connection.fetchval(
                "SELECT EXISTS (SELECT 1 FROM wbs_users WHERE email = $1)",
                normalized_email,
            )
            if email_exists:
                raise HTTPException(status_code=409, detail="User email already exists")
            record = await connection.fetchrow(
                """
                INSERT INTO wbs_users
                  (email, display_name, role, password_hash, status, must_change_password)
                VALUES
                  ($1, $2, $3, crypt($4, gen_salt('bf')), $5, $6)
                RETURNING id, email, display_name, role, status, failed_login_count,
                          locked_until, must_change_password, last_login_at,
                          password_changed_at, created_at, updated_at,
                          0::integer AS active_sessions
                """,
                normalized_email,
                payload.display_name.strip(),
                role,
                payload.password,
                status,
                payload.must_change_password,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="user.created",
                entity_type="user",
                entity_id=record["id"],
                summary=f"User created: {normalized_email}",
                metadata={
                    "role": role,
                    "status": status,
                    "must_change_password": payload.must_change_password,
                },
            )

    return managed_user_response(record)


@app.patch("/api/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, request: Request) -> dict[str, Any]:
    current = require_admin_role(request)
    parsed_id = safe_uuid(user_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid user id")

    role = validate_user_role(payload.role) if payload.role is not None else None
    status = validate_user_status(payload.status) if payload.status is not None else None
    display_name = payload.display_name.strip() if payload.display_name is not None else None

    if parsed_id == safe_uuid(current["id"]):
        if role and role != "admin":
            raise HTTPException(status_code=400, detail="Cannot remove your own admin role")
        if status and status != "Active":
            raise HTTPException(status_code=400, detail="Cannot suspend your own account")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            existing = await connection.fetchrow(
                "SELECT id, email, display_name, role, status FROM wbs_users WHERE id = $1 FOR UPDATE",
                parsed_id,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="User not found")

            record = await connection.fetchrow(
                """
                UPDATE wbs_users
                SET display_name = COALESCE($2, display_name),
                    role = COALESCE($3, role),
                    status = COALESCE($4, status),
                    must_change_password = COALESCE($6, CASE WHEN $5::text IS NULL THEN must_change_password ELSE true END),
                    password_hash = CASE
                      WHEN $5::text IS NULL THEN password_hash
                      ELSE crypt($5, gen_salt('bf'))
                    END,
                    password_changed_at = CASE
                      WHEN $5::text IS NULL THEN password_changed_at
                      ELSE now()
                    END,
                    updated_at = now()
                WHERE id = $1
                RETURNING id, email, display_name, role, status, failed_login_count,
                          locked_until, must_change_password, last_login_at,
                          password_changed_at, created_at, updated_at,
                          0::integer AS active_sessions
                """,
                parsed_id,
                display_name,
                role,
                status,
                payload.password,
                payload.must_change_password,
            )
            if status and status != "Active":
                await connection.execute("DELETE FROM wbs_user_sessions WHERE user_id = $1", parsed_id)
            await insert_audit_event(
                connection,
                request=request,
                event_type="user.updated",
                entity_type="user",
                entity_id=parsed_id,
                summary=f"User updated: {existing['email']}",
                metadata={
                    "display_name_changed": display_name is not None and display_name != existing["display_name"],
                    "role_changed": role is not None and role != existing["role"],
                    "status_changed": status is not None and status != existing["status"],
                    "password_changed": payload.password is not None,
                    "must_change_password": payload.must_change_password,
                },
            )

    return managed_user_response(record)


@app.post("/api/users/{user_id}/sessions/revoke")
async def revoke_user_sessions(user_id: str, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    parsed_id = safe_uuid(user_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid user id")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            user_exists = await connection.fetchval("SELECT EXISTS (SELECT 1 FROM wbs_users WHERE id = $1)", parsed_id)
            if not user_exists:
                raise HTTPException(status_code=404, detail="User not found")
            deleted = await connection.fetchval(
                """
                WITH deleted AS (
                  DELETE FROM wbs_user_sessions
                  WHERE user_id = $1
                  RETURNING token
                )
                SELECT count(*) FROM deleted
                """,
                parsed_id,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="user.sessions_revoked",
                entity_type="user",
                entity_id=parsed_id,
                summary="User sessions revoked",
                metadata={"revoked_sessions": int(deleted or 0)},
            )

    return {"status": "ok", "revoked_sessions": int(deleted or 0)}


@app.get("/api/audit-events")
async def list_audit_events(
    request: Request,
    limit: int = 50,
    event_type: str | None = None,
    actor_email: str | None = None,
    entity_type: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    require_roles(request, {"admin", "pmo"})
    bounded_limit = max(1, min(limit, 100))

    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            f"""
            SELECT {AUDIT_SELECT}
            FROM wbs_audit_events
            WHERE ($1::text IS NULL OR event_type = $1)
              AND ($2::text IS NULL OR actor_email = $2)
              AND ($3::text IS NULL OR entity_type = $3)
              AND (
                $4::text IS NULL
                OR summary ILIKE '%' || $4 || '%'
                OR event_type ILIKE '%' || $4 || '%'
                OR entity_id ILIKE '%' || $4 || '%'
              )
            ORDER BY created_at DESC
            LIMIT $5
            """,
            event_type,
            actor_email.strip().lower() if actor_email else None,
            entity_type,
            search.strip() if search else None,
            bounded_limit,
        )

    return [audit_response(record) for record in records]


@app.get("/api/settings")
async def list_settings(request: Request) -> dict[str, Any]:
    require_roles(request, {"admin", "pmo"})
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            f"""
            SELECT {SETTING_SELECT}
            FROM wbs_system_settings
            ORDER BY category, key
            """
        )

    settings = [setting_response(record) for record in records]
    pm_engine_setting = next((setting for setting in settings if setting["key"] == "pm_engine"), None)
    return {
        "settings": settings,
        "pm_engine": pm_engine_status(pm_engine_setting.get("value") if pm_engine_setting else None),
    }


@app.put("/api/settings/{setting_key}")
async def update_setting(setting_key: str, payload: SettingUpdate, request: Request) -> dict[str, Any]:
    current = require_admin_role(request)
    key = setting_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Setting key is required")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            existing = await connection.fetchrow(
                f"SELECT {SETTING_SELECT} FROM wbs_system_settings WHERE key = $1 FOR UPDATE",
                key,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="Setting not found")
            record = await connection.fetchrow(
                f"""
                UPDATE wbs_system_settings
                SET value = $2::jsonb,
                    updated_by = $3,
                    updated_at = now()
                WHERE key = $1
                RETURNING {SETTING_SELECT}
                """,
                key,
                payload.value,
                safe_uuid(current["id"]),
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="setting.updated",
                entity_type="setting",
                entity_id=key,
                summary=f"Setting updated: {key}",
                metadata={"category": existing["category"]},
            )

    setting = setting_response(record)
    return {
        "setting": setting,
        "pm_engine": pm_engine_status(setting["value"]) if key == "pm_engine" else None,
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics(request: Request) -> PlainTextResponse:
    pool = get_pool(request)
    database_up = 1

    try:
        async with pool.acquire() as connection:
            await connection.fetchval("SELECT 1")
            project_count = await connection.fetchval("SELECT count(*) FROM wbs_projects")
            template_count = await connection.fetchval("SELECT count(*) FROM wbs_templates")
            approval_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_approval_requests
                GROUP BY status
                """
            )
            import_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_import_jobs
                GROUP BY status
                """
            )
            project_status_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_projects
                GROUP BY status
                """
            )
            sync_run_rows = await connection.fetch(
                """
                SELECT mode, status, count(*) AS count
                FROM wbs_sync_runs
                GROUP BY mode, status
                """
            )
            baseline_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_project_baselines
                GROUP BY status
                """
            )
    except Exception:
        database_up = 0
        project_count = 0
        template_count = 0
        approval_rows = []
        import_rows = []
        project_status_rows = []
        sync_run_rows = []
        baseline_rows = []

    lines = [
        "# HELP wbs_api_up WBS extension API availability.",
        "# TYPE wbs_api_up gauge",
        prometheus_metric("wbs_api_up", 1),
        "# HELP wbs_database_up PostgreSQL availability from the WBS API.",
        "# TYPE wbs_database_up gauge",
        prometheus_metric("wbs_database_up", database_up),
        "# HELP wbs_projects_total Number of WBS projects.",
        "# TYPE wbs_projects_total gauge",
        prometheus_metric("wbs_projects_total", project_count),
        "# HELP wbs_templates_total Number of WBS templates.",
        "# TYPE wbs_templates_total gauge",
        prometheus_metric("wbs_templates_total", template_count),
        "# HELP wbs_db_pool_connections Asyncpg pool connections by state.",
        "# TYPE wbs_db_pool_connections gauge",
        prometheus_metric("wbs_db_pool_connections", pool.get_size(), {"state": "total"}),
        prometheus_metric("wbs_db_pool_connections", pool.get_idle_size(), {"state": "idle"}),
        "# HELP wbs_project_status_total Number of WBS projects by status.",
        "# TYPE wbs_project_status_total gauge",
    ]

    lines.extend(
        prometheus_metric("wbs_project_status_total", row["count"], {"status": row["status"]})
        for row in project_status_rows
    )
    lines.extend(
        [
            "# HELP wbs_approval_requests_total Number of approval requests by status.",
            "# TYPE wbs_approval_requests_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric("wbs_approval_requests_total", row["count"], {"status": row["status"]})
        for row in approval_rows
    )
    lines.extend(
        [
            "# HELP wbs_import_jobs_total Number of Excel import jobs by status.",
            "# TYPE wbs_import_jobs_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric("wbs_import_jobs_total", row["count"], {"status": row["status"]})
        for row in import_rows
    )
    lines.extend(
        [
            "# HELP wbs_sync_runs_total Number of OpenProject sync runs by mode and status.",
            "# TYPE wbs_sync_runs_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric(
            "wbs_sync_runs_total",
            row["count"],
            {"mode": row["mode"], "status": row["status"]},
        )
        for row in sync_run_rows
    )
    lines.extend(
        [
            "# HELP wbs_project_baselines_total Number of WBS project baselines by status.",
            "# TYPE wbs_project_baselines_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric("wbs_project_baselines_total", row["count"], {"status": row["status"]})
        for row in baseline_rows
    )

    return PlainTextResponse(
        "\n".join(lines) + "\n",
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@app.get("/api/templates")
async def list_templates(request: Request) -> list[dict[str, Any]]:
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            """
            SELECT t.key, t.name, t.project_type, t.description, t.phases,
                   count(i.id)::integer AS item_count
            FROM wbs_templates t
            LEFT JOIN wbs_template_items i ON i.template_key = t.key
            GROUP BY t.key, t.name, t.project_type, t.description, t.phases
            ORDER BY t.project_type, t.name
            """
        )
    return [normalize_record(record) for record in records]


@app.get("/api/projects")
async def list_projects(request: Request) -> list[dict[str, Any]]:
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            """
            SELECT id, name, template_key, owner, status, start_date,
                   openproject_project_id, metadata, created_at, updated_at
            FROM wbs_projects
            ORDER BY created_at DESC
            LIMIT 50
            """
        )
    return [normalize_record(record) for record in records]


@app.post("/api/projects", status_code=201)
async def create_project(payload: ProjectCreate, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    start_date = payload.start_date or date.today()
    metadata = {
        "created_by": "wbs-portal",
        "sync_target": "openproject",
        "strategy": "community-edition-extension-layer",
    }

    async with get_pool(request).acquire() as connection:
        template_exists = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM wbs_templates WHERE key = $1)",
            payload.template_key,
        )
        if not template_exists:
            raise HTTPException(status_code=404, detail="Template not found")

        record = await connection.fetchrow(
            """
            INSERT INTO wbs_projects
              (name, template_key, owner, status, start_date, metadata)
            VALUES
              ($1, $2, $3, 'Draft', $4, $5::jsonb)
            RETURNING id, name, template_key, owner, status, start_date,
                      openproject_project_id, metadata, created_at, updated_at
            """,
            payload.name,
            payload.template_key,
            payload.owner,
            start_date,
            metadata,
        )
        await insert_audit_event(
            connection,
            request=request,
            event_type="project.created",
            entity_type="project",
            entity_id=record["id"],
            summary=f"Project created: {payload.name}",
            metadata={"template_key": payload.template_key, "owner": payload.owner},
        )

    return normalize_record(record)


@app.patch("/api/projects/{project_id}/status")
async def update_project_status(project_id: str, payload: ProjectStatusUpdate, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    target_status = validate_project_status(payload.status)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow(
                """
                SELECT id, name, template_key, owner, status, start_date,
                       openproject_project_id, metadata, created_at, updated_at
                FROM wbs_projects
                WHERE id = $1
                FOR UPDATE
                """,
                parsed_id,
            )
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            ensure_project_transition(project["status"], target_status)
            record = await connection.fetchrow(
                """
                UPDATE wbs_projects
                SET status = $2,
                    updated_at = now()
                WHERE id = $1
                RETURNING id, name, template_key, owner, status, start_date,
                          openproject_project_id, metadata, created_at, updated_at
                """,
                parsed_id,
                target_status,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="project.status_changed",
                entity_type="project",
                entity_id=parsed_id,
                summary=f"Project status changed: {project['status']} -> {target_status}",
                metadata={"comment": payload.comment},
            )

    return normalize_record(record)


@app.get("/api/pm-engine")
async def pm_engine() -> dict[str, Any]:
    return pm_engine_status()


@app.get("/api/pm-engine/preflight")
async def pm_engine_preflight() -> dict[str, Any]:
    return await run_openproject_preflight()


@app.get("/api/projects/{project_id}/sync-plan")
async def project_sync_plan(project_id: str, request: Request) -> dict[str, Any]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    project, template, rows = await fetch_project_sync_context(request, parsed_id)
    async with get_pool(request).acquire() as connection:
        baseline = await fetch_latest_project_baseline(connection, parsed_id)

    return build_openproject_sync_plan(project, template, rows, baseline)


@app.get("/api/projects/{project_id}/baseline")
async def project_baseline(project_id: str, request: Request) -> dict[str, Any]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    async with get_pool(request).acquire() as connection:
        project_exists = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM wbs_projects WHERE id = $1)",
            parsed_id,
        )
        if not project_exists:
            raise HTTPException(status_code=404, detail="Project not found")
        baseline = await fetch_latest_project_baseline(connection, parsed_id)

    return {
        **baseline_summary(baseline),
        "snapshot_rows": baseline.get("snapshot_rows") if baseline else [],
    }


@app.get("/api/projects/{project_id}/sync-runs")
async def list_project_sync_runs(project_id: str, request: Request, limit: int = 10) -> list[dict[str, Any]]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    limit = max(1, min(limit, 50))
    async with get_pool(request).acquire() as connection:
        project_exists = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM wbs_projects WHERE id = $1)",
            parsed_id,
        )
        if not project_exists:
            raise HTTPException(status_code=404, detail="Project not found")

        records = await connection.fetch(
            f"""
            SELECT {SYNC_RUN_SELECT}
            FROM wbs_sync_runs s
            JOIN wbs_projects p ON p.id = s.project_id
            WHERE s.project_id = $1
            ORDER BY s.started_at DESC
            LIMIT $2
            """,
            parsed_id,
            limit,
        )

    return [normalize_record(record) for record in records]


@app.get("/api/projects/{project_id}/sync-preflight")
async def project_sync_preflight(project_id: str, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    project, template, rows = await fetch_project_sync_context(request, parsed_id)
    async with get_pool(request).acquire() as connection:
        baseline = await fetch_latest_project_baseline(connection, parsed_id)
    plan = build_openproject_sync_plan(project, template, rows, baseline)
    preflight = await run_openproject_preflight()

    return {
        "status": "Preflight",
        "preflight": preflight,
        **plan,
        "payload_sample": build_openproject_payload_sample(project, rows),
    }


@app.post("/api/projects/{project_id}/sync")
async def sync_project_to_engine(
    project_id: str,
    request: Request,
    payload: ProjectSyncRequest = ProjectSyncRequest(),
) -> dict[str, Any]:
    require_mutating_role(request)
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    project, template, rows = await fetch_project_sync_context(request, parsed_id)
    async with get_pool(request).acquire() as connection:
        baseline = await fetch_latest_project_baseline(connection, parsed_id)
    plan = build_openproject_sync_plan(project, template, rows, baseline)
    if payload.dry_run:
        audit_run = await record_project_sync_run(
            request,
            project_id=parsed_id,
            plan=plan,
            payload=payload,
            mode="dry_run",
            status="DryRun",
            metadata={
                "source": "api",
                "ready_for_actual_sync": OPENPROJECT_SYNC_ENABLED and bool(OPENPROJECT_API_TOKEN),
            },
        )
        return {"status": "DryRun", **plan, "audit": audit_run}

    ensure_project_status_allowed(project, {ACTUAL_SYNC_REQUIRED_STATUS}, "Actual sync")
    if not baseline_summary(baseline).get("locked"):
        error = HTTPException(status_code=409, detail="Actual sync requires a locked WBS baseline")
        await record_project_sync_run(
            request,
            project_id=parsed_id,
            plan=plan,
            payload=payload,
            mode="actual",
            status="Blocked",
            metadata={"source": "api", "blocked_reason": "baseline_unlocked"},
            error=sync_error_payload(error),
        )
        raise error

    if PM_ENGINE_ADAPTER == "mock":
        metadata = normalize_metadata(project.get("metadata"))
        engine_metadata = normalize_metadata(metadata.get("pm_engine"))
        mock_project_id = engine_metadata.get("project_id") or f"mock-{str(parsed_id)[:8]}"
        work_packages = {
            row["code"]: {
                "id": f"mock-wp-{index}",
                "href": f"/mock/work_packages/{index}",
                "subject": row["subject"],
                "synced_at": utc_now_iso(),
            }
            for index, row in enumerate(plan["rows"], start=1)
        }
        engine_metadata.update(
            {
                "adapter": "mock",
                "project_id": mock_project_id,
                "project_identifier": plan["openproject"]["project_identifier"],
                "work_packages": work_packages,
                "last_sync_at": utc_now_iso(),
            }
        )
        metadata["pm_engine"] = engine_metadata
        async with get_pool(request).acquire() as connection:
            record = await connection.fetchrow(
                """
                UPDATE wbs_projects
                SET status = 'Synced',
                    openproject_project_id = $2,
                    metadata = $3::jsonb,
                    updated_at = now()
                WHERE id = $1
                RETURNING id, name, template_key, owner, status, start_date,
                          openproject_project_id, metadata, created_at, updated_at
                """,
                parsed_id,
                mock_project_id,
                metadata,
            )
        audit_run = await record_project_sync_run(
            request,
            project_id=parsed_id,
            plan=plan,
            payload=payload,
            mode="actual",
            status="Synced",
            created_work_packages=len(work_packages),
            openproject_project_id=mock_project_id,
            metadata={"source": "mock_adapter", "known_work_packages": len(work_packages)},
        )
        return {
            "status": "Synced",
            "engine": pm_engine_status({"adapter": "mock", "display_name": "Mock PM Engine"}),
            "project": normalize_record(record),
            "openproject": {
                "project_id": mock_project_id,
                "project_identifier": engine_metadata.get("project_identifier"),
                "project_href": None,
            },
            "summary": {
                "created_work_packages": len(work_packages),
                "known_work_packages": len(work_packages),
                "total_rows": len(rows),
                "payload_validation": False,
            },
            "created_work_packages": list(work_packages.values()),
            "audit": audit_run,
        }

    if not OPENPROJECT_SYNC_ENABLED:
        error = HTTPException(
            status_code=400,
            detail="OpenProject sync is disabled. Set OPENPROJECT_SYNC_ENABLED=true to execute.",
        )
        await record_project_sync_run(
            request,
            project_id=parsed_id,
            plan=plan,
            payload=payload,
            mode="actual",
            status="Blocked",
            metadata={"source": "api", "blocked_reason": "sync_disabled"},
            error=sync_error_payload(error),
        )
        raise error
    if not OPENPROJECT_API_TOKEN:
        error = HTTPException(status_code=400, detail="OPENPROJECT_API_TOKEN is required for OpenProject sync.")
        await record_project_sync_run(
            request,
            project_id=parsed_id,
            plan=plan,
            payload=payload,
            mode="actual",
            status="Blocked",
            metadata={"source": "api", "blocked_reason": "missing_token"},
            error=sync_error_payload(error),
        )
        raise error

    client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
    metadata = normalize_metadata(project.get("metadata"))
    engine_metadata = normalize_metadata(metadata.get("pm_engine"))
    work_packages = normalize_metadata(engine_metadata.get("work_packages"))
    openproject_project_id = project.get("openproject_project_id") or engine_metadata.get("project_id")
    project_identifier = engine_metadata.get("project_identifier") or plan["openproject"]["project_identifier"]

    if payload.force_project_create or not openproject_project_id:
        created_project = await client.create_project(project, project_identifier)
        openproject_project_id = str(created_project.get("id") or "").strip()
        if not openproject_project_id:
            raise HTTPException(status_code=502, detail="OpenProject project response did not include an id")
        engine_metadata["project_id"] = openproject_project_id
        engine_metadata["project_identifier"] = created_project.get("identifier") or project_identifier
        engine_metadata["project_href"] = normalize_metadata(created_project.get("_links")).get("self", {}).get("href")
        engine_metadata["project_created_at"] = utc_now_iso()

    created_work_packages: list[dict[str, Any]] = []
    if payload.create_work_packages:
        href_by_code = {
            code: item.get("href")
            for code, item in work_packages.items()
            if isinstance(item, dict) and item.get("href")
        }
        for row in rows:
            code = row["code"]
            if code in work_packages:
                continue
            parent_href = href_by_code.get(row.get("parent_code"))
            work_package_payload = client.build_work_package_payload(
                openproject_project_id=openproject_project_id,
                row=row,
                parent_href=parent_href,
            )
            if payload.validate_payloads:
                await client.validate_work_package_payload(work_package_payload)
            created_work_package = await client.create_work_package_from_payload(work_package_payload)
            work_package_id = str(created_work_package.get("id") or "").strip()
            work_package_href = normalize_metadata(created_work_package.get("_links")).get("self", {}).get("href")
            work_packages[code] = {
                "id": work_package_id,
                "href": work_package_href,
                "subject": created_work_package.get("subject") or f"{code} {row['name']}",
                "synced_at": utc_now_iso(),
            }
            if work_package_href:
                href_by_code[code] = work_package_href
            created_work_packages.append(
                {
                    "code": code,
                    "id": work_package_id,
                    "href": work_package_href,
                    "subject": work_packages[code]["subject"],
                }
            )

    engine_metadata["adapter"] = "openproject"
    engine_metadata["base_url"] = OPENPROJECT_BASE_URL
    engine_metadata["work_packages"] = work_packages
    engine_metadata["last_sync_at"] = utc_now_iso()
    metadata["pm_engine"] = engine_metadata

    async with get_pool(request).acquire() as connection:
        record = await connection.fetchrow(
            """
            UPDATE wbs_projects
            SET status = 'Synced',
                openproject_project_id = $2,
                metadata = $3::jsonb,
                updated_at = now()
            WHERE id = $1
            RETURNING id, name, template_key, owner, status, start_date,
                      openproject_project_id, metadata, created_at, updated_at
            """,
            parsed_id,
            openproject_project_id,
            metadata,
        )

    updated_project = normalize_record(record)
    audit_run = await record_project_sync_run(
        request,
        project_id=parsed_id,
        plan=plan,
        payload=payload,
        mode="actual",
        status="Synced",
        created_work_packages=len(created_work_packages),
        openproject_project_id=openproject_project_id,
        metadata={
            "source": "api",
            "known_work_packages": len(work_packages),
            "project_identifier": engine_metadata.get("project_identifier"),
            "project_href": engine_metadata.get("project_href"),
        },
    )
    return {
        "status": "Synced",
        "engine": pm_engine_status(),
        "project": updated_project,
        "openproject": {
            "project_id": openproject_project_id,
            "project_identifier": engine_metadata.get("project_identifier"),
            "project_href": engine_metadata.get("project_href"),
        },
        "summary": {
            "created_work_packages": len(created_work_packages),
            "known_work_packages": len(work_packages),
            "total_rows": len(rows),
            "payload_validation": payload.validate_payloads,
        },
        "created_work_packages": created_work_packages,
        "audit": audit_run,
    }


@app.get("/api/approvals")
async def list_approvals(request: Request) -> list[dict[str, Any]]:
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            f"""
            SELECT {APPROVAL_SELECT}
            FROM wbs_approval_requests a
            JOIN wbs_projects p ON p.id = a.project_id
            ORDER BY
              CASE a.status
                WHEN 'Pending' THEN 0
                WHEN 'Approved' THEN 1
                WHEN 'Rejected' THEN 2
                ELSE 3
              END,
              a.created_at DESC
            LIMIT 50
            """
        )
    return [normalize_record(record) for record in records]


@app.post("/api/approvals", status_code=201)
async def create_approval(payload: ApprovalCreate, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow(
                """
                SELECT id, name, status, template_key
                FROM wbs_projects
                WHERE id = $1
                FOR UPDATE
                """,
                payload.project_id,
            )
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            ensure_project_status_allowed(project, APPROVAL_ALLOWED_PROJECT_STATUSES, "Approval request")

            pending_exists = await connection.fetchval(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM wbs_approval_requests
                  WHERE project_id = $1 AND status = 'Pending'
                )
                """,
                payload.project_id,
            )
            if pending_exists:
                raise HTTPException(status_code=409, detail="Project already has a pending approval")

            title = payload.title or f"{project['name']} WBS baseline approval"
            approval_status = "Approved" if payload.auto_approve_internal else "Pending"
            project_status = "Approved" if payload.auto_approve_internal else "Review"
            decision_comment = "Auto-approved internal PMO baseline" if payload.auto_approve_internal else None
            approval_metadata = {
                **payload.metadata,
                "approval_mode": "auto_internal" if payload.auto_approve_internal else "manual",
            }
            record = await connection.fetchrow(
                f"""
                INSERT INTO wbs_approval_requests
                  (project_id, title, request_type, status, requester, reviewer,
                   due_date, decision_comment, metadata, decided_at)
                VALUES
                  ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb,
                   CASE WHEN $4 = 'Approved' THEN now() ELSE NULL END)
                RETURNING id
                """,
                payload.project_id,
                title,
                payload.request_type,
                approval_status,
                payload.requester,
                payload.reviewer,
                payload.due_date,
                decision_comment,
                approval_metadata,
            )
            await connection.execute(
                """
                UPDATE wbs_projects
                SET status = $2,
                    updated_at = now()
                WHERE id = $1
                """,
                payload.project_id,
                project_status,
            )
            approval = await fetch_approval(connection, record["id"])
            if payload.auto_approve_internal:
                baseline = await create_project_baseline(
                    connection,
                    project_id=payload.project_id,
                    approval_id=record["id"],
                    template_key=project["template_key"],
                    actor=payload.reviewer or payload.requester,
                    metadata={
                        "approval_mode": "auto_internal",
                        "request_type": payload.request_type,
                    },
                )
                approval["baseline"] = baseline_summary(baseline)
            await insert_audit_event(
                connection,
                request=request,
                event_type="approval.created",
                entity_type="approval",
                entity_id=record["id"],
                summary=f"Approval {approval_status}: {title}",
                metadata={
                    "project_id": str(payload.project_id),
                    "approval_mode": approval_metadata["approval_mode"],
                    "status": approval_status,
                    "baseline_locked": bool(approval.get("baseline", {}).get("locked")),
                },
            )

    return approval


@app.post("/api/approvals/{approval_id}/approve")
async def approve_approval(approval_id: str, payload: ApprovalDecision, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    try:
        parsed_id = UUID(approval_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid approval id") from exc

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            approval = await fetch_approval_for_update(connection, parsed_id)
            if not approval:
                raise HTTPException(status_code=404, detail="Approval request not found")
            if approval["status"] != "Pending":
                raise HTTPException(status_code=409, detail="Approval request is already decided")

            await connection.execute(
                """
                UPDATE wbs_approval_requests
                SET status = 'Approved',
                    reviewer = $2,
                    decision_comment = $3,
                    decided_at = now(),
                    updated_at = now()
                WHERE id = $1
                """,
                parsed_id,
                payload.reviewer,
                payload.comment,
            )
            await connection.execute(
                """
                UPDATE wbs_projects
                SET status = 'Approved',
                    updated_at = now()
                WHERE id = $1
                """,
                approval["project_id"],
            )
            updated = await fetch_approval(connection, parsed_id)
            baseline = await create_project_baseline(
                connection,
                project_id=approval["project_id"],
                approval_id=parsed_id,
                template_key=approval["template_key"],
                actor=payload.reviewer,
                metadata={
                    "approval_mode": "manual",
                    "request_type": approval["request_type"],
                },
            )
            updated["baseline"] = baseline_summary(baseline)
            await insert_audit_event(
                connection,
                request=request,
                event_type="approval.approved",
                entity_type="approval",
                entity_id=parsed_id,
                summary=f"Approval approved: {approval['title']}",
                metadata={
                    "project_id": str(approval["project_id"]),
                    "baseline_locked": bool(updated["baseline"].get("locked")),
                },
            )

    return updated


@app.post("/api/approvals/{approval_id}/reject")
async def reject_approval(approval_id: str, payload: ApprovalDecision, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    try:
        parsed_id = UUID(approval_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid approval id") from exc

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            approval = await fetch_approval_for_update(connection, parsed_id)
            if not approval:
                raise HTTPException(status_code=404, detail="Approval request not found")
            if approval["status"] != "Pending":
                raise HTTPException(status_code=409, detail="Approval request is already decided")

            await connection.execute(
                """
                UPDATE wbs_approval_requests
                SET status = 'Rejected',
                    reviewer = $2,
                    decision_comment = $3,
                    decided_at = now(),
                    updated_at = now()
                WHERE id = $1
                """,
                parsed_id,
                payload.reviewer,
                payload.comment,
            )
            await connection.execute(
                """
                UPDATE wbs_projects
                SET status = 'Rejected',
                    updated_at = now()
                WHERE id = $1
                """,
                approval["project_id"],
            )
            updated = await fetch_approval(connection, parsed_id)
            await insert_audit_event(
                connection,
                request=request,
                event_type="approval.rejected",
                entity_type="approval",
                entity_id=parsed_id,
                summary=f"Approval rejected: {approval['title']}",
                metadata={"project_id": str(approval["project_id"])},
            )

    return updated


@app.get("/api/dashboard")
async def dashboard(request: Request) -> dict[str, Any]:
    async with get_pool(request).acquire() as connection:
        project_count = await connection.fetchval("SELECT count(*) FROM wbs_projects")
        template_count = await connection.fetchval("SELECT count(*) FROM wbs_templates")
        pending_approval_count = await connection.fetchval(
            "SELECT count(*) FROM wbs_approval_requests WHERE status = 'Pending'"
        )
        preview_import_count = await connection.fetchval(
            "SELECT count(*) FROM wbs_import_jobs WHERE status = 'Preview'"
        )
        status_rows = await connection.fetch(
            """
            SELECT status, count(*) AS count
            FROM wbs_projects
            GROUP BY status
            ORDER BY status
            """
        )
        latest_projects = await connection.fetch(
            """
            SELECT name, owner, status, start_date, template_key
            FROM wbs_projects
            ORDER BY created_at DESC
            LIMIT 5
            """
        )
        latest_approvals = await connection.fetch(
            f"""
            SELECT {APPROVAL_SELECT}
            FROM wbs_approval_requests a
            JOIN wbs_projects p ON p.id = a.project_id
            ORDER BY a.created_at DESC
            LIMIT 5
            """
        )

    return {
        "metrics": {
            "projects": project_count,
            "templates": template_count,
            "pending_approvals": pending_approval_count,
            "preview_imports": preview_import_count,
            "openproject_sync": "ready",
            "database": "PostgreSQL 17",
        },
        "status_distribution": [normalize_record(row) for row in status_rows],
        "latest_projects": [normalize_record(row) for row in latest_projects],
        "latest_approvals": [normalize_record(row) for row in latest_approvals],
        "risk_hotspots": [
            {"name": "Pending PMO approvals", "level": "attention" if pending_approval_count else "stable"},
            {"name": "Excel preview queue", "level": "watch" if preview_import_count else "stable"},
            {"name": "Backup rehearsal", "level": "stable"},
        ],
    }


@app.get("/api/operations/health")
async def operations_health(request: Request) -> dict[str, Any]:
    require_roles(request, {"admin", "pmo"})

    async with get_pool(request).acquire() as connection:
        database_version = await connection.fetchval("SHOW server_version")
        project_count = await connection.fetchval("SELECT count(*) FROM wbs_projects")
        template_count = await connection.fetchval("SELECT count(*) FROM wbs_templates")
        template_item_count = await connection.fetchval("SELECT count(*) FROM wbs_template_items")
        pending_approval_count = await connection.fetchval(
            "SELECT count(*) FROM wbs_approval_requests WHERE status = 'Pending'"
        )
        preview_import_count = await connection.fetchval(
            "SELECT count(*) FROM wbs_import_jobs WHERE status = 'Preview'"
        )
        sync_run_count = await connection.fetchval("SELECT count(*) FROM wbs_sync_runs")
        baseline_count = await connection.fetchval("SELECT count(*) FROM wbs_project_baselines")
        user_count = await connection.fetchval("SELECT count(*) FROM wbs_users")
        locked_user_count = await connection.fetchval("SELECT count(*) FROM wbs_users WHERE locked_until > now()")
        audit_count = await connection.fetchval("SELECT count(*) FROM wbs_audit_events")
        setting_count = await connection.fetchval("SELECT count(*) FROM wbs_system_settings")
        project_wbs_count = await connection.fetchval("SELECT count(*) FROM wbs_project_wbs_items")
        template_version_count = await connection.fetchval("SELECT count(*) FROM wbs_template_versions")
        existing_tables = await connection.fetch(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = ANY($1::text[])
            """,
            [
                "wbs_templates",
                "wbs_template_items",
                "wbs_projects",
                "wbs_import_jobs",
                "wbs_approval_requests",
                "wbs_sync_runs",
                "wbs_project_baselines",
                "wbs_users",
                "wbs_user_sessions",
                "wbs_system_settings",
                "wbs_audit_events",
                "wbs_template_versions",
                "wbs_project_wbs_items",
            ],
        )

    table_names = {row["table_name"] for row in existing_tables}
    required_tables = {
        "wbs_templates",
        "wbs_template_items",
        "wbs_projects",
        "wbs_import_jobs",
        "wbs_approval_requests",
        "wbs_sync_runs",
        "wbs_project_baselines",
        "wbs_users",
        "wbs_user_sessions",
        "wbs_system_settings",
        "wbs_audit_events",
        "wbs_template_versions",
        "wbs_project_wbs_items",
    }
    missing_tables = sorted(required_tables - table_names)
    preflight = await run_openproject_preflight()
    openproject_status = "pass" if preflight["state"] == "ready" else "warn"
    if preflight["state"] in {"offline", "auth_failed", "blocked"}:
        openproject_status = "fail"

    checks = [
        operation_check(
            "postgresql",
            "PostgreSQL",
            "pass",
            f"PostgreSQL {database_version} is reachable",
            {"version": database_version},
        ),
        operation_check(
            "schema",
            "Schema migration",
            "fail" if missing_tables else "pass",
            "Required WBS tables are present" if not missing_tables else "Missing required WBS tables",
            {"missing_tables": missing_tables},
        ),
        operation_check(
            "template_baseline",
            "WBS template baseline",
            "pass" if template_count and template_item_count else "fail",
            f"{template_count} templates, {template_item_count} template items",
            {"templates": template_count, "template_items": template_item_count},
        ),
        operation_check(
            "portfolio_seed",
            "Project portfolio",
            "pass" if project_count else "warn",
            f"{project_count} projects registered",
            {"projects": project_count},
        ),
        operation_check(
            "approval_queue",
            "PMO approval queue",
            "warn" if pending_approval_count else "pass",
            f"{pending_approval_count} pending approvals",
            {"pending_approvals": pending_approval_count},
        ),
        operation_check(
            "excel_preview_queue",
            "Excel preview queue",
            "warn" if preview_import_count else "pass",
            f"{preview_import_count} imports waiting for apply",
            {"preview_imports": preview_import_count},
        ),
        operation_check(
            "openproject_preflight",
            "OpenProject preflight",
            openproject_status,
            f"Engine state: {preflight['state']}",
            {"state": preflight["state"], "ready_for_actual_sync": preflight["ready_for_actual_sync"]},
        ),
        operation_check(
            "sync_audit",
            "Sync audit trail",
            "pass",
            f"{sync_run_count} sync runs recorded",
            {"sync_runs": sync_run_count},
        ),
        operation_check(
            "baseline_lock",
            "Baseline lock",
            "pass",
            f"{baseline_count} locked WBS baselines",
            {"baselines": baseline_count},
        ),
        operation_check(
            "access_control",
            "Access control",
            "pass" if user_count else "fail",
            f"{user_count} portal users configured",
            {"users": user_count},
        ),
        operation_check(
            "settings_registry",
            "Settings registry",
            "pass" if setting_count >= 3 else "warn",
            f"{setting_count} settings registered",
            {"settings": setting_count},
        ),
        operation_check(
            "audit_log",
            "Audit log",
            "pass",
            f"{audit_count} audit events recorded",
            {"audit_events": audit_count, "retention_days": AUDIT_RETENTION_DAYS},
        ),
        operation_check(
            "account_lockout",
            "Account lockout",
            "warn" if locked_user_count else "pass",
            f"{locked_user_count} users currently locked",
            {"locked_users": locked_user_count, "failure_limit": LOGIN_FAILURE_LIMIT},
        ),
        operation_check(
            "template_versions",
            "Template versions",
            "pass" if template_version_count else "warn",
            f"{template_version_count} template versions stored",
            {"template_versions": template_version_count},
        ),
        operation_check(
            "project_wbs_storage",
            "Project WBS storage",
            "pass",
            f"{project_wbs_count} project WBS rows stored",
            {"project_wbs_rows": project_wbs_count},
        ),
        operation_check(
            "cors_policy",
            "CORS policy",
            "warn" if ALLOW_FILE_ORIGIN else "pass",
            "file:// origin is allowed for local development" if ALLOW_FILE_ORIGIN else "file:// origin is disabled",
            {"allow_file_origin": ALLOW_FILE_ORIGIN, "portal_origin": PORTAL_ORIGIN},
        ),
        backup_health_check(),
        operation_check(
            "metrics",
            "Metrics endpoint",
            "pass",
            "Prometheus metrics are exposed at /metrics",
            {"path": "/metrics"},
        ),
    ]
    failures = len([check for check in checks if check["status"] == "fail"])
    warnings = len([check for check in checks if check["status"] == "warn"])
    status = "critical" if failures else "watch" if warnings else "stable"

    return {
        "status": status,
        "generated_at": utc_now_iso(),
        "summary": {
            "checks": len(checks),
            "failures": failures,
            "warnings": warnings,
            "passes": len([check for check in checks if check["status"] == "pass"]),
        },
        "checks": checks,
    }


@app.get("/api/imports")
async def list_import_jobs(
    request: Request,
    limit: int = 10,
    status: str | None = None,
) -> list[dict[str, Any]]:
    bounded_limit = max(1, min(limit, 50))

    async with get_pool(request).acquire() as connection:
        if status:
            records = await connection.fetch(
                f"""
                SELECT {IMPORT_JOB_RETURNING}
                FROM wbs_import_jobs
                WHERE status = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                status,
                bounded_limit,
            )
        else:
            records = await connection.fetch(
                f"""
                SELECT {IMPORT_JOB_RETURNING}
                FROM wbs_import_jobs
                ORDER BY created_at DESC
                LIMIT $1
                """,
                bounded_limit,
            )

    return [import_job_response(record) for record in records]


@app.get("/api/imports/{job_id}")
async def get_import_job(job_id: str, request: Request) -> dict[str, Any]:
    try:
        import_job_id = UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid import job id") from exc

    async with get_pool(request).acquire() as connection:
        record = await connection.fetchrow(
            f"""
            SELECT {IMPORT_JOB_RETURNING}
            FROM wbs_import_jobs
            WHERE id = $1
            """,
            import_job_id,
        )

    if not record:
        raise HTTPException(status_code=404, detail="Import job not found")
    return import_job_response(record, include_rows=True)


@app.get("/api/imports/{job_id}/errors.xlsx")
async def download_import_errors(job_id: str, request: Request) -> StreamingResponse:
    try:
        import_job_id = UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid import job id") from exc

    async with get_pool(request).acquire() as connection:
        record = await connection.fetchrow(
            f"""
            SELECT {IMPORT_JOB_RETURNING}
            FROM wbs_import_jobs
            WHERE id = $1
            """,
            import_job_id,
        )

    if not record:
        raise HTTPException(status_code=404, detail="Import job not found")
    job = normalize_record(record)
    output = build_import_errors_workbook(job)
    filename = f"{job['source_file'].rsplit('.', 1)[0]}-issues.xlsx"
    return StreamingResponse(
        output,
        media_type=EXCEL_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/imports/validate")
async def validate_import(payload: WbsImportValidation, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    rows = assign_missing_wbs_codes([
        {"row_number": index, **row.model_dump()}
        for index, row in enumerate(payload.rows, start=1)
    ], "WBS")
    errors, warnings = validate_wbs_rows(rows)
    warnings = [*warnings, *auto_code_warnings(rows)]
    serialized_rows = [serialize_wbs_row(row) for row in rows]

    status = "Rejected" if errors else "Accepted"
    async with get_pool(request).acquire() as connection:
        record = await insert_import_job(
            connection,
            source_file=payload.source_file,
            status=status,
            total_rows=len(rows),
            accepted_rows=0 if errors else len(rows),
            rejected_rows=len(errors),
            errors=errors,
            warnings=warnings,
            preview_rows=serialized_rows,
        )

    response = normalize_record(record)
    response["warnings"] = warnings
    response["rows"] = serialized_rows
    return response


@app.get("/api/templates/{template_key}/items")
async def list_template_items(template_key: str, request: Request) -> dict[str, Any]:
    normalized_key = normalize_template_key(template_key)
    async with get_pool(request).acquire() as connection:
        template = await fetch_template(connection, normalized_key)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        rows = await fetch_template_items(connection, normalized_key)

    return {
        "template": template,
        "rows": rows,
    }


@app.get("/api/templates/{template_key}/versions")
async def list_template_versions(template_key: str, request: Request, limit: int = 20) -> list[dict[str, Any]]:
    normalized_key = normalize_template_key(template_key)
    bounded_limit = max(1, min(limit, 100))
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            """
            SELECT id, template_key, version, template_name, project_type,
                   description, item_count, metadata, created_at
            FROM wbs_template_versions
            WHERE template_key = $1
            ORDER BY version DESC
            LIMIT $2
            """,
            normalized_key,
            bounded_limit,
        )
    return [normalize_record(record) for record in records]


@app.get("/api/templates/{template_key}/excel")
async def export_template_excel(template_key: str, request: Request) -> StreamingResponse:
    normalized_key = normalize_template_key(template_key)
    async with get_pool(request).acquire() as connection:
        template = await fetch_template(connection, normalized_key)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        rows = await fetch_template_items(connection, normalized_key)

    if not rows:
        rows = [
            {
                "code": phase["code"],
                "parent_code": None,
                "name": phase["name"],
                "item_type": "단계",
                "owner": "PMO",
                "weight": phase.get("weight"),
                "start_date": None,
                "finish_date": None,
                "metadata": {},
            }
            for phase in template.get("phases", [])
        ]

    output = build_template_workbook(template, rows)
    filename = f"{normalized_key}-wbs-template.xlsx"
    return StreamingResponse(
        output,
        media_type=EXCEL_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/templates/import/preview", status_code=201)
async def preview_template_excel(
    request: Request,
    file: UploadFile = File(...),
    template_key: str = Form("uploaded-wbs"),
    template_name: str = Form("업로드 WBS 템플릿"),
    project_type: str = Form("Uploaded"),
    description: str = Form("Excel 업로드로 반영될 계층형 WBS 템플릿"),
) -> dict[str, Any]:
    require_mutating_role(request)
    normalized_key = normalize_template_key(template_key)
    contents = await file.read()
    parsed_rows = parse_wbs_workbook(contents)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            rows, errors, warnings, serialized_rows, diff_rows = await prepare_template_import(
                connection,
                template_key=normalized_key,
                parsed_rows=parsed_rows,
            )
            status = "Rejected" if errors else "Preview"
            record = await insert_import_job(
                connection,
                source_file=file.filename or "wbs-upload.xlsx",
                template_key=normalized_key,
                template_name=template_name,
                project_type=project_type,
                description=description,
                status=status,
                total_rows=len(rows),
                accepted_rows=0 if errors else len(rows),
                rejected_rows=len(errors),
                errors=errors,
                warnings=warnings,
                preview_rows=serialized_rows,
                diff_rows=diff_rows,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="import.previewed",
                entity_type="import_job",
                entity_id=record["id"],
                summary=f"Excel import preview: {file.filename or 'wbs-upload.xlsx'}",
                metadata={
                    "template_key": normalized_key,
                    "status": status,
                    "accepted_rows": 0 if errors else len(rows),
                    "rejected_rows": len(errors),
                    "diff_count": len(diff_rows),
                },
            )
            template = await fetch_template(connection, normalized_key)

    response = normalize_record(record)
    response["template"] = template
    response["warnings"] = warnings
    response["rows"] = serialized_rows[:50]
    response["diff_rows"] = diff_rows[:50]
    return response


@app.post("/api/templates/import", status_code=201)
async def import_template_excel(
    request: Request,
    file: UploadFile = File(...),
    template_key: str = Form("uploaded-wbs"),
    template_name: str = Form("업로드 WBS 템플릿"),
    project_type: str = Form("Uploaded"),
    description: str = Form("Excel 업로드로 반영된 계층형 WBS 템플릿"),
) -> dict[str, Any]:
    require_mutating_role(request)
    normalized_key = normalize_template_key(template_key)
    contents = await file.read()
    parsed_rows = parse_wbs_workbook(contents)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            rows, errors, warnings, serialized_rows, diff_rows = await prepare_template_import(
                connection,
                template_key=normalized_key,
                parsed_rows=parsed_rows,
            )
            status = "Rejected" if errors else "Accepted"
            record = await insert_import_job(
                connection,
                source_file=file.filename or "wbs-upload.xlsx",
                template_key=normalized_key,
                template_name=template_name,
                project_type=project_type,
                description=description,
                status=status,
                total_rows=len(rows),
                accepted_rows=0 if errors else len(rows),
                rejected_rows=len(errors),
                errors=errors,
                warnings=warnings,
                preview_rows=serialized_rows,
                diff_rows=diff_rows,
                applied=not errors,
            )

            if not errors:
                await replace_template_items(
                    connection,
                    template_key=normalized_key,
                    template_name=template_name,
                    project_type=project_type,
                    description=description,
                    rows=rows,
                )
                template_version = await connection.fetchval(
                    "SELECT max(version) FROM wbs_template_versions WHERE template_key = $1",
                    normalized_key,
                )
                record = await connection.fetchrow(
                    f"""
                    UPDATE wbs_import_jobs
                    SET template_version = $2
                    WHERE id = $1
                    RETURNING {IMPORT_JOB_RETURNING}
                    """,
                    record["id"],
                    template_version,
                )
            await insert_audit_event(
                connection,
                request=request,
                event_type="import.created",
                entity_type="import_job",
                entity_id=record["id"],
                summary=f"Excel import {'accepted' if not errors else 'rejected'}: {file.filename or 'wbs-upload.xlsx'}",
                metadata={
                    "template_key": normalized_key,
                    "status": status,
                    "accepted_rows": 0 if errors else len(rows),
                    "rejected_rows": len(errors),
                    "diff_count": len(diff_rows),
                    "applied": not errors,
                },
            )

            template = await fetch_template(connection, normalized_key)

    response = normalize_record(record)
    response["template"] = template
    response["warnings"] = warnings
    response["rows"] = serialized_rows[:50]
    response["diff_rows"] = diff_rows[:50]
    return response


@app.post("/api/imports/{job_id}/apply")
async def apply_import_preview(job_id: str, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    try:
        import_job_id = UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid import job id") from exc

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            job = await fetch_import_job_for_update(connection, import_job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Import job not found")
            if job["status"] != "Preview":
                raise HTTPException(status_code=409, detail="Import job is not waiting for approval")
            if job.get("errors"):
                raise HTTPException(status_code=400, detail="Rejected import cannot be applied")
            if not job.get("template_key"):
                raise HTTPException(status_code=400, detail="Import job has no template key")

            rows = restore_wbs_rows(job.get("preview_rows") or [])
            errors, _ = validate_wbs_rows(rows)
            if errors:
                raise HTTPException(status_code=400, detail={"message": "Preview rows are no longer valid", "errors": errors})

            template_key = normalize_template_key(job["template_key"])
            await replace_template_items(
                connection,
                template_key=template_key,
                template_name=job.get("template_name") or "업로드 WBS 템플릿",
                project_type=job.get("project_type") or "Uploaded",
                description=job.get("description") or "Excel 업로드로 반영된 계층형 WBS 템플릿",
                rows=rows,
            )
            template_version = await connection.fetchval(
                "SELECT max(version) FROM wbs_template_versions WHERE template_key = $1",
                template_key,
            )
            record = await connection.fetchrow(
                f"""
                UPDATE wbs_import_jobs
                SET status = 'Applied',
                    accepted_rows = total_rows,
                    rejected_rows = 0,
                    template_version = $2,
                    applied_at = now()
                WHERE id = $1
                RETURNING {IMPORT_JOB_RETURNING}
                """,
                import_job_id,
                template_version,
            )
            template = await fetch_template(connection, template_key)
            await insert_audit_event(
                connection,
                request=request,
                event_type="import.applied",
                entity_type="import_job",
                entity_id=import_job_id,
                summary=f"Excel import applied: {job['source_file']}",
                metadata={
                    "template_key": template_key,
                    "accepted_rows": record["accepted_rows"],
                },
            )

    response = normalize_record(record)
    response["template"] = template
    response["warnings"] = response.get("warnings", [])
    response["rows"] = (response.get("preview_rows") or [])[:50]
    return response


@app.post("/api/projects/{project_id}/imports/{job_id}/apply")
async def apply_import_to_project(project_id: str, job_id: str, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    parsed_project_id = safe_uuid(project_id)
    import_job_id = safe_uuid(job_id)
    if not parsed_project_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    if not import_job_id:
        raise HTTPException(status_code=400, detail="Invalid import job id")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow(
                """
                SELECT id, name, template_key, owner, status, start_date,
                       openproject_project_id, metadata, created_at, updated_at
                FROM wbs_projects
                WHERE id = $1
                FOR UPDATE
                """,
                parsed_project_id,
            )
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            ensure_project_status_allowed(project, PROJECT_WBS_IMPORT_ALLOWED_STATUSES, "Project WBS import")

            job = await fetch_import_job_for_update(connection, import_job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Import job not found")
            if job["status"] not in {"Preview", "Applied", "Accepted"}:
                raise HTTPException(status_code=409, detail="Import job is not valid for project apply")
            if job.get("errors"):
                raise HTTPException(status_code=400, detail="Rejected import cannot be applied to project")

            rows = restore_wbs_rows(job.get("preview_rows") or [])
            errors, _ = validate_wbs_rows(rows)
            if errors:
                raise HTTPException(status_code=400, detail={"message": "Import rows are no longer valid", "errors": errors})

            existing_rows = await fetch_project_wbs_items(connection, parsed_project_id)
            if not existing_rows:
                existing_rows = await fetch_template_items(connection, project["template_key"])
            diff_rows = build_wbs_diff_rows(existing_rows, rows)
            await replace_project_wbs_items(
                connection,
                project_id=parsed_project_id,
                rows=rows,
                source_import_job_id=import_job_id,
            )
            record = await connection.fetchrow(
                """
                UPDATE wbs_projects
                SET status = CASE WHEN status = 'Rejected' THEN 'Draft' ELSE status END,
                    updated_at = now()
                WHERE id = $1
                RETURNING id, name, template_key, owner, status, start_date,
                          openproject_project_id, metadata, created_at, updated_at
                """,
                parsed_project_id,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="project_wbs.import_applied",
                entity_type="project",
                entity_id=parsed_project_id,
                summary=f"Project WBS import applied: {project['name']}",
                metadata={
                    "import_job_id": str(import_job_id),
                    "source_file": job.get("source_file"),
                    "rows": len(rows),
                    "diff_count": len(diff_rows),
                },
            )

    return {
        "status": "Applied",
        "project": normalize_record(record),
        "rows": [serialize_wbs_row(row) for row in rows[:50]],
        "diff_rows": diff_rows[:50],
        "summary": {"rows": len(rows), "diff_count": len(diff_rows)},
    }


@app.post("/api/templates/{template_key}/codes/resequence")
async def resequence_template_codes(template_key: str, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    normalized_key = normalize_template_key(template_key)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            template = await fetch_template(connection, normalized_key)
            if not template:
                raise HTTPException(status_code=404, detail="Template not found")

            rows = await fetch_template_items(connection, normalized_key)
            if not rows:
                raise HTTPException(status_code=404, detail="Template has no WBS rows")

            root_code = root_code_from_rows(rows) or template_code_prefix(normalized_key)
            renumbered_rows, changes = renumber_wbs_rows(rows, root_code)
            await replace_template_items(
                connection,
                template_key=normalized_key,
                template_name=template["name"],
                project_type=template["project_type"],
                description=template["description"],
                rows=renumbered_rows,
            )
            updated_template = await fetch_template(connection, normalized_key)
            await insert_audit_event(
                connection,
                request=request,
                event_type="template.resequenced",
                entity_type="template",
                entity_id=normalized_key,
                summary=f"WBS codes resequenced: {normalized_key}",
                metadata={"changed_rows": len(changes)},
            )

    return {
        "template": updated_template,
        "status": "Updated",
        "changed_rows": len(changes),
        "changes": changes[:50],
        "rows": [serialize_wbs_row(row) for row in renumbered_rows[:50]],
    }


@app.get("/api/openproject")
async def openproject_connection() -> dict[str, str]:
    return {
        "mode": "community-edition-engine",
        "base_url": OPENPROJECT_BASE_URL,
        "integration": "pm-engine-adapter",
        "adapter": "openproject",
    }
