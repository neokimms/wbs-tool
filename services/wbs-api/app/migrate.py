import asyncio
import json
import os
from pathlib import Path

import asyncpg


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://wbs:wbs_dev_password@localhost:5432/wbs_platform",
)
MIGRATION_PATH = Path(__file__).resolve().parent.parent / "migrations" / "001_init.sql"


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
        await connection.execute(MIGRATION_PATH.read_text(encoding="utf-8"))
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(migrate())
