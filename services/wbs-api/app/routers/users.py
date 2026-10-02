"""사용자·사용자 그룹·테넌트 관리 API 라우터.
"""
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import ALLOWED_USER_ROLES, ALLOWED_USER_STATUSES, DEFAULT_TENANT_ID, DEFAULT_USER_GROUP_NAME
from app.core.db import get_pool, normalize_metadata, normalize_record, safe_uuid
from app.core.security import get_tenant_id, require_admin_role, user_response
from app.schemas import TenantCreate, UserCreate, UserGroupCreate, UserGroupUpdate, UserUpdate

router = APIRouter()


def managed_user_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    user = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    return {
        **user_response(user),
        "updated_at": user.get("updated_at"),
        "active_sessions": int(user.get("active_sessions") or 0),
        "failed_login_count": int(user.get("failed_login_count") or 0),
        "locked_until": user.get("locked_until"),
    }


def user_group_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    group = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    return {
        "id": str(group["id"]),
        "tenant_id": group.get("tenant_id") or DEFAULT_TENANT_ID,
        "name": group.get("name"),
        "description": group.get("description") or "",
        "status": group.get("status") or "Active",
        "metadata": normalize_metadata(group.get("metadata")),
        "user_count": int(group.get("user_count") or 0),
        "created_at": group.get("created_at"),
        "updated_at": group.get("updated_at"),
    }


async def ensure_default_user_group(connection: asyncpg.Connection, tenant_id: str) -> dict[str, Any]:
    record = await connection.fetchrow(
        """
        SELECT id, tenant_id, name, description, status, metadata, created_at, updated_at,
               0::integer AS user_count
        FROM wbs_user_groups
        WHERE tenant_id = $1 AND lower(name) = lower($2)
        LIMIT 1
        """,
        tenant_id,
        DEFAULT_USER_GROUP_NAME,
    )
    if not record:
        record = await connection.fetchrow(
            """
            INSERT INTO wbs_user_groups (tenant_id, name, description, metadata)
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING id, tenant_id, name, description, status, metadata, created_at, updated_at,
                      0::integer AS user_count
            """,
            tenant_id,
            DEFAULT_USER_GROUP_NAME,
            "테넌트 기본 소속 그룹",
            {"system": True},
        )
    return user_group_response(record)


async def resolve_user_group(
    connection: asyncpg.Connection,
    tenant_id: str,
    group_id: UUID | str | None,
    *,
    require_active: bool = True,
) -> dict[str, Any]:
    if not group_id:
        return await ensure_default_user_group(connection, tenant_id)
    parsed_id = safe_uuid(group_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid user group id")
    record = await connection.fetchrow(
        """
        SELECT id, tenant_id, name, description, status, metadata, created_at, updated_at,
               0::integer AS user_count
        FROM wbs_user_groups
        WHERE id = $1 AND tenant_id = $2
        """,
        parsed_id,
        tenant_id,
    )
    if not record:
        raise HTTPException(status_code=400, detail="User group is not registered in this tenant")
    group = user_group_response(record)
    if require_active and group["status"] != "Active":
        raise HTTPException(status_code=400, detail="User group is not active")
    return group


def validate_user_role(role: str) -> str:
    normalized_role = role.strip().lower()
    if normalized_role not in ALLOWED_USER_ROLES:
        raise HTTPException(status_code=400, detail="Invalid user role")
    return normalized_role


def validate_user_status(status: str) -> str:
    normalized_status = status.strip().title()
    if normalized_status not in ALLOWED_USER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid user status")
    return normalized_status


@router.get("/api/users")
async def list_users(request: Request) -> list[dict[str, Any]]:
    require_admin_role(request)
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            """
            SELECT u.id, u.email, u.display_name, u.role, u.status,
                   u.tenant_id, u.failed_login_count, u.locked_until, u.must_change_password,
                   u.last_login_at, u.password_changed_at, u.created_at, u.updated_at,
                   u.group_id, g.name AS group_name, g.status AS group_status,
                   count(s.token)::integer AS active_sessions
            FROM wbs_users u
            JOIN wbs_user_groups g
              ON g.id = u.group_id
             AND g.tenant_id = u.tenant_id
            LEFT JOIN wbs_user_sessions s
              ON s.user_id = u.id
             AND s.expires_at > now()
            WHERE u.tenant_id = $1
            GROUP BY u.id, g.name, g.status
            ORDER BY
              CASE u.role WHEN 'admin' THEN 0 WHEN 'pmo' THEN 1 ELSE 2 END,
              u.email
            """,
            tid,
        )
    return [managed_user_response(record) for record in records]


@router.get("/api/user-groups")
async def list_user_groups(request: Request) -> list[dict[str, Any]]:
    require_admin_role(request)
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        await ensure_default_user_group(connection, tid)
        records = await connection.fetch(
            """
            SELECT g.id, g.tenant_id, g.name, g.description, g.status, g.metadata,
                   g.created_at, g.updated_at, count(u.id)::integer AS user_count
            FROM wbs_user_groups g
            LEFT JOIN wbs_users u
              ON u.group_id = g.id
             AND u.tenant_id = g.tenant_id
            WHERE g.tenant_id = $1
            GROUP BY g.id
            ORDER BY CASE WHEN g.name = $2 THEN 0 ELSE 1 END, lower(g.name)
            """,
            tid,
            DEFAULT_USER_GROUP_NAME,
        )
    return [user_group_response(record) for record in records]


@router.post("/api/user-groups", status_code=201)
async def create_user_group(payload: UserGroupCreate, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    tid = get_tenant_id(request)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="User group name is required")
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            exists = await connection.fetchval(
                "SELECT EXISTS (SELECT 1 FROM wbs_user_groups WHERE tenant_id = $1 AND lower(name) = lower($2))",
                tid,
                name,
            )
            if exists:
                raise HTTPException(status_code=409, detail="User group already exists in this tenant")
            record = await connection.fetchrow(
                """
                INSERT INTO wbs_user_groups (tenant_id, name, description)
                VALUES ($1, $2, $3)
                RETURNING id, tenant_id, name, description, status, metadata, created_at, updated_at,
                          0::integer AS user_count
                """,
                tid,
                name,
                (payload.description or "").strip(),
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="user_group.created",
                entity_type="user_group",
                entity_id=record["id"],
                summary=f"User group created: {name}",
                metadata={"name": name},
            )
    return user_group_response(record)


@router.patch("/api/user-groups/{group_id}")
async def update_user_group(group_id: str, payload: UserGroupUpdate, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    parsed_id = safe_uuid(group_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid user group id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            existing = await connection.fetchrow(
                """
                SELECT id, tenant_id, name, description, status, metadata, created_at, updated_at
                FROM wbs_user_groups
                WHERE id = $1 AND tenant_id = $2
                FOR UPDATE
                """,
                parsed_id,
                tid,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="User group not found")
            existing_user_count = await connection.fetchval(
                "SELECT count(*) FROM wbs_users WHERE tenant_id = $1 AND group_id = $2",
                tid,
                parsed_id,
            )
            if payload.status == "Suspended" and int(existing_user_count or 0) > 0:
                raise HTTPException(status_code=409, detail="Cannot suspend a user group with assigned users")
            next_name = payload.name.strip() if payload.name is not None else None
            if next_name:
                duplicate = await connection.fetchval(
                    """
                    SELECT EXISTS (
                      SELECT 1
                      FROM wbs_user_groups
                      WHERE tenant_id = $1
                        AND lower(name) = lower($2)
                        AND id <> $3
                    )
                    """,
                    tid,
                    next_name,
                    parsed_id,
                )
                if duplicate:
                    raise HTTPException(status_code=409, detail="User group already exists in this tenant")
            record = await connection.fetchrow(
                """
                UPDATE wbs_user_groups
                SET name = COALESCE($3, name),
                    description = COALESCE($4, description),
                    status = COALESCE($5, status),
                    updated_at = now()
                WHERE id = $1 AND tenant_id = $2
                RETURNING id, tenant_id, name, description, status, metadata, created_at, updated_at,
                          0::integer AS user_count
                """,
                parsed_id,
                tid,
                next_name,
                payload.description.strip() if payload.description is not None else None,
                payload.status,
            )
            user_count = await connection.fetchval(
                "SELECT count(*) FROM wbs_users WHERE tenant_id = $1 AND group_id = $2",
                tid,
                parsed_id,
            )
            response = normalize_record(record)
            response["user_count"] = int(user_count or 0)
            await insert_audit_event(
                connection,
                request=request,
                event_type="user_group.updated",
                entity_type="user_group",
                entity_id=parsed_id,
                summary=f"User group updated: {response['name']}",
                metadata={"status": response["status"]},
            )
    return user_group_response(response)


@router.post("/api/users", status_code=201)
async def create_user(payload: UserCreate, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    normalized_email = payload.email.strip().lower()
    role = validate_user_role(payload.role)
    status = validate_user_status(payload.status)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            group = await resolve_user_group(connection, get_tenant_id(request), payload.group_id)
            email_exists = await connection.fetchval(
                "SELECT EXISTS (SELECT 1 FROM wbs_users WHERE email = $1)",
                normalized_email,
            )
            if email_exists:
                raise HTTPException(status_code=409, detail="User email already exists")
            record = await connection.fetchrow(
                """
                INSERT INTO wbs_users
                  (email, display_name, role, password_hash, status, must_change_password, tenant_id, group_id)
                VALUES
                  ($1, $2, $3, crypt($4, gen_salt('bf')), $5, $6, $7, $8)
                RETURNING id, email, display_name, role, status, failed_login_count,
                          tenant_id, group_id, locked_until, must_change_password, last_login_at,
                          password_changed_at, created_at, updated_at,
                          0::integer AS active_sessions
                """,
                normalized_email,
                payload.display_name.strip(),
                role,
                payload.password,
                status,
                payload.must_change_password,
                get_tenant_id(request),
                safe_uuid(group["id"]),
            )
            response = normalize_record(record)
            response["group_name"] = group["name"]
            response["group_status"] = group["status"]
            await insert_audit_event(
                connection,
                request=request,
                event_type="user.created",
                entity_type="user",
                entity_id=record["id"],
                summary=f"User created: {normalized_email}",
                metadata={
                    "role": role,
                    "status": status,
                    "must_change_password": payload.must_change_password,
                    "group_id": group["id"],
                    "group_name": group["name"],
                },
            )

    return managed_user_response(response)


@router.patch("/api/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, request: Request) -> dict[str, Any]:
    current = require_admin_role(request)
    parsed_id = safe_uuid(user_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid user id")

    role = validate_user_role(payload.role) if payload.role is not None else None
    status = validate_user_status(payload.status) if payload.status is not None else None
    display_name = payload.display_name.strip() if payload.display_name is not None else None
    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))
    group_change_requested = "group_id" in fields_set

    if parsed_id == safe_uuid(current["id"]):
        if role and role != "admin":
            raise HTTPException(status_code=400, detail="Cannot remove your own admin role")
        if status and status != "Active":
            raise HTTPException(status_code=400, detail="Cannot suspend your own account")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            existing = await connection.fetchrow(
                "SELECT id, email, display_name, role, status, group_id FROM wbs_users WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
                parsed_id,
                get_tenant_id(request),
            )
            if not existing:
                raise HTTPException(status_code=404, detail="User not found")
            group = None
            if group_change_requested:
                if payload.group_id is None:
                    raise HTTPException(status_code=400, detail="User group is required")
                group = await resolve_user_group(connection, get_tenant_id(request), payload.group_id)

            record = await connection.fetchrow(
                """
                UPDATE wbs_users
                SET display_name = COALESCE($2, display_name),
                    role = COALESCE($3, role),
                    status = COALESCE($4, status),
                    must_change_password = COALESCE($6, CASE WHEN $5::text IS NULL THEN must_change_password ELSE true END),
                    group_id = COALESCE($7, group_id),
                    password_hash = CASE
                      WHEN $5::text IS NULL THEN password_hash
                      ELSE crypt($5, gen_salt('bf'))
                    END,
                    password_changed_at = CASE
                      WHEN $5::text IS NULL THEN password_changed_at
                      ELSE now()
                    END,
                    updated_at = now()
                WHERE id = $1
                RETURNING id, email, display_name, role, status, failed_login_count,
                          tenant_id, group_id, locked_until, must_change_password, last_login_at,
                          password_changed_at, created_at, updated_at,
                          0::integer AS active_sessions
                """,
                parsed_id,
                display_name,
                role,
                status,
                payload.password,
                payload.must_change_password,
                safe_uuid(group["id"]) if group else None,
            )
            response = normalize_record(record)
            current_group = group or await resolve_user_group(
                connection,
                get_tenant_id(request),
                response.get("group_id"),
                require_active=False,
            )
            response["group_name"] = current_group["name"]
            response["group_status"] = current_group["status"]
            if status and status != "Active":
                await connection.execute("DELETE FROM wbs_user_sessions WHERE user_id = $1", parsed_id)
            await insert_audit_event(
                connection,
                request=request,
                event_type="user.updated",
                entity_type="user",
                entity_id=parsed_id,
                summary=f"User updated: {existing['email']}",
                metadata={
                    "display_name_changed": display_name is not None and display_name != existing["display_name"],
                    "role_changed": role is not None and role != existing["role"],
                    "status_changed": status is not None and status != existing["status"],
                    "password_changed": payload.password is not None,
                    "must_change_password": payload.must_change_password,
                    "group_changed": group_change_requested and safe_uuid(payload.group_id) != existing["group_id"],
                    "group_id": group["id"] if group else str(existing["group_id"]),
                    "group_name": group["name"] if group else current_group["name"],
                },
            )

    return managed_user_response(response)


@router.post("/api/users/{user_id}/sessions/revoke")
async def revoke_user_sessions(user_id: str, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    parsed_id = safe_uuid(user_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid user id")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            user_exists = await connection.fetchval("SELECT EXISTS (SELECT 1 FROM wbs_users WHERE id = $1)", parsed_id)
            if not user_exists:
                raise HTTPException(status_code=404, detail="User not found")
            deleted = await connection.fetchval(
                """
                WITH deleted AS (
                  DELETE FROM wbs_user_sessions
                  WHERE user_id = $1
                  RETURNING token
                )
                SELECT count(*) FROM deleted
                """,
                parsed_id,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="user.sessions_revoked",
                entity_type="user",
                entity_id=parsed_id,
                summary="User sessions revoked",
                metadata={"revoked_sessions": int(deleted or 0)},
            )

    return {"status": "ok", "revoked_sessions": int(deleted or 0)}


@router.get("/api/tenants")
async def list_tenants(request: Request) -> list[dict[str, Any]]:
    require_admin_role(request)
    async with get_pool(request).acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT t.*,
                   count(DISTINCT p.id)::integer AS project_count,
                   (count(DISTINCT (i.project_id, i.code)) FILTER (WHERE i.project_id IS NOT NULL))::integer AS wbs_item_count,
                   count(DISTINCT g.id)::integer AS group_count,
                   count(DISTINCT u.id)::integer AS user_count
            FROM wbs_tenants t
            LEFT JOIN wbs_projects p ON p.tenant_id = t.id
            LEFT JOIN wbs_project_wbs_items i ON i.project_id = p.id
            LEFT JOIN wbs_user_groups g ON g.tenant_id = t.id
            LEFT JOIN wbs_users u ON u.tenant_id = t.id
            GROUP BY t.id
            ORDER BY t.created_at
            """
        )
        return [normalize_record(r) for r in rows]


@router.post("/api/tenants", status_code=201)
async def create_tenant(payload: TenantCreate, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    async with get_pool(request).acquire() as connection:
        existing = await connection.fetchrow("SELECT id FROM wbs_tenants WHERE id = $1", payload.id)
        if existing:
            raise HTTPException(status_code=409, detail="Tenant ID already exists")
        row = await connection.fetchrow(
            "INSERT INTO wbs_tenants (id, name) VALUES ($1, $2) RETURNING *",
            payload.id, payload.name,
        )
        await ensure_default_user_group(connection, payload.id)
        await connection.execute(
            "INSERT INTO wbs_project_operation_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING",
            payload.id,
        )
        await insert_audit_event(connection, request=request,
            event_type="tenant.created", entity_type="tenant", entity_id=payload.id,
            summary=f"테넌트 생성: {payload.name}")
        return normalize_record(row)


@router.patch("/api/tenants/{tenant_id}")
async def update_tenant_status(tenant_id: str, request: Request, status: str = "Active") -> dict[str, Any]:
    require_admin_role(request)
    if status not in ("Active", "Suspended"):
        raise HTTPException(status_code=400, detail="Invalid status")
    async with get_pool(request).acquire() as connection:
        row = await connection.fetchrow(
            "UPDATE wbs_tenants SET status=$2, updated_at=now() WHERE id=$1 RETURNING *",
            tenant_id, status,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return normalize_record(row)
