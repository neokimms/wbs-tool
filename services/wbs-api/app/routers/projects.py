"""프로젝트·멤버·역할 API 라우터.
"""
from datetime import date
import json
from typing import Any
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import (
    APPROVAL_SELECT,
    PROJECT_COLLAB_ROLES,
    PROJECT_MANAGE_ROLES,
    PROJECT_MUTATING_ROLES,
    PROJECT_ROLES,
    PROJECT_ROLE_LABELS,
    PROJECT_WORKFLOW_TRANSITIONS,
)
from app.core.db import (
    get_pool,
    normalize_delivery_mode,
    normalize_metadata,
    normalize_record,
    safe_uuid,
    utc_now_iso,
)
from app.core.security import ensure_project_mutate_role, get_tenant_id, require_mutating_role
from app.schemas import (
    ProjectCreate,
    ProjectDeliveryModeUpdate,
    ProjectMemberCreate,
    ProjectMemberUpdate,
    ProjectStatusUpdate,
)
from app.services.approvals import fetch_latest_project_baseline
from app.services.projects import fetch_project_operation_policy, fetch_tenant_project
from app.services.reports import resource_identity_key
from app.services.wbs import fetch_project_rollup

router = APIRouter()


def ensure_project_manage_role(project: dict[str, Any]) -> None:
    if project.get("_project_role") not in PROJECT_MANAGE_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient role")


def validate_project_status(status: str) -> str:
    normalized_status = status.strip().title()
    if normalized_status not in PROJECT_WORKFLOW_TRANSITIONS:
        raise HTTPException(status_code=400, detail="Invalid project status")
    return normalized_status


def ensure_project_transition(current_status: str, next_status: str) -> None:
    current = validate_project_status(current_status)
    target = validate_project_status(next_status)
    if target == current:
        return
    if target not in PROJECT_WORKFLOW_TRANSITIONS[current]:
        raise HTTPException(
            status_code=409,
            detail=f"Project status cannot move from {current} to {target}",
        )


@router.get("/api/projects")
async def list_projects(request: Request) -> list[dict[str, Any]]:
    tid = get_tenant_id(request)
    user = getattr(request.state, "user", None) or {}
    async with get_pool(request).acquire() as connection:
        if user.get("role") == "admin":
            records = await connection.fetch(
                """
                SELECT id, name, template_key, owner, status, start_date, delivery_mode,
                       openproject_project_id, metadata, tenant_id, created_at, updated_at,
                       'admin' AS project_role
                FROM wbs_projects
                WHERE tenant_id = $1
                ORDER BY created_at DESC
                LIMIT 50
                """,
                tid,
            )
        else:
            records = await connection.fetch(
                """
                SELECT p.id, p.name, p.template_key, p.owner, p.status, p.start_date, p.delivery_mode,
                       p.openproject_project_id, p.metadata, p.tenant_id, p.created_at, p.updated_at,
                       m.project_role
                FROM wbs_projects p
                JOIN wbs_project_members m
                  ON m.project_id = p.id AND m.tenant_id = p.tenant_id
                WHERE p.tenant_id = $1 AND m.user_id = $2
                ORDER BY p.created_at DESC
                LIMIT 50
                """,
                tid,
                safe_uuid(user.get("id")),
            )
    return [normalize_record(record) for record in records]


@router.post("/api/projects", status_code=201)
async def create_project(payload: ProjectCreate, request: Request) -> dict[str, Any]:
    require_mutating_role(request)
    start_date = payload.start_date or date.today()
    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))
    metadata: dict[str, Any] = {
        "created_by": "wbs-portal",
        "sync_target": "openproject",
        "strategy": "community-edition-extension-layer",
    }
    if payload.end_date:
        metadata["end_date"] = payload.end_date.isoformat()
    if payload.description:
        metadata["description"] = payload.description
    if payload.client_name:
        metadata["client_name"] = payload.client_name
    if payload.budget:
        metadata["budget"] = payload.budget
    if payload.project_manager:
        metadata["project_manager"] = payload.project_manager

    async with get_pool(request).acquire() as connection:
        template_exists = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM wbs_templates WHERE key = $1)",
            payload.template_key,
        )
        if not template_exists:
            raise HTTPException(status_code=404, detail="Template not found")

        tid = get_tenant_id(request)
        policy = await fetch_project_operation_policy(connection, tid)
        delivery_mode = normalize_delivery_mode(
            payload.delivery_mode if "delivery_mode" in fields_set else policy["default_delivery_mode"]
        )
        metadata["operation_policy"] = {
            "default_delivery_mode": policy["default_delivery_mode"],
            "story_point_mode": policy["story_point_mode"],
            "sprint_length_policy": policy["sprint_length_policy"],
            "dod_management": policy["dod_management"],
            "openproject_sprint_version_sync": policy["openproject_sprint_version_sync"],
            "applied_at": utc_now_iso(),
        }
        record = await connection.fetchrow(
            """
            INSERT INTO wbs_projects
              (name, template_key, owner, status, start_date, delivery_mode, metadata, tenant_id)
            VALUES
              ($1, $2, $3, 'Draft', $4, $5, $6::jsonb, $7)
            RETURNING id, name, template_key, owner, status, start_date, delivery_mode,
                      openproject_project_id, metadata, tenant_id, created_at, updated_at
            """,
            payload.name,
            payload.template_key,
            payload.owner,
            start_date,
            delivery_mode,
            metadata,
            tid,
        )
        creator = getattr(request.state, "user", None) or {}
        creator_id = safe_uuid(creator.get("id"))
        if creator_id:
            await connection.execute(
                """
                INSERT INTO wbs_project_members (tenant_id, project_id, user_id, project_role, granted_by)
                VALUES ($1, $2, $3, 'admin', $3)
                ON CONFLICT (project_id, user_id) DO NOTHING
                """,
                tid, record["id"], creator_id,
            )

        await insert_audit_event(
            connection,
            request=request,
            event_type="project.created",
            entity_type="project",
            entity_id=record["id"],
            summary=f"Project created: {payload.name}",
            metadata={"template_key": payload.template_key, "owner": payload.owner},
        )

    return normalize_record(record)


@router.patch("/api/projects/{project_id}/status")
async def update_project_status(project_id: str, payload: ProjectStatusUpdate, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    target_status = validate_project_status(payload.status)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            ensure_project_mutate_role(project)
            ensure_project_transition(project["status"], target_status)
            record = await connection.fetchrow(
                """
                UPDATE wbs_projects
                SET status = $2,
                    updated_at = now()
                WHERE id = $1
                RETURNING id, name, template_key, owner, status, start_date, delivery_mode,
                          openproject_project_id, metadata, tenant_id, created_at, updated_at
                """,
                parsed_id,
                target_status,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="project.status_changed",
                entity_type="project",
                entity_id=parsed_id,
                summary=f"Project status changed: {project['status']} -> {target_status}",
                metadata={"comment": payload.comment},
            )

    return normalize_record(record)


@router.patch("/api/projects/{project_id}/delivery-mode")
async def update_project_delivery_mode(
    project_id: str,
    payload: ProjectDeliveryModeUpdate,
    request: Request,
) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    target_mode = normalize_delivery_mode(payload.delivery_mode)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            ensure_project_mutate_role(project)
            metadata = normalize_metadata(project.get("metadata"))
            metadata["delivery_mode_updated_at"] = utc_now_iso()
            metadata["delivery_mode_comment"] = payload.comment or ""
            record = await connection.fetchrow(
                """
                UPDATE wbs_projects
                SET delivery_mode = $2,
                    metadata = $3::jsonb,
                    updated_at = now()
                WHERE id = $1 AND tenant_id = $4
                RETURNING id, name, template_key, owner, status, start_date, delivery_mode,
                          openproject_project_id, metadata, tenant_id, created_at, updated_at
                """,
                parsed_id,
                target_mode,
                metadata,
                get_tenant_id(request),
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="project.delivery_mode_changed",
                entity_type="project",
                entity_id=parsed_id,
                summary=f"Project delivery mode changed: {project['name']} -> {target_mode}",
                metadata={"from": project.get("delivery_mode"), "to": target_mode, "comment": payload.comment},
            )

    return normalize_record(record)


PROJECT_MEMBER_SELECT = """
    m.id, m.project_id, m.user_id, m.project_role, m.granted_by, m.created_at, m.updated_at,
    u.email, u.display_name, u.role AS global_role, u.status AS user_status
"""


@router.get("/api/projects/{project_id}/members")
async def list_project_members(project_id: str, request: Request) -> list[dict[str, Any]]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        records = await connection.fetch(
            f"""
            SELECT {PROJECT_MEMBER_SELECT}
            FROM wbs_project_members m
            JOIN wbs_users u ON u.id = m.user_id
            WHERE m.project_id = $1
            ORDER BY u.display_name
            """,
            parsed_id,
        )
    return [normalize_record(record) for record in records]


@router.get("/api/projects/{project_id}/members/candidates")
async def list_project_member_candidates(project_id: str, request: Request) -> list[dict[str, Any]]:
    """이 프로젝트에 아직 멤버로 등록되지 않은, 같은 테넌트 소속 활성 사용자 목록."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        ensure_project_manage_role(project)
        records = await connection.fetch(
            """
            SELECT u.id, u.email, u.display_name, u.role AS global_role
            FROM wbs_users u
            WHERE u.tenant_id = $1
              AND u.status = 'Active'
              AND NOT EXISTS (
                SELECT 1 FROM wbs_project_members m
                WHERE m.project_id = $2 AND m.user_id = u.id
              )
            ORDER BY u.display_name
            """,
            tid, parsed_id,
        )
    return [normalize_record(record) for record in records]


@router.post("/api/projects/{project_id}/members", status_code=201)
async def add_project_member(project_id: str, payload: ProjectMemberCreate, request: Request) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    role = payload.project_role.strip().lower()
    if role not in PROJECT_ROLES:
        raise HTTPException(status_code=400, detail="Invalid project role")

    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            ensure_project_manage_role(project)
            if project["_project_role"] == "pm" and role == "admin":
                raise HTTPException(status_code=403, detail="PM은 프로젝트 관리자 역할을 지정할 수 없습니다")

            target_user = await connection.fetchrow(
                "SELECT id, email, display_name FROM wbs_users WHERE id = $1 AND tenant_id = $2",
                payload.user_id, tid,
            )
            if not target_user:
                raise HTTPException(status_code=404, detail="User not found")

            actor = getattr(request.state, "user", None) or {}
            row = await connection.fetchrow(
                """
                INSERT INTO wbs_project_members (tenant_id, project_id, user_id, project_role, granted_by)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (project_id, user_id)
                DO UPDATE SET project_role = EXCLUDED.project_role, granted_by = EXCLUDED.granted_by, updated_at = now()
                RETURNING id
                """,
                tid, parsed_id, payload.user_id, role, safe_uuid(actor.get("id")),
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="project_member.added",
                entity_type="project",
                entity_id=parsed_id,
                summary=f"Project member added: {target_user['email']} ({role})",
                metadata={"user_id": str(payload.user_id), "email": target_user["email"], "project_role": role},
            )
            record = await connection.fetchrow(
                f"""
                SELECT {PROJECT_MEMBER_SELECT}
                FROM wbs_project_members m
                JOIN wbs_users u ON u.id = m.user_id
                WHERE m.id = $1
                """,
                row["id"],
            )

    return normalize_record(record)


@router.patch("/api/projects/{project_id}/members/{member_id}")
async def update_project_member(
    project_id: str, member_id: str, payload: ProjectMemberUpdate, request: Request
) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    parsed_member_id = safe_uuid(member_id)
    if not parsed_id or not parsed_member_id:
        raise HTTPException(status_code=400, detail="Invalid id")
    role = payload.project_role.strip().lower()
    if role not in PROJECT_ROLES:
        raise HTTPException(status_code=400, detail="Invalid project role")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            ensure_project_manage_role(project)

            member = await connection.fetchrow(
                """
                SELECT m.id, m.user_id, m.project_role, u.email
                FROM wbs_project_members m
                JOIN wbs_users u ON u.id = m.user_id
                WHERE m.id = $1 AND m.project_id = $2
                FOR UPDATE
                """,
                parsed_member_id, parsed_id,
            )
            if not member:
                raise HTTPException(status_code=404, detail="Member not found")
            if project["_project_role"] == "pm" and (role == "admin" or member["project_role"] == "admin"):
                raise HTTPException(status_code=403, detail="PM은 프로젝트 관리자 역할을 변경할 수 없습니다")

            if member["project_role"] == "admin" and role != "admin":
                remaining_admins = await connection.fetchval(
                    """
                    SELECT count(*) FROM wbs_project_members
                    WHERE project_id = $1 AND project_role = 'admin' AND id != $2
                    """,
                    parsed_id, parsed_member_id,
                )
                if remaining_admins == 0:
                    raise HTTPException(status_code=400, detail="At least one project admin is required")

            await connection.execute(
                "UPDATE wbs_project_members SET project_role = $2, updated_at = now() WHERE id = $1",
                parsed_member_id, role,
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="project_member.role_changed",
                entity_type="project",
                entity_id=parsed_id,
                summary=f"Project member role changed: {member['email']} {member['project_role']} -> {role}",
                metadata={"user_id": str(member["user_id"]), "email": member["email"], "from": member["project_role"], "to": role},
            )
            record = await connection.fetchrow(
                f"""
                SELECT {PROJECT_MEMBER_SELECT}
                FROM wbs_project_members m
                JOIN wbs_users u ON u.id = m.user_id
                WHERE m.id = $1
                """,
                parsed_member_id,
            )

    return normalize_record(record)


@router.delete("/api/projects/{project_id}/members/{member_id}", status_code=204)
async def remove_project_member(project_id: str, member_id: str, request: Request) -> None:
    parsed_id = safe_uuid(project_id)
    parsed_member_id = safe_uuid(member_id)
    if not parsed_id or not parsed_member_id:
        raise HTTPException(status_code=400, detail="Invalid id")

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, parsed_id, for_update=True)
            ensure_project_manage_role(project)

            member = await connection.fetchrow(
                """
                SELECT m.id, m.user_id, m.project_role, u.email
                FROM wbs_project_members m
                JOIN wbs_users u ON u.id = m.user_id
                WHERE m.id = $1 AND m.project_id = $2
                FOR UPDATE
                """,
                parsed_member_id, parsed_id,
            )
            if not member:
                raise HTTPException(status_code=404, detail="Member not found")
            if project["_project_role"] == "pm" and member["project_role"] == "admin":
                raise HTTPException(status_code=403, detail="PM은 프로젝트 관리자를 제외할 수 없습니다")

            if member["project_role"] == "admin":
                remaining_admins = await connection.fetchval(
                    """
                    SELECT count(*) FROM wbs_project_members
                    WHERE project_id = $1 AND project_role = 'admin' AND id != $2
                    """,
                    parsed_id, parsed_member_id,
                )
                if remaining_admins == 0:
                    raise HTTPException(status_code=400, detail="At least one project admin is required")

            await connection.execute("DELETE FROM wbs_project_members WHERE id = $1", parsed_member_id)
            await insert_audit_event(
                connection,
                request=request,
                event_type="project_member.removed",
                entity_type="project",
                entity_id=parsed_id,
                summary=f"Project member removed: {member['email']}",
                metadata={"user_id": str(member["user_id"]), "email": member["email"], "project_role": member["project_role"]},
            )


@router.get("/api/project-roles")
async def list_project_roles() -> dict[str, Any]:
    """프로젝트 단위 역할 정의 (멤버 관리 화면용)."""
    order = ["admin", "pm", "pmo", "member", "reviewer", "viewer"]
    return {
        "roles": [
            {
                "key": key,
                "label": PROJECT_ROLE_LABELS[key],
                "can_edit_wbs": key in PROJECT_MUTATING_ROLES,
                "can_manage_members": key in PROJECT_MANAGE_ROLES,
                "can_collaborate": key in PROJECT_COLLAB_ROLES,
            }
            for key in order
        ]
    }


@router.get("/api/projects/{project_id}")
async def get_project_detail(project_id: str, request: Request) -> dict[str, Any]:
    """프로젝트 상세 — WBS 통계, 리스크/이슈 요약, 최근 승인, 최근 감사 포함."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)

        # WBS 통계 — 공통 산식(wbs_rules)
        detail_rollup = await fetch_project_rollup(connection, parsed_id)

        # 리스크 요약
        risks = await connection.fetch(
            """
            SELECT id, title, severity, status, owner, due_date, created_at
            FROM wbs_risks WHERE project_id = $1 AND tenant_id = $2
            ORDER BY CASE severity WHEN '높음' THEN 0 WHEN '보통' THEN 1 ELSE 2 END, created_at DESC
            LIMIT 10
            """,
            parsed_id, tid,
        )

        # 이슈 요약
        issues = await connection.fetch(
            """
            SELECT id, title, priority, status, assignee, due_date, created_at
            FROM wbs_issues WHERE project_id = $1 AND tenant_id = $2
            ORDER BY CASE priority WHEN '높음' THEN 0 WHEN '보통' THEN 1 ELSE 2 END, created_at DESC
            LIMIT 10
            """,
            parsed_id, tid,
        )

        # 최근 승인 이력
        approvals = await connection.fetch(
            f"""
            SELECT {APPROVAL_SELECT}
            FROM wbs_approval_requests a
            JOIN wbs_projects p ON p.id = a.project_id
            WHERE a.project_id = $1 AND a.tenant_id = $2
            ORDER BY a.created_at DESC LIMIT 5
            """,
            parsed_id, tid,
        )

        # 베이스라인
        baseline = await fetch_latest_project_baseline(connection, parsed_id)

        # 진행중인 동기화 현황
        last_sync = await connection.fetchrow(
            """
            SELECT id, status, started_at, completed_at, metadata
            FROM wbs_sync_runs WHERE project_id = $1
            ORDER BY started_at DESC LIMIT 1
            """,
            parsed_id,
        )

    sm = detail_rollup["summary"]

    return {
        "project": normalize_record(project),
        "project_role": project["_project_role"],
        "wbs_summary": {
            "total_items": sm["item_count"],
            "leaf_items": sm["leaf_count"],
            "done_items": sm["done_leaf_count"],
            "delayed_items": sm["delayed_leaf_count"],
            "total_weight": sm["total_weight"],
            "earned_weight": sm["earned_weight"],
            "progress_pct": sm["progress_pct"],
            "planned_pct": sm["planned_pct"],
            "spi": sm["spi"],
            "as_of": sm["as_of"],
            "formula": sm["formula"],
        },
        "risks": [normalize_record(r) for r in risks],
        "issues": [normalize_record(i) for i in issues],
        "approvals": [normalize_record(a) for a in approvals],
        "baseline": baseline,
        "last_sync": normalize_record(last_sync) if last_sync else None,
    }


@router.get("/api/projects/{project_id}/owner-map")
async def get_owner_map(project_id: str, request: Request) -> dict[str, Any]:
    """WBS 항목의 owner/reviewer/approver를 집계하고 계정 매칭 결과를 반환합니다."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        tenant_id = get_tenant_id(request)

        rows = await connection.fetch(
            "SELECT code, owner, metadata FROM wbs_project_wbs_items WHERE project_id = $1",
            parsed_id,
        )
        db_users = await connection.fetch(
            "SELECT id::text, email, display_name, role FROM wbs_users WHERE tenant_id = $1 AND status = 'Active'",
            tenant_id,
        )
        user_list = [dict(u) for u in db_users]
        name_idx = {resource_identity_key(u["display_name"]): u for u in user_list}
        email_idx = {resource_identity_key(u["email"] or ""): u for u in user_list if u.get("email")}

        def find_user(name: str | None) -> dict[str, Any] | None:
            if not name:
                return None
            k = resource_identity_key(name)
            return name_idx.get(k) or email_idx.get(k)

        raw_names: dict[str, dict[str, Any]] = {}

        def record(name: str | None, code: str, field: str) -> None:
            if not name or not name.strip():
                return
            n = name.strip()
            if n not in raw_names:
                u = find_user(n)
                raw_names[n] = {
                    "raw_name": n,
                    "usages": [],
                    "matched_user": {"id": u["id"], "display_name": u["display_name"], "email": u["email"]} if u else None,
                }
            raw_names[n]["usages"].append({"code": code, "field": field})

        for row in rows:
            meta = row["metadata"] or {}
            record(row["owner"], row["code"], "owner")
            if isinstance(meta, dict):
                record(meta.get("reviewer"), row["code"], "reviewer")
                record(meta.get("approver"), row["code"], "approver")

        assignees = sorted(raw_names.values(), key=lambda x: (x["matched_user"] is not None, x["raw_name"]))
        return {
            "assignees": assignees,
            "users": user_list,
        }


@router.post("/api/projects/{project_id}/owner-remap")
async def remap_owners(project_id: str, request: Request) -> dict[str, Any]:
    """담당자 이름을 일괄 교체합니다. body: { mappings: { 'old': 'new' } }"""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    body = await request.json()
    mappings: dict[str, str | None] = body.get("mappings", {})
    if not mappings:
        raise HTTPException(status_code=400, detail="mappings required")

    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        rows = await connection.fetch(
            "SELECT id, code, owner, metadata FROM wbs_project_wbs_items WHERE project_id = $1",
            parsed_id,
        )
        updated = 0
        async with connection.transaction():
            for row in rows:
                new_owner = mappings.get(row["owner"], row["owner"]) if row["owner"] else row["owner"]
                meta = row["metadata"] or {}
                new_meta: dict[str, Any] = dict(meta) if isinstance(meta, dict) else {}
                changed = new_owner != row["owner"]

                if isinstance(meta, dict):
                    old_reviewer = meta.get("reviewer")
                    old_approver = meta.get("approver")
                    if old_reviewer and old_reviewer in mappings:
                        new_meta["reviewer"] = mappings[old_reviewer]
                        changed = True
                    if old_approver and old_approver in mappings:
                        new_meta["approver"] = mappings[old_approver]
                        changed = True

                if changed:
                    await connection.execute(
                        "UPDATE wbs_project_wbs_items SET owner = $1, metadata = $2::jsonb, updated_at = now() WHERE id = $3",
                        new_owner, json.dumps(new_meta, ensure_ascii=False), row["id"],
                    )
                    updated += 1

        return {"updated": updated}
