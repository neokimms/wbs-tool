"""DB 연결·레코드 정규화·공통 파서.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
import json
from typing import Any
from uuid import UUID
import asyncpg
from fastapi import HTTPException, Request

from app.core.config import PROJECT_DELIVERY_MODES


async def init_connection(connection: asyncpg.Connection) -> None:
    await connection.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await connection.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


def normalize_record(record: asyncpg.Record) -> dict[str, Any]:
    data = {key: value for key, value in dict(record).items() if not key.startswith("_")}
    for key, value in data.items():
        if isinstance(value, date):
            data[key] = value.isoformat()
        if isinstance(value, Decimal):
            data[key] = float(value)
        if key in {
            "errors",
            "warnings",
            "metadata",
            "phases",
            "preview_rows",
            "snapshot_rows",
            "error",
            "recipients",
            "delivery_detail",
        } and isinstance(data[key], str):
            try:
                data[key] = json.loads(data[key])
            except json.JSONDecodeError:
                pass
    return data


def normalize_metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
            return decoded if isinstance(decoded, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.pool


def safe_uuid(value: Any) -> UUID | None:
    if not value:
        return None
    try:
        return value if isinstance(value, UUID) else UUID(str(value))
    except ValueError:
        return None


def normalize_delivery_mode(value: Any) -> str:
    mode = str(value or "waterfall").strip().lower()
    if mode not in PROJECT_DELIVERY_MODES:
        raise HTTPException(status_code=400, detail="Invalid project delivery mode")
    return mode


def normalize_number_list(values: Any, fallback: list[float]) -> list[float]:
    if not isinstance(values, list):
        return list(fallback)
    cleaned: list[float] = []
    for value in values:
        try:
            point = float(value)
        except (TypeError, ValueError):
            continue
        if point <= 0 or point > 10000:
            continue
        if not any(abs(existing - point) < 0.001 for existing in cleaned):
            cleaned.append(point)
    return sorted(cleaned) or list(fallback)


def normalize_dod_items(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in cleaned:
            cleaned.append(text[:200])
        if len(cleaned) >= 20:
            break
    return cleaned


def parse_json_object(value: str, *, default: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        decoded = json.loads(value or "{}")
        return decoded if isinstance(decoded, dict) else (default or {})
    except json.JSONDecodeError:
        return default or {}


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def as_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Invalid date: {value}")

# 하위 호환 alias
def parse_date(value: Any) -> date | None:
    try:
        return as_date(value)
    except ValueError:
        return None
