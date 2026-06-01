from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
import json
import os
from pathlib import Path
import re
from typing import Any

import asyncpg
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Side, Border
from openpyxl.worksheet.datavalidation import DataValidation
from pydantic import BaseModel, Field


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://wbs:wbs_dev_password@localhost:5432/wbs_platform",
)
OPENPROJECT_BASE_URL = os.getenv("OPENPROJECT_BASE_URL", "http://localhost:8080")
PORTAL_ORIGIN = os.getenv("PORTAL_ORIGIN", "http://localhost:3010")
MIGRATION_PATH = Path(__file__).resolve().parent.parent / "migrations" / "001_init.sql"
MAX_EXCEL_UPLOAD_BYTES = 8 * 1024 * 1024
EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

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
    code: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=160)
    parent_code: str | None = Field(None, max_length=40)
    item_type: str = Field("작업", min_length=1, max_length=40)
    owner: str | None = Field(None, max_length=80)
    weight: float | None = Field(None, ge=0, le=100)
    start_date: date | None = None
    finish_date: date | None = None
    deliverable_type: str | None = Field(None, max_length=80)
    inspection_required: bool = False
    notes: str | None = Field(None, max_length=500)


class WbsImportValidation(BaseModel):
    source_file: str = Field("wbs-upload.xlsx", min_length=1, max_length=160)
    rows: list[WbsImportRow]


def normalize_record(record: asyncpg.Record) -> dict[str, Any]:
    data = dict(record)
    for key, value in data.items():
        if isinstance(value, date):
            data[key] = value.isoformat()
        if isinstance(value, Decimal):
            data[key] = float(value)
        if key in {"errors", "metadata", "phases"} and isinstance(data[key], str):
            try:
                data[key] = json.loads(data[key])
            except json.JSONDecodeError:
                pass
    return data


def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.pool


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


def parent_depth(code: str, parent_map: dict[str, str | None]) -> int:
    depth = 1
    seen = {code}
    parent = parent_map.get(code)
    while parent and parent not in seen:
        seen.add(parent)
        depth += 1
        parent = parent_map.get(parent)
    return depth


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
        if {"code", "name"}.issubset(candidate.keys()):
            header_row = row_number
            header_map = candidate
            break

    if not header_row:
        raise HTTPException(status_code=400, detail="WBS 코드와 작업명 헤더를 찾을 수 없습니다")

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
        metadata = row.get("metadata") or {}
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = {}
        if not isinstance(metadata, dict):
            metadata = {}
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
    guide.append(["Rule", "WBS 코드와 작업명은 필수입니다. 상위 WBS 코드는 비워두면 코드 또는 레벨로 추론합니다."])
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
        metadata = {
            "deliverable_type": row.get("deliverable_type"),
            "inspection_required": row.get("inspection_required", False),
            "progress_formula": row.get("progress_formula")
            or ("하위 단계 가중치 합산" if not row.get("parent_code") else "작업 완료율 x 가중치"),
            "notes": row.get("notes"),
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


@app.get("/health")
async def health(request: Request) -> dict[str, str]:
    async with get_pool(request).acquire() as connection:
        await connection.fetchval("SELECT 1")
    return {
        "status": "ok",
        "database": "postgresql",
        "openproject_base_url": OPENPROJECT_BASE_URL,
    }


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


@app.get("/api/dashboard")
async def dashboard(request: Request) -> dict[str, Any]:
    async with get_pool(request).acquire() as connection:
        project_count = await connection.fetchval("SELECT count(*) FROM wbs_projects")
        template_count = await connection.fetchval("SELECT count(*) FROM wbs_templates")
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

    return {
        "metrics": {
            "projects": project_count,
            "templates": template_count,
            "openproject_sync": "ready",
            "database": "PostgreSQL 17",
        },
        "status_distribution": [normalize_record(row) for row in status_rows],
        "latest_projects": [normalize_record(row) for row in latest_projects],
        "risk_hotspots": [
            {"name": "Excel hierarchy import", "level": "attention"},
            {"name": "SSO decision", "level": "watch"},
            {"name": "Backup rehearsal", "level": "stable"},
        ],
    }


@app.post("/api/imports/validate")
async def validate_import(payload: WbsImportValidation, request: Request) -> dict[str, Any]:
    rows = [
        {"row_number": index, **row.model_dump()}
        for index, row in enumerate(payload.rows, start=1)
    ]
    errors, warnings = validate_wbs_rows(rows)

    status = "Rejected" if errors else "Accepted"
    async with get_pool(request).acquire() as connection:
        record = await connection.fetchrow(
            """
            INSERT INTO wbs_import_jobs
              (source_file, status, total_rows, accepted_rows, rejected_rows, errors)
            VALUES
              ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING id, source_file, status, total_rows, accepted_rows,
                      rejected_rows, errors, created_at
            """,
            payload.source_file,
            status,
            len(payload.rows),
            0 if errors else len(payload.rows),
            len(errors),
            errors,
        )

    response = normalize_record(record)
    response["warnings"] = warnings
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
    rows = parse_wbs_workbook(contents)
    errors, warnings = validate_wbs_rows(rows)
    status = "Rejected" if errors else "Accepted"
    serialized_rows = [serialize_wbs_row(row) for row in rows]

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            record = await connection.fetchrow(
                """
                INSERT INTO wbs_import_jobs
                  (source_file, status, total_rows, accepted_rows, rejected_rows, errors)
                VALUES
                  ($1, $2, $3, $4, $5, $6::jsonb)
                RETURNING id, source_file, status, total_rows, accepted_rows,
                          rejected_rows, errors, created_at
                """,
                file.filename or "wbs-upload.xlsx",
                status,
                len(rows),
                0 if errors else len(rows),
                len(errors),
                errors,
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


@app.get("/api/openproject")
async def openproject_connection() -> dict[str, str]:
    return {
        "mode": "community-edition-engine",
        "base_url": OPENPROJECT_BASE_URL,
        "integration": "api-v3-or-plugin",
    }
