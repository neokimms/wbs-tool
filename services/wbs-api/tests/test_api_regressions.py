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
        self.assertFalse(r.body["has_baseline"])
        self.assertEqual(r.body["summary"]["added"], len(SAMPLE_WBS))  # 화면이 summary 를 필수로 사용

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
        self.assertTrue(d.body["has_baseline"])
        self.assertEqual(d.body["summary"]["changed"], 1)


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


class CorsOnAuthErrorTests(unittest.TestCase):
    """세션 만료(401) 응답에 CORS 헤더가 없어 포털이 만료를 감지하지 못하고
    알림 폴링을 무한 반복하던 결함 (인증 미들웨어가 CORS 바깥에 있었음)."""

    ORIGIN = "http://localhost:3010"

    def _raw(self, method, path, token=None):
        e = env()
        headers = {"Origin": self.ORIGIN}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return e.loop.run_until_complete(e.client.request(method, path, headers=headers))

    def test_missing_token_401_has_cors_header(self):
        r = self._raw("GET", "/api/notifications?limit=30")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.headers.get("access-control-allow-origin"), self.ORIGIN)

    def test_expired_token_401_has_cors_header(self):
        r = self._raw("GET", "/api/notifications?limit=30", token="expired-or-invalid-token")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.headers.get("access-control-allow-origin"), self.ORIGIN)

    def test_success_response_still_has_cors_header(self):
        r = self._raw("GET", "/api/notifications?limit=30", token=env().tokens["admin"])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("access-control-allow-origin"), self.ORIGIN)


class DuplicateCodeMessageTests(unittest.TestCase):
    """Excel 업로드 시 'Duplicate WBS code' 만 표시되어 어느 행과 겹치는지 알 수 없던 문제."""

    def test_duplicate_code_message_names_code_and_first_row(self):
        e = env()
        pid = e.create_project("[TEST] 중복 코드")
        rows = [dict(r) for r in SAMPLE_WBS]
        rows.append({"code": "P.1.2", "parent_code": "P.1", "name": "끼워 넣은 작업", "item_type": "작업"})
        r = e.save_wbs(pid, rows)
        self.assertEqual(r.status, 422, r)
        err = next(x for x in r.body["detail"]["errors"] if x["field"] == "code")
        self.assertEqual(err["code"], "P.1.2")
        self.assertEqual(err["duplicate_of_row"], 4)
        self.assertIn("'P.1.2'", err["message"])
        self.assertIn("4행", err["message"])


if __name__ == "__main__":
    unittest.main()
