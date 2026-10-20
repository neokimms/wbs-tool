/* AX WBS 포털 — API 주소·폴백 데이터·전역 상태(state)
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

const API_BASE = window.WBS_API_BASE_URL || (() => {
  const h = window.location.hostname;
  if (h.includes("azurecontainerapps.io")) {
    return "https://" + h.replace("wbs-portal", "wbs-api");
  }
  return "http://localhost:8000";
})();
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

const TENANT_ID_KEY = "wbs.portal.tenantId";

const fallbackProjectOperationPolicy = {
  tenant_id: "default",
  default_delivery_mode: "waterfall",
  story_point_mode: "numeric",
  fibonacci_points: [1, 2, 3, 5, 8, 13],
  sprint_length_policy: "custom",
  dod_management: "team",
  default_dod_items: [],
  openproject_sprint_version_sync: false,
  metadata: {},
};

const state = {
  authToken: window.localStorage.getItem(AUTH_TOKEN_KEY),
  currentUser: null,
  templates: fallbackTemplates,
  projects: fallbackProjects,
  approvals: [],
  users: [],
  userGroups: [],
  userRoleFilter: "",
  userStatusFilter: "",
  userGroupFilter: "",
  userSortKey: "email",
  userSortDir: "asc",
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
  userSelectedTemplate: false,
  userSelectedSyncProject: false,
  guideSelectedView: "dashboard",
  portfolioFilter: "all",
  importType: "standard",   // "standard" | "custom"
  settingsTab: "platform",  // 설정 탭
  auditTab: "all",          // 감사 로그 서브탭
  wbsExpanded: {},
  wbsStatusFilter: "",      // 상태 칩 필터
  wbsSelectedCode: null,    // 상세 패널 선택 항목
  opViewProjectId: null,
  opViewTab: "wp",
  opViewRows: [],
  opViewSearch: "",
  opViewTypeFilter: "",
  opViewStatusFilter: "",
  wbsCrList: [],            // 변경 요청 목록 (코드별)
  wbsCrTargetCode: null,    // CR 대상 WBS 코드
  wbsDictTab: "basic",      // 상세 패널 탭 (basic/dict/scope/cr)
  wbsDragCode: null,        // 드래그 중인 WBS 코드
  wbsPlanProjectId: null,
  wbsPlanRows: [],          // 편집 중인 클라이언트 사이드 행
  wbsPlanDirty: false,      // 저장 안 된 변경 있음
  wbsPlanEditCode: null,    // 현재 수정 중인 WBS 코드 (null=신규)
  wbsPlanSearch: "",
  wbsPlanPhaseFilter: "",
  wbsPlanTypeFilter: "",
  risks: [],
  issues: [],
  portfolioOwnerFilter: "",
  riTab: "risks",           // "risks" | "issues"
  riProjectFilter: "",
  riStatusFilter: "",
  riOwnerFilter: "",
  riDetail: null,
  riSortKey: "due_date",
  riSortDir: "asc",
  notifications: [],
  // P3
  projectDetail: null,       // 상세 페이지 데이터
  pdTab: "overview",         // 프로젝트 상세 탭
  pdCrList: [],              // 해당 프로젝트의 CR 목록
  pdDiffData: null,          // WBS diff 결과
  resourceData: null,        // 자원 배분 데이터
  tenants: [],               // 테넌트 목록
  authSettings: null,        // LDAP 설정
  // Notes / 보고서
  noteFolders: [],
  notes: [],
  selectedFolderId: null,
  selectedNoteId: null,
  noteEditor: null,          // TipTap Editor 인스턴스
  noteSavePending: false,
  noteSaveTimer: null,
  /* ── origin/main(6/11) 이식 화면 상태 ── */
  currentTenantId: window.localStorage.getItem(TENANT_ID_KEY) || "default",
  currentTenant: null,
  projectOperationPolicy: fallbackProjectOperationPolicy,
  projectPolicyStatus: "",
  loadDataRunId: 0,
  portfolioSortKey: "name",
  portfolioSortDir: "asc",
  portfolioTab: "list",     // "list" | "cr" — 프로젝트 현황 전사 탭
  portfolioCr: null,        // /api/change-requests 캐시
  portfolioCrFilter: "all", // "all" | "open" | "approved" | "rejected"
  wbsListTab: "standard",   // "standard" | "custom"
  opGanttDrag: null,
  opGanttEditMessage: "",
  opGanttEditStatus: "idle",
  workboardProjectId: null,
  workboardLoadedProjectId: null,
  workboardRows: [],
  myWorkItems: [],
  workboardView: "mine",
  workboardSelectedCode: null,
  workboardLoading: false,
  workboardStatusMessage: "",
  workboardDragKey: null,
  workboardGanttDrag: null,
  agileSprints: [],
  agileItems: [],
  agileMetrics: null,
  agileLoadedProjectId: null,
  agileLoading: false,
  agileSelectedSprintId: "",
  agileDragKey: null,
  announcements: [],        // 공지사항 게시판
  announceFilter: "all",    // "all" | "tenant" | "project"
  announceEditId: null,      // 수정 중인 공지 id (null=신규)
  // P3
  pdMembersList: null,       // 해당 프로젝트의 멤버 목록
  pdMemberCandidates: null,  // 추가 가능한 사용자 후보 목록
  resourceView: "workload",  // workload | accounts | capacity,
};
