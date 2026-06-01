const API_BASE = window.WBS_API_BASE_URL || "http://localhost:8000";
const AUTH_TOKEN_KEY = "wbs.portal.authToken";

const fallbackTemplates = [
  {
    key: "si-standard",
    name: "SI 구축 표준 WBS",
    project_type: "System Integration",
    description: "착수, 분석, 설계, 개발, 테스트, 전환, 안정화 중심의 SI 구축 템플릿",
    phases: [
      { code: "1", name: "착수", weight: 5 },
      { code: "2", name: "분석", weight: 15 },
      { code: "3", name: "설계", weight: 20 },
      { code: "4", name: "개발", weight: 25 },
      { code: "5", name: "테스트", weight: 20 },
      { code: "6", name: "전환", weight: 10 },
      { code: "7", name: "안정화", weight: 5 },
    ],
  },
  {
    key: "migration-data",
    name: "데이터 이관 WBS",
    project_type: "Data Migration",
    description: "소스 분석, 매핑, 정제, 리허설, 본이관, 검증 중심의 데이터 이관 템플릿",
    phases: [],
  },
  {
    key: "maintenance",
    name: "유지보수 운영 WBS",
    project_type: "Maintenance",
    description: "접수, 영향도 분석, 조치, 검증, 릴리스, 회고 중심의 유지보수 템플릿",
    phases: [],
  },
];

const fallbackProjects = [
  {
    name: "차세대 업무포털 구축",
    owner: "PMO",
    status: "Draft",
    template_key: "si-standard",
    start_date: "2026-06-01",
  },
  {
    name: "고객 데이터 이관",
    owner: "Data Lead",
    status: "Review",
    template_key: "migration-data",
    start_date: "2026-06-10",
  },
];

const fallbackApprovals = [
  {
    title: "자동 승인 이력 없음",
    project_name: "내부 WBS 승인은 요청 즉시 승인됩니다",
    request_type: "Internal Approval",
    status: "Approved",
    requester: "System",
    reviewer: "PMO Lead",
    decision_comment: "Auto approval is ready",
  },
];

const fallbackPreflight = {
  state: "dry_run_only",
  ready_for_actual_sync: false,
  engine: {
    adapter: "openproject",
    enabled: false,
    token_configured: false,
  },
  checks: [
    {
      name: "pm_engine",
      status: "skip",
      message: "API 연결 대기",
    },
  ],
};

const fallbackOperationsHealth = {
  status: "watch",
  summary: {
    checks: 0,
    failures: 0,
    warnings: 1,
    passes: 0,
  },
  checks: [
    {
      key: "operations",
      label: "Operations health",
      status: "warn",
      message: "운영 상태 수집 대기",
    },
  ],
};

const restrictedOperationsHealth = {
  status: "watch",
  summary: {
    checks: 1,
    failures: 0,
    warnings: 1,
    passes: 0,
  },
  checks: [
    {
      key: "operations_access",
      label: "Operations access",
      status: "warn",
      message: "PMO 또는 admin 권한 필요",
    },
  ],
};

const fallbackSettings = {
  settings: [
    {
      key: "pm_engine",
      label: "PM Engine Adapter",
      category: "integration",
      description: "PM 엔진 구현체는 adapter 경계 뒤에서 연결됩니다.",
      value: {
        adapter: "openproject",
        display_name: "OpenProject",
        mode: "ce-api-adapter",
        dependency_boundary: "pm-engine-api",
      },
    },
  ],
  pm_engine: fallbackPreflight.engine,
};

const state = {
  authToken: window.localStorage.getItem(AUTH_TOKEN_KEY),
  currentUser: null,
  templates: fallbackTemplates,
  projects: fallbackProjects,
  approvals: [],
  users: [],
  auditEvents: [],
  settings: fallbackSettings,
  selectedSettingKey: "pm_engine",
  settingsStatus: "",
  apiConnected: false,
  dashboard: {
    metrics: {
      projects: fallbackProjects.length,
      templates: fallbackTemplates.length,
      pending_approvals: 0,
      openproject_sync: "ready",
      database: "PostgreSQL 17",
    },
  },
  importPreview: [],
  importJobs: [],
  pendingImportJobId: null,
  selectedImportJobId: null,
  pmPreflight: fallbackPreflight,
  syncDetail: null,
  syncRuns: [],
  operationsHealth: fallbackOperationsHealth,
  selectedProjectId: null,
  projectPlan: null,
  projectWbsSearch: "",
  projectPhaseFilter: "",
  projectTypeFilter: "",
  userSelectedTemplate: false,
  userSelectedSyncProject: false,
};

async function request(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const errorBody = await response.json();
      detail = typeof errorBody.detail === "string" ? errorBody.detail : JSON.stringify(errorBody.detail || detail);
    } catch (error) {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTimestamp(value) {
  if (!value) return "-";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "-";
  return timestamp.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncStateLabel(value) {
  const labels = {
    ready: "Ready",
    dry_run_only: "Dry-run",
    auth_failed: "Auth",
    offline: "Offline",
    blocked: "Blocked",
  };
  return labels[value] || "Watch";
}

function syncStateClass(value) {
  if (value === "ready") return "stable";
  if (value === "offline" || value === "auth_failed" || value === "blocked") return "critical";
  return "attention";
}

function operationStatusLabel(value) {
  const labels = {
    pass: "Pass",
    warn: "Watch",
    fail: "Fail",
    stable: "Stable",
    watch: "Watch",
    critical: "Critical",
  };
  return labels[value] || "Watch";
}

function operationStatusClass(value) {
  if (value === "pass" || value === "stable") return "stable";
  if (value === "fail" || value === "critical") return "critical";
  return "attention";
}

function canAccessOperations() {
  return ["admin", "pmo"].includes(state.currentUser?.role);
}

function canManageUsers() {
  return state.currentUser?.role === "admin";
}

function canViewAudit() {
  return ["admin", "pmo"].includes(state.currentUser?.role);
}

function canViewSettings() {
  return ["admin", "pmo"].includes(state.currentUser?.role);
}

function toggleNavAndPanel(hash, allowed) {
  const link = document.querySelector(`.nav-list a[href="${hash}"]`);
  const panel = document.querySelector(hash);
  if (link) link.hidden = !allowed;
  if (panel) panel.hidden = !allowed;
}

function canAccessView(viewId) {
  if (viewId === "operations") return canAccessOperations();
  if (viewId === "users") return canManageUsers();
  if (viewId === "audit") return canViewAudit();
  if (viewId === "settings") return canViewSettings();
  return true;
}

function renderAuthState() {
  const isAuthenticated = Boolean(state.currentUser && state.authToken);
  document.body.dataset.auth = isAuthenticated ? "authenticated" : "login";
  document.querySelector("#userBadge").textContent = isAuthenticated
    ? `${state.currentUser.display_name} · ${state.currentUser.role}`
    : "-";

  toggleNavAndPanel("#operations", canAccessOperations());
  toggleNavAndPanel("#users", canManageUsers());
  toggleNavAndPanel("#audit", canViewAudit());
  toggleNavAndPanel("#settings", canViewSettings());
  if (!canAccessView(document.body.dataset.portalView)) {
    applyPortalView("#dashboard", { updateHistory: true, scrollToTop: false });
  }
}

function renderMetrics() {
  document.querySelector("#projectCount").textContent = state.dashboard.metrics.projects;
  document.querySelector("#templateCount").textContent = state.dashboard.metrics.templates;
  document.querySelector("#approvalCount").textContent = state.dashboard.metrics.pending_approvals || 0;
  document.querySelector("#syncStatus").textContent = syncStateLabel(state.pmPreflight?.state);
}

function renderTemplates() {
  const templateList = document.querySelector("#templateList");
  templateList.innerHTML = state.templates
    .map(
      (template) => `
        <article class="template-item">
          <strong>${template.name}</strong>
          <span>${template.project_type}${template.item_count ? ` · ${template.item_count} items` : ""}</span>
          <p>${template.description}</p>
        </article>
      `,
    )
    .join("");
}

function defaultTemplateKey() {
  return state.templates.find((template) => template.key === "si-standard")?.key || state.templates[0]?.key || fallbackTemplates[0].key;
}

function renderTemplateSelect() {
  const selector = document.querySelector("#templateSelect");
  const selectedValue = state.userSelectedTemplate && selector.value ? selector.value : defaultTemplateKey();
  selector.innerHTML = state.templates
    .map((template) => `<option value="${template.key}">${template.name}</option>`)
    .join("");
  selector.value = state.templates.some((template) => template.key === selectedValue)
    ? selectedValue
    : defaultTemplateKey();
}

function statusClass(status) {
  const lowered = String(status).toLowerCase();
  if (
    lowered.includes("done") ||
    lowered.includes("approved") ||
    lowered.includes("accepted") ||
    lowered.includes("applied") ||
    lowered.includes("locked") ||
    lowered.includes("synced") ||
    lowered.includes("updated")
  ) {
    return "stable";
  }
  if (lowered.includes("reject") || lowered.includes("critical") || lowered.includes("failed") || lowered.includes("error")) {
    return "critical";
  }
  return "attention";
}

function projectPlanRows() {
  return state.projectPlan?.rows || [];
}

function baselineText(baseline) {
  if (!baseline?.locked) return "Unlocked";
  const version = baseline.version ? `v${baseline.version}` : "Locked";
  const rows = baseline.item_count !== undefined ? ` · ${baseline.item_count} rows` : "";
  return `${version}${rows}`;
}

function projectRowMap(rows) {
  return new Map(rows.map((row) => [row.code, row]));
}

function projectRootCode(rows) {
  return rows.find((row) => !row.parent_code)?.code || rows[0]?.code || "";
}

function rowDepth(row, rowByCode) {
  let depth = 1;
  let parentCode = row.parent_code;
  const seen = new Set([row.code]);

  while (parentCode && !seen.has(parentCode)) {
    seen.add(parentCode);
    depth += 1;
    parentCode = rowByCode.get(parentCode)?.parent_code;
  }

  return depth;
}

function phaseCodeForRow(row, rowByCode, rootCode) {
  if (!rootCode || row.code === rootCode) return "";
  let current = row;
  const seen = new Set([row.code]);

  while (current?.parent_code && !seen.has(current.parent_code)) {
    if (current.parent_code === rootCode) return current.code;
    seen.add(current.parent_code);
    current = rowByCode.get(current.parent_code);
  }

  return "";
}

function rowSearchText(row) {
  return [
    row.code,
    row.parent_code,
    row.name,
    row.subject,
    row.item_type,
    row.owner,
    row.weight,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();
}

function filteredProjectPlanRows() {
  const rows = projectPlanRows();
  const rowByCode = projectRowMap(rows);
  const rootCode = projectRootCode(rows);
  const query = state.projectWbsSearch.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesSearch = !query || rowSearchText(row).includes(query);
    const matchesType = !state.projectTypeFilter || row.item_type === state.projectTypeFilter;
    const matchesPhase = !state.projectPhaseFilter
      || row.code === state.projectPhaseFilter
      || phaseCodeForRow(row, rowByCode, rootCode) === state.projectPhaseFilter;
    return matchesSearch && matchesType && matchesPhase;
  });
}

function resetProjectPlanFilters() {
  state.projectWbsSearch = "";
  state.projectPhaseFilter = "";
  state.projectTypeFilter = "";
}

function renderProjectPlanFilters() {
  const rows = projectPlanRows();
  const rootCode = projectRootCode(rows);
  const phases = rows.filter((row) => row.parent_code === rootCode);
  const types = [...new Set(rows.map((row) => row.item_type).filter(Boolean))];

  if (!phases.some((phase) => phase.code === state.projectPhaseFilter)) {
    state.projectPhaseFilter = "";
  }
  if (!types.includes(state.projectTypeFilter)) {
    state.projectTypeFilter = "";
  }

  const searchInput = document.querySelector("#projectWbsSearchInput");
  searchInput.value = state.projectWbsSearch;
  searchInput.disabled = !rows.length;

  const phaseFilter = document.querySelector("#projectPhaseFilter");
  phaseFilter.innerHTML = [
    '<option value="">전체 단계</option>',
    ...phases.map((phase) => `<option value="${escapeHtml(phase.code)}">${escapeHtml(phase.name)}</option>`),
  ].join("");
  phaseFilter.value = state.projectPhaseFilter;
  phaseFilter.disabled = !rows.length;

  const typeFilter = document.querySelector("#projectTypeFilter");
  typeFilter.innerHTML = [
    '<option value="">전체 유형</option>',
    ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`),
  ].join("");
  typeFilter.value = state.projectTypeFilter;
  typeFilter.disabled = !rows.length;
}

function renderProjects() {
  const rows = state.apiConnected ? state.projects : state.projects.length ? state.projects : fallbackProjects;
  document.querySelector("#projectRows").innerHTML = rows.length
    ? rows
        .map((project) => {
          const canRequestApproval = project.id && ["Draft", "Rejected"].includes(project.status);
          const isSelected = project.id && project.id === state.selectedProjectId;
          const approvalActionLabel = project.status === "Approved"
            ? "승인 완료"
            : canRequestApproval
              ? "자동 승인"
              : "승인 대기";
          return `
        <tr class="${isSelected ? "selected-row" : ""}">
          <td>${escapeHtml(project.name)}</td>
          <td>${escapeHtml(project.owner)}</td>
          <td><span class="status-pill ${statusClass(project.status)}">${project.status}</span></td>
          <td>${escapeHtml(project.template_key)}</td>
          <td>${escapeHtml(project.start_date)}</td>
          <td>
            <div class="table-actions">
              <button
                class="table-action"
                type="button"
                data-project-action="plan"
                data-project-id="${project.id || ""}"
                ${project.id ? "" : "disabled"}
              >
                계획
              </button>
              <button
                class="table-action"
                type="button"
                data-project-action="approval"
                data-project-id="${project.id || ""}"
                ${canRequestApproval ? "" : "disabled"}
              >
                ${approvalActionLabel}
              </button>
            </div>
          </td>
        </tr>
      `;
        })
        .join("")
    : `
      <tr class="empty-row">
        <td colspan="6">등록된 프로젝트 없음</td>
      </tr>
    `;
}

function renderProjectPlan() {
  const plan = state.projectPlan;
  const project = plan?.project;
  document.querySelector("#projectDetailTitle").textContent = project?.name || "프로젝트 계획";
  const status = document.querySelector("#projectDetailStatus");
  status.textContent = project?.status || "Select";
  status.className = `status-pill ${project ? statusClass(project.status) : "attention"}`;
  document.querySelector("#projectDetailTemplate").textContent = plan?.template?.name || "-";
  document.querySelector("#projectDetailRows").textContent = plan?.summary
    ? `${plan.summary.pending_work_packages}/${plan.summary.total_rows} pending`
    : "-";
  document.querySelector("#projectDetailSync").textContent = plan?.openproject?.project_already_synced
    ? `Synced #${plan.openproject.project_id}`
    : plan
      ? "Not synced"
      : "-";
  document.querySelector("#projectDetailBaseline").textContent = plan ? baselineText(plan.baseline) : "-";

  renderProjectPlanFilters();

  const allRows = projectPlanRows();
  const rows = filteredProjectPlanRows();
  const rowByCode = projectRowMap(allRows);
  const isFiltered = Boolean(state.projectWbsSearch || state.projectPhaseFilter || state.projectTypeFilter);
  document.querySelector("#projectPlanRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => {
            const depth = Math.max(0, rowDepth(row, rowByCode) - 1);
            return `
            <tr>
              <td>${escapeHtml(row.code)}</td>
              <td>
                <span class="wbs-subject" style="--depth: ${depth}">${escapeHtml(row.name || row.subject)}</span>
              </td>
              <td>${escapeHtml(row.item_type)}</td>
              <td>${escapeHtml(row.owner || "-")}</td>
              <td>${row.weight ?? "-"}</td>
              <td><span class="sync-dot ${row.already_synced ? "stable" : "attention"}"></span>${row.already_synced ? "Synced" : "Pending"}</td>
            </tr>
          `;
          },
        )
        .join("")
    : `
      <tr class="empty-row">
        <td colspan="6">${isFiltered ? "조건에 맞는 WBS 항목 없음" : "프로젝트 행의 계획 버튼을 선택하세요"}</td>
      </tr>
    `;
}

function renderApprovals() {
  const approvalStatus = document.querySelector("#approvalStatus");
  const pendingCount = state.approvals.filter((approval) => approval.status === "Pending").length;
  approvalStatus.textContent = pendingCount ? `${pendingCount} Pending` : "Auto";
  approvalStatus.className = `status-pill ${pendingCount ? "attention" : "stable"}`;

  const rows = state.approvals.length ? state.approvals : fallbackApprovals;
  document.querySelector("#approvalList").innerHTML = rows
    .slice(0, 5)
    .map((approval) => {
      const isPending = approval.status === "Pending" && approval.id;
      return `
        <article class="approval-item">
          <div>
            <strong>${approval.title}</strong>
            <span>${approval.project_name} · ${approval.request_type}</span>
          </div>
          <div class="approval-meta">
            <span class="status-pill ${statusClass(approval.status)}">${approval.status}</span>
            <small>${approval.requester || "PMO"} → ${approval.reviewer || "PMO Lead"}</small>
            <small>${approval.decision_comment || approval.due_date || "자동 처리"}</small>
          </div>
          <div class="approval-actions">
            <button class="secondary-button" type="button" data-approval-action="reject" data-approval-id="${approval.id || ""}" ${isPending ? "" : "disabled"}>반려</button>
            <button class="primary-button" type="button" data-approval-action="approve" data-approval-id="${approval.id || ""}" ${isPending ? "" : "disabled"}>승인</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderImportPreview() {
  const rows = state.importPreview.slice(0, 8);
  document.querySelector("#importPreviewRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.code || "")}</td>
              <td>${escapeHtml(row.parent_code || "")}</td>
              <td>${escapeHtml(row.name || "")}</td>
              <td>${escapeHtml(row.weight ?? "")}</td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr>
        <td colspan="4">업로드 대기</td>
      </tr>
    `;
}

function renderApplyButton() {
  const applyButton = document.querySelector("#applyImportButton");
  applyButton.disabled = !state.pendingImportJobId;
}

function upsertImportJob(job) {
  if (!job?.id) return;
  state.importJobs = [
    job,
    ...state.importJobs.filter((item) => item.id !== job.id),
  ].slice(0, 8);
}

function importJobSubline(job) {
  const template = job.template_name || job.template_key || "Validation";
  const createdAt = formatTimestamp(job.applied_at || job.created_at);
  return `${template} · ${createdAt}`;
}

function renderImportHistory() {
  document.querySelector("#importHistoryCount").textContent = state.importJobs.length;
  document.querySelector("#importHistoryList").innerHTML = state.importJobs.length
    ? state.importJobs
        .map((job) => {
          const selected = job.id === state.selectedImportJobId;
          const rowCount = job.preview_count ?? job.total_rows ?? 0;
          return `
            <button
              class="import-job ${selected ? "selected-import-job" : ""}"
              type="button"
              data-import-job-id="${escapeHtml(job.id)}"
            >
              <span>
                <strong>${escapeHtml(job.source_file || "Excel import")}</strong>
                <small>${escapeHtml(importJobSubline(job))}</small>
              </span>
              <span class="import-job-meta">
                <span class="status-pill ${statusClass(job.status)}">${escapeHtml(job.status)}</span>
                <small>${escapeHtml(job.accepted_rows ?? 0)}/${escapeHtml(rowCount)} rows</small>
              </span>
            </button>
          `;
        })
        .join("")
    : `
      <article class="import-job empty-import-job">
        <span>
          <strong>No imports</strong>
          <small>업로드 이력 없음</small>
        </span>
      </article>
    `;
}

function renderProjectTemplateSelect(preserveSelection = true) {
  const selector = document.querySelector("#projectTemplateSelect");
  const selectedValue = preserveSelection && selector.value ? selector.value : defaultTemplateKey();
  selector.innerHTML = state.templates
    .map((template) => `<option value="${template.key}">${escapeHtml(template.name)}</option>`)
    .join("");
  selector.value = state.templates.some((template) => template.key === selectedValue)
    ? selectedValue
    : defaultTemplateKey();
}

function renderSyncProjectSelect() {
  const selector = document.querySelector("#syncProjectSelect");
  const projects = state.projects.filter((project) => project.id);
  const selectedValue = state.userSelectedSyncProject && selector.value ? selector.value : projects[0]?.id || "";

  selector.innerHTML = projects.length
    ? projects
        .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
        .join("")
    : '<option value="">프로젝트 없음</option>';
  selector.value = projects.some((project) => project.id === selectedValue) ? selectedValue : projects[0]?.id || "";
  selector.disabled = !projects.length;

  const hasProject = Boolean(selector.value);
  const canActualSync = hasProject && Boolean(state.pmPreflight?.ready_for_actual_sync);
  document.querySelector("#syncPreflightButton").disabled = !hasProject;
  document.querySelector("#syncDryRunButton").disabled = !hasProject;
  document.querySelector("#syncRunButton").disabled = !canActualSync;
  document.querySelector("#syncRunButton").title = canActualSync
    ? "Create or update work packages in OpenProject"
    : "Actual sync is enabled only after OpenProject preflight is ready";
}

function selectedSyncProjectId() {
  return document.querySelector("#syncProjectSelect").value;
}

function renderSyncPanel() {
  const preflight = state.pmPreflight || fallbackPreflight;
  const stateValue = preflight.state || "dry_run_only";
  const status = document.querySelector("#syncEngineStatus");
  status.textContent = syncStateLabel(stateValue);
  status.className = `status-pill ${syncStateClass(stateValue)}`;

  const engine = preflight.engine || {};
  document.querySelector("#syncMode").textContent = `${engine.adapter || "openproject"} · ${
    engine.enabled ? "enabled" : "disabled"
  }`;
  document.querySelector("#syncState").textContent = preflight.ready_for_actual_sync ? "Actual sync ready" : "Safe dry-run mode";

  const summary = state.syncDetail?.summary;
  const rowSummary = summary?.pending_work_packages !== undefined
    ? `${summary.pending_work_packages}/${summary.total_rows ?? 0} pending`
    : summary?.created_work_packages !== undefined
      ? `${summary.created_work_packages} created / ${summary.total_rows ?? 0}`
      : "-";
  document.querySelector("#syncPendingRows").textContent = rowSummary;

  const checks = preflight.checks?.length ? preflight.checks : fallbackPreflight.checks;
  document.querySelector("#syncChecks").innerHTML = state.syncDetail?.error
    ? `
      <article class="sync-check">
        <div>
          <strong>sync_request</strong>
          <small>${escapeHtml(state.syncDetail.error)}</small>
        </div>
        <span class="status-pill critical">Error</span>
      </article>
    `
    : checks
        .slice(0, 4)
        .map((check) => {
          const checkClass = check.status === "pass" ? "stable" : check.status === "fail" ? "critical" : "attention";
          return `
            <article class="sync-check">
              <div>
                <strong>${escapeHtml(check.name)}</strong>
                <small>${escapeHtml(check.message || check.path || check.status)}</small>
              </div>
              <span class="status-pill ${checkClass}">${escapeHtml(check.status || "watch")}</span>
            </article>
          `;
        })
        .join("");

  const payload = state.syncDetail?.payload_sample?.payload;
  const preview = payload
    ? JSON.stringify(payload, null, 2)
    : state.syncDetail?.status
      ? `${state.syncDetail.status}: ${summary?.total_rows ?? 0} planned rows`
      : "샘플 payload 대기";
  document.querySelector("#syncPayloadPreview").textContent = preview;
}

function renderSyncRuns() {
  document.querySelector("#syncRunCount").textContent = state.syncRuns.length;
  document.querySelector("#syncRunList").innerHTML = state.syncRuns.length
    ? state.syncRuns
        .map((run) => {
          const countText = run.status === "Synced"
            ? `${run.created_work_packages || 0} created`
            : `${run.pending_work_packages || 0}/${run.total_rows || 0} pending`;
          return `
            <article class="sync-run">
              <div>
                <strong>${escapeHtml(run.status)}</strong>
                <small>${escapeHtml(run.mode)} · ${formatTimestamp(run.completed_at || run.started_at)}</small>
              </div>
              <span class="status-pill ${statusClass(run.status)}">${escapeHtml(countText)}</span>
            </article>
          `;
        })
        .join("")
    : `
      <article class="sync-run empty-run">
        <div>
          <strong>No runs</strong>
          <small>실행 이력 없음</small>
        </div>
      </article>
    `;
}

function renderOperationsPanel() {
  const health = state.operationsHealth || fallbackOperationsHealth;
  const status = document.querySelector("#operationsStatus");
  status.textContent = operationStatusLabel(health.status);
  status.className = `status-pill ${operationStatusClass(health.status)}`;

  const checks = health.checks?.length ? health.checks : fallbackOperationsHealth.checks;
  document.querySelector("#operationsChecks").innerHTML = checks
    .map(
      (check) => `
        <article class="operation-check">
          <label>
            <input type="checkbox" disabled ${check.status === "pass" ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(check.label)}</strong>
              <small>${escapeHtml(check.message)}</small>
            </span>
          </label>
          <span class="status-pill ${operationStatusClass(check.status)}">${operationStatusLabel(check.status)}</span>
        </article>
      `,
    )
    .join("");
}

function roleOptions(selectedRole) {
  return ["admin", "pmo", "viewer"]
    .map((role) => `<option value="${role}" ${role === selectedRole ? "selected" : ""}>${role}</option>`)
    .join("");
}

function statusOptions(selectedStatus) {
  return ["Active", "Suspended"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${status}</option>`)
    .join("");
}

function renderUsersPanel() {
  const panel = document.querySelector("#users");
  if (!panel) return;
  document.querySelector("#userCount").textContent = state.users.length;
  document.querySelector("#userRows").innerHTML = state.users.length
    ? state.users
        .map(
          (user) => `
            <tr data-user-id="${escapeHtml(user.id)}">
              <td>
                <strong>${escapeHtml(user.display_name)}</strong>
                <small>${escapeHtml(user.email)}</small>
              </td>
              <td>
                <select data-user-field="role" aria-label="Role for ${escapeHtml(user.email)}">
                  ${roleOptions(user.role)}
                </select>
              </td>
              <td>
                <select data-user-field="status" aria-label="Status for ${escapeHtml(user.email)}">
                  ${statusOptions(user.status)}
                </select>
              </td>
              <td>${escapeHtml(user.last_login_at ? formatTimestamp(user.last_login_at) : "-")}</td>
              <td>${escapeHtml(user.active_sessions ?? 0)}</td>
              <td>
                <div class="table-actions">
                  <input data-user-field="password" type="password" minlength="8" placeholder="새 비밀번호" aria-label="New password for ${escapeHtml(user.email)}" />
                  <button class="table-action" type="button" data-user-action="save">저장</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr class="empty-row">
        <td colspan="6">등록된 사용자 없음</td>
      </tr>
    `;
}

function renderAuditPanel() {
  const panel = document.querySelector("#audit");
  if (!panel) return;
  document.querySelector("#auditCount").textContent = state.auditEvents.length;
  document.querySelector("#auditList").innerHTML = state.auditEvents.length
    ? state.auditEvents
        .map(
          (event) => `
            <article class="audit-event">
              <div>
                <strong>${escapeHtml(event.summary)}</strong>
                <small>${escapeHtml(event.event_type)} · ${escapeHtml(event.actor_email || "system")}</small>
              </div>
              <span>${escapeHtml(formatTimestamp(event.created_at))}</span>
            </article>
          `,
        )
        .join("")
    : `
      <article class="audit-event empty-run">
        <div>
          <strong>No audit events</strong>
          <small>감사 이력 없음</small>
        </div>
      </article>
    `;
}

function selectedSetting() {
  const settings = state.settings?.settings || [];
  return settings.find((setting) => setting.key === state.selectedSettingKey) || settings[0] || null;
}

function renderSettingsPanel() {
  const panel = document.querySelector("#settings");
  if (!panel) return;
  const settings = state.settings?.settings || [];
  const selector = document.querySelector("#settingsKeySelect");
  if (!settings.some((setting) => setting.key === state.selectedSettingKey)) {
    state.selectedSettingKey = settings[0]?.key || "pm_engine";
  }
  selector.innerHTML = settings.length
    ? settings.map((setting) => `<option value="${escapeHtml(setting.key)}">${escapeHtml(setting.label)}</option>`).join("")
    : '<option value="">설정 없음</option>';
  selector.value = state.selectedSettingKey;
  selector.disabled = !settings.length;

  const setting = selectedSetting();
  document.querySelector("#settingsCards").innerHTML = settings.length
    ? settings
        .map(
          (item) => `
            <button class="setting-card ${item.key === state.selectedSettingKey ? "selected-setting-card" : ""}" type="button" data-setting-key="${escapeHtml(item.key)}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.category)} · ${escapeHtml(item.key)}</span>
              <small>${escapeHtml(item.description)}</small>
            </button>
          `,
        )
        .join("")
    : `
      <article class="setting-card empty-run">
        <strong>No settings</strong>
        <span>설정 정보 없음</span>
      </article>
    `;

  const engine = state.settings?.pm_engine || state.pmPreflight?.engine || {};
  document.querySelector("#settingsEngineMode").textContent = `${engine.display_name || engine.adapter || "PM Engine"} · ${engine.mode || "adapter"}`;
  document.querySelector("#settingsEngineBoundary").textContent = engine.dependency_boundary || "pm-engine-api";
  document.querySelector("#settingsEngineRuntime").textContent = engine.enabled ? "Actual sync enabled" : "Dry-run protected";
  document.querySelector("#settingsJsonInput").value = setting ? JSON.stringify(setting.value || {}, null, 2) : "{}";
  document.querySelector("#settingsJsonInput").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsSaveButton").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsStatus").textContent = state.settingsStatus;
}

function renderAll() {
  renderAuthState();
  renderMetrics();
  renderTemplates();
  renderTemplateSelect();
  renderProjects();
  renderProjectPlan();
  renderApprovals();
  renderImportPreview();
  renderApplyButton();
  renderImportHistory();
  renderProjectTemplateSelect();
  renderSyncProjectSelect();
  renderSyncPanel();
  renderSyncRuns();
  renderOperationsPanel();
  renderUsersPanel();
  renderAuditPanel();
  renderSettingsPanel();
}

async function loadData() {
  try {
    const [dashboard, templates, projects, approvals, pmPreflight, operationsHealth, importJobs, users, auditEvents, settings] = await Promise.all([
      request("/api/dashboard"),
      request("/api/templates"),
      request("/api/projects"),
      request("/api/approvals"),
      request("/api/pm-engine/preflight"),
      canAccessOperations() ? request("/api/operations/health") : Promise.resolve(restrictedOperationsHealth),
      request("/api/imports?limit=8"),
      canManageUsers() ? request("/api/users") : Promise.resolve([]),
      canViewAudit() ? request("/api/audit-events?limit=30") : Promise.resolve([]),
      canViewSettings() ? request("/api/settings") : Promise.resolve(fallbackSettings),
    ]);

    state.dashboard = dashboard;
    state.templates = templates;
    state.projects = projects;
    state.approvals = approvals;
    state.pmPreflight = pmPreflight;
    state.operationsHealth = operationsHealth;
    state.importJobs = importJobs;
    state.users = users;
    state.auditEvents = auditEvents;
    state.settings = settings;
    state.selectedImportJobId = importJobs.some((job) => job.id === state.selectedImportJobId)
      ? state.selectedImportJobId
      : null;
    state.apiConnected = true;
    state.selectedProjectId = projects.some((project) => project.id === state.selectedProjectId)
      ? state.selectedProjectId
      : projects[0]?.id || null;
    if (state.selectedProjectId) {
      await loadProjectPlan(state.selectedProjectId, { render: false });
    } else {
      state.projectPlan = null;
    }
    const currentSyncProjectId = document.querySelector("#syncProjectSelect")?.value;
    const syncProjectId = state.userSelectedSyncProject && projects.some((project) => project.id === currentSyncProjectId)
      ? currentSyncProjectId
      : projects[0]?.id || null;
    if (syncProjectId) {
      await loadSyncRuns(syncProjectId, { render: false });
    } else {
      state.syncRuns = [];
    }
  } catch (error) {
    state.apiConnected = false;
    state.projects = state.projects.length ? state.projects : fallbackProjects;
    state.dashboard.metrics.projects = state.projects.length;
    state.dashboard.metrics.templates = state.templates.length;
    state.dashboard.metrics.pending_approvals = state.approvals.filter((approval) => approval.status === "Pending").length;
    state.operationsHealth = {
      ...fallbackOperationsHealth,
      status: "critical",
      checks: [{ key: "operations", label: "Operations health", status: "fail", message: error.message }],
    };
    state.syncRuns = [];
    state.importJobs = [];
    state.users = [];
    state.auditEvents = [];
    state.settings = fallbackSettings;
  }

  renderAll();
}

function openProjectDialog() {
  const dialog = document.querySelector("#projectDialog");
  document.querySelector("#projectForm").reset();
  document.querySelector("#projectFormStatus").textContent = "";
  document.querySelector("#projectStartInput").value = new Date().toISOString().slice(0, 10);
  renderProjectTemplateSelect(false);
  dialog.showModal();
  document.querySelector("#projectNameInput").focus();
}

function closeProjectDialog() {
  document.querySelector("#projectDialog").close();
}

async function createProject(event) {
  event.preventDefault();
  const submitButton = document.querySelector("#projectSubmitButton");
  const status = document.querySelector("#projectFormStatus");
  const payload = {
    name: document.querySelector("#projectNameInput").value.trim(),
    template_key: document.querySelector("#projectTemplateSelect").value,
    owner: document.querySelector("#projectOwnerInput").value.trim(),
    start_date: document.querySelector("#projectStartInput").value,
  };

  submitButton.disabled = true;
  status.textContent = "";

  try {
    const project = await request("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.projects = [project, ...state.projects.filter((item) => item.name !== project.name)];
    state.dashboard.metrics.projects += 1;
    state.selectedProjectId = project.id;
    state.userSelectedSyncProject = false;
    document.querySelector("#projectForm").reset();
    closeProjectDialog();
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function createPortalUser(event) {
  event.preventDefault();
  if (!canManageUsers()) return;

  const submitButton = document.querySelector("#userSubmitButton");
  const status = document.querySelector("#userFormStatus");
  const payload = {
    email: document.querySelector("#userEmailInput").value.trim(),
    display_name: document.querySelector("#userNameInput").value.trim(),
    role: document.querySelector("#userRoleInput").value,
    password: document.querySelector("#userPasswordInput").value,
    status: "Active",
  };

  submitButton.disabled = true;
  status.textContent = "";

  try {
    await request("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    document.querySelector("#userCreateForm").reset();
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function updatePortalUser(row) {
  if (!canManageUsers() || !row?.dataset.userId) return;

  const status = document.querySelector("#userFormStatus");
  const passwordInput = row.querySelector('[data-user-field="password"]');
  const payload = {
    role: row.querySelector('[data-user-field="role"]').value,
    status: row.querySelector('[data-user-field="status"]').value,
  };
  if (passwordInput.value) {
    payload.password = passwordInput.value;
  }

  status.textContent = "";
  try {
    await request(`/api/users/${encodeURIComponent(row.dataset.userId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    passwordInput.value = "";
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function loadProjectPlan(projectId, options = {}) {
  if (!projectId) return;
  const shouldRender = options.render !== false;
  if (state.selectedProjectId && state.selectedProjectId !== projectId) {
    resetProjectPlanFilters();
  }
  state.selectedProjectId = projectId;

  try {
    state.projectPlan = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-plan`);
    state.syncDetail = state.syncDetail?.project?.id === projectId ? state.syncDetail : null;
  } catch (error) {
    state.projectPlan = {
      project: state.projects.find((project) => project.id === projectId),
      rows: [],
      summary: null,
      openproject: null,
      error: error.message,
    };
  }

  if (shouldRender) renderAll();
}

async function loadSyncRuns(projectId, options = {}) {
  if (!projectId) {
    state.syncRuns = [];
    return;
  }
  const shouldRender = options.render !== false;

  try {
    state.syncRuns = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-runs?limit=6`);
  } catch (error) {
    state.syncRuns = [
      {
        status: "Error",
        mode: "history",
        total_rows: 0,
        pending_work_packages: 0,
        created_work_packages: 0,
        completed_at: new Date().toISOString(),
        error: { message: error.message },
      },
    ];
  }

  if (shouldRender) renderAll();
}

async function requestProjectApproval(projectId) {
  if (!projectId) return;

  try {
    const approval = await request("/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        requester: "PMO",
        reviewer: "PMO Lead",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        auto_approve_internal: true,
        metadata: {
          source: "wbs-portal",
          approval_scope: "internal",
        },
      }),
    });
    state.approvals = [approval, ...state.approvals.filter((item) => item.id !== approval.id)];
    await loadData();
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  }
}

async function decideApproval(approvalId, action) {
  if (!approvalId) return;

  try {
    const approval = await request(`/api/approvals/${encodeURIComponent(approvalId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({
        reviewer: "PMO Lead",
        comment: action === "approve" ? "Approved from PMO portal" : "Returned for WBS revision",
      }),
    });
    state.approvals = state.approvals.map((item) => (item.id === approval.id ? approval : item));
    await loadData();
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  }
}

async function loadImportJob(jobId) {
  if (!jobId) return;

  try {
    const result = await request(`/api/imports/${encodeURIComponent(jobId)}`);
    renderImportResult(result);
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  }
}

function selectedTemplate() {
  const selectedKey = document.querySelector("#templateSelect").value;
  return state.templates.find((template) => template.key === selectedKey) || state.templates[0] || fallbackTemplates[0];
}

function renderImportResult(result) {
  state.pendingImportJobId = result.status === "Preview" && result.id ? result.id : null;
  state.selectedImportJobId = result.id || null;
  upsertImportJob(result);
  document.querySelector("#importStatus").textContent = result.status;
  document.querySelector("#importStatus").className = `status-pill ${statusClass(result.status)}`;
  document.querySelector("#acceptedRows").textContent = result.accepted_rows;
  document.querySelector("#rejectedRows").textContent = result.rejected_rows;

  const issues = [...(result.errors || []), ...(result.warnings || [])];
  document.querySelector("#importIssues").innerHTML = issues.length
    ? issues.map((issue) => `<li>${issue.message}</li>`).join("")
    : "<li>계층, 일정, 가중치 검증 통과</li>";

  state.importPreview = result.rows || [];
  renderImportPreview();
  renderApplyButton();
  renderImportHistory();
}

function downloadTemplateExcel() {
  const template = selectedTemplate();
  window.location.href = `${API_BASE}/api/templates/${encodeURIComponent(template.key)}/excel`;
}

async function renumberTemplateCodes() {
  const template = selectedTemplate();
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "Running";
  document.querySelector("#importStatus").className = "status-pill attention";

  try {
    const result = await request(`/api/templates/${encodeURIComponent(template.key)}/codes/resequence`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    renderImportResult({
      status: result.status,
      accepted_rows: result.rows?.length || 0,
      rejected_rows: 0,
      errors: [],
      warnings: [
        {
          message: `WBS code resequence completed: ${result.changed_rows} rows changed`,
        },
      ],
      rows: result.rows || [],
    });
    await loadData();
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  }
}

async function uploadTemplateExcel(event) {
  const [file] = event.target.files;
  if (!file) return;

  const template = selectedTemplate();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("template_key", template.key);
  formData.append("template_name", template.name);
  formData.append("project_type", template.project_type);
  formData.append("description", template.description);

  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "Running";
  document.querySelector("#importStatus").className = "status-pill attention";

  try {
    const result = await request("/api/templates/import/preview", {
      method: "POST",
      body: formData,
    });
    renderImportResult(result);
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  } finally {
    event.target.value = "";
  }
}

async function applyImportPreview() {
  if (!state.pendingImportJobId) return;

  const jobId = state.pendingImportJobId;
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "Running";
  document.querySelector("#importStatus").className = "status-pill attention";

  try {
    const result = await request(`/api/imports/${encodeURIComponent(jobId)}/apply`, {
      method: "POST",
    });
    renderImportResult(result);
    await loadData();
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  }
}

async function refreshEnginePreflight() {
  try {
    state.pmPreflight = await request("/api/pm-engine/preflight");
    state.syncDetail = null;
    if (canViewSettings()) {
      state.settings = await request("/api/settings");
    }
  } catch (error) {
    state.pmPreflight = {
      ...fallbackPreflight,
      state: "offline",
      checks: [{ name: "pm_engine", status: "fail", message: error.message }],
    };
    state.syncDetail = null;
  }

  renderAll();
}

async function saveSelectedSetting() {
  if (!canManageUsers()) return;
  const setting = selectedSetting();
  const status = document.querySelector("#settingsStatus");
  if (!setting) return;

  let value;
  try {
    value = JSON.parse(document.querySelector("#settingsJsonInput").value || "{}");
  } catch (error) {
    status.textContent = "JSON 형식을 확인하세요";
    return;
  }

  document.querySelector("#settingsSaveButton").disabled = true;
  state.settingsStatus = "";
  try {
    const result = await request(`/api/settings/${encodeURIComponent(setting.key)}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    state.settings = await request("/api/settings");
    if (result.pm_engine) {
      state.pmPreflight = {
        ...state.pmPreflight,
        engine: result.pm_engine,
      };
    }
    state.settingsStatus = "저장되었습니다";
    await loadData();
  } catch (error) {
    state.settingsStatus = error.message;
  } finally {
    document.querySelector("#settingsSaveButton").disabled = false;
    renderAll();
  }
}

async function loadProjectSyncPreflight() {
  const projectId = selectedSyncProjectId();
  if (!projectId) return;

  document.querySelector("#syncEngineStatus").textContent = "Checking";
  document.querySelector("#syncEngineStatus").className = "status-pill attention";

  try {
    const detail = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-preflight`);
    state.pmPreflight = detail.preflight || state.pmPreflight;
    state.syncDetail = detail;
  } catch (error) {
    state.syncDetail = { error: error.message };
  }

  renderAll();
}

async function dryRunProjectSync() {
  const projectId = selectedSyncProjectId();
  if (!projectId) return;

  document.querySelector("#syncEngineStatus").textContent = "Dry-run";
  document.querySelector("#syncEngineStatus").className = "status-pill attention";

  try {
    state.syncDetail = await request(`/api/projects/${encodeURIComponent(projectId)}/sync`, {
      method: "POST",
      body: JSON.stringify({
        dry_run: true,
        create_work_packages: true,
        validate_payloads: true,
        actor: "PMO",
      }),
    });
    await loadSyncRuns(projectId, { render: false });
  } catch (error) {
    state.syncDetail = { error: error.message };
  }

  renderAll();
}

async function runProjectSync() {
  const projectId = selectedSyncProjectId();
  if (!projectId || !state.pmPreflight?.ready_for_actual_sync) return;

  document.querySelector("#syncEngineStatus").textContent = "Syncing";
  document.querySelector("#syncEngineStatus").className = "status-pill attention";
  document.querySelector("#syncRunButton").disabled = true;

  try {
    state.syncDetail = await request(`/api/projects/${encodeURIComponent(projectId)}/sync`, {
      method: "POST",
      body: JSON.stringify({
        dry_run: false,
        create_work_packages: true,
        validate_payloads: true,
        actor: "PMO",
      }),
    });
    await loadSyncRuns(projectId, { render: false });
    await loadData();
  } catch (error) {
    state.syncDetail = { error: error.message };
    renderAll();
  }
}

const navLinks = [...document.querySelectorAll(".nav-list a[href^='#']")];
const viewAliases = {
  admin: "operations",
};
const viewIds = new Set(navLinks.map((link) => link.hash.slice(1)));

function rawViewId(hash = "") {
  return String(hash || "")
    .replace(/^#/, "")
    .trim();
}

function normalizedViewId(hash = "") {
  const rawId = rawViewId(hash);
  const mappedId = viewAliases[rawId] || rawId || "dashboard";
  return viewIds.has(mappedId) ? mappedId : "dashboard";
}

function updateActiveNavigation(viewId = "dashboard") {
  navLinks.forEach((link) => {
    const isActive = normalizedViewId(link.hash) === viewId;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function applyPortalView(hash = "", options = {}) {
  const rawId = rawViewId(hash);
  let viewId = normalizedViewId(hash);
  if (!canAccessView(viewId)) {
    viewId = "dashboard";
  }
  const nextHash = `#${viewId}`;
  document.body.dataset.portalView = viewId;
  updateActiveNavigation(viewId);

  if (viewAliases[rawId] && window.location.hash !== nextHash) {
    window.history.replaceState(null, "", nextHash);
  } else if (options.updateHistory !== false && window.location.hash !== nextHash) {
    window.history.pushState(null, "", nextHash);
  }

  if (options.scrollToTop !== false) {
    window.scrollTo({ top: 0, behavior: options.behavior || "auto" });
  }
}

function clearSession(message = "") {
  state.authToken = null;
  state.currentUser = null;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  document.body.dataset.auth = "login";
  document.querySelector("#loginStatus").textContent = message;
  document.querySelector("#loginPasswordInput").value = "";
  renderAuthState();
}

async function activateSession(session) {
  state.authToken = session.token || state.authToken;
  state.currentUser = session.user;
  if (session.token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  }
  document.querySelector("#loginStatus").textContent = "";
  renderAuthState();
  applyPortalView(window.location.hash || "#dashboard", {
    updateHistory: false,
    scrollToTop: false,
  });
  await loadData();
}

async function restoreSession() {
  if (!state.authToken) {
    clearSession();
    return;
  }

  try {
    const session = await request("/api/auth/me");
    await activateSession(session);
  } catch (error) {
    clearSession("세션이 만료되었습니다");
  }
}

async function loginUser(event) {
  event.preventDefault();
  const submitButton = document.querySelector("#loginSubmitButton");
  const status = document.querySelector("#loginStatus");
  const payload = {
    email: document.querySelector("#loginEmailInput").value.trim(),
    password: document.querySelector("#loginPasswordInput").value,
  };

  submitButton.disabled = true;
  status.textContent = "";
  state.authToken = null;

  try {
    const session = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await activateSession(session);
  } catch (error) {
    clearSession(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function logoutUser() {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch (error) {
    // Local session cleanup is still valid even if the server session expired.
  } finally {
    clearSession();
  }
}

document.querySelector("#refreshButton").addEventListener("click", loadData);
document.querySelector("#loginForm").addEventListener("submit", loginUser);
document.querySelector("#logoutButton").addEventListener("click", logoutUser);
document.querySelector("#createProjectButton").addEventListener("click", openProjectDialog);
document.querySelector("#projectDialogClose").addEventListener("click", closeProjectDialog);
document.querySelector("#projectCancelButton").addEventListener("click", closeProjectDialog);
document.querySelector("#projectForm").addEventListener("submit", createProject);
document.querySelector("#userCreateForm").addEventListener("submit", createPortalUser);
document.querySelector("#downloadTemplateButton").addEventListener("click", downloadTemplateExcel);
document.querySelector("#templateDownloadButton").addEventListener("click", downloadTemplateExcel);
document.querySelector("#renumberButton").addEventListener("click", renumberTemplateCodes);
document.querySelector("#applyImportButton").addEventListener("click", applyImportPreview);
document.querySelector("#syncRefreshButton").addEventListener("click", refreshEnginePreflight);
document.querySelector("#syncPreflightButton").addEventListener("click", loadProjectSyncPreflight);
document.querySelector("#syncDryRunButton").addEventListener("click", dryRunProjectSync);
document.querySelector("#syncRunButton").addEventListener("click", runProjectSync);
document.querySelector("#projectRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-action]");
  if (!button || button.disabled) return;
  if (button.dataset.projectAction === "plan") {
    loadProjectPlan(button.dataset.projectId);
    return;
  }
  requestProjectApproval(button.dataset.projectId);
});
document.querySelector("#approvalList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-approval-action]");
  if (!button || button.disabled) return;
  decideApproval(button.dataset.approvalId, button.dataset.approvalAction);
});
document.querySelector("#userRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-user-action='save']");
  if (!button || button.disabled) return;
  updatePortalUser(button.closest("tr"));
});
document.querySelector(".nav-list").addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#']");
  if (!link) return;
  event.preventDefault();
  applyPortalView(link.hash, { behavior: "smooth" });
});
document.querySelector("#auditRefreshButton").addEventListener("click", loadData);
document.querySelector("#settingsCards").addEventListener("click", (event) => {
  const card = event.target.closest("[data-setting-key]");
  if (!card) return;
  state.selectedSettingKey = card.dataset.settingKey;
  state.settingsStatus = "";
  renderSettingsPanel();
});
document.querySelector("#settingsKeySelect").addEventListener("change", (event) => {
  state.selectedSettingKey = event.target.value;
  state.settingsStatus = "";
  renderSettingsPanel();
});
document.querySelector("#settingsSaveButton").addEventListener("click", saveSelectedSetting);
document.querySelector("#importHistoryList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-import-job-id]");
  if (!button) return;
  loadImportJob(button.dataset.importJobId);
});
document.querySelector("#templateSelect").addEventListener("change", () => {
  state.userSelectedTemplate = true;
});
document.querySelector("#projectWbsSearchInput").addEventListener("input", (event) => {
  state.projectWbsSearch = event.target.value;
  renderProjectPlan();
});
document.querySelector("#projectPhaseFilter").addEventListener("change", (event) => {
  state.projectPhaseFilter = event.target.value;
  renderProjectPlan();
});
document.querySelector("#projectTypeFilter").addEventListener("change", (event) => {
  state.projectTypeFilter = event.target.value;
  renderProjectPlan();
});
document.querySelector("#syncProjectSelect").addEventListener("change", () => {
  state.userSelectedSyncProject = true;
  state.syncDetail = null;
  loadSyncRuns(selectedSyncProjectId());
});
document.querySelector("#excelFileInput").addEventListener("change", uploadTemplateExcel);
window.addEventListener("popstate", () => applyPortalView(window.location.hash, {
  updateHistory: false,
}));

restoreSession();
