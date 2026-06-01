from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
import json
import os
from pathlib import Path
import re
from typing import Any
from uuid import UUID

import asyncpg
import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Side, Border
from openpyxl.worksheet.datavalidation import DataValidation
from pydantic import BaseModel, Field


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://wbs:wbs_dev_password@localhost:5432/wbs_platform",
)
OPENPROJECT_BASE_URL = os.getenv("OPENPROJECT_BASE_URL", "http://localhost:8080")
OPENPROJECT_SYNC_ENABLED = os.getenv("OPENPROJECT_SYNC_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
OPENPROJECT_API_TOKEN = os.getenv("OPENPROJECT_API_TOKEN", "")
OPENPROJECT_AUTH_MODE = os.getenv("OPENPROJECT_AUTH_MODE", "bearer").lower()
OPENPROJECT_DEFAULT_TYPE_ID = os.getenv("OPENPROJECT_DEFAULT_TYPE_ID", "")
OPENPROJECT_TYPE_MAP_JSON = os.getenv("OPENPROJECT_TYPE_MAP_JSON", "{}")
OPENPROJECT_SYNC_PARENT_LINKS = os.getenv("OPENPROJECT_SYNC_PARENT_LINKS", "true").lower() in {"1", "true", "yes", "on"}
PORTAL_ORIGIN = os.getenv("PORTAL_ORIGIN", "http://localhost:3010")
MIGRATION_PATH = Path(__file__).resolve().parent.parent / "migrations" / "001_init.sql"
MAX_EXCEL_UPLOAD_BYTES = 8 * 1024 * 1024
EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
IMPORT_JOB_RETURNING = """
id, source_file, template_key, template_name, project_type, description, status,
total_rows, accepted_rows, rejected_rows, errors, warnings, preview_rows,
applied_at, created_at
"""
APPROVAL_SELECT = """
a.id, a.project_id, p.name AS project_name, p.template_key, a.title,
a.request_type, a.status, a.requester, a.reviewer, a.due_date,
a.decision_comment, a.metadata, a.created_at, a.decided_at, a.updated_at
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[PORTAL_ORIGIN, "http://localhost:3010", "http://127.0.0.1:3010"],
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
    metadata: dict[str, Any] = Field(default_factory=dict)


class ApprovalDecision(BaseModel):
    reviewer: str = Field("PMO Lead", min_length=1, max_length=80)
    comment: str | None = Field(None, max_length=500)


class ProjectSyncRequest(BaseModel):
    dry_run: bool = True
    create_work_packages: bool = True
    force_project_create: bool = False


def normalize_record(record: asyncpg.Record) -> dict[str, Any]:
    data = dict(record)
    for key, value in data.items():
        if isinstance(value, date):
            data[key] = value.isoformat()
        if isinstance(value, Decimal):
            data[key] = float(value)
        if key in {"errors", "warnings", "metadata", "phases", "preview_rows"} and isinstance(data[key], str):
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


async def prepare_template_import(
    connection: asyncpg.Connection,
    *,
    template_key: str,
    parsed_rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    existing_rows = await fetch_template_items(connection, template_key)
    root_code = root_code_from_rows(existing_rows) or template_code_prefix(template_key)
    rows = assign_missing_wbs_codes(parsed_rows, root_code)
    errors, warnings = validate_wbs_rows(rows)
    warnings = [*warnings, *auto_code_warnings(rows)]
    serialized_rows = [serialize_wbs_row(row) for row in rows]
    return rows, errors, warnings, serialized_rows


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
           status, total_rows, accepted_rows, rejected_rows, errors, warnings,
           preview_rows, applied_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
           $12::jsonb, CASE WHEN $13::boolean THEN now() ELSE NULL END)
        RETURNING {IMPORT_JOB_RETURNING}
        """,
        source_file,
        template_key,
        template_name,
        project_type,
        description,
        status,
        total_rows,
        accepted_rows,
        rejected_rows,
        errors,
        warnings,
        preview_rows,
        applied,
    )


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
    def __init__(self, base_url: str, api_token: str, auth_mode: str = "bearer") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.auth_mode = auth_mode

    def request_options(self) -> dict[str, Any]:
        headers = {"Accept": "application/hal+json", "Content-Type": "application/json"}
        options: dict[str, Any] = {"headers": headers}
        if self.auth_mode == "basic":
            options["auth"] = ("apikey", self.api_token)
        else:
            headers["Authorization"] = f"Bearer {self.api_token}"
        return options

    async def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                json=payload,
                **self.request_options(),
            )

        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "OpenProject API request failed",
                    "status_code": response.status_code,
                    "response": detail,
                },
            )
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="OpenProject API returned invalid JSON") from exc

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

    async def create_work_package(
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

        return await self.request("POST", "/api/v3/work_packages?notify=false", payload)


def openproject_engine_status() -> dict[str, Any]:
    return {
        "adapter": "openproject",
        "base_url": OPENPROJECT_BASE_URL,
        "enabled": OPENPROJECT_SYNC_ENABLED,
        "token_configured": bool(OPENPROJECT_API_TOKEN),
        "auth_mode": OPENPROJECT_AUTH_MODE,
        "default_type_configured": bool(OPENPROJECT_DEFAULT_TYPE_ID),
        "type_map_configured": bool(parse_json_object(OPENPROJECT_TYPE_MAP_JSON)),
        "parent_links": OPENPROJECT_SYNC_PARENT_LINKS,
    }


def build_openproject_sync_plan(
    project: dict[str, Any],
    template: dict[str, Any],
    rows: list[dict[str, Any]],
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
                "subject": f"{row['code']} {row['name']}"[:255],
                "start_date": row.get("start_date"),
                "finish_date": row.get("finish_date"),
                "already_synced": row["code"] in synced_work_packages,
            }
        )

    return {
        "engine": openproject_engine_status(),
        "project": project,
        "template": template,
        "openproject": {
            "project_id": project.get("openproject_project_id") or engine_metadata.get("project_id"),
            "project_identifier": engine_metadata.get("project_identifier") or identifier,
            "project_already_synced": bool(project.get("openproject_project_id") or engine_metadata.get("project_id")),
        },
        "rows": planned_rows,
        "summary": {
            "total_rows": len(planned_rows),
            "pending_work_packages": len([row for row in planned_rows if not row["already_synced"]]),
            "synced_work_packages": len([row for row in planned_rows if row["already_synced"]]),
        },
    }


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
    except Exception:
        database_up = 0
        project_count = 0
        template_count = 0
        approval_rows = []
        import_rows = []
        project_status_rows = []

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

    return normalize_record(record)


@app.get("/api/pm-engine")
async def pm_engine() -> dict[str, Any]:
    return openproject_engine_status()


@app.get("/api/projects/{project_id}/sync-plan")
async def project_sync_plan(project_id: str, request: Request) -> dict[str, Any]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    async with get_pool(request).acquire() as connection:
        project = await fetch_project(connection, parsed_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        template = await fetch_template(connection, project["template_key"])
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        rows = await fetch_template_items(connection, project["template_key"])

    rows = template_rows_or_phases(template, rows)
    return build_openproject_sync_plan(project, template, rows)


@app.post("/api/projects/{project_id}/sync")
async def sync_project_to_engine(
    project_id: str,
    request: Request,
    payload: ProjectSyncRequest = ProjectSyncRequest(),
) -> dict[str, Any]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    async with get_pool(request).acquire() as connection:
        project = await fetch_project(connection, parsed_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        template = await fetch_template(connection, project["template_key"])
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        rows = await fetch_template_items(connection, project["template_key"])

    rows = template_rows_or_phases(template, rows)
    plan = build_openproject_sync_plan(project, template, rows)
    if payload.dry_run:
        return {"status": "DryRun", **plan}

    if not OPENPROJECT_SYNC_ENABLED:
        raise HTTPException(status_code=400, detail="OpenProject sync is disabled. Set OPENPROJECT_SYNC_ENABLED=true to execute.")
    if not OPENPROJECT_API_TOKEN:
        raise HTTPException(status_code=400, detail="OPENPROJECT_API_TOKEN is required for OpenProject sync.")

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
            created_work_package = await client.create_work_package(
                openproject_project_id=openproject_project_id,
                row=row,
                parent_href=parent_href,
            )
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
            SET openproject_project_id = $2,
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
    return {
        "status": "Synced",
        "engine": openproject_engine_status(),
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
        },
        "created_work_packages": created_work_packages,
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
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow(
                """
                SELECT id, name, status
                FROM wbs_projects
                WHERE id = $1
                FOR UPDATE
                """,
                payload.project_id,
            )
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")

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
            record = await connection.fetchrow(
                f"""
                INSERT INTO wbs_approval_requests
                  (project_id, title, request_type, requester, reviewer, due_date, metadata)
                VALUES
                  ($1, $2, $3, $4, $5, $6, $7::jsonb)
                RETURNING id
                """,
                payload.project_id,
                title,
                payload.request_type,
                payload.requester,
                payload.reviewer,
                payload.due_date,
                payload.metadata,
            )
            await connection.execute(
                """
                UPDATE wbs_projects
                SET status = 'Review',
                    updated_at = now()
                WHERE id = $1
                """,
                payload.project_id,
            )
            approval = await fetch_approval(connection, record["id"])

    return approval


@app.post("/api/approvals/{approval_id}/approve")
async def approve_approval(approval_id: str, payload: ApprovalDecision, request: Request) -> dict[str, Any]:
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

    return updated


@app.post("/api/approvals/{approval_id}/reject")
async def reject_approval(approval_id: str, payload: ApprovalDecision, request: Request) -> dict[str, Any]:
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


@app.post("/api/imports/validate")
async def validate_import(payload: WbsImportValidation, request: Request) -> dict[str, Any]:
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
    normalized_key = normalize_template_key(template_key)
    contents = await file.read()
    parsed_rows = parse_wbs_workbook(contents)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            rows, errors, warnings, serialized_rows = await prepare_template_import(
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
            )
            template = await fetch_template(connection, normalized_key)

    response = normalize_record(record)
    response["template"] = template
    response["warnings"] = warnings
    response["rows"] = serialized_rows[:50]
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
    normalized_key = normalize_template_key(template_key)
    contents = await file.read()
    parsed_rows = parse_wbs_workbook(contents)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            rows, errors, warnings, serialized_rows = await prepare_template_import(
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

            template = await fetch_template(connection, normalized_key)

    response = normalize_record(record)
    response["template"] = template
    response["warnings"] = warnings
    response["rows"] = serialized_rows[:50]
    return response


@app.post("/api/imports/{job_id}/apply")
async def apply_import_preview(job_id: str, request: Request) -> dict[str, Any]:
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
            record = await connection.fetchrow(
                f"""
                UPDATE wbs_import_jobs
                SET status = 'Applied',
                    accepted_rows = total_rows,
                    rejected_rows = 0,
                    applied_at = now()
                WHERE id = $1
                RETURNING {IMPORT_JOB_RETURNING}
                """,
                import_job_id,
            )
            template = await fetch_template(connection, template_key)

    response = normalize_record(record)
    response["template"] = template
    response["warnings"] = response.get("warnings", [])
    response["rows"] = (response.get("preview_rows") or [])[:50]
    return response


@app.post("/api/templates/{template_key}/codes/resequence")
async def resequence_template_codes(template_key: str, request: Request) -> dict[str, Any]:
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
        "integration": "api-v3-or-plugin",
    }
