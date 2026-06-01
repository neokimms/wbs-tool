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

const state = {
  templates: fallbackTemplates,
  projects: fallbackProjects,
  dashboard: {
    metrics: {
      projects: fallbackProjects.length,
      templates: fallbackTemplates.length,
      openproject_sync: "ready",
      database: "PostgreSQL 17",
    },
  },
  importPreview: [],
  pendingImportJobId: null,
  userSelectedTemplate: false,
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

function renderMetrics() {
  document.querySelector("#projectCount").textContent = state.dashboard.metrics.projects;
  document.querySelector("#templateCount").textContent = state.dashboard.metrics.templates;
  document.querySelector("#syncStatus").textContent =
    state.dashboard.metrics.openproject_sync === "ready" ? "Ready" : "Watch";
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
    lowered.includes("updated")
  ) {
    return "stable";
  }
  if (lowered.includes("reject") || lowered.includes("critical")) return "critical";
  return "attention";
}

function renderProjects() {
  const rows = state.projects.length ? state.projects : fallbackProjects;
  document.querySelector("#projectRows").innerHTML = rows
    .map(
      (project) => `
        <tr>
          <td>${project.name}</td>
          <td>${project.owner}</td>
          <td><span class="status-pill ${statusClass(project.status)}">${project.status}</span></td>
          <td>${project.template_key}</td>
          <td>${project.start_date}</td>
        </tr>
      `,
    )
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

function renderAll() {
  renderMetrics();
  renderTemplates();
  renderTemplateSelect();
  renderProjects();
  renderImportPreview();
  renderApplyButton();
}

async function loadData() {
  try {
    const [dashboard, templates, projects] = await Promise.all([
      request("/api/dashboard"),
      request("/api/templates"),
      request("/api/projects"),
    ]);

    state.dashboard = dashboard;
    state.templates = templates;
    state.projects = projects.length ? projects : fallbackProjects;
  } catch (error) {
    state.dashboard.metrics.projects = state.projects.length;
    state.dashboard.metrics.templates = state.templates.length;
  }

  renderAll();
}

async function createProject() {
  const template = state.templates[0] || fallbackTemplates[0];
  const suffix = String(Math.floor(Math.random() * 900) + 100);
  const payload = {
    name: `표준 WBS 프로젝트 ${suffix}`,
    template_key: template.key,
    owner: "PMO",
    start_date: new Date().toISOString().slice(0, 10),
  };

  try {
    const project = await request("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.projects = [project, ...state.projects.filter((item) => item.name !== project.name)];
    state.dashboard.metrics.projects += 1;
  } catch (error) {
    state.projects = [payload, ...state.projects];
    state.dashboard.metrics.projects = state.projects.length;
  }

  renderAll();
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

document.querySelector("#refreshButton").addEventListener("click", loadData);
document.querySelector("#createProjectButton").addEventListener("click", createProject);
document.querySelector("#downloadTemplateButton").addEventListener("click", downloadTemplateExcel);
document.querySelector("#templateDownloadButton").addEventListener("click", downloadTemplateExcel);
document.querySelector("#renumberButton").addEventListener("click", renumberTemplateCodes);
document.querySelector("#applyImportButton").addEventListener("click", applyImportPreview);
document.querySelector("#templateSelect").addEventListener("change", () => {
  state.userSelectedTemplate = true;
});
document.querySelector("#excelFileInput").addEventListener("change", uploadTemplateExcel);

loadData();
