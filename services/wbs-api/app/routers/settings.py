"""플랫폼 설정·인증(LDAP) 설정·감사 로그 API 라우터.
"""
from datetime import date, timedelta
import asyncio
from typing import Any
import asyncpg
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import (
    AUTH_BACKEND,
    LDAP_ATTR_EMAIL,
    LDAP_ATTR_NAME,
    LDAP_BASE_DN,
    LDAP_BIND_DN,
    LDAP_BIND_PASSWORD,
    LDAP_PORT,
    LDAP_SERVER,
    LDAP_USER_FILTER,
    LDAP_USE_SSL,
    PROJECT_OPERATION_POLICY_SELECT,
    logger,
)
from app.core.db import get_pool, normalize_record, parse_date, safe_uuid
from app.core.security import get_tenant_id, require_admin_role, require_roles
from app.schemas import LdapDiagnosticsRequest, LdapTestRequest, ProjectOperationPolicyUpdate, SettingUpdate
from app.services.pm_engine import pm_engine_status
from app.services.projects import (
    fetch_project_operation_policy,
    normalize_project_operation_policy_value,
    project_operation_policy_response,
)

router = APIRouter()


SETTING_SELECT = "key, label, category, description, value, is_sensitive, updated_by, created_at, updated_at"
AUDIT_SELECT = """
id, actor_user_id, actor_email, actor_role, event_type, entity_type, entity_id,
summary, metadata, created_at
"""


def setting_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    setting = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    if setting.get("is_sensitive"):
        setting["value"] = {"masked": True}
    return setting


def audit_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    event = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    if event.get("actor_user_id"):
        event["actor_user_id"] = str(event["actor_user_id"])
    return event


def ldap_diagnostic_step(key: str, label: str, status: str, message: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "status": status,
        "message": message,
        "detail": detail or {},
    }


def _run_ldap_diagnostics(email: str | None = None, password: str | None = None) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    config = {
        "auth_backend": AUTH_BACKEND,
        "ldap_server": LDAP_SERVER,
        "ldap_port": LDAP_PORT,
        "ldap_use_ssl": LDAP_USE_SSL,
        "ldap_bind_dn_configured": bool(LDAP_BIND_DN),
        "ldap_bind_password_configured": bool(LDAP_BIND_PASSWORD),
        "ldap_base_dn_configured": bool(LDAP_BASE_DN),
        "ldap_user_filter": LDAP_USER_FILTER,
        "ldap_attr_email": LDAP_ATTR_EMAIL,
        "ldap_attr_name": LDAP_ATTR_NAME,
    }

    missing = [
        label for label, value in {
            "LDAP_SERVER": LDAP_SERVER,
            "LDAP_BASE_DN": LDAP_BASE_DN,
            "LDAP_USER_FILTER": LDAP_USER_FILTER,
        }.items() if not value
    ]
    if missing:
        steps.append(ldap_diagnostic_step("config", "환경 변수", "fail", f"필수 설정 누락: {', '.join(missing)}", config))
        return {"success": False, "steps": steps, "config": config}
    steps.append(ldap_diagnostic_step("config", "환경 변수", "pass", "LDAP 필수 설정 확인 완료", config))

    try:
        import ldap3  # type: ignore
    except Exception as exc:  # noqa: BLE001 - surface optional dependency status
        steps.append(ldap_diagnostic_step("dependency", "ldap3 모듈", "fail", "ldap3 패키지를 불러올 수 없습니다.", {"error": str(exc)}))
        return {"success": False, "steps": steps, "config": config}

    bind_conn = None
    try:
        server = ldap3.Server(LDAP_SERVER, port=LDAP_PORT, use_ssl=LDAP_USE_SSL, connect_timeout=5)
        bind_conn = ldap3.Connection(
            server,
            user=LDAP_BIND_DN or None,
            password=LDAP_BIND_PASSWORD or None,
            receive_timeout=5,
        )
        if not bind_conn.bind():
            steps.append(ldap_diagnostic_step(
                "service_bind",
                "서비스 계정 바인드",
                "fail",
                "LDAP 서버 연결 또는 서비스 계정 바인드 실패",
                {"result": bind_conn.result},
            ))
            return {"success": False, "steps": steps, "config": config}
        steps.append(ldap_diagnostic_step(
            "service_bind",
            "서비스 계정 바인드",
            "pass",
            "LDAP 서버 연결 및 서비스 계정 바인드 성공",
            {"server": LDAP_SERVER, "port": LDAP_PORT, "ssl": LDAP_USE_SSL},
        ))

        if not email:
            steps.append(ldap_diagnostic_step("user_search", "사용자 검색", "warn", "테스트 이메일이 없어 사용자 검색을 건너뜀"))
            return {"success": True, "steps": steps, "config": config}

        search_filter = LDAP_USER_FILTER.replace("{email}", ldap3.utils.conv.escape_filter_chars(email))
        found = bind_conn.search(LDAP_BASE_DN, search_filter, attributes=[LDAP_ATTR_EMAIL, LDAP_ATTR_NAME])
        if not found or not bind_conn.entries:
            steps.append(ldap_diagnostic_step(
                "user_search",
                "사용자 검색",
                "fail",
                "LDAP 사용자 검색 결과가 없습니다.",
                {"base_dn": LDAP_BASE_DN, "filter": search_filter, "result": bind_conn.result},
            ))
            return {"success": False, "steps": steps, "config": config}

        entry = bind_conn.entries[0]
        user_dn = entry.entry_dn
        steps.append(ldap_diagnostic_step(
            "user_search",
            "사용자 검색",
            "pass",
            "LDAP 사용자 DN 검색 성공",
            {"user_dn": user_dn, "matched_entries": len(bind_conn.entries)},
        ))
        bind_conn.unbind()
        bind_conn = None

        if not password:
            steps.append(ldap_diagnostic_step("user_bind", "사용자 바인드", "warn", "테스트 비밀번호가 없어 사용자 바인드를 건너뜀"))
            return {"success": True, "steps": steps, "config": config}

        user_conn = ldap3.Connection(server, user=user_dn, password=password, receive_timeout=5)
        user_ok = user_conn.bind()
        result = user_conn.result
        user_conn.unbind()
        if not user_ok:
            steps.append(ldap_diagnostic_step(
                "user_bind",
                "사용자 바인드",
                "fail",
                "사용자 자격증명 검증 실패",
                {"result": result},
            ))
            return {"success": False, "steps": steps, "config": config}
        steps.append(ldap_diagnostic_step("user_bind", "사용자 바인드", "pass", "사용자 자격증명 검증 성공"))
        return {"success": True, "steps": steps, "config": config}
    except Exception as exc:  # noqa: BLE001 - diagnostics should report all failures
        steps.append(ldap_diagnostic_step(
            "runtime",
            "실행 오류",
            "fail",
            "LDAP 진단 중 오류가 발생했습니다.",
            {"error": str(exc), "type": exc.__class__.__name__},
        ))
        return {"success": False, "steps": steps, "config": config}
    finally:
        try:
            if bind_conn:
                bind_conn.unbind()
        except Exception:
            logger.warning("LDAP unbind 실패", exc_info=True)


@router.get("/api/audit-events")
async def list_audit_events(
    request: Request,
    limit: int = 50,
    event_type: str | None = None,
    actor_email: str | None = None,
    entity_type: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    require_roles(request, {"admin", "pmo"})
    bounded_limit = max(1, min(limit, 100))
    tid = get_tenant_id(request)

    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            f"""
            SELECT {AUDIT_SELECT}
            FROM wbs_audit_events
            WHERE tenant_id = $1
              AND ($2::text IS NULL OR event_type = $2)
              AND ($3::text IS NULL OR actor_email = $3)
              AND ($4::text IS NULL OR entity_type = $4)
              AND (
                $5::text IS NULL
                OR summary ILIKE '%' || $5 || '%'
                OR event_type ILIKE '%' || $5 || '%'
                OR entity_id ILIKE '%' || $5 || '%'
              )
            ORDER BY created_at DESC
            LIMIT $6
            """,
            tid,
            event_type,
            actor_email.strip().lower() if actor_email else None,
            entity_type,
            search.strip() if search else None,
            bounded_limit,
        )

    return [audit_response(record) for record in records]


@router.get("/api/settings")
async def list_settings(request: Request) -> dict[str, Any]:
    require_roles(request, {"admin", "pmo"})
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            f"""
            SELECT {SETTING_SELECT}
            FROM wbs_system_settings
            ORDER BY category, key
            """
        )

    settings = [setting_response(record) for record in records]
    pm_engine_setting = next((setting for setting in settings if setting["key"] == "pm_engine"), None)
    return {
        "settings": settings,
        "pm_engine": pm_engine_status(pm_engine_setting.get("value") if pm_engine_setting else None),
    }


@router.get("/api/project-operation-policy")
async def get_project_operation_policy(request: Request) -> dict[str, Any]:
    require_roles(request, {"admin", "pmo"})
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        policy = await fetch_project_operation_policy(connection, tid)
    return policy


@router.put("/api/project-operation-policy")
async def update_project_operation_policy(
    payload: ProjectOperationPolicyUpdate,
    request: Request,
) -> dict[str, Any]:
    current = require_admin_role(request)
    tid = get_tenant_id(request)
    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            current_policy = await fetch_project_operation_policy(connection, tid)
            next_policy = dict(current_policy)
            for field in fields_set:
                if field in {"tenant_id", "created_at", "updated_at", "updated_by"}:
                    continue
                next_policy[field] = getattr(payload, field)
            next_policy = normalize_project_operation_policy_value(next_policy, tid)
            record = await connection.fetchrow(
                f"""
                INSERT INTO wbs_project_operation_policies
                  (tenant_id, default_delivery_mode, story_point_mode, fibonacci_points,
                   sprint_length_policy, dod_management, default_dod_items,
                   openproject_sprint_version_sync, metadata, updated_by)
                VALUES
                  ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9::jsonb, $10)
                ON CONFLICT (tenant_id) DO UPDATE
                SET default_delivery_mode = EXCLUDED.default_delivery_mode,
                    story_point_mode = EXCLUDED.story_point_mode,
                    fibonacci_points = EXCLUDED.fibonacci_points,
                    sprint_length_policy = EXCLUDED.sprint_length_policy,
                    dod_management = EXCLUDED.dod_management,
                    default_dod_items = EXCLUDED.default_dod_items,
                    openproject_sprint_version_sync = EXCLUDED.openproject_sprint_version_sync,
                    metadata = EXCLUDED.metadata,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = now()
                RETURNING {PROJECT_OPERATION_POLICY_SELECT}
                """,
                tid,
                next_policy["default_delivery_mode"],
                next_policy["story_point_mode"],
                next_policy["fibonacci_points"],
                next_policy["sprint_length_policy"],
                next_policy["dod_management"],
                next_policy["default_dod_items"],
                next_policy["openproject_sprint_version_sync"],
                next_policy["metadata"],
                safe_uuid(current["id"]),
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="project_policy.updated",
                entity_type="project_operation_policy",
                entity_id=tid,
                summary=f"프로젝트 운영 정책 저장: {tid}",
                metadata={"tenant_id": tid, "policy": project_operation_policy_response(record, tid)},
            )

    return project_operation_policy_response(record, tid)


@router.put("/api/settings/{setting_key}")
async def update_setting(setting_key: str, payload: SettingUpdate, request: Request) -> dict[str, Any]:
    current = require_admin_role(request)
    key = setting_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Setting key is required")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            existing = await connection.fetchrow(
                f"SELECT {SETTING_SELECT} FROM wbs_system_settings WHERE key = $1 FOR UPDATE",
                key,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="Setting not found")
            record = await connection.fetchrow(
                f"""
                UPDATE wbs_system_settings
                SET value = $2::jsonb,
                    updated_by = $3,
                    updated_at = now()
                WHERE key = $1
                RETURNING {SETTING_SELECT}
                """,
                key,
                payload.value,
                safe_uuid(current["id"]),
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="setting.updated",
                entity_type="setting",
                entity_id=key,
                summary=f"Setting updated: {key}",
                metadata={"category": existing["category"]},
            )

    setting = setting_response(record)
    return {
        "setting": setting,
        "pm_engine": pm_engine_status(setting["value"]) if key == "pm_engine" else None,
    }


@router.get("/api/settings/auth")
async def get_auth_settings(request: Request) -> dict[str, Any]:
    require_admin_role(request)
    return {
        "auth_backend": AUTH_BACKEND,
        "ldap_server": LDAP_SERVER,
        "ldap_port": LDAP_PORT,
        "ldap_use_ssl": LDAP_USE_SSL,
        "ldap_bind_dn": LDAP_BIND_DN,
        "ldap_base_dn": LDAP_BASE_DN,
        "ldap_user_filter": LDAP_USER_FILTER,
        "ldap_attr_email": LDAP_ATTR_EMAIL,
        "ldap_attr_name": LDAP_ATTR_NAME,
    }


@router.post("/api/settings/auth/test-ldap")
async def test_ldap_connection(payload: LdapTestRequest, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    diagnostics = await asyncio.get_event_loop().run_in_executor(
        None, _run_ldap_diagnostics, payload.email, payload.password
    )
    ok = bool(diagnostics.get("success"))
    return {
        "success": ok,
        "message": "LDAP 인증 성공" if ok else "LDAP 인증 실패 (서버 연결 또는 자격증명 확인)",
        "diagnostics": diagnostics,
    }


@router.post("/api/settings/auth/ldap-diagnostics")
async def run_ldap_diagnostics(payload: LdapDiagnosticsRequest, request: Request) -> dict[str, Any]:
    require_admin_role(request)
    diagnostics = await asyncio.get_event_loop().run_in_executor(
        None,
        _run_ldap_diagnostics,
        payload.email,
        payload.password,
    )
    return diagnostics


@router.get("/api/audit-events/export.csv")
async def export_audit_csv(
    request: Request,
    event_type: str | None = None,
    entity_type: str | None = None,
    actor: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 5000,
) -> StreamingResponse:
    require_admin_role(request)
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        conditions = ["tenant_id = $1"]
        params: list[Any] = [tid]
        if event_type:
            params.append(event_type); conditions.append(f"event_type = ${len(params)}")
        if entity_type:
            params.append(entity_type); conditions.append(f"entity_type = ${len(params)}")
        if actor:
            params.append(f"%{actor}%"); conditions.append(f"actor_email ILIKE ${len(params)}")
        if from_date:
            d = parse_date(from_date)
            if d:
                params.append(d); conditions.append(f"created_at >= ${len(params)}")
        if to_date:
            d = parse_date(to_date)
            if d:
                params.append(d + timedelta(days=1)); conditions.append(f"created_at < ${len(params)}")
        params.append(min(limit, 10000))
        where = " AND ".join(conditions)
        rows = await connection.fetch(
            f"""
            SELECT id, event_type, entity_type, entity_id, summary,
                   actor_email, actor_role, created_at
            FROM wbs_audit_events
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ${len(params)}
            """,
            *params,
        )
    import csv, io
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "event_type", "entity_type", "entity_id", "summary",
                     "actor_email", "actor_role", "created_at"])
    for r in rows:
        writer.writerow([
            str(r["id"]), r["event_type"], r["entity_type"] or "", r["entity_id"] or "",
            r["summary"] or "", r["actor_email"] or "", r["actor_role"] or "",
            r["created_at"].isoformat() if r["created_at"] else "",
        ])
    content = buf.getvalue().encode("utf-8-sig")  # BOM for Excel
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit-{date.today()}.csv"},
    )
