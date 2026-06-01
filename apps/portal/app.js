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
      database: "PostgreSQL 16",
    },
  },
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
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
          <span>${template.project_type}</span>
          <p>${template.description}</p>
        </article>
      `,
    )
    .join("");
}

function statusClass(status) {
  const lowered = String(status).toLowerCase();
  if (lowered.includes("done") || lowered.includes("approved")) return "stable";
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

function renderAll() {
  renderMetrics();
  renderTemplates();
  renderProjects();
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

async function validateImport() {
  const sampleRows = [
    {
      code: "1",
      name: "착수",
      weight: 50,
      start_date: "2026-06-01",
      finish_date: "2026-06-05",
    },
    {
      code: "1.1",
      name: "킥오프",
      parent_code: "1",
      weight: 60,
      start_date: "2026-06-01",
      finish_date: "2026-06-02",
    },
    {
      code: "1.2",
      name: "수행계획서",
      parent_code: "1",
      weight: 40,
      start_date: "2026-06-03",
      finish_date: "2026-06-05",
    },
  ];

  let result;
  try {
    result = await request("/api/imports/validate", {
      method: "POST",
      body: JSON.stringify({
        source_file: "sample-wbs.xlsx",
        rows: sampleRows,
      }),
    });
  } catch (error) {
    result = {
      status: "Accepted",
      accepted_rows: sampleRows.length,
      rejected_rows: 0,
      errors: [],
      warnings: [{ message: "API offline: sample validation rendered locally" }],
    };
  }

  document.querySelector("#importStatus").textContent = result.status;
  document.querySelector("#importStatus").className = `status-pill ${statusClass(result.status)}`;
  document.querySelector("#acceptedRows").textContent = result.accepted_rows;
  document.querySelector("#rejectedRows").textContent = result.rejected_rows;

  const issues = [...(result.errors || []), ...(result.warnings || [])];
  document.querySelector("#importIssues").innerHTML = issues.length
    ? issues.map((issue) => `<li>${issue.message}</li>`).join("")
    : "<li>계층, 일정, 가중치 검증 통과</li>";
}

document.querySelector("#refreshButton").addEventListener("click", loadData);
document.querySelector("#createProjectButton").addEventListener("click", createProject);
document.querySelector("#validateButton").addEventListener("click", validateImport);

loadData();
