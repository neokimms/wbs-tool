const API_BASE = window.WBS_API_BASE_URL || "http://localhost:8000";

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
    title: "승인 대기 없음",
    project_name: "프로젝트 승인 요청이 생성되면 표시됩니다",
    request_type: "PMO Queue",
    status: "Approved",
    requester: "System",
    reviewer: "PMO Lead",
    due_date: "Ready",
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

const state = {
  templates: fallbackTemplates,
  projects: fallbackProjects,
  approvals: [],
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
  pendingImportJobId: null,
  pmPreflight: fallbackPreflight,
  syncDetail: null,
  syncRuns: [],
  operationsHealth: fallbackOperationsHealth,
  selectedProjectId: null,
  projectPlan: null,
  userSelectedTemplate: false,
  userSelectedSyncProject: false,
};

async function request(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
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

function renderProjects() {
  const rows = state.apiConnected ? state.projects : state.projects.length ? state.projects : fallbackProjects;
  document.querySelector("#projectRows").innerHTML = rows.length
    ? rows
        .map((project) => {
          const canRequestApproval = project.id && ["Draft", "Rejected"].includes(project.status);
          const isSelected = project.id && project.id === state.selectedProjectId;
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
                승인 요청
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

  const rows = plan?.rows?.slice(0, 8) || [];
  document.querySelector("#projectPlanRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.code)}</td>
              <td>${escapeHtml(row.parent_code || "")}</td>
              <td>${escapeHtml(row.subject || row.name)}</td>
              <td>${escapeHtml(row.item_type)}</td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr class="empty-row">
        <td colspan="4">프로젝트 행의 계획 버튼을 선택하세요</td>
      </tr>
    `;
}

function renderApprovals() {
  const approvalStatus = document.querySelector("#approvalStatus");
  const pendingCount = state.approvals.filter((approval) => approval.status === "Pending").length;
  approvalStatus.textContent = `${pendingCount} Pending`;
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
            <small>${approval.due_date || "No due date"}</small>
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
              <td>${row.code || ""}</td>
              <td>${row.parent_code || ""}</td>
              <td>${row.name || ""}</td>
              <td>${row.weight ?? ""}</td>
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

function renderAll() {
  renderMetrics();
  renderTemplates();
  renderTemplateSelect();
  renderProjects();
  renderProjectPlan();
  renderApprovals();
  renderImportPreview();
  renderApplyButton();
  renderProjectTemplateSelect();
  renderSyncProjectSelect();
  renderSyncPanel();
  renderSyncRuns();
  renderOperationsPanel();
}

async function loadData() {
  try {
    const [dashboard, templates, projects, approvals, pmPreflight, operationsHealth] = await Promise.all([
      request("/api/dashboard"),
      request("/api/templates"),
      request("/api/projects"),
      request("/api/approvals"),
      request("/api/pm-engine/preflight"),
      request("/api/operations/health"),
    ]);

    state.dashboard = dashboard;
    state.templates = templates;
    state.projects = projects;
    state.approvals = approvals;
    state.pmPreflight = pmPreflight;
    state.operationsHealth = operationsHealth;
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

async function loadProjectPlan(projectId, options = {}) {
  if (!projectId) return;
  const shouldRender = options.render !== false;
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
        metadata: {
          source: "wbs-portal",
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

function selectedTemplate() {
  const selectedKey = document.querySelector("#templateSelect").value;
  return state.templates.find((template) => template.key === selectedKey) || state.templates[0] || fallbackTemplates[0];
}

function renderImportResult(result) {
  state.pendingImportJobId = result.status === "Preview" && result.id ? result.id : null;
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

document.querySelector("#refreshButton").addEventListener("click", loadData);
document.querySelector("#createProjectButton").addEventListener("click", openProjectDialog);
document.querySelector("#projectDialogClose").addEventListener("click", closeProjectDialog);
document.querySelector("#projectCancelButton").addEventListener("click", closeProjectDialog);
document.querySelector("#projectForm").addEventListener("submit", createProject);
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
document.querySelector("#templateSelect").addEventListener("change", () => {
  state.userSelectedTemplate = true;
});
document.querySelector("#syncProjectSelect").addEventListener("change", () => {
  state.userSelectedSyncProject = true;
  state.syncDetail = null;
  loadSyncRuns(selectedSyncProjectId());
});
document.querySelector("#excelFileInput").addEventListener("change", uploadTemplateExcel);

loadData();
