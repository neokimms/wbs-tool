"""인증·프로젝트·대시보드·보고 등 핵심 API 동작 테스트."""
import unittest

from tests.harness import SAMPLE_WBS, env


def setUpModule():
    env()


class AuthTests(unittest.TestCase):
    def test_health_is_public(self):
        r = env().get("/health", as_=None)
        self.assertEqual(r.status, 200)
        self.assertEqual(r.body["status"], "ok")

    def test_api_requires_token(self):
        self.assertEqual(env().get("/api/projects", as_=None).status, 401)

    def test_login_failure(self):
        r = env().post("/api/auth/login", {"email": "admin@wbs.local", "password": "wrong-password"}, as_=None)
        self.assertEqual(r.status, 401)

    def test_me(self):
        r = env().get("/api/auth/me")
        self.assertEqual(r.status, 200)
        user = r.body.get("user", r.body)
        self.assertEqual(user["role"], "admin")

    def test_viewer_cannot_manage_users(self):
        env().ensure_user("viewer1", "Viewer One", "viewer")
        self.assertEqual(env().get("/api/users", as_="viewer1").status, 403)


class ProjectTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pid = env().create_project("[TEST] 핵심 프로젝트")

    def test_list_includes_project_role(self):
        r = env().get("/api/projects")
        self.assertEqual(r.status, 200)
        mine = [p for p in r.body if str(p["id"]) == self.pid]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["project_role"], "admin")

    def test_detail_shape(self):
        r = env().get(f"/api/projects/{self.pid}")
        self.assertEqual(r.status, 200)
        for key in ("project", "project_role", "wbs_summary", "risks", "issues", "approvals"):
            self.assertIn(key, r.body)

    def test_invalid_status_transition(self):
        r = env().patch(f"/api/projects/{self.pid}/status", {"status": "Synced"})
        self.assertIn(r.status, (400, 409))

    def test_unknown_project_404(self):
        self.assertEqual(env().get("/api/projects/00000000-0000-0000-0000-000000000000").status, 404)

    def test_non_member_cannot_see_project(self):
        env().ensure_user("outsider", "Outsider", "pmo")
        self.assertEqual(env().get(f"/api/projects/{self.pid}", as_="outsider").status, 404)


class ReadEndpointsSmokeTests(unittest.TestCase):
    """주요 조회 API가 200을 반환하는지 (리팩토링 회귀 감지용)."""

    PATHS = [
        "/api/dashboard", "/api/templates", "/api/approvals", "/api/risks", "/api/issues",
        "/api/notifications", "/api/notes", "/api/notes/folders", "/api/announcements",
        "/api/audit-events", "/api/settings", "/api/users", "/api/user-groups", "/api/tenants",
        "/api/imports", "/api/report-schedules", "/api/report-runs", "/api/project-operation-policy",
        "/api/reports/executive-summary", "/api/reports/resource-load", "/api/reports/burndown",
        "/api/me/work-items", "/api/me/action-items", "/api/wbs/rules", "/api/project-roles",
        "/api/openproject", "/api/operations/health", "/api/pm-engine/preflight",
    ]

    def test_read_endpoints(self):
        failures = []
        for path in self.PATHS:
            r = env().get(path)
            if r.status != 200:
                failures.append((path, r.status, str(r.body)[:200]))
        self.assertEqual(failures, [])

    def test_weekly_excel(self):
        r = env().get("/api/reports/weekly-excel")
        self.assertEqual(r.status, 200)
        self.assertIn("spreadsheetml", r.headers.get("content-type", ""))

    def test_metrics_text(self):
        r = env().get("/metrics", as_=None)
        self.assertIn(r.status, (200, 401))


class ProgressConsistencyTests(unittest.TestCase):
    """진척률·SPI가 모든 화면 API에서 동일한 공통 산식으로 계산되는지."""

    @classmethod
    def setUpClass(cls):
        e = env()
        cls.pid = e.create_project("[TEST] 진척 산식")
        r = e.save_wbs(cls.pid, SAMPLE_WBS)
        assert r.status == 200, r
        assert e.patch(f"/api/projects/{cls.pid}/work-items/P.1.1", {"progress": 100}).status == 200
        assert e.patch(f"/api/projects/{cls.pid}/work-items/P.1.2", {"progress": 50}).status == 200

    def test_progress_endpoint(self):
        s = env().get(f"/api/projects/{self.pid}/progress").body["summary"]
        self.assertEqual(s["progress_pct"], 30.0)
        self.assertEqual(s["planned_pct"], 40.0)
        self.assertEqual(s["spi"], 0.75)

    def test_detail_dashboard_and_progress_agree(self):
        e = env()
        detail = e.get(f"/api/projects/{self.pid}").body["wbs_summary"]
        dash = e.get("/api/dashboard").body
        kpi = next(k for k in dash["project_kpis"] if k["project_id"] == self.pid)
        self.assertEqual((detail["progress_pct"], detail["spi"]), (30.0, 0.75))
        self.assertEqual((kpi["progress_pct"], kpi["spi"]), (30.0, 0.75))
        heat = {h["phase_name"]: h["avg_progress"] for h in dash["status_heatmap"]
                if h["project_name"] == "[TEST] 진척 산식"}
        self.assertEqual(heat, {"분석": 75.0, "설계": 0.0})

    def test_work_items_mark_leaf_and_rollup(self):
        items = {i["code"]: i for i in env().get(f"/api/projects/{self.pid}/work-items").body}
        self.assertFalse(items["P.1"]["is_leaf"])
        self.assertEqual(items["P.1"]["progress"], 75)
        self.assertEqual(items["P.1"]["progress_source"], "rollup")
        self.assertTrue(items["P.1.1"]["is_leaf"])

    def test_parent_progress_input_rejected(self):
        r = env().patch(f"/api/projects/{self.pid}/work-items/P.1", {"progress": 10})
        self.assertEqual(r.status, 400)

    def test_done_status_sets_progress_100(self):
        r = env().patch(f"/api/projects/{self.pid}/work-items/P.2.1.1", {"status": "완료"})
        self.assertEqual(r.status, 200)
        self.assertEqual(r.body["progress"], 100)
        env().patch(f"/api/projects/{self.pid}/work-items/P.2.1.1", {"status": "대기", "progress": 0})

    def test_burndown_uses_common_formula(self):
        series = env().get("/api/reports/burndown", params={"project_id": self.pid}).body["series"]
        self.assertEqual(series[-1]["progress_pct"], 30.0)


class HierarchyApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pid = env().create_project("[TEST] 계층 규칙")

    def _errors(self, rows):
        r = env().save_wbs(self.pid, rows)
        self.assertEqual(r.status, 422, r)
        return [e["message"] for e in r.body["detail"]["errors"]]

    def test_child_under_milestone(self):
        msgs = self._errors(SAMPLE_WBS + [{"code": "X", "parent_code": "P.2.2", "name": "x", "item_type": "작업"}])
        self.assertTrue(any("마일스톤" in m for m in msgs))

    def test_depth_limit(self):
        rows = SAMPLE_WBS + [
            {"code": "P.2.1.1.1", "parent_code": "P.2.1.1", "name": "L5", "item_type": "작업"},
            {"code": "P.2.1.1.1.1", "parent_code": "P.2.1.1.1", "name": "L6", "item_type": "작업"},
        ]
        self.assertTrue(any("깊이" in m for m in self._errors(rows)))

    def test_rules_endpoint(self):
        body = env().get("/api/wbs/rules").body
        self.assertEqual(body["max_depth"], 5)
        self.assertEqual(body["child_rules"]["마일스톤"], [])


if __name__ == "__main__":
    unittest.main()
