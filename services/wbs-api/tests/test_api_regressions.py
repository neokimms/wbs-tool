"""리팩토링 중 발견된 결함의 회귀 테스트."""
import unittest

from tests.harness import SAMPLE_WBS, env


def setUpModule():
    env()


class BaselineDiffTests(unittest.TestCase):
    """버전 비교(wbs-diff)가 존재하지 않는 컬럼(snapshot)을 조회해 항상 500이던 결함."""

    def _project(self, name):
        e = env()
        pid = e.create_project(name)
        self.assertEqual(e.save_wbs(pid, SAMPLE_WBS).status, 200)
        return pid

    def test_diff_without_baseline(self):
        pid = self._project("[TEST] 베이스라인 없음")
        r = env().get(f"/api/projects/{pid}/wbs-diff")
        self.assertEqual(r.status, 200, r)
        self.assertEqual(len(r.body["added"]), len(SAMPLE_WBS))

    def test_diff_after_approval_baseline(self):
        e = env()
        pid = self._project("[TEST] 베이스라인 비교")
        ap = e.post("/api/approvals", {"project_id": pid, "title": "기준선 승인"})
        self.assertEqual(ap.status, 201, ap)
        if ap.body.get("status") != "Approved":  # 내부 승인 자동 처리 정책이 꺼져 있으면 수동 승인
            r = e.post(f"/api/approvals/{ap.body['id']}/approve", {"reviewer": "PMO Lead"})
            self.assertEqual(r.status, 200, r)
        self.assertIsNotNone(e.get(f"/api/projects/{pid}/baseline").body)
        e.patch(f"/api/projects/{pid}/work-items/P.1.1", {"name": "요구사항 정의(변경)"})
        d = e.get(f"/api/projects/{pid}/wbs-diff")
        self.assertEqual(d.status, 200, d)
        self.assertEqual([c["code"] for c in d.body["changed"]], ["P.1.1"])


class MigrationIdempotencyTests(unittest.TestCase):
    """기동 시마다 마이그레이션이 재실행되어 기본 노트 폴더가 중복 생성되던 결함."""

    def test_rerun_migrations_does_not_duplicate_seed_rows(self):
        e = env()
        main = e.main

        async def rerun_and_count():
            async with e.app.state.pool.acquire() as conn:
                for path in main.MIGRATION_PATHS:
                    await conn.execute(path.read_text(encoding="utf-8"))
                return await conn.fetch(
                    "SELECT name, count(*) AS n FROM note_folders WHERE parent_id IS NULL "
                    "GROUP BY tenant_id, name HAVING count(*) > 1"
                )

        dupes = e.loop.run_until_complete(rerun_and_count())
        self.assertEqual([dict(d) for d in dupes], [])


if __name__ == "__main__":
    unittest.main()
