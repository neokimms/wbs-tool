"""리스크·이슈·변경요청 API 라우터.
"""
from datetime import datetime, timezone
from typing import Any
from uuid import UUID
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.db import get_pool, normalize_metadata, normalize_record, parse_date, safe_uuid
from app.core.security import ensure_project_collab_role, ensure_project_mutate_role, get_tenant_id
from app.schemas import ChangeRequestCreate, ChangeRequestUpdate, IssueCreate, IssueUpdate, RiskCreate, RiskUpdate
from app.services.projects import fetch_tenant_project

router = APIRouter()


@router.get("/api/risks")
async def list_risks(request: Request, project_id: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        params: list[Any] = [tid]
        conditions = ["r.tenant_id = $1"]
        if project_id:
            try:
                pid = UUID(project_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid project_id")
            params.append(pid)
            conditions.append(f"r.project_id = ${len(params)}")
        if status:
            params.append(status)
            conditions.append(f"r.status = ${len(params)}")
        where = " AND ".join(conditions)
        rows = await connection.fetch(
            f"""
            SELECT r.*, p.name AS project_name
            FROM wbs_risks r
            JOIN wbs_projects p
              ON p.id = r.project_id
             AND p.tenant_id = r.tenant_id
            WHERE {where}
            ORDER BY
              CASE r.severity WHEN '높음' THEN 0 WHEN '보통' THEN 1 ELSE 2 END,
              r.created_at DESC
            """,
            *params,
        )
        return [normalize_record(row) for row in rows]


@router.post("/api/projects/{project_id}/risks", status_code=201)
async def create_risk(project_id: str, payload: RiskCreate, request: Request) -> dict[str, Any]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id")
    due = parse_date(payload.due_date) if payload.due_date else None
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, pid)
        ensure_project_collab_role(project)
        user = getattr(request.state, "user", None)
        row = await connection.fetchrow(
            """
            INSERT INTO wbs_risks
              (project_id, title, description, severity, likelihood, owner, mitigation, wbs_code, due_date, created_by, tenant_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *
            """,
            pid, payload.title, payload.description, payload.severity, payload.likelihood,
            payload.owner, payload.mitigation, payload.wbs_code, due,
            UUID(str(user["id"])) if user else None, tid,
        )
        await insert_audit_event(
            connection, request=request,
            event_type="risk.created",
            entity_type="risk", entity_id=str(row["id"]),
            summary=f"리스크 등록: {payload.title} (프로젝트: {project['name']})",
            metadata={"severity": payload.severity, "project_id": project_id},
        )
        return normalize_record(row)


@router.patch("/api/risks/{risk_id}")
async def update_risk(risk_id: str, payload: RiskUpdate, request: Request) -> dict[str, Any]:
    try:
        rid = UUID(risk_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid risk_id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        risk = await connection.fetchrow("SELECT * FROM wbs_risks WHERE id = $1 AND tenant_id = $2", rid, tid)
        if not risk:
            raise HTTPException(status_code=404, detail="Risk not found")
        ensure_project_mutate_role(await fetch_tenant_project(connection, request, risk["project_id"]))
        updates: dict[str, Any] = {}
        for field in ("title", "description", "severity", "likelihood", "status", "owner", "mitigation", "wbs_code"):
            val = getattr(payload, field)
            if val is not None:
                updates[field] = val
        if payload.due_date is not None:
            updates["due_date"] = parse_date(payload.due_date) if payload.due_date else None
        if not updates:
            return normalize_record(risk)
        updates["updated_at"] = datetime.now(timezone.utc)
        set_clause = ", ".join(f"{k} = ${i+3}" for i, k in enumerate(updates))
        row = await connection.fetchrow(
            f"UPDATE wbs_risks SET {set_clause} WHERE id = $1 AND tenant_id = $2 RETURNING *",
            rid, tid, *updates.values(),
        )
        await insert_audit_event(
            connection, request=request,
            event_type="risk.updated",
            entity_type="risk", entity_id=risk_id,
            summary=f"리스크 수정: {row['title']}",
            metadata={"changes": list(updates.keys())},
        )
        return normalize_record(row)


# ── P2-02: 이슈 트래킹 ──────────────────────────────────────────────────────

@router.get("/api/issues")
async def list_issues(request: Request, project_id: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        params: list[Any] = [tid]
        conditions = ["i.tenant_id = $1"]
        if project_id:
            try:
                pid = UUID(project_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid project_id")
            params.append(pid)
            conditions.append(f"i.project_id = ${len(params)}")
        if status:
            params.append(status)
            conditions.append(f"i.status = ${len(params)}")
        where = " AND ".join(conditions)
        rows = await connection.fetch(
            f"""
            SELECT i.*, p.name AS project_name
            FROM wbs_issues i
            JOIN wbs_projects p
              ON p.id = i.project_id
             AND p.tenant_id = i.tenant_id
            WHERE {where}
            ORDER BY
              CASE i.priority WHEN '높음' THEN 0 WHEN '보통' THEN 1 ELSE 2 END,
              i.created_at DESC
            """,
            *params,
        )
        return [normalize_record(row) for row in rows]


@router.post("/api/projects/{project_id}/issues", status_code=201)
async def create_issue(project_id: str, payload: IssueCreate, request: Request) -> dict[str, Any]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id")
    due = parse_date(payload.due_date) if payload.due_date else None
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, pid)
        ensure_project_collab_role(project)
        user = getattr(request.state, "user", None)
        row = await connection.fetchrow(
            """
            INSERT INTO wbs_issues
              (project_id, title, description, priority, assignee, wbs_code, due_date, created_by, tenant_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *
            """,
            pid, payload.title, payload.description, payload.priority,
            payload.assignee, payload.wbs_code, due,
            UUID(str(user["id"])) if user else None, tid,
        )
        await insert_audit_event(
            connection, request=request,
            event_type="issue.created",
            entity_type="issue", entity_id=str(row["id"]),
            summary=f"이슈 등록: {payload.title} (프로젝트: {project['name']})",
            metadata={"priority": payload.priority, "project_id": project_id},
        )
        return normalize_record(row)


@router.patch("/api/issues/{issue_id}")
async def update_issue(issue_id: str, payload: IssueUpdate, request: Request) -> dict[str, Any]:
    try:
        iid = UUID(issue_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid issue_id")
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        issue = await connection.fetchrow("SELECT * FROM wbs_issues WHERE id = $1 AND tenant_id = $2", iid, tid)
        if not issue:
            raise HTTPException(status_code=404, detail="Issue not found")
        ensure_project_mutate_role(await fetch_tenant_project(connection, request, issue["project_id"]))
        updates: dict[str, Any] = {}
        for field in ("title", "description", "priority", "status", "assignee", "wbs_code"):
            val = getattr(payload, field)
            if val is not None:
                updates[field] = val
        if payload.due_date is not None:
            updates["due_date"] = parse_date(payload.due_date) if payload.due_date else None
        if payload.status in ("Resolved", "Closed") and issue["status"] not in ("Resolved", "Closed"):
            updates["resolved_at"] = datetime.now(timezone.utc)
        if not updates:
            return normalize_record(issue)
        updates["updated_at"] = datetime.now(timezone.utc)
        set_clause = ", ".join(f"{k} = ${i+3}" for i, k in enumerate(updates))
        row = await connection.fetchrow(
            f"UPDATE wbs_issues SET {set_clause} WHERE id = $1 AND tenant_id = $2 RETURNING *",
            iid, tid, *updates.values(),
        )
        await insert_audit_event(
            connection, request=request,
            event_type="issue.updated",
            entity_type="issue", entity_id=issue_id,
            summary=f"이슈 수정: {row['title']}",
            metadata={"changes": list(updates.keys())},
        )
        return normalize_record(row)


@router.get("/api/change-requests")
async def list_all_change_requests(request: Request) -> dict[str, Any]:
    """전사(테넌트) 전체 변경요청 — 프로젝트 단위 CR + WBS 항목별 CR을 합쳐 반환."""
    tid = get_tenant_id(request)
    user = getattr(request.state, "user", None) or {}
    is_admin = user.get("role") == "admin"
    user_id = safe_uuid(user.get("id"))

    member_join = "" if is_admin else "JOIN wbs_project_members m ON m.project_id = p.id AND m.tenant_id = p.tenant_id"
    member_where = "" if is_admin else "AND m.user_id = $2"
    params: list[Any] = [tid] if is_admin else [tid, user_id]

    async with get_pool(request).acquire() as connection:
        project_cr_records = await connection.fetch(
            f"""
            SELECT cr.*, p.name AS project_name
            FROM wbs_change_requests cr
            JOIN wbs_projects p ON p.id = cr.project_id
            {member_join}
            WHERE cr.tenant_id = $1 {member_where}
            ORDER BY cr.created_at DESC
            """,
            *params,
        )
        item_records = await connection.fetch(
            f"""
            SELECT i.project_id, i.code AS wbs_code, i.name AS item_name, i.metadata, p.name AS project_name
            FROM wbs_project_wbs_items i
            JOIN wbs_projects p ON p.id = i.project_id
            {member_join}
            WHERE i.tenant_id = $1 {member_where}
              AND jsonb_array_length(COALESCE(i.metadata->'cr_list', '[]'::jsonb)) > 0
            """,
            *params,
        )

    project_crs = []
    for record in project_cr_records:
        row = normalize_record(record)
        project_crs.append({
            "source": "project",
            "id": str(row.get("id")),
            "project_id": str(row.get("project_id")),
            "project_name": row.get("project_name"),
            "wbs_code": row.get("wbs_code"),
            "version": row.get("version"),
            "title": row.get("title"),
            "status": row.get("status"),
            "priority": row.get("priority"),
            "requested_by": row.get("requested_by"),
            "created_at": row.get("created_at"),
        })

    item_crs = []
    for record in item_records:
        row = normalize_record(record)
        meta = normalize_metadata(row.get("metadata"))
        for cr in (meta.get("cr_list") or []):
            if not isinstance(cr, dict):
                continue
            item_crs.append({
                "source": "item",
                "id": cr.get("id"),
                "project_id": str(row.get("project_id")),
                "project_name": row.get("project_name"),
                "wbs_code": row.get("wbs_code"),
                "wbs_name": row.get("item_name"),
                "version": None,
                "title": cr.get("title"),
                "status": cr.get("status") or "등록",
                "priority": cr.get("impact"),
                "requested_by": cr.get("requestedBy"),
                "created_at": cr.get("date"),
            })

    return {
        "project_change_requests": project_crs,
        "item_change_requests": item_crs,
        "total": len(project_crs) + len(item_crs),
    }


@router.get("/api/projects/{project_id}/change-requests")
async def list_change_requests(
    project_id: str, request: Request,
    status: str | None = None,
) -> list[dict[str, Any]]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)
        where = "project_id = $1 AND tenant_id = $2"
        params: list[Any] = [parsed_id, get_tenant_id(request)]
        if status:
            params.append(status)
            where += f" AND status = ${len(params)}"
        rows = await connection.fetch(
            f"""
            SELECT * FROM wbs_change_requests
            WHERE {where}
            ORDER BY CASE priority WHEN '높음' THEN 0 WHEN '보통' THEN 1 ELSE 2 END,
                     created_at DESC
            """,
            *params,
        )
        return [normalize_record(r) for r in rows]


@router.post("/api/projects/{project_id}/change-requests", status_code=201)
async def create_change_request(
    project_id: str, payload: ChangeRequestCreate, request: Request
) -> dict[str, Any]:
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    tid = get_tenant_id(request)
    user = getattr(request.state, "user", None)
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        ensure_project_mutate_role(project)
        # 버전 자동 증가
        last_ver = await connection.fetchval(
            "SELECT count(*) FROM wbs_change_requests WHERE project_id = $1", parsed_id
        ) or 0
        version = f"CR-{int(last_ver) + 1:03d}"
        row = await connection.fetchrow(
            """
            INSERT INTO wbs_change_requests
              (project_id, version, title, description, impact_scope,
               impact_schedule_days, impact_cost, priority, wbs_code,
               requested_by, created_by, tenant_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *
            """,
            parsed_id, version, payload.title, payload.description,
            payload.impact_scope, payload.impact_schedule_days,
            payload.impact_cost, payload.priority, payload.wbs_code,
            payload.requested_by,
            UUID(str(user["id"])) if user else None,
            tid,
        )
        await insert_audit_event(
            connection, request=request,
            event_type="cr.created", entity_type="change_request", entity_id=str(row["id"]),
            summary=f"변경요청 생성: {version} {payload.title}",
            metadata={"project_id": project_id, "priority": payload.priority},
        )
        return normalize_record(row)


@router.patch("/api/change-requests/{cr_id}")
async def update_change_request(
    cr_id: str, payload: ChangeRequestUpdate, request: Request
) -> dict[str, Any]:
    parsed = safe_uuid(cr_id)
    if not parsed:
        raise HTTPException(status_code=400, detail="Invalid id")
    updates: dict[str, Any] = {}
    for f in ("title", "description", "impact_scope", "impact_schedule_days",
              "impact_cost", "priority", "resolution"):
        v = getattr(payload, f)
        if v is not None:
            updates[f] = v
    if payload.status is not None:
        if payload.status not in ("Open", "Approved", "Rejected", "Withdrawn"):
            raise HTTPException(status_code=400, detail="Invalid status")
        updates["status"] = payload.status
        if payload.status == "Approved":
            updates["approved_at"] = datetime.now(timezone.utc)
        elif payload.status == "Rejected":
            updates["rejected_at"] = datetime.now(timezone.utc)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc)
    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    params: list[Any] = [parsed, *updates.values()]
    async with get_pool(request).acquire() as connection:
        current = await connection.fetchrow(
            "SELECT project_id FROM wbs_change_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
            parsed, get_tenant_id(request),
        )
        if not current:
            raise HTTPException(status_code=404, detail="Change request not found")
        ensure_project_mutate_role(await fetch_tenant_project(connection, request, current["project_id"]))
        row = await connection.fetchrow(
            f"UPDATE wbs_change_requests SET {set_clause} WHERE id = $1 AND tenant_id = ${len(params) + 1} RETURNING *",
            *params,
            get_tenant_id(request),
        )
        await insert_audit_event(
            connection, request=request,
            event_type="cr.updated", entity_type="change_request", entity_id=cr_id,
            summary=f"변경요청 수정: {row['version']} → {updates.get('status', row['status'])}",
        )
        return normalize_record(row)
