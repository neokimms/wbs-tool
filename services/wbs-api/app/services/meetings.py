"""Action Item 직렬화·기한 경과 알림.
"""
from datetime import date
from typing import Any
import asyncpg

from app.core.config import ACTION_ITEM_CLOSED, ACTION_ITEM_FROM, ACTION_ITEM_SELECT
from app.core.db import normalize_metadata, normalize_record, parse_date, safe_uuid
from app.core.notify import _notify_action_assignee, resolve_work_item_notification_users


def serialize_action_item(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    item = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    item["metadata"] = normalize_metadata(item.get("metadata"))
    for key in ("id", "project_id", "meeting_id", "assignee_user_id", "issue_id", "created_by"):
        if item.get(key) is not None:
            item[key] = str(item[key])
    due = parse_date(item.get("due_date"))
    item["is_overdue"] = bool(due and due < date.today() and item.get("status") not in ACTION_ITEM_CLOSED)
    item["display_status"] = "지연" if item["is_overdue"] else item.get("status")
    return item


async def _scan_action_item_alerts(pool: asyncpg.Pool, tenant_id: str) -> dict[str, Any]:
    today_key = date.today().isoformat()
    created = scanned = 0
    async with pool.acquire() as connection:
        async with connection.transaction():
            records = await connection.fetch(
                f"""
                SELECT {ACTION_ITEM_SELECT} {ACTION_ITEM_FROM}
                WHERE a.tenant_id = $1 AND a.status NOT IN ('완료','취소')
                  AND a.due_date < CURRENT_DATE
                """,
                tenant_id,
            )
            for record in records:
                scanned += 1
                item = serialize_action_item(record)
                meta = item["metadata"]
                alerts = normalize_metadata(meta.get("alerts"))
                if alerts.get("overdue") == today_key:
                    continue
                users = []
                if item.get("assignee_user_id"):
                    u = await connection.fetchrow(
                        "SELECT id, email, display_name FROM wbs_users WHERE id = $1",
                        safe_uuid(item["assignee_user_id"]),
                    )
                    users = [normalize_record(u)] if u else []
                elif item.get("assignee"):
                    users = await resolve_work_item_notification_users(connection, tenant_id, [item["assignee"]])
                project = {"id": item["project_id"], "name": item.get("project_name")}
                for u in users:
                    await _notify_action_assignee(
                        connection, project=project, item=item, user=u,
                        event_type="action_item.delayed", title="Action Item 기한 경과",
                    )
                    created += 1
                alerts["overdue"] = today_key
                meta["alerts"] = alerts
                await connection.execute(
                    "UPDATE wbs_action_items SET metadata = $2::jsonb WHERE id = $1",
                    safe_uuid(item["id"]), meta,
                )
    return {"scanned": scanned, "created": created}
