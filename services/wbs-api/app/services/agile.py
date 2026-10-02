"""애자일 항목 변환 유틸리티.
"""
from typing import Any
import asyncpg

from app.core.config import _WBS_TO_AGILE_STATUS
from app.core.db import normalize_metadata, normalize_record


def agile_sprint_response(record: asyncpg.Record | dict[str, Any]) -> dict[str, Any]:
    sprint = normalize_record(record) if isinstance(record, asyncpg.Record) else dict(record)
    sprint["id"] = str(sprint["id"])
    sprint["project_id"] = str(sprint["project_id"])
    sprint["metadata"] = normalize_metadata(sprint.get("metadata"))
    return sprint


def _wbs_to_agile_status(wbs_status: str | None) -> str:
    return _WBS_TO_AGILE_STATUS.get((wbs_status or "").strip(), "Backlog")
