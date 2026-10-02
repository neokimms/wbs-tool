"""인앱 알림·메일 발송.
"""
from datetime import date
from email.message import EmailMessage
from email.utils import formatdate
import asyncio
import json
import smtplib
from typing import Any
from uuid import UUID
import asyncpg
from email.mime.text import MIMEText

from app.core.config import (
    NOTIFY_FROM_EMAIL,
    REPORT_SMTP_FROM,
    REPORT_SMTP_HOST,
    REPORT_SMTP_PASSWORD,
    REPORT_SMTP_PORT,
    REPORT_SMTP_USERNAME,
    REPORT_SMTP_USE_SSL,
    REPORT_SMTP_USE_TLS,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USER,
    logger,
)
from app.core.db import normalize_record, safe_uuid
from app.core.security import work_item_identity_key, work_item_user_tokens


async def send_notification(
    connection: asyncpg.Connection,
    *,
    user_id: UUID,
    event_type: str,
    title: str,
    body: str = "",
    entity_type: str | None = None,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    email_to: str | None = None,
) -> None:
    """인앱 알림 DB 저장 + SMTP 이메일 발송 (실패해도 메인 플로우 차단 안 함)."""
    try:
        # 바깥 트랜잭션이 있으면 SAVEPOINT 로 감싸, 알림 실패가 본 작업 트랜잭션을 깨뜨리지 않게 한다
        async with connection.transaction():
            await connection.execute(
                """
                INSERT INTO wbs_notifications
                  (user_id, event_type, title, body, entity_type, entity_id, metadata)
                VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
                """,
                user_id, event_type, title, body, entity_type, entity_id, metadata or {},
            )
    except Exception:
        logger.warning("인앱 알림 저장 실패", exc_info=True)

    if SMTP_HOST and email_to:
        def _send() -> None:
            try:
                msg = MIMEText(body or title, "plain", "utf-8")
                msg["Subject"] = f"[AX WBS] {title}"
                msg["From"] = NOTIFY_FROM_EMAIL or SMTP_USER
                msg["To"] = email_to
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=5) as s:
                    s.ehlo()
                    if s.has_extn("STARTTLS"):
                        s.starttls()
                    if SMTP_USER and SMTP_PASSWORD:
                        s.login(SMTP_USER, SMTP_PASSWORD)
                    s.sendmail(msg["From"], [email_to], msg.as_string())
            except Exception:
                logger.warning("알림 메일 발송 실패", exc_info=True)
        asyncio.get_event_loop().run_in_executor(None, _send)


def normalize_email_recipients(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
            value = decoded
        except json.JSONDecodeError:
            value = [value]
    if not isinstance(value, list):
        return []

    recipients: list[str] = []
    seen: set[str] = set()
    for item in value:
        email = str(item or "").strip()
        if not email or "@" not in email:
            continue
        normalized = email.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        recipients.append(email)
    return recipients


def send_weekly_report_email(schedule: dict[str, Any], workbook_bytes: bytes, filename: str) -> dict[str, Any]:
    recipients = normalize_email_recipients(schedule.get("recipients"))
    if not recipients:
        return {"status": "skipped", "reason": "no_recipients"}
    if not REPORT_SMTP_HOST:
        return {"status": "skipped", "reason": "smtp_not_configured", "recipients": recipients}

    message = EmailMessage()
    message["Subject"] = schedule.get("email_subject") or "[WBS] 주간 프로젝트 보고서"
    message["From"] = REPORT_SMTP_FROM
    message["To"] = ", ".join(recipients)
    message["Date"] = formatdate(localtime=True)
    message.set_content(schedule.get("email_body") or "주간 WBS 프로젝트 현황 보고서를 첨부합니다.")
    message.add_attachment(
        workbook_bytes,
        maintype="application",
        subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )

    smtp_cls = smtplib.SMTP_SSL if REPORT_SMTP_USE_SSL else smtplib.SMTP
    with smtp_cls(REPORT_SMTP_HOST, REPORT_SMTP_PORT, timeout=30) as smtp:
        if REPORT_SMTP_USE_TLS and not REPORT_SMTP_USE_SSL:
            smtp.starttls()
        if REPORT_SMTP_USERNAME:
            smtp.login(REPORT_SMTP_USERNAME, REPORT_SMTP_PASSWORD)
        smtp.send_message(message)

    return {"status": "sent", "recipients": recipients, "smtp_host": REPORT_SMTP_HOST}


def send_schedule_text_email(schedule: dict[str, Any], subject: str, body: str) -> dict[str, Any]:
    recipients = normalize_email_recipients(schedule.get("recipients"))
    if not recipients:
        return {"status": "skipped", "reason": "no_recipients"}
    if not REPORT_SMTP_HOST:
        return {"status": "skipped", "reason": "smtp_not_configured"}

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = REPORT_SMTP_FROM
    message["To"] = ", ".join(recipients)
    message["Date"] = formatdate(localtime=True)
    message.set_content(body)

    smtp_cls = smtplib.SMTP_SSL if REPORT_SMTP_USE_SSL else smtplib.SMTP
    with smtp_cls(REPORT_SMTP_HOST, REPORT_SMTP_PORT, timeout=30) as smtp:
        if REPORT_SMTP_USE_TLS and not REPORT_SMTP_USE_SSL:
            smtp.starttls()
        if REPORT_SMTP_USERNAME:
            smtp.login(REPORT_SMTP_USERNAME, REPORT_SMTP_PASSWORD)
        smtp.send_message(message)

    return {"status": "sent", "recipients": recipients, "smtp_host": REPORT_SMTP_HOST}


async def resolve_work_item_notification_users(
    connection: asyncpg.Connection,
    tenant_id: str,
    people: list[str],
) -> list[dict[str, Any]]:
    keys = [work_item_identity_key(value) for value in people if work_item_identity_key(value)]
    if not keys:
        return []
    users = await connection.fetch(
        """
        SELECT id, email, display_name, role, status
        FROM wbs_users
        WHERE tenant_id = $1 AND status = 'Active'
        """,
        tenant_id,
    )
    matched: dict[str, dict[str, Any]] = {}
    for user_record in users:
        user = normalize_record(user_record)
        user_keys = work_item_user_tokens(user)
        if any(key in user_keys or any(key and key in user_key for user_key in user_keys) for key in keys):
            matched[str(user["id"])] = user
    return list(matched.values())


async def _notify_action_assignee(
    connection: asyncpg.Connection, *, project: dict[str, Any], item: dict[str, Any],
    user: dict[str, Any] | None, event_type: str, title: str,
) -> None:
    if not user or not safe_uuid(user.get("id")):
        return
    due = item.get("due_date")
    due_text = due.isoformat() if isinstance(due, date) else (due or "기한 없음")
    await send_notification(
        connection,
        user_id=safe_uuid(user["id"]),
        event_type=event_type,
        title=title,
        body=f"{project.get('name')} / {item.get('title')} (기한: {due_text})",
        entity_type="action_item",
        entity_id=str(item.get("id")),
        metadata={
            "project_id": str(project["id"]),
            "project_name": project.get("name"),
            "action_item_id": str(item.get("id")),
            "meeting_id": str(item["meeting_id"]) if item.get("meeting_id") else None,
        },
        email_to=None,
    )
