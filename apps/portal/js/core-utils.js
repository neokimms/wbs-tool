/* AX WBS 포털 — 공통 request()·escapeHtml·라벨 변환·권한 판정
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

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
    // 세션 만료: 로그아웃 API 자체가 아닌 요청에서 401이 오면 자동 세션 정리
    if (response.status === 401 && !path.includes("/api/auth/")) {
      clearSession("세션이 만료되었습니다. 다시 로그인해 주세요.");
      throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
    }
    let detail = `Request failed: ${response.status}`;
    try {
      const errorBody = await response.json();
      const d = errorBody.detail;
      if (typeof d === "string") detail = d;
      else if (d && Array.isArray(d.errors)) {
        // WBS 검증 실패 등 — 행 번호와 메시지를 읽기 쉽게 표시
        const lines = d.errors.slice(0, 5).map((e) => `${e.row ? `${e.row}행: ` : ""}${e.message}`);
        detail = `${d.message || "검증 실패"} — ${lines.join(" / ")}${d.errors.length > 5 ? ` 외 ${d.errors.length - 5}건` : ""}`;
      } else detail = JSON.stringify(d || detail);
    } catch (error) {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }

  if (response.status === 204) return null;
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

function syncModeLabel(value) {
  const labels = {
    dry_run: "모의 실행",
    actual: "실제 실행",
    history: "이력 조회",
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
    .replace("OpenProject API request failed", "OpenProject API 요청 실패");
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
    "template.resequenced": "WBS 코드 정렬",
  };
  return labels[value] || value || "-";
}

function auditSummaryLabel(value) {
  if (!value) return "-";
  return String(value)
    .replace("PM engine sync", "PM 엔진 동기화")
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
    .replace("WBS codes resequenced:", "WBS 코드 정렬:");
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

/* 프로젝트 단위 역할 — admin(관리자)·pmo·pm은 편집, member·reviewer는 협업, viewer는 열람 */
const PROJECT_ROLE_LABELS = { admin: "프로젝트 관리자", pm: "PM", pmo: "PMO", member: "팀원", reviewer: "검토자", viewer: "열람자" };
const PROJECT_EDIT_ROLES   = ["admin", "pmo", "pm"];
const PROJECT_COLLAB_ROLES = ["admin", "pmo", "pm", "member", "reviewer"];

function projectRoleOf(projectId) {
  if (!projectId) return null;
  if (state.currentUser?.role === "admin") return "admin";
  const p = (state.projects || []).find((x) => String(x.id) === String(projectId));
  return p?.project_role || null;
}

function currentContextProjectId() {
  const view = document.body.dataset.portalView;
  if (view === "workboard") return document.getElementById("workboardProjectSelect")?.value || null;
  if (view === "meetings") return document.getElementById("mtProjectSelect")?.value || null;
  if (view === "project-detail" || view === "projectDetail") return state.projectDetail?.project?.id || null;
  return state.wbsPlanProjectId || null;
}

function canMutateWork(projectId) {
  const user = state.currentUser;
  if (!user) return false;
  if (user.role === "admin") return true;
  const role = projectRoleOf(projectId || currentContextProjectId());
  if (role) return PROJECT_EDIT_ROLES.includes(role);
  return ["admin", "pmo"].includes(user.role);
}

function canCollaborate(projectId) {
  const user = state.currentUser;
  if (!user) return false;
  if (user.role === "admin") return true;
  const role = projectRoleOf(projectId || currentContextProjectId());
  return role ? PROJECT_COLLAB_ROLES.includes(role) : ["admin", "pmo"].includes(user.role);
}

function canViewAudit() {
  return ["admin", "pmo"].includes(state.currentUser?.role);
}

function canViewSettings() {
  return ["admin", "pmo"].includes(state.currentUser?.role);
}


function canAccessView(viewId) {
  // settings: pmo 이상 접근 가능 (sync 메뉴도 settings로 통합)
  if (viewId === "settings") return canViewSettings() || canAccessOperations() || canViewAudit();
  if (viewId === "sync")     return false; // 더 이상 독립 패널 없음 → settings로 리다이렉트
  if (viewId === "operations") return canAccessOperations();
  if (viewId === "users")      return canManageUsers();
  if (viewId === "audit")      return canViewAudit();
  if (viewId === "wbs-plan")   return Boolean(state.currentUser);
  if (viewId === "op-view")    return canAccessOperations();
  if (viewId === "guide")      return Boolean(state.currentUser);
  return true;
}

/* 역할 레벨 */
const ROLE_LEVEL = { viewer: 1, pmo: 2, admin: 3 };
