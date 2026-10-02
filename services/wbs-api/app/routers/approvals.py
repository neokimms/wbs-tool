"""승인 워크플로우 API 라우터.
"""
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import (
    APPROVAL_ALLOWED_PROJECT_STATUSES,
    APPROVAL_SELECT,
    BASELINE_SELECT,
    OPENPROJECT_API_TOKEN,
    OPENPROJECT_AUTH_MODE,
    OPENPROJECT_BASE_URL,
    OPENPROJECT_SYNC_ENABLED,
    PM_ENGINE_ADAPTER,
    logger,
)
from app.core.db import get_pool, normalize_metadata, normalize_record, utc_now_iso
from app.core.notify import send_notification
from app.core.security import ensure_project_mutate_role, get_tenant_id
from app.schemas import ApprovalCreate, ApprovalDecision
from app.services.approvals import baseline_summary
from app.services.pm_engine import OpenProjectClient, normalize_openproject_identifier
from app.services.projects import ensure_project_status_allowed, fetch_tenant_project
from app.services.wbs import (
    fetch_project_wbs_items,
    fetch_template,
    fetch_template_items,
    serialize_wbs_row,
    template_rows_or_phases,
)

router = APIRouter()


def baseline_snapshot_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    snapshot_rows: list[dict[str, Any]] = []
    for row in rows:
        snapshot_rows.append(
            serialize_wbs_row(
                {
                    "code": row.get("code"),
                    "parent_code": row.get("parent_code"),
                    "name": row.get("name"),
                    "item_type": row.get("item_type") or "작업",
                    "owner": row.get("owner"),
                    "weight": row.get("weight"),
                    "start_date": row.get("start_date"),
                    "finish_date": row.get("finish_date"),
                    "sort_order": row.get("sort_order"),
                    "metadata": normalize_metadata(row.get("metadata")),
                }
            )
        )
    return snapshot_rows


def baseline_total_weight(rows: list[dict[str, Any]]) -> float:
    root_weight = next(
        (row.get("weight") for row in rows if not row.get("parent_code") and row.get("weight") is not None),
        None,
    )
    if root_weight is not None:
        return float(root_weight)

    top_level_weights = [
        float(row["weight"])
        for row in rows
        if not row.get("parent_code") and row.get("weight") is not None
    ]
    if top_level_weights:
        return sum(top_level_weights)

    return sum(float(row["weight"]) for row in rows if row.get("weight") is not None)


async def create_project_baseline(
    connection: asyncpg.Connection,
    *,
    project_id: UUID,
    approval_id: UUID,
    template_key: str,
    actor: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    existing = await connection.fetchrow(
        f"""
        SELECT {BASELINE_SELECT}
        FROM wbs_project_baselines b
        JOIN wbs_projects p ON p.id = b.project_id
        WHERE b.approval_id = $1
        """,
        approval_id,
    )
    if existing:
        return normalize_record(existing)

    template = await fetch_template(connection, template_key)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found for baseline")
    project_rows = await fetch_project_wbs_items(connection, project_id)
    baseline_source = "project_wbs" if project_rows else "template"
    rows = project_rows or template_rows_or_phases(template, await fetch_template_items(connection, template_key))
    snapshot_rows = baseline_snapshot_rows(rows)
    version = await connection.fetchval(
        "SELECT COALESCE(max(version), 0) + 1 FROM wbs_project_baselines WHERE project_id = $1",
        project_id,
    )
    record = await connection.fetchrow(
        f"""
        WITH inserted AS (
          INSERT INTO wbs_project_baselines
            (project_id, approval_id, version, status, template_key, template_name,
             item_count, total_weight, snapshot_rows, metadata)
          VALUES
            ($1, $2, $3, 'Locked', $4, $5, $6, $7, $8::jsonb, $9::jsonb)
          RETURNING *
        )
        SELECT {BASELINE_SELECT}
        FROM inserted b
        JOIN wbs_projects p ON p.id = b.project_id
        """,
        project_id,
        approval_id,
        version,
        template["key"],
        template["name"],
        len(snapshot_rows),
        baseline_total_weight(rows),
        snapshot_rows,
        {
            "locked_by": actor,
            "source": "approval",
            "baseline_source": baseline_source,
            **(metadata or {}),
        },
    )
    return normalize_record(record)


async def fetch_approval(
    connection: asyncpg.Connection,
    approval_id: UUID,
    tenant_id: str | None = None,
) -> dict[str, Any] | None:
    params: list[Any] = [approval_id]
    tenant_filter = ""
    if tenant_id is not None:
        params.append(tenant_id)
        tenant_filter = f" AND a.tenant_id = ${len(params)}"
    record = await connection.fetchrow(
        f"""
        SELECT {APPROVAL_SELECT}
        FROM wbs_approval_requests a
        JOIN wbs_projects p ON p.id = a.project_id
        WHERE a.id = $1{tenant_filter}
        """,
        *params,
    )
    return normalize_record(record) if record else None


async def fetch_approval_for_update(
    connection: asyncpg.Connection,
    approval_id: UUID,
    tenant_id: str | None = None,
) -> dict[str, Any] | None:
    params: list[Any] = [approval_id]
    tenant_filter = ""
    if tenant_id is not None:
        params.append(tenant_id)
        tenant_filter = f" AND a.tenant_id = ${len(params)}"
    record = await connection.fetchrow(
        f"""
        SELECT {APPROVAL_SELECT}
        FROM wbs_approval_requests a
        JOIN wbs_projects p ON p.id = a.project_id
        WHERE a.id = $1{tenant_filter}
        FOR UPDATE OF a
        """,
        *params,
    )
    return normalize_record(record) if record else None


@router.get("/api/approvals")
async def list_approvals(request: Request) -> list[dict[str, Any]]:
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        records = await connection.fetch(
            f"""
            SELECT {APPROVAL_SELECT}
            FROM wbs_approval_requests a
            JOIN wbs_projects p ON p.id = a.project_id
            WHERE a.tenant_id = $1
            ORDER BY
              CASE a.status
                WHEN 'Pending' THEN 0
                WHEN 'Approved' THEN 1
                WHEN 'Rejected' THEN 2
                ELSE 3
              END,
              a.created_at DESC
            LIMIT 50
            """,
            tid,
        )
    return [normalize_record(record) for record in records]


@router.post("/api/approvals", status_code=201)
async def create_approval(payload: ApprovalCreate, request: Request) -> dict[str, Any]:
    tid = get_tenant_id(request)
    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            project = await fetch_tenant_project(connection, request, payload.project_id, for_update=True)
            ensure_project_mutate_role(project)
            ensure_project_status_allowed(project, APPROVAL_ALLOWED_PROJECT_STATUSES, "Approval request")

            pending_exists = await connection.fetchval(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM wbs_approval_requests
                  WHERE project_id = $1 AND status = 'Pending' AND tenant_id = $2
                )
                """,
                payload.project_id,
                tid,
            )
            if pending_exists:
                raise HTTPException(status_code=409, detail="Project already has a pending approval")

            title = payload.title or f"{project['name']} WBS baseline approval"
            approval_status = "Approved" if payload.auto_approve_internal else "Pending"
            project_status = "Approved" if payload.auto_approve_internal else "Review"
            decision_comment = "Auto-approved internal PMO baseline" if payload.auto_approve_internal else None
            approval_metadata = {
                **payload.metadata,
                "approval_mode": "auto_internal" if payload.auto_approve_internal else "manual",
            }
            record = await connection.fetchrow(
                f"""
                INSERT INTO wbs_approval_requests
                  (project_id, title, request_type, status, requester, reviewer,
                   due_date, decision_comment, metadata, decided_at, tenant_id)
                VALUES
                  ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb,
                   CASE WHEN $4 = 'Approved' THEN now() ELSE NULL END, $10)
                RETURNING id
                """,
                payload.project_id,
                title,
                payload.request_type,
                approval_status,
                payload.requester,
                payload.reviewer,
                payload.due_date,
                decision_comment,
                approval_metadata,
                tid,
            )
            await connection.execute(
                """
                UPDATE wbs_projects
                SET status = $2,
                    updated_at = now()
                WHERE id = $1
                """,
                payload.project_id,
                project_status,
            )
            approval = await fetch_approval(connection, record["id"], tid)
            if payload.auto_approve_internal:
                baseline = await create_project_baseline(
                    connection,
                    project_id=payload.project_id,
                    approval_id=record["id"],
                    template_key=project["template_key"],
                    actor=payload.reviewer or payload.requester,
                    metadata={
                        "approval_mode": "auto_internal",
                        "request_type": payload.request_type,
                    },
                )
                approval["baseline"] = baseline_summary(baseline)
            await insert_audit_event(
                connection,
                request=request,
                event_type="approval.created",
                entity_type="approval",
                entity_id=record["id"],
                summary=f"Approval {approval_status}: {title}",
                metadata={
                    "project_id": str(payload.project_id),
                    "approval_mode": approval_metadata["approval_mode"],
                    "status": approval_status,
                    "baseline_locked": bool(approval.get("baseline", {}).get("locked")),
                },
            )

    return approval


@router.post("/api/approvals/{approval_id}/approve")
async def approve_approval(approval_id: str, payload: ApprovalDecision, request: Request) -> dict[str, Any]:
    try:
        parsed_id = UUID(approval_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid approval id") from exc

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            approval = await fetch_approval_for_update(connection, parsed_id, get_tenant_id(request))
            if not approval:
                raise HTTPException(status_code=404, detail="Approval request not found")
            ensure_project_mutate_role(await fetch_tenant_project(connection, request, approval["project_id"]))
            if approval["status"] != "Pending":
                raise HTTPException(status_code=409, detail="Approval request is already decided")

            await connection.execute(
                """
                UPDATE wbs_approval_requests
                SET status = 'Approved',
                    reviewer = $2,
                    decision_comment = $3,
                    decided_at = now(),
                    updated_at = now()
                WHERE id = $1
                """,
                parsed_id,
                payload.reviewer,
                payload.comment,
            )
            await connection.execute(
                """
                UPDATE wbs_projects
                SET status = 'Approved',
                    updated_at = now()
                WHERE id = $1
                """,
                approval["project_id"],
            )
            updated = await fetch_approval(connection, parsed_id, get_tenant_id(request))
            baseline = await create_project_baseline(
                connection,
                project_id=approval["project_id"],
                approval_id=parsed_id,
                template_key=approval["template_key"],
                actor=payload.reviewer,
                metadata={
                    "approval_mode": "manual",
                    "request_type": approval["request_type"],
                },
            )
            updated["baseline"] = baseline_summary(baseline)
            await insert_audit_event(
                connection,
                request=request,
                event_type="approval.approved",
                entity_type="approval",
                entity_id=parsed_id,
                summary=f"Approval approved: {approval['title']}",
                metadata={
                    "project_id": str(approval["project_id"]),
                    "baseline_locked": bool(updated["baseline"].get("locked")),
                },
            )

    # ── 승인 후 OpenProject 자동 동기화 시도 ────────────────────
    # OP가 연결된 경우에만 실행 (실패해도 승인 결과에 영향 없음)
    auto_sync_result: dict[str, Any] = {"triggered": False}
    if OPENPROJECT_SYNC_ENABLED and OPENPROJECT_API_TOKEN and PM_ENGINE_ADAPTER != "mock":
        try:
            project_id_for_sync = approval["project_id"]
            async with get_pool(request).acquire() as connection:
                project = await fetch_tenant_project(connection, request, project_id_for_sync)
            if project:
                metadata   = normalize_metadata(project.get("metadata"))
                engine_meta = normalize_metadata(metadata.get("pm_engine"))
                rows_data  = await request.app.state.pool.fetch(
                    "SELECT * FROM wbs_project_wbs_items WHERE project_id = $1 ORDER BY sort_order",
                    project_id_for_sync,
                )
                if rows_data:
                    client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
                    op_project_id  = project.get("openproject_project_id") or engine_meta.get("project_id")
                    op_identifier  = engine_meta.get("project_identifier") or normalize_openproject_identifier(project["name"], "wbs")
                    work_packages  = normalize_metadata(engine_meta.get("work_packages"))

                    if not op_project_id:
                        created_proj  = await client.create_project(project, op_identifier)
                        op_project_id = str(created_proj.get("id") or "").strip()

                    created_count = 0
                    for row in [normalize_record(r) for r in rows_data]:
                        code = row.get("code")
                        if not code or code in work_packages:
                            continue
                        wp_payload = client.build_work_package_payload(
                            openproject_project_id=op_project_id,
                            row=row,
                        )
                        created_wp = await client.create_work_package_from_payload(wp_payload)
                        wp_id   = str(created_wp.get("id") or "").strip()
                        wp_href = normalize_metadata(created_wp.get("_links")).get("self", {}).get("href")
                        work_packages[code] = {"id": wp_id, "href": wp_href, "synced_at": utc_now_iso()}
                        created_count += 1

                    engine_meta.update({
                        "adapter": PM_ENGINE_ADAPTER,
                        "project_id": op_project_id,
                        "project_identifier": op_identifier,
                        "work_packages": work_packages,
                        "last_sync_at": utc_now_iso(),
                        "auto_synced_on_approval": True,
                    })
                    metadata["pm_engine"] = engine_meta

                    async with get_pool(request).acquire() as connection:
                        await connection.execute(
                            """
                            UPDATE wbs_projects
                            SET status = 'Synced',
                                openproject_project_id = $2,
                                metadata = $3::jsonb,
                                updated_at = now()
                            WHERE id = $1
                            """,
                            project_id_for_sync,
                            op_project_id,
                            metadata,
                        )
                    auto_sync_result = {
                        "triggered":      True,
                        "created":        created_count,
                        "op_project_id":  op_project_id,
                        "status":         "Synced",
                    }
        except Exception as exc:
            auto_sync_result = {"triggered": True, "error": str(exc)[:200]}

    updated["auto_sync"] = auto_sync_result

    # P2-04: 승인 알림 — 프로젝트 담당자에게 발송
    try:
        async with get_pool(request).acquire() as connection:
            proj_row = await connection.fetchrow(
                "SELECT p.owner, u.id AS uid, u.email FROM wbs_projects p LEFT JOIN wbs_users u ON u.display_name = p.owner WHERE p.id = $1",
                approval["project_id"],
            )
            if proj_row and proj_row["uid"]:
                await send_notification(
                    connection,
                    user_id=UUID(str(proj_row["uid"])),
                    event_type="approval.approved",
                    title=f"승인 완료: {approval['title']}",
                    body=f"승인자: {payload.reviewer}\n{payload.comment or ''}".strip(),
                    entity_type="approval", entity_id=str(parsed_id),
                    email_to=proj_row["email"],
                )
    except Exception:
        logger.warning("승인 알림 발송 실패", exc_info=True)

    return updated


@router.post("/api/approvals/{approval_id}/reject")
async def reject_approval(approval_id: str, payload: ApprovalDecision, request: Request) -> dict[str, Any]:
    try:
        parsed_id = UUID(approval_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid approval id") from exc

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            approval = await fetch_approval_for_update(connection, parsed_id, get_tenant_id(request))
            if not approval:
                raise HTTPException(status_code=404, detail="Approval request not found")
            ensure_project_mutate_role(await fetch_tenant_project(connection, request, approval["project_id"]))
            if approval["status"] != "Pending":
                raise HTTPException(status_code=409, detail="Approval request is already decided")

            await connection.execute(
                """
                UPDATE wbs_approval_requests
                SET status = 'Rejected',
                    reviewer = $2,
                    decision_comment = $3,
                    decided_at = now(),
                    updated_at = now()
                WHERE id = $1
                """,
                parsed_id,
                payload.reviewer,
                payload.comment,
            )
            await connection.execute(
                """
                UPDATE wbs_projects
                SET status = 'Rejected',
                    updated_at = now()
                WHERE id = $1
                """,
                approval["project_id"],
            )
            updated = await fetch_approval(connection, parsed_id, get_tenant_id(request))
            await insert_audit_event(
                connection,
                request=request,
                event_type="approval.rejected",
                entity_type="approval",
                entity_id=parsed_id,
                summary=f"Approval rejected: {approval['title']}",
                metadata={"project_id": str(approval["project_id"])},
            )

    return updated
