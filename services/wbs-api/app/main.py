from contextlib import asynccontextmanager
from datetime import date
import json
import os
from pathlib import Path
from typing import Any

import asyncpg
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://wbs:wbs_dev_password@localhost:5432/wbs_platform",
)
OPENPROJECT_BASE_URL = os.getenv("OPENPROJECT_BASE_URL", "http://localhost:8080")
PORTAL_ORIGIN = os.getenv("PORTAL_ORIGIN", "http://localhost:3010")
MIGRATION_PATH = Path(__file__).resolve().parent.parent / "migrations" / "001_init.sql"


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
    owner: str | None = Field(None, max_length=80)
    weight: float | None = Field(None, ge=0, le=100)
    start_date: date | None = None
    finish_date: date | None = None


class WbsImportValidation(BaseModel):
    source_file: str = Field("wbs-upload.xlsx", min_length=1, max_length=160)
    rows: list[WbsImportRow]


def normalize_record(record: asyncpg.Record) -> dict[str, Any]:
    data = dict(record)
    for key, value in data.items():
        if isinstance(value, date):
            data[key] = value.isoformat()
    return data


def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.pool


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
            SELECT key, name, project_type, description, phases
            FROM wbs_templates
            ORDER BY project_type, name
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
            json.dumps(metadata),
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
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    codes: set[str] = set()
    parent_weight: dict[str, float] = {}

    for index, row in enumerate(payload.rows, start=1):
        if row.code in codes:
            errors.append({"row": index, "field": "code", "message": "Duplicate WBS code"})
        codes.add(row.code)

        if row.finish_date and row.start_date and row.finish_date < row.start_date:
            errors.append(
                {
                    "row": index,
                    "field": "finish_date",
                    "message": "Finish date is earlier than start date",
                }
            )

        parent_key = row.parent_code or "__root__"
        parent_weight[parent_key] = parent_weight.get(parent_key, 0) + (row.weight or 0)

    for index, row in enumerate(payload.rows, start=1):
        if row.parent_code and row.parent_code not in codes:
            errors.append(
                {
                    "row": index,
                    "field": "parent_code",
                    "message": "Parent code does not exist in import file",
                }
            )

    for parent_code, total_weight in parent_weight.items():
        if total_weight and round(total_weight, 2) != 100:
            warnings.append(
                {
                    "parent_code": None if parent_code == "__root__" else parent_code,
                    "message": f"Sibling weights add up to {total_weight:.2f}, not 100",
                }
            )

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
            json.dumps(errors),
        )

    response = normalize_record(record)
    response["warnings"] = warnings
    return response


@app.get("/api/openproject")
async def openproject_connection() -> dict[str, str]:
    return {
        "mode": "community-edition-engine",
        "base_url": OPENPROJECT_BASE_URL,
        "integration": "api-v3-or-plugin",
    }
