"""알림·공지사항 API 라우터.
"""
from typing import Any
from uuid import UUID
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import MUTATING_ROLES
from app.core.db import get_pool, normalize_record, safe_uuid
from app.core.notify import send_notification
from app.core.security import get_tenant_id, require_mutating_role
from app.schemas import AnnouncementCreate, AnnouncementUpdate
from app.services.projects import fetch_project, fetch_tenant_project

router = APIRouter()


@router.get("/api/notifications")
async def list_notifications(request: Request, limit: int = 30) -> list[dict[str, Any]]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    async with get_pool(request).acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT * FROM wbs_notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            UUID(str(user["id"])), limit,
        )
        return [normalize_record(row) for row in rows]


@router.post("/api/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, request: Request) -> dict[str, Any]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        nid = UUID(notif_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification id")
    async with get_pool(request).acquire() as connection:
        row = await connection.fetchrow(
            "UPDATE wbs_notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *",
            nid, UUID(str(user["id"])),
        )
        if not row:
            raise HTTPException(status_code=404, detail="Notification not found")
        return normalize_record(row)


@router.post("/api/notifications/read-all")
async def mark_all_notifications_read(request: Request) -> dict[str, Any]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    async with get_pool(request).acquire() as connection:
        count = await connection.fetchval(
            "UPDATE wbs_notifications SET is_read = true WHERE user_id = $1 AND is_read = false RETURNING count(*)",
            UUID(str(user["id"])),
        ) or 0
        return {"updated": count}


@router.get("/api/announcements")
async def list_announcements(request: Request, project_id: str | None = None) -> list[dict[str, Any]]:
    tid = get_tenant_id(request)
    user = getattr(request.state, "user", None) or {}
    # admin/pmo는 테넌트 내 모든 공지(프로젝트 멤버십 무관)를 조회·관리할 수 있다.
    is_tenant_manager = user.get("role") in MUTATING_ROLES
    user_id = safe_uuid(user.get("id"))

    async with get_pool(request).acquire() as connection:
        if project_id:
            parsed_pid = safe_uuid(project_id)
            if not parsed_pid:
                raise HTTPException(status_code=400, detail="Invalid project id")
            if is_tenant_manager:
                project = await fetch_project(connection, parsed_pid, tid)
                if not project:
                    raise HTTPException(status_code=404, detail="Project not found")
            else:
                await fetch_tenant_project(connection, request, parsed_pid)
            records = await connection.fetch(
                """
                SELECT a.*, p.name AS project_name
                FROM wbs_announcements a
                LEFT JOIN wbs_projects p ON p.id = a.project_id
                WHERE a.tenant_id = $1 AND a.project_id = $2
                ORDER BY a.pinned DESC, a.created_at DESC
                """,
                tid, parsed_pid,
            )
        elif is_tenant_manager:
            records = await connection.fetch(
                """
                SELECT a.*, p.name AS project_name
                FROM wbs_announcements a
                LEFT JOIN wbs_projects p ON p.id = a.project_id
                WHERE a.tenant_id = $1
                ORDER BY a.pinned DESC, a.created_at DESC
                """,
                tid,
            )
        else:
            records = await connection.fetch(
                """
                SELECT a.*, p.name AS project_name
                FROM wbs_announcements a
                LEFT JOIN wbs_projects p ON p.id = a.project_id
                WHERE a.tenant_id = $1
                  AND (
                    a.project_id IS NULL
                    OR a.project_id IN (
                      SELECT project_id FROM wbs_project_members
                      WHERE tenant_id = $1 AND user_id = $2
                    )
                  )
                ORDER BY a.pinned DESC, a.created_at DESC
                """,
                tid, user_id,
            )

    return [normalize_record(record) for record in records]


@router.post("/api/announcements", status_code=201)
async def create_announcement(payload: AnnouncementCreate, request: Request) -> dict[str, Any]:
    user = require_mutating_role(request)
    tid = get_tenant_id(request)
    author_id = safe_uuid(user.get("id"))

    async with get_pool(request).acquire() as connection:
        project: dict[str, Any] | None = None
        parsed_pid: UUID | None = None
        if payload.project_id:
            parsed_pid = safe_uuid(payload.project_id)
            if not parsed_pid:
                raise HTTPException(status_code=400, detail="Invalid project id")
            # require_mutating_role()로 이미 테넌트 admin/pmo임이 확인됐으므로,
            # 프로젝트 멤버십 여부와 무관하게 테넌트 내 프로젝트 공지 작성을 허용한다.
            project = await fetch_project(connection, parsed_pid, tid)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")

        record = await connection.fetchrow(
            """
            INSERT INTO wbs_announcements (tenant_id, project_id, title, body, pinned, author_id, author_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING *
            """,
            tid, parsed_pid, payload.title.strip(), payload.body, payload.pinned,
            author_id, user.get("display_name") or user.get("email") or "",
        )
        announcement = normalize_record(record)
        announcement["project_name"] = project.get("name") if project else None

        # 작성자 본인에게도 등록 알림을 보내 인앱 알림으로 등록 결과를 확인할 수 있게 한다.
        if parsed_pid:
            rows = await connection.fetch(
                """
                SELECT u.id
                FROM wbs_project_members m
                JOIN wbs_users u ON u.id = m.user_id
                WHERE m.tenant_id = $1 AND m.project_id = $2 AND u.status = 'Active'
                """,
                tid, parsed_pid,
            )
        else:
            rows = await connection.fetch(
                """
                SELECT id FROM wbs_users
                WHERE tenant_id = $1 AND status = 'Active'
                """,
                tid,
            )
        recipient_ids = {row["id"] for row in rows}
        if author_id:
            recipient_ids.add(author_id)

        for recipient_id in recipient_ids:
            await send_notification(
                connection,
                user_id=recipient_id,
                event_type="announcement.new",
                title=f"[공지] {announcement['title']}",
                body=announcement.get("body") or "",
                entity_type="announcement",
                entity_id=str(announcement["id"]),
                metadata={
                    "project_id": str(parsed_pid) if parsed_pid else None,
                    "project_name": announcement.get("project_name"),
                },
                email_to=None,
            )

        await insert_audit_event(
            connection,
            request=request,
            event_type="announcement.created",
            summary=f"공지 등록: {announcement['title']}",
            entity_type="announcement",
            entity_id=announcement["id"],
            metadata={"project_id": str(parsed_pid) if parsed_pid else None},
        )

    return announcement


@router.patch("/api/announcements/{announcement_id}")
async def update_announcement(announcement_id: str, payload: AnnouncementUpdate, request: Request) -> dict[str, Any]:
    user = getattr(request.state, "user", None) or {}
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    parsed_id = safe_uuid(announcement_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid announcement id")
    tid = get_tenant_id(request)

    async with get_pool(request).acquire() as connection:
        existing = await connection.fetchrow(
            "SELECT * FROM wbs_announcements WHERE id = $1 AND tenant_id = $2",
            parsed_id, tid,
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Announcement not found")
        existing = normalize_record(existing)
        if user.get("role") != "admin" and str(existing.get("author_id")) != str(user.get("id")):
            raise HTTPException(status_code=403, detail="Insufficient role")

        fields_set = payload.model_fields_set
        updates: list[str] = []
        params: list[Any] = []
        if "title" in fields_set and payload.title is not None:
            params.append(payload.title.strip())
            updates.append(f"title = ${len(params)}")
        if "body" in fields_set and payload.body is not None:
            params.append(payload.body)
            updates.append(f"body = ${len(params)}")
        if "pinned" in fields_set and payload.pinned is not None:
            params.append(payload.pinned)
            updates.append(f"pinned = ${len(params)}")

        if updates:
            updates.append("updated_at = now()")
            params.append(parsed_id)
            params.append(tid)
            record = await connection.fetchrow(
                f"UPDATE wbs_announcements SET {', '.join(updates)} "
                f"WHERE id = ${len(params) - 1} AND tenant_id = ${len(params)} RETURNING *",
                *params,
            )
            existing = normalize_record(record)

        project_name = None
        if existing.get("project_id"):
            project_name = await connection.fetchval(
                "SELECT name FROM wbs_projects WHERE id = $1", safe_uuid(existing["project_id"]),
            )
        existing["project_name"] = project_name

    return existing


@router.delete("/api/announcements/{announcement_id}", status_code=204)
async def delete_announcement(announcement_id: str, request: Request) -> None:
    user = getattr(request.state, "user", None) or {}
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    parsed_id = safe_uuid(announcement_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid announcement id")
    tid = get_tenant_id(request)

    async with get_pool(request).acquire() as connection:
        existing = await connection.fetchrow(
            "SELECT author_id FROM wbs_announcements WHERE id = $1 AND tenant_id = $2",
            parsed_id, tid,
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Announcement not found")
        if user.get("role") != "admin" and str(existing["author_id"]) != str(user.get("id")):
            raise HTTPException(status_code=403, detail="Insufficient role")
        await connection.execute(
            "DELETE FROM wbs_announcements WHERE id = $1 AND tenant_id = $2", parsed_id, tid,
        )
        await connection.execute(
            "DELETE FROM wbs_notifications WHERE entity_type = 'announcement' AND entity_id = $1",
            str(parsed_id),
        )
