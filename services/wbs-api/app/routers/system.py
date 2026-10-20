"""헬스체크·메트릭·운영 점검·백업 API 라우터.
"""
from datetime import datetime, timezone
import asyncio
from pathlib import Path
from typing import Any
import asyncpg
from fastapi import HTTPException, Request
from fastapi.responses import PlainTextResponse, StreamingResponse
from fastapi import APIRouter

from app.core.audit import insert_audit_event
from app.core.config import (
    ALLOW_FILE_ORIGIN,
    AUDIT_RETENTION_DAYS,
    AsyncIOScheduler,
    BACKUP_DIR,
    BACKUP_TIMEOUT_SECONDS,
    DATABASE_URL,
    LOGIN_FAILURE_LIMIT,
    OPENPROJECT_BASE_URL,
    PORTAL_ORIGIN,
    REPORT_SCHEDULER_ENABLED,
    REPORT_SMTP_HOST,
)
from app.core.db import get_pool, utc_now_iso
from app.core.security import require_admin_role, require_roles
from app.services.backups import list_backup_files, run_pg_dump
from app.services.pm_engine import run_openproject_preflight
from app.services.reports import scheduler_runtime_state

router = APIRouter()


def operation_check(
    key: str,
    label: str,
    status: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "status": status,
        "message": message,
        "metadata": metadata or {},
    }


def backup_health_check() -> dict[str, Any]:
    backup_files = list_backup_files(BACKUP_DIR)
    if not backup_files:
        return operation_check(
            "backup_rehearsal",
            "Backup rehearsal",
            "warn",
            f"No PostgreSQL backup found in {BACKUP_DIR}",
            {"backup_dir": str(BACKUP_DIR), "latest_backup": None},
        )

    latest = backup_files[0]
    latest_at = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
    age_hours = round((datetime.now(timezone.utc) - latest_at).total_seconds() / 3600, 1)
    status = "pass" if age_hours <= 168 else "warn"
    message = f"Latest backup {latest.name}, {age_hours}h old"
    return operation_check(
        "backup_rehearsal",
        "Backup rehearsal",
        status,
        message,
        {
            "backup_dir": str(BACKUP_DIR),
            "latest_backup": latest.name,
            "latest_backup_at": latest_at.isoformat(),
            "age_hours": age_hours,
        },
    )


def prometheus_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def prometheus_metric(name: str, value: int | float, labels: dict[str, str] | None = None) -> str:
    if labels:
        label_text = ",".join(f'{key}="{prometheus_escape(str(label_value))}"' for key, label_value in labels.items())
        return f"{name}{{{label_text}}} {value}"
    return f"{name} {value}"


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    async with get_pool(request).acquire() as connection:
        await connection.fetchval("SELECT 1")
    return {
        "status": "ok",
        "database": "postgresql",
        "openproject_base_url": OPENPROJECT_BASE_URL,
    }


@router.get("/metrics", response_class=PlainTextResponse)
async def metrics(request: Request) -> PlainTextResponse:
    pool = get_pool(request)
    database_up = 1

    try:
        async with pool.acquire() as connection:
            await connection.fetchval("SELECT 1")
            project_count = await connection.fetchval("SELECT count(*) FROM wbs_projects")
            template_count = await connection.fetchval("SELECT count(*) FROM wbs_templates")
            approval_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_approval_requests
                GROUP BY status
                """
            )
            import_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_import_jobs
                GROUP BY status
                """
            )
            project_status_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_projects
                GROUP BY status
                """
            )
            sync_run_rows = await connection.fetch(
                """
                SELECT mode, status, count(*) AS count
                FROM wbs_sync_runs
                GROUP BY mode, status
                """
            )
            baseline_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_project_baselines
                GROUP BY status
                """
            )
            report_schedule_rows = await connection.fetch(
                """
                SELECT enabled::text AS status, count(*) AS count
                FROM wbs_report_schedules
                GROUP BY enabled
                """
            )
            report_run_rows = await connection.fetch(
                """
                SELECT status, count(*) AS count
                FROM wbs_report_runs
                GROUP BY status
                """
            )
    except Exception:
        database_up = 0
        project_count = 0
        template_count = 0
        approval_rows = []
        import_rows = []
        project_status_rows = []
        sync_run_rows = []
        baseline_rows = []
        report_schedule_rows = []
        report_run_rows = []

    lines = [
        "# HELP wbs_api_up WBS extension API availability.",
        "# TYPE wbs_api_up gauge",
        prometheus_metric("wbs_api_up", 1),
        "# HELP wbs_database_up PostgreSQL availability from the WBS API.",
        "# TYPE wbs_database_up gauge",
        prometheus_metric("wbs_database_up", database_up),
        "# HELP wbs_projects_total Number of WBS projects.",
        "# TYPE wbs_projects_total gauge",
        prometheus_metric("wbs_projects_total", project_count),
        "# HELP wbs_templates_total Number of WBS templates.",
        "# TYPE wbs_templates_total gauge",
        prometheus_metric("wbs_templates_total", template_count),
        "# HELP wbs_db_pool_connections Asyncpg pool connections by state.",
        "# TYPE wbs_db_pool_connections gauge",
        prometheus_metric("wbs_db_pool_connections", pool.get_size(), {"state": "total"}),
        prometheus_metric("wbs_db_pool_connections", pool.get_idle_size(), {"state": "idle"}),
        "# HELP wbs_project_status_total Number of WBS projects by status.",
        "# TYPE wbs_project_status_total gauge",
    ]

    lines.extend(
        prometheus_metric("wbs_project_status_total", row["count"], {"status": row["status"]})
        for row in project_status_rows
    )
    lines.extend(
        [
            "# HELP wbs_approval_requests_total Number of approval requests by status.",
            "# TYPE wbs_approval_requests_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric("wbs_approval_requests_total", row["count"], {"status": row["status"]})
        for row in approval_rows
    )
    lines.extend(
        [
            "# HELP wbs_import_jobs_total Number of Excel import jobs by status.",
            "# TYPE wbs_import_jobs_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric("wbs_import_jobs_total", row["count"], {"status": row["status"]})
        for row in import_rows
    )
    lines.extend(
        [
            "# HELP wbs_sync_runs_total Number of OpenProject sync runs by mode and status.",
            "# TYPE wbs_sync_runs_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric(
            "wbs_sync_runs_total",
            row["count"],
            {"mode": row["mode"], "status": row["status"]},
        )
        for row in sync_run_rows
    )
    lines.extend(
        [
            "# HELP wbs_project_baselines_total Number of WBS project baselines by status.",
            "# TYPE wbs_project_baselines_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric("wbs_project_baselines_total", row["count"], {"status": row["status"]})
        for row in baseline_rows
    )
    lines.extend(
        [
            "# HELP wbs_report_schedules_total Number of weekly report schedules by enabled state.",
            "# TYPE wbs_report_schedules_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric("wbs_report_schedules_total", row["count"], {"enabled": row["status"]})
        for row in report_schedule_rows
    )
    lines.extend(
        [
            "# HELP wbs_report_runs_total Number of weekly report runs by status.",
            "# TYPE wbs_report_runs_total gauge",
        ]
    )
    lines.extend(
        prometheus_metric("wbs_report_runs_total", row["count"], {"status": row["status"]})
        for row in report_run_rows
    )

    return PlainTextResponse(
        "\n".join(lines) + "\n",
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


# ── 운영 점검 ─────────────────────────────────────────────────────────────
# 집계(_collect_operation_counts) → 점검 항목 구성(_build_operation_checks) → 요약(operations_health) 으로 분리.

REQUIRED_TABLES = (
    "wbs_templates", "wbs_template_items", "wbs_projects", "wbs_import_jobs", "wbs_approval_requests",
    "wbs_sync_runs", "wbs_project_baselines", "wbs_users", "wbs_user_sessions", "wbs_system_settings",
    "wbs_audit_events", "wbs_template_versions", "wbs_project_wbs_items", "wbs_report_schedules",
    "wbs_report_runs",
)

OPERATION_COUNT_QUERIES = {
    "project_count": "SELECT count(*) FROM wbs_projects",
    "template_count": "SELECT count(*) FROM wbs_templates",
    "template_item_count": "SELECT count(*) FROM wbs_template_items",
    "pending_approval_count": "SELECT count(*) FROM wbs_approval_requests WHERE status = 'Pending'",
    "preview_import_count": "SELECT count(*) FROM wbs_import_jobs WHERE status = 'Preview'",
    "sync_run_count": "SELECT count(*) FROM wbs_sync_runs",
    "baseline_count": "SELECT count(*) FROM wbs_project_baselines",
    "user_count": "SELECT count(*) FROM wbs_users",
    "locked_user_count": "SELECT count(*) FROM wbs_users WHERE locked_until > now()",
    "audit_count": "SELECT count(*) FROM wbs_audit_events",
    "setting_count": "SELECT count(*) FROM wbs_system_settings",
    "project_wbs_count": "SELECT count(*) FROM wbs_project_wbs_items",
    "template_version_count": "SELECT count(*) FROM wbs_template_versions",
    "report_schedule_count": "SELECT count(*) FROM wbs_report_schedules",
    "report_enabled_count": "SELECT count(*) FROM wbs_report_schedules WHERE enabled = true",
    "report_run_count": "SELECT count(*) FROM wbs_report_runs",
    "report_failed_count": (
        "SELECT count(*) FROM wbs_report_runs WHERE status = 'Failed' AND started_at >= now() - interval '7 days'"
    ),
}


async def _collect_operation_counts(connection: asyncpg.Connection) -> tuple[str, dict[str, int], list[str]]:
    """(DB 버전, 집계값, 누락 테이블) — 누락 테이블이 있으면 해당 집계는 건너뛴다."""
    database_version = await connection.fetchval("SHOW server_version")
    existing = {
        row["table_name"]
        for row in await connection.fetch(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = ANY($1::text[])
            """,
            list(REQUIRED_TABLES),
        )
    }
    missing_tables = sorted(set(REQUIRED_TABLES) - existing)
    counts: dict[str, int] = {}
    for key, sql in OPERATION_COUNT_QUERIES.items():
        table = sql.split(" FROM ", 1)[1].split()[0]
        counts[key] = int(await connection.fetchval(sql) or 0) if table in existing else 0
    return database_version, counts, missing_tables


def _openproject_check_status(preflight: dict[str, Any]) -> str:
    if preflight["state"] in {"offline", "auth_failed", "blocked"}:
        return "fail"
    return "pass" if preflight["state"] == "ready" else "warn"


def _build_operation_checks(
    database_version: str,
    c: dict[str, int],
    missing_tables: list[str],
    preflight: dict[str, Any],
    scheduler_state: dict[str, Any],
) -> list[dict[str, Any]]:
    return [
        operation_check("postgresql", "PostgreSQL", "pass",
                        f"PostgreSQL {database_version} is reachable", {"version": database_version}),
        operation_check("schema", "Schema migration", "fail" if missing_tables else "pass",
                        "Required WBS tables are present" if not missing_tables else "Missing required WBS tables",
                        {"missing_tables": missing_tables}),
        operation_check("template_baseline", "WBS template baseline",
                        "pass" if c["template_count"] and c["template_item_count"] else "fail",
                        f"{c['template_count']} templates, {c['template_item_count']} template items",
                        {"templates": c["template_count"], "template_items": c["template_item_count"]}),
        operation_check("portfolio_seed", "Project portfolio", "pass" if c["project_count"] else "warn",
                        f"{c['project_count']} projects registered", {"projects": c["project_count"]}),
        operation_check("approval_queue", "PMO approval queue", "warn" if c["pending_approval_count"] else "pass",
                        f"{c['pending_approval_count']} pending approvals",
                        {"pending_approvals": c["pending_approval_count"]}),
        operation_check("excel_preview_queue", "Excel preview queue",
                        "warn" if c["preview_import_count"] else "pass",
                        f"{c['preview_import_count']} imports waiting for apply",
                        {"preview_imports": c["preview_import_count"]}),
        operation_check("openproject_preflight", "OpenProject preflight", _openproject_check_status(preflight),
                        f"Engine state: {preflight['state']}",
                        {"state": preflight["state"], "ready_for_actual_sync": preflight["ready_for_actual_sync"]}),
        operation_check("sync_audit", "Sync audit trail", "pass",
                        f"{c['sync_run_count']} sync runs recorded", {"sync_runs": c["sync_run_count"]}),
        operation_check("baseline_lock", "Baseline lock", "pass",
                        f"{c['baseline_count']} locked WBS baselines", {"baselines": c["baseline_count"]}),
        operation_check("access_control", "Access control", "pass" if c["user_count"] else "fail",
                        f"{c['user_count']} portal users configured", {"users": c["user_count"]}),
        operation_check("settings_registry", "Settings registry", "pass" if c["setting_count"] >= 3 else "warn",
                        f"{c['setting_count']} settings registered", {"settings": c["setting_count"]}),
        operation_check("audit_log", "Audit log", "pass", f"{c['audit_count']} audit events recorded",
                        {"audit_events": c["audit_count"], "retention_days": AUDIT_RETENTION_DAYS}),
        operation_check("account_lockout", "Account lockout", "warn" if c["locked_user_count"] else "pass",
                        f"{c['locked_user_count']} users currently locked",
                        {"locked_users": c["locked_user_count"], "failure_limit": LOGIN_FAILURE_LIMIT}),
        operation_check("template_versions", "Template versions",
                        "pass" if c["template_version_count"] else "warn",
                        f"{c['template_version_count']} template versions stored",
                        {"template_versions": c["template_version_count"]}),
        operation_check("project_wbs_storage", "Project WBS storage", "pass",
                        f"{c['project_wbs_count']} project WBS rows stored",
                        {"project_wbs_rows": c["project_wbs_count"]}),
        operation_check(
            "weekly_report_scheduler", "Weekly report scheduler",
            "fail" if REPORT_SCHEDULER_ENABLED and AsyncIOScheduler is None
            else "warn" if c["report_failed_count"] else "pass",
            f"{c['report_enabled_count']} enabled schedules, {c['report_run_count']} report runs",
            {
                "schedules": c["report_schedule_count"],
                "enabled_schedules": c["report_enabled_count"],
                "report_runs": c["report_run_count"],
                "failed_last_7_days": c["report_failed_count"],
                **scheduler_state,
                "smtp_configured": bool(REPORT_SMTP_HOST),
            },
        ),
        operation_check("cors_policy", "CORS policy", "warn" if ALLOW_FILE_ORIGIN else "pass",
                        "file:// origin is allowed for local development" if ALLOW_FILE_ORIGIN
                        else "file:// origin is disabled",
                        {"allow_file_origin": ALLOW_FILE_ORIGIN, "portal_origin": PORTAL_ORIGIN}),
        backup_health_check(),
        operation_check("metrics", "Metrics endpoint", "pass",
                        "Prometheus metrics are exposed at /metrics", {"path": "/metrics"}),
    ]


@router.get("/api/operations/health")
async def operations_health(request: Request) -> dict[str, Any]:
    require_roles(request, {"admin", "pmo"})
    async with get_pool(request).acquire() as connection:
        database_version, counts, missing_tables = await _collect_operation_counts(connection)
    preflight = await run_openproject_preflight()
    checks = _build_operation_checks(
        database_version, counts, missing_tables, preflight, scheduler_runtime_state(request.app)
    )
    tally = {status: sum(1 for check in checks if check["status"] == status) for status in ("fail", "warn", "pass")}
    return {
        "status": "critical" if tally["fail"] else "watch" if tally["warn"] else "stable",
        "generated_at": utc_now_iso(),
        "summary": {
            "checks": len(checks),
            "failures": tally["fail"],
            "warnings": tally["warn"],
            "passes": tally["pass"],
        },
        "checks": checks,
    }


def _backup_dir() -> Path:
    d = BACKUP_DIR
    try:
        d.mkdir(parents=True, exist_ok=True)
        # 쓰기 테스트
        test = d / ".write_test"
        test.touch(); test.unlink()
    except OSError:
        # 읽기 전용이면 /tmp/wbs-backups 사용
        d = Path("/tmp/wbs-backups")
        d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("/api/operations/backups")
async def list_backups(request: Request) -> list[dict[str, Any]]:
    """백업 파일 목록 반환 (최신순 20개)."""
    require_admin_role(request)
    bd = _backup_dir()
    files = list_backup_files(bd)[:20]
    result = []
    for f in files:
        st = f.stat()
        result.append({
            "filename": f.name,
            "size_bytes": st.st_size,
            "size_human": _human_size(st.st_size),
            "created_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        })
    return result


def _human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


@router.post("/api/operations/backup", status_code=202)
async def trigger_backup(request: Request) -> dict[str, Any]:
    """pg_dump -Fc 백업 생성 (scripts/restore-postgres.sh 로 복원 가능)."""
    require_admin_role(request)
    try:
        filepath = await run_pg_dump(DATABASE_URL, _backup_dir(), BACKUP_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail=f"Backup timed out (>{BACKUP_TIMEOUT_SECONDS}s)")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {e}")
    filename = filepath.name
    size = filepath.stat().st_size
    async with get_pool(request).acquire() as conn:
        await insert_audit_event(
            conn, request=request,
            event_type="system.backup_created", entity_type="backup", entity_id=filename,
            summary=f"DB 백업 생성: {filename} ({_human_size(size)})",
        )
    return {"status": "created", "filename": filename, "size_bytes": size, "size_human": _human_size(size)}


@router.get("/api/operations/backups/{filename}")
async def download_backup(filename: str, request: Request) -> StreamingResponse:
    """백업 파일 다운로드."""
    require_admin_role(request)
    # 경로 순회 방지
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = _backup_dir() / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="Backup file not found")

    def _iter_file():
        with open(filepath, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        _iter_file(),
        media_type="application/gzip" if filename.endswith(".gz") else "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/api/operations/backups/{filename}", status_code=204)
async def delete_backup(filename: str, request: Request) -> None:
    """백업 파일 삭제."""
    require_admin_role(request)
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = _backup_dir() / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup file not found")
    filepath.unlink()
    async with get_pool(request).acquire() as conn:
        await insert_audit_event(
            conn, request=request,
            event_type="system.backup_deleted", entity_type="backup", entity_id=filename,
            summary=f"DB 백업 삭제: {filename}",
        )
