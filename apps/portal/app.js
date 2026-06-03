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
    phases: [
      { code: "1", name: "소스 분석", weight: 15 },
      { code: "2", name: "매핑 설계", weight: 15 },
      { code: "3", name: "정제 및 변환", weight: 25 },
      { code: "4", name: "리허설", weight: 20 },
      { code: "5", name: "본이관", weight: 15 },
      { code: "6", name: "검증", weight: 10 },
    ],
  },
  {
    key: "maintenance",
    name: "유지보수 운영 WBS",
    project_type: "Maintenance",
    description: "접수, 영향도 분석, 조치, 검증, 릴리스, 회고 중심의 유지보수 템플릿",
    phases: [
      { code: "1", name: "요청 접수", weight: 10 },
      { code: "2", name: "영향도 분석", weight: 20 },
      { code: "3", name: "조치", weight: 30 },
      { code: "4", name: "검증", weight: 20 },
      { code: "5", name: "릴리스", weight: 15 },
      { code: "6", name: "회고", weight: 5 },
    ],
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
    request_type: "내부 승인",
    status: "Approved",
    requester: "시스템",
    reviewer: "PMO Lead",
    decision_comment: "자동 승인 준비 완료",
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
      label: "운영 상태",
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
      label: "운영 접근 권한",
      status: "warn",
      message: "PMO 또는 admin 권한 필요",
    },
  ],
};

const fallbackSettings = {
  settings: [
    {
      key: "pm_engine",
      label: "PM 엔진 어댑터",
      category: "연계",
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
  importDiffRows: [],
  importJobs: [],
  pendingImportJobId: null,
  pendingProjectImportJobId: null,
  projectImportStatus: "",
  selectedImportJobId: null,
  templateVersions: [],
  pmPreflight: fallbackPreflight,
  syncDetail: null,
  syncRuns: [],
  operationsHealth: fallbackOperationsHealth,
  selectedProjectId: null,
  projectPlan: null,
  projectWbsSearch: "",
  projectPhaseFilter: "",
  projectTypeFilter: "",
  portfolioView: "pmo",
  approvalLimit: 5,
  approvalsHasMore: false,
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
    ready: "준비",
    dry_run_only: "모의 실행",
    auth_failed: "인증 오류",
    offline: "오프라인",
    blocked: "차단",
  };
  return labels[value] || "점검";
}

function syncStateClass(value) {
  if (value === "ready") return "stable";
  if (value === "offline" || value === "auth_failed" || value === "blocked") return "critical";
  return "attention";
}

function operationStatusLabel(value) {
  const labels = {
    pass: "정상",
    warn: "주의",
    fail: "오류",
    stable: "정상",
    watch: "주의",
    critical: "오류",
  };
  return labels[value] || "주의";
}

function statusLabel(status) {
  const labels = {
    Draft: "초안",
    Review: "검토",
    Approved: "승인",
    Rejected: "반려",
    Closed: "종료",
    Synced: "동기화 완료",
    Preview: "미리보기",
    Applied: "반영 완료",
    Accepted: "정상",
    Pending: "대기",
    Locked: "잠김",
    DryRun: "모의 실행",
    Blocked: "차단",
    Error: "오류",
    Preflight: "사전 점검",
    Pulled: "가져오기 완료",
    Queued: "대기",
    Running: "실행 중",
    Updated: "갱신 완료",
  };
  return labels[status] || status || "-";
}

function changeLabel(value) {
  const labels = {
    added: "추가",
    changed: "변경",
    removed: "삭제",
  };
  return labels[value] || value || "-";
}

function fieldLabel(value) {
  const labels = {
    code: "WBS",
    parent_code: "상위",
    name: "작업명",
    item_type: "유형",
    owner: "담당",
    weight: "가중치",
    start_date: "시작일",
    finish_date: "종료일",
    sort_order: "정렬",
    metadata: "메타데이터",
    file: "파일",
    format: "형식",
  };
  return labels[value] || value || "-";
}

function roleLabel(role) {
  const labels = {
    admin: "관리자",
    pmo: "PMO",
    viewer: "조회자",
  };
  return labels[role] || role || "-";
}

function userStatusLabel(status) {
  const labels = {
    Active: "활성",
    Suspended: "중지",
  };
  return labels[status] || status || "-";
}

function projectTypeLabel(value) {
  const labels = {
    "System Integration": "SI 구축",
    "Data Migration": "데이터 이관",
    Maintenance: "유지보수",
    Uploaded: "업로드",
  };
  return labels[value] || value || "-";
}

function itemTypeLabel(value) {
  const labels = {
    Program: "프로그램",
    Project: "프로젝트",
    Phase: "단계",
    Deliverable: "산출물",
    Task: "작업",
    Milestone: "마일스톤",
    Risk: "리스크",
    Issue: "이슈",
    "Change Request": "변경 요청",
  };
  return labels[value] || value || "-";
}

function engineModeLabel(value) {
  const labels = {
    openproject: "OpenProject",
    mock: "모의 엔진",
    "ce-api-adapter": "CE API 어댑터",
    adapter: "어댑터",
  };
  return labels[value] || value || "-";
}

function displayNameLabel(value) {
  if (!value) return "";
  const labels = {
    "Mock PM Engine": "모의 PM 엔진",
  };
  return labels[value] || value;
}

function syncModeLabel(value) {
  const labels = {
    dry_run: "모의 실행",
    actual: "실제 실행",
    history: "이력 조회",
    pull: "가져오기",
  };
  return labels[value] || value || "-";
}

function syncCheckLabel(value) {
  const labels = {
    pm_engine: "PM 엔진",
    pm_engine_adapter: "PM 엔진 어댑터",
    external_api: "외부 API",
    api_root: "API 루트",
    sync_enabled: "동기화 실행 설정",
    api_token: "API 토큰",
    authenticated_user: "인증 사용자",
    sync_request: "동기화 요청",
  };
  return labels[value] || operationCheckLabel(value);
}

function operationCheckLabel(value) {
  const labels = {
    PostgreSQL: "PostgreSQL",
    "Schema migration": "스키마 마이그레이션",
    "WBS template baseline": "WBS 템플릿 기준",
    "Project portfolio": "프로젝트 포트폴리오",
    "PMO approval queue": "PMO 승인 대기열",
    "Excel preview queue": "Excel 미리보기 대기열",
    "OpenProject preflight": "OpenProject 사전 점검",
    "Sync audit trail": "동기화 감사 이력",
    "Baseline lock": "기준선 잠금",
    "Access control": "접근 제어",
    "Settings registry": "설정 레지스트리",
    "Audit log": "감사 로그",
    "Account lockout": "계정 잠금",
    "Template versions": "템플릿 버전",
    "Project WBS storage": "프로젝트 WBS 저장소",
    "CORS policy": "CORS 정책",
    "Backup rehearsal": "백업 리허설",
    "Metrics endpoint": "메트릭 엔드포인트",
    "Operations health": "운영 상태",
    "Operations access": "운영 접근 권한",
  };
  return labels[value] || value || "-";
}

function preflightMessageLabel(value) {
  if (!value) return "-";
  return String(value)
    .replace("Mock PM engine adapter is ready for local product validation", "로컬 제품 검증용 모의 PM 엔진 어댑터 준비 완료")
    .replace("OpenProject API calls are skipped by the mock adapter", "모의 어댑터에서는 OpenProject API 호출 생략")
    .replace("Actual OpenProject sync is enabled", "실제 OpenProject 동기화 실행 허용")
    .replace("Actual OpenProject sync is disabled; dry-run and planning endpoints remain available", "실제 OpenProject 동기화는 비활성화되어 있으며 모의 실행과 계획 기능은 사용 가능")
    .replace("OPENPROJECT_API_TOKEN is configured", "OPENPROJECT_API_TOKEN 설정 완료")
    .replace("OPENPROJECT_API_TOKEN is not configured; actual sync will be blocked", "OPENPROJECT_API_TOKEN 미설정으로 실제 동기화 차단")
    .replace("Skipped because OPENPROJECT_API_TOKEN is not configured", "OPENPROJECT_API_TOKEN 미설정으로 건너뜀")
    .replace("OpenProject endpoint is unreachable", "OpenProject 엔드포인트에 연결할 수 없음")
    .replace("OpenProject endpoint returned an error", "OpenProject 엔드포인트 오류 반환")
    .replace("Endpoint is reachable", "엔드포인트 연결 가능")
    .replace("OpenProject API is unreachable", "OpenProject API에 연결할 수 없음")
    .replace("OpenProject API request failed", "OpenProject API 요청 실패")
    .replace("Project has no known OpenProject work packages to pull", "가져올 OpenProject 작업 패키지가 아직 없습니다")
    .replace("OPENPROJECT_API_TOKEN is required for OpenProject pull sync.", "OpenProject 가져오기에 OPENPROJECT_API_TOKEN이 필요합니다")
    .replace("No known OpenProject work packages could be pulled", "가져올 수 있는 OpenProject 작업 패키지가 없습니다");
}

function operationCheckMessage(value) {
  if (!value) return "-";
  return String(value)
    .replace("Required WBS tables are present", "필수 WBS 테이블이 준비됨")
    .replace("Missing required WBS tables", "필수 WBS 테이블 누락")
    .replace("is reachable", "연결 가능")
    .replace("Metrics endpoint", "메트릭 엔드포인트")
    .replace("Prometheus metrics are exposed at /metrics", "Prometheus 메트릭이 /metrics에서 제공됨")
    .replace("file:// origin is allowed for local development", "로컬 개발용 file:// origin 허용")
    .replace("file:// origin is disabled", "file:// origin 비활성화")
    .replace("Engine state:", "엔진 상태:")
    .replace("No PostgreSQL backup found in", "PostgreSQL 백업 파일 없음:")
    .replace("Latest backup", "최근 백업")
    .replace("old", "경과")
    .replace("pending approvals", "건 승인 대기")
    .replace("imports waiting for apply", "건 반영 대기")
    .replace("sync runs recorded", "건 동기화 이력")
    .replace("locked WBS baselines", "건 WBS 기준선 잠김")
    .replace("portal users configured", "명 포털 사용자 등록")
    .replace("settings registered", "건 설정 등록")
    .replace("audit events recorded", "건 감사 이벤트")
    .replace("users currently locked", "명 계정 잠김")
    .replace("template versions stored", "건 템플릿 버전 저장")
    .replace("project WBS rows stored", "건 프로젝트 WBS 행 저장")
    .replace("projects registered", "건 프로젝트 등록")
    .replace("templates,", "개 템플릿,")
    .replace("template items", "개 템플릿 항목");
}

function settingLabel(value) {
  const labels = {
    "PM Engine Adapter": "PM 엔진 어댑터",
    "Approval Policy": "승인 정책",
    "Portal Access": "포털 접근",
    "Security Policy": "보안 정책",
    "Project Workflow Policy": "프로젝트 워크플로우",
  };
  return labels[value] || value || "-";
}

function settingCategoryLabel(value) {
  const labels = {
    integration: "연계",
    workflow: "워크플로우",
    security: "보안",
  };
  return labels[value] || value || "-";
}

function eventTypeLabel(value) {
  const labels = {
    "pm_engine.sync_recorded": "PM 엔진 동기화",
    "pm_engine.pull_recorded": "PM 엔진 가져오기",
    "auth.login_locked": "로그인 잠금",
    "auth.login_failed": "로그인 실패",
    "auth.login": "로그인",
    "auth.logout": "로그아웃",
    "auth.password_change_failed": "비밀번호 변경 실패",
    "auth.password_changed": "비밀번호 변경",
    "user.created": "사용자 생성",
    "user.updated": "사용자 수정",
    "user.sessions_revoked": "세션 종료",
    "setting.updated": "설정 변경",
    "project.created": "프로젝트 생성",
    "project.status_changed": "프로젝트 상태 변경",
    "approval.created": "승인 생성",
    "approval.approved": "승인 완료",
    "approval.rejected": "승인 반려",
    "import.previewed": "Excel 미리보기",
    "import.created": "Excel 업로드",
    "import.applied": "Excel 반영",
    "project_wbs.import_applied": "프로젝트 WBS 반영",
    "project_wbs.import_previewed": "프로젝트 WBS 미리보기",
    "template.resequenced": "WBS 코드 정렬",
  };
  return labels[value] || value || "-";
}

function auditSummaryLabel(value) {
  if (!value) return "-";
  return String(value)
    .replace("PM engine sync", "PM 엔진 동기화")
    .replace("PM engine pull", "PM 엔진 가져오기")
    .replace("User created:", "사용자 생성:")
    .replace("User updated:", "사용자 수정:")
    .replace("Setting updated:", "설정 변경:")
    .replace("Project created:", "프로젝트 생성:")
    .replace("Project status changed:", "프로젝트 상태 변경:")
    .replace("Approval Pending:", "승인 대기:")
    .replace("Approval Approved:", "승인 완료:")
    .replace("Approval Rejected:", "승인 반려:")
    .replace("Approval approved:", "승인 완료:")
    .replace("Approval rejected:", "승인 반려:")
    .replace("Excel import preview:", "Excel 미리보기:")
    .replace("Excel import accepted:", "Excel 업로드 승인:")
    .replace("Excel import rejected:", "Excel 업로드 반려:")
    .replace("Excel import applied:", "Excel 반영:")
    .replace("Project WBS import applied:", "프로젝트 WBS 반영:")
    .replace("Project WBS import preview:", "프로젝트 WBS 미리보기:")
    .replace("WBS codes resequenced:", "WBS 코드 정렬:");
}

function approvalCommentLabel(value) {
  if (!value) return "";
  return String(value)
    .replace("Auto-approved internal PMO baseline", "내부 PMO 기준선 자동 승인")
    .replace("Approved from PMO portal", "PMO 포털에서 승인")
    .replace("Returned for WBS revision", "WBS 수정 요청");
}

function importIssueMessageLabel(value) {
  if (!value) return "-";
  return String(value)
    .replace("No WBS rows found", "WBS 행을 찾을 수 없습니다")
    .replace("WBS code is required", "WBS 코드가 필요합니다")
    .replace("Duplicate WBS code", "WBS 코드가 중복되었습니다")
    .replace("Task name is required", "작업명이 필요합니다")
    .replace("Weight must be between 0 and 100", "가중치는 0~100 사이여야 합니다")
    .replace("Finish date is earlier than start date", "종료일이 시작일보다 빠릅니다")
    .replace("Parent code does not exist in import file", "상위 코드가 업로드 파일에 없습니다")
    .replace("Circular hierarchy detected", "순환 계층 구조가 발견되었습니다")
    .replace("Sibling weights add up to", "동일 상위 하위 가중치 합계")
    .replace("expected", "기대값")
    .replace("WBS code was generated as", "WBS 코드 자동 생성:")
    .replace("Preview rows are no longer valid", "미리보기 행이 더 이상 유효하지 않습니다")
    .replace("Import rows are no longer valid", "업로드 행이 더 이상 유효하지 않습니다")
    .replace("Import job is not waiting for approval", "업로드 작업이 반영 대기 상태가 아닙니다")
    .replace("Rejected import cannot be applied", "반려된 업로드는 반영할 수 없습니다")
    .replace("Rejected import cannot be applied to project", "반려된 업로드는 프로젝트에 반영할 수 없습니다");
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

function canMutateWork() {
  return ["admin", "pmo"].includes(state.currentUser?.role);
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
    ? `${state.currentUser.display_name} · ${roleLabel(state.currentUser.role)}`
    : "-";

  toggleNavAndPanel("#operations", canAccessOperations());
  toggleNavAndPanel("#users", canManageUsers());
  toggleNavAndPanel("#audit", canViewAudit());
  toggleNavAndPanel("#settings", canViewSettings());
  const canMutate = canMutateWork();
  document.querySelector("#createProjectButton").disabled = !canMutate;
  document.querySelector("#renumberButton").disabled = !canMutate;
  document.querySelector(".file-button").classList.toggle("disabled-control", !canMutate);
  document.querySelector("#excelFileInput").disabled = !canMutate;
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
          <span>${projectTypeLabel(template.project_type)}${template.item_count ? ` · ${template.item_count}개 항목` : ""}</span>
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
  if (!baseline?.locked) return "잠금 전";
  const version = baseline.version ? `v${baseline.version}` : "잠김";
  const rows = baseline.item_count !== undefined ? ` · ${baseline.item_count}행` : "";
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

function isRiskType(value) {
  return ["리스크", "이슈", "변경요청", "Risk", "Issue", "Change Request"].includes(value);
}

function matchesPortfolioView(row) {
  if (state.portfolioView === "risk") return isRiskType(row.item_type);
  if (state.portfolioView === "delivery") return !isRiskType(row.item_type);
  return true;
}

function filteredProjectPlanRows() {
  const rows = projectPlanRows();
  const rowByCode = projectRowMap(rows);
  const rootCode = projectRootCode(rows);
  const query = state.projectWbsSearch.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesSearch = !query || rowSearchText(row).includes(query);
    const matchesType = !state.projectTypeFilter || row.item_type === state.projectTypeFilter;
    const matchesPortfolio = matchesPortfolioView(row);
    const matchesPhase = !state.projectPhaseFilter
      || row.code === state.projectPhaseFilter
      || phaseCodeForRow(row, rowByCode, rootCode) === state.projectPhaseFilter;
    return matchesSearch && matchesType && matchesPortfolio && matchesPhase;
  });
}

function resetProjectPlanFilters() {
  state.projectWbsSearch = "";
  state.projectPhaseFilter = "";
  state.projectTypeFilter = "";
}

function renderPortfolioTabs() {
  document.querySelectorAll("[data-portfolio-tab]").forEach((button) => {
    const selected = button.dataset.portfolioTab === state.portfolioView;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
}

function fallbackTimelinePhases() {
  const project = state.projects.find((item) => item.id === state.selectedProjectId) || state.projects[0];
  const templateKey = project?.template_key || defaultTemplateKey();
  const template = state.templates.find((item) => item.key === templateKey) || state.templates[0] || fallbackTemplates[0];
  return template.phases || fallbackTemplates[0].phases;
}

function projectTimelinePhases() {
  const rows = projectPlanRows();
  if (!rows.length) return fallbackTimelinePhases();
  const rootCode = projectRootCode(rows);
  const phases = rows.filter((row) => row.parent_code === rootCode);
  if (phases.length) return phases;
  return rows.filter((row) => !row.parent_code);
}

function renderProjectTimeline() {
  const timeline = document.querySelector("#projectTimeline");
  const phases = projectTimelinePhases().filter((phase) => phase.name || phase.subject);
  const safePhases = phases.length ? phases : fallbackTemplates[0].phases;
  timeline.style.setProperty(
    "--timeline-columns",
    safePhases.map((phase) => `${Math.max(1, Number(phase.weight) || 1)}fr`).join(" "),
  );
  timeline.innerHTML = safePhases
    .map((phase) => {
      const weight = Math.max(1, Number(phase.weight) || 1);
      return `<div style="--span: ${weight}"><span>${escapeHtml(phase.name || phase.subject)}</span></div>`;
    })
    .join("");
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
    ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(itemTypeLabel(type))}</option>`),
  ].join("");
  typeFilter.value = state.projectTypeFilter;
  typeFilter.disabled = !rows.length;
}

function renderProjectImportControls() {
  const hasProject = Boolean(state.selectedProjectId);
  const canMutate = canMutateWork() && hasProject;
  document.querySelector("#projectWbsDownloadButton").disabled = !hasProject;
  document.querySelector("#projectWbsFileInput").disabled = !canMutate;
  document.querySelector("label[for='projectWbsFileInput']").classList.toggle("disabled-control", !canMutate);
  document.querySelector("#applyProjectImportButton").disabled = !canMutate || !state.pendingProjectImportJobId;
  document.querySelector("#projectImportStatus").textContent = state.projectImportStatus;
}

function renderProjects() {
  const rows = state.apiConnected ? state.projects : state.projects.length ? state.projects : fallbackProjects;
  const canMutate = canMutateWork();
  document.querySelector("#projectRows").innerHTML = rows.length
    ? rows
        .map((project) => {
          const canRequestApproval = canMutate && project.id && ["Draft", "Rejected", "Review"].includes(project.status);
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
          <td><span class="status-pill ${statusClass(project.status)}">${statusLabel(project.status)}</span></td>
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
  status.textContent = project ? statusLabel(project.status) : "선택";
  status.className = `status-pill ${project ? statusClass(project.status) : "attention"}`;
  document.querySelector("#projectDetailTemplate").textContent = plan?.template?.name || "-";
  document.querySelector("#projectDetailRows").textContent = plan?.summary
    ? `${plan.summary.pending_work_packages}/${plan.summary.total_rows} 대기`
    : "-";
  document.querySelector("#projectDetailSync").textContent = plan?.openproject?.project_already_synced
    ? `동기화 완료 #${plan.openproject.project_id}`
    : plan
      ? "미동기화"
      : "-";
  document.querySelector("#projectDetailBaseline").textContent = plan ? baselineText(plan.baseline) : "-";

  renderProjectPlanFilters();

  const allRows = projectPlanRows();
  const rows = filteredProjectPlanRows();
  const rowByCode = projectRowMap(allRows);
  const isFiltered = Boolean(state.projectWbsSearch || state.projectPhaseFilter || state.projectTypeFilter || state.portfolioView !== "pmo");
  const emptyText = state.portfolioView === "risk" && allRows.length
    ? "리스크/이슈 WBS 항목 없음"
    : state.portfolioView === "delivery" && allRows.length
      ? "수행 WBS 항목 없음"
      : isFiltered
        ? "조건에 맞는 WBS 항목 없음"
        : "프로젝트 행의 계획 버튼을 선택하세요";
  document.querySelector("#projectPlanRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => {
            const depth = Math.max(0, rowDepth(row, rowByCode) - 1);
            const pulled = row.metadata?.openproject_pull || {};
            const pulledText = pulled.status
              ? ` · ${escapeHtml(pulled.status)}${pulled.percent_complete !== null && pulled.percent_complete !== undefined ? ` ${escapeHtml(pulled.percent_complete)}%` : ""}`
              : "";
            return `
            <tr>
              <td>${escapeHtml(row.code)}</td>
              <td>
                <span class="wbs-subject" style="--depth: ${depth}">${escapeHtml(row.name || row.subject)}</span>
              </td>
              <td>${escapeHtml(itemTypeLabel(row.item_type))}</td>
              <td>${escapeHtml(row.owner || "-")}</td>
              <td>${row.weight ?? "-"}</td>
              <td><span class="sync-dot ${row.already_synced ? "stable" : "attention"}"></span>${row.already_synced ? "완료" : "대기"}${pulledText}</td>
            </tr>
          `;
          },
        )
        .join("")
    : `
      <tr class="empty-row">
        <td colspan="6">${emptyText}</td>
      </tr>
    `;
}

function renderApprovals() {
  const approvalStatus = document.querySelector("#approvalStatus");
  const pendingCount = state.approvals.filter((approval) => approval.status === "Pending").length;
  approvalStatus.textContent = pendingCount ? `승인 대기 ${pendingCount}건` : "자동";
  approvalStatus.className = `status-pill ${pendingCount ? "attention" : "stable"}`;

  const rows = state.approvals.length ? state.approvals : fallbackApprovals;
  document.querySelector("#approvalList").innerHTML = rows
    .map((approval) => {
      const isPending = canMutateWork() && approval.status === "Pending" && approval.id;
      return `
        <article class="approval-item">
          <div>
            <strong>${approval.title}</strong>
            <span>${approval.project_name} · ${approval.request_type}</span>
          </div>
          <div class="approval-meta">
            <span class="status-pill ${statusClass(approval.status)}">${statusLabel(approval.status)}</span>
            <small>${approval.requester || "PMO"} → ${approval.reviewer || "PMO Lead"}</small>
            <small>${approvalCommentLabel(approval.decision_comment) || approval.due_date || "자동 처리"}</small>
          </div>
          <div class="approval-actions">
            <button class="secondary-button" type="button" data-approval-action="reject" data-approval-id="${approval.id || ""}" ${isPending ? "" : "disabled"}>반려</button>
            <button class="primary-button" type="button" data-approval-action="approve" data-approval-id="${approval.id || ""}" ${isPending ? "" : "disabled"}>승인</button>
          </div>
        </article>
      `;
    })
    .join("");
  const loadMoreButton = document.querySelector("#approvalLoadMoreButton");
  loadMoreButton.hidden = !state.approvalsHasMore;
  loadMoreButton.textContent = `더 보기 (${state.approvalLimit}건 표시 중)`;
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

function renderImportDiff() {
  const rows = state.importDiffRows.slice(0, 8);
  document.querySelector("#importDiffRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td><span class="status-pill ${statusClass(row.change)}">${escapeHtml(changeLabel(row.change))}</span></td>
              <td>${escapeHtml(row.code || "")}</td>
              <td>${escapeHtml(row.name || "")}</td>
              <td>${escapeHtml((row.fields || []).map((field) => fieldLabel(field.field)).join(", ") || "-")}</td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr>
        <td colspan="4">변경 diff 없음</td>
      </tr>
    `;
}

function renderApplyButton() {
  const applyButton = document.querySelector("#applyImportButton");
  applyButton.disabled = !canMutateWork() || !state.pendingImportJobId;
}

function upsertImportJob(job) {
  if (!job?.id) return;
  state.importJobs = [
    job,
    ...state.importJobs.filter((item) => item.id !== job.id),
  ].slice(0, 8);
}

function importJobSubline(job) {
  const template = job.template_name || job.template_key || "검증";
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
                <strong>${escapeHtml(job.source_file || "Excel 업로드")}</strong>
                <small>${escapeHtml(importJobSubline(job))}</small>
              </span>
              <span class="import-job-meta">
                <span class="status-pill ${statusClass(job.status)}">${escapeHtml(statusLabel(job.status))}</span>
                <small>${escapeHtml(job.accepted_rows ?? 0)}/${escapeHtml(rowCount)}행</small>
              </span>
            </button>
          `;
        })
        .join("")
    : `
      <article class="import-job empty-import-job">
        <span>
          <strong>업로드 없음</strong>
          <small>업로드 이력 없음</small>
        </span>
      </article>
    `;
}

function renderTemplateVersions() {
  document.querySelector("#templateVersionCount").textContent = state.templateVersions.length;
  document.querySelector("#templateVersionList").innerHTML = state.templateVersions.length
    ? state.templateVersions
        .map(
          (version) => `
            <article class="sync-run">
              <div>
                <strong>v${escapeHtml(version.version)} · ${escapeHtml(version.template_name)}</strong>
                <small>${escapeHtml(formatTimestamp(version.created_at))} · ${escapeHtml(version.item_count)}행</small>
              </div>
              <span class="status-pill stable">${escapeHtml(projectTypeLabel(version.project_type))}</span>
            </article>
          `,
        )
        .join("")
    : `
      <article class="sync-run empty-run">
        <div>
          <strong>버전 없음</strong>
          <small>버전 이력 없음</small>
        </div>
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
  const canSyncAction = hasProject && canMutateWork();
  const canActualSync = canSyncAction && Boolean(state.pmPreflight?.ready_for_actual_sync);
  document.querySelector("#syncPreflightButton").disabled = !canSyncAction;
  document.querySelector("#syncDryRunButton").disabled = !canSyncAction;
  document.querySelector("#syncPullButton").disabled = !canSyncAction;
  document.querySelector("#syncRunButton").disabled = !canActualSync;
  document.querySelector("#syncRunButton").title = canActualSync
    ? "OpenProject 작업 패키지를 생성하거나 갱신합니다"
    : "OpenProject 사전 점검이 준비된 뒤 실제 동기화가 활성화됩니다";
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
  document.querySelector("#syncMode").textContent = `${engineModeLabel(engine.adapter || "openproject")} · ${
    engine.enabled ? "실행 허용" : "비활성"
  }`;
  document.querySelector("#syncState").textContent = preflight.ready_for_actual_sync ? "실제 동기화 준비" : "안전 모의 실행 모드";

  const summary = state.syncDetail?.summary;
  const rowSummary = summary?.pending_work_packages !== undefined
    ? `${summary.pending_work_packages}/${summary.total_rows ?? 0} 대기`
    : summary?.created_work_packages !== undefined
      ? `${summary.created_work_packages}개 생성 / ${summary.total_rows ?? 0}`
      : "-";
  document.querySelector("#syncPendingRows").textContent = rowSummary;

  const checks = preflight.checks?.length ? preflight.checks : fallbackPreflight.checks;
  document.querySelector("#syncChecks").innerHTML = state.syncDetail?.error
    ? `
      <article class="sync-check">
        <div>
          <strong>동기화 요청</strong>
          <small>${escapeHtml(preflightMessageLabel(state.syncDetail.error))}</small>
        </div>
        <span class="status-pill critical">오류</span>
      </article>
    `
    : checks
        .slice(0, 4)
        .map((check) => {
          const checkClass = check.status === "pass" ? "stable" : check.status === "fail" ? "critical" : "attention";
          return `
            <article class="sync-check">
              <div>
                <strong>${escapeHtml(syncCheckLabel(check.name))}</strong>
                <small>${escapeHtml(preflightMessageLabel(check.message || check.path || check.status))}</small>
              </div>
              <span class="status-pill ${checkClass}">${operationStatusLabel(check.status || "watch")}</span>
            </article>
          `;
        })
        .join("");

  const payload = state.syncDetail?.payload_sample?.payload;
  const preview = payload
    ? JSON.stringify(payload, null, 2)
    : state.syncDetail?.status
      ? `${statusLabel(state.syncDetail.status)}: 계획 행 ${summary?.total_rows ?? 0}개`
      : "샘플 payload 대기";
  document.querySelector("#syncPayloadPreview").textContent = preview;
}

function renderSyncRuns() {
  document.querySelector("#syncRunCount").textContent = state.syncRuns.length;
  document.querySelector("#syncRunList").innerHTML = state.syncRuns.length
    ? state.syncRuns
        .map((run) => {
          const countText = run.status === "Synced"
            ? `${run.created_work_packages || 0}개 생성`
            : run.status === "Pulled"
              ? `${run.synced_work_packages || 0}행 갱신`
            : `${run.pending_work_packages || 0}/${run.total_rows || 0} 대기`;
          return `
            <article class="sync-run">
              <div>
                <strong>${escapeHtml(statusLabel(run.status))}</strong>
                <small>${escapeHtml(syncModeLabel(run.mode))} · ${formatTimestamp(run.completed_at || run.started_at)}</small>
              </div>
              <span class="status-pill ${statusClass(run.status)}">${escapeHtml(countText)}</span>
            </article>
          `;
        })
        .join("")
    : `
      <article class="sync-run empty-run">
        <div>
          <strong>실행 없음</strong>
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
              <strong>${escapeHtml(operationCheckLabel(check.label))}</strong>
              <small>${escapeHtml(operationCheckMessage(check.message))}</small>
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
    .map((role) => `<option value="${role}" ${role === selectedRole ? "selected" : ""}>${roleLabel(role)}</option>`)
    .join("");
}

function statusOptions(selectedStatus) {
  return ["Active", "Suspended"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${userStatusLabel(status)}</option>`)
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
                <small>${user.must_change_password ? "비밀번호 변경 필요" : "비밀번호 정상"}</small>
              </td>
              <td>
                <select data-user-field="role" aria-label="${escapeHtml(user.email)} 역할">
                  ${roleOptions(user.role)}
                </select>
              </td>
              <td>
                <select data-user-field="status" aria-label="${escapeHtml(user.email)} 상태">
                  ${statusOptions(user.status)}
                </select>
              </td>
              <td>${escapeHtml(user.last_login_at ? formatTimestamp(user.last_login_at) : "-")}</td>
              <td>${escapeHtml(user.active_sessions ?? 0)}</td>
              <td>
                <div class="table-actions">
                  <input data-user-field="password" type="password" minlength="8" placeholder="새 비밀번호" aria-label="${escapeHtml(user.email)} 새 비밀번호" />
                  <button class="table-action" type="button" data-user-action="save">저장</button>
                  <button class="table-action" type="button" data-user-action="revoke">세션 종료</button>
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
                <strong>${escapeHtml(auditSummaryLabel(event.summary))}</strong>
                <small>${escapeHtml(eventTypeLabel(event.event_type))} · ${escapeHtml(event.actor_email || "시스템")}</small>
              </div>
              <span>${escapeHtml(formatTimestamp(event.created_at))}</span>
            </article>
          `,
        )
        .join("")
    : `
      <article class="audit-event empty-run">
        <div>
          <strong>감사 이벤트 없음</strong>
          <small>감사 이력 없음</small>
        </div>
      </article>
    `;
}

function selectedSetting() {
  const settings = state.settings?.settings || [];
  return settings.find((setting) => setting.key === state.selectedSettingKey) || settings[0] || null;
}

function pmEngineFormValue(baseValue = {}) {
  const adapter = document.querySelector("#pmEngineAdapterSelect").value || "openproject";
  return {
    ...baseValue,
    adapter,
    display_name: adapter === "mock" ? "Mock PM Engine" : "OpenProject",
    mode: document.querySelector("#pmEngineModeSelect").value || "ce-api-adapter",
    enabled: document.querySelector("#pmEngineEnabledInput").checked,
    dependency_boundary: document.querySelector("#pmEngineBoundaryInput").value.trim() || "pm-engine-api",
    actual_sync_control: baseValue.actual_sync_control || "OPENPROJECT_SYNC_ENABLED",
  };
}

function renderPmEngineForm(setting) {
  const isPmEngine = setting?.key === "pm_engine";
  const form = document.querySelector("#pmEngineForm");
  form.hidden = !isPmEngine;
  if (!isPmEngine) return;

  const value = setting.value || {};
  document.querySelector("#pmEngineAdapterSelect").value = value.adapter || "openproject";
  document.querySelector("#pmEngineModeSelect").value = value.mode || "ce-api-adapter";
  document.querySelector("#pmEngineBoundaryInput").value = value.dependency_boundary || "pm-engine-api";
  document.querySelector("#pmEngineEnabledInput").checked = value.enabled !== false;
  form.querySelectorAll("input, select").forEach((control) => {
    control.disabled = !canManageUsers();
  });
}

function syncPmEngineFormToJson() {
  const setting = selectedSetting();
  if (setting?.key !== "pm_engine") return;
  let baseValue = {};
  try {
    baseValue = JSON.parse(document.querySelector("#settingsJsonInput").value || "{}");
  } catch (error) {
    baseValue = setting.value || {};
  }
  document.querySelector("#settingsJsonInput").value = JSON.stringify(pmEngineFormValue(baseValue), null, 2);
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
    ? settings.map((setting) => `<option value="${escapeHtml(setting.key)}">${escapeHtml(settingLabel(setting.label))}</option>`).join("")
    : '<option value="">설정 없음</option>';
  selector.value = state.selectedSettingKey;
  selector.disabled = !settings.length;

  const setting = selectedSetting();
  document.querySelector("#settingsCards").innerHTML = settings.length
    ? settings
        .map(
          (item) => `
            <button class="setting-card ${item.key === state.selectedSettingKey ? "selected-setting-card" : ""}" type="button" data-setting-key="${escapeHtml(item.key)}">
              <strong>${escapeHtml(settingLabel(item.label))}</strong>
              <span>${escapeHtml(settingCategoryLabel(item.category))} · ${escapeHtml(item.key)}</span>
              <small>${escapeHtml(item.description)}</small>
            </button>
          `,
        )
        .join("")
    : `
      <article class="setting-card empty-run">
        <strong>설정 없음</strong>
        <span>설정 정보 없음</span>
      </article>
    `;

  const engine = state.settings?.pm_engine || state.pmPreflight?.engine || {};
  document.querySelector("#settingsEngineMode").textContent = `${displayNameLabel(engine.display_name) || engineModeLabel(engine.adapter || "openproject")} · ${engineModeLabel(engine.mode || "adapter")}`;
  document.querySelector("#settingsEngineBoundary").textContent = engine.dependency_boundary || "pm-engine-api";
  document.querySelector("#settingsEngineRuntime").textContent = engine.enabled ? "실제 동기화 허용" : "모의 실행 보호";
  document.querySelector("#settingsJsonInput").value = setting ? JSON.stringify(setting.value || {}, null, 2) : "{}";
  renderPmEngineForm(setting);
  document.querySelector("#settingsJsonInput").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsSaveButton").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsStatus").textContent = state.settingsStatus;
}

function renderGuidePanel() {
  const guideContent = document.querySelector("#guideContent");
  if (!guideContent) return;

  if (window.WbsGuideRenderer?.renderGuide && window.WBS_PORTAL_GUIDE_CONTENT) {
    guideContent.innerHTML = window.WbsGuideRenderer.renderGuide(window.WBS_PORTAL_GUIDE_CONTENT);
    return;
  }

  guideContent.innerHTML = `
    <div class="guide-empty">
      <strong>가이드 콘텐츠 로딩 대기</strong>
      <p>가이드 콘텐츠 파일을 불러오면 WBS 포털 사용법이 여기에 표시됩니다.</p>
    </div>
  `;
}

function renderAll() {
  renderAuthState();
  renderMetrics();
  renderGuidePanel();
  renderPortfolioTabs();
  renderProjectTimeline();
  renderTemplates();
  renderTemplateSelect();
  renderProjects();
  renderProjectPlan();
  renderProjectImportControls();
  renderApprovals();
  renderImportPreview();
  renderImportDiff();
  renderApplyButton();
  renderImportHistory();
  renderTemplateVersions();
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
      request(`/api/approvals?limit=${state.approvalLimit + 1}`),
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
    state.approvalsHasMore = approvals.length > state.approvalLimit;
    state.approvals = approvals.slice(0, state.approvalLimit);
    state.pmPreflight = pmPreflight;
    state.operationsHealth = operationsHealth;
    state.importJobs = importJobs;
    state.users = users;
    state.auditEvents = auditEvents;
    state.settings = settings;
    try {
      state.templateVersions = await request(`/api/templates/${encodeURIComponent(defaultTemplateKey())}/versions?limit=8`);
    } catch (error) {
      state.templateVersions = [];
    }
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
      checks: [{ key: "operations", label: "운영 상태", status: "fail", message: error.message }],
    };
    state.approvalsHasMore = false;
    state.syncRuns = [];
    state.importJobs = [];
    state.templateVersions = [];
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

async function revokePortalUserSessions(row) {
  if (!canManageUsers() || !row?.dataset.userId) return;
  const status = document.querySelector("#userFormStatus");
  status.textContent = "";
  try {
    await request(`/api/users/${encodeURIComponent(row.dataset.userId)}/sessions/revoke`, {
      method: "POST",
    });
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
    state.pendingProjectImportJobId = null;
    state.projectImportStatus = "";
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
        comment: action === "approve" ? "PMO 포털에서 승인" : "WBS 수정 요청",
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
    const target = String(result.description || "").startsWith("프로젝트 WBS") ? "project" : "template";
    renderImportResult(result, { target });
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

function renderImportResult(result, options = {}) {
  const target = options.target || "template";
  state.pendingImportJobId = target === "template" && result.status === "Preview" && result.id ? result.id : null;
  state.pendingProjectImportJobId = target === "project" && result.status === "Preview" && result.id ? result.id : null;
  state.selectedImportJobId = result.id || null;
  upsertImportJob(result);
  document.querySelector("#importStatus").textContent = statusLabel(result.status);
  document.querySelector("#importStatus").className = `status-pill ${statusClass(result.status)}`;
  document.querySelector("#acceptedRows").textContent = result.accepted_rows;
  document.querySelector("#rejectedRows").textContent = result.rejected_rows;

  const issues = [...(result.errors || []), ...(result.warnings || [])];
  document.querySelector("#importIssues").innerHTML = issues.length
    ? issues.map((issue) => `<li>${escapeHtml(importIssueMessageLabel(issue.message))}</li>`).join("")
    : "<li>계층, 일정, 가중치 검증 통과</li>";

  state.importPreview = result.rows || [];
  state.importDiffRows = result.diff_rows || [];
  document.querySelector("#importErrorWorkbookButton").disabled = !result.id || !issues.length;
  document.querySelector("#importErrorWorkbookButton").dataset.importJobId = result.id || "";
  renderImportPreview();
  renderImportDiff();
  renderApplyButton();
  renderProjectImportControls();
  renderImportHistory();
}

function downloadTemplateExcel() {
  const template = selectedTemplate();
  window.location.href = `${API_BASE}/api/templates/${encodeURIComponent(template.key)}/excel`;
}

function downloadProjectWbsExcel() {
  if (!state.selectedProjectId) return;
  window.location.href = `${API_BASE}/api/projects/${encodeURIComponent(state.selectedProjectId)}/excel`;
}

function downloadImportErrorsExcel() {
  const jobId = document.querySelector("#importErrorWorkbookButton").dataset.importJobId;
  if (!jobId) return;
  window.location.href = `${API_BASE}/api/imports/${encodeURIComponent(jobId)}/errors.xlsx`;
}

async function renumberTemplateCodes() {
  const template = selectedTemplate();
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "실행 중";
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
          message: `WBS 코드 정렬 완료: ${result.changed_rows}행 변경`,
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
  document.querySelector("#importStatus").textContent = "실행 중";
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

async function uploadProjectWbsExcel(event) {
  const [file] = event.target.files;
  if (!file || !state.selectedProjectId) return;

  const formData = new FormData();
  formData.append("file", file);

  state.pendingProjectImportJobId = null;
  state.projectImportStatus = "프로젝트 WBS 검증 중";
  renderProjectImportControls();

  try {
    const result = await request(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/imports/preview`, {
      method: "POST",
      body: formData,
    });
    state.projectImportStatus = result.status === "Preview"
      ? "미리보기 생성 완료"
      : statusLabel(result.status);
    renderImportResult(result, { target: "project" });
  } catch (error) {
    state.projectImportStatus = error.message;
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    }, { target: "project" });
  } finally {
    event.target.value = "";
  }
}

async function applyImportPreview() {
  if (!state.pendingImportJobId) return;

  const jobId = state.pendingImportJobId;
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "실행 중";
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

async function applyProjectImportPreview() {
  if (!state.pendingProjectImportJobId || !state.selectedProjectId) return;

  const jobId = state.pendingProjectImportJobId;
  state.pendingProjectImportJobId = null;
  state.projectImportStatus = "프로젝트 WBS 반영 중";
  renderProjectImportControls();

  try {
    const result = await request(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/imports/${encodeURIComponent(jobId)}/apply`, {
      method: "POST",
    });
    state.projectImportStatus = `프로젝트 WBS 반영 완료: ${result.summary?.rows ?? 0}행`;
    renderImportResult({
      id: jobId,
      status: result.status,
      accepted_rows: result.summary?.rows ?? result.rows?.length ?? 0,
      rejected_rows: 0,
      errors: [],
      warnings: [],
      rows: result.rows || [],
      diff_rows: result.diff_rows || [],
      source_file: result.import_job?.source_file || "프로젝트 WBS 업로드",
      template_name: result.import_job?.template_name,
      template_key: result.import_job?.template_key,
      created_at: result.import_job?.created_at,
      applied_at: result.import_job?.applied_at,
    }, { target: "project" });
    await loadProjectPlan(state.selectedProjectId, { render: false });
    await loadData();
  } catch (error) {
    state.projectImportStatus = error.message;
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    }, { target: "project" });
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
    if (setting.key === "pm_engine") {
      syncPmEngineFormToJson();
    }
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

  document.querySelector("#syncEngineStatus").textContent = "점검 중";
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

  document.querySelector("#syncEngineStatus").textContent = "모의 실행";
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

async function pullProjectSync() {
  const projectId = selectedSyncProjectId();
  if (!projectId) return;

  document.querySelector("#syncEngineStatus").textContent = "가져오기 중";
  document.querySelector("#syncEngineStatus").className = "status-pill attention";

  try {
    state.syncDetail = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-pull`, {
      method: "POST",
      body: JSON.stringify({
        dry_run: false,
        create_work_packages: false,
        validate_payloads: false,
        actor: "PMO",
      }),
    });
    await loadProjectPlan(projectId, { render: false });
    await loadSyncRuns(projectId, { render: false });
  } catch (error) {
    state.syncDetail = { error: error.message };
  }

  renderAll();
}

async function runProjectSync() {
  const projectId = selectedSyncProjectId();
  if (!projectId || !state.pmPreflight?.ready_for_actual_sync) return;

  document.querySelector("#syncEngineStatus").textContent = "동기화 중";
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

const navLinks = [...document.querySelectorAll(".nav-list a[href^='#'], .nav-guide a[href^='#']")];
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
  if (state.currentUser?.must_change_password) {
    openPasswordDialog(true);
  }
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

function openPasswordDialog(required = false) {
  const dialog = document.querySelector("#passwordDialog");
  document.querySelector("#passwordForm").reset();
  document.querySelector("#passwordFormStatus").textContent = required ? "초기 비밀번호를 변경해야 합니다" : "";
  document.querySelector("#passwordDialogClose").disabled = required;
  document.querySelector("#passwordCancelButton").disabled = required;
  dialog.dataset.required = required ? "true" : "false";
  dialog.showModal();
  document.querySelector("#currentPasswordInput").focus();
}

function closePasswordDialog() {
  const dialog = document.querySelector("#passwordDialog");
  if (dialog.dataset.required === "true") return;
  dialog.close();
}

async function changePassword(event) {
  event.preventDefault();
  const submitButton = document.querySelector("#passwordSubmitButton");
  const status = document.querySelector("#passwordFormStatus");
  const newPassword = document.querySelector("#newPasswordInput").value;
  const confirmPassword = document.querySelector("#confirmPasswordInput").value;
  if (newPassword !== confirmPassword) {
    status.textContent = "새 비밀번호 확인이 일치하지 않습니다";
    return;
  }

  submitButton.disabled = true;
  status.textContent = "";
  try {
    const result = await request("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        current_password: document.querySelector("#currentPasswordInput").value,
        new_password: newPassword,
      }),
    });
    state.currentUser = result.user;
    document.querySelector("#passwordDialog").dataset.required = "false";
    document.querySelector("#passwordDialog").close();
    renderAll();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

document.querySelector("#refreshButton").addEventListener("click", loadData);
document.querySelector("#loginForm").addEventListener("submit", loginUser);
document.querySelector("#logoutButton").addEventListener("click", logoutUser);
document.querySelector("#passwordButton").addEventListener("click", () => openPasswordDialog(false));
document.querySelector("#passwordDialogClose").addEventListener("click", closePasswordDialog);
document.querySelector("#passwordCancelButton").addEventListener("click", closePasswordDialog);
document.querySelector("#passwordForm").addEventListener("submit", changePassword);
document.querySelector("#createProjectButton").addEventListener("click", openProjectDialog);
document.querySelector("#projectDialogClose").addEventListener("click", closeProjectDialog);
document.querySelector("#projectCancelButton").addEventListener("click", closeProjectDialog);
document.querySelector("#projectForm").addEventListener("submit", createProject);
document.querySelector("#userCreateForm").addEventListener("submit", createPortalUser);
document.querySelector("#downloadTemplateButton").addEventListener("click", downloadTemplateExcel);
document.querySelector("#templateDownloadButton").addEventListener("click", downloadTemplateExcel);
document.querySelector("#projectWbsDownloadButton").addEventListener("click", downloadProjectWbsExcel);
document.querySelector("#importErrorWorkbookButton").addEventListener("click", downloadImportErrorsExcel);
document.querySelector("#renumberButton").addEventListener("click", renumberTemplateCodes);
document.querySelector("#applyImportButton").addEventListener("click", applyImportPreview);
document.querySelector("#applyProjectImportButton").addEventListener("click", applyProjectImportPreview);
document.querySelector("#syncRefreshButton").addEventListener("click", refreshEnginePreflight);
document.querySelector("#syncPreflightButton").addEventListener("click", loadProjectSyncPreflight);
document.querySelector("#syncDryRunButton").addEventListener("click", dryRunProjectSync);
document.querySelector("#syncPullButton").addEventListener("click", pullProjectSync);
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
document.querySelector("#approvalLoadMoreButton").addEventListener("click", () => {
  state.approvalLimit += 5;
  loadData();
});
document.querySelector(".segmented").addEventListener("click", (event) => {
  const button = event.target.closest("[data-portfolio-tab]");
  if (!button) return;
  state.portfolioView = button.dataset.portfolioTab;
  renderPortfolioTabs();
  renderProjectPlan();
});
document.querySelector("#userRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-user-action]");
  if (!button || button.disabled) return;
  if (button.dataset.userAction === "revoke") {
    revokePortalUserSessions(button.closest("tr"));
    return;
  }
  updatePortalUser(button.closest("tr"));
});
document.querySelector(".sidebar").addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#']");
  if (!link) return;
  event.preventDefault();
  applyPortalView(link.hash, { behavior: "smooth" });
});
document.querySelector("#guideContent").addEventListener("click", (event) => {
  const link = event.target.closest("[data-guide-anchor]");
  if (!link) return;
  event.preventDefault();
  document.getElementById(`guide-${link.dataset.guideAnchor}`)?.scrollIntoView({
    block: "start",
    behavior: "smooth",
  });
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
document.querySelector("#pmEngineForm").addEventListener("input", syncPmEngineFormToJson);
document.querySelector("#pmEngineForm").addEventListener("change", syncPmEngineFormToJson);
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
document.querySelector("#projectWbsFileInput").addEventListener("change", uploadProjectWbsExcel);
window.addEventListener("popstate", () => applyPortalView(window.location.hash, {
  updateHistory: false,
}));

renderGuidePanel();
restoreSession();
