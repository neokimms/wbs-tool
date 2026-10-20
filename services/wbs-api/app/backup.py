"""정기 백업 실행기 (cron·Helm CronJob: `python -m app.backup`).

WBS_BACKUP_DATABASES(기본: DATABASE_URL 의 DB + openproject)를 BACKUP_DIR 에 pg_dump -Fc 로 덤프하고,
모두 성공했을 때만 WBS_BACKUP_RETENTION_DAYS(기본 14일)가 지난 백업을 정리한다.
로컬 Docker:  docker exec wbstoolagent-wbs-api-1 python -m app.backup
"""
import asyncio
import os
import sys

from app.core.config import BACKUP_DIR, BACKUP_TIMEOUT_SECONDS, DATABASE_URL
from app.services.backups import database_name, prune_backups, run_pg_dump

DATABASES = os.getenv("WBS_BACKUP_DATABASES", f"{database_name(DATABASE_URL)} openproject").split()
RETENTION_DAYS = int(os.getenv("WBS_BACKUP_RETENTION_DAYS", "14"))


async def backup() -> int:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    failed = []
    for db_name in DATABASES:
        try:
            path = await run_pg_dump(DATABASE_URL, BACKUP_DIR, BACKUP_TIMEOUT_SECONDS, db_name)
            print(f"[backup] {db_name}: {path.name} ({path.stat().st_size} bytes)", flush=True)
        except (asyncio.TimeoutError, RuntimeError) as exc:
            print(f"[backup] {db_name}: FAILED {exc!r}", flush=True)
            failed.append(db_name)
    # 백업이 하나라도 실패하면 기존 백업은 지우지 않음
    if failed:
        return 1
    for path in prune_backups(BACKUP_DIR, RETENTION_DAYS):
        print(f"[backup] pruned {path.name}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(backup()))
