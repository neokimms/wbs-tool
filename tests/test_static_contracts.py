from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "services/wbs-api/app/main.py").read_text(encoding="utf-8")
MIGRATION = (ROOT / "services/wbs-api/migrations/001_init.sql").read_text(encoding="utf-8")
PORTAL_HTML = (ROOT / "apps/portal/index.html").read_text(encoding="utf-8")
PORTAL_JS = (ROOT / "apps/portal/app.js").read_text(encoding="utf-8")


class WbsPlatformContracts(unittest.TestCase):
    def test_rbac_and_security_endpoints_exist(self):
        for snippet in (
            "def require_mutating_role",
            '@app.post("/api/auth/password")',
            '@app.post("/api/users/{user_id}/sessions/revoke")',
            "LOGIN_FAILURE_LIMIT",
            "must_change_password",
        ):
            self.assertIn(snippet, API)

    def test_project_workflow_and_pm_adapter_are_enforced(self):
        for snippet in (
            "PROJECT_WORKFLOW_TRANSITIONS",
            '@app.patch("/api/projects/{project_id}/status")',
            "Actual sync requires a locked WBS baseline",
            'PM_ENGINE_ADAPTER == "mock"',
        ):
            self.assertIn(snippet, API)

    def test_excel_import_contracts_exist(self):
        for snippet in (
            "build_wbs_diff_rows",
            '@app.get("/api/imports/{job_id}/errors.xlsx")',
            '@app.get("/api/templates/{template_key}/versions")',
            '@app.post("/api/projects/{project_id}/imports/{job_id}/apply")',
            "wbs_project_wbs_items",
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


if __name__ == "__main__":
    unittest.main()
