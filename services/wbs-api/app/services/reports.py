"""정기 보고 스케줄러·보고서 실행.
"""
from datetime import datetime, timedelta, timezone
import re
from typing import Any
import asyncpg
from fastapi import FastAPI, Request

from app.core.audit import insert_audit_event
from app.core.config import (
    AsyncIOScheduler,
    CronTrigger,
    REPORT_DEFAULT_TIMEZONE,
    REPORT_OUTPUT_DIR,
    REPORT_RUN_SELECT,
    REPORT_SCHEDULER_ENABLED,
    REPORT_SCHEDULE_SELECT,
)
from app.core.db import normalize_record, safe_uuid
from app.core.notify import normalize_email_recipients, send_schedule_text_email, send_weekly_report_email
from app.services.excel import build_weekly_report_workbook


def report_run_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    run = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    if run.get("schedule_id"):
        run["schedule_id"] = str(run["schedule_id"])
    return run


def report_job_id(schedule_key: str) -> str:
    return f"report-schedule:{schedule_key}"


def scheduler_runtime_state(app: FastAPI) -> dict[str, Any]:
    scheduler = getattr(app.state, "report_scheduler", None)
    jobs = scheduler.get_jobs() if scheduler else []
    return {
        "enabled": REPORT_SCHEDULER_ENABLED,
        "apscheduler_available": AsyncIOScheduler is not None and CronTrigger is not None,
        "running": bool(scheduler and getattr(scheduler, "running", False)),
        "jobs": len(jobs),
        "timezone": REPORT_DEFAULT_TIMEZONE,
    }


async def fetch_report_schedule(connection: asyncpg.Connection, schedule_key: str) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"""
        SELECT {REPORT_SCHEDULE_SELECT}
        FROM wbs_report_schedules
        WHERE key = $1
        """,
        schedule_key,
    )
    return normalize_record(record) if record else None


async def refresh_report_scheduler(app: FastAPI) -> None:
    scheduler = getattr(app.state, "report_scheduler", None)
    if not scheduler or not CronTrigger:
        return

    for job in scheduler.get_jobs():
        if job.id.startswith(("weekly-report:", "report-schedule:")):
            scheduler.remove_job(job.id)

    async with app.state.pool.acquire() as connection:
        await connection.execute(
            """
            UPDATE wbs_report_schedules
            SET next_run_at = NULL,
                updated_at = now()
            WHERE enabled = false
              AND next_run_at IS NOT NULL
            """
        )
        records = await connection.fetch(
            f"""
            SELECT {REPORT_SCHEDULE_SELECT}
            FROM wbs_report_schedules
            WHERE enabled = true
            ORDER BY key
            """
        )

    for record in records:
        schedule = normalize_record(record)
        trigger_kwargs = {
            "hour": int(schedule["hour"]),
            "minute": int(schedule["minute"]),
            "timezone": schedule["timezone"] or REPORT_DEFAULT_TIMEZONE,
        }
        if schedule.get("report_type") == "weekly_project_status":
            trigger_kwargs["day_of_week"] = str(schedule["day_of_week"])
        trigger = CronTrigger(**trigger_kwargs)
        scheduler.add_job(
            scheduled_report_job,
            trigger=trigger,
            id=report_job_id(str(schedule["key"])),
            args=[app, str(schedule["key"])],
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        job = scheduler.get_job(report_job_id(str(schedule["key"])))
        next_run_at = job.next_run_time if job else None
        async with app.state.pool.acquire() as connection:
            await connection.execute(
                """
                UPDATE wbs_report_schedules
                SET next_run_at = $2,
                    updated_at = now()
                WHERE key = $1
                """,
                schedule["key"],
                next_run_at,
            )


async def scheduled_report_job(app: FastAPI, schedule_key: str) -> None:
    async with app.state.pool.acquire() as connection:
        schedule = await fetch_report_schedule(connection, schedule_key)
    if not schedule or not schedule.get("enabled"):
        return
    await execute_report_schedule(app, schedule, send_email=True, triggered_by="scheduler")
    await refresh_report_scheduler(app)


def save_report_artifact(filename: str, workbook_bytes: bytes) -> str:
    REPORT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_OUTPUT_DIR / filename
    path.write_bytes(workbook_bytes)
    return str(path)


async def execute_weekly_report_schedule(
    app: FastAPI,
    schedule: dict[str, Any],
    *,
    send_email: bool,
    triggered_by: str,
    request: Request | None = None,
) -> dict[str, Any]:
    period_end = datetime.now(timezone.utc)
    period_start = period_end - timedelta(days=7)
    started_at = datetime.now(timezone.utc)
    filename = f"wbs-weekly-report-{period_end.strftime('%Y%m%d-%H%M%S')}.xlsx"
    workbook_bytes: bytes | None = None
    artifact_path: str | None = None
    delivery = {"status": "skipped", "reason": "send_email_false"}
    error_payload: dict[str, Any] | None = None
    status = "Generated"
    metadata: dict[str, Any] = {}

    try:
        workbook_bytes, metadata = await build_weekly_report_workbook(app.state.pool, period_start, period_end)
        artifact_path = save_report_artifact(filename, workbook_bytes)
        if send_email:
            delivery = send_weekly_report_email(schedule, workbook_bytes, filename)
        status = "Sent" if delivery.get("status") == "sent" else "Generated"
    except Exception as exc:  # noqa: BLE001 - record scheduler failures instead of crashing the job loop
        status = "Failed"
        error_payload = {
            "message": str(exc),
            "type": exc.__class__.__name__,
        }

    async with app.state.pool.acquire() as connection:
        async with connection.transaction():
            record = await connection.fetchrow(
                f"""
                INSERT INTO wbs_report_runs
                  (schedule_id, schedule_key, report_type, status, period_start,
                   period_end, recipient_count, artifact_path, delivery_status,
                   delivery_detail, error, metadata, triggered_by, started_at,
                   completed_at)
                VALUES
                  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
                   $12::jsonb, $13, $14, now())
                RETURNING {REPORT_RUN_SELECT}
                """,
                safe_uuid(schedule.get("id")),
                schedule["key"],
                schedule.get("report_type") or "weekly_project_status",
                status,
                period_start,
                period_end,
                len(normalize_email_recipients(schedule.get("recipients"))),
                artifact_path,
                delivery.get("status", "skipped"),
                delivery,
                error_payload,
                metadata,
                triggered_by,
                started_at,
            )
            await connection.execute(
                """
                UPDATE wbs_report_schedules
                SET last_run_at = now(),
                    updated_at = now()
                WHERE key = $1
                """,
                schedule["key"],
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type="report.weekly_sent" if status == "Sent" else "report.weekly_generated" if status == "Generated" else "report.weekly_failed",
                entity_type="report_schedule",
                entity_id=schedule["key"],
                summary=f"Weekly report {status.lower()}: {schedule['key']}",
                metadata={
                    "delivery_status": delivery.get("status"),
                    "artifact_path": artifact_path,
                    "triggered_by": triggered_by,
                    "error": error_payload,
                },
                actor={"email": "scheduler@wbs.local", "role": "system"} if not request else None,
            )

    return report_run_response(record)


async def build_notification_digest(pool: asyncpg.Pool, schedule: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    report_type = schedule.get("report_type")
    subject = schedule.get("email_subject") or f"[WBS] {schedule.get('name') or schedule.get('key')}"
    intro = schedule.get("email_body") or ""
    if report_type not in {"risk_escalation", "approval_reminder"}:
        return subject, intro.strip(), {
            "item_count": 0,
            "digest_type": str(report_type or "unknown"),
            "unsupported": True,
        }

    async with pool.acquire() as connection:
        if report_type == "risk_escalation":
            table_exists = await connection.fetchval("SELECT to_regclass('public.wbs_risks') IS NOT NULL")
            rows = await connection.fetch(
                """
                SELECT r.title, r.severity, r.status, r.owner, r.due_date, p.name AS project_name
                FROM wbs_risks r
                JOIN wbs_projects p ON p.id = r.project_id
                WHERE r.status != 'Closed'
                  AND r.severity = '높음'
                ORDER BY r.due_date NULLS LAST, r.created_at DESC
                LIMIT 25
                """
            ) if table_exists else []
            lines = [intro, "", "미처리 고위험 리스크"]
            if rows:
                lines.extend(
                    f"- [{row['project_name']}] {row['title']} · 담당 {row['owner']} · 상태 {row['status']} · 기한 {row['due_date'] or '-'}"
                    for row in rows
                )
            else:
                lines.append("- 대상 항목 없음")
            return subject, "\n".join(line for line in lines if line is not None).strip(), {
                "item_count": len(rows),
                "digest_type": "risk_escalation",
            }

        table_exists = await connection.fetchval("SELECT to_regclass('public.wbs_approval_requests') IS NOT NULL")
        rows = await connection.fetch(
            """
            SELECT a.title, a.request_type, a.requester, a.reviewer, a.due_date, p.name AS project_name
            FROM wbs_approval_requests a
            JOIN wbs_projects p ON p.id = a.project_id
            WHERE a.status = 'Pending'
            ORDER BY a.due_date NULLS LAST, a.created_at DESC
            LIMIT 25
            """
        ) if table_exists else []
        lines = [intro, "", "승인 대기 항목"]
        if rows:
            lines.extend(
                f"- [{row['project_name']}] {row['title']} · 요청 {row['requester']} · 승인자 {row['reviewer'] or '-'} · 기한 {row['due_date'] or '-'}"
                for row in rows
            )
        else:
            lines.append("- 대상 항목 없음")
        return subject, "\n".join(line for line in lines if line is not None).strip(), {
            "item_count": len(rows),
            "digest_type": "approval_reminder",
        }


async def execute_notification_report_schedule(
    app: FastAPI,
    schedule: dict[str, Any],
    *,
    send_email: bool,
    triggered_by: str,
    request: Request | None = None,
) -> dict[str, Any]:
    period_end = datetime.now(timezone.utc)
    period_start = period_end - timedelta(days=1)
    started_at = datetime.now(timezone.utc)
    delivery = {"status": "skipped", "reason": "send_email_false"}
    error_payload: dict[str, Any] | None = None
    status = "Generated"
    metadata: dict[str, Any] = {}

    try:
        subject, body, metadata = await build_notification_digest(app.state.pool, schedule)
        if send_email:
            if int(metadata.get("item_count") or 0) > 0:
                delivery = send_schedule_text_email(schedule, subject, body)
            else:
                delivery = {"status": "skipped", "reason": "no_items"}
        status = "Sent" if delivery.get("status") == "sent" else "Generated"
    except Exception as exc:  # noqa: BLE001 - record scheduler failures instead of crashing the job loop
        status = "Failed"
        error_payload = {
            "message": str(exc),
            "type": exc.__class__.__name__,
        }

    async with app.state.pool.acquire() as connection:
        async with connection.transaction():
            record = await connection.fetchrow(
                f"""
                INSERT INTO wbs_report_runs
                  (schedule_id, schedule_key, report_type, status, period_start,
                   period_end, recipient_count, artifact_path, delivery_status,
                   delivery_detail, error, metadata, triggered_by, started_at,
                   completed_at)
                VALUES
                  ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9::jsonb, $10::jsonb,
                   $11::jsonb, $12, $13, now())
                RETURNING {REPORT_RUN_SELECT}
                """,
                safe_uuid(schedule.get("id")),
                schedule["key"],
                schedule.get("report_type") or "notification_digest",
                status,
                period_start,
                period_end,
                len(normalize_email_recipients(schedule.get("recipients"))),
                delivery.get("status", "skipped"),
                delivery,
                error_payload,
                metadata,
                triggered_by,
                started_at,
            )
            await connection.execute(
                """
                UPDATE wbs_report_schedules
                SET last_run_at = now(),
                    updated_at = now()
                WHERE key = $1
                """,
                schedule["key"],
            )
            await insert_audit_event(
                connection,
                request=request,
                event_type=f"report.{schedule.get('report_type')}.{status.lower()}",
                entity_type="report_schedule",
                entity_id=schedule["key"],
                summary=f"{schedule.get('name') or schedule['key']} {status.lower()}",
                metadata={
                    "delivery_status": delivery.get("status"),
                    "triggered_by": triggered_by,
                    "error": error_payload,
                    **metadata,
                },
                actor={"email": "scheduler@wbs.local", "role": "system"} if not request else None,
            )

    return report_run_response(record)


async def execute_report_schedule(
    app: FastAPI,
    schedule: dict[str, Any],
    *,
    send_email: bool,
    triggered_by: str,
    request: Request | None = None,
) -> dict[str, Any]:
    if schedule.get("report_type") == "weekly_project_status":
        return await execute_weekly_report_schedule(
            app,
            schedule,
            send_email=send_email,
            triggered_by=triggered_by,
            request=request,
        )
    return await execute_notification_report_schedule(
        app,
        schedule,
        send_email=send_email,
        triggered_by=triggered_by,
        request=request,
    )


def resource_identity_key(value: Any) -> str:
    text = str(value or "").strip().lower()
    return re.sub(r"[\s._-]+", "", text)
