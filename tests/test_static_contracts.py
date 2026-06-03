from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "services/wbs-api/app/main.py").read_text(encoding="utf-8")
MIGRATION = (ROOT / "services/wbs-api/migrations/001_init.sql").read_text(encoding="utf-8")
PORTAL_HTML = (ROOT / "apps/portal/index.html").read_text(encoding="utf-8")
PORTAL_JS = (ROOT / "apps/portal/app.js").read_text(encoding="utf-8")
DEMO_E2E = (ROOT / "scripts/demo-e2e.sh").read_text(encoding="utf-8")


class WbsPlatformContracts(unittest.TestCase):
    def test_rbac_and_security_endpoints_exist(self):
        for snippet in (
            "def require_mutating_role",
            '@app.post("/api/auth/password")',
            '@app.post("/api/users/{user_id}/sessions/revoke")',
            "LOGIN_FAILURE_LIMIT",
            "must_change_password",
            "resolve_login_alias",
            "WBS_ENABLE_LOGIN_ALIASES",
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
            '@app.get("/api/projects/{project_id}/excel")',
            '@app.post("/api/projects/{project_id}/imports/preview", status_code=201)',
            "wbs_project_wbs_items",
            "baseline_source",
        ):
            self.assertIn(snippet, API + MIGRATION)

    def test_portal_surfaces_hardening_features(self):
        for snippet in (
            'id="passwordDialog"',
            'id="importDiffRows"',
            'id="templateVersionList"',
            'id="projectWbsFileInput"',
            'id="approvalLoadMoreButton"',
            'id="pmEngineForm"',
            'id="syncPullButton"',
            "canMutateWork",
            "downloadImportErrorsExcel",
        ):
            self.assertIn(snippet, PORTAL_HTML + PORTAL_JS)

    def test_policy_and_pull_sync_contracts_exist(self):
        for snippet in (
            "WBS_STRICT_WEIGHT_VALIDATION",
            "WBS_PASSWORD_MIN_LENGTH",
            "validate_password_policy",
            '@app.post("/api/projects/{project_id}/sync-pull")',
            "openproject_work_package_pull_snapshot",
        ):
            self.assertIn(snippet, API)

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


if __name__ == "__main__":
    unittest.main()
