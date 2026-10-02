"""애자일(스프린트·백로그) API 라우터.
"""
from datetime import date, timedelta
from decimal import Decimal
import json
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import (
    AGILE_SPRINT_SELECT,
    DEFAULT_PROJECT_OPERATION_POLICY,
    PROJECT_MUTATING_ROLES,
    SPRINT_LENGTH_DAYS,
    _WBS_TO_AGILE_TYPE,
)
from app.core.db import (
    get_pool,
    normalize_metadata,
    normalize_number_list,
    normalize_record,
    parse_date,
    safe_uuid,
    utc_now_iso,
)
from app.core.security import (
    ensure_project_mutate_role,
    get_tenant_id,
    require_roles,
    work_item_identity_key,
    work_item_user_tokens,
)
from app.schemas import AgileItemCreate, AgileItemUpdate, AgileSprintCreate, AgileSprintUpdate
from app.services.agile import _wbs_to_agile_status, agile_sprint_response
from app.services.projects import fetch_project_operation_policy, fetch_tenant_project

router = APIRouter()


AGILE_ITEM_SELECT = """
id, project_id, tenant_id, sprint_id, parent_id, wbs_code, item_type,
title, description, story_points, priority, status, assignee, reviewer,
acceptance_criteria, sort_order, metadata, created_at, updated_at
"""


def sprint_end_date_from_policy(start_date: date, policy: dict[str, Any], payload_end_date: date | None = None) -> date:
    sprint_policy = policy.get("sprint_length_policy") or "custom"
    if sprint_policy in SPRINT_LENGTH_DAYS:
        return start_date + timedelta(days=SPRINT_LENGTH_DAYS[sprint_policy] - 1)
    return payload_end_date or start_date + timedelta(days=13)


def validate_story_points_for_policy(value: float | int | Decimal | None, policy: dict[str, Any]) -> float:
    points = float(value or 0)
    if policy.get("story_point_mode") != "fibonacci" or points == 0:
        return points
    allowed = normalize_number_list(policy.get("fibonacci_points"), DEFAULT_PROJECT_OPERATION_POLICY["fibonacci_points"])
    if not any(abs(points - allowed_point) < 0.001 for allowed_point in allowed):
        allowed_label = ", ".join(str(int(p)) if float(p).is_integer() else str(p) for p in allowed)
        raise HTTPException(status_code=400, detail=f"Story Point must follow Fibonacci policy: {allowed_label}")
    return points


def metadata_with_policy_dod(metadata: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    merged = normalize_metadata(metadata)
    merged.setdefault("dod_management", policy.get("dod_management") or "team")
    if not merged.get("dod_items") and policy.get("default_dod_items"):
        merged["dod_items"] = [{"text": item, "done": False} for item in policy["default_dod_items"]]
    if policy.get("dod_management") == "organization":
        merged["dod_source"] = "organization_policy"
    elif policy.get("default_dod_items"):
        merged["dod_source"] = "team_policy_default"
    return merged


def agile_item_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    item = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    item["id"] = str(item["id"])
    item["project_id"] = str(item["project_id"])
    item["sprint_id"] = str(item["sprint_id"]) if item.get("sprint_id") else None
    item["parent_id"] = str(item["parent_id"]) if item.get("parent_id") else None
    item["metadata"] = normalize_metadata(item.get("metadata"))
    return item


async def ensure_project_sprint(
    connection: asyncpg.Connection,
    *,
    sprint_id: UUID,
    project_id: UUID,
    tenant_id: str,
) -> dict[str, Any]:
    record = await connection.fetchrow(
        f"""
        SELECT {AGILE_SPRINT_SELECT}
        FROM wbs_agile_sprints
        WHERE id = $1 AND project_id = $2 AND tenant_id = $3
        """,
        sprint_id,
        project_id,
        tenant_id,
    )
    if not record:
        raise HTTPException(status_code=400, detail="Sprint is not registered in this project")
    return agile_sprint_response(record)


async def ensure_project_agile_item(
    connection: asyncpg.Connection,
    *,
    item_id: UUID,
    project_id: UUID,
    tenant_id: str,
) -> dict[str, Any]:
    record = await connection.fetchrow(
        f"""
        SELECT {AGILE_ITEM_SELECT}
        FROM wbs_agile_items
        WHERE id = $1 AND project_id = $2 AND tenant_id = $3
        """,
        item_id,
        project_id,
        tenant_id,
    )
    if not record:
        raise HTTPException(status_code=400, detail="Agile item is not registered in this project")
    return agile_item_response(record)


async def validate_agile_wbs_link(
    connection: asyncpg.Connection,
    *,
    project_id: UUID,
    tenant_id: str,
    wbs_code: str | None,
) -> str | None:
    clean_code = (wbs_code or "").strip()
    if not clean_code:
        return None
    exists = await connection.fetchval(
        """
        SELECT EXISTS (
          SELECT 1
          FROM wbs_project_wbs_items
          WHERE project_id = $1 AND tenant_id = $2 AND code = $3
        )
        """,
        project_id,
        tenant_id,
        clean_code,
    )
    if not exists:
        raise HTTPException(status_code=400, detail="WBS code is not registered in this project")
    return clean_code


@router.get("/api/projects/{project_id}/agile/sprints")
async def list_project_agile_sprints(project_id: str, request: Request) -> list[dict[str, Any]]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        rows = await connection.fetch(
            f"""
            SELECT {AGILE_SPRINT_SELECT}
            FROM wbs_agile_sprints
            WHERE project_id = $1 AND tenant_id = $2
            ORDER BY start_date, created_at
            """,
            parsed_id,
            project["tenant_id"],
        )
    return [agile_sprint_response(row) for row in rows]


@router.post("/api/projects/{project_id}/agile/sprints", status_code=201)
async def create_project_agile_sprint(
    project_id: str,
    payload: AgileSprintCreate,
    request: Request,
) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id)
            ensure_project_mutate_role(project)
            policy = await fetch_project_operation_policy(connection, project["tenant_id"])
            next_start = payload.start_date or date.today()
            next_end = sprint_end_date_from_policy(next_start, policy, payload.end_date)
            if next_end < next_start:
                raise HTTPException(status_code=400, detail="Sprint end date is earlier than start date")
            metadata = {
                **normalize_metadata(payload.metadata),
                "sprint_length_policy": policy["sprint_length_policy"],
                "openproject_version_sync": policy["openproject_sprint_version_sync"],
            }
            record = await connection.fetchrow(
                f"""
                INSERT INTO wbs_agile_sprints
                  (project_id, tenant_id, name, goal, status, start_date, end_date, capacity_points, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
                RETURNING {AGILE_SPRINT_SELECT}
                """,
                parsed_id,
                project["tenant_id"],
                payload.name.strip(),
                (payload.goal or "").strip(),
                payload.status,
                next_start,
                next_end,
                payload.capacity_points or 0,
                metadata,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="agile.sprint_created",
                entity_type="agile_sprint",
                entity_id=record["id"],
                summary=f"Agile sprint created: {project['name']} / {payload.name}",
                metadata={"project_id": str(parsed_id), "tenant_id": project["tenant_id"]},
            )
    return agile_sprint_response(record)


@router.patch("/api/agile/sprints/{sprint_id}")
async def update_agile_sprint(
    sprint_id: str,
    payload: AgileSprintUpdate,
    request: Request,
) -> dict[str, Any]:
    parsed_id = safe_uuid(sprint_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid sprint id")
    tid = get_tenant_id(request)
    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            current = await connection.fetchrow(
                f"SELECT {AGILE_SPRINT_SELECT} FROM wbs_agile_sprints WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
                parsed_id,
                tid,
            )
            if not current:
                raise HTTPException(status_code=404, detail="Sprint not found")
            ensure_project_mutate_role(await fetch_tenant_project(connection, request, current["project_id"]))
            next_start = payload.start_date if "start_date" in fields_set and payload.start_date else current["start_date"]
            next_end = payload.end_date if "end_date" in fields_set and payload.end_date else current["end_date"]
            if next_end < next_start:
                raise HTTPException(status_code=400, detail="Sprint end date is earlier than start date")
            metadata = normalize_metadata(current.get("metadata"))
            if "metadata" in fields_set and payload.metadata is not None:
                metadata = {**metadata, **payload.metadata}

            record = await connection.fetchrow(
                f"""
                UPDATE wbs_agile_sprints
                SET name = $3,
                    goal = $4,
                    status = $5,
                    start_date = $6,
                    end_date = $7,
                    capacity_points = $8,
                    metadata = $9::jsonb,
                    updated_at = now()
                WHERE id = $1 AND tenant_id = $2
                RETURNING {AGILE_SPRINT_SELECT}
                """,
                parsed_id,
                tid,
                payload.name.strip() if "name" in fields_set and payload.name is not None else current["name"],
                payload.goal.strip() if "goal" in fields_set and payload.goal is not None else current["goal"],
                payload.status if "status" in fields_set and payload.status is not None else current["status"],
                next_start,
                next_end,
                payload.capacity_points if "capacity_points" in fields_set and payload.capacity_points is not None else current["capacity_points"],
                metadata,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="agile.sprint_updated",
                entity_type="agile_sprint",
                entity_id=parsed_id,
                summary=f"Agile sprint updated: {record['name']}",
                metadata={"project_id": str(record["project_id"]), "tenant_id": tid},
            )
    return agile_sprint_response(record)


@router.get("/api/projects/{project_id}/agile/backlog")
async def list_project_agile_backlog(project_id: str, request: Request) -> list[dict[str, Any]]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        rows = await connection.fetch(
            """
            SELECT i.id, i.project_id, i.tenant_id, i.sprint_id, i.parent_id,
                   i.wbs_code, i.item_type, i.title, i.description, i.story_points,
                   i.priority, i.status, i.assignee, i.reviewer,
                   i.acceptance_criteria, i.sort_order, i.metadata,
                   i.created_at, i.updated_at,
                   s.name AS sprint_name,
                   w.name AS wbs_name
            FROM wbs_agile_items i
            LEFT JOIN wbs_agile_sprints s
              ON s.id = i.sprint_id
             AND s.tenant_id = i.tenant_id
             AND s.project_id = i.project_id
            LEFT JOIN wbs_project_wbs_items w
              ON w.project_id = i.project_id
             AND w.tenant_id = i.tenant_id
             AND w.code = i.wbs_code
            WHERE i.project_id = $1 AND i.tenant_id = $2
            ORDER BY i.sort_order, i.created_at
            """,
            parsed_id,
            project["tenant_id"],
        )
    return [agile_item_response(row) for row in rows]


@router.post("/api/projects/{project_id}/agile/backlog", status_code=201)
async def create_project_agile_item(
    project_id: str,
    payload: AgileItemCreate,
    request: Request,
) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id)
            ensure_project_mutate_role(project)
            policy = await fetch_project_operation_policy(connection, project["tenant_id"])
            if payload.sprint_id:
                await ensure_project_sprint(
                    connection,
                    sprint_id=payload.sprint_id,
                    project_id=parsed_id,
                    tenant_id=project["tenant_id"],
                )
            if payload.parent_id:
                await ensure_project_agile_item(
                    connection,
                    item_id=payload.parent_id,
                    project_id=parsed_id,
                    tenant_id=project["tenant_id"],
                )
            wbs_code = await validate_agile_wbs_link(
                connection,
                project_id=parsed_id,
                tenant_id=project["tenant_id"],
                wbs_code=payload.wbs_code,
            )
            story_points = validate_story_points_for_policy(payload.story_points, policy)
            metadata = metadata_with_policy_dod(payload.metadata, policy)
            sort_order = await connection.fetchval(
                "SELECT COALESCE(max(sort_order), 0) + 1 FROM wbs_agile_items WHERE project_id = $1 AND tenant_id = $2",
                parsed_id,
                project["tenant_id"],
            )
            record = await connection.fetchrow(
                f"""
                INSERT INTO wbs_agile_items
                  (project_id, tenant_id, sprint_id, parent_id, wbs_code, item_type,
                   title, description, story_points, priority, status, assignee,
                   reviewer, acceptance_criteria, sort_order, metadata)
                VALUES
                  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
                RETURNING {AGILE_ITEM_SELECT}
                """,
                parsed_id,
                project["tenant_id"],
                payload.sprint_id,
                payload.parent_id,
                wbs_code,
                payload.item_type,
                payload.title.strip(),
                (payload.description or "").strip(),
                story_points,
                payload.priority,
                payload.status,
                (payload.assignee or "").strip() or None,
                (payload.reviewer or "").strip() or None,
                (payload.acceptance_criteria or "").strip(),
                sort_order,
                metadata,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="agile.item_created",
                entity_type="agile_item",
                entity_id=record["id"],
                summary=f"Agile item created: {project['name']} / {payload.title}",
                metadata={"project_id": str(parsed_id), "tenant_id": project["tenant_id"], "wbs_code": wbs_code},
            )
    return agile_item_response(record)


@router.patch("/api/agile/items/{item_id}")
async def update_agile_item(
    item_id: str,
    payload: AgileItemUpdate,
    request: Request,
) -> dict[str, Any]:
    user = require_roles(request, {"admin", "pmo", "viewer"})
    parsed_id = safe_uuid(item_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid agile item id")
    tid = get_tenant_id(request)
    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            current = await connection.fetchrow(
                f"SELECT {AGILE_ITEM_SELECT} FROM wbs_agile_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
                parsed_id,
                tid,
            )
            if not current:
                raise HTTPException(status_code=404, detail="Agile item not found")
            current_item = agile_item_response(current)
            project = await fetch_tenant_project(connection, request, current["project_id"])
            policy = await fetch_project_operation_policy(connection, tid)
            if project["_project_role"] not in PROJECT_MUTATING_ROLES:
                assignee_key = work_item_identity_key(current_item.get("assignee"))
                user_keys = work_item_user_tokens(user)
                if assignee_key not in user_keys:
                    raise HTTPException(status_code=403, detail="Only PMO/admin or assigned users can update this agile item")

            sprint_id = current["sprint_id"]
            if "sprint_id" in fields_set:
                sprint_id = payload.sprint_id
                if sprint_id:
                    await ensure_project_sprint(
                        connection,
                        sprint_id=sprint_id,
                        project_id=current["project_id"],
                        tenant_id=tid,
                    )
            parent_id = current["parent_id"]
            if "parent_id" in fields_set:
                parent_id = payload.parent_id
                if parent_id:
                    if parent_id == parsed_id:
                        raise HTTPException(status_code=400, detail="Agile item cannot be its own parent")
                    await ensure_project_agile_item(
                        connection,
                        item_id=parent_id,
                        project_id=current["project_id"],
                        tenant_id=tid,
                    )
            wbs_code = current["wbs_code"]
            if "wbs_code" in fields_set:
                wbs_code = await validate_agile_wbs_link(
                    connection,
                    project_id=current["project_id"],
                    tenant_id=tid,
                    wbs_code=payload.wbs_code,
                )
            metadata = normalize_metadata(current.get("metadata"))
            if "metadata" in fields_set and payload.metadata is not None:
                metadata = {**metadata, **payload.metadata}
            next_status = payload.status if "status" in fields_set and payload.status is not None else current["status"]
            if next_status == "Done" and current["status"] != "Done":
                metadata["done_at"] = utc_now_iso()
            if next_status != "Done" and current["status"] == "Done":
                metadata.pop("done_at", None)
            next_story_points = (
                validate_story_points_for_policy(payload.story_points, policy)
                if "story_points" in fields_set and payload.story_points is not None
                else current["story_points"]
            )

            record = await connection.fetchrow(
                f"""
                UPDATE wbs_agile_items
                SET sprint_id = $3,
                    parent_id = $4,
                    wbs_code = $5,
                    item_type = $6,
                    title = $7,
                    description = $8,
                    story_points = $9,
                    priority = $10,
                    status = $11,
                    assignee = $12,
                    reviewer = $13,
                    acceptance_criteria = $14,
                    metadata = $15::jsonb,
                    updated_at = now()
                WHERE id = $1 AND tenant_id = $2
                RETURNING {AGILE_ITEM_SELECT}
                """,
                parsed_id,
                tid,
                sprint_id,
                parent_id,
                wbs_code,
                payload.item_type if "item_type" in fields_set and payload.item_type is not None else current["item_type"],
                payload.title.strip() if "title" in fields_set and payload.title is not None else current["title"],
                payload.description.strip() if "description" in fields_set and payload.description is not None else current["description"],
                next_story_points,
                payload.priority if "priority" in fields_set and payload.priority is not None else current["priority"],
                next_status,
                payload.assignee.strip() if "assignee" in fields_set and payload.assignee is not None else current["assignee"],
                payload.reviewer.strip() if "reviewer" in fields_set and payload.reviewer is not None else current["reviewer"],
                payload.acceptance_criteria.strip() if "acceptance_criteria" in fields_set and payload.acceptance_criteria is not None else current["acceptance_criteria"],
                metadata,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="agile.item_updated",
                entity_type="agile_item",
                entity_id=parsed_id,
                summary=f"Agile item updated: {record['title']}",
                metadata={"project_id": str(record["project_id"]), "tenant_id": tid, "status": next_status, "wbs_code": wbs_code},
            )
    return agile_item_response(record)


@router.delete("/api/agile/items/{item_id}")
async def delete_agile_item(item_id: str, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(item_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid agile item id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            current = await connection.fetchrow(
                f"SELECT {AGILE_ITEM_SELECT} FROM wbs_agile_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
                parsed_id,
                tid,
            )
            if not current:
                raise HTTPException(status_code=404, detail="Agile item not found")
            ensure_project_mutate_role(await fetch_tenant_project(connection, request, current["project_id"]))
            record = await connection.fetchrow(
                f"DELETE FROM wbs_agile_items WHERE id = $1 AND tenant_id = $2 RETURNING {AGILE_ITEM_SELECT}",
                parsed_id,
                tid,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="agile.item_deleted",
                entity_type="agile_item",
                entity_id=parsed_id,
                summary=f"Agile item deleted: {record['title']}",
                metadata={"project_id": str(record["project_id"]), "tenant_id": tid},
            )
    return {"status": "Deleted", "item": agile_item_response(record)}


@router.get("/api/projects/{project_id}/agile/metrics")
async def get_project_agile_metrics(project_id: str, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        tid = project["tenant_id"]
        totals = await connection.fetchrow(
            """
            SELECT count(*)::integer AS total_items,
                   COALESCE(sum(story_points), 0) AS total_points,
                   COALESCE(sum(story_points) FILTER (WHERE status = 'Done'), 0) AS done_points,
                   count(*) FILTER (WHERE sprint_id IS NULL)::integer AS backlog_items,
                   count(*) FILTER (WHERE wbs_code IS NOT NULL AND wbs_code <> '')::integer AS hybrid_links
            FROM wbs_agile_items
            WHERE project_id = $1 AND tenant_id = $2
            """,
            parsed_id,
            tid,
        )
        status_rows = await connection.fetch(
            """
            SELECT status, count(*)::integer AS count, COALESCE(sum(story_points), 0) AS points
            FROM wbs_agile_items
            WHERE project_id = $1 AND tenant_id = $2
            GROUP BY status
            ORDER BY status
            """,
            parsed_id,
            tid,
        )
        type_rows = await connection.fetch(
            """
            SELECT item_type, count(*)::integer AS count, COALESCE(sum(story_points), 0) AS points
            FROM wbs_agile_items
            WHERE project_id = $1 AND tenant_id = $2
            GROUP BY item_type
            ORDER BY item_type
            """,
            parsed_id,
            tid,
        )
        sprint_rows = await connection.fetch(
            """
            SELECT s.id, s.name, s.status, s.start_date, s.end_date, s.capacity_points,
                   count(i.id)::integer AS item_count,
                   COALESCE(sum(i.story_points), 0) AS planned_points,
                   COALESCE(sum(i.story_points) FILTER (WHERE i.status = 'Done'), 0) AS done_points
            FROM wbs_agile_sprints s
            LEFT JOIN wbs_agile_items i
              ON i.sprint_id = s.id
             AND i.tenant_id = s.tenant_id
             AND i.project_id = s.project_id
            WHERE s.project_id = $1 AND s.tenant_id = $2
            GROUP BY s.id, s.name, s.status, s.start_date, s.end_date, s.capacity_points
            ORDER BY s.start_date, s.created_at
            """,
            parsed_id,
            tid,
        )
        wbs_rows = await connection.fetch(
            """
            SELECT i.wbs_code,
                   COALESCE(w.name, i.wbs_code) AS wbs_name,
                   count(i.id)::integer AS item_count,
                   COALESCE(sum(i.story_points), 0) AS total_points,
                   COALESCE(sum(i.story_points) FILTER (WHERE i.status = 'Done'), 0) AS done_points
            FROM wbs_agile_items i
            LEFT JOIN wbs_project_wbs_items w
              ON w.project_id = i.project_id
             AND w.tenant_id = i.tenant_id
             AND w.code = i.wbs_code
            WHERE i.project_id = $1
              AND i.tenant_id = $2
              AND i.wbs_code IS NOT NULL
              AND i.wbs_code <> ''
            GROUP BY i.wbs_code, w.name
            ORDER BY i.wbs_code
            """,
            parsed_id,
            tid,
        )

    totals_dict = normalize_record(totals) if totals else {}
    total_points = float(totals_dict.get("total_points") or 0)
    done_points = float(totals_dict.get("done_points") or 0)
    totals_dict["completion_rate"] = round(done_points / total_points * 100, 1) if total_points else 0
    velocity_history = [normalize_record(row) for row in sprint_rows]
    today = date.today()
    active_sprint = next((row for row in velocity_history if row.get("status") == "Active"), None)
    if not active_sprint:
        active_sprint = next((
            row for row in velocity_history
            if row.get("start_date") and row.get("end_date") and row["start_date"] <= today.isoformat() <= row["end_date"]
        ), None)
    burndown: dict[str, Any] | None = None
    if active_sprint:
        start = parse_date(active_sprint.get("start_date"))
        end = parse_date(active_sprint.get("end_date"))
        planned = float(active_sprint.get("planned_points") or 0)
        done = float(active_sprint.get("done_points") or 0)
        if start and end:
            days_count = max(1, (end - start).days + 1)
            days = []
            for idx in range(days_count):
                current_day = start + timedelta(days=idx)
                ideal = max(0, planned - (planned * idx / max(1, days_count - 1)))
                actual = None
                if current_day <= today:
                    actual = max(0, planned - done)
                days.append({
                    "date": current_day.isoformat(),
                    "ideal_remaining": round(ideal, 2),
                    "actual_remaining": round(actual, 2) if actual is not None else None,
                })
            burndown = {
                "sprint_id": active_sprint["id"],
                "name": active_sprint["name"],
                "planned_points": planned,
                "done_points": done,
                "remaining_points": max(0, planned - done),
                "days": days,
            }

    return {
        "project_id": str(parsed_id),
        "delivery_mode": project.get("delivery_mode") or "waterfall",
        "totals": totals_dict,
        "status_counts": [normalize_record(row) for row in status_rows],
        "type_counts": [normalize_record(row) for row in type_rows],
        "velocity_history": velocity_history,
        "active_sprint": active_sprint,
        "burndown": burndown,
        "wbs_progress": [
            {
                **normalize_record(row),
                "completion_rate": round(
                    float(row["done_points"] or 0) / float(row["total_points"] or 0) * 100,
                    1,
                ) if float(row["total_points"] or 0) else 0,
            }
            for row in wbs_rows
        ],
    }


def _wbs_to_agile_type(item_type: str | None) -> str:
    return _WBS_TO_AGILE_TYPE.get((item_type or "").strip(), "Story")


@router.post("/api/projects/{project_id}/agile/sync-from-wbs")
async def sync_agile_from_wbs(project_id: str, request: Request) -> dict[str, Any]:
    """WBS 항목을 Agile 백로그에 자동 동기화합니다.
    - source='wbs' 항목은 WBS 원본 기준으로 덮어씁니다.
    - source='manual' 항목(직접 생성)은 건드리지 않습니다.
    - sprint_id, story_points는 이미 설정된 값을 보존합니다.
    """
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        tid = project["tenant_id"]

        wbs_rows = await connection.fetch(
            """
            SELECT code, name, item_type, owner, weight, metadata
            FROM wbs_project_wbs_items
            WHERE project_id = $1
            ORDER BY sort_order
            """,
            parsed_id,
        )

        existing = await connection.fetch(
            """
            SELECT id, wbs_code, sprint_id, story_points, source
            FROM wbs_agile_items
            WHERE project_id = $1 AND tenant_id = $2
            """,
            parsed_id,
            tid,
        )
        existing_wbs: dict[str, dict] = {
            row["wbs_code"]: dict(row)
            for row in existing
            if row["wbs_code"]
        }

        created = updated = skipped = 0

        async with connection.transaction():
            for row in wbs_rows:
                code = row["code"]
                meta = normalize_metadata(row.get("metadata"))
                wbs_status = meta.get("status") or "대기"
                agile_status = _wbs_to_agile_status(wbs_status)
                agile_type = _wbs_to_agile_type(row["item_type"])
                title = (row["name"] or code).strip()
                assignee = (row["owner"] or "").strip() or None
                reviewer = (meta.get("reviewer") or "").strip() or None

                if code in existing_wbs:
                    ex = existing_wbs[code]
                    if ex["source"] == "manual":
                        skipped += 1
                        continue
                    # 기존 WBS 동기화 항목: sprint/SP 보존, 나머지 갱신
                    preserved_sp = ex["story_points"] if ex["story_points"] else (
                        float(row["weight"] or 1)
                    )
                    await connection.execute(
                        """
                        UPDATE wbs_agile_items
                        SET title = $1, item_type = $2, status = $3,
                            assignee = $4, reviewer = $5,
                            story_points = $6, updated_at = now()
                        WHERE id = $7
                        """,
                        title, agile_type, agile_status,
                        assignee, reviewer,
                        preserved_sp, ex["id"],
                    )
                    updated += 1
                else:
                    sp = float(row["weight"] or 1)
                    sort_order = await connection.fetchval(
                        "SELECT COALESCE(max(sort_order), 0) + 1 FROM wbs_agile_items WHERE project_id = $1 AND tenant_id = $2",
                        parsed_id, tid,
                    )
                    await connection.execute(
                        """
                        INSERT INTO wbs_agile_items
                          (project_id, tenant_id, wbs_code, item_type, title,
                           story_points, status, assignee, reviewer, sort_order,
                           source, metadata)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'wbs', $11::jsonb)
                        """,
                        parsed_id, tid, code, agile_type, title,
                        sp, agile_status, assignee, reviewer, sort_order,
                        json.dumps({"wbs_code": code, "synced": True}, ensure_ascii=False),
                    )
                    created += 1

            # WBS에서 삭제된 항목과 연결된 자동 동기화(source='wbs') Agile 항목 정리
            current_codes = [row["code"] for row in wbs_rows if row["code"]]
            deleted_rows = await connection.fetch(
                """
                DELETE FROM wbs_agile_items
                WHERE project_id = $1 AND tenant_id = $2 AND source = 'wbs'
                  AND wbs_code IS NOT NULL AND wbs_code != ALL($3::text[])
                RETURNING id
                """,
                parsed_id, tid, current_codes,
            )
            deleted = len(deleted_rows)

        await insert_audit_event(
            connection,
            request=request,
            event_type="agile.synced_from_wbs",
            entity_type="agile_items",
            entity_id=str(parsed_id),
            summary=f"WBS→Agile 동기화: {project['name']} / 생성 {created} 갱신 {updated} 보존 {skipped} 삭제 {deleted}",
            metadata={"created": created, "updated": updated, "skipped": skipped, "deleted": deleted},
        )

    return {"created": created, "updated": updated, "skipped": skipped, "deleted": deleted}
