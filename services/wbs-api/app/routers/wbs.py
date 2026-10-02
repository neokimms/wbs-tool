"""WBS 항목·작업·진척·버전 비교 API 라우터.
"""
from datetime import date, datetime, timezone
from io import BytesIO
import base64
import json
import re
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from fastapi import APIRouter

from app.domain.wbs_rules import apply_rollup_to_items, compute_wbs_rollup, hierarchy_rules_payload
from app.core.audit import insert_audit_event
from app.core.config import (
    MAX_WORK_ITEM_ATTACHMENT_BYTES,
    PROJECT_MUTATING_ROLES,
    PROJECT_WBS_IMPORT_ALLOWED_STATUSES,
    WORK_ITEM_STATUSES,
)
from app.core.db import get_pool, normalize_metadata, normalize_record, parse_date, safe_uuid, utc_now_iso
from app.core.notify import resolve_work_item_notification_users, send_notification
from app.core.security import (
    ensure_project_mutate_role,
    get_tenant_id,
    require_roles,
    work_item_identity_key,
    work_item_user_tokens,
)
from app.schemas import WbsItemsBatch, WorkItemUpdate
from app.services.agile import _wbs_to_agile_status
from app.services.approvals import baseline_summary, fetch_latest_project_baseline
from app.services.meetings import _scan_action_item_alerts
from app.services.projects import ensure_project_status_allowed, fetch_tenant_project
from app.services.wbs import (
    assign_missing_wbs_codes,
    build_wbs_diff_rows,
    fetch_project_rollup,
    fetch_project_wbs_items,
    replace_project_wbs_items,
    root_code_from_rows,
    serialize_wbs_row,
    validate_wbs_rows,
)

router = APIRouter()


async def project_has_children(connection: asyncpg.Connection, project_id: UUID, code: str) -> bool:
    return bool(await connection.fetchval(
        "SELECT EXISTS (SELECT 1 FROM wbs_project_wbs_items WHERE project_id = $1 AND parent_code = $2)",
        project_id, code,
    ))


def work_item_status(row: dict[str, Any]) -> str:
    metadata = normalize_metadata(row.get("metadata"))
    raw = str(metadata.get("status") or row.get("status") or "").strip()
    if raw == "진행 중":
        raw = "진행중"
    if raw == "미시작":
        raw = "대기"
    if raw in WORK_ITEM_STATUSES:
        return raw
    finish = parse_date(row.get("finish_date"))
    if finish and finish < date.today():
        return "지연"
    return "대기"


def work_item_progress(row: dict[str, Any]) -> int:
    metadata = normalize_metadata(row.get("metadata"))
    try:
        value = float(metadata.get("progress", row.get("progress", 0)) or 0)
    except (TypeError, ValueError):
        value = 0
    return max(0, min(100, round(value)))


def work_item_people_values(row: dict[str, Any], metadata: dict[str, Any] | None = None) -> list[str]:
    metadata = metadata or normalize_metadata(row.get("metadata"))
    values: list[str] = []
    for value in (row.get("owner"), metadata.get("reviewer"), metadata.get("approver"), metadata.get("team")):
        if not value:
            continue
        values.extend(part.strip() for part in re.split(r"[,;/|·]+", str(value)) if part.strip())
    return values


def work_item_matches_user(row: dict[str, Any], user: dict[str, Any]) -> bool:
    metadata = normalize_metadata(row.get("metadata"))
    haystack = " ".join(work_item_people_values(row, metadata)).lower()
    keys = [work_item_identity_key(value) for value in work_item_people_values(row, metadata)]
    for token in work_item_user_tokens(user):
        if token in keys or (token and token in work_item_identity_key(haystack)):
            return True
    return False


def serialize_work_item_row(row: dict[str, Any] | asyncpg.Record, project: dict[str, Any] | None = None) -> dict[str, Any]:
    item = normalize_record(row) if isinstance(row, asyncpg.Record) else dict(row)
    item["metadata"] = normalize_metadata(item.get("metadata"))
    item["status"] = work_item_status(item)
    item["progress"] = work_item_progress(item)
    item["project_id"] = str(item.get("project_id") or project.get("id") if project else item.get("project_id") or "")
    if project:
        item["project_name"] = project.get("name")
        item["project_status"] = project.get("status")
        item["template_key"] = project.get("template_key")
    return item


async def fetch_project_work_item(
    connection: asyncpg.Connection,
    project_id: UUID,
    item_code: str,
    *,
    for_update: bool = False,
) -> dict[str, Any] | None:
    lock_clause = " FOR UPDATE" if for_update else ""
    record = await connection.fetchrow(
        f"""
        SELECT project_id, code, parent_code, name, item_type, owner, weight,
               start_date, finish_date, sort_order, metadata, tenant_id
        FROM wbs_project_wbs_items
        WHERE project_id = $1 AND code = $2
        {lock_clause}
        """,
        project_id,
        item_code,
    )
    return normalize_record(record) if record else None


def append_work_item_log(metadata: dict[str, Any], key: str, entry: dict[str, Any], limit: int = 100) -> None:
    values = metadata.get(key)
    values = values if isinstance(values, list) else []
    values.append(entry)
    metadata[key] = values[-limit:]


def work_item_change_summary(before: dict[str, Any], after: dict[str, Any]) -> str:
    labels = {
        "name": "작업명",
        "owner": "담당자",
        "status": "상태",
        "progress": "진척률",
        "priority": "우선순위",
        "start_date": "시작일",
        "finish_date": "종료일",
        "reviewer": "검토자",
        "approver": "승인자",
        "team": "팀",
        "effort": "공수",
    }
    changes = []
    for key, label in labels.items():
        if str(before.get(key) or "") != str(after.get(key) or ""):
            changes.append(f"{label}: {before.get(key) or '-'} -> {after.get(key) or '-'}")
    return ", ".join(changes)


async def notify_work_item_users(
    connection: asyncpg.Connection,
    *,
    tenant_id: str,
    project: dict[str, Any],
    row: dict[str, Any],
    metadata: dict[str, Any],
    event_type: str,
    title: str,
    body: str,
    only_people: list[str] | None = None,
) -> int:
    people = only_people or work_item_people_values(row, metadata)
    users = await resolve_work_item_notification_users(connection, tenant_id, people)
    sent = 0
    for user in users:
        user_id = safe_uuid(user.get("id"))
        if not user_id:
            continue
        await send_notification(
            connection,
            user_id=user_id,
            event_type=event_type,
            title=title,
            body=body,
            entity_type="work_item",
            entity_id=f"{project['id']}:{row['code']}",
            metadata={
                "project_id": str(project["id"]),
                "project_name": project.get("name"),
                "code": row.get("code"),
                "data_source": "internal_wbs",
            },
            email_to=user.get("email") if event_type in {"work_item.delayed", "work_item.approval"} else None,
        )
        sent += 1
    return sent


@router.get("/api/projects/{project_id}/baseline")
async def project_baseline(project_id: str, request: Request) -> dict[str, Any]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        baseline = await fetch_latest_project_baseline(connection, parsed_id)

    return {
        **baseline_summary(baseline),
        "snapshot_rows": baseline.get("snapshot_rows") if baseline else [],
    }


@router.get("/api/me/work-items")
async def list_my_work_items(request: Request) -> list[dict[str, Any]]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT
                p.id AS project_id,
                p.name AS project_name,
                p.status AS project_status,
                p.template_key,
                i.code, i.parent_code, i.name, i.item_type, i.owner, i.weight,
                i.start_date, i.finish_date, i.sort_order, i.metadata, i.tenant_id
            FROM wbs_project_wbs_items i
            JOIN wbs_projects p ON p.id = i.project_id
            WHERE p.tenant_id = $1
              AND COALESCE(i.item_type, '작업') <> '프로젝트'
            ORDER BY COALESCE(i.finish_date, DATE '9999-12-31'), p.name, i.sort_order, i.code
            """,
            tid,
        )
    items = []
    for row in rows:
        item = serialize_work_item_row(row)
        if work_item_matches_user(item, user):
            items.append(item)
    return items


@router.get("/api/projects/{project_id}/work-items")
async def list_project_work_items(project_id: str, request: Request) -> list[dict[str, Any]]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        rows = await fetch_project_wbs_items(connection, parsed_id)
        action_counts = {
            r["wbs_code"]: r["open_count"]
            for r in await connection.fetch(
                """
                SELECT wbs_code, count(*)::int AS open_count FROM wbs_action_items
                WHERE project_id = $1 AND wbs_code IS NOT NULL AND status NOT IN ('완료','취소')
                GROUP BY wbs_code
                """,
                parsed_id,
            )
        }
    for row in rows:
        row["action_open_count"] = action_counts.get(row.get("code"), 0)
    rollup = compute_wbs_rollup(rows)
    items = [
        serialize_work_item_row({**row, "project_id": parsed_id}, project)
        for row in rows
        if (row.get("item_type") or "작업") != "프로젝트"
    ]
    return apply_rollup_to_items(items, rollup)


@router.get("/api/projects/{project_id}/progress")
async def get_project_progress(project_id: str, request: Request) -> dict[str, Any]:
    """공통 산식 기반 진척 롤업 — 요약 + 항목별(node) 진척/계획진척/SPI."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    as_of = parse_date(request.query_params.get("as_of")) if request.query_params.get("as_of") else None
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        rollup = await fetch_project_rollup(connection, parsed_id, as_of)
    return rollup


@router.get("/api/wbs/rules")
async def get_wbs_rules() -> dict[str, Any]:
    """WBS 계층 깊이·유형 규칙과 진척/SPI 산식 안내."""
    return hierarchy_rules_payload()


@router.patch("/api/projects/{project_id}/work-items/{item_code:path}")
async def update_project_work_item(
    project_id: str,
    item_code: str,
    payload: WorkItemUpdate,
    request: Request,
) -> dict[str, Any]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            row = await fetch_project_work_item(connection, parsed_id, item_code, for_update=True)
            if not row:
                raise HTTPException(status_code=404, detail="Work item not found")
            if project["_project_role"] not in PROJECT_MUTATING_ROLES and not work_item_matches_user(row, user):
                raise HTTPException(status_code=403, detail="Only PMO/admin or assigned users can update this work item")

            metadata = normalize_metadata(row.get("metadata"))
            before = {
                "name": row.get("name"),
                "owner": row.get("owner"),
                "status": work_item_status(row),
                "progress": work_item_progress(row),
                "priority": metadata.get("priority") or "보통",
                "start_date": row.get("start_date"),
                "finish_date": row.get("finish_date"),
                "reviewer": metadata.get("reviewer"),
                "approver": metadata.get("approver"),
                "team": metadata.get("team"),
                "effort": metadata.get("effort"),
            }
            fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))
            next_start = payload.start_date if "start_date" in fields_set else parse_date(row.get("start_date"))
            next_finish = payload.finish_date if "finish_date" in fields_set else parse_date(row.get("finish_date"))
            if next_start and next_finish and next_finish < next_start:
                raise HTTPException(status_code=400, detail="Finish date is earlier than start date")

            if payload.progress is not None and await project_has_children(connection, parsed_id, item_code):
                raise HTTPException(
                    status_code=400,
                    detail="상위 항목의 진척률은 하위 작업에서 자동 계산됩니다. 최하위 작업의 진척률을 입력하세요.",
                )
            if payload.status is not None:
                metadata["status"] = payload.status
                if payload.status == "완료" and payload.progress is None:
                    metadata["progress"] = 100  # 완료 처리 시 진척률 100% 동기화
            if payload.progress is not None:
                metadata["progress"] = payload.progress
            if payload.priority is not None:
                metadata["priority"] = payload.priority
            if payload.reviewer is not None:
                metadata["reviewer"] = payload.reviewer.strip()
            if payload.approver is not None:
                metadata["approver"] = payload.approver.strip()
            if payload.team is not None:
                metadata["team"] = payload.team.strip()
            if payload.effort is not None:
                metadata["effort"] = payload.effort

            actor = user.get("display_name") or user.get("email") or "사용자"
            now_iso = datetime.now(timezone.utc).isoformat()
            if payload.comment:
                append_work_item_log(metadata, "comments", {
                    "author": actor,
                    "email": user.get("email"),
                    "text": payload.comment.strip(),
                    "ts": now_iso,
                })
            if payload.attachment_name or payload.attachment_url:
                append_work_item_log(metadata, "attachments", {
                    "author": actor,
                    "name": (payload.attachment_name or payload.attachment_url or "첨부").strip(),
                    "url": (payload.attachment_url or "").strip(),
                    "ts": now_iso,
                    "kind": "link",
                })

            next_row = {
                **row,
                "name": payload.name.strip() if "name" in fields_set and payload.name is not None else row.get("name"),
                "owner": payload.owner.strip() if "owner" in fields_set and payload.owner is not None else row.get("owner"),
                "start_date": next_start,
                "finish_date": next_finish,
                "metadata": metadata,
            }
            after = {
                "name": next_row.get("name"),
                "owner": next_row.get("owner"),
                "status": work_item_status(next_row),
                "progress": work_item_progress(next_row),
                "priority": metadata.get("priority") or "보통",
                "start_date": next_start.isoformat() if isinstance(next_start, date) else next_start,
                "finish_date": next_finish.isoformat() if isinstance(next_finish, date) else next_finish,
                "reviewer": metadata.get("reviewer"),
                "approver": metadata.get("approver"),
                "team": metadata.get("team"),
                "effort": metadata.get("effort"),
            }
            summary = work_item_change_summary(before, after)
            if summary or payload.comment or payload.attachment_name or payload.attachment_url:
                append_work_item_log(metadata, "history", {
                    "actor": actor,
                    "email": user.get("email"),
                    "action": summary or ("댓글 등록" if payload.comment else "첨부/산출물 등록"),
                    "at": now_iso,
                }, limit=50)

            updated = await connection.fetchrow(
                """
                UPDATE wbs_project_wbs_items
                SET name = $3,
                    owner = $4,
                    start_date = $5,
                    finish_date = $6,
                    metadata = $7::jsonb
                WHERE project_id = $1 AND code = $2
                RETURNING project_id, code, parent_code, name, item_type, owner, weight,
                          start_date, finish_date, sort_order, metadata, tenant_id
                """,
                parsed_id,
                item_code,
                next_row.get("name"),
                next_row.get("owner") or None,
                next_start,
                next_finish,
                metadata,
            )
            await connection.execute("UPDATE wbs_projects SET updated_at = now() WHERE id = $1", parsed_id)

            # WBS 저장 시 연결된 Agile 항목 상태/담당자 즉시 반영 (source='wbs'만)
            agile_status = _wbs_to_agile_status(metadata.get("status"))
            await connection.execute(
                """
                UPDATE wbs_agile_items
                SET status = $1, assignee = $2, updated_at = now()
                WHERE project_id = $3 AND wbs_code = $4 AND source = 'wbs'
                """,
                agile_status,
                next_row.get("owner") or None,
                parsed_id,
                item_code,
            )

            await insert_audit_event(
                connection,
                request=request,
                event_type="work_item.updated",
                entity_type="work_item",
                entity_id=f"{parsed_id}:{item_code}",
                summary=f"Work item updated: {project['name']} / {item_code}",
                metadata={"changes": summary, "data_source": "internal_wbs"},
            )

            notification_count = 0
            updated_item = serialize_work_item_row(updated, project)
            if updated_item["status"] == "지연":
                notification_count += await notify_work_item_users(
                    connection,
                    tenant_id=project["tenant_id"],
                    project=project,
                    row=updated_item,
                    metadata=metadata,
                    event_type="work_item.delayed",
                    title="작업 지연 알림",
                    body=f"{project['name']} / {item_code} {updated_item['name']} 작업이 지연 상태입니다.",
                )
            if metadata.get("approver") and updated_item["status"] != "완료":
                notification_count += await notify_work_item_users(
                    connection,
                    tenant_id=project["tenant_id"],
                    project=project,
                    row=updated_item,
                    metadata=metadata,
                    event_type="work_item.approval",
                    title="승인 확인 필요",
                    body=f"{project['name']} / {item_code} 작업 항목의 승인 확인이 필요합니다.",
                    only_people=[str(metadata.get("approver"))],
                )
            if payload.comment:
                notification_count += await notify_work_item_users(
                    connection,
                    tenant_id=project["tenant_id"],
                    project=project,
                    row=updated_item,
                    metadata=metadata,
                    event_type="work_item.comment",
                    title="작업 댓글 등록",
                    body=f"{project['name']} / {item_code} 작업 항목에 댓글이 등록되었습니다.",
                )

    updated_item["notification_count"] = notification_count
    return updated_item


@router.post("/api/projects/{project_id}/work-items/{item_code:path}/attachments")
async def upload_project_work_item_attachment(
    project_id: str,
    item_code: str,
    request: Request,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    content = await file.read(MAX_WORK_ITEM_ATTACHMENT_BYTES + 1)
    if len(content) > MAX_WORK_ITEM_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Attachment is too large")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            row = await fetch_project_work_item(connection, parsed_id, item_code, for_update=True)
            if not row:
                raise HTTPException(status_code=404, detail="Work item not found")
            if project["_project_role"] not in PROJECT_MUTATING_ROLES and not work_item_matches_user(row, user):
                raise HTTPException(status_code=403, detail="Only PMO/admin or assigned users can upload attachments")

            metadata = normalize_metadata(row.get("metadata"))
            now_iso = datetime.now(timezone.utc).isoformat()
            content_type = file.content_type or "application/octet-stream"
            attachment = {
                "author": user.get("display_name") or user.get("email") or "사용자",
                "email": user.get("email"),
                "name": file.filename or "attachment",
                "size": len(content),
                "content_type": content_type,
                "url": f"data:{content_type};base64,{base64.b64encode(content).decode('ascii')}",
                "ts": now_iso,
                "kind": "file",
            }
            append_work_item_log(metadata, "attachments", attachment)
            append_work_item_log(metadata, "history", {
                "actor": attachment["author"],
                "email": user.get("email"),
                "action": f"첨부 업로드: {attachment['name']}",
                "at": now_iso,
            }, limit=50)
            updated = await connection.fetchrow(
                """
                UPDATE wbs_project_wbs_items
                SET metadata = $3::jsonb
                WHERE project_id = $1 AND code = $2
                RETURNING project_id, code, parent_code, name, item_type, owner, weight,
                          start_date, finish_date, sort_order, metadata, tenant_id
                """,
                parsed_id,
                item_code,
                metadata,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="work_item.attachment_uploaded",
                entity_type="work_item",
                entity_id=f"{parsed_id}:{item_code}",
                summary=f"Work item attachment uploaded: {item_code}",
                metadata={"filename": attachment["name"], "size": attachment["size"], "data_source": "internal_wbs"},
            )
            await notify_work_item_users(
                connection,
                tenant_id=project["tenant_id"],
                project=project,
                row=serialize_work_item_row(updated, project),
                metadata=metadata,
                event_type="work_item.attachment",
                title="작업 첨부 등록",
                body=f"{project['name']} / {item_code} 작업 항목에 첨부가 등록되었습니다.",
            )
    return {"attachment": attachment, "item": serialize_work_item_row(updated, project)}


@router.post("/api/work-items/alerts/scan")
async def scan_work_item_alerts(request: Request) -> dict[str, Any]:
    require_roles(request, {"admin", "pmo"})
    tid = get_tenant_id(request)
    today_key = date.today().isoformat()
    created = 0
    scanned = 0
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            rows = await connection.fetch(
                """
                SELECT
                    p.id AS project_id,
                    p.name AS project_name,
                    p.status AS project_status,
                    p.template_key,
                    i.code, i.parent_code, i.name, i.item_type, i.owner, i.weight,
                    i.start_date, i.finish_date, i.sort_order, i.metadata, i.tenant_id
                FROM wbs_project_wbs_items i
                JOIN wbs_projects p ON p.id = i.project_id
                WHERE p.tenant_id = $1
                  AND COALESCE(i.item_type, '작업') <> '프로젝트'
                ORDER BY p.name, i.sort_order, i.code
                """,
                tid,
            )
            for record in rows:
                scanned += 1
                row = serialize_work_item_row(record)
                metadata = normalize_metadata(row.get("metadata"))
                alerts = normalize_metadata(metadata.get("alerts"))
                project = {
                    "id": row["project_id"],
                    "name": row.get("project_name"),
                    "status": row.get("project_status"),
                    "template_key": row.get("template_key"),
                    "tenant_id": tid,
                }
                changed = False
                if row["status"] == "지연" and alerts.get("overdue") != today_key:
                    created += await notify_work_item_users(
                        connection,
                        tenant_id=tid,
                        project=project,
                        row=row,
                        metadata=metadata,
                        event_type="work_item.delayed",
                        title="작업 지연 알림",
                        body=f"{row.get('project_name')} / {row.get('code')} {row.get('name')} 작업이 지연 상태입니다.",
                    )
                    alerts["overdue"] = today_key
                    changed = True
                if metadata.get("approver") and row["status"] != "완료" and alerts.get("approval") != today_key:
                    created += await notify_work_item_users(
                        connection,
                        tenant_id=tid,
                        project=project,
                        row=row,
                        metadata=metadata,
                        event_type="work_item.approval",
                        title="승인 확인 필요",
                        body=f"{row.get('project_name')} / {row.get('code')} 작업 항목의 승인 확인이 필요합니다.",
                        only_people=[str(metadata.get("approver"))],
                    )
                    alerts["approval"] = today_key
                    changed = True
                if changed:
                    metadata["alerts"] = alerts
                    await connection.execute(
                        """
                        UPDATE wbs_project_wbs_items
                        SET metadata = $3::jsonb
                        WHERE project_id = $1 AND code = $2
                        """,
                        safe_uuid(row["project_id"]),
                        row["code"],
                        metadata,
                    )
    action_result = await _scan_action_item_alerts(get_pool(request), tid)
    return {
        "scanned": scanned,
        "created": created + action_result["created"],
        "action_items_scanned": action_result["scanned"],
        "action_items_alerted": action_result["created"],
        "data_source": "internal_wbs",
    }


@router.post("/api/projects/{project_id}/wbs-items")
async def save_project_wbs_items(
    project_id: str,
    payload: WbsItemsBatch,
    request: Request,
) -> dict[str, Any]:
    """WBS 항목 직접 저장 (포털 편집기용). 기존 항목 전체를 payload.rows로 교체."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    raw_rows = [row.model_dump() for row in payload.rows]
    for i, row in enumerate(raw_rows, start=1):
        row.setdefault("row_number", i)

    root_code = root_code_from_rows(raw_rows) or "WBS"
    rows = assign_missing_wbs_codes(raw_rows, root_code)
    errors, warnings = validate_wbs_rows(rows)
    if errors:
        raise HTTPException(status_code=422, detail={"message": "WBS 검증 실패", "errors": errors})

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            ensure_project_mutate_role(project)
            ensure_project_status_allowed(
                project, PROJECT_WBS_IMPORT_ALLOWED_STATUSES, "WBS 직접 편집"
            )
            existing_rows = await fetch_project_wbs_items(connection, parsed_id)
            diff_rows = build_wbs_diff_rows(existing_rows, rows)
            await replace_project_wbs_items(
                connection,
                project_id=parsed_id,
                tenant_id=project["tenant_id"],
                rows=rows,
                source_import_job_id=None,
            )

            # ── WBS 버전 정보를 프로젝트 metadata에 기록 ──────────────
            proj_meta  = normalize_metadata(project.get("metadata"))
            wbs_history = list(proj_meta.get("wbs_history", []))

            # 현재 저장 버전 번호
            wbs_version = len(wbs_history) + 1

            # 이력 항목 추가 (최근 20건만 보관)
            actor = getattr(request.state, "user", {})
            history_entry = {
                "version":    wbs_version,
                "rows":       len(rows),
                "diff_count": len(diff_rows),
                "saved_by":   actor.get("display_name") or actor.get("email") or "PMO",
                "saved_at":   utc_now_iso(),
                "source":     payload.source,
            }
            wbs_history.append(history_entry)
            if len(wbs_history) > 20:
                wbs_history = wbs_history[-20:]

            proj_meta["wbs_version"]    = wbs_version
            proj_meta["wbs_last_saved"] = utc_now_iso()
            proj_meta["wbs_saved_by"]   = history_entry["saved_by"]
            proj_meta["wbs_rows"]       = len(rows)
            proj_meta["wbs_history"]    = wbs_history

            await connection.execute(
                """
                UPDATE wbs_projects
                SET metadata = $2::jsonb, updated_at = now()
                WHERE id = $1
                """,
                parsed_id,
                proj_meta,
            )

            diff_counts = {"added": 0, "changed": 0, "removed": 0}
            for diff_row in diff_rows:
                key = diff_row.get("change")
                if key in diff_counts:
                    diff_counts[key] += 1

            await insert_audit_event(
                connection,
                request=request,
                event_type="project_wbs.import_applied",
                entity_type="project",
                entity_id=parsed_id,
                summary=f"Project WBS import applied: {project['name']}",
                metadata={
                    "source":      payload.source,
                    "rows":        len(rows),
                    "diff_count":  len(diff_rows),
                    "wbs_version": wbs_version,
                    "added":       diff_counts["added"],
                    "changed":     diff_counts["changed"],
                    "removed":     diff_counts["removed"],
                    "diff_items": [
                        {"change": d.get("change"), "code": d.get("code"), "name": d.get("name")}
                        for d in diff_rows[:30]
                    ],
                },
            )

    return {
        "status":  "Applied",
        "rows":    [serialize_wbs_row(r) for r in rows],
        "diff_rows": diff_rows[:100],
        "summary": {
            "rows":        len(rows),
            "diff_count":  len(diff_rows),
            "warnings":    len(warnings),
            "wbs_version": wbs_version,
        },
        "warnings": warnings[:20],
        "wbs_version": wbs_version,
    }


@router.delete("/api/projects/{project_id}/wbs-items", status_code=200)
async def clear_project_wbs_items(project_id: str, request: Request) -> dict[str, Any]:
    """프로젝트 WBS 항목 전체 삭제(초기화). Draft·Review·Rejected 상태에서만 허용."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            ensure_project_mutate_role(project)
            ensure_project_status_allowed(project, PROJECT_WBS_IMPORT_ALLOWED_STATUSES, "WBS 초기화")

            deleted = await connection.fetchval(
                "SELECT COUNT(*) FROM wbs_project_wbs_items WHERE project_id = $1",
                parsed_id,
            )
            await connection.execute(
                "DELETE FROM wbs_project_wbs_items WHERE project_id = $1",
                parsed_id,
            )

            proj_meta = normalize_metadata(project.get("metadata"))
            wbs_history = list(proj_meta.get("wbs_history", []))
            actor = getattr(request.state, "user", {})
            wbs_history.append({
                "version":    len(wbs_history) + 1,
                "rows":       0,
                "diff_count": deleted,
                "saved_by":   actor.get("display_name") or actor.get("email") or "PMO",
                "saved_at":   utc_now_iso(),
                "source":     "portal-clear",
            })
            if len(wbs_history) > 20:
                wbs_history = wbs_history[-20:]
            proj_meta["wbs_history"] = wbs_history
            proj_meta["wbs_version"] = len(wbs_history)
            proj_meta["wbs_rows"] = 0
            await connection.execute(
                "UPDATE wbs_projects SET metadata = $1::jsonb, updated_at = now() WHERE id = $2",
                json.dumps(proj_meta),
                parsed_id,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="project_wbs.cleared",
                entity_type="project",
                entity_id=parsed_id,
                summary=f"Project WBS cleared: {project['name']} ({deleted} rows deleted)",
                metadata={"deleted_rows": deleted},
            )

    return {"deleted_rows": deleted, "project_id": str(parsed_id)}


@router.get("/api/projects/{project_id}/wbs-items")
async def list_project_wbs_items(project_id: str, request: Request) -> list[dict[str, Any]]:
    """프로젝트 WBS 항목 전체 조회."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        rows = await fetch_project_wbs_items(connection, parsed_id)
    return [serialize_wbs_row(r) for r in rows]


# ── Word(.docx) 보고서 내보내기 ─────────────────────────────────────────────
@router.get("/api/projects/{project_id}/wbs-docx")
async def export_wbs_docx(project_id: str, request: Request) -> StreamingResponse:
    """WBS 항목을 Word(.docx) 파일로 내보내기 (python-docx 없이 XML 직접 생성)"""
    # DB에서 WBS 행 조회
    pool = request.app.state.pool
    rows: list[dict] = []
    try:
        async with pool.acquire() as conn:
            parsed_id = safe_uuid(project_id)
            if not parsed_id:
                raise HTTPException(status_code=400, detail="Invalid project id")
            await fetch_tenant_project(conn, request, parsed_id)
            db_rows = await conn.fetch(
                """
                SELECT code, name, item_type, owner, start_date, finish_date, weight, metadata, tenant_id
                FROM wbs_project_wbs_items
                WHERE project_id = $1
                ORDER BY sort_order, code
                """,
                parsed_id,
            )
            for r in db_rows:
                meta = normalize_metadata(r["metadata"])
                rows.append({
                    "code":        r["code"] or "",
                    "name":        r["name"] or "",
                    "item_type":   r["item_type"] or "작업",
                    "owner":       r["owner"] or "",
                    "status":      meta.get("status") or meta.get("op_status") or "대기",
                    "progress":    meta.get("progress") or meta.get("op_progress") or 0,
                    "start_date":  str(r["start_date"]) if r["start_date"] else "",
                    "finish_date": str(r["finish_date"]) if r["finish_date"] else "",
                    "weight":      r["weight"] or 0,
                    "reviewer":    meta.get("reviewer", ""),
                    "approver":    meta.get("approver", ""),
                })
    except HTTPException:
        raise
    except Exception:
        rows = []

    # 간단한 OOXML 생성 (python-docx 불필요)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    def xml_esc(s: str) -> str:
        return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    def make_row(cells: list[str], header: bool = False) -> str:
        bold_open  = "<w:b/>" if header else ""
        shading    = '<w:shd w:val="clear" w:color="auto" w:fill="E8F0FE"/>' if header else ""
        tcs = ""
        for cell in cells:
            tcs += f"""<w:tc><w:tcPr>{shading}</w:tcPr><w:p><w:pPr><w:jc w:val="left"/></w:pPr>
<w:r><w:rPr>{bold_open}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">{xml_esc(cell)}</w:t></w:r></w:p></w:tc>"""
        return f"<w:tr>{tcs}</w:tr>"

    headers = ["WBS코드", "작업명", "유형", "담당자(R)", "검토자(A)", "승인자(C)", "상태", "진행률", "시작일", "종료일", "가중치"]
    table_rows = make_row(headers, header=True)
    for r in rows:
        table_rows += make_row([
            r["code"], r["name"], r["item_type"], r["owner"],
            r["reviewer"], r["approver"], r["status"],
            f"{r['progress']}%", r["start_date"], r["finish_date"], f"{r['weight']}%"
        ])

    col_widths = "".join(f'<w:gridCol w:w="{w}"/>' for w in [900,2400,700,900,900,900,800,700,900,900,700])

    doc_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>WBS 보고서</w:t></w:r>
  </w:p>
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr>
      <w:t>프로젝트 ID: {xml_esc(project_id)} · 생성: {now_str}</w:t>
    </w:r>
  </w:p>
  <w:p><w:r><w:t> </w:t></w:r></w:p>
  <w:tbl>
    <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="10200" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>{col_widths}</w:tblGrid>
    {table_rows}
  </w:tbl>
  <w:p><w:r><w:t> </w:t></w:r></w:p>
  <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
</w:body>
</w:document>"""

    rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    doc_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>"""

    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

    import zipfile
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("word/document.xml", doc_xml)
        zf.writestr("word/_rels/document.xml.rels", doc_rels_xml)
    buf.seek(0)

    fname = f"WBS_Report_{project_id}_{datetime.now().strftime('%Y%m%d')}.docx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/api/projects/{project_id}/wbs-diff")
async def wbs_diff(project_id: str, request: Request, baseline_id: str | None = None) -> dict[str, Any]:
    """베이스라인 vs 현재 WBS Diff. baseline_id 미지정 시 최신 베이스라인 사용."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        # 현재 WBS
        current_rows = await connection.fetch(
            "SELECT * FROM wbs_project_wbs_items WHERE project_id = $1 ORDER BY sort_order, code",
            parsed_id,
        )
        current = {r["code"]: normalize_record(r) for r in current_rows}

        # 베이스라인 WBS
        if baseline_id:
            bl_parsed = safe_uuid(baseline_id)
            bl_row = await connection.fetchrow(
                "SELECT snapshot_rows AS snapshot FROM wbs_project_baselines WHERE id = $1 AND project_id = $2",
                bl_parsed, parsed_id,
            ) if bl_parsed else None
        else:
            bl_row = await connection.fetchrow(
                "SELECT snapshot_rows AS snapshot FROM wbs_project_baselines WHERE project_id = $1 "
                "ORDER BY created_at DESC LIMIT 1",
                parsed_id,
            )

        if not bl_row:
            # 베이스라인이 아직 없음 — 화면이 같은 형식으로 처리할 수 있도록 summary 포함
            return {
                "project_id": project_id,
                "baseline_id": None,
                "has_baseline": False,
                "summary": {"added": len(current), "removed": 0, "changed": 0, "unchanged": 0},
                "added": list(current.values()),
                "removed": [],
                "changed": [],
            }

        baseline_snapshot = bl_row["snapshot"] if isinstance(bl_row["snapshot"], list) else json.loads(bl_row["snapshot"])
        baseline = {item["code"]: item for item in baseline_snapshot}

        added, removed, changed, unchanged = [], [], [], []
        all_codes = set(current) | set(baseline)
        for code in sorted(all_codes):
            if code in current and code not in baseline:
                added.append(current[code])
            elif code not in current and code in baseline:
                removed.append(baseline[code])
            else:
                cur = current[code]
                bas = baseline[code]
                diff_fields: dict[str, Any] = {}
                for field in ("name", "status", "owner", "weight", "sort_order", "item_type", "parent_code"):
                    cv, bv = cur.get(field), bas.get(field)
                    if str(cv) != str(bv):
                        diff_fields[field] = {"before": bv, "after": cv}
                # 진행률 비교
                cp = (cur.get("metadata") or {}).get("progress")
                bp = (bas.get("metadata") or {}).get("progress")
                if str(cp) != str(bp):
                    diff_fields["progress"] = {"before": bp, "after": cp}
                if diff_fields:
                    changed.append({"code": code, "name": cur.get("name"), "changes": diff_fields})
                else:
                    unchanged.append(code)

    return {
        "project_id": project_id,
        "baseline_id": baseline_id,
        "has_baseline": True,
        "summary": {
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
            "unchanged": len(unchanged),
        },
        "added": added,
        "removed": removed,
        "changed": changed,
    }
