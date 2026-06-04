from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "services/wbs-api/app/main.py").read_text(encoding="utf-8")
MIGRATION = (ROOT / "services/wbs-api/migrations/001_init.sql").read_text(encoding="utf-8")
PORTAL_HTML = (ROOT / "apps/portal/index.html").read_text(encoding="utf-8")
PORTAL_JS = (ROOT / "apps/portal/app.js").read_text(encoding="utf-8")
PORTAL_CSS = (ROOT / "apps/portal/styles.css").read_text(encoding="utf-8")
PORTAL_NGINX = (ROOT / "apps/portal/nginx.conf").read_text(encoding="utf-8")
GUIDE_CONTENT = (ROOT / "apps/portal/wbs-guide-content.js").read_text(encoding="utf-8")
GUIDE_RENDERER = (ROOT / "apps/portal/guide-renderer.js").read_text(encoding="utf-8")
DEMO_E2E = (ROOT / "scripts/demo-e2e.sh").read_text(encoding="utf-8")
ENV_EXAMPLE = (ROOT / ".env.example").read_text(encoding="utf-8")
GITIGNORE = (ROOT / ".gitignore").read_text(encoding="utf-8")


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

    def test_portal_connects_project_excel_tabs_and_approval_paging(self):
        for snippet in (
            'id="projectWbsDownloadButton"',
            'id="projectWbsFileInput"',
            'id="projectSelectInput"',
            'id="projectApprovalButton"',
            'id="projectSelectRows"',
            'class="project-picker"',
            'class="wbs-list-header"',
            'class="wbs-context-panel"',
            "wbs-primary-table",
            "downloadProjectWbsExcel",
            "uploadProjectWbsExcel",
            "projectSelectInput\").addEventListener(\"change\"",
            "projectApprovalButton\").addEventListener(\"click\"",
            "/api/projects/${encodeURIComponent(state.selectedProjectId)}/imports/preview",
            "projectWbsDownloadButton\").addEventListener(\"click\", downloadProjectWbsExcel",
            "projectWbsFileInput\").addEventListener(\"change\", uploadProjectWbsExcel",
            'data-portfolio-tab="pmo"',
            'data-portfolio-tab="delivery"',
            'data-portfolio-tab="risk"',
            "event.target.closest(\"[data-portfolio-tab]\")",
            "renderProjectTimeline",
            "state.approvalLimit += 5",
        ):
            self.assertIn(snippet, PORTAL_HTML + PORTAL_JS)
        self.assertNotIn("slice(0, 5)", PORTAL_JS)
        self.assertNotIn("projectRows", PORTAL_HTML + PORTAL_JS)

    def test_portal_fallback_templates_cover_project_types(self):
        for snippet in (
            'key: "migration-data"',
            'name: "소스 분석", weight: 15',
            'name: "검증", weight: 10',
            'key: "maintenance"',
            'name: "요청 접수", weight: 10',
            'name: "회고", weight: 5',
        ):
            self.assertIn(snippet, PORTAL_JS)

    def test_portal_guide_panel_is_separated_and_populated(self):
        for snippet in (
            'href="#guide"',
            'id="guide"',
            'id="guideContent"',
            'class="nav-guide"',
            "wbs-guide-content.js",
            "guide-renderer.js",
            "renderGuidePanel",
            "WBS_PORTAL_GUIDE_CONTENT",
            "WbsGuideRenderer.renderGuide",
            "data-guide-anchor",
            "guideContent\").addEventListener(\"click\"",
            ".nav-guide a.active",
            "grid-column: 2",
        ):
            self.assertIn(snippet, PORTAL_HTML + PORTAL_JS + PORTAL_CSS + GUIDE_CONTENT + GUIDE_RENDERER)
        for menu in (
            "대시보드",
            "WBS 계획",
            "표준 WBS",
            "Excel 반영",
            "OpenProject",
            "승인 이력",
            "운영 점검",
            "사용자",
            "감사 로그",
            "설정",
        ):
            self.assertIn(f'menu: "{menu}"', GUIDE_CONTENT)
        for kind in ("overview", "procedure", "task-list", "reference", "troubleshooting"):
            self.assertIn(f'kind: "{kind}"', GUIDE_CONTENT)
        self.assertIn('body[data-portal-view="guide"] #guide', PORTAL_CSS)

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

    def test_generated_backups_and_excel_locks_are_ignored(self):
        for snippet in (
            "outputs/",
            "~$*",
            "*.dump",
            "backups/postgres/*",
            "!backups/postgres/.gitkeep",
        ):
            self.assertIn(snippet, GITIGNORE)

    def test_env_example_keeps_dev_aliases_disabled_and_documents_policy(self):
        for snippet in (
            "WBS_ENABLE_LOGIN_ALIASES=false",
            "Development-only convenience aliases.",
            "WBS_PASSWORD_MIN_LENGTH=8",
            "WBS_PASSWORD_REQUIRE_NUMBER=true",
            "WBS_STRICT_WEIGHT_VALIDATION=true",
        ):
            self.assertIn(snippet, ENV_EXAMPLE)

    def test_public_health_and_portal_nginx_do_not_leak_internal_details(self):
        self.assertIn("Content-Security-Policy", PORTAL_NGINX)
        self.assertIn("frame-ancestors 'none'", PORTAL_NGINX)
        self.assertNotIn('"openproject_base_url"', API)
        self.assertNotIn('"database": "postgresql"', API)


if __name__ == "__main__":
    unittest.main()
