"""WBS 코드·검증·Diff·템플릿·진척 롤업 조회 공통 로직.
"""
from datetime import date
import re
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException

from app.domain.wbs_rules import compute_wbs_rollup, validate_hierarchy
from app.core.config import IMPORT_JOB_RETURNING
from app.core.db import normalize_metadata, normalize_record, normalize_text


def normalize_code(value: Any) -> str | None:
    text = normalize_text(value)
    return re.sub(r"\s+", "", text) if text else None


def normalize_template_key(value: str) -> str:
    key = re.sub(r"[^a-z0-9_-]+", "-", value.strip().lower())
    key = re.sub(r"-{2,}", "-", key).strip("-")
    if not key:
        raise HTTPException(status_code=400, detail="Template key is required")
    return key[:80]


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
            errors.append({
                "row": row_number,
                "field": "code",
                "code": code,
                "duplicate_of_row": codes[code],
                "message": (
                    f"WBS 코드 '{code}'가 {codes[code]}행과 중복됩니다 "
                    "(코드를 고치거나 셀을 비워 두면 업로드 시 자동 부여됩니다)"
                ),
            })
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

    # 계층 깊이·유형 규칙 (wbs_rules.validate_hierarchy — WBS_HIERARCHY_MODE로 strict/warn/off)
    if not errors:
        h_errors, h_warnings = validate_hierarchy(rows)
        errors.extend(h_errors)
        warnings.extend(h_warnings)

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
               start_date, finish_date, sort_order, metadata, tenant_id
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
               start_date, finish_date, sort_order, metadata, tenant_id
        FROM wbs_project_wbs_items
        WHERE project_id = $1
        ORDER BY sort_order, code
        """,
        project_id,
    )
    return [normalize_record(record) for record in records]


async def fetch_project_rollup(
    connection: asyncpg.Connection, project_id: UUID, as_of: date | None = None
) -> dict[str, Any]:
    """프로젝트 WBS 진척 롤업 (공통 산식 — wbs_rules.compute_wbs_rollup)."""
    rows = await fetch_project_wbs_items(connection, project_id)
    return compute_wbs_rollup(rows, as_of)


async def fetch_rollups_for_projects(
    connection: asyncpg.Connection, project_ids: list[UUID], as_of: date | None = None
) -> dict[str, dict[str, Any]]:
    """여러 프로젝트의 롤업을 한 번의 조회로 계산. {project_id(str): rollup}"""
    if not project_ids:
        return {}
    records = await connection.fetch(
        """
        SELECT project_id, code, parent_code, name, item_type, owner, weight,
               start_date, finish_date, sort_order, metadata
        FROM wbs_project_wbs_items
        WHERE project_id = ANY($1::uuid[])
        """,
        project_ids,
    )
    grouped: dict[str, list[dict[str, Any]]] = {str(pid): [] for pid in project_ids}
    for record in records:
        row = normalize_record(record)
        row["metadata"] = normalize_metadata(row.get("metadata"))
        grouped.setdefault(str(record["project_id"]), []).append(row)
    return {pid: compute_wbs_rollup(rows, as_of) for pid, rows in grouped.items()}


async def replace_project_wbs_items(
    connection: asyncpg.Connection,
    *,
    project_id: UUID,
    tenant_id: str,
    rows: list[dict[str, Any]],
    source_import_job_id: UUID | None = None,
) -> None:
    await connection.execute("DELETE FROM wbs_project_wbs_items WHERE project_id = $1", project_id)
    for index, row in enumerate(rows, start=1):
        existing_metadata = normalize_metadata(row.get("metadata"))
        metadata = {
            **existing_metadata,
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
              (project_id, tenant_id, code, parent_code, name, item_type, owner, weight,
               start_date, finish_date, sort_order, metadata, source_import_job_id)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
            """,
            project_id,
            tenant_id,
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
