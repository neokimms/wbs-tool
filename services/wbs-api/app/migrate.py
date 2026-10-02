"""스탠드얼론 마이그레이션 실행기 (Helm migration Job: `python -m app.migrate`).

migrations/*.sql 을 파일명 순서대로 모두 적용한다. 모든 스크립트는 IF NOT EXISTS /
ON CONFLICT 기반으로 멱등하게 작성되어 있어 반복 실행해도 안전하다.
(API 기동 시 WBS_RUN_MIGRATIONS_ON_STARTUP 경로와 동일한 파일 집합을 사용)
"""
import asyncio
import json
import os
from pathlib import Path

import asyncpg


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://wbs:wbs_dev_password@localhost:5432/wbs_platform",
)
MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
MIGRATION_PATHS = sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql"))
# 하위 호환 — 기존 코드가 참조하던 단일 경로
MIGRATION_PATH = MIGRATIONS_DIR / "001_init.sql"


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


async def migrate() -> None:
    connection = await asyncpg.connect(DATABASE_URL)
    try:
        await init_connection(connection)
        for path in MIGRATION_PATHS:
            print(f"[migrate] applying {path.name}", flush=True)
            await connection.execute(path.read_text(encoding="utf-8"))
        print(f"[migrate] done — {len(MIGRATION_PATHS)} files", flush=True)
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(migrate())
