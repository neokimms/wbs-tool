import re
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
MIGRATIONS = "\n".join(
    path.read_text(encoding="utf-8")
    for path in sorted((ROOT / "services/wbs-api/migrations").glob("*.sql"))
)
PORTAL_CSS = (ROOT / "apps/portal/styles.css").read_text(encoding="utf-8")
COMPOSE = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
GRAFANA_DATASOURCE = (ROOT / "infra/monitoring/grafana/provisioning/datasources/prometheus.yml").read_text(encoding="utf-8")
GRAFANA_DASHBOARD = (ROOT / "infra/monitoring/grafana/dashboards/wbs-platform.json").read_text(encoding="utf-8")


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


    def test_weekly_report_scheduler_contract_exists(self):
        for snippet in (
            "AsyncIOScheduler",
            "wbs_report_schedules",
            "wbs_report_runs",
            '@router.get("/api/report-schedules")',
            '@router.post("/api/report-schedules/{schedule_key}/run"',
            "send_weekly_report_email",
            "send_schedule_text_email",
            "execute_report_schedule",
            "wbs-weekly-report",
            "risk-escalation",
            "approval-reminder",
            "WBS_SMTP_HOST",
        ):
            self.assertIn(snippet, API + MIGRATIONS)

    def test_gantt_edit_and_design_contracts_exist(self):
        for snippet in (
            "WorkPackageDateUpdate",
            '@router.patch("/api/projects/{project_id}/op-work-packages/{work_package_id}/dates")',
            "update_work_package_dates",
            # 원격(6/11)은 WBS 현황 간트 편집을 끄고 작업 현황 간트로 이동 — 드래그 편집 계약은 작업 현황 기준
            "workboard-gantt-editable",
            "data-wb-gantt-handle",
            "resource-period-control",
            "sortable-th",
            "portfolioOwnerFilter",
            "skeleton-line",
            "schedWeeklyRecipients",
            "riOwnerFilter",
            "data-ri-sort",
            "userRoleFilter",
            "data-user-sort",
            "ldapDiagnosticsBtn",
            "ldap-diagnostic-list",
        ):
            self.assertIn(snippet, API + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_multitenancy_switch_contract_exists(self):
        for snippet in (
            "validate_request_tenant",
            "Tenant is not active",
            "User is not assigned to this tenant",
            '"X-Tenant-ID"',
            "TENANT_ID_KEY",
            'id="tenantSwitcher"',
            "switchTenant",
            "authHeaders",
            "tenant-inline-badge",
            "createDashboardState",
            "loadDataRunId",
        ):
            self.assertIn(snippet, API + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_user_group_affiliation_contract_exists(self):
        for snippet in (
            "wbs_user_groups",
            "DEFAULT_USER_GROUP_NAME",
            "group_id uuid",
            "UserGroupCreate",
            '@router.get("/api/user-groups")',
            '@router.post("/api/user-groups"',
            '@router.patch("/api/user-groups/{group_id}")',
            "resolve_user_group",
            'id="userGroupInput"',
            'id="userGroupFilter"',
            'id="userGroupCreateButton"',
            'data-user-field="group_id"',
            "renderUserGroupControls",
            "createUserGroup",
            "user-group-toolbar",
        ):
            self.assertIn(snippet, API + MIGRATIONS + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_monitoring_grafana_contract_exists(self):
        for snippet in (
            "grafana/grafana",
            "grafana_data",
            "infra/monitoring/grafana/provisioning",
            "Prometheus",
            "WBS Platform Operations",
            "wbs_api_up",
            "wbs_report_runs_total",
        ):
            self.assertIn(snippet, COMPOSE + GRAFANA_DATASOURCE + GRAFANA_DASHBOARD)

    def test_resource_allocation_views_exist(self):
        for snippet in (
            "RESOURCE_DEFAULT_TASK_HOURS",
            "account_tasks",
            "pmo_capacity",
            "capacity_basis",
            'data-resource-view="workload"',
            'data-resource-view="accounts"',
            'data-resource-view="capacity"',
            "renderResourceAccounts",
            "renderResourceCapacity",
            "resource-kpi-grid",
        ):
            self.assertIn(snippet, API + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_risk_issue_detail_and_navigation_exist(self):
        for snippet in (
            'id="riDetailDrawer"',
            "renderRiDetailDrawer",
            "navigateToRiList",
            "RI_OPEN_STATUS_FILTER",
            "data-ri-navigate",
            "data-ri-detail",
            "ri-count-pill",
            "ri-click-row",
        ):
            self.assertIn(snippet, PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_risk_issue_api_tenant_scope_exists(self):
        for snippet in (
            "SELECT * FROM wbs_risks WHERE id = $1 AND tenant_id = $2",
            "UPDATE wbs_risks SET {set_clause} WHERE id = $1 AND tenant_id = $2 RETURNING *",
            "SELECT * FROM wbs_issues WHERE id = $1 AND tenant_id = $2",
            "UPDATE wbs_issues SET {set_clause} WHERE id = $1 AND tenant_id = $2 RETURNING *",
            "p.tenant_id = r.tenant_id",
            "p.tenant_id = i.tenant_id",
            "SELECT count(*) FROM wbs_risks WHERE tenant_id = $1 AND status != 'Closed'",
            "SELECT count(*) FROM wbs_issues WHERE tenant_id = $1 AND status != 'Closed'",
        ):
            self.assertIn(snippet, API)

    def test_guide_content_reflects_current_portal_features(self):
        for snippet in (
            '{ id: "risks",      label: "리스크·이슈" }',
            '{ id: "resource",   label: "자원 배분" }',
            '{ id: "workboard",  label: "작업 보드" }',
            "숫자 버튼은 Closed 제외 미종료 건 기준",
            "오른쪽 슬라이딩 패널",
            "WBS 작업 부하, 사용자 계정별 할당, PMO 가동율",
            "저장 후 등록된 스케줄 요약 영역",
            "LDAP 실 서버 검증",
            "Prometheus/Grafana",
            "테넌트 데이터",
            'role="tablist"',
            'role="tab"',
            'aria-selected="${isActive ? "true" : "false"}"',
            "ArrowRight",
            "nav-icon",
            "nav-label",
            "WBS 기준선 관리",
            "data-wbs-type-chip",
            "hasActiveWbsPlanFilter",
            "hasVisibleDescendant",
            "기준 일정과 가중치는 WBS 계획에서",
        ):
            self.assertIn(snippet, PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_internal_workboard_contract_exists(self):
        for snippet in (
            'href="#workboard"',
            'id="workboard"',
            'id="workboardTabBar"',
            'data-workboard-view="mine"',
            'data-workboard-drop-status',
            "renderWorkboardPanel",
            "renderInternalGantt",
            "workboard-gantt-editable",
            "quickUpdateWorkboardTask",
            "saveWorkboardTaskUpdate",
            "내부 작업 현황",
            "workboard-board-column",
            "task-comments",
            "task-history",
            "task-attachments",
            "WorkItemUpdate",
            '@router.get("/api/me/work-items")',
            '@router.patch("/api/projects/{project_id}/work-items/{item_code:path}")',
            '@router.post("/api/projects/{project_id}/work-items/{item_code:path}/attachments")',
            '@router.post("/api/work-items/alerts/scan")',
            "metadata: dict[str, Any]",
            "data_source\": \"internal_wbs",
            "externalIntegrationEnabled",
            "externalIntegrationToggle",
            "portal_enabled",
            "기준선 반영",
            "작업 항목",
            "외부 연동",
        ):
            self.assertIn(snippet, API + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_wbs_overview_keeps_openproject_source_with_summary(self):
        """WBS 현황: 데이터 원천은 OpenProject 작업패키지(미연동 시 로컬 폴백) 유지 + 원격 요약 스트립·자동 조회 이식 (2026-10 통합 결정 A)."""
        for snippet in (
            'href="#op-view"                   data-min-role="viewer"',
            'id="opViewSummary"',
            'data-op-tab="assignee"',
            'data-op-tab="delayed"',
            "/op-work-packages",
            "function renderOpViewPanels()",
            "function renderOpViewSummary()",
            "function maybeLoadOpViewProject()",
            "function isOpRowInProgressWindow",
            "todayUtcDate",
        ):
            self.assertIn(snippet, PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_workboard_progress_follows_wbs_rollup_rule(self):
        """작업 현황도 진척률 공통 산식 사용: 상위 항목은 롤업 값·입력 비활성, KPI 는 가중 롤업."""
        for snippet in (
            "function workboardRollup()",
            "function workboardRowIsParent(row)",
            "computeWbsOverallProgress(state.workboardRows)",
            "workboardRowIsParent(row) ? undefined",
        ):
            self.assertIn(snippet, PORTAL_JS)

    def test_agile_wbs_phase_1_to_5_contract_exists(self):
        for snippet in (
            "delivery_mode text NOT NULL DEFAULT 'waterfall'",
            "wbs_agile_sprints",
            "wbs_agile_items",
            "PROJECT_DELIVERY_MODES",
            "AgileSprintCreate",
            "AgileItemCreate",
            '@router.patch("/api/projects/{project_id}/delivery-mode")',
            '@router.get("/api/projects/{project_id}/agile/sprints")',
            '@router.post("/api/projects/{project_id}/agile/sprints"',
            '@router.get("/api/projects/{project_id}/agile/backlog")',
            '@router.post("/api/projects/{project_id}/agile/backlog"',
            '@router.patch("/api/agile/items/{item_id}")',
            '@router.get("/api/projects/{project_id}/agile/metrics")',
            'id="projectDeliveryModeSelect"',
            'data-workboard-view="agile-backlog"',
            'data-workboard-view="agile-board"',
            'data-workboard-view="agile-metrics"',
            "renderAgileBacklog",
            "renderAgileSprintBoard",
            "renderAgileMetrics",
            "data-agile-drop-status",
            "agile-burndown-chart",
            "Hybrid WBS 연결 현황",
        ):
            self.assertIn(snippet, API + MIGRATIONS + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_agile_hybrid_sample_templates_exist(self):
        for snippet in (
            "agile-standard",
            "hybrid-standard",
            "Agile 표준 WBS",
            "Hybrid 표준 WBS",
            "template_delivery_mode",
            "add_agile_sample_sheets",
            "Agile Backlog",
            "Sprint Plan",
            "Hybrid Mapping",
            "templateDeliveryMode",
            "syncProjectDeliveryModeWithTemplate",
            "DELIVERY_MODE_ORDER",
            "TEMPLATE_KEY_ORDER",
            "wbs-mode-group",
            "delivery-mode-badge",
            "compareTemplates",
            "template-card-type",
            "template-card-tenant",
            "template-card-description",
            'data-wbs-list-tab="standard"',
            'data-wbs-list-tab="custom"',
            "setWbsListTab",
            "wbs-list-tab-bar",
            "회사 공식 표준 WBS 5종",
            "OpenProject 연동은 선택 사항",
        ):
            self.assertIn(snippet, API + MIGRATIONS + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_tenant_project_operation_policy_contract_exists(self):
        for snippet in (
            "wbs_project_operation_policies",
            "DEFAULT_PROJECT_OPERATION_POLICY",
            "ProjectOperationPolicyUpdate",
            '@router.get("/api/project-operation-policy")',
            '@router.put("/api/project-operation-policy")',
            "fetch_project_operation_policy",
            "validate_story_points_for_policy",
            "sprint_end_date_from_policy",
            "create_version_from_payload",
            'data-stg-tab="policy"',
            'id="projectPolicyPanel"',
            "renderProjectPolicyPanel",
            "saveProjectOperationPolicy",
            "projectOperationPolicy",
            "defaultSprintEndDate",
            "renderStoryPointControl",
            "policyOpenProjectVersionSync",
        ):
            self.assertIn(snippet, API + MIGRATIONS + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)


    def test_feature_migrations_exist(self):
        """마이그레이션은 migrations/NNN_*.sql glob 으로 적용되므로 파일 존재로 계약 확인."""
        for name in (
            "006_wbs_tenant_recovery.sql",
            "007_user_groups.sql",
            "008_agile_wbs.sql",
            "009_agile_hybrid_samples.sql",
            "010_project_operation_policy.sql",
        ):
            self.assertTrue((ROOT / "services/wbs-api/migrations" / name).is_file(), name)

class SidebarMenuGroupTests(unittest.TestCase):
    """좌측 메뉴: 그룹(개요/계획/실행/통제·협업/관리)·메뉴명·순서 계약 (2026-10-29)."""

    EXPECTED = [
        ("개요", ["#dashboard", "#announcements"]),
        ("계획", ["#portfolio", "#wbs-plan", "#templates"]),
        ("실행", ["#op-view", "#workboard", "#resource"]),
        ("통제·협업", ["#risks", "#meetings", "#notes"]),
        ("관리", ["#settings"]),
    ]
    LABELS = {
        "#portfolio": "프로젝트", "#wbs-plan": "WBS 계획", "#templates": "WBS 템플릿",
        "#workboard": "작업 보드", "#meetings": "회의·조치사항", "#notes": "노트·보고서",
        "#settings": "시스템 설정",
    }

    def _nav(self):
        m = re.search(r'<nav class="nav-list">(.*?)</nav>', PORTAL_HTML, re.S)
        self.assertIsNotNone(m)
        return m.group(1)

    def test_groups_and_order(self):
        nav = self._nav()
        groups = re.findall(r'<p class="nav-group-title"[^>]*>([^<]+)</p>(.*?)</div>', nav, re.S)
        self.assertEqual([g[0] for g in groups], [g[0] for g in self.EXPECTED])
        for (title, body), (_, hrefs) in zip(groups, self.EXPECTED):
            self.assertEqual(re.findall(r'href="(#[^"]+)"', body), hrefs, title)
        self.assertIn('href="#guide" class="nav-guide-link"', nav.split("</div>")[-1])

    def test_labels_and_tooltips_match(self):
        nav = self._nav()
        for href, label in self.LABELS.items():
            a = re.search(rf'<a[^>]*href="{href}"[^>]*>.*?</a>', nav, re.S).group(0)
            self.assertIn(f'data-tooltip="{label}"', a)
            self.assertIn(f'<span class="nav-label">{label}</span>', a)

    def test_old_menu_names_removed_from_nav(self):
        nav = self._nav()
        for old in ("프로젝트 현황", "WBS 관리", "표준/일반", "작업 현황", "Action Item", "노트/보고서", '"설정"'):
            self.assertNotIn(old, nav)

    def test_empty_group_hidden_logic_exists(self):
        self.assertIn("initNavGroups", PORTAL_JS)
        self.assertIn(".nav-group-title", PORTAL_CSS)


if __name__ == "__main__":
    unittest.main()
