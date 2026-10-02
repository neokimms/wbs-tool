"""기준선(베이스라인) 조회.
"""
from typing import Any
from uuid import UUID
import asyncpg

from app.core.config import BASELINE_SELECT
from app.core.db import normalize_metadata, normalize_record


def baseline_summary(baseline: dict[str, Any] | None) -> dict[str, Any]:
    if not baseline:
        return {
            "locked": False,
            "status": "Unlocked",
        }

    return {
        "locked": baseline.get("status") == "Locked",
        "id": baseline.get("id"),
        "approval_id": baseline.get("approval_id"),
        "version": baseline.get("version"),
        "status": baseline.get("status"),
        "template_key": baseline.get("template_key"),
        "template_name": baseline.get("template_name"),
        "item_count": baseline.get("item_count"),
        "total_weight": baseline.get("total_weight"),
        "locked_at": baseline.get("locked_at"),
        "metadata": normalize_metadata(baseline.get("metadata")),
    }


async def fetch_latest_project_baseline(
    connection: asyncpg.Connection,
    project_id: UUID,
) -> dict[str, Any] | None:
    record = await connection.fetchrow(
        f"""
        SELECT {BASELINE_SELECT}
        FROM wbs_project_baselines b
        JOIN wbs_projects p ON p.id = b.project_id
        WHERE b.project_id = $1
        ORDER BY b.version DESC
        LIMIT 1
        """,
        project_id,
    )
    return normalize_record(record) if record else None
