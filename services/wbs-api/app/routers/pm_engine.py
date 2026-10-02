"""PM 엔진(OpenProject) 연동·동기화 API 라우터.
"""
from datetime import date
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException, Request
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import (
    ACTUAL_SYNC_REQUIRED_STATUS,
    AGILE_SPRINT_SELECT,
    DEFAULT_TENANT_ID,
    OPENPROJECT_API_TOKEN,
    OPENPROJECT_AUTH_MODE,
    OPENPROJECT_BASE_URL,
    OPENPROJECT_SYNC_ENABLED,
    PM_ENGINE_ADAPTER,
    SYNC_RUN_SELECT,
)
from app.core.db import get_pool, normalize_metadata, normalize_record, safe_uuid, utc_now_iso
from app.core.security import ensure_project_mutate_role
from app.schemas import ProjectSyncRequest, WorkPackageDateUpdate
from app.services.agile import agile_sprint_response
from app.services.approvals import baseline_summary, fetch_latest_project_baseline
from app.services.pm_engine import (
    OpenProjectClient,
    normalize_openproject_identifier,
    pm_engine_status,
    run_openproject_preflight,
)
from app.services.projects import (
    ensure_project_status_allowed,
    fetch_project_operation_policy,
    fetch_tenant_project,
    normalize_project_operation_policy_value,
)
from app.services.wbs import (
    fetch_project_wbs_items,
    fetch_template,
    fetch_template_items,
    serialize_wbs_row,
    template_rows_or_phases,
)

router = APIRouter()


def sync_error_payload(error: Exception | HTTPException | str) -> dict[str, Any]:
    if isinstance(error, HTTPException):
        return {
            "status_code": error.status_code,
            "detail": error.detail,
        }
    if isinstance(error, str):
        return {"message": error}
    return {
        "type": error.__class__.__name__,
        "message": str(error),
    }


async def insert_sync_run(
    connection: asyncpg.Connection,
    *,
    project_id: UUID,
    mode: str,
    status: str,
    actor: str,
    dry_run: bool,
    create_work_packages: bool,
    validate_payloads: bool,
    total_rows: int = 0,
    pending_work_packages: int = 0,
    synced_work_packages: int = 0,
    created_work_packages: int = 0,
    openproject_project_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = await connection.fetchrow(
        f"""
        WITH inserted AS (
          INSERT INTO wbs_sync_runs
            (project_id, mode, status, actor, engine, dry_run,
             create_work_packages, validate_payloads, total_rows,
             pending_work_packages, synced_work_packages, created_work_packages,
             openproject_project_id, metadata, error, completed_at)
          VALUES
            ($1, $2, $3, $4, 'openproject', $5, $6, $7, $8, $9, $10,
             $11, $12, $13::jsonb, $14::jsonb, now())
          RETURNING *
        )
        SELECT {SYNC_RUN_SELECT}
        FROM inserted s
        JOIN wbs_projects p ON p.id = s.project_id
        """,
        project_id,
        mode,
        status,
        actor,
        dry_run,
        create_work_packages,
        validate_payloads,
        total_rows,
        pending_work_packages,
        synced_work_packages,
        created_work_packages,
        openproject_project_id,
        metadata or {},
        error,
    )
    return normalize_record(record)


async def record_project_sync_run(
    request: Request,
    *,
    project_id: UUID,
    plan: dict[str, Any],
    payload: ProjectSyncRequest,
    mode: str,
    status: str,
    created_work_packages: int = 0,
    openproject_project_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    summary = normalize_metadata(plan.get("summary"))
    async with get_pool(request).acquire() as connection:
        sync_run = await insert_sync_run(
            connection,
            project_id=project_id,
            mode=mode,
            status=status,
            actor=payload.actor,
            dry_run=payload.dry_run,
            create_work_packages=payload.create_work_packages,
            validate_payloads=payload.validate_payloads,
            total_rows=int(summary.get("total_rows") or 0),
            pending_work_packages=int(summary.get("pending_work_packages") or 0),
            synced_work_packages=int(summary.get("synced_work_packages") or 0),
            created_work_packages=created_work_packages,
            openproject_project_id=openproject_project_id or normalize_metadata(plan.get("openproject")).get("project_id"),
            metadata=metadata,
            error=error,
        )
        await insert_audit_event(
            connection,
            request=request,
            event_type="pm_engine.sync_recorded",
            entity_type="project",
            entity_id=project_id,
            summary=f"PM engine sync {status}",
            metadata={
                "mode": mode,
                "dry_run": payload.dry_run,
                "engine": sync_run.get("engine"),
                "sync_run_id": str(sync_run.get("id")) if sync_run.get("id") else None,
            },
        )
        return sync_run


def build_openproject_sync_plan(
    project: dict[str, Any],
    template: dict[str, Any],
    rows: list[dict[str, Any]],
    baseline: dict[str, Any] | None = None,
    policy: dict[str, Any] | None = None,
    sprints: list[dict[str, Any] | asyncpg.Record] | None = None,
) -> dict[str, Any]:
    project_uuid = str(project["id"])
    identifier = normalize_openproject_identifier(
        f"{project['name']}-{project_uuid[:8]}",
        f"wbs-{project_uuid[:8]}",
    )
    metadata = normalize_metadata(project.get("metadata"))
    engine_metadata = normalize_metadata(metadata.get("pm_engine"))
    synced_work_packages = normalize_metadata(engine_metadata.get("work_packages"))
    operation_policy = normalize_project_operation_policy_value(policy or {}, project.get("tenant_id") or DEFAULT_TENANT_ID)
    synced_versions = normalize_metadata(engine_metadata.get("versions"))

    planned_rows = []
    for row in rows:
        planned_rows.append(
            {
                "code": row["code"],
                "parent_code": row.get("parent_code"),
                "name": row["name"],
                "item_type": row.get("item_type") or "작업",
                "owner": row.get("owner"),
                "weight": row.get("weight"),
                "subject": f"{row['code']} {row['name']}"[:255],
                "start_date": row.get("start_date"),
                "finish_date": row.get("finish_date"),
                "metadata": normalize_metadata(row.get("metadata")),
                "already_synced": row["code"] in synced_work_packages,
            }
        )

    planned_versions = []
    if operation_policy.get("openproject_sprint_version_sync"):
        for sprint in sprints or []:
            sprint_data = agile_sprint_response(sprint) if isinstance(sprint, asyncpg.Record) else dict(sprint)
            planned_versions.append(
                {
                    "sprint_id": str(sprint_data.get("id")),
                    "name": sprint_data.get("name"),
                    "goal": sprint_data.get("goal"),
                    "start_date": sprint_data.get("start_date"),
                    "end_date": sprint_data.get("end_date"),
                    "status": sprint_data.get("status"),
                    "already_synced": sprint_data.get("name") in synced_versions,
                }
            )

    return {
        "engine": pm_engine_status(),
        "project": project,
        "template": template,
        "wbs_source": project.get("wbs_source", "template"),
        "operation_policy": {
            "story_point_mode": operation_policy["story_point_mode"],
            "sprint_length_policy": operation_policy["sprint_length_policy"],
            "dod_management": operation_policy["dod_management"],
            "openproject_sprint_version_sync": operation_policy["openproject_sprint_version_sync"],
        },
        "openproject": {
            "project_id": project.get("openproject_project_id") or engine_metadata.get("project_id"),
            "project_identifier": engine_metadata.get("project_identifier") or identifier,
            "project_already_synced": bool(project.get("openproject_project_id") or engine_metadata.get("project_id")),
        },
        "baseline": baseline_summary(baseline),
        "rows": planned_rows,
        "sprint_versions": planned_versions,
        "summary": {
            "total_rows": len(planned_rows),
            "pending_work_packages": len([row for row in planned_rows if not row["already_synced"]]),
            "synced_work_packages": len([row for row in planned_rows if row["already_synced"]]),
            "pending_versions": len([row for row in planned_versions if not row["already_synced"]]),
            "synced_versions": len([row for row in planned_versions if row["already_synced"]]),
        },
    }


def build_openproject_payload_sample(
    project: dict[str, Any],
    rows: list[dict[str, Any]],
) -> dict[str, Any] | None:
    metadata = normalize_metadata(project.get("metadata"))
    engine_metadata = normalize_metadata(metadata.get("pm_engine"))
    work_packages = normalize_metadata(engine_metadata.get("work_packages"))
    openproject_project_id = project.get("openproject_project_id") or engine_metadata.get("project_id")
    sample_project_id = openproject_project_id or "OPENPROJECT_PROJECT_ID"
    href_by_code = {
        code: item.get("href")
        for code, item in work_packages.items()
        if isinstance(item, dict) and item.get("href")
    }
    sample_row = next((row for row in rows if row.get("code") not in work_packages), rows[0] if rows else None)
    if not sample_row:
        return None

    client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
    payload = client.build_work_package_payload(
        openproject_project_id=str(sample_project_id),
        row=sample_row,
        parent_href=href_by_code.get(sample_row.get("parent_code")),
    )
    return {
        "row_code": sample_row["code"],
        "project_id_source": "stored" if openproject_project_id else "placeholder",
        "form_endpoint": "/api/v3/work_packages/form",
        "create_endpoint": "/api/v3/work_packages?notify=false",
        "payload": payload,
    }


async def fetch_project_sync_context(
    request: Request,
    project_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, project_id)
        template = await fetch_template(connection, project["template_key"])
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        project_rows = await fetch_project_wbs_items(connection, project_id)
        rows = project_rows or await fetch_template_items(connection, project["template_key"])
        project["wbs_source"] = "project" if project_rows else "template"

    return project, template, template_rows_or_phases(template, rows)


@router.get("/api/pm-engine")
async def pm_engine() -> dict[str, Any]:
    return pm_engine_status()


@router.get("/api/pm-engine/preflight")
async def pm_engine_preflight() -> dict[str, Any]:
    return await run_openproject_preflight()


@router.get("/api/projects/{project_id}/sync-plan")
async def project_sync_plan(project_id: str, request: Request) -> dict[str, Any]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    project, template, rows = await fetch_project_sync_context(request, parsed_id)
    async with get_pool(request).acquire() as connection:
        baseline = await fetch_latest_project_baseline(connection, parsed_id)
        policy = await fetch_project_operation_policy(connection, project["tenant_id"])
        sprints = await connection.fetch(
            f"""
            SELECT {AGILE_SPRINT_SELECT}
            FROM wbs_agile_sprints
            WHERE project_id = $1 AND tenant_id = $2
            ORDER BY start_date, created_at
            """,
            parsed_id,
            project["tenant_id"],
        )

    return build_openproject_sync_plan(project, template, rows, baseline, policy, sprints)


@router.get("/api/projects/{project_id}/sync-runs")
async def list_project_sync_runs(project_id: str, request: Request, limit: int = 10) -> list[dict[str, Any]]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    limit = max(1, min(limit, 50))
    async with get_pool(request).acquire() as connection:
        await fetch_tenant_project(connection, request, parsed_id)

        records = await connection.fetch(
            f"""
            SELECT {SYNC_RUN_SELECT}
            FROM wbs_sync_runs s
            JOIN wbs_projects p ON p.id = s.project_id
            WHERE s.project_id = $1
            ORDER BY s.started_at DESC
            LIMIT $2
            """,
            parsed_id,
            limit,
        )

    return [normalize_record(record) for record in records]


@router.get("/api/projects/{project_id}/sync-preflight")
async def project_sync_preflight(project_id: str, request: Request) -> dict[str, Any]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    project, template, rows = await fetch_project_sync_context(request, parsed_id)
    ensure_project_mutate_role(project)
    async with get_pool(request).acquire() as connection:
        baseline = await fetch_latest_project_baseline(connection, parsed_id)
        policy = await fetch_project_operation_policy(connection, project["tenant_id"])
        sprints = await connection.fetch(
            f"""
            SELECT {AGILE_SPRINT_SELECT}
            FROM wbs_agile_sprints
            WHERE project_id = $1 AND tenant_id = $2
            ORDER BY start_date, created_at
            """,
            parsed_id,
            project["tenant_id"],
        )
    plan = build_openproject_sync_plan(project, template, rows, baseline, policy, sprints)
    preflight = await run_openproject_preflight()

    return {
        "status": "Preflight",
        "preflight": preflight,
        **plan,
        "payload_sample": build_openproject_payload_sample(project, rows),
    }


# ── PM 엔진 동기화 ────────────────────────────────────────────────────────
# 입력 수집 → (Dry-run) → 실동기화 전제 조건 검사 → 어댑터별 실행(mock / OpenProject) → 결과 저장·응답
# 순서로 분리. 응답 형식은 분리 전과 동일하다.

PROJECT_RETURNING = """
    RETURNING id, name, template_key, owner, status, start_date, delivery_mode,
              openproject_project_id, metadata, tenant_id, created_at, updated_at
"""


async def _load_sync_inputs(request: Request, parsed_id: UUID) -> tuple[dict[str, Any], list[dict[str, Any]], Any, dict[str, Any]]:
    """(project, rows, baseline, plan)"""
    project, template, rows = await fetch_project_sync_context(request, parsed_id)
    ensure_project_mutate_role(project)
    async with get_pool(request).acquire() as connection:
        baseline = await fetch_latest_project_baseline(connection, parsed_id)
        policy = await fetch_project_operation_policy(connection, project["tenant_id"])
        sprints = await connection.fetch(
            f"""
            SELECT {AGILE_SPRINT_SELECT}
            FROM wbs_agile_sprints
            WHERE project_id = $1 AND tenant_id = $2
            ORDER BY start_date, created_at
            """,
            parsed_id,
            project["tenant_id"],
        )
    plan = build_openproject_sync_plan(project, template, rows, baseline, policy, sprints)
    return project, rows, baseline, plan


async def _block_sync(
    request: Request, parsed_id: UUID, plan: dict[str, Any], payload: ProjectSyncRequest,
    *, status_code: int, detail: str, reason: str,
) -> None:
    """실동기화 차단 — 실행 이력(Blocked)을 남기고 HTTPException 을 던진다."""
    error = HTTPException(status_code=status_code, detail=detail)
    await record_project_sync_run(
        request,
        project_id=parsed_id,
        plan=plan,
        payload=payload,
        mode="actual",
        status="Blocked",
        metadata={"source": "api", "blocked_reason": reason},
        error=sync_error_payload(error),
    )
    raise error


async def _ensure_actual_sync_allowed(
    request: Request, parsed_id: UUID, project: dict[str, Any], baseline: Any,
    plan: dict[str, Any], payload: ProjectSyncRequest,
) -> None:
    ensure_project_status_allowed(project, {ACTUAL_SYNC_REQUIRED_STATUS}, "Actual sync")
    if not baseline_summary(baseline).get("locked"):
        await _block_sync(request, parsed_id, plan, payload, status_code=409,
                          detail="Actual sync requires a locked WBS baseline", reason="baseline_unlocked")
    if PM_ENGINE_ADAPTER == "mock":
        return
    if not OPENPROJECT_SYNC_ENABLED:
        await _block_sync(request, parsed_id, plan, payload, status_code=400,
                          detail="OpenProject sync is disabled. Set OPENPROJECT_SYNC_ENABLED=true to execute.",
                          reason="sync_disabled")
    if not OPENPROJECT_API_TOKEN:
        await _block_sync(request, parsed_id, plan, payload, status_code=400,
                          detail="OPENPROJECT_API_TOKEN is required for OpenProject sync.", reason="missing_token")


async def _mark_project_synced(
    request: Request, parsed_id: UUID, engine_project_id: str, metadata: dict[str, Any]
) -> dict[str, Any]:
    async with get_pool(request).acquire() as connection:
        record = await connection.fetchrow(
            f"""
            UPDATE wbs_projects
            SET status = 'Synced',
                openproject_project_id = $2,
                metadata = $3::jsonb,
                updated_at = now()
            WHERE id = $1
            {PROJECT_RETURNING}
            """,
            parsed_id,
            engine_project_id,
            metadata,
        )
    return normalize_record(record)


async def _sync_with_mock_adapter(
    request: Request, parsed_id: UUID, project: dict[str, Any], rows: list[dict[str, Any]],
    plan: dict[str, Any], payload: ProjectSyncRequest,
) -> dict[str, Any]:
    metadata = normalize_metadata(project.get("metadata"))
    engine_metadata = normalize_metadata(metadata.get("pm_engine"))
    mock_project_id = engine_metadata.get("project_id") or f"mock-{str(parsed_id)[:8]}"
    work_packages = {
        row["code"]: {
            "id": f"mock-wp-{index}",
            "href": f"/mock/work_packages/{index}",
            "subject": row["subject"],
            "synced_at": utc_now_iso(),
        }
        for index, row in enumerate(plan["rows"], start=1)
    }
    versions = {
        row["name"]: {
            "id": f"mock-version-{index}",
            "href": f"/mock/versions/{index}",
            "sprint_id": row["sprint_id"],
            "start_date": row.get("start_date"),
            "end_date": row.get("end_date"),
            "synced_at": utc_now_iso(),
        }
        for index, row in enumerate(plan.get("sprint_versions") or [], start=1)
        if row.get("name")
    }
    engine_metadata.update(
        {
            "adapter": "mock",
            "project_id": mock_project_id,
            "project_identifier": plan["openproject"]["project_identifier"],
            "work_packages": work_packages,
            "versions": versions,
            "last_sync_at": utc_now_iso(),
        }
    )
    metadata["pm_engine"] = engine_metadata
    updated_project = await _mark_project_synced(request, parsed_id, mock_project_id, metadata)
    audit_run = await record_project_sync_run(
        request,
        project_id=parsed_id,
        plan=plan,
        payload=payload,
        mode="actual",
        status="Synced",
        created_work_packages=len(work_packages),
        openproject_project_id=mock_project_id,
        metadata={
            "source": "mock_adapter",
            "known_work_packages": len(work_packages),
            "known_versions": len(versions),
        },
    )
    return {
        "status": "Synced",
        "engine": pm_engine_status({"adapter": "mock", "display_name": "Mock PM Engine"}),
        "project": updated_project,
        "openproject": {
            "project_id": mock_project_id,
            "project_identifier": engine_metadata.get("project_identifier"),
            "project_href": None,
        },
        "summary": {
            "created_work_packages": len(work_packages),
            "created_versions": len(versions),
            "known_work_packages": len(work_packages),
            "known_versions": len(versions),
            "total_rows": len(rows),
            "payload_validation": False,
        },
        "created_work_packages": list(work_packages.values()),
        "created_versions": list(versions.values()),
        "audit": audit_run,
    }


async def _ensure_openproject_project(
    client: OpenProjectClient, project: dict[str, Any], engine_metadata: dict[str, Any],
    project_identifier: str, force_create: bool,
) -> str:
    openproject_project_id = project.get("openproject_project_id") or engine_metadata.get("project_id")
    if force_create or not openproject_project_id:
        created_project = await client.create_project(project, project_identifier)
        openproject_project_id = str(created_project.get("id") or "").strip()
        if not openproject_project_id:
            raise HTTPException(status_code=502, detail="OpenProject project response did not include an id")
        engine_metadata["project_id"] = openproject_project_id
        engine_metadata["project_identifier"] = created_project.get("identifier") or project_identifier
        engine_metadata["project_href"] = normalize_metadata(created_project.get("_links")).get("self", {}).get("href")
        engine_metadata["project_created_at"] = utc_now_iso()
    return openproject_project_id


async def _sync_sprint_versions(
    client: OpenProjectClient, openproject_project_id: str, plan: dict[str, Any], versions: dict[str, Any],
) -> list[dict[str, Any]]:
    created_versions: list[dict[str, Any]] = []
    if not plan["operation_policy"].get("openproject_sprint_version_sync"):
        return created_versions
    for sprint in plan.get("sprint_versions") or []:
        version_name = str(sprint.get("name") or "").strip()
        if not version_name or version_name in versions:
            continue
        version_payload = client.build_version_payload(openproject_project_id=openproject_project_id, sprint=sprint)
        created_version = await client.create_version_from_payload(version_payload)
        version_id = str(created_version.get("id") or "").strip()
        version_href = normalize_metadata(created_version.get("_links")).get("self", {}).get("href")
        versions[version_name] = {
            "id": version_id,
            "href": version_href,
            "sprint_id": sprint.get("sprint_id"),
            "start_date": sprint.get("start_date"),
            "end_date": sprint.get("end_date"),
            "synced_at": utc_now_iso(),
        }
        created_versions.append(
            {"name": version_name, "id": version_id, "href": version_href, "sprint_id": sprint.get("sprint_id")}
        )
    return created_versions


async def _sync_work_packages(
    client: OpenProjectClient, openproject_project_id: str, rows: list[dict[str, Any]],
    work_packages: dict[str, Any], payload: ProjectSyncRequest,
) -> list[dict[str, Any]]:
    created_work_packages: list[dict[str, Any]] = []
    if not payload.create_work_packages:
        return created_work_packages
    href_by_code = {
        code: item.get("href")
        for code, item in work_packages.items()
        if isinstance(item, dict) and item.get("href")
    }
    for row in rows:
        code = row["code"]
        if code in work_packages:
            continue
        work_package_payload = client.build_work_package_payload(
            openproject_project_id=openproject_project_id,
            row=row,
            parent_href=href_by_code.get(row.get("parent_code")),
        )
        if payload.validate_payloads:
            await client.validate_work_package_payload(work_package_payload)
        created_work_package = await client.create_work_package_from_payload(work_package_payload)
        work_package_id = str(created_work_package.get("id") or "").strip()
        work_package_href = normalize_metadata(created_work_package.get("_links")).get("self", {}).get("href")
        work_packages[code] = {
            "id": work_package_id,
            "href": work_package_href,
            "subject": created_work_package.get("subject") or f"{code} {row['name']}",
            "synced_at": utc_now_iso(),
        }
        if work_package_href:
            href_by_code[code] = work_package_href
        created_work_packages.append(
            {"code": code, "id": work_package_id, "href": work_package_href, "subject": work_packages[code]["subject"]}
        )
    return created_work_packages


async def _sync_with_openproject(
    request: Request, parsed_id: UUID, project: dict[str, Any], rows: list[dict[str, Any]],
    plan: dict[str, Any], payload: ProjectSyncRequest,
) -> dict[str, Any]:
    client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
    metadata = normalize_metadata(project.get("metadata"))
    engine_metadata = normalize_metadata(metadata.get("pm_engine"))
    work_packages = normalize_metadata(engine_metadata.get("work_packages"))
    versions = normalize_metadata(engine_metadata.get("versions"))
    project_identifier = engine_metadata.get("project_identifier") or plan["openproject"]["project_identifier"]

    openproject_project_id = await _ensure_openproject_project(
        client, project, engine_metadata, project_identifier, payload.force_project_create
    )
    created_versions = await _sync_sprint_versions(client, openproject_project_id, plan, versions)
    created_work_packages = await _sync_work_packages(client, openproject_project_id, rows, work_packages, payload)

    engine_metadata.update(
        {
            "adapter": "openproject",
            "base_url": OPENPROJECT_BASE_URL,
            "work_packages": work_packages,
            "versions": versions,
            "last_sync_at": utc_now_iso(),
        }
    )
    metadata["pm_engine"] = engine_metadata
    updated_project = await _mark_project_synced(request, parsed_id, openproject_project_id, metadata)
    audit_run = await record_project_sync_run(
        request,
        project_id=parsed_id,
        plan=plan,
        payload=payload,
        mode="actual",
        status="Synced",
        created_work_packages=len(created_work_packages),
        openproject_project_id=openproject_project_id,
        metadata={
            "source": "api",
            "known_work_packages": len(work_packages),
            "known_versions": len(versions),
            "pending_versions": plan["summary"].get("pending_versions", 0),
            "created_versions": len(created_versions),
            "project_identifier": engine_metadata.get("project_identifier"),
            "project_href": engine_metadata.get("project_href"),
        },
    )
    return {
        "status": "Synced",
        "engine": pm_engine_status(),
        "project": updated_project,
        "openproject": {
            "project_id": openproject_project_id,
            "project_identifier": engine_metadata.get("project_identifier"),
            "project_href": engine_metadata.get("project_href"),
        },
        "summary": {
            "created_work_packages": len(created_work_packages),
            "created_versions": len(created_versions),
            "known_work_packages": len(work_packages),
            "known_versions": len(versions),
            "pending_versions": plan["summary"].get("pending_versions", 0),
            "total_rows": len(rows),
            "payload_validation": payload.validate_payloads,
        },
        "created_work_packages": created_work_packages,
        "created_versions": created_versions,
        "audit": audit_run,
    }


@router.post("/api/projects/{project_id}/sync")
async def sync_project_to_engine(
    project_id: str,
    request: Request,
    payload: ProjectSyncRequest = ProjectSyncRequest(),
) -> dict[str, Any]:
    try:
        parsed_id = UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid project id") from exc

    project, rows, baseline, plan = await _load_sync_inputs(request, parsed_id)
    if payload.dry_run:
        audit_run = await record_project_sync_run(
            request,
            project_id=parsed_id,
            plan=plan,
            payload=payload,
            mode="dry_run",
            status="DryRun",
            metadata={
                "source": "api",
                "ready_for_actual_sync": OPENPROJECT_SYNC_ENABLED and bool(OPENPROJECT_API_TOKEN),
            },
        )
        return {"status": "DryRun", **plan, "audit": audit_run}

    await _ensure_actual_sync_allowed(request, parsed_id, project, baseline, plan, payload)
    if PM_ENGINE_ADAPTER == "mock":
        return await _sync_with_mock_adapter(request, parsed_id, project, rows, plan, payload)
    return await _sync_with_openproject(request, parsed_id, project, rows, plan, payload)


@router.get("/api/openproject")
async def openproject_connection() -> dict[str, str]:
    return {
        "mode": "community-edition-engine",
        "base_url": OPENPROJECT_BASE_URL,
        "integration": "pm-engine-adapter",
        "adapter": "openproject",
    }


# ─── 역방향 연계: OpenProject → AX WBS ───────────────────────────

@router.post("/api/projects/{project_id}/sync-pull")
async def pull_openproject_status(project_id: str, request: Request) -> dict[str, Any]:
    """OpenProject 작업 패키지 상태·진척률을 AX WBS로 역방향 동기화 (Pull)."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        ensure_project_mutate_role(project)

    metadata = normalize_metadata(project.get("metadata"))
    engine_meta = normalize_metadata(metadata.get("pm_engine"))
    work_packages = normalize_metadata(engine_meta.get("work_packages"))
    op_project_id = project.get("openproject_project_id") or engine_meta.get("project_id")

    if not work_packages:
        raise HTTPException(
            status_code=409,
            detail="동기화된 작업 패키지가 없습니다. 먼저 AX WBS → OpenProject 동기화를 실행하세요.",
        )

    updated: list[dict[str, Any]] = []
    errors:  list[dict[str, Any]] = []
    pulled_at = utc_now_iso()

    if PM_ENGINE_ADAPTER == "mock":
        import random
        async with get_pool(request).acquire() as connection:
            async with connection.transaction():
                for code in work_packages:
                    mock_progress = random.choice([0, 10, 25, 50, 75, 90, 100])
                    mock_status   = "완료" if mock_progress == 100 else ("진행 중" if mock_progress > 0 else "신규")
                    await connection.execute(
                        """
                        UPDATE wbs_project_wbs_items
                        SET metadata = metadata || $1::jsonb, updated_at = now()
                        WHERE project_id = $2 AND code = $3
                        """,
                        {"op_status": mock_status, "op_progress": mock_progress, "op_pulled_at": pulled_at},
                        parsed_id, code,
                    )
                    updated.append({"code": code, "op_status": mock_status, "op_progress": mock_progress})
                await insert_audit_event(
                    connection, request=request,
                    event_type="pm_engine.sync_recorded",
                    entity_type="project", entity_id=parsed_id,
                    summary=f"PM engine sync pull (mock): {project['name']}",
                    metadata={"updated": len(updated), "adapter": "mock"},
                )
        return {
            "status": "Pulled", "adapter": "mock",
            "updated": len(updated), "errors": 0,
            "items": updated, "pulled_at": pulled_at,
        }

    if not OPENPROJECT_API_TOKEN:
        raise HTTPException(status_code=400, detail="OPENPROJECT_API_TOKEN이 설정되지 않았습니다.")

    client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)

    async with get_pool(request).acquire() as connection:
        async with connection.transaction():
            for code, wp_info in work_packages.items():
                if not isinstance(wp_info, dict):
                    continue
                wp_id = str(wp_info.get("id") or "").strip()
                if not wp_id:
                    continue
                try:
                    wp = await client.request("GET", f"/api/v3/work_packages/{wp_id}")
                    links       = normalize_metadata(wp.get("_links", {}))
                    status_info = normalize_metadata(links.get("status", {}))
                    op_status   = status_info.get("title", "")
                    op_progress = int(wp.get("percentageDone") or 0)
                    await connection.execute(
                        """
                        UPDATE wbs_project_wbs_items
                        SET metadata = metadata || $1::jsonb, updated_at = now()
                        WHERE project_id = $2 AND code = $3
                        """,
                        {"op_status": op_status, "op_progress": op_progress, "op_pulled_at": pulled_at},
                        parsed_id, code,
                    )
                    updated.append({"code": code, "op_status": op_status, "op_progress": op_progress})
                except Exception as exc:
                    errors.append({"code": code, "error": str(exc)[:200]})

            await insert_audit_event(
                connection, request=request,
                event_type="pm_engine.sync_recorded",
                entity_type="project", entity_id=parsed_id,
                summary=f"PM engine sync pull: {project['name']}",
                metadata={"updated": len(updated), "errors": len(errors), "source": "sync-pull"},
            )

    return {
        "status": "Pulled", "adapter": "openproject",
        "updated": len(updated), "errors": len(errors),
        "items": updated, "error_items": errors, "pulled_at": pulled_at,
    }


@router.post("/api/webhooks/openproject", status_code=200)
async def openproject_webhook(request: Request) -> dict[str, Any]:
    """
    OpenProject Webhook 실시간 수신 엔드포인트.
    OpenProject 관리 → Webhooks에서 이 URL을 등록하세요:
      http://YOUR_SERVER:8000/api/webhooks/openproject

    지원 이벤트:
      - work_package:updated  (진척률·상태 변경 시 즉시 반영)
      - work_package:created  (신규 작업패키지 생성 시)
      - work_package:closed   (작업패키지 종료 시)
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    action = payload.get("action", "")
    if action not in {"work_package:updated", "work_package:created", "work_package:closed"}:
        return {"status": "ignored", "action": action}

    wp = payload.get("work_package") or {}
    if not wp:
        return {"status": "ignored", "reason": "no work_package in payload"}

    # OP 상태명 → AX WBS 표준 매핑
    _OP_STATUS_MAP = {
        "새로 만들기": "미시작", "New": "미시작",
        "In progress": "진행 중", "진행 중": "진행 중",
        "Closed": "완료", "완료": "완료",
        "Rejected": "반려", "반려": "반려",
        "On hold": "보류", "보류": "보류",
    }

    wp_id       = str(wp.get("id") or "").strip()
    links       = normalize_metadata(wp.get("_links", {}))
    raw_status  = normalize_metadata(links.get("status", {})).get("title", "")
    op_status   = _OP_STATUS_MAP.get(raw_status, raw_status)
    pct_done    = wp.get("percentageDone")
    op_progress = int(pct_done) if pct_done is not None else None
    # work_package:closed 이면 무조건 완료 처리
    if action == "work_package:closed":
        op_status   = "완료"
        op_progress = 100
    op_project_href = normalize_metadata(links.get("project", {})).get("href", "")
    op_project_id   = op_project_href.rsplit("/", 1)[-1] if "/" in op_project_href else ""

    if not op_project_id or not wp_id:
        return {"status": "ignored", "reason": "missing project or work_package id"}

    async with get_pool(request).acquire() as connection:
        project = await connection.fetchrow(
            "SELECT id, name, metadata FROM wbs_projects WHERE openproject_project_id = $1 LIMIT 1",
            op_project_id,
        )
        if not project:
            return {"status": "ignored", "reason": f"project not found for op_project_id={op_project_id}"}

        project_id   = project["id"]
        engine_meta  = normalize_metadata(normalize_metadata(project.get("metadata")).get("pm_engine"))
        work_packages_map = normalize_metadata(engine_meta.get("work_packages"))

        matched_code: str | None = None
        for code, wp_info in work_packages_map.items():
            if isinstance(wp_info, dict) and str(wp_info.get("id")) == wp_id:
                matched_code = code
                break

        if not matched_code:
            return {"status": "ignored", "reason": f"no WBS item mapped to wp_id={wp_id}"}

        pulled_at  = utc_now_iso()
        update_meta: dict[str, Any] = {
            "op_status":       op_status,
            "op_pulled_at":    pulled_at,
            "webhook_action":  action,
        }
        if op_progress is not None:
            update_meta["op_progress"] = op_progress

        await connection.execute(
            """
            UPDATE wbs_project_wbs_items
            SET metadata = metadata || $1::jsonb, updated_at = now()
            WHERE project_id = $2 AND code = $3
            """,
            update_meta,
            project_id, matched_code,
        )
        await insert_audit_event(
            connection,
            event_type="pm_engine.sync_recorded",
            entity_type="project", entity_id=project_id,
            summary=f"Webhook 실시간: {matched_code} → {op_status}"
                    + (f" ({op_progress}%)" if op_progress is not None else ""),
            metadata={
                "source":     "webhook_realtime",
                "action":     action,
                "code":       matched_code,
                "op_status":  op_status,
                "op_progress": op_progress,
            },
        )

    return {
        "status":     "ok",
        "action":     action,
        "realtime":   True,
        "project_id": str(project_id),
        "code":       matched_code,
        "op_status":  op_status,
        "op_progress": op_progress,
        "pulled_at":  pulled_at,
    }


@router.get("/api/projects/{project_id}/op-work-packages")
async def get_op_work_packages(project_id: str, request: Request) -> dict[str, Any]:
    """OpenProject 작업패키지 조회 (AX WBS → OP API 프록시).
    OP가 오프라인이면 AX WBS의 로컬 WBS 데이터를 반환합니다."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")

    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        local_rows = await fetch_project_wbs_items(connection, parsed_id)

    metadata    = normalize_metadata(project.get("metadata"))
    engine_meta = normalize_metadata(metadata.get("pm_engine"))
    op_project_id = project.get("openproject_project_id") or engine_meta.get("project_id")
    op_identifier = engine_meta.get("project_identifier") or op_project_id

    # 로컬 데이터로 기본 응답 구성
    local_items = []
    for r in local_rows:
        m = normalize_metadata(r.get("metadata"))
        local_items.append({
            "id":           r.get("code"),
            "subject":      f"{r.get('code','')} {r.get('name','')}".strip(),
            "code":         r.get("code"),
            "name":         r.get("name"),
            "item_type":    r.get("item_type") or "작업",
            "parent_code":  r.get("parent_code"),
            "owner":        r.get("owner"),
            "weight":       r.get("weight"),
            "start_date":   r.get("start_date").isoformat() if isinstance(r.get("start_date"), date) else r.get("start_date"),
            "finish_date":  r.get("finish_date").isoformat() if isinstance(r.get("finish_date"), date) else r.get("finish_date"),
            "op_status":    m.get("op_status"),
            "op_progress":  m.get("op_progress"),
            "op_pulled_at": m.get("op_pulled_at"),
            "already_synced": r.get("code") in normalize_metadata(engine_meta.get("work_packages")),
            "source":       "local",
        })

    base_response = {
        "project": {
            "id":         str(project["id"]),
            "name":       project["name"],
            "template_key": project.get("template_key"),
            "op_project_id": op_project_id,
            "op_identifier": op_identifier,
            "op_base_url":   OPENPROJECT_BASE_URL,
        },
        "total":   len(local_items),
        "items":   local_items,
        "source":  "local",
    }

    # OP API 호출 시도
    if not OPENPROJECT_API_TOKEN or not op_project_id:
        return base_response

    try:
        client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
        op_data = await client.request(
            "GET",
            f"/api/v3/projects/{op_project_id}/work_packages?pageSize=200&sortBy=%5B%5B%22id%22%2C%22asc%22%5D%5D",
        )
        # OpenProject 상태명 → 한국어 표준 매핑
        OP_STATUS_MAP: dict[str, str] = {
            "새로 만들기": "미시작",
            "New":         "미시작",
            "In progress": "진행 중",
            "진행 중":     "진행 중",
            "Closed":      "완료",
            "완료":        "완료",
            "Rejected":    "반려",
            "반려":        "반려",
            "On hold":     "보류",
            "보류":        "보류",
        }

        op_elements = op_data.get("_embedded", {}).get("elements", [])
        op_items = []
        for wp in op_elements:
            links      = normalize_metadata(wp.get("_links", {}))
            raw_status = normalize_metadata(links.get("status", {})).get("title", "")
            op_status  = OP_STATUS_MAP.get(raw_status, raw_status)
            # percentageDone=None → null 유지 (0% 완료와 미설정 구분)
            pct_done = wp.get("percentageDone")
            op_items.append({
                "id":          wp.get("id"),
                "subject":     wp.get("subject", ""),
                "op_status":   op_status,
                "op_progress": int(pct_done) if pct_done is not None else None,
                "start_date":  wp.get("startDate"),
                "finish_date": wp.get("dueDate"),
                "op_type":     normalize_metadata(links.get("type", {})).get("title", ""),
                "assignee":    normalize_metadata(links.get("assignee", {})).get("title", ""),
                "source":      "openproject",
            })

        # OpenProject 항목에 AX WBS 가중치(weight) 보강
        local_map = {
            (str(r.get("code") or "")):
                float(r.get("weight")) if r.get("weight") is not None else None
            for r in local_rows
        }
        wp_code_map: dict[str, str] = {}
        for r in local_rows:
            eng_wps = normalize_metadata(engine_meta.get("work_packages"))
            for code, wp_info in eng_wps.items():
                if isinstance(wp_info, dict):
                    wp_code_map[str(wp_info.get("id") or "")] = code
        for item in op_items:
            code   = wp_code_map.get(str(item.get("id") or ""))
            weight = local_map.get(code) if code else None
            item["code"]   = code
            item["weight"] = weight

        return {**base_response, "items": op_items, "total": len(op_items), "source": "openproject"}
    except Exception:
        return base_response  # OP 오프라인이면 로컬 데이터 반환


@router.patch("/api/projects/{project_id}/op-work-packages/{work_package_id}/dates")
async def update_op_work_package_dates(
    project_id: str,
    work_package_id: str,
    payload: WorkPackageDateUpdate,
    request: Request,
) -> dict[str, Any]:
    """Gantt에서 조정한 날짜를 OpenProject와 AX WBS 로컬 일정에 반영."""
    parsed_id = safe_uuid(project_id)
    if not parsed_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    if payload.start_date is None and payload.finish_date is None:
        raise HTTPException(status_code=422, detail="At least one date is required")
    if payload.start_date and payload.finish_date and payload.finish_date < payload.start_date:
        raise HTTPException(status_code=422, detail="Finish date is earlier than start date")

    wp_id = str(work_package_id or "").strip()
    if not wp_id:
        raise HTTPException(status_code=400, detail="Work package id is required")

    async with get_pool(request).acquire() as connection:
        project = await fetch_tenant_project(connection, request, parsed_id)
        ensure_project_mutate_role(project)
        local_rows = await fetch_project_wbs_items(connection, parsed_id)

    project_meta = normalize_metadata(project.get("metadata"))
    engine_meta = normalize_metadata(project_meta.get("pm_engine"))
    work_packages = normalize_metadata(engine_meta.get("work_packages"))
    op_project_id = project.get("openproject_project_id") or engine_meta.get("project_id")

    matched_code: str | None = None
    for code, wp_info in work_packages.items():
        if isinstance(wp_info, dict) and str(wp_info.get("id") or "") == wp_id:
            matched_code = str(code)
            break
    if matched_code is None and any(str(row.get("code") or "") == wp_id for row in local_rows):
        matched_code = wp_id

    if matched_code is None and PM_ENGINE_ADAPTER == "mock":
        matched_code = wp_id

    source = "local"
    openproject_item: dict[str, Any] | None = None
    if PM_ENGINE_ADAPTER != "mock" and OPENPROJECT_API_TOKEN and op_project_id:
        client = OpenProjectClient(OPENPROJECT_BASE_URL, OPENPROJECT_API_TOKEN, OPENPROJECT_AUTH_MODE)
        openproject_item = await client.update_work_package_dates(
            work_package_id=wp_id,
            start_date=payload.start_date,
            finish_date=payload.finish_date,
        )
        source = "openproject"

    pushed_at = utc_now_iso()
    updated_row: dict[str, Any] | None = None
    if matched_code:
        date_meta = {
            "op_dates_pushed_at": pushed_at,
            "op_dates_source": source,
        }
        if source == "openproject":
            date_meta["op_work_package_id"] = wp_id
        async with get_pool(request).acquire() as connection:
            async with connection.transaction():
                row = await connection.fetchrow(
                    """
                    UPDATE wbs_project_wbs_items
                    SET start_date = $3,
                        finish_date = $4,
                        metadata = metadata || $5::jsonb,
                        updated_at = now()
                    WHERE project_id = $1 AND code = $2
                    RETURNING project_id, tenant_id, code, parent_code, name, item_type, owner,
                              weight, start_date, finish_date, sort_order, metadata
                    """,
                    parsed_id,
                    matched_code,
                    payload.start_date,
                    payload.finish_date,
                    date_meta,
                )
                if row:
                    updated_row = serialize_wbs_row(row)
                    if matched_code in work_packages and isinstance(work_packages[matched_code], dict):
                        work_packages[matched_code] = {
                            **work_packages[matched_code],
                            "start_date": payload.start_date.isoformat() if payload.start_date else None,
                            "finish_date": payload.finish_date.isoformat() if payload.finish_date else None,
                            "dates_pushed_at": pushed_at,
                        }
                        engine_meta["work_packages"] = work_packages
                        project_meta["pm_engine"] = engine_meta
                        await connection.execute(
                            """
                            UPDATE wbs_projects
                            SET metadata = $2::jsonb, updated_at = now()
                            WHERE id = $1
                            """,
                            parsed_id,
                            project_meta,
                        )
                    await insert_audit_event(
                        connection,
                        request=request,
                        event_type="pm_engine.sync_recorded",
                        entity_type="project",
                        entity_id=parsed_id,
                        summary=f"Gantt date updated: {matched_code}",
                        metadata={
                            "source": source,
                            "work_package_id": wp_id,
                            "code": matched_code,
                            "start_date": payload.start_date.isoformat() if payload.start_date else None,
                            "finish_date": payload.finish_date.isoformat() if payload.finish_date else None,
                        },
                    )

    return {
        "status": "Updated",
        "source": source,
        "project_id": str(parsed_id),
        "work_package_id": wp_id,
        "code": matched_code,
        "start_date": payload.start_date.isoformat() if payload.start_date else None,
        "finish_date": payload.finish_date.isoformat() if payload.finish_date else None,
        "item": updated_row,
        "openproject_item": openproject_item,
        "pushed_at": pushed_at,
    }
