from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "services/wbs-api/app/main.py").read_text(encoding="utf-8")
MIGRATION = (ROOT / "services/wbs-api/migrations/001_init.sql").read_text(encoding="utf-8")
MIGRATIONS = "\n".join(
    path.read_text(encoding="utf-8")
    for path in sorted((ROOT / "services/wbs-api/migrations").glob("*.sql"))
)
PORTAL_HTML = (ROOT / "apps/portal/index.html").read_text(encoding="utf-8")
PORTAL_JS = (ROOT / "apps/portal/app.js").read_text(encoding="utf-8")
PORTAL_CSS = (ROOT / "apps/portal/styles.css").read_text(encoding="utf-8")
DEMO_E2E = (ROOT / "scripts/demo-e2e.sh").read_text(encoding="utf-8")
COMPOSE = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
GRAFANA_DATASOURCE = (ROOT / "infra/monitoring/grafana/provisioning/datasources/prometheus.yml").read_text(encoding="utf-8")
GRAFANA_DASHBOARD = (ROOT / "infra/monitoring/grafana/dashboards/wbs-platform.json").read_text(encoding="utf-8")


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

    def test_weekly_report_scheduler_contract_exists(self):
        for snippet in (
            "AsyncIOScheduler",
            "wbs_report_schedules",
            "wbs_report_runs",
            '@app.get("/api/report-schedules")',
            '@app.post("/api/report-schedules/{schedule_key}/run"',
            "send_weekly_report_email",
            "send_schedule_text_email",
            "execute_report_schedule",
            "wbs-weekly-report",
            "risk-escalation",
            "approval-reminder",
            "WBS_SMTP_HOST",
        ):
            self.assertIn(snippet, API + MIGRATION)

    def test_gantt_edit_and_design_contracts_exist(self):
        for snippet in (
            "WorkPackageDateUpdate",
            '@app.patch("/api/projects/{project_id}/op-work-packages/{work_package_id}/dates")',
            "update_work_package_dates",
            "op-gantt-editable",
            "data-gantt-handle",
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
            "006_wbs_tenant_recovery.sql",
            "tenant-inline-badge",
            "createDashboardState",
            "loadDataRunId",
        ):
            self.assertIn(snippet, API + PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_user_group_affiliation_contract_exists(self):
        for snippet in (
            "007_user_groups.sql",
            "wbs_user_groups",
            "DEFAULT_USER_GROUP_NAME",
            "group_id uuid",
            "ALTER COLUMN group_id SET NOT NULL",
            "UserGroupCreate",
            '@app.get("/api/user-groups")',
            '@app.post("/api/user-groups"',
            '@app.patch("/api/user-groups/{group_id}")',
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
            '{ id: "workboard",  label: "작업 현황" }',
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
            "20260609-wbs-baseline-collapse-01",
            "nav-icon",
            "nav-label",
            "WBS 기준선 관리",
            "data-wbs-type-chip",
            "hasActiveWbsPlanFilter",
            "hasVisibleDescendant",
            "기준 일정과 가중치는 WBS 관리에서",
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
            '@app.get("/api/me/work-items")',
            '@app.patch("/api/projects/{project_id}/work-items/{item_code:path}")',
            '@app.post("/api/projects/{project_id}/work-items/{item_code:path}/attachments")',
            '@app.post("/api/work-items/alerts/scan")',
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

    def test_wbs_overview_is_internal_wbs_centered(self):
        for snippet in (
            'href="#op-view"                   data-min-role="viewer"',
            "op-view-overview-strip",
            "op-view-header-right",
            "op-view-header-right .wbs-project-select",
            "op-view-header-right .sync-ctrl-btn",
            "op-view-summary",
            "grid-template-columns: repeat(4, minmax(92px, 1fr))",
            ".op-view .op-tab-content:not([hidden])",
            "margin-top: 16px",
            'aria-label="WBS 현황 프로젝트 선택"',
            'data-op-tab="assignee"',
            'data-op-tab="delayed"',
            'id="opViewSummary"',
            'id="opAssigneeWrap"',
            'id="opDelayedWrap"',
            "function opViewProjects()",
            "function filteredOpViewRows",
            "function isOpRowInProgressWindow",
            "todayUtcDate",
            "state.opViewProjectId === state.wbsPlanProjectId",
            "renderOpAssigneeSummary",
            "renderOpDelayedRows",
            "/wbs-items",
            "내부 WBS · 외부 연동됨",
            "WBS 현황 — 전체 진행 모니터링",
            "WBS 현황은 내부 WBS 데이터를 기준으로 표시합니다.",
        ):
            self.assertIn(snippet, PORTAL_HTML + PORTAL_JS + PORTAL_CSS)

    def test_agile_wbs_phase_1_to_5_contract_exists(self):
        for snippet in (
            "008_agile_wbs.sql",
            "delivery_mode text NOT NULL DEFAULT 'waterfall'",
            "wbs_agile_sprints",
            "wbs_agile_items",
            "PROJECT_DELIVERY_MODES",
            "AgileSprintCreate",
            "AgileItemCreate",
            '@app.patch("/api/projects/{project_id}/delivery-mode")',
            '@app.get("/api/projects/{project_id}/agile/sprints")',
            '@app.post("/api/projects/{project_id}/agile/sprints"',
            '@app.get("/api/projects/{project_id}/agile/backlog")',
            '@app.post("/api/projects/{project_id}/agile/backlog"',
            '@app.patch("/api/agile/items/{item_id}")',
            '@app.get("/api/projects/{project_id}/agile/metrics")',
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
            "009_agile_hybrid_samples.sql",
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
            "sortByDeliveryMode",
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
            "010_project_operation_policy.sql",
            "wbs_project_operation_policies",
            "DEFAULT_PROJECT_OPERATION_POLICY",
            "ProjectOperationPolicyUpdate",
            '@app.get("/api/project-operation-policy")',
            '@app.put("/api/project-operation-policy")',
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


if __name__ == "__main__":
    unittest.main()
