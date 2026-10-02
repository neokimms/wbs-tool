"""감사 로그 기록.
"""
from typing import Any
import asyncpg
from fastapi import Request

from app.core.config import DEFAULT_TENANT_ID
from app.core.db import safe_uuid
from app.core.security import get_tenant_id


async def insert_audit_event(
    connection: asyncpg.Connection,
    *,
    request: Request | None = None,
    event_type: str,
    summary: str,
    entity_type: str | None = None,
    entity_id: Any = None,
    metadata: dict[str, Any] | None = None,
    actor: dict[str, Any] | None = None,
    actor_email: str | None = None,
    actor_role: str | None = None,
) -> None:
    request_user = getattr(request.state, "user", None) if request else None
    resolved_actor = actor or request_user or {}
    email = actor_email or resolved_actor.get("email")
    role = actor_role or resolved_actor.get("role")
    await connection.execute(
        """
        INSERT INTO wbs_audit_events
          (actor_user_id, actor_email, actor_role, event_type, entity_type,
           entity_id, summary, metadata, tenant_id)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        """,
        safe_uuid(resolved_actor.get("id")),
        email,
        role,
        event_type,
        entity_type,
        str(entity_id) if entity_id is not None else None,
        summary,
        metadata or {},
        get_tenant_id(request) if request else DEFAULT_TENANT_ID,
    )
