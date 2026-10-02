from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
# 모듈 분리 이후에도 동작하도록 app/ 하위 전체 파이썬 소스를 대상으로 검사
API = "\n".join(
    p.read_text(encoding="utf-8")
    for p in sorted((ROOT / "services/wbs-api/app").rglob("*.py"))
)
MIGRATION = (ROOT / "services/wbs-api/migrations/001_init.sql").read_text(encoding="utf-8")
PORTAL_HTML = (ROOT / "apps/portal/index.html").read_text(encoding="utf-8")
PORTAL_JS = "\n".join(
    p.read_text(encoding="utf-8") for p in sorted((ROOT / "apps/portal").rglob("*.js"))
)
DEMO_E2E = (ROOT / "scripts/demo-e2e.sh").read_text(encoding="utf-8")


class WbsPlatformContracts(unittest.TestCase):
    def test_rbac_and_security_endpoints_exist(self):
        for snippet in (
            "def require_mutating_role",
            '.post("/api/auth/password")',
            '.post("/api/users/{user_id}/sessions/revoke")',
            "LOGIN_FAILURE_LIMIT",
            "must_change_password",
            "resolve_login_alias",
            "WBS_ENABLE_LOGIN_ALIASES",
        ):
            self.assertIn(snippet, API)

    def test_project_workflow_and_pm_adapter_are_enforced(self):
        for snippet in (
            "PROJECT_WORKFLOW_TRANSITIONS",
            '.patch("/api/projects/{project_id}/status")',
            "Actual sync requires a locked WBS baseline",
            'PM_ENGINE_ADAPTER == "mock"',
        ):
            self.assertIn(snippet, API)

    def test_excel_import_contracts_exist(self):
        for snippet in (
            "build_wbs_diff_rows",
            '.get("/api/imports/{job_id}/errors.xlsx")',
            '.get("/api/templates/{template_key}/versions")',
            '.post("/api/projects/{project_id}/imports/{job_id}/apply")',
            "wbs_project_wbs_items",
            "baseline_source",
        ):
            self.assertIn(snippet, API + MIGRATION)

    def test_portal_surfaces_hardening_features(self):
        for snippet in (
            'id="passwordDialog"',
            'id="importDiffRows"',
            'id="templateVersionList"',
            "canMutateWork",
            "downloadImportErrorsExcel",
        ):
            self.assertIn(snippet, PORTAL_HTML + PORTAL_JS)

    def test_demo_e2e_contract_exists(self):
        for snippet in (
            "scripts/generate-demo-wbs-workbook.py",
            "/api/templates/import/preview",
            "/imports/${import_job_id}/apply",
            "/api/approvals",
            "/sync-preflight",
            "ready_for_actual_sync",
        ):
            self.assertIn(snippet, DEMO_E2E)

    def test_portal_scripts_are_wired_in_order(self):
        """분리된 포털 스크립트가 모두 index.html 에 있고 boot.js 가 마지막에 로드되는지."""
        import re
        srcs = re.findall(r'<script src="\./(js/[a-z-]+\.js)', PORTAL_HTML)
        files = sorted(str(p.relative_to(ROOT / "apps/portal")) for p in (ROOT / "apps/portal/js").glob("*.js"))
        self.assertEqual(sorted(srcs), files)
        self.assertEqual(srcs[-1], "js/boot.js")
        self.assertEqual(srcs[0], "js/core-state.js")


if __name__ == "__main__":
    unittest.main()
