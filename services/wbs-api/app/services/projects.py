"""프로젝트 조회·운영 정책·상태 전이 공통 로직.
"""
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException, Request

from app.core.config import (
    DEFAULT_PROJECT_OPERATION_POLICY,
    DOD_MANAGEMENT_MODES,
    PROJECT_OPERATION_POLICY_SELECT,
    SPRINT_LENGTH_POLICIES,
    STORY_POINT_MODES,
)
from app.core.db import (
    normalize_delivery_mode,
    normalize_dod_items,
    normalize_metadata,
    normalize_number_list,
    normalize_record,
)
from app.core.security import get_effective_project_role, get_tenant_id


def ensure_project_status_allowed(project: dict[str, Any] | asyncpg.Record, allowed_statuses: set[str], action: str) -> None:
    status = project["status"]
    if status not in allowed_statuses:
        raise HTTPException(
            status_code=409,
            detail=f"{action} is not allowed while project status is {status}",
        )


def default_project_operation_policy(tenant_id: str) -> dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "default_delivery_mode": DEFAULT_PROJECT_OPERATION_POLICY["default_delivery_mode"],
        "story_point_mode": DEFAULT_PROJECT_OPERATION_POLICY["story_point_mode"],
        "fibonacci_points": list(DEFAULT_PROJECT_OPERATION_POLICY["fibonacci_points"]),
        "sprint_length_policy": DEFAULT_PROJECT_OPERATION_POLICY["sprint_length_policy"],
        "dod_management": DEFAULT_PROJECT_OPERATION_POLICY["dod_management"],
        "default_dod_items": list(DEFAULT_PROJECT_OPERATION_POLICY["default_dod_items"]),
        "openproject_sprint_version_sync": DEFAULT_PROJECT_OPERATION_POLICY["openproject_sprint_version_sync"],
        "metadata": dict(DEFAULT_PROJECT_OPERATION_POLICY["metadata"]),
    }


def normalize_project_operation_policy_value(policy: dict[str, Any], tenant_id: str) -> dict[str, Any]:
    base = default_project_operation_policy(tenant_id)
    merged = {**base, **normalize_metadata(policy)}
    merged["default_delivery_mode"] = normalize_delivery_mode(merged.get("default_delivery_mode"))

    story_point_mode = str(merged.get("story_point_mode") or base["story_point_mode"]).strip().lower()
    merged["story_point_mode"] = story_point_mode if story_point_mode in STORY_POINT_MODES else base["story_point_mode"]
    merged["fibonacci_points"] = normalize_number_list(
        merged.get("fibonacci_points"),
        base["fibonacci_points"],
    )

    sprint_length_policy = str(merged.get("sprint_length_policy") or base["sprint_length_policy"]).strip().lower()
    merged["sprint_length_policy"] = (
        sprint_length_policy if sprint_length_policy in SPRINT_LENGTH_POLICIES else base["sprint_length_policy"]
    )

    dod_management = str(merged.get("dod_management") or base["dod_management"]).strip().lower()
    merged["dod_management"] = dod_management if dod_management in DOD_MANAGEMENT_MODES else base["dod_management"]
    merged["default_dod_items"] = normalize_dod_items(merged.get("default_dod_items"))
    merged["openproject_sprint_version_sync"] = bool(merged.get("openproject_sprint_version_sync"))
    merged["metadata"] = normalize_metadata(merged.get("metadata"))
    merged["tenant_id"] = tenant_id
    return merged


def project_operation_policy_response(record: asyncpg.Record | dict[str, Any] | None, tenant_id: str) -> dict[str, Any]:
    if record:
        policy = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    else:
        policy = default_project_operation_policy(tenant_id)
    normalized = normalize_project_operation_policy_value(policy, tenant_id)
    if normalized.get("updated_by"):
        normalized["updated_by"] = str(normalized["updated_by"])
    return normalized


async def fetch_project_operation_policy(connection: asyncpg.Connection, tenant_id: str) -> dict[str, Any]:
    record = await connection.fetchrow(
        f"""
        SELECT {PROJECT_OPERATION_POLICY_SELECT}
        FROM wbs_project_operation_policies
        WHERE tenant_id = $1
        """,
        tenant_id,
    )
    return project_operation_policy_response(record, tenant_id)


async def fetch_project(
    connection: asyncpg.Connection,
    project_id: UUID,
    tenant_id: str | None = None,
    *,
    for_update: bool = False,
) -> dict[str, Any] | None:
    params: list[Any] = [project_id]
    tenant_filter = ""
    if tenant_id is not None:
        params.append(tenant_id)
        tenant_filter = f" AND tenant_id = ${len(params)}"
    lock_clause = " FOR UPDATE" if for_update else ""
    record = await connection.fetchrow(
        f"""
        SELECT id, name, template_key, owner, status, start_date, delivery_mode,
               openproject_project_id, metadata, tenant_id, created_at, updated_at
        FROM wbs_projects
        WHERE id = $1{tenant_filter}{lock_clause}
        """,
        *params,
    )
    return normalize_record(record) if record else None


async def fetch_tenant_project(
    connection: asyncpg.Connection,
    request: Request,
    project_id: UUID,
    *,
    for_update: bool = False,
) -> dict[str, Any]:
    project = await fetch_project(
        connection,
        project_id,
        get_tenant_id(request),
        for_update=for_update,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project["_project_role"] = await get_effective_project_role(
        connection, get_tenant_id(request), project_id, getattr(request.state, "user", None)
    )
    if project["_project_role"] is None:
        # 비멤버에게는 프로젝트 존재 자체를 노출하지 않음
        raise HTTPException(status_code=404, detail="Project not found")
    return project
