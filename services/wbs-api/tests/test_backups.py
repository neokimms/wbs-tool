"""백업 파일 목록·보관 기간 정리 단위 테스트 (DB 불필요)."""
import os
import tempfile
import time
import unittest
from pathlib import Path

from app.services.backups import list_backup_files, prune_backups


class BackupFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def touch(self, name: str, age_days: float) -> Path:
        path = self.dir / name
        path.write_bytes(b"x")
        mtime = time.time() - age_days * 86400
        os.utime(path, (mtime, mtime))
        return path

    def test_lists_dump_and_legacy_sql_gz_newest_first(self):
        self.touch("wbs_platform_old.dump", 3)
        self.touch("wbs-backup-legacy.sql.gz", 2)
        self.touch("wbs_platform_new.dump", 1)
        self.touch("wbs_platform_new.dump.sha256", 1)
        self.touch("scheduled.log", 0)
        names = [p.name for p in list_backup_files(self.dir)]
        self.assertEqual(names, ["wbs_platform_new.dump", "wbs-backup-legacy.sql.gz", "wbs_platform_old.dump"])

    def test_prune_removes_expired_backups_with_checksum_only(self):
        self.touch("old.dump", 20)
        self.touch("old.dump.sha256", 20)
        self.touch("recent.dump", 5)
        self.touch("other.txt", 30)
        pruned = [p.name for p in prune_backups(self.dir, 14)]
        self.assertEqual(pruned, ["old.dump"])
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), ["other.txt", "recent.dump"])


if __name__ == "__main__":
    unittest.main()
