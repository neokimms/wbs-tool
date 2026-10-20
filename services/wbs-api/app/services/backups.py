"""PostgreSQL 백업 (pg_dump -Fc) — 포털 수동 백업과 정기 백업 Job(`python -m app.backup`) 공용.
"""
from datetime import datetime, timedelta, timezone
import asyncio
import os
from pathlib import Path
import urllib.parse

# 호스트 스크립트(scripts/backup-postgres.sh)와 포털·정기 백업 모두 pg_dump -Fc(.dump)로 생성.
# .sql.gz 는 이전 버전 포털 백업 호환용
BACKUP_PATTERNS = ("*.dump", "*.sql.gz")


def list_backup_files(directory: Path) -> list[Path]:
    files = {path for pattern in BACKUP_PATTERNS for path in directory.glob(pattern)}
    return sorted(files, key=lambda path: path.stat().st_mtime, reverse=True)


def database_name(database_url: str) -> str:
    return urllib.parse.urlparse(database_url).path.lstrip("/") or "wbs_platform"


async def run_pg_dump(database_url: str, directory: Path, timeout: int, db_name: str | None = None) -> Path:
    """database_url 의 서버에서 db_name(기본: URL 의 DB)을 덤프. 실패·시간 초과 시 파일 삭제 후 예외."""
    parsed = urllib.parse.urlparse(database_url)
    db_name = db_name or database_name(database_url)
    # 호스트 스크립트와 같은 파일명 규칙 (실행 환경 로컬 시각 — 컨테이너는 보통 UTC)
    filepath = directory / f"{db_name}_{datetime.now().strftime('%Y%m%d-%H%M%S')}.dump"
    cmd = [
        "pg_dump",
        "-h", parsed.hostname or "localhost",
        "-p", str(parsed.port or 5432),
        "-U", parsed.username or "wbs",
        "-d", db_name,
        "--no-password",
        "--format=custom",
        "--no-acl",
        "--no-owner",
        "--file", str(filepath),
    ]

    async def _run() -> None:
        # 메모리에 덤프를 올리지 않도록 pg_dump 가 파일에 직접 기록
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PGPASSWORD": parsed.password or ""},
        )
        try:
            _, stderr = await proc.communicate()
        except asyncio.CancelledError:
            proc.kill()
            raise
        if proc.returncode != 0:
            raise RuntimeError(stderr.decode()[:500])

    try:
        await asyncio.wait_for(_run(), timeout=timeout)
    except BaseException:
        filepath.unlink(missing_ok=True)
        raise
    return filepath


def prune_backups(directory: Path, retention_days: int) -> list[Path]:
    """보관 기간이 지난 백업과 체크섬 파일 삭제. 삭제한 경로 목록 반환."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).timestamp()
    pruned = []
    for path in list_backup_files(directory):
        if path.stat().st_mtime < cutoff:
            path.unlink()
            Path(f"{path}.sha256").unlink(missing_ok=True)
            pruned.append(path)
    return pruned
