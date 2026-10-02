"""인증 토큰·세션 사용자·전역/프로젝트 역할(RBAC)·테넌트·보안 헤더.
"""
import json
import os
import re
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException, Request

from app.core.config import (
    ADMIN_ROLES,
    DEFAULT_LOGIN_ALIASES,
    DEFAULT_TENANT_ID,
    MULTITENANCY_ENABLED,
    MUTATING_ROLES,
    PROJECT_COLLAB_ROLES,
    PROJECT_MUTATING_ROLES,
    USER_SELECT_G,
)
from app.core.db import normalize_record, safe_uuid


def auth_token_from_request(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def user_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    user = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "display_name": user["display_name"],
        "role": user["role"],
        "status": user["status"],
        "tenant_id": user.get("tenant_id") or DEFAULT_TENANT_ID,
        "group_id": str(user["group_id"]) if user.get("group_id") else None,
        "group_name": user.get("group_name"),
        "group_status": user.get("group_status"),
        "must_change_password": bool(user.get("must_change_password", False)),
        "last_login_at": user.get("last_login_at"),
        "password_changed_at": user.get("password_changed_at"),
        "created_at": user.get("created_at"),
    }


async def fetch_user_by_token(connection: asyncpg.Connection, token: str) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"""
        SELECT {USER_SELECT_G}
        FROM wbs_user_sessions s
        JOIN wbs_users u ON u.id = s.user_id
        LEFT JOIN wbs_user_groups g
          ON g.id = u.group_id
         AND g.tenant_id = u.tenant_id
        WHERE s.token = $1
          AND s.expires_at > now()
          AND u.status = 'Active'
        """,
        token,
    )
    return user_response(record) if record else None


def require_roles(request: Request, allowed_roles: set[str]) -> dict[str, Any]:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient role")
    return user


def require_mutating_role(request: Request) -> dict[str, Any]:
    return require_roles(request, MUTATING_ROLES)


def require_admin_role(request: Request) -> dict[str, Any]:
    return require_roles(request, ADMIN_ROLES)


async def get_effective_project_role(
    connection: asyncpg.Connection,
    tenant_id: str,
    project_id: UUID,
    user: dict[str, Any] | None,
) -> str | None:
    """프로젝트별 실질 권한.
    - 전사 admin: 멤버십과 무관하게 테넌트 내 모든 프로젝트에 대해 admin 권한
    - 그 외(pmo/viewer): wbs_project_members에 등록된 경우에만 해당 project_role, 비멤버는 None(접근 불가)
    """
    if not user:
        return None
    if user.get("role") == "admin":
        return "admin"
    user_id = safe_uuid(user.get("id"))
    if not user_id:
        return None
    return await connection.fetchval(
        "SELECT project_role FROM wbs_project_members WHERE tenant_id = $1 AND project_id = $2 AND user_id = $3",
        tenant_id, project_id, user_id,
    )


def ensure_project_mutate_role(project: dict[str, Any]) -> None:
    """fetch_tenant_project()가 채운 프로젝트별 실질 권한이 admin/pmo/pm이 아니면 변경 차단."""
    if project.get("_project_role") not in PROJECT_MUTATING_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient role")


def ensure_project_collab_role(project: dict[str, Any]) -> None:
    """회의·Action Item·이슈 등록 등 협업 행위 — 열람자(viewer)만 차단."""
    if project.get("_project_role") not in PROJECT_COLLAB_ROLES:
        raise HTTPException(status_code=403, detail="열람자는 등록할 수 없습니다")


def load_login_aliases_config() -> dict[str, dict[str, str]]:
    raw_config = os.getenv("WBS_LOGIN_ALIASES_JSON", "").strip()
    configured_aliases: Any = DEFAULT_LOGIN_ALIASES
    if raw_config:
        try:
            configured_aliases = json.loads(raw_config)
        except json.JSONDecodeError:
            configured_aliases = DEFAULT_LOGIN_ALIASES

    aliases: dict[str, dict[str, str]] = {}
    if not isinstance(configured_aliases, dict):
        return aliases

    for alias, value in configured_aliases.items():
        alias_key = str(alias).strip().lower()
        if not alias_key:
            continue
        if isinstance(value, str):
            email = value.strip().lower()
            alias_password = ""
        elif isinstance(value, dict):
            email = str(value.get("email", "")).strip().lower()
            alias_password = str(value.get("password", ""))
        else:
            continue
        if email:
            aliases[alias_key] = {"email": email, "password": alias_password}
    return aliases


LOGIN_ALIASES = load_login_aliases_config()


def selected_tenant_id_from_request(request: Request) -> str:
    """X-Tenant-ID 헤더로 테넌트 식별. MULTITENANCY_ENABLED=false면 항상 default."""
    if not MULTITENANCY_ENABLED:
        return DEFAULT_TENANT_ID
    return request.headers.get("X-Tenant-ID", DEFAULT_TENANT_ID).strip() or DEFAULT_TENANT_ID


def get_tenant_id(request: Request) -> str:
    return getattr(request.state, "tenant_id", None) or selected_tenant_id_from_request(request)


async def validate_request_tenant(
    connection: asyncpg.Connection,
    request: Request,
    *,
    enforce_active: bool = True,
) -> dict[str, Any]:
    tenant_id = selected_tenant_id_from_request(request)
    request.state.tenant_id = tenant_id
    if not MULTITENANCY_ENABLED:
        request.state.tenant = {"id": tenant_id, "name": "Default Tenant", "status": "Active"}
        return request.state.tenant

    record = await connection.fetchrow(
        "SELECT id, name, status, metadata, created_at, updated_at FROM wbs_tenants WHERE id = $1",
        tenant_id,
    )
    if not record:
        raise HTTPException(status_code=403, detail=f"Tenant is not registered: {tenant_id}")

    tenant = normalize_record(record)
    request.state.tenant = tenant
    if enforce_active and tenant.get("status") != "Active":
        raise HTTPException(status_code=403, detail=f"Tenant is not active: {tenant_id}")
    return tenant


def apply_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


def work_item_identity_key(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "").strip().lower())


def work_item_user_tokens(user: dict[str, Any]) -> list[str]:
    email = str(user.get("email") or "")
    values = [user.get("display_name"), email, email.partition("@")[0]]
    return [work_item_identity_key(value) for value in values if work_item_identity_key(value)]
