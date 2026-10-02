"""인증(로그인·로그아웃·비밀번호) API 라우터.
"""
from datetime import datetime, timedelta, timezone
import asyncio
import secrets
from typing import Any
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import (
    AUTH_BACKEND,
    ENABLE_LOGIN_ALIASES,
    LDAP_ATTR_EMAIL,
    LDAP_ATTR_NAME,
    LDAP_BASE_DN,
    LDAP_BIND_DN,
    LDAP_BIND_PASSWORD,
    LDAP_PORT,
    LDAP_SERVER,
    LDAP_USER_FILTER,
    LDAP_USE_SSL,
    LOGIN_FAILURE_LIMIT,
    LOGIN_LOCK_MINUTES,
    SESSION_TTL_HOURS,
    USER_SELECT_G,
)
from app.core.db import get_pool, safe_uuid
from app.core.security import LOGIN_ALIASES, auth_token_from_request, get_tenant_id, user_response
from app.schemas import LoginRequest, PasswordChangeRequest

router = APIRouter()


def resolve_login_alias(identifier: str) -> tuple[str, dict[str, str] | None]:
    normalized_identifier = identifier.strip().lower()
    if not ENABLE_LOGIN_ALIASES:
        return normalized_identifier, None
    alias = LOGIN_ALIASES.get(normalized_identifier)
    if not alias:
        return normalized_identifier, None
    return alias["email"], alias


def _try_ldap_login(email: str, password: str) -> bool:
    """동기 LDAP 바인드 시도. 스레드풀에서 실행됨."""
    if not LDAP_SERVER:
        return False
    try:
        import ldap3  # type: ignore
        server = ldap3.Server(LDAP_SERVER, port=LDAP_PORT, use_ssl=LDAP_USE_SSL, connect_timeout=5)
        # 서비스 계정으로 유저 DN 조회
        bind_conn = ldap3.Connection(server, user=LDAP_BIND_DN, password=LDAP_BIND_PASSWORD, auto_bind=True)
        search_filter = LDAP_USER_FILTER.replace("{email}", ldap3.utils.conv.escape_filter_chars(email))
        bind_conn.search(LDAP_BASE_DN, search_filter, attributes=[LDAP_ATTR_EMAIL, LDAP_ATTR_NAME])
        if not bind_conn.entries:
            return False
        user_dn = bind_conn.entries[0].entry_dn
        bind_conn.unbind()
        # 유저 DN으로 실제 바인드 (패스워드 검증)
        user_conn = ldap3.Connection(server, user=user_dn, password=password)
        result = user_conn.bind()
        user_conn.unbind()
        return result
    except Exception:
        return False


@router.post("/api/auth/login")
async def login(payload: LoginRequest, request: Request) -> dict[str, Any]:
    login_identifier = payload.email.strip().lower()
    normalized_email, login_alias = resolve_login_alias(login_identifier)
    alias_used = login_alias is not None
    expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)
    token = secrets.token_urlsafe(32)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            await connection.execute("DELETE FROM wbs_user_sessions WHERE expires_at <= now()")
            user_record = await connection.fetchrow(
                f"""
                SELECT {USER_SELECT_G}, u.password_hash
                FROM wbs_users u
                LEFT JOIN wbs_user_groups g
                  ON g.id = u.group_id
                 AND g.tenant_id = u.tenant_id
                WHERE u.email = $1
                  AND u.tenant_id = $2
                """,
                normalized_email,
                get_tenant_id(request),
            )
            account_locked = bool(
                user_record
                and user_record["locked_until"]
                and user_record["locked_until"] > datetime.now(timezone.utc)
            )
            password_ok = False
            if user_record and user_record["status"] == "Active" and not account_locked:
                if AUTH_BACKEND == "ldap" and not alias_used:
                    password_ok = await asyncio.get_event_loop().run_in_executor(
                        None, _try_ldap_login, normalized_email, payload.password
                    )
                else:
                    stored_password_ok = await connection.fetchval(
                        "SELECT $1 = crypt($2, $1)",
                        user_record["password_hash"],
                        payload.password,
                    )
                    alias_password = login_alias.get("password") if login_alias else ""
                    alias_password_ok = bool(alias_password and payload.password == alias_password)
                    password_ok = bool(stored_password_ok or alias_password_ok)

            if account_locked:
                await insert_audit_event(
                    connection,
                    request=request,
                    event_type="auth.login_locked",
                    entity_type="user",
                    entity_id=user_record["id"],
                    summary="Login blocked because account is locked",
                    metadata={
                        "email": normalized_email,
                        "login_identifier": login_identifier,
                        "alias_used": alias_used,
                        "locked_until": user_record["locked_until"].isoformat(),
                    },
                    actor_email=normalized_email,
                    actor_role=user_record["role"],
                )
                raise HTTPException(status_code=423, detail="Account is temporarily locked")

            if not password_ok:
                failed_count = int(user_record["failed_login_count"] or 0) + 1 if user_record else 1
                locked_until = (
                    datetime.now(timezone.utc) + timedelta(minutes=LOGIN_LOCK_MINUTES)
                    if user_record and failed_count >= LOGIN_FAILURE_LIMIT
                    else None
                )
                if user_record:
                    await connection.execute(
                        """
                        UPDATE wbs_users
                        SET failed_login_count = $2,
                            locked_until = $3,
                            updated_at = now()
                        WHERE id = $1
                        """,
                        user_record["id"],
                        failed_count,
                        locked_until,
                    )
                await insert_audit_event(
                    connection,
                    request=request,
                    event_type="auth.login_failed",
                    entity_type="user",
                    entity_id=user_record["id"] if user_record else normalized_email,
                    summary="Login failed",
                    metadata={
                        "email": normalized_email,
                        "login_identifier": login_identifier,
                        "alias_used": alias_used,
                        "failed_login_count": failed_count,
                        "locked_until": locked_until.isoformat() if locked_until else None,
                    },
                    actor_email=normalized_email,
                    actor_role=user_record["role"] if user_record else None,
                )
                raise HTTPException(status_code=401, detail="Invalid email or password")

            await connection.execute(
                """
                UPDATE wbs_users
                SET last_login_at = now(),
                    failed_login_count = 0,
                    locked_until = NULL,
                    updated_at = now()
                WHERE id = $1
                """,
                user_record["id"],
            )
            await connection.execute(
                """
                INSERT INTO wbs_user_sessions (token, user_id, expires_at)
                VALUES ($1, $2, $3)
                """,
                token,
                user_record["id"],
                expires_at,
            )
            updated_user = await connection.fetchrow(
                f"""
                SELECT {USER_SELECT_G}
                FROM wbs_users u
                LEFT JOIN wbs_user_groups g
                  ON g.id = u.group_id
                 AND g.tenant_id = u.tenant_id
                WHERE u.id = $1
                """,
                user_record["id"],
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="auth.login",
                entity_type="user",
                entity_id=user_record["id"],
                summary="User logged in",
                metadata={
                    "login_identifier": login_identifier,
                    "alias_used": alias_used,
                },
                actor=user_response(updated_user),
            )

    return {
        "token": token,
        "expires_at": expires_at.isoformat(),
        "user": user_response(updated_user),
        "tenant": getattr(request.state, "tenant", {"id": get_tenant_id(request), "status": "Active"}),
    }


@router.get("/api/auth/me")
async def current_user(request: Request) -> dict[str, Any]:
    return {
        "user": user_response(request.state.user),
        "tenant": getattr(request.state, "tenant", {"id": get_tenant_id(request), "status": "Active"}),
    }


@router.post("/api/auth/logout")
async def logout(request: Request) -> dict[str, str]:
    token = auth_token_from_request(request)
    if token:
        async with get_pool(request).acquire() as connection:
            await connection.execute("DELETE FROM wbs_user_sessions WHERE token = $1", token)
            await insert_audit_event(
                connection,
                request=request,
                event_type="auth.logout",
                entity_type="user",
                entity_id=request.state.user["id"],
                summary="User logged out",
            )
    return {"status": "ok"}


@router.post("/api/auth/password")
async def change_password(payload: PasswordChangeRequest, request: Request) -> dict[str, Any]:
    token = auth_token_from_request(request)
    current = request.state.user

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            password_ok = await connection.fetchval(
                """
                SELECT password_hash = crypt($2, password_hash)
                FROM wbs_users
                WHERE id = $1 AND status = 'Active'
                """,
                safe_uuid(current["id"]),
                payload.current_password,
            )
            if not password_ok:
                await insert_audit_event(
                    connection,
                    request=request,
                    event_type="auth.password_change_failed",
                    entity_type="user",
                    entity_id=current["id"],
                    summary="Password change failed",
                    metadata={"reason": "current_password_mismatch"},
                )
                raise HTTPException(status_code=401, detail="Current password is invalid")

            updated = await connection.fetchrow(
                f"""
                WITH updated AS (
                  UPDATE wbs_users
                  SET password_hash = crypt($2, gen_salt('bf')),
                      must_change_password = false,
                      password_changed_at = now(),
                      updated_at = now()
                  WHERE id = $1
                  RETURNING id
                )
                SELECT {USER_SELECT_G}
                FROM updated
                JOIN wbs_users u ON u.id = updated.id
                LEFT JOIN wbs_user_groups g
                  ON g.id = u.group_id
                 AND g.tenant_id = u.tenant_id
                """,
                safe_uuid(current["id"]),
                payload.new_password,
            )
            if token:
                await connection.execute(
                    "DELETE FROM wbs_user_sessions WHERE user_id = $1 AND token <> $2",
                    safe_uuid(current["id"]),
                    token,
                )
            await insert_audit_event(
                connection,
                request=request,
                event_type="auth.password_changed",
                entity_type="user",
                entity_id=current["id"],
                summary="Password changed",
                metadata={"other_sessions_revoked": True},
            )

    return {"status": "ok", "user": user_response(updated)}
