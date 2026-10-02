"""회의·Action Item API 라우터.
"""
import json
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import ACTION_ITEM_FROM, ACTION_ITEM_SELECT, MEETING_TYPES, PROJECT_MUTATING_ROLES
from app.core.db import get_pool, normalize_metadata, normalize_record, safe_uuid, utc_now_iso
from app.core.notify import _notify_action_assignee, resolve_work_item_notification_users
from app.core.security import (
    ensure_project_collab_role,
    ensure_project_mutate_role,
    get_tenant_id,
    require_roles,
    work_item_identity_key,
    work_item_user_tokens,
)
from app.schemas import ActionItemInput, ActionItemUpdate, MeetingCreate, MeetingUpdate
from app.services.meetings import _scan_action_item_alerts, serialize_action_item
from app.services.projects import fetch_tenant_project

router = APIRouter()


def action_item_matches_user(item: dict[str, Any], user: dict[str, Any]) -> bool:
    if item.get("assignee_user_id") and str(item["assignee_user_id"]) == str(user.get("id")):
        return True
    key = work_item_identity_key(item.get("assignee"))
    return bool(key) and key in work_item_user_tokens(user)


async def _resolve_assignee(
    connection: asyncpg.Connection, tenant_id: str, project_id: UUID,
    assignee: str | None, assignee_user_id: UUID | None,
) -> tuple[str | None, UUID | None, dict[str, Any] | None]:
    """담당자 이름/ID → (표시명, user_id, user). 프로젝트 멤버(또는 테넌트 사용자) 기준."""
    if assignee_user_id:
        user = await connection.fetchrow(
            "SELECT id, email, display_name FROM wbs_users WHERE id = $1 AND tenant_id = $2 AND status = 'Active'",
            assignee_user_id, tenant_id,
        )
        if not user:
            raise HTTPException(status_code=400, detail="담당자를 찾을 수 없습니다")
        return (user["display_name"] or user["email"], user["id"], normalize_record(user))
    name = (assignee or "").strip() or None
    if not name:
        return (None, None, None)
    users = await resolve_work_item_notification_users(connection, tenant_id, [name])
    if len(users) == 1:
        return (name, safe_uuid(users[0]["id"]), users[0])
    return (name, None, None)


async def _validate_links(
    connection: asyncpg.Connection, project_id: UUID, wbs_code: str | None, issue_id: UUID | None,
) -> None:
    if wbs_code:
        ok = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM wbs_project_wbs_items WHERE project_id = $1 AND code = $2)",
            project_id, wbs_code,
        )
        if not ok:
            raise HTTPException(status_code=400, detail=f"WBS 코드 '{wbs_code}'가 이 프로젝트에 없습니다")
    if issue_id:
        ok = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM wbs_issues WHERE id = $1 AND project_id = $2)", issue_id, project_id,
        )
        if not ok:
            raise HTTPException(status_code=400, detail="연결할 이슈가 이 프로젝트에 없습니다")


async def _insert_action_item(
    connection: asyncpg.Connection, request: Request, project: dict[str, Any],
    payload: ActionItemInput, *, meeting_id: UUID | None, source: str,
) -> dict[str, Any]:
    actor = getattr(request.state, "user", None) or {}
    await _validate_links(connection, project["id"], payload.wbs_code, payload.issue_id)
    name, user_id, assignee_user = await _resolve_assignee(
        connection, project["tenant_id"], project["id"], payload.assignee, payload.assignee_user_id
    )
    record = await connection.fetchrow(
        """
        INSERT INTO wbs_action_items
          (tenant_id, project_id, meeting_id, title, description, assignee, assignee_user_id,
           due_date, status, priority, wbs_code, issue_id, source, completed_at,
           created_by, created_by_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                CASE WHEN $9 = '완료' THEN now() ELSE NULL END, $14, $15)
        RETURNING id, meeting_id, title, due_date
        """,
        project["tenant_id"], project["id"], meeting_id, payload.title.strip(), payload.description,
        name, user_id, payload.due_date, payload.status, payload.priority,
        (payload.wbs_code or None), payload.issue_id, source,
        safe_uuid(actor.get("id")), actor.get("display_name") or actor.get("email"),
    )
    item = normalize_record(record)
    if assignee_user and str(assignee_user.get("id")) != str(actor.get("id")):
        await _notify_action_assignee(
            connection, project=project, item=item, user=assignee_user,
            event_type="action_item.assigned", title="Action Item 배정",
        )
    return item


async def _fetch_action_item(connection: asyncpg.Connection, item_id: UUID, tenant_id: str) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"SELECT {ACTION_ITEM_SELECT} {ACTION_ITEM_FROM} WHERE a.id = $1 AND a.tenant_id = $2",
        item_id, tenant_id,
    )
    return serialize_action_item(record) if record else None


def _serialize_meeting(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    m = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    for key in ("id", "project_id", "created_by"):
        if m.get(key) is not None:
            m[key] = str(m[key])
    if isinstance(m.get("attendees"), str):
        try:
            m["attendees"] = json.loads(m["attendees"])
        except ValueError:
            m["attendees"] = []
    m["metadata"] = normalize_metadata(m.get("metadata"))
    return m


MEETING_SELECT = """
    m.id, m.tenant_id, m.project_id, m.title, m.meeting_type, m.meeting_date, m.start_time,
    m.location, m.facilitator, m.attendees, m.agenda, m.minutes, m.decisions, m.status,
    m.metadata, m.created_by, m.created_by_name, m.created_at, m.updated_at,
    p.name AS project_name,
    (SELECT count(*) FROM wbs_action_items x WHERE x.meeting_id = m.id)::int AS action_count,
    (SELECT count(*) FROM wbs_action_items x WHERE x.meeting_id = m.id AND x.status NOT IN ('완료','취소'))::int AS open_action_count
"""


@router.get("/api/projects/{project_id}/meetings")
async def list_project_meetings(project_id: str, request: Request) -> list[dict[str, Any]]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        records = await connection.fetch(
            f"""
            SELECT {MEETING_SELECT}
            FROM wbs_meetings m JOIN wbs_projects p ON p.id = m.project_id
            WHERE m.project_id = $1 AND m.deleted_at IS NULL
            ORDER BY m.meeting_date DESC, m.created_at DESC
            LIMIT 200
            """,
            parsed_id,
        )
    return [_serialize_meeting(r) for r in records]


@router.post("/api/projects/{project_id}/meetings", status_code=201)
async def create_project_meeting(project_id: str, payload: MeetingCreate, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    if payload.meeting_type not in MEETING_TYPES:
        raise HTTPException(status_code=400, detail=f"회의 유형은 {', '.join(sorted(MEETING_TYPES))} 중 하나입니다")
    actor = getattr(request.state, "user", None) or {}
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id)
            ensure_project_collab_role(project)
            record = await connection.fetchrow(
                """
                INSERT INTO wbs_meetings
                  (tenant_id, project_id, title, meeting_type, meeting_date, start_time, location,
                   facilitator, attendees, agenda, minutes, decisions, status, created_by, created_by_name)
                VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15)
                RETURNING id
                """,
                project["tenant_id"], parsed_id, payload.title.strip(), payload.meeting_type,
                payload.meeting_date, payload.start_time, payload.location, payload.facilitator,
                [a.strip() for a in payload.attendees if a and a.strip()],
                payload.agenda, payload.minutes, payload.decisions, payload.status,
                safe_uuid(actor.get("id")), actor.get("display_name") or actor.get("email"),
            )
            meeting_id = record["id"]
            for ai in payload.action_items:
                await _insert_action_item(connection, request, project, ai, meeting_id=meeting_id, source="meeting")
            await insert_audit_event(
                connection, request=request, event_type="meeting.created",
                entity_type="meeting", entity_id=meeting_id,
                summary=f"회의 등록: {project['name']} / {payload.title}",
                metadata={"project_id": str(parsed_id), "action_items": len(payload.action_items)},
            )
    return await get_meeting(str(meeting_id), request)


@router.get("/api/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(meeting_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid meeting id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        record = await connection.fetchrow(
            f"""
            SELECT {MEETING_SELECT}
            FROM wbs_meetings m JOIN wbs_projects p ON p.id = m.project_id
            WHERE m.id = $1 AND m.tenant_id = $2 AND m.deleted_at IS NULL
            """,
            parsed_id, tid,
        )
        if not record:
            raise HTTPException(status_code=404, detail="Meeting not found")
        project = await fetch_tenant_project(connection, request, record["project_id"])
        items = await connection.fetch(
            f"SELECT {ACTION_ITEM_SELECT} {ACTION_ITEM_FROM} WHERE a.meeting_id = $1 "
            "ORDER BY a.created_at, COALESCE(a.due_date, DATE '9999-12-31'), a.title",
            parsed_id,
        )
    meeting = _serialize_meeting(record)
    meeting["action_items"] = [serialize_action_item(r) for r in items]
    meeting["project_role"] = project["_project_role"]
    return meeting


@router.patch("/api/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, payload: MeetingUpdate, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(meeting_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid meeting id")
    tid = get_tenant_id(request)
    actor = getattr(request.state, "user", None) or {}
    fields = payload.model_dump(exclude_unset=True)
    if "meeting_type" in fields and fields["meeting_type"] not in MEETING_TYPES:
        raise HTTPException(status_code=400, detail="Invalid meeting type")
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            current = await connection.fetchrow(
                "SELECT * FROM wbs_meetings WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE",
                parsed_id, tid,
            )
            if not current:
                raise HTTPException(status_code=404, detail="Meeting not found")
            project = await fetch_tenant_project(connection, request, current["project_id"])
            is_author = current["created_by"] and str(current["created_by"]) == str(actor.get("id"))
            if project["_project_role"] not in PROJECT_MUTATING_ROLES and not is_author:
                raise HTTPException(status_code=403, detail="작성자 또는 PM/PMO만 수정할 수 있습니다")
            allowed = ["title", "meeting_type", "meeting_date", "start_time", "location", "facilitator",
                       "attendees", "agenda", "minutes", "decisions", "status"]
            sets, values = [], []
            for key in allowed:
                if key in fields:
                    value = fields[key]
                    if key == "attendees":
                        value = [a.strip() for a in (value or []) if a and a.strip()]
                        sets.append(f"{key} = ${len(values) + 2}::jsonb")
                    else:
                        sets.append(f"{key} = ${len(values) + 2}")
                    values.append(value)
            if sets:
                await connection.execute(
                    f"UPDATE wbs_meetings SET {', '.join(sets)}, updated_at = now() WHERE id = $1",
                    parsed_id, *values,
                )
                await insert_audit_event(
                    connection, request=request, event_type="meeting.updated",
                    entity_type="meeting", entity_id=parsed_id,
                    summary=f"회의 수정: {project['name']} / {fields.get('title') or current['title']}",
                    metadata={"fields": sorted(fields.keys())},
                )
    return await get_meeting(meeting_id, request)


@router.delete("/api/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(meeting_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid meeting id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            current = await connection.fetchrow(
                "SELECT id, project_id, title FROM wbs_meetings WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL",
                parsed_id, tid,
            )
            if not current:
                raise HTTPException(status_code=404, detail="Meeting not found")
            project = await fetch_tenant_project(connection, request, current["project_id"])
            ensure_project_mutate_role(project)
            await connection.execute("UPDATE wbs_meetings SET deleted_at = now() WHERE id = $1", parsed_id)
            await insert_audit_event(
                connection, request=request, event_type="meeting.deleted",
                entity_type="meeting", entity_id=parsed_id,
                summary=f"회의 삭제(보존): {project['name']} / {current['title']}",
            )
    return {"id": meeting_id, "deleted": True}


@router.get("/api/projects/{project_id}/action-items")
async def list_project_action_items(
    project_id: str, request: Request, status: str | None = None, mine: bool = False,
    wbs_code: str | None = None, issue_id: str | None = None,
) -> list[dict[str, Any]]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    user = getattr(request.state, "user", None) or {}
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        where, params = ["a.project_id = $1"], [parsed_id]
        if status == "open":
            where.append("a.status NOT IN ('완료','취소')")
        elif status:
            params.append(status)
            where.append(f"a.status = ${len(params)}")
        if wbs_code:
            params.append(wbs_code)
            where.append(f"a.wbs_code = ${len(params)}")
        if issue_id and safe_uuid(issue_id):
            params.append(safe_uuid(issue_id))
            where.append(f"a.issue_id = ${len(params)}")
        records = await connection.fetch(
            f"""
            SELECT {ACTION_ITEM_SELECT} {ACTION_ITEM_FROM}
            WHERE {' AND '.join(where)}
            ORDER BY (a.status IN ('완료','취소')), COALESCE(a.due_date, DATE '9999-12-31'), a.created_at
            LIMIT 500
            """,
            *params,
        )
    items = [serialize_action_item(r) for r in records]
    if mine:
        items = [i for i in items if action_item_matches_user(i, user)]
    return items


@router.post("/api/projects/{project_id}/action-items", status_code=201)
async def create_project_action_item(project_id: str, payload: ActionItemInput, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    meeting_id = safe_uuid(request.query_params.get("meeting_id")) if request.query_params.get("meeting_id") else None
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id)
            ensure_project_collab_role(project)
            if meeting_id:
                ok = await connection.fetchval(
                    "SELECT EXISTS (SELECT 1 FROM wbs_meetings WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL)",
                    meeting_id, parsed_id,
                )
                if not ok:
                    raise HTTPException(status_code=400, detail="회의를 찾을 수 없습니다")
            item = await _insert_action_item(
                connection, request, project, payload,
                meeting_id=meeting_id, source="meeting" if meeting_id else "manual",
            )
            await insert_audit_event(
                connection, request=request, event_type="action_item.created",
                entity_type="action_item", entity_id=item["id"],
                summary=f"Action Item 등록: {project['name']} / {payload.title}",
                metadata={"wbs_code": payload.wbs_code, "issue_id": str(payload.issue_id) if payload.issue_id else None},
            )
        return await _fetch_action_item(connection, item["id"], project["tenant_id"])


@router.patch("/api/action-items/{item_id}")
async def update_action_item(item_id: str, payload: ActionItemUpdate, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(item_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid action item id")
    tid = get_tenant_id(request)
    actor = getattr(request.state, "user", None) or {}
    fields = payload.model_dump(exclude_unset=True)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            current = await _fetch_action_item(connection, parsed_id, tid)
            if not current:
                raise HTTPException(status_code=404, detail="Action item not found")
            project = await fetch_tenant_project(connection, request, safe_uuid(current["project_id"]))
            is_author = current.get("created_by") and current["created_by"] == str(actor.get("id"))
            is_assignee = action_item_matches_user(current, actor)
            can_edit_all = project["_project_role"] in PROJECT_MUTATING_ROLES or is_author
            if not can_edit_all and not is_assignee:
                raise HTTPException(status_code=403, detail="담당자·작성자 또는 PM/PMO만 수정할 수 있습니다")
            if not can_edit_all:
                # 담당자는 진행 상태·코멘트만 갱신
                blocked = set(fields) - {"status", "comment"}
                if blocked:
                    raise HTTPException(status_code=403, detail="담당자는 상태와 코멘트만 변경할 수 있습니다")
            await _validate_links(
                connection, project["id"],
                fields.get("wbs_code") if "wbs_code" in fields else None,
                fields.get("issue_id") if "issue_id" in fields else None,
            )
            metadata = normalize_metadata(current.get("metadata"))
            sets, values = [], []

            def put(col: str, value: Any) -> None:
                values.append(value)
                sets.append(f"{col} = ${len(values) + 1}")

            new_assignee_user = None
            if "assignee" in fields or "assignee_user_id" in fields:
                name, user_id, new_assignee_user = await _resolve_assignee(
                    connection, tid, project["id"], fields.get("assignee"), fields.get("assignee_user_id")
                )
                put("assignee", name)
                put("assignee_user_id", user_id)
            for col in ("title", "description", "due_date", "priority", "wbs_code", "issue_id"):
                if col in fields:
                    put(col, fields[col] or None if col in ("wbs_code",) else fields[col])
            if "status" in fields:
                put("status", fields["status"])
                if fields["status"] == "완료" and current.get("status") != "완료":
                    sets.append("completed_at = now()")
                elif fields["status"] != "완료":
                    sets.append("completed_at = NULL")
            if fields.get("comment"):
                comments = list(metadata.get("comments") or [])
                comments.append({
                    "author": actor.get("display_name") or actor.get("email"),
                    "text": fields["comment"].strip(),
                    "ts": utc_now_iso(),
                })
                metadata["comments"] = comments[-50:]
            history = list(metadata.get("history") or [])
            changed = sorted(k for k in fields if k != "comment")
            if changed:
                history.append({"actor": actor.get("display_name") or actor.get("email"),
                                "fields": changed, "at": utc_now_iso()})
                metadata["history"] = history[-50:]
            put("metadata", metadata)
            sets[-1] = sets[-1] + "::jsonb"
            await connection.execute(
                f"UPDATE wbs_action_items SET {', '.join(sets)}, updated_at = now() WHERE id = $1",
                parsed_id, *values,
            )
            updated = await _fetch_action_item(connection, parsed_id, tid)
            if new_assignee_user and str(new_assignee_user.get("id")) != str(actor.get("id")):
                await _notify_action_assignee(
                    connection, project=project, item=updated, user=new_assignee_user,
                    event_type="action_item.assigned", title="Action Item 배정",
                )
            await insert_audit_event(
                connection, request=request, event_type="action_item.updated",
                entity_type="action_item", entity_id=parsed_id,
                summary=f"Action Item 수정: {project['name']} / {updated['title']}",
                metadata={"fields": changed},
            )
    return updated


@router.delete("/api/action-items/{item_id}")
async def delete_action_item(item_id: str, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(item_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid action item id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            current = await _fetch_action_item(connection, parsed_id, tid)
            if not current:
                raise HTTPException(status_code=404, detail="Action item not found")
            project = await fetch_tenant_project(connection, request, safe_uuid(current["project_id"]))
            ensure_project_mutate_role(project)
            await connection.execute("DELETE FROM wbs_action_items WHERE id = $1", parsed_id)
            await insert_audit_event(
                connection, request=request, event_type="action_item.deleted",
                entity_type="action_item", entity_id=parsed_id,
                summary=f"Action Item 삭제: {project['name']} / {current['title']}",
            )
    return {"id": item_id, "deleted": True}


@router.get("/api/me/action-items")
async def list_my_action_items(request: Request, include_closed: bool = False) -> list[dict[str, Any]]:
    """내 작업 — 나에게 배정된 Action Item (멤버인 프로젝트 범위)."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        params: list[Any] = [tid]
        member_filter = ""
        if user.get("role") != "admin":
            params.append(safe_uuid(user.get("id")))
            member_filter = f"""AND EXISTS (SELECT 1 FROM wbs_project_members pm
                                WHERE pm.project_id = a.project_id AND pm.user_id = ${len(params)})"""
        closed_filter = "" if include_closed else "AND a.status NOT IN ('완료','취소')"
        records = await connection.fetch(
            f"""
            SELECT {ACTION_ITEM_SELECT} {ACTION_ITEM_FROM}
            WHERE a.tenant_id = $1 {member_filter} {closed_filter}
            ORDER BY COALESCE(a.due_date, DATE '9999-12-31'), a.created_at
            LIMIT 500
            """,
            *params,
        )
    return [i for i in (serialize_action_item(r) for r in records) if action_item_matches_user(i, user)]


@router.post("/api/action-items/alerts/scan")
async def scan_action_item_alerts(request: Request) -> dict[str, Any]:
    """기한 경과 Action Item 담당자에게 하루 1회 지연 알림."""
    require_roles(request, {"admin", "pmo"})
    return await _scan_action_item_alerts(get_pool(request), get_tenant_id(request))
