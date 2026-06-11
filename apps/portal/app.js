const API_BASE = window.WBS_API_BASE_URL || "http://localhost:8000";
const AUTH_TOKEN_KEY = "wbs.portal.authToken";
const TENANT_ID_KEY = "wbs.portal.tenantId";

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
  {
    key: "agile-standard",
    name: "Agile 표준 WBS",
    project_type: "Agile",
    description: "Epic, Story, Sprint, Definition of Done 중심의 Agile WBS 샘플 템플릿",
    phases: [
      { code: "AGL.B", name: "제품 백로그", weight: 20 },
      { code: "AGL.S1", name: "Sprint 1", weight: 35 },
      { code: "AGL.S2", name: "Sprint 2", weight: 35 },
      { code: "AGL.R", name: "릴리스/회고", weight: 10 },
    ],
  },
  {
    key: "hybrid-standard",
    name: "Hybrid 표준 WBS",
    project_type: "Hybrid",
    description: "상위 WBS 기준선과 Sprint 실행 백로그를 연결하는 Hybrid WBS 샘플 템플릿",
    phases: [
      { code: "HYB.1", name: "착수/기준선", weight: 10 },
      { code: "HYB.2", name: "상위 설계/아키텍처", weight: 20 },
      { code: "HYB.3", name: "Agile 실행 트랙", weight: 35 },
      { code: "HYB.4", name: "통합 테스트/전환", weight: 25 },
      { code: "HYB.5", name: "운영 전환/안정화", weight: 10 },
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

const DELIVERY_MODE_LABELS = {
  waterfall: "Waterfall",
  agile: "Agile",
  hybrid: "Hybrid",
};
const DELIVERY_MODE_ORDER = ["waterfall", "agile", "hybrid"];
const DELIVERY_MODE_DESCRIPTIONS = {
  waterfall: "단계형 WBS, 가중치, 일정, 산출물 중심",
  agile: "Backlog, Sprint, Story Point 중심",
  hybrid: "상위 WBS 기준선과 Sprint 실행 연결",
};
const TEMPLATE_KEY_ORDER = ["si-standard", "migration-data", "maintenance", "agile-standard", "hybrid-standard"];
const TEMPLATE_TYPE_ORDER = ["System Integration", "Data Migration", "Maintenance", "Agile", "Hybrid", "Uploaded"];

const AGILE_TYPES = ["Epic", "Story", "Task", "Spike", "Bug"];
const AGILE_STATUSES = ["Backlog", "Ready", "In Progress", "Review", "Done"];
const AGILE_PRIORITIES = ["Must", "Should", "Could", "Wont"];
const AGILE_SPRINT_STATUSES = ["Planning", "Active", "Review", "Retrospective", "Closed"];

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

function createDashboardState(metricOverrides = {}) {
  return {
    metrics: {
      projects: 0,
      templates: fallbackTemplates.length,
      pending_approvals: 0,
      preview_imports: 0,
      risk_count: 0,
      issue_count: 0,
      portfolio_spi: null,
      openproject_sync: "ready",
      database: "PostgreSQL 17",
      ...metricOverrides,
    },
    status_distribution: [],
    latest_projects: [],
    latest_approvals: [],
    project_kpis: [],
    status_heatmap: [],
    risk_hotspots: [],
  };
}

const fallbackDashboard = createDashboardState({ projects: fallbackProjects.length });

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
        portal_enabled: true,
      },
    },
  ],
  pm_engine: fallbackPreflight.engine,
};

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
  currentTenantId: window.localStorage.getItem(TENANT_ID_KEY) || "default",
  currentTenant: null,
  templates: fallbackTemplates,
  projects: fallbackProjects,
  approvals: [],
  users: [],
  auditEvents: [],
  userGroups: [],
  settings: fallbackSettings,
  projectOperationPolicy: fallbackProjectOperationPolicy,
  projectPolicyStatus: "",
  selectedSettingKey: "pm_engine",
  settingsStatus: "",
  apiConnected: false,
  dashboard: createDashboardState({ projects: fallbackProjects.length }),
  loadDataRunId: 0,
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
  portfolioOwnerFilter: "",
  portfolioSortKey: "name",
  portfolioSortDir: "asc",
  portfolioTab: "list",     // "list" | "cr" — 프로젝트 현황 전사 탭
  portfolioCr: null,        // /api/change-requests 캐시
  portfolioCrFilter: "all", // "all" | "open" | "approved" | "rejected"
  importType: "standard",   // "standard" | "custom"
  wbsListTab: "standard",   // "standard" | "custom"
  settingsTab: "platform",  // 설정 탭
  auditTab: "all",          // 감사 로그 서브탭
  wbsExpanded: {},
  wbsStatusFilter: "",
  wbsSelectedCode: null,    // 상세 패널 선택 항목
  opViewProjectId: null,
  opViewTab: "wp",
  opViewRows: [],
  opViewSearch: "",
  opViewTypeFilter: "",
  opViewStatusFilter: "",
  opGanttDrag: null,
  opGanttEditMessage: "",
  opGanttEditStatus: "idle",
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
  risks: [],
  issues: [],
  riTab: "risks",           // "risks" | "issues"
  riProjectFilter: "",
  riStatusFilter: "",
  riOwnerFilter: "",
  riDetail: null,
  riSortKey: "due_date",
  riSortDir: "asc",
  notifications: [],
  announcements: [],        // 공지사항 게시판
  announceFilter: "all",    // "all" | "tenant" | "project"
  announceEditId: null,      // 수정 중인 공지 id (null=신규)
  // P3
  projectDetail: null,       // 상세 페이지 데이터
  pdTab: "overview",         // 프로젝트 상세 탭
  pdCrList: [],              // 해당 프로젝트의 CR 목록
  pdDiffData: null,          // WBS diff 결과
  pdMembersList: null,       // 해당 프로젝트의 멤버 목록
  pdMemberCandidates: null,  // 추가 가능한 사용자 후보 목록
  resourceData: null,        // 자원 배분 데이터
  resourceView: "workload",  // workload | accounts | capacity
  tenants: [],               // 테넌트 목록
  authSettings: null,        // LDAP 설정
  userRoleFilter: "",
  userStatusFilter: "",
  userGroupFilter: "",
  userSortKey: "email",
  userSortDir: "asc",
};

/* ── 사용자 가이드 콘텐츠 정의 ─────────────────────────────────────── */

const WBS_GUIDE_MENUS = [
  { id: "dashboard",     label: "대시보드" },
  { id: "announcements", label: "공지사항" },
  { id: "portfolio",  label: "프로젝트 현황" },
  { id: "op-view",    label: "WBS 현황" },
  { id: "wbs-plan",   label: "WBS 관리" },
  { id: "workboard",  label: "작업 현황" },
  { id: "templates",  label: "표준/일반 WBS 관리" },
  { id: "risks",      label: "리스크·이슈" },
  { id: "resource",   label: "자원 배분" },
  { id: "settings",   label: "설정" },
];

const WBS_GUIDE_CONTENTS = {
  dashboard: {
    kind: "overview",
    hero: {
      eyebrow: "사용자 가이드",
      title: "AX WBS 포털 개요",
      description: "PMO와 프로젝트 팀이 프로젝트, WBS, 작업 현황, 리스크·이슈, 자원 배분, 선택형 외부 연동, 운영 점검을 한 화면에서 관리하는 통합 포털입니다.",
      tags: ["AX WBS", "멀티테넌트", "PMO", "내부 작업 현황"],
    },
    summary: [
      { id: "admin",  label: "관리자(admin)", value: "전체 메뉴", description: "사용자, 테넌트, 플랫폼 설정, LDAP, SMTP, 백업, 모니터링까지 관리합니다.", tone: "good" },
      { id: "pmo",    label: "PMO",           value: "운영 메뉴", description: "프로젝트 생성, WBS 편집, 작업 보드/간트, 승인 요청, 리스크·이슈, 자원 배분을 수행합니다.", tone: "info" },
      { id: "viewer", label: "조회자",        value: "조회 중심", description: "대시보드, 프로젝트/WBS, 표준 WBS, 리스크·이슈 목록을 조회합니다. 편집 작업은 제한됩니다.", tone: "neutral" },
      { id: "tenant", label: "테넌트",        value: "데이터 격리", description: "상단 테넌트 선택을 바꾸면 프로젝트, WBS, 리스크·이슈, 자원 배분 데이터가 해당 테넌트 기준으로 다시 로드됩니다.", tone: "warn" },
    ],
    actions: [
      { id: "go-portfolio", label: "프로젝트 현황",       description: "프로젝트 목록, 테넌트 배지, 리스크/이슈 건수, 승인 요청 상태를 확인합니다.", targetView: "portfolio", tone: "good" },
      { id: "go-workboard", label: "작업 현황",           description: "내 작업, PM용 작업 보드, 내부 WBS 간트에서 상태/진척률/기간을 업데이트합니다.", targetView: "workboard", tone: "good" },
      { id: "go-risks",     label: "리스크·이슈",         description: "대시보드 또는 프로젝트 목록의 숫자 버튼에서 이동한 필터 결과를 확인합니다.", targetView: "risks", tone: "warn" },
      { id: "go-resource",  label: "자원 배분",           description: "WBS 작업 부하, 사용자 계정별 할당, PMO 가동율을 기간 기준으로 조회합니다.", targetView: "resource", tone: "info" },
    ],
    resources: [
      { id: "menu-map",  title: "메뉴 구성", description: "대시보드, 공지사항, 프로젝트 현황, WBS 현황, WBS 관리, 작업 현황, 표준/일반 WBS 관리, 리스크·이슈, 자원 배분, 설정, 사용자 가이드로 구성됩니다.", meta: "현재 메뉴" },
      { id: "widget",    title: "위젯 표시 설정", description: "설정 > 플랫폼 설정 하단의 위젯 표시 설정에서 대시보드 패널과 좌측 메뉴 표시 여부를 함께 조정할 수 있습니다.", meta: "개인화" },
      { id: "theme",     title: "다크모드·모바일", description: "다크/라이트 모드는 시스템 설정을 감지하고 localStorage에 저장됩니다. 모바일에서는 햄버거 드로어와 1열 레이아웃으로 전환됩니다.", meta: "화면 환경" },
      { id: "numbers",   title: "리스크/이슈 숫자", description: "대시보드와 프로젝트 현황의 리스크/이슈 숫자 버튼은 Closed 제외 미종료 건 기준이며, 클릭 시 해당 목록으로 이동합니다.", meta: "빠른 이동" },
    ],
  },

  announcements: {
    kind: "procedure",
    hero: {
      eyebrow: "공지사항",
      title: "전사·프로젝트 공지와 인앱 알림",
      description: "PMO/관리자가 등록한 공지는 SMTP(이메일) 설정과 무관하게 대상 사용자에게 인앱 알림(우측 상단 종 아이콘)으로 즉시 전달됩니다. 전사 공지와 프로젝트별 공지를 구분해 관리합니다.",
      tags: ["전사 공지", "프로젝트 공지", "인앱 알림", "상단 고정"],
    },
    summary: [
      { id: "scope-tenant",  label: "전사 공지",   value: "테넌트 전체",     description: "대상에서 전사공지를 선택하면 테넌트 내 모든 사용자에게 노출되고 알림이 발송됩니다.", tone: "info" },
      { id: "scope-project", label: "프로젝트 공지", value: "해당 프로젝트 멤버", description: "전사공지를 해제하고 프로젝트를 선택하면 해당 프로젝트 멤버에게만 노출·알림됩니다.", tone: "good" },
      { id: "author",        label: "작성 권한",   value: "admin / PMO",     description: "PMO는 소속 테넌트 내 프로젝트라면 멤버가 아니어도 해당 프로젝트의 공지를 작성할 수 있습니다.", tone: "warn" },
      { id: "viewer",        label: "조회",       value: "전체 역할",       description: "조회자를 포함한 모든 역할이 본인에게 해당하는 공지를 목록과 상세 팝업에서 확인할 수 있습니다.", tone: "neutral" },
    ],
    steps: [
      {
        id: "list", order: 1, title: "공지 목록 확인",
        outcome: "상단 필터(전체/전사 공지/프로젝트별)로 공지 목록을 좁혀 봅니다. 상단 고정된 공지가 먼저 표시됩니다.",
        targetView: "announcements", status: "ready",
        checks: ["📌 고정 배지가 있는 공지가 목록 최상단에 표시됩니다", "전사/프로젝트명 배지로 공지 대상을 구분합니다", "작성자·작성일은 제목과 같은 줄 오른쪽에 표시됩니다"],
      },
      {
        id: "detail", order: 2, title: "상세 내용 확인",
        outcome: "목록에서 공지를 클릭하면 상세 팝업에서 전체 내용, 작성자, 작성일을 확인합니다.",
        status: "ready",
        checks: ["작성 권한이 있는 사용자(작성자 본인 또는 admin)에게는 상단 고정 체크박스가 표시됩니다", "팝업 하단에는 취소/수정/삭제 버튼이 있으며 수정·삭제는 권한이 있을 때만 노출됩니다"],
      },
      {
        id: "create", order: 3, title: "새 공지 작성",
        outcome: "새 공지 작성 버튼으로 팝업을 열어 제목·대상·내용을 입력하고 등록합니다.",
        status: "ready",
        checks: ["대상: 전사공지 체크 시 테넌트 전체, 체크 해제 후 프로젝트 선택 시 해당 프로젝트 멤버 대상", "등록 즉시 대상 사용자(작성자 포함)에게 알림 벨로 알림이 도착합니다"],
      },
      {
        id: "manage", order: 4, title: "수정·삭제·고정",
        outcome: "상세 팝업에서 수정 버튼으로 내용을 변경하거나 삭제 버튼으로 공지를 제거합니다.",
        status: "ready",
        checks: ["수정·삭제는 작성자 본인 또는 admin만 가능", "상단 고정 체크박스를 변경하면 목록 정렬에 즉시 반영됩니다"],
      },
    ],
    guardrails: [
      "공지 등록은 SMTP(이메일) 설정과 무관하게 동작하며, 알림은 항상 인앱(종 아이콘)으로 전달됩니다.",
      "프로젝트를 지정하지 않으면 전사 공지, 프로젝트를 지정하면 해당 프로젝트 공지가 됩니다.",
      "수정·삭제·상단 고정 변경 권한은 작성자 본인 또는 admin에게만 있습니다.",
    ],
  },

  portfolio: {
    kind: "procedure",
    hero: {
      eyebrow: "프로젝트 현황",
      title: "프로젝트 등록부터 승인까지",
      description: "PMO 권한으로 프로젝트를 생성하고 WBS를 등록한 뒤 승인을 요청합니다. 목록에서는 테넌트, 상태, 리스크/이슈 건수, 빠른 작업을 함께 확인합니다.",
      tags: ["프로젝트 생성", "테넌트", "리스크/이슈 건수", "승인 요청", "변경요청"],
    },
    steps: [
      {
        id: "create", order: 1, title: "프로젝트 생성",
        outcome: "프로젝트명·담당자·PM·고객사·예산·템플릿·기간·설명을 입력해 초안으로 등록합니다.",
        targetView: "portfolio", status: "ready",
        checks: ["우측 상단 프로젝트 생성 버튼 클릭", "프로젝트 유형(SI 구축/데이터 이관/유지보수) 선택", "종료 예정일·고객사·예산 등 상세 정보 입력 (선택)"],
      },
      {
        id: "detail", order: 2, title: "프로젝트 상세 확인",
        outcome: "프로젝트명 클릭 시 오른쪽 슬라이딩 드로어에서 상세 정보와 승인 이력을 확인합니다.",
        targetView: "portfolio", status: "ready",
        checks: ["프로젝트명(파란색 링크) 클릭", "기본 정보·단계 구성·WBS 현황·리스크·이슈·승인 이력 확인", "빠른 액션: WBS 관리 열기·작업 현황·승인 요청"],
      },
      {
        id: "ri-count", order: 3, title: "리스크/이슈 건수 확인",
        outcome: "프로젝트 목록의 R/I 숫자 버튼을 클릭하면 리스크·이슈 메뉴로 이동해 해당 프로젝트의 미종료 건을 바로 확인합니다.",
        targetView: "risks", status: "ready",
        checks: ["R 버튼: 해당 프로젝트의 리스크 목록으로 이동", "I 버튼: 해당 프로젝트의 이슈 목록으로 이동", "기본 상태 필터는 미종료 전체입니다"],
      },
      {
        id: "wbs", order: 4, title: "WBS 등록",
        outcome: "WBS 관리 메뉴에서 항목을 직접 추가하거나 Excel을 업로드합니다.",
        targetView: "wbs-plan", status: "ready",
        checks: ["WBS 관리 버튼 클릭 또는 좌측 WBS 관리 메뉴 이동", "프로젝트 선택 후 행 추가 또는 ↑ Excel 업로드"],
      },
      {
        id: "approval", order: 5, title: "승인 요청",
        outcome: "PMO가 프로젝트 행의 승인 요청 버튼을 클릭하면 검토 상태로 변경되고 PMO Lead 승인 대기가 됩니다.",
        targetView: "portfolio", status: "ready",
        checks: ["프로젝트 목록에서 승인 요청 버튼 클릭", "설정 > 승인 이력 탭에서 대기 항목 확인", "PMO Lead가 승인/반려 처리"],
        caution: "승인 전에는 외부 도구 실제 기준선 반영이 차단됩니다.",
      },
      {
        id: "cr", order: 6, title: "변경요청(CR) 확인·등록·승인",
        outcome: "변경요청 탭에서 테넌트 전체 CR 현황을 확인하고, 프로젝트 상세에서 새 CR을 등록·승인·반려합니다.",
        targetView: "portfolio", status: "ready",
        checks: [
          "변경요청 탭에서 전체/진행중/승인/반려 필터로 테넌트 전체 CR 목록 확인",
          "프로젝트명 클릭 후 상세 드로어의 변경요청 탭에서 + 변경요청 등록 버튼 클릭",
          "제목·우선순위·요청자·WBS 코드·일정/비용 영향·영향 범위·설명 입력 후 등록",
          "등록 시 CR-001, CR-002... 형식으로 버전 번호가 자동 부여됩니다",
          "진행중(Open) 상태의 CR은 처리 열의 승인/반려 버튼으로 PMO/관리자가 직접 결정합니다 (반려 시 사유 입력 필수)",
        ],
        caution: "승인/반려 후에는 상태를 되돌릴 수 없으므로 영향 범위와 일정/비용 영향을 확인한 뒤 처리하세요.",
      },
    ],
    guardrails: [
      "프로젝트 상태가 승인이어야 외부 도구 기준선 반영 버튼이 활성화됩니다.",
      "반려 시 담당자는 WBS 관리에서 내용을 수정한 뒤 재승인 요청합니다.",
      "상단 필터와 정렬 UI로 상태, 담당자, 일정 기준의 프로젝트 목록을 좁혀 봅니다.",
      "테넌트가 바뀌면 프로젝트와 WBS 목록도 선택된 테넌트 기준으로 다시 표시됩니다.",
    ],
  },

  risks: {
    kind: "procedure",
    hero: {
      eyebrow: "리스크 관리",
      title: "리스크·이슈 등록, 필터, 상세 확인",
      description: "프로젝트별 리스크와 이슈를 탭으로 구분해 관리합니다. 목록 행 또는 상세 버튼을 누르면 오른쪽 슬라이딩 패널에서 세부 내용을 확인합니다.",
      tags: ["리스크", "이슈", "상세 드로어", "숫자 버튼 이동"],
    },
    summary: [
      { id: "tabs", label: "탭", value: "리스크 / 이슈", description: "등록 버튼과 컬럼이 탭에 맞춰 전환됩니다.", tone: "info" },
      { id: "filters", label: "필터", value: "프로젝트·상태·담당자", description: "미종료 전체는 Closed를 제외한 건을 한 번에 보여줍니다.", tone: "good" },
      { id: "sort", label: "정렬", value: "컬럼 클릭", description: "제목, 심각도/우선순위, 담당자, 상태, 목표일 기준으로 정렬합니다.", tone: "neutral" },
      { id: "detail", label: "상세", value: "오른쪽 패널", description: "행 클릭, Enter/Space 또는 상세 버튼으로 세부 내용을 엽니다.", tone: "warn" },
    ],
    steps: [
      {
        id: "navigate", order: 1, title: "목록으로 이동",
        outcome: "좌측 메뉴에서 직접 열거나 대시보드/프로젝트 현황의 리스크·이슈 숫자 버튼을 클릭합니다.",
        targetView: "risks", status: "ready",
        checks: ["숫자 버튼으로 이동하면 탭, 프로젝트, 미종료 상태 필터가 자동 적용됩니다", "직접 진입 시 전체 프로젝트 기준으로 조회합니다"],
      },
      {
        id: "filter", order: 2, title: "필터와 정렬 적용",
        outcome: "프로젝트, 상태, 담당자 필터와 컬럼 정렬을 조합해 확인할 대상을 좁힙니다.",
        status: "ready",
        checks: ["상태 필터: 전체, 미종료 전체, Open/Mitigated/Resolved/Closed", "담당자 필터: 현재 탭 데이터에 있는 담당자만 표시"],
      },
      {
        id: "detail", order: 3, title: "상세 내용 확인",
        outcome: "행 클릭 또는 상세 버튼으로 오른쪽 슬라이딩 패널을 열어 프로젝트, WBS 코드, 설명, 대응 전략, 목표일을 확인합니다.",
        status: "ready",
        checks: ["리스크: 심각도, 발생 가능성, 대응 전략 표시", "이슈: 우선순위, 담당자, 설명 표시", "프로젝트 현황 버튼으로 관련 프로젝트 상세로 이동"],
      },
      {
        id: "close", order: 4, title: "상태 처리",
        outcome: "권한이 있으면 리스크 종료 또는 이슈 해결 버튼으로 상태를 갱신합니다.",
        status: "ready",
        checks: ["리스크 종료: Closed 처리", "이슈 해결: Resolved 처리", "처리 후 목록과 상세 패널이 즉시 갱신됩니다"],
      },
    ],
    questions: [
      { id: "q-count", question: "대시보드 숫자와 목록 건수가 다르게 보입니다.", answer: "숫자 버튼은 기본적으로 Closed를 제외한 미종료 전체 기준입니다. 목록의 상태 필터를 전체 또는 개별 상태로 바꾸면 표시 건수가 달라질 수 있습니다." },
      { id: "q-detail", question: "상세 패널은 어떻게 닫나요?", answer: "우측 상단 닫기 버튼, 배경 영역 클릭, 또는 Esc 키로 닫을 수 있습니다." },
    ],
  },

  "wbs-plan": {
    kind: "procedure",
    hero: {
      eyebrow: "기준선",
      title: "프로젝트 WBS 기준선 관리",
      description: "프로젝트를 선택하고 WBS 코드, 계층 구조, 기준 일정, 가중치, R&R, 변경 요청을 관리합니다.",
      tags: ["기준선", "계층 구조", "일정", "가중치", "CR"],
    },
    steps: [
      {
        id: "select", order: 1, title: "프로젝트 선택",
        outcome: "상단 드롭다운에서 프로젝트를 선택하면 해당 프로젝트의 WBS 기준선 항목이 표시됩니다.",
        status: "ready",
        checks: ["상단 [프로젝트 선택] 드롭다운 클릭", "프로젝트명과 상태 확인 후 선택"],
      },
      {
        id: "view", order: 2, title: "기준선 구조 확인",
        outcome: "유형별 색상 코딩(단계=파랑·작업=초록·산출물=보라·마일스톤=주황)으로 계층 구조를 확인합니다.",
        status: "ready",
        checks: ["▼/▶ 버튼으로 단계별 접기·펼치기", "검색 및 단계·유형 필터로 원하는 항목 탐색"],
      },
      {
        id: "add", order: 3, title: "기준선 항목 추가",
        outcome: "항목 버튼으로 다이얼로그를 열어 WBS 코드·작업명·유형·담당자·가중치·일정을 입력합니다.",
        status: "ready",
        checks: ["행 추가 버튼 클릭", "작업명(필수) 입력, WBS 코드는 비워두면 자동 생성", "상위 항목 안에 하위 항목 추가 시 ＋ 하위 버튼 사용"],
      },
      {
        id: "edit-del", order: 4, title: "구조 수정·삭제",
        outcome: "항목 행에서 상세, CR, 하위 추가, 삭제를 처리합니다.",
        status: "ready",
        checks: ["수정: 기존 값이 채워진 다이얼로그에서 변경 후 저장", "삭제: 해당 항목과 모든 하위 항목이 함께 삭제됨"],
        caution: "삭제는 하위 항목을 포함해 즉시 적용됩니다. 저장 버튼으로 최종 확정하세요.",
      },
      {
        id: "cr", order: 5, title: "변경요청(CR) 등록·승인",
        outcome: "항목 상세의 CR 탭에서 변경요청을 등록하고, 승인 권한자가 승인·반려를 처리합니다.",
        status: "ready",
        checks: [
          "항목 상세 패널 > CR 탭에서 + 변경 요청 버튼 클릭",
          "변경 유형(범위/일정/자원/품질/비용 변경)·영향도(낮음/보통/높음/긴급)·변경 사유·변경 전후 내용·영향 범위 입력 후 등록",
          "승인 권한자가 승인 또는 반려 버튼 클릭 (반려 시 사유 입력 필수)",
          "CR 등록·승인 시 항목의 기준선 버전(v1.0 등)이 자동으로 0.1씩 증가합니다",
        ],
        caution: "CR 등록·승인 결과는 기준선 저장 버튼을 눌러야 서버에 최종 반영됩니다.",
      },
      {
        id: "upload", order: 6, title: "Excel 일괄 업로드",
        outcome: "↑ Excel 업로드 버튼으로 Excel 파일을 업로드하면 WBS 항목이 편집기에 로드됩니다.",
        status: "ready",
        targetView: "templates",
        checks: ["표준/일반 WBS 관리에서 템플릿 Excel 다운로드", "WBS 작성 후 ↑ Excel 업로드", "편집기에서 항목 검토 후 저장 버튼 클릭"],
      },
      {
        id: "save", order: 7, title: "저장",
        outcome: "기준선 저장 버튼을 클릭하면 구조·일정·가중치·CR 변경사항이 서버에 반영됩니다.",
        status: "ready",
        checks: ["저장 버튼 클릭 (변경사항 있을 때만 활성화)", "프로젝트 상태가 초안·검토·반려일 때만 편집 가능"],
        caution: "승인 완료·기준선 반영 완료 상태의 프로젝트는 WBS 수정이 불가합니다.",
      },
    ],
    questions: [
      { id: "q-code",    question: "WBS 코드를 비워두면 어떻게 되나요?",     answer: "레벨과 행 순서 기반으로 자동 생성됩니다. 예) SI.1.1" },
      { id: "q-sync",    question: "기준선 반영 상태가 '대기'인 것은 무엇인가요?", answer: "외부 도구로 아직 기준선이 반영되지 않은 항목입니다. 외부 연동을 쓰지 않는 운영에서는 작업 현황 메뉴의 내부 진행 상태를 기준으로 보면 됩니다." },
      { id: "q-approve", question: "저장 버튼이 비활성화되어 있습니다.",      answer: "변경사항이 없거나 프로젝트 상태가 승인 이후 단계입니다. 반려된 프로젝트는 다시 수정 가능합니다." },
    ],
    guardrails: [
      "프로젝트와 WBS 항목에는 테넌트 정보가 함께 부여됩니다.",
      "테넌트 전환 후에는 선택 가능한 프로젝트와 WBS 항목이 해당 테넌트 기준으로 표시됩니다.",
      "상태, 진척률, 실행 코멘트, 첨부/산출물 업데이트는 작업 현황 메뉴에서 수행합니다.",
    ],
  },

  workboard: {
    kind: "procedure",
    hero: {
      eyebrow: "작업 현황",
      title: "내부 WBS 작업 실행 관리",
      description: "OpenProject 없이도 WBS Platform 안에서 내 작업, PM용 프로젝트 작업 보드, 내부 간트, Agile 백로그와 스프린트를 운영합니다.",
      tags: ["내 작업", "작업 보드", "간트", "Agile", "Hybrid"],
    },
    summary: [
      { id: "mine", label: "내 작업", value: "담당자 기준", description: "로그인 사용자와 담당자·검토자·승인자가 매칭된 WBS 항목을 보여줍니다.", tone: "good" },
      { id: "board", label: "작업 보드", value: "PM 관점", description: "대기, 진행중, 완료, 지연, 보류 컬럼으로 프로젝트 실행 상태를 확인합니다.", tone: "info" },
      { id: "gantt", label: "간트", value: "일정 관점", description: "WBS 시작일·종료일을 기준으로 내부 간트를 표시합니다.", tone: "warn" },
      { id: "agile", label: "Agile", value: "Sprint 관점", description: "백로그, 스프린트 보드, 번다운, Velocity를 내부 Agile 데이터로 관리합니다.", tone: "good" },
    ],
    steps: [
      {
        id: "select", order: 1, title: "프로젝트 조회",
        outcome: "상단 프로젝트 선택 후 조회 버튼을 누르면 내부 WBS 작업 항목을 불러옵니다.",
        targetView: "workboard", status: "ready",
        checks: ["선택된 테넌트의 프로젝트만 표시됩니다", "WBS 항목이 없으면 WBS 관리에서 먼저 등록합니다"],
      },
      {
        id: "mine", order: 2, title: "내 작업 확인",
        outcome: "담당자, 검토자, 승인자 값이 현재 사용자와 매칭된 항목만 모아 봅니다.",
        status: "ready",
        checks: ["내 작업 탭 선택", "상세 버튼으로 작업 항목을 열어 상태와 진척률 업데이트"],
      },
      {
        id: "board", order: 3, title: "PM 작업 보드 운영",
        outcome: "작업 보드 탭에서 상태별 항목을 확인하고 카드 클릭으로 상세를 엽니다.",
        status: "ready",
        checks: ["카드에는 코드, 담당자, 기한, 진척률이 표시됩니다", "상태 변경 후 저장하면 WBS 항목에 반영됩니다"],
      },
      {
        id: "gantt", order: 4, title: "간트 일정 확인",
        outcome: "시작일 또는 종료일이 있는 WBS 항목을 내부 간트로 표시합니다.",
        status: "ready",
        checks: ["막대를 클릭하면 상세 패널에서 기간 수정 가능", "기간이 없는 항목은 상세에서 날짜를 입력합니다"],
      },
      {
        id: "log", order: 5, title: "댓글·이력·산출물 등록",
        outcome: "상세 패널에서 댓글과 첨부/산출물 링크를 남기면 변경 이력과 함께 저장됩니다.",
        status: "ready",
        checks: ["댓글은 항목별 코멘트로 누적됩니다", "첨부는 파일 업로드 대신 산출물명과 공유 URL을 등록합니다", "상태/진척률/담당자/기간 변경은 변경 이력에 기록됩니다"],
      },
      {
        id: "agile", order: 6, title: "Agile / Hybrid 운영",
        outcome: "수행 방식을 Agile 또는 Hybrid로 바꾸고 백로그, 스프린트 보드, 번다운·Velocity 탭에서 반복 실행을 관리합니다.",
        status: "ready",
        checks: ["백로그 탭에서 Epic/Story/Task/Bug와 Story Point 등록", "스프린트 보드에서 카드 드래그로 상태 변경", "Hybrid 프로젝트는 Agile 항목을 WBS 코드에 연결해 WBS별 완료율 확인"],
      },
    ],
    guardrails: [
      "작업 현황은 WBS Platform 내부 데이터를 기준으로 동작합니다.",
      "Waterfall은 기존 WBS/간트, Agile은 백로그/스프린트, Hybrid는 상위 WBS와 하위 Agile 항목을 함께 사용합니다.",
      "PMO 자원 가동율과 주간 보고서는 OpenProject가 아니라 내부 WBS 담당자, 일정, 진척률 정보를 기준으로 계산하는 방향입니다.",
      "외부 도구 연동이 필요한 경우 설정 > 외부 연동에서 선택적으로 기준선을 반영합니다.",
    ],
  },

  templates: {
    kind: "task-list",
    hero: {
      eyebrow: "표준/일반 WBS 관리",
      title: "Waterfall, Agile, Hybrid 표준/일반 WBS 관리",
      description: "회사 공식 표준 WBS 5종(SI 구축·데이터 이관·유지보수·Agile·Hybrid)을 확인하고 다운로드합니다. Agile/Hybrid 샘플은 내부 표준 문서로 관리되며 OpenProject 연동은 선택 사항입니다.",
      tags: ["표준 WBS", "Agile 샘플", "Hybrid 샘플", "Excel 업로드"],
    },
    tasks: [
      {
        id: "preview", title: "표준 WBS 미리보기",
        description: "각 템플릿의 🔍 미리보기 버튼을 클릭하면 WBS 항목 전체를 계층 트리로 확인할 수 있습니다.",
        status: "ready", required: false,
        checks: ["미리보기 드로어: 개요·단계 구성·WBS 항목 트리 표시", "드로어 상단 ↓ Excel로 해당 템플릿 다운로드"],
      },
      {
        id: "download-std", title: "표준 WBS 다운로드",
        description: "각 템플릿 카드의 ↓ Excel 버튼을 클릭합니다. Waterfall은 WBS 시트 중심, Agile/Hybrid는 Agile Backlog와 Sprint Plan 시트를 함께 포함한 워크북이 다운로드됩니다.",
        status: "ready", required: true, targetView: "templates",
        checks: ["원하는 유형(SI 구축/데이터 이관/유지보수/Agile/Hybrid)의 ↓ Excel 클릭", "Guide 시트에서 작성 규칙 확인", "Hybrid는 Hybrid Mapping 시트로 상위 WBS와 Sprint 실행 항목 연결 확인"],
      },
      {
        id: "custom-preview", title: "일반 WBS(프로젝트별) 미리보기",
        description: "일반 WBS 섹션에서 각 프로젝트의 🔍 미리보기 버튼을 클릭하면 해당 프로젝트의 WBS를 드로어에서 확인합니다.",
        status: "ready", required: false,
        checks: ["미리보기: 프로젝트 WBS 항목 계층 트리 표시", "WBS 관리 메뉴에서 직접 편집 가능"],
      },
      {
        id: "excel-upload-tab", title: "Excel 업로드 탭 활용",
        description: "Excel 업로드 탭을 선택하면 WBS 유형(표준/일반)을 선택하고 파일을 업로드할 수 있습니다.",
        status: "ready", required: false,
        checks: ["[표준 WBS]: 선택한 표준 템플릿 항목 교체", "[일반 WBS]: 선택한 프로젝트의 WBS 업데이트", "검증 통과 후 반영 버튼 활성화"],
        caution: "표준 WBS 교체는 해당 유형을 사용하는 신규 프로젝트에 영향을 줍니다.",
      },
    ],
    guardrails: [
      "표준 WBS는 회사 공식 양식입니다. 수정 시 변경 이력이 자동으로 저장됩니다.",
      "일반 WBS 업로드는 프로젝트 상태가 초안·검토·반려일 때만 가능합니다.",
    ],
  },

  "op-view": {
    kind: "procedure",
    hero: {
      eyebrow: "WBS 현황",
      title: "WBS 현황 — 전체 진행 모니터링",
      description: "현재 테넌트의 내부 프로젝트를 선택해 WBS 목록, 간트, 담당자별 집계, 지연 항목을 조회합니다. OpenProject 연동 여부는 보조 배지로만 표시됩니다.",
      tags: ["내부 WBS", "목록", "간트", "담당자별", "지연 항목"],
    },
    steps: [
      {
        id: "select", order: 1, title: "프로젝트 선택",
        outcome: "상단 드롭다운에서 현재 테넌트의 프로젝트를 선택합니다.",
        status: "ready",
        checks: ["OpenProject 연동 여부와 관계없이 내부 프로젝트가 표시됩니다", "선택한 프로젝트의 내부 WBS 항목을 조회 버튼으로 다시 불러올 수 있습니다"],
      },
      {
        id: "wp", order: 2, title: "작업 항목 목록 확인",
        outcome: "내부 WBS 항목이 AX WBS 스타일로 계층 목록으로 표시됩니다.",
        status: "ready",
        checks: ["유형별 색상 코딩(단계·작업·산출물·마일스톤 등)", "검색, 유형 필터, 단계 필터 사용 가능"],
      },
      {
        id: "gantt", order: 3, title: "간트 차트 확인",
        outcome: "WBS 항목의 시작일·종료일을 기반으로 타임라인 간트 차트를 표시합니다.",
        status: "ready",
        checks: ["간트 탭 클릭", "오늘 날짜 기준선과 진척률 바 확인", "일정 수정은 WBS 관리 또는 작업 현황 메뉴에서 수행"],
        caution: "일정(시작일·종료일)이 없는 항목은 간트 바가 표시되지 않습니다. WBS 관리에서 날짜를 입력하세요.",
      },
      {
        id: "summary", order: 4, title: "담당자별·지연 항목 확인",
        outcome: "담당자별 작업 수, 완료/지연 건수, 평균 진행률과 지연 항목 목록을 확인합니다.",
        status: "ready",
        checks: ["담당자별 탭에서 사람별 부하와 진행률 확인", "지연 항목 탭에서 종료일 초과 또는 지연 상태 항목 확인"],
      },
    ],
    questions: [
      { id: "q1", question: "프로젝트가 목록에 없습니다.",                    answer: "현재 선택한 테넌트에 소속된 프로젝트만 표시됩니다. 상단 테넌트를 확인하거나 프로젝트 현황에서 프로젝트를 생성하세요." },
      { id: "q2", question: "간트 차트가 표시되지 않습니다.",                 answer: "WBS 항목에 시작일과 종료일이 입력되어야 간트 바가 표시됩니다. WBS 관리 메뉴에서 날짜를 입력하세요." },
      { id: "q3", question: "상태가 '대기'인 항목이 있습니다.",               answer: "아직 작업이 시작되지 않은 항목입니다. 실행 상태는 작업 현황 메뉴에서 직접 업데이트합니다." },
      { id: "q4", question: "WBS 현황과 WBS 관리의 차이가 무엇인가요?",       answer: "WBS 현황은 조회/모니터링 화면입니다. WBS 관리는 WBS 구조, 기준 일정, 가중치를 추가·수정·삭제하는 기준선 편집 화면입니다." },
    ],
    guardrails: [
      "WBS 현황은 내부 WBS 데이터를 기준으로 표시합니다.",
      "OpenProject 연동 정보는 보조 배지로만 표시되며, 기준선 반영과 상태 가져오기는 설정 > 외부 연동에서 관리합니다.",
      "기준 일정과 가중치는 WBS 관리에서, 상태·진척률·실행 코멘트는 작업 현황에서 수행합니다.",
    ],
  },

  resource: {
    kind: "procedure",
    hero: {
      eyebrow: "PMO",
      title: "자원 배분 — 3가지 관점",
      description: "같은 기간 조건으로 WBS 담당자 작업 부하, 사용자 계정별 할당, PMO 가동율을 탭으로 구분해 조회합니다.",
      tags: ["WBS 작업 부하", "계정별 할당", "PMO 가동율", "기간 조회"],
    },
    summary: [
      { id: "workload", label: "WBS 작업 부하", value: "업무량", description: "WBS 담당자별 작업 수, 예상 시간, 기간 내 부하를 봅니다.", tone: "good" },
      { id: "accounts", label: "계정별 할당", value: "사용자", description: "포털 사용자 계정과 연결된 task 할당 현황을 확인합니다.", tone: "info" },
      { id: "capacity", label: "PMO 가동율", value: "관리자", description: "PMO 인원의 가용 시간 대비 배정률을 확인합니다.", tone: "warn" },
    ],
    steps: [
      {
        id: "period", order: 1, title: "조회 기간 선택",
        outcome: "상단의 시작일과 종료일을 선택한 뒤 조회 버튼을 누릅니다.",
        targetView: "resource", status: "ready",
        checks: ["기간 입력 영역은 조회 버튼과 같은 톤으로 정리되어 있습니다", "조회 결과는 선택된 테넌트와 기간 기준으로 표시됩니다"],
      },
      {
        id: "workload", order: 2, title: "WBS 작업 부하 확인",
        outcome: "WBS 항목의 담당자와 일정 정보를 기준으로 담당자별 작업량을 확인합니다.",
        status: "ready",
        checks: ["업무가 특정 담당자에게 몰리는지 확인", "일정 조정이 필요한 항목은 WBS 관리에서 수정"],
      },
      {
        id: "accounts", order: 3, title: "계정별 할당 확인",
        outcome: "사용자 계정 기준으로 task 할당과 활성 계정 상태를 확인합니다.",
        status: "ready",
        checks: ["계정별 할당 task 수 확인", "비활성 또는 역할이 맞지 않는 계정은 설정 > 사용자에서 조정"],
      },
      {
        id: "capacity", order: 4, title: "PMO 가동율 확인",
        outcome: "PMO 인원의 기준 가용 시간 대비 배정률을 보고 과부하 또는 여유 인원을 판단합니다.",
        status: "ready",
        checks: ["가동율이 높은 인원은 일정 또는 담당 조정 검토", "기준 시간은 운영 정책에 맞춰 API 설정값으로 관리"],
      },
    ],
    guardrails: [
      "자원 배분은 분석 화면입니다. 실제 WBS 담당자 변경은 WBS 관리 또는 작업 현황에서 수행합니다.",
      "계정별 할당은 사용자 계정 데이터와 WBS 담당자 값의 연결 품질에 영향을 받습니다.",
      "테넌트 전환 시 자원 배분 결과도 해당 테넌트 기준으로 다시 조회해야 합니다.",
    ],
  },

  settings: {
    kind: "reference",
    hero: {
      eyebrow: "설정",
      title: "설정 메뉴 안내",
      description: "설정 메뉴는 플랫폼 설정, 프로젝트 운영 정책, 승인 이력, 운영 점검, 사용자, 감사 로그, 외부 연동, 인증(LDAP), 알림(SMTP), 테넌트 탭으로 구성됩니다.",
      tags: ["운영 정책", "운영 점검", "LDAP", "테넌트"],
    },
    summary: [
      { id: "platform",     label: "플랫폼 설정",    value: "admin",  description: "PM 엔진 어댑터(mock/openproject) 및 환경 변수 설정. admin 전용.", tone: "warn" },
      { id: "policy",       label: "프로젝트 운영 정책", value: "admin", description: "테넌트별 기본 방법론, Story Point 방식, Sprint 길이, DoD, Sprint-Version 동기화 범위를 관리합니다.", tone: "good" },
      { id: "approvals",    label: "승인 이력",       value: "pmo+",   description: "프로젝트별 승인 파이프라인(초안→검토→승인) 및 승인/반려 처리 목록.", tone: "info" },
      { id: "operations",   label: "운영 점검",       value: "pmo+",   description: "DB, 마이그레이션, 백업, CORS, 메트릭, Prometheus/Grafana 상태를 확인합니다.", tone: "info" },
      { id: "users",        label: "사용자",          value: "admin",  description: "계정 생성, 역할/상태 필터, 컬럼 정렬, 비밀번호 초기화, 세션 종료. admin 전용.", tone: "warn" },
      { id: "audit",        label: "감사 로그",       value: "pmo+",   description: "인증·프로젝트·승인·시스템 이벤트 5개 서브탭과 CSV 내보내기를 제공합니다.", tone: "info" },
      { id: "openproject",  label: "외부 연동",       value: "pmo+",   description: "점검, 모의 반영, 실제 기준선 반영, 상태 가져오기, Webhook URL, 인스턴스 연결 확인.", tone: "info" },
      { id: "auth",         label: "인증(LDAP)",      value: "admin",  description: "LDAP 연결 테스트와 실 서버 진단으로 Bind, 검색, 인증 단계를 확인합니다.", tone: "warn" },
      { id: "smtp",         label: "알림(SMTP)",      value: "admin",  description: "주간 보고서, 리스크 에스컬레이션, 승인 리마인더 자동 발송 스케줄을 관리합니다.", tone: "good" },
      { id: "tenants",      label: "테넌트",          value: "admin",  description: "테넌트 추가, 활성/중지, 프로젝트/WBS 연결 건수를 확인합니다.", tone: "warn" },
    ],
    resources: [
      { id: "approval-flow",  title: "승인 이력 탭",       description: "승인 요청 → 검토(Pending) → PMO Lead 승인/반려 파이프라인 카드 형태. 반려 후 WBS 수정 → 재승인 요청 가능.", meta: "승인 프로세스" },
      { id: "project-policy", title: "프로젝트 운영 정책", description: "테넌트별 정책 저장 후 신규 프로젝트, 스프린트, 백로그 생성 시 기본값과 검증 규칙으로 자동 적용됩니다.", meta: "테넌트별 적용" },
      { id: "op-tab",         title: "외부 연동 탭",       description: "점검(4개 체크) → 모의 반영(payload 확인) → 기준선 반영(Approved 상태만 가능). 역방향 Pull 및 Webhook 설정 포함.", meta: "선택 연동" },
      { id: "schedule",       title: "자동 발송 스케줄",   description: "알림(SMTP) 탭에서 스케줄 ON/OFF와 수신 이메일을 저장합니다. 저장 후 등록된 스케줄 요약 영역에서 현재 상태를 확인합니다.", meta: "최대 수신자 10명" },
      { id: "ldap",           title: "LDAP 실 서버 검증",  description: "인증(LDAP) 탭의 실 서버 검증 버튼으로 연결, Bind, 사용자 검색, 선택 인증 단계를 확인합니다.", meta: "진단 결과" },
      { id: "monitoring",     title: "Prometheus/Grafana", description: "운영 점검과 모니터링 프로파일에서 API up, 요청 수, 보고서 실행 지표를 확인합니다.", meta: "운영 대시보드" },
      { id: "tenant",         title: "테넌트 데이터",      description: "테넌트 탭에서 프로젝트/WBS 건수를 확인하고, 상단 테넌트 선택으로 업무 화면 데이터를 전환합니다.", meta: "데이터 격리" },
    ],
    guardrails: [
      "플랫폼 설정·사용자·LDAP·SMTP·테넌트 관리는 admin 권한 전용입니다.",
      "프로젝트 운영 정책은 PMO 이상 조회 가능하며 저장은 admin 권한에서 수행합니다.",
      "외부 연동 탭에서 기준선 반영 버튼은 프로젝트 상태가 '승인'일 때만 활성화됩니다.",
      "역방향 Pull 버튼은 외부 도구에서 상태를 가져와 AX WBS 항목의 진척률을 업데이트합니다.",
      "SMTP 환경 변수가 미설정이면 자동 발송 스케줄은 저장되어도 실제 이메일 발송이 비활성화될 수 있습니다.",
      "테넌트가 Suspended 상태이면 해당 테넌트로 전환하거나 데이터를 변경할 수 없습니다.",
    ],
  },
};

async function request(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }
  if (state.currentTenantId) {
    headers["X-Tenant-ID"] = state.currentTenantId;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const errorBody = await response.json();
      detail = typeof errorBody.detail === "string" ? errorBody.detail : JSON.stringify(errorBody.detail || detail);
    } catch (error) {
      detail = response.statusText || detail;
    }
    if (response.status === 401 && state.authToken && path !== "/api/auth/login" && path !== "/api/auth/me") {
      clearSession("세션이 만료되었습니다. 다시 로그인해주세요.");
    }
    throw new Error(detail);
  }

  if (response.status === 204) return response;

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response;
}

function authHeaders(extra = {}) {
  return {
    ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
    ...(state.currentTenantId ? { "X-Tenant-ID": state.currentTenantId } : {}),
    ...extra,
  };
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

function skeletonRows(columns = 4, rows = 4) {
  return Array.from({ length: rows }, () => `
    <tr class="skeleton-row">
      ${Array.from({ length: columns }, () => `<td><div class="skeleton-cell"></div></td>`).join("")}
    </tr>
  `).join("");
}

function showAppSkeletons() {
  if (!state.currentUser) return;
  document.body.dataset.loading = "true";
  const projectRows = document.querySelector("#projectRows");
  if (projectRows) projectRows.innerHTML = skeletonRows(8, 5);

  const approvals = document.querySelector("#approvalPipelineList");
  if (approvals) {
    approvals.innerHTML = `
      <div class="skeleton-stack">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-line short"></div>
      </div>`;
  }

  const importHistory = document.querySelector("#importHistoryList");
  if (importHistory) {
    importHistory.innerHTML = `
      <div class="skeleton-stack">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>`;
  }
}

function hideAppSkeletons() {
  delete document.body.dataset.loading;
}

function syncStateLabel(value) {
  const labels = {
    ready: "준비",
    dry_run_only: "모의 반영",
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
    Synced: "기준선 반영 완료",
    Preview: "미리보기",
    Applied: "반영 완료",
    Accepted: "정상",
    Pending: "대기",
    Locked: "잠김",
    DryRun: "모의 반영",
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
    Agile: "Agile",
    Hybrid: "Hybrid",
    Uploaded: "업로드",
  };
  return labels[value] || value || "-";
}

function templateDeliveryMode(template) {
  if (!template) return "waterfall";
  const key = String(template.key || template.template_key || "").toLowerCase();
  const projectType = String(template.project_type || "").toLowerCase();
  if (projectType === "agile" || key.startsWith("agile")) return "agile";
  if (projectType === "hybrid" || key.startsWith("hybrid")) return "hybrid";
  return "waterfall";
}

function templateDeliveryModeByKey(templateKey) {
  const template = state.templates.find((t) => t.key === templateKey)
    || fallbackTemplates.find((t) => t.key === templateKey);
  return templateDeliveryMode(template);
}

function deliveryModeLabel(mode) {
  return DELIVERY_MODE_LABELS[mode] || mode || "Waterfall";
}

function deliveryModeOrder(mode) {
  const index = DELIVERY_MODE_ORDER.indexOf(mode);
  return index === -1 ? DELIVERY_MODE_ORDER.length : index;
}

function orderedIndex(list, value) {
  const index = list.indexOf(value);
  return index === -1 ? list.length : index;
}

function templateSortRank(template) {
  const key = template?.key || template?.template_key || "";
  const keyRank = orderedIndex(TEMPLATE_KEY_ORDER, key);
  if (keyRank !== TEMPLATE_KEY_ORDER.length) return keyRank;
  return TEMPLATE_KEY_ORDER.length + orderedIndex(TEMPLATE_TYPE_ORDER, template?.project_type || "");
}

function compareTemplates(a, b) {
  const rankDiff = templateSortRank(a) - templateSortRank(b);
  if (rankDiff) return rankDiff;
  return (a.name || a.key || "").localeCompare(b.name || b.key || "", "ko");
}

function compareProjectsForWbsList(a, b) {
  const modeDiff = deliveryModeOrder(projectDeliveryMode(a)) - deliveryModeOrder(projectDeliveryMode(b));
  if (modeDiff) return modeDiff;
  const templateDiff = orderedIndex(TEMPLATE_KEY_ORDER, a.template_key || "") - orderedIndex(TEMPLATE_KEY_ORDER, b.template_key || "");
  if (templateDiff) return templateDiff;
  return (a.name || "").localeCompare(b.name || "", "ko");
}

function renderDeliveryModeBadge(mode, extraClass = "") {
  const normalized = DELIVERY_MODE_ORDER.includes(mode) ? mode : "waterfall";
  const className = `delivery-mode-badge mode-${normalized} ${extraClass}`.trim();
  return `<span class="${escapeHtml(className)}">${escapeHtml(deliveryModeLabel(normalized))}</span>`;
}

function projectTemplateLabel(project) {
  const template = state.templates.find((t) => t.key === project?.template_key)
    || fallbackTemplates.find((t) => t.key === project?.template_key);
  if (template) return projectTypeLabel(template.project_type);
  return projectTypeLabel(project?.template_key);
}

function sortByDeliveryMode(items, modeGetter) {
  return [...items].sort((a, b) => {
    const modeDiff = deliveryModeOrder(modeGetter(a)) - deliveryModeOrder(modeGetter(b));
    if (modeDiff) return modeDiff;
    const aName = a.name || a.key || "";
    const bName = b.name || b.key || "";
    return aName.localeCompare(bName, "ko");
  });
}

function groupByDeliveryMode(items, modeGetter) {
  return DELIVERY_MODE_ORDER
    .map((mode) => ({
      mode,
      items: items.filter((item) => modeGetter(item) === mode),
    }))
    .filter((group) => group.items.length);
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
    openproject: "외부 연동",
    mock: "모의 엔진",
    "ce-api-adapter": "CE API 어댑터",
    adapter: "어댑터",
  };
  return labels[value] || value || "-";
}

function syncModeLabel(value) {
  const labels = {
    dry_run: "모의 반영",
    actual: "실제 반영",
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
    sync_enabled: "기준선 반영 설정",
    api_token: "API 토큰",
    authenticated_user: "인증 사용자",
    sync_request: "기준선 반영 요청",
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
    "OpenProject preflight": "외부 연동 사전 점검",
    "Sync audit trail": "기준선 반영 감사 이력",
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
    .replace("Actual OpenProject sync is enabled", "외부 도구 실제 기준선 반영 허용")
    .replace("Actual OpenProject sync is disabled; dry-run and planning endpoints remain available", "외부 도구 실제 기준선 반영은 비활성화되어 있으며 모의 반영과 계획 기능은 사용 가능")
    .replace("OPENPROJECT_API_TOKEN is configured", "OPENPROJECT_API_TOKEN 설정 완료")
    .replace("OPENPROJECT_API_TOKEN is not configured; actual sync will be blocked", "OPENPROJECT_API_TOKEN 미설정으로 실제 기준선 반영 차단")
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
    .replace("sync runs recorded", "건 기준선 반영 이력")
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
    "pm_engine.sync_recorded": "PM 엔진 기준선 반영",
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
    "work_item.updated": "작업 항목 변경",
    "project_member.added": "프로젝트 멤버 추가",
    "project_member.role_changed": "프로젝트 멤버 역할 변경",
    "project_member.removed": "프로젝트 멤버 제거",
  };
  return labels[value] || value || "-";
}

function auditSummaryLabel(value) {
  if (!value) return "-";
  return String(value)
    .replace("PM engine sync", "PM 엔진 기준선 반영")
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
    .replace("WBS codes resequenced:", "WBS 코드 정렬:")
    .replace("Work item updated:", "작업 항목 변경:")
    .replace("Project member added:", "프로젝트 멤버 추가:")
    .replace("Project member role changed:", "프로젝트 멤버 역할 변경:")
    .replace("Project member removed:", "프로젝트 멤버 제거:");
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

function pmEngineSettingValue() {
  const setting = (state.settings?.settings || []).find((item) => item.key === "pm_engine");
  return setting?.value && typeof setting.value === "object" ? setting.value : {};
}

function externalIntegrationEnabled() {
  const value = pmEngineSettingValue();
  const engine = state.settings?.pm_engine || state.pmPreflight?.engine || {};
  if (value.portal_enabled === false || engine.portal_enabled === false) return false;
  if (["disabled", "none", "internal"].includes(String(value.adapter || engine.adapter || "").toLowerCase())) return false;
  return true;
}

function projectOperationPolicy() {
  return {
    ...fallbackProjectOperationPolicy,
    ...(state.projectOperationPolicy || {}),
    tenant_id: state.projectOperationPolicy?.tenant_id || state.currentTenantId || "default",
  };
}

function sprintPolicyDays(policy = projectOperationPolicy()) {
  const map = { fixed_1w: 7, fixed_2w: 14, fixed_4w: 28 };
  return map[policy.sprint_length_policy] || null;
}

function defaultSprintEndDate(startIso, policy = projectOperationPolicy()) {
  const days = sprintPolicyDays(policy) || 14;
  return addDaysIso(startIso || new Date().toISOString().slice(0, 10), days - 1);
}

function storyPointOptions(policy = projectOperationPolicy()) {
  const values = Array.isArray(policy.fibonacci_points) && policy.fibonacci_points.length
    ? policy.fibonacci_points
    : fallbackProjectOperationPolicy.fibonacci_points;
  return values.map((point) => Number(point));
}

function deliveryPolicyLabel(value) {
  return DELIVERY_MODE_LABELS[value] || "Waterfall";
}

function sprintPolicyLabel(value) {
  const labels = {
    custom: "프로젝트별 자유 설정",
    fixed_1w: "1주 고정",
    fixed_2w: "2주 고정",
    fixed_4w: "4주 고정",
  };
  return labels[value] || labels.custom;
}

function resetTenantScopedState() {
  state.dashboard = createDashboardState();
  state.projects = [];
  state.approvals = [];
  state.importJobs = [];
  state.users = [];
  state.userGroups = [];
  state.auditEvents = [];
  state.risks = [];
  state.issues = [];
  state.notifications = [];
  state.projectOperationPolicy = { ...fallbackProjectOperationPolicy, tenant_id: state.currentTenantId || "default" };
  state.projectPolicyStatus = "";
  state.selectedProjectId = null;
  state.projectPlan = null;
  state.projectDetail = null;
  state.syncRuns = [];
  state.resourceData = null;
  state.wbsPlanProjectId = null;
  state.wbsPlanRows = [];
  state.workboardProjectId = null;
  state.workboardLoadedProjectId = null;
  state.workboardRows = [];
  state.myWorkItems = [];
  state.workboardSelectedCode = null;
  state.workboardStatusMessage = "";
  state.workboardDragKey = null;
  state.workboardGanttDrag = null;
  state.agileSprints = [];
  state.agileItems = [];
  state.agileMetrics = null;
  state.agileLoadedProjectId = null;
  state.agileLoading = false;
  state.agileSelectedSprintId = "";
  state.agileDragKey = null;
  state.opViewProjectId = null;
  state.opViewRows = [];
}

function tenantDisplayName(tenantId) {
  const id = tenantId || state.currentTenantId || "default";
  const tenant = state.tenants.find((item) => item.id === id);
  return tenant?.name || id;
}

function renderTenantBadge(tenantId) {
  const id = tenantId || state.currentTenantId || "default";
  return `<span class="tenant-inline-badge" title="테넌트 ID: ${escapeHtml(id)}">${escapeHtml(tenantDisplayName(id))}</span>`;
}

function renderTenantSwitcher() {
  const wrap = document.querySelector("#tenantSwitcher");
  const select = document.querySelector("#tenantSelect");
  const badge = document.querySelector("#tenantStatusBadge");
  if (!wrap || !select || !badge) return;
  const isAuthenticated = Boolean(state.currentUser && state.authToken);
  wrap.hidden = !isAuthenticated;
  if (!isAuthenticated) return;

  const tenants = state.tenants.length
    ? state.tenants
    : [{ id: state.currentTenantId || "default", name: state.currentTenantId || "default", status: state.currentTenant?.status || "Active" }];
  const selectedExists = tenants.some((tenant) => tenant.id === state.currentTenantId);
  if (!selectedExists) {
    tenants.unshift({ id: state.currentTenantId || "default", name: state.currentTenantId || "default", status: state.currentTenant?.status || "Active" });
  }
  select.innerHTML = tenants.map((tenant) => `
    <option value="${escapeHtml(tenant.id)}" ${tenant.id === state.currentTenantId ? "selected" : ""}>
      ${escapeHtml(tenant.name || tenant.id)}${tenant.status === "Suspended" ? " (중지)" : ""}
    </option>
  `).join("");
  const current = tenants.find((tenant) => tenant.id === state.currentTenantId) || tenants[0];
  badge.textContent = current?.status === "Suspended" ? "중지" : current?.id || state.currentTenantId;
  badge.classList.toggle("is-suspended", current?.status === "Suspended");
}

async function loadTenantSwitcher() {
  if (!state.authToken) return;
  try {
    state.tenants = await request("/api/tenants");
    state.currentTenant = state.tenants.find((tenant) => tenant.id === state.currentTenantId) || state.currentTenant;
  } catch (error) {
    state.tenants = [];
  }
  renderTenantSwitcher();
}

async function switchTenant(tenantId) {
  if (!tenantId || tenantId === state.currentTenantId) return;
  state.currentTenantId = tenantId;
  window.localStorage.setItem(TENANT_ID_KEY, tenantId);
  state.currentTenant = state.tenants.find((tenant) => tenant.id === tenantId) || { id: tenantId, status: "Active" };
  resetTenantScopedState();
  renderTenantSwitcher();
  renderAll();
  showAppSkeletons();
  try {
    await loadData({ tenantId });
    await loadTenantSwitcher();
  } catch (error) {
    alert(`테넌트 전환 실패: ${error.message}`);
  }
}
window.switchTenant = switchTenant;

function toggleNavAndPanel(hash, allowed) {
  const link = document.querySelector(`.nav-list a[href="${hash}"]`);
  const panel = document.querySelector(hash);
  if (link) link.hidden = !allowed;
  if (panel) panel.hidden = !allowed;
}

function canAccessView(viewId) {
  // settings: pmo 이상 접근 가능 (sync 메뉴도 settings로 통합)
  if (viewId === "settings") return canViewSettings() || canAccessOperations() || canViewAudit();
  if (viewId === "sync")     return false; // 더 이상 독립 패널 없음 → settings로 리다이렉트
  if (viewId === "operations") return canAccessOperations();
  if (viewId === "users")      return canManageUsers();
  if (viewId === "audit")      return canViewAudit();
  if (viewId === "wbs-plan")   return Boolean(state.currentUser);
  if (viewId === "workboard")  return Boolean(state.currentUser);
  if (viewId === "op-view")    return Boolean(state.currentUser);
  if (viewId === "guide")      return Boolean(state.currentUser);
  return true;
}

/* 역할 레벨 */
const ROLE_LEVEL = { viewer: 1, pmo: 2, admin: 3 };

function renderAuthState() {
  const isAuthenticated = Boolean(state.currentUser && state.authToken);
  document.body.dataset.auth = isAuthenticated ? "authenticated" : "login";

  /* 아이콘 버튼 업데이트 */
  const avatarIcon = document.querySelector("#userAvatarIcon");
  const avatarName = document.querySelector("#userAvatarName");
  if (avatarIcon && avatarName) {
    if (isAuthenticated && state.currentUser) {
      const initials = (state.currentUser.display_name || "U").slice(0, 1).toUpperCase();
      avatarIcon.textContent = initials;
      avatarName.textContent = `${state.currentUser.display_name} · ${roleLabel(state.currentUser.role)}`;
    } else {
      avatarIcon.textContent = "?";
      avatarName.textContent = "-";
    }
  }
  renderTenantSwitcher();

  /* ── 역할 기반 메뉴 표시/숨김 ── */
  const userLevel = ROLE_LEVEL[state.currentUser?.role] || 0;
  document.querySelectorAll(".nav-list a[data-min-role]").forEach((link) => {
    const minLevel = ROLE_LEVEL[link.dataset.minRole] || 1;
    link.classList.toggle("nav-role-hidden", userLevel < minLevel);
    link.hidden = userLevel < minLevel;
  });
  toggleNavAndPanel("#op-view", canAccessView("op-view"));

  /* ── 설정 탭 권한별 표시 ── */
  const stgTabBar = document.querySelector("#settingsTabBar");
  if (stgTabBar) {
    stgTabBar.querySelectorAll(".stg-tab[data-stg-tab]").forEach((btn) => {
      const tab = btn.dataset.stgTab;
      let visible = true;
      if (tab === "platform")     visible = canViewSettings();
      if (tab === "policy")       visible = canViewSettings();
      if (tab === "operations")   visible = canAccessOperations();
      if (tab === "users")        visible = canManageUsers();
      if (tab === "audit")        visible = canViewAudit();
      if (tab === "openproject")  visible = canAccessOperations(); // pmo 이상
      btn.hidden = !visible;
    });
    // 현재 탭이 숨겨진 경우 기본 탭으로 이동
    const activeBtn = stgTabBar.querySelector(`.stg-tab[data-stg-tab="${state.settingsTab}"]`);
    if (activeBtn?.hidden) {
      const firstVisible = stgTabBar.querySelector(".stg-tab:not([hidden])");
      if (firstVisible) switchSettingsTab(firstVisible.dataset.stgTab);
    }
  }

  const canMutate = canMutateWork();
  document.querySelector("#createProjectButton").disabled = !canMutate;
  document.querySelector("#renumberButton").disabled = !canMutate;
  const templateUploadLabel = document.querySelector("#tplTabImport .file-button");
  if (templateUploadLabel) templateUploadLabel.classList.toggle("disabled-control", !canMutate);
  document.querySelector("#excelFileInput").disabled = !canMutate;
  if (!canAccessView(document.body.dataset.portalView)) {
    applyPortalView("#dashboard", { updateHistory: true, scrollToTop: false });
  }
}

function renderMetrics() {
  renderPortfolioMeta();
  renderDashboardKpiBanner();
}

const RI_OPEN_STATUS_FILTER = "__open__";

function isOpenRiStatus(status) {
  return status !== "Closed";
}

function projectRiCounts(projectId) {
  const risks = state.risks.filter((item) => item.project_id === projectId && isOpenRiStatus(item.status)).length;
  const issues = state.issues.filter((item) => item.project_id === projectId && isOpenRiStatus(item.status)).length;
  return { risks, issues };
}

function riCountButton({ type, count, projectId = "", label = "" }) {
  const isRisk = type === "risks";
  const text = label || (isRisk ? "리스크" : "이슈");
  return `
    <button class="ri-count-pill ${isRisk ? "kpi-risk" : "kpi-issue"}" type="button"
      data-ri-navigate="${isRisk ? "risks" : "issues"}"
      data-ri-status="${RI_OPEN_STATUS_FILTER}"
      ${projectId ? `data-ri-project-id="${escapeHtml(projectId)}"` : ""}
      ${count ? "" : "disabled"}
      title="${escapeHtml(text)} ${Number(count || 0)}건 보기">
      <span>${escapeHtml(text)}</span><strong>${Number(count || 0)}</strong>
    </button>`;
}

function navigateToRiList({ tab = "risks", projectId = "", status = RI_OPEN_STATUS_FILTER, owner = "" } = {}) {
  state.riTab = tab === "issues" ? "issues" : "risks";
  state.riProjectFilter = projectId || "";
  state.riStatusFilter = status || "";
  state.riOwnerFilter = owner || "";
  state.riSortKey = "due_date";
  state.riSortDir = "asc";
  state.riDetail = null;
  closeRiDetailDrawer();
  applyPortalView("#risks", { behavior: "smooth" });
}

function renderPortfolioMeta() {
  const meta = document.querySelector("#portfolioMeta");
  if (!meta) return;
  const m       = state.dashboard.metrics || {};
  const total   = m.projects ?? state.projects.length;
  const pending = m.pending_approvals ?? 0;
  const risks   = m.risk_count ?? 0;
  const issues  = m.issue_count ?? 0;
  const spi     = m.portfolio_spi;
  const syncLbl = syncStateLabel(state.pmPreflight?.state);
  const syncCls = syncStateClass(state.pmPreflight?.state);

  const spiHtml = spi != null
    ? `<span>SPI <strong class="${spi >= 1 ? "kpi-good" : spi >= 0.8 ? "kpi-warn" : "kpi-bad"}">${spi.toFixed(2)}</strong></span>`
    : "";
  const riskHtml = risks > 0 ? riCountButton({ type: "risks", count: risks }) : "";
  const issueHtml = issues > 0 ? riCountButton({ type: "issues", count: issues }) : "";

  meta.innerHTML = `
    <span>테넌트 <strong>${escapeHtml(tenantDisplayName(state.currentTenantId))}</strong></span>
    <span><strong>${total}</strong>개 프로젝트</span>
    <span><strong>${pending}</strong>건 승인 대기</span>
    ${spiHtml}
    ${riskHtml}
    ${issueHtml}
    <span>외부 연동 <span class="status-pill ${syncCls}" style="font-size:0.72rem;padding:1px 7px">${escapeHtml(syncLbl)}</span></span>
  `;
}

function renderDashboardKpiBanner() {
  const banner = document.querySelector("#dashboardKpiBanner");
  if (!banner) return;
  const kpis = state.dashboard.project_kpis || [];
  const heatmap = state.dashboard.status_heatmap || [];

  if (!kpis.length && !heatmap.length) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;

  // SPI 카드 목록
  const kpiCards = kpis.map((k) => {
    const spiVal = k.spi != null ? k.spi.toFixed(2) : "—";
    const spiCls = k.spi == null ? "" : k.spi >= 1 ? "kpi-good" : k.spi >= 0.8 ? "kpi-warn" : "kpi-bad";
    const progress = k.progress_pct || 0;
    return `
      <div class="kpi-project-card" data-open-project="${k.project_id}" style="cursor:pointer">
        <div class="kpi-card-name" title="${escapeHtml(k.project_name)}">${escapeHtml(k.project_name)}</div>
        <div class="kpi-card-progress">
          <div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width:${Math.min(progress,100)}%"></div></div>
          <span>${progress}%</span>
        </div>
        <div class="kpi-card-spi ${spiCls}">SPI ${spiVal}</div>
      </div>`;
  }).join("");

  // 히트맵 테이블
  const projectNames = [...new Set(heatmap.map((h) => h.project_name))];
  const phaseNames   = [...new Set(heatmap.map((h) => h.phase_name))];
  const lookup = {};
  heatmap.forEach((h) => { lookup[`${h.project_name}||${h.phase_name}`] = h.avg_progress; });

  const heatmapHtml = projectNames.length && phaseNames.length ? `
    <div class="heatmap-wrap">
      <p class="kpi-section-label">단계별 진척 히트맵</p>
      <table class="heatmap-table">
        <thead><tr><th></th>${phaseNames.map((p) => `<th>${escapeHtml(p)}</th>`).join("")}</tr></thead>
        <tbody>${projectNames.map((proj) => `
          <tr>
            <td class="heatmap-proj">${escapeHtml(proj)}</td>
            ${phaseNames.map((ph) => {
              const v = lookup[`${proj}||${ph}`] ?? null;
              const bg = v == null ? "#f5f5f7"
                : v >= 80 ? "#dcfce7" : v >= 50 ? "#fef9c3" : v > 0 ? "#fee2e2" : "#f5f5f7";
              return `<td class="heatmap-cell" style="background:${bg}" title="${v != null ? v + "%" : "—"}">${v != null ? v + "%" : "—"}</td>`;
            }).join("")}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  banner.innerHTML = `
    <div class="kpi-section">
      <p class="kpi-section-label">프로젝트 진척 현황</p>
      <div class="kpi-project-list">${kpiCards || "<p style='color:var(--text-muted);font-size:0.82rem'>진행 중인 프로젝트가 없습니다.</p>"}</div>
    </div>
    ${heatmapHtml}
  `;
}

function renderPortfolioFilter() {
  document.querySelectorAll("#portfolioFilter .filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === state.portfolioFilter);
  });

  const ownerSelect = document.querySelector("#portfolioOwnerFilter");
  if (ownerSelect) {
    const all = state.apiConnected ? state.projects : state.projects.length ? state.projects : fallbackProjects;
    const owners = [...new Set(all.map((p) => p.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    const current = owners.includes(state.portfolioOwnerFilter) ? state.portfolioOwnerFilter : "";
    if (state.portfolioOwnerFilter !== current) state.portfolioOwnerFilter = current;
    ownerSelect.innerHTML = [
      `<option value="">담당자 전체</option>`,
      ...owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`),
    ].join("");
    ownerSelect.value = current;
  }

  document.querySelectorAll("[data-project-sort]").forEach((btn) => {
    const key = btn.dataset.projectSort;
    const active = key === state.portfolioSortKey;
    btn.classList.toggle("active", active);
    const icon = btn.querySelector("span");
    if (icon) icon.textContent = active ? (state.portfolioSortDir === "asc" ? "↑" : "↓") : "";
  });
}

/* ── 프로젝트 현황: 전사 탭 (프로젝트 목록 / 변경요청) ── */

function crStatusGroup(status) {
  if (status === "Approved" || status === "승인") return "approved";
  if (status === "Rejected" || status === "Withdrawn" || status === "반려") return "rejected";
  return "open"; // Open, 등록
}

function applyPortfolioTab() {
  document.querySelectorAll("#portfolioTabBar .portfolio-tab").forEach((btn) => {
    const active = btn.dataset.portfolioTab === state.portfolioTab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  const isList = state.portfolioTab !== "cr";
  const headerRight = document.querySelector("#portfolioHeaderRight");
  const listView    = document.querySelector("#portfolioListView");
  const crView      = document.querySelector("#portfolioCrView");
  if (headerRight) headerRight.hidden = !isList;
  if (listView)    listView.hidden    = !isList;
  if (crView)      crView.hidden      = isList;
  if (!isList) renderPortfolioCrTab();
}

async function renderPortfolioCrTab() {
  const tbody   = document.querySelector("#portfolioCrRows");
  const countEl = document.querySelector("#portfolioCrCount");
  if (!tbody) return;

  if (!state.portfolioCr) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">불러오는 중…</td></tr>`;
    try {
      state.portfolioCr = await request("/api/change-requests");
    } catch {
      state.portfolioCr = { project_change_requests: [], item_change_requests: [] };
    }
  }

  document.querySelectorAll("#portfolioCrFilter .filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.crFilter === state.portfolioCrFilter);
  });

  const all = [
    ...(state.portfolioCr.project_change_requests || []),
    ...(state.portfolioCr.item_change_requests || []),
  ];
  const filter = state.portfolioCrFilter || "all";
  const filtered = filter === "all" ? all : all.filter((cr) => crStatusGroup(cr.status) === filter);
  filtered.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  if (countEl) countEl.textContent = `${filtered.length}건`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">등록된 변경요청이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((cr) => {
    const sourceLabel = cr.source === "project" ? "프로젝트" : "작업";
    const sourceCls   = cr.source === "project" ? "source-project" : "source-item";
    const sg          = crStatusGroup(cr.status);
    const dateStr     = String(cr.created_at || "").substring(0, 10);
    return `<tr class="ri-click-row" tabindex="0" data-cr-project="${escapeHtml(cr.project_id || "")}" data-cr-source="${cr.source}">
      <td><span class="cr-source-badge ${sourceCls}">${sourceLabel}</span></td>
      <td>${escapeHtml(cr.project_name || "-")}</td>
      <td>${escapeHtml(cr.wbs_code || "-")}</td>
      <td>${escapeHtml(cr.title || "-")}</td>
      <td>${escapeHtml(cr.priority || "-")}</td>
      <td><span class="ri-status-pill cr-st-${sg}">${escapeHtml(cr.status || "-")}</span></td>
      <td>${escapeHtml(cr.requested_by || "-")}</td>
      <td>${dateStr || "-"}</td>
    </tr>`;
  }).join("");
}

document.querySelector("#portfolioTabBar")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".portfolio-tab[data-portfolio-tab]");
  if (!btn) return;
  state.portfolioTab = btn.dataset.portfolioTab;
  applyPortfolioTab();
});

document.querySelector("#portfolioCrFilter")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn[data-cr-filter]");
  if (!btn) return;
  state.portfolioCrFilter = btn.dataset.crFilter;
  renderPortfolioCrTab();
});

document.querySelector("#portfolioCrRows")?.addEventListener("click", (e) => {
  const row = e.target.closest("[data-cr-project]");
  const projectId = row?.dataset.crProject;
  if (!projectId) return;
  if (row.dataset.crSource === "project") {
    openProjectDetailToTab(projectId, "cr");
  } else {
    applyPortalView("#wbs-plan", { behavior: "smooth" });
    const select = document.querySelector("#wbsPlanProjectSelect");
    if (select) select.value = projectId;
    if (projectId !== state.wbsPlanProjectId) loadWbsPlanProject(projectId);
  }
});

/* ── 공지사항 게시판 ── */

function sortAnnouncements(list) {
  return [...list].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

function renderAnnouncementsPanel() {
  const list = document.querySelector("#announceList");
  if (!list) return;

  const createBtn = document.querySelector("#createAnnouncementBtn");
  if (createBtn) createBtn.style.display = canMutateWork() ? "" : "none";

  const filterSelect = document.querySelector("#announceFilter");
  if (filterSelect && filterSelect.value !== state.announceFilter) {
    filterSelect.value = state.announceFilter;
  }

  const all = sortAnnouncements(state.announcements || []);
  const filtered = state.announceFilter === "tenant"
    ? all.filter((a) => !a.project_id)
    : state.announceFilter === "project"
      ? all.filter((a) => a.project_id)
      : all;

  const countEl = document.querySelector("#announceCount");
  if (countEl) countEl.textContent = `${filtered.length}건`;

  if (!filtered.length) {
    list.innerHTML = `<div class="announce-empty">등록된 공지가 없습니다.</div>`;
    return;
  }

  list.innerHTML = filtered.map((a) => {
    const scopeCls = a.project_id ? "scope-project" : "scope-tenant";
    const scopeLabel = a.project_id ? (a.project_name || "프로젝트") : "전사";
    return `<article class="announce-card ${a.pinned ? "pinned" : ""}" data-announce-id="${escapeHtml(a.id)}">
      <div class="announce-card-head">
        ${a.pinned ? `<span class="announce-pin-badge">📌 고정</span>` : ""}
        <span class="announce-scope-badge ${scopeCls}">${escapeHtml(scopeLabel)}</span>
        <h3 class="announce-card-title">${escapeHtml(a.title)}</h3>
        <div class="announce-card-meta">
          <span>${escapeHtml(a.author_name || "-")}</span>
          <span>·</span>
          <span>${formatTimestamp(a.created_at)}</span>
        </div>
      </div>
    </article>`;
  }).join("");
}

function openAnnounceDetail(announcement) {
  const dialog = document.querySelector("#announceDetailDialog");
  if (!dialog || !announcement) return;

  const userId = state.currentUser?.id;
  const isAdmin = state.currentUser?.role === "admin";
  const canManage = isAdmin || String(announcement.author_id) === String(userId);

  document.querySelector("#announceDetailTitle").textContent = announcement.title || "";

  const scopeCls = announcement.project_id ? "scope-project" : "scope-tenant";
  const scopeLabel = announcement.project_id ? (announcement.project_name || "프로젝트") : "전사";
  const scopeEl = document.querySelector("#announceDetailScope");
  scopeEl.textContent = scopeLabel;
  scopeEl.className = `announce-scope-badge ${scopeCls}`;

  document.querySelector("#announceDetailInfo").textContent =
    `${announcement.author_name || "-"} · ${formatTimestamp(announcement.created_at)}`;

  document.querySelector("#announceDetailBody").textContent = announcement.body || "";

  const pinWrap = document.querySelector("#announceDetailPinWrap");
  const pinCheck = document.querySelector("#announceDetailPinned");
  pinWrap.style.display = canManage ? "" : "none";
  pinCheck.checked = !!announcement.pinned;
  pinCheck.dataset.announceId = announcement.id;

  const editBtn = document.querySelector("#announceDetailEdit");
  const delBtn = document.querySelector("#announceDetailDelete");
  editBtn.style.display = canManage ? "" : "none";
  delBtn.style.display = canManage ? "" : "none";
  editBtn.dataset.announceId = announcement.id;
  delBtn.dataset.announceId = announcement.id;

  dialog.showModal();
}

function openAnnounceDialog(announcement = null) {
  const dialog = document.querySelector("#announceDialog");
  const form = document.querySelector("#announceForm");
  const status = document.querySelector("#announceFormStatus");
  if (!dialog || !form) return;
  form.reset();
  if (status) status.textContent = "";

  const titleEl = document.querySelector("#announceDialogTitle");
  const scopeSelect = document.querySelector("#announceScope");
  const tenantWideCheck = document.querySelector("#announceTenantWide");
  const hasProjects = state.projects.length > 0;
  if (scopeSelect) {
    scopeSelect.innerHTML = hasProjects
      ? state.projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("")
      : `<option value="">(선택 가능한 프로젝트 없음)</option>`;
  }

  state.announceEditId = announcement?.id || null;
  if (titleEl) titleEl.textContent = announcement ? "공지 수정" : "새 공지 작성";

  if (announcement) {
    document.querySelector("#announceTitle").value = announcement.title || "";
    document.querySelector("#announceBody").value = announcement.body || "";
    document.querySelector("#announcePinned").checked = !!announcement.pinned;
    if (scopeSelect) {
      scopeSelect.value = announcement.project_id || "";
      scopeSelect.disabled = true; // 등록 후 대상 변경 불가
    }
    if (tenantWideCheck) {
      tenantWideCheck.checked = !announcement.project_id;
      tenantWideCheck.disabled = true;
    }
  } else {
    if (tenantWideCheck) {
      tenantWideCheck.checked = true;
      tenantWideCheck.disabled = !hasProjects;
    }
    if (scopeSelect) scopeSelect.disabled = true;
  }

  dialog.showModal();
}

document.querySelector("#announceTenantWide")?.addEventListener("change", (e) => {
  const scopeSelect = document.querySelector("#announceScope");
  if (scopeSelect) scopeSelect.disabled = e.target.checked;
});

document.querySelector("#announceFilter")?.addEventListener("change", (e) => {
  state.announceFilter = e.target.value;
  renderAnnouncementsPanel();
});

document.querySelector("#announceList")?.addEventListener("click", (e) => {
  const card = e.target.closest(".announce-card");
  if (!card) return;
  const item = state.announcements.find((a) => a.id === card.dataset.announceId);
  if (item) openAnnounceDetail(item);
});

// 공지 상세 보기 다이얼로그
(function initAnnounceDetailDialog() {
  const dialog = document.querySelector("#announceDetailDialog");
  if (!dialog) return;
  const cancelBtn = document.querySelector("#announceDetailCancel");
  const closeBtn = document.querySelector("#announceDetailClose");
  const editBtn = document.querySelector("#announceDetailEdit");
  const delBtn = document.querySelector("#announceDetailDelete");
  const pinCheck = document.querySelector("#announceDetailPinned");

  cancelBtn?.addEventListener("click", () => dialog.close());
  closeBtn?.addEventListener("click", () => dialog.close());

  pinCheck?.addEventListener("change", async (e) => {
    const id = e.target.dataset.announceId;
    const checked = e.target.checked;
    try {
      const updated = await request(`/api/announcements/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ pinned: checked }),
      });
      state.announcements = state.announcements.map((a) => a.id === id ? { ...a, ...updated } : a);
      renderAnnouncementsPanel();
    } catch (err) {
      e.target.checked = !checked;
      alert(err.message);
    }
  });

  editBtn?.addEventListener("click", () => {
    const item = state.announcements.find((a) => a.id === editBtn.dataset.announceId);
    dialog.close();
    if (item) openAnnounceDialog(item);
  });

  delBtn?.addEventListener("click", async () => {
    const id = delBtn.dataset.announceId;
    if (!confirm("이 공지를 삭제하시겠습니까?")) return;
    try {
      await request(`/api/announcements/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.announcements = state.announcements.filter((a) => a.id !== id);
      dialog.close();
      renderAnnouncementsPanel();
    } catch (err) {
      alert(err.message);
    }
  });
})();

// 공지 작성/수정 다이얼로그
(function initAnnounceDialog() {
  const openBtn = document.querySelector("#createAnnouncementBtn");
  const dialog  = document.querySelector("#announceDialog");
  const form    = document.querySelector("#announceForm");
  const cancelBtn = document.querySelector("#announceDialogCancel");
  const closeBtn  = document.querySelector("#announceDialogClose");
  const status    = document.querySelector("#announceFormStatus");
  if (!dialog) return;

  openBtn?.addEventListener("click", () => openAnnounceDialog());
  cancelBtn?.addEventListener("click", () => dialog.close());
  closeBtn?.addEventListener("click",  () => dialog.close());

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.querySelector("#announceDialogSubmit");
    submitBtn.disabled = true;
    if (status) status.textContent = "";

    const title  = document.querySelector("#announceTitle").value.trim();
    const body   = document.querySelector("#announceBody").value.trim();
    const pinned = document.querySelector("#announcePinned").checked;

    try {
      if (state.announceEditId) {
        const updated = await request(`/api/announcements/${encodeURIComponent(state.announceEditId)}`, {
          method: "PATCH", body: JSON.stringify({ title, body, pinned }),
        });
        state.announcements = state.announcements.map((a) => a.id === updated.id ? updated : a);
      } else {
        const tenantWide = document.querySelector("#announceTenantWide").checked;
        const projectId = tenantWide ? null : (document.querySelector("#announceScope").value || null);
        const created = await request("/api/announcements", {
          method: "POST",
          body: JSON.stringify({ title, body, pinned, project_id: projectId }),
        });
        state.announcements = [created, ...state.announcements];
      }
      dialog.close();
      renderAnnouncementsPanel();
    } catch (err) {
      if (status) status.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

function renderTemplates() {
  setWbsListTab(state.wbsListTab || "standard");
  /* ── 표준 WBS 목록 ── */
  const templateList = document.querySelector("#templateList");
  if (templateList) {
    const groups = groupByDeliveryMode([...state.templates].sort(compareTemplates), templateDeliveryMode);
    templateList.innerHTML = groups.map(({ mode, items }) => `
      <section class="wbs-mode-group mode-${mode}" aria-label="${escapeHtml(deliveryModeLabel(mode))} 표준 WBS">
        <div class="wbs-mode-header">
          ${renderDeliveryModeBadge(mode, "mode-large")}
          <div>
            <span>${escapeHtml(DELIVERY_MODE_DESCRIPTIONS[mode] || "")}</span>
          </div>
          <em>${items.length}개 템플릿</em>
        </div>
        <div class="template-mode-list">
          ${items.map((template) => {
            const templateMode = templateDeliveryMode(template);
            const typeLabel = projectTypeLabel(template.project_type);
            const itemCount = template.item_count ? `${template.item_count}개 항목` : "-";
            return `
              <div class="template-card template-card-standard mode-${templateMode}">
                ${renderDeliveryModeBadge(templateMode)}
                <strong class="template-card-title">${escapeHtml(template.name)}</strong>
                <span class="template-card-type">${escapeHtml(typeLabel)}</span>
                <span class="template-card-count">${escapeHtml(itemCount)}</span>
                <span class="template-card-tenant">${renderTenantBadge(template.tenant_id)}</span>
                <p class="template-card-description">${escapeHtml(template.description)}</p>
                <div class="template-card-actions">
                  <button class="secondary-button" type="button"
                    data-template-preview="${escapeHtml(template.key)}"
                    title="웹에서 미리보기">🔍 미리보기</button>
                  <button class="secondary-button" type="button"
                    data-template-download="${escapeHtml(template.key)}"
                    title="${escapeHtml(template.name)} Excel 다운로드">↓ Excel</button>
                </div>
              </div>`;
          }).join("")}
        </div>
      </section>
    `).join("");
  }

  /* ── 일반 WBS (프로젝트별) 목록 ── */
  renderCustomWbsList();
}

function setWbsListTab(tabId) {
  const nextTab = tabId === "custom" ? "custom" : "standard";
  state.wbsListTab = nextTab;
  document.querySelectorAll("[data-wbs-list-tab]").forEach((btn) => {
    const isActive = btn.dataset.wbsListTab === nextTab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document.querySelectorAll("[data-wbs-list-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.wbsListPanel !== nextTab;
  });
}

function renderCustomWbsList() {
  const container = document.querySelector("#customWbsList");
  if (!container) return;

  const projects = state.apiConnected ? state.projects : fallbackProjects;
  if (!projects.length) {
    container.innerHTML = `<div class="custom-wbs-empty">등록된 프로젝트가 없습니다. 프로젝트를 먼저 생성하세요.</div>`;
    return;
  }

  const sortedProjects = [...projects].sort(compareProjectsForWbsList);
  const groups = groupByDeliveryMode(sortedProjects, projectDeliveryMode);
  container.innerHTML = groups.map(({ mode, items }) => `
    <section class="wbs-mode-group mode-${mode}" aria-label="${escapeHtml(deliveryModeLabel(mode))} 일반 WBS">
      <div class="wbs-mode-header">
        ${renderDeliveryModeBadge(mode, "mode-large")}
        <div>
          <span>${escapeHtml(DELIVERY_MODE_DESCRIPTIONS[mode] || "")}</span>
        </div>
        <em>${items.length}개 프로젝트</em>
      </div>
      <div class="template-mode-list">
        ${items.map((p) => {
          const mode = projectDeliveryMode(p);
          const wbsCount = p.id && state.wbsPlanProjectId === p.id ? state.wbsPlanRows.length : null;
          const countText = wbsCount != null ? `WBS ${wbsCount}개` : "-";
          const meta = p.metadata || {};
          return `
            <div class="template-card template-card-custom mode-${mode}">
              ${renderDeliveryModeBadge(mode)}
              <strong class="template-card-title">${escapeHtml(p.name)}</strong>
              <span class="template-card-type">${escapeHtml(projectTemplateLabel(p))}</span>
              <span class="template-card-count">${escapeHtml(countText)}</span>
              <span class="template-card-tenant">${renderTenantBadge(p.tenant_id)}</span>
              <p class="template-card-description">${escapeHtml(meta.description || "-")}</p>
              <span class="status-pill ${statusClass(p.status)}" style="flex-shrink:0">${statusLabel(p.status)}</span>
              <div class="template-card-actions">
                <button class="secondary-button" type="button"
                  data-custom-wbs-preview="${escapeHtml(p.id || "")}"
                  ${p.id ? "" : "disabled"}
                  title="${escapeHtml(p.name)} WBS 미리보기">🔍 미리보기</button>
                <button class="secondary-button" type="button"
                  data-custom-wbs-upload="${escapeHtml(p.id || "")}"
                  ${(p.id && ["Draft","Review","Rejected"].includes(p.status) && canMutateWork()) ? "" : "disabled"}>↑ Excel</button>
              </div>
            </div>`;
        }).join("")}
      </div>
    </section>
  `).join("");
}

/* 일반 WBS 목록에서 빠른 업로드 (선택 프로젝트 → Excel 업로드 탭 이동) */
function openCustomWbsUploadTab(projectId) {
  // Excel 업로드 탭 활성화
  document.querySelectorAll(".tpl-tab").forEach((btn) => {
    const isImport = btn.dataset.tplTab === "import";
    btn.classList.toggle("active", isImport);
    btn.setAttribute("aria-selected", isImport ? "true" : "false");
  });
  document.querySelector("#templates").dataset.activeTab = "import";
  document.getElementById("tplTabList").hidden   = true;
  document.getElementById("tplTabImport").hidden = false;
  // 일반 WBS 모드 선택
  setImportType("custom");
  // 프로젝트 선택
  const sel = document.querySelector("#importProjectSelect");
  if (sel && projectId) sel.value = projectId;
}

/* 일반 WBS 미리보기 — templateDrawer 재사용 */
async function openProjectWbsPreview(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;

  const drawer = document.querySelector("#templateDrawer");
  document.querySelector("#templateDrawerTitle").textContent = project.name;
  document.querySelector("#templateDrawerEyebrow").textContent =
    `일반 WBS · ${projectTypeLabel(project.template_key)} · ${statusLabel(project.status)}`;
  document.querySelector("#templateDrawerDownload").dataset.templateKey = project.template_key;
  document.querySelector("#templateDrawerContent").innerHTML =
    `<div class="template-preview-loading">WBS 항목 불러오는 중…</div>`;
  drawer.hidden = false;

  try {
    // 캐시된 데이터 우선 사용
    let rows = state.wbsPlanProjectId === projectId ? state.wbsPlanRows : null;
    if (!rows || !rows.length) {
      rows = await request(`/api/projects/${encodeURIComponent(projectId)}/wbs-items`);
    }

    if (!rows || !rows.length) {
      document.querySelector("#templateDrawerContent").innerHTML =
        `<div class="wbs-board-empty"><strong>WBS 항목 없음</strong><span>Excel 업로드 또는 WBS 관리 메뉴에서 항목을 추가하세요.</span></div>`;
      return;
    }

    // 표준 WBS 렌더러 재사용 (template 객체 대신 project 메타로 요약)
    const fakeTemplate = {
      name: project.name,
      project_type: project.template_key,
      description: project.metadata?.description || "",
      phases: state.templates.find((t) => t.key === project.template_key)?.phases || [],
    };
    renderTemplatePreview(fakeTemplate, rows);
  } catch (error) {
    document.querySelector("#templateDrawerContent").innerHTML =
      `<p style="color:var(--red);padding:16px">${escapeHtml(error.message)}</p>`;
  }
}

/* ══════════════════════════════════════════════════════
   표준 WBS 미리보기 드로어
══════════════════════════════════════════════════════ */

function openTemplateDrawer(templateKey) {
  const template = state.templates.find((t) => t.key === templateKey);
  if (!template) return;

  const drawer = document.querySelector("#templateDrawer");
  document.querySelector("#templateDrawerTitle").textContent = template.name;
  document.querySelector("#templateDrawerEyebrow").textContent = `표준 WBS · ${projectTypeLabel(template.project_type)}`;
  document.querySelector("#templateDrawerDownload").dataset.templateKey = templateKey;
  document.querySelector("#templateDrawerContent").innerHTML = `<div class="template-preview-loading">항목 불러오는 중…</div>`;
  drawer.hidden = false;

  // 비동기로 항목 로드
  loadTemplatePreview(templateKey, template);
}

function closeTemplateDrawer() {
  document.querySelector("#templateDrawer").hidden = true;
}

async function loadTemplatePreview(templateKey, template) {
  try {
    const data = await request(`/api/templates/${encodeURIComponent(templateKey)}/items`);
    renderTemplatePreview(data.template || template, data.rows || []);
  } catch (error) {
    document.querySelector("#templateDrawerContent").innerHTML =
      `<p style="color:var(--red);padding:16px">${escapeHtml(error.message)}</p>`;
  }
}

function renderTemplatePreview(template, rows) {
  const content = document.querySelector("#templateDrawerContent");
  if (!content) return;

  const rowByCode = new Map(rows.map((r) => [r.code, r]));
  const childMap  = {};
  rows.forEach((r) => {
    if (r.parent_code) {
      if (!childMap[r.parent_code]) childMap[r.parent_code] = [];
      childMap[r.parent_code].push(r.code);
    }
  });

  // 유형별 통계
  const typeCounts = {};
  rows.forEach((r) => { typeCounts[r.item_type || "작업"] = (typeCounts[r.item_type || "작업"] || 0) + 1; });

  // 단계별 가중치
  const phases = template.phases || [];

  // 요약
  const summaryHtml = `
    <div class="drawer-section">
      <h3 class="drawer-section-title">개요</h3>
      <div class="tpl-summary">
        <dl class="tpl-summary-item"><dt>유형</dt><dd>${escapeHtml(projectTypeLabel(template.project_type))}</dd></dl>
        <dl class="tpl-summary-item"><dt>전체 항목</dt><dd>${rows.length}개</dd></dl>
        ${Object.entries(typeCounts).map(([type, cnt]) =>
          `<dl class="tpl-summary-item"><dt>${escapeHtml(itemTypeLabel(type))}</dt><dd>${cnt}개</dd></dl>`
        ).join("")}
      </div>
      <p style="font-size:0.82rem;color:var(--text-muted);margin:0">${escapeHtml(template.description || "")}</p>
    </div>`;

  // 단계 범례 (가중치 바)
  const phaseLegend = phases.length ? `
    <div class="drawer-section">
      <h3 class="drawer-section-title">단계 구성</h3>
      <div class="drawer-phase-bar">
        ${phases.map((ph) => `
          <div class="drawer-phase-row">
            <span>${escapeHtml(ph.name)}</span>
            <div class="drawer-phase-track"><div class="drawer-phase-fill" style="width:${ph.weight || 0}%"></div></div>
            <span>${ph.weight || 0}%</span>
          </div>`).join("")}
      </div>
    </div>` : "";

  // 계층 트리 렌더링 (DFS)
  const treeItems = [];
  const visited   = new Set();

  function getDepth(row) {
    let d = 0, cur = row, seen = new Set([row.code]);
    while (cur?.parent_code && !seen.has(cur.parent_code)) {
      seen.add(cur.parent_code); cur = rowByCode.get(cur.parent_code); d++;
    }
    return d;
  }

  function walk(code) {
    if (visited.has(code)) return;
    visited.add(code);
    const row = rowByCode.get(code);
    if (!row) return;
    const depth = getDepth(row);
    const meta = row.metadata || {};
    const hasInspect = meta.inspection_required;
    const hasDeliverable = meta.deliverable_type;

    treeItems.push(`
      <div class="tpl-tree-item" data-type="${escapeHtml(row.item_type || "작업")}" style="--depth:${depth}">
        <div class="tpl-item-indent">${depth > 0 ? "└" : ""}</div>
        <div class="tpl-item-body">
          <code class="tpl-item-code">${escapeHtml(row.code)}</code>
          <span class="tpl-item-name">${escapeHtml(row.name)}</span>
          <div class="tpl-item-meta">
            <span class="tpl-type-badge">${escapeHtml(itemTypeLabel(row.item_type || "작업"))}</span>
            ${row.weight != null ? `<span class="tpl-weight">${row.weight}%</span>` : ""}
            ${hasDeliverable ? `<span class="tpl-type-badge" style="--tc:#6264a7">📄 ${escapeHtml(hasDeliverable)}</span>` : ""}
            ${hasInspect    ? `<span class="tpl-inspect-badge">✓ 검수</span>` : ""}
          </div>
        </div>
      </div>`);

    (childMap[code] || []).forEach((childCode) => walk(childCode));
  }

  rows.filter((r) => !r.parent_code).forEach((r) => { if (r.code) walk(r.code); });
  rows.forEach((r) => { if (!visited.has(r.code)) {
    treeItems.push(`<div class="tpl-tree-item" data-type="${escapeHtml(r.item_type||"작업")}" style="--depth:0">
      <div class="tpl-item-indent"></div>
      <div class="tpl-item-body"><code class="tpl-item-code">${escapeHtml(r.code)}</code><span class="tpl-item-name">${escapeHtml(r.name)}</span></div>
    </div>`);
  }});

  const treeHtml = `
    <div class="drawer-section">
      <h3 class="drawer-section-title">WBS 항목 (${rows.length}개)</h3>
      <div class="tpl-tree">${treeItems.join("")}</div>
    </div>`;

  content.innerHTML = summaryHtml + phaseLegend + treeHtml;
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
  // #projectWbsSearchInput 등 DOM이 제거됨 — 무시
}

const PORTFOLIO_FILTER_STATUSES = {
  all:      null,
  active:   ["Draft", "Review", "Approved"],
  closed:   ["Synced", "Closed"],
  rejected: ["Rejected"],
};

const PHASE_COLORS = ["#0071e3", "#1f9d55", "#b7791f", "#7356bf", "#d92d20", "#0891b2", "#9333ea"];

function renderPhaseBar(plan) {
  const bar = document.querySelector("#projectPhaseBar");
  if (!bar) return;
  const phases = plan?.template?.phases || [];
  if (!phases.length) { bar.hidden = true; return; }
  const total = phases.reduce((s, p) => s + (p.weight || 0), 0) || 100;
  bar.innerHTML = phases.map((phase, i) => {
    const pct = ((phase.weight || 0) / total * 100).toFixed(1);
    const col = PHASE_COLORS[i % PHASE_COLORS.length];
    return `<div class="phase-bar-segment" style="flex:${pct};background:${col}" title="${escapeHtml(phase.name)} ${pct}%">${pct > 8 ? escapeHtml(phase.name) : ""}</div>`;
  }).join("");
  bar.hidden = false;
}

function comparePortfolioProjects(a, b) {
  const key = state.portfolioSortKey || "name";
  const dir = state.portfolioSortDir === "desc" ? -1 : 1;
  const valueFor = (project) => {
    if (key === "status") return statusLabel(project.status);
    if (key === "template_key") return projectTypeLabel(project.template_key);
    return project[key] || "";
  };
  const av = valueFor(a);
  const bv = valueFor(b);
  if (key === "start_date") {
    return ((new Date(av || "1900-01-01")) - (new Date(bv || "1900-01-01"))) * dir;
  }
  return String(av).localeCompare(String(bv), "ko") * dir;
}

function renderProjects() {
  const all = state.apiConnected ? state.projects : state.projects.length ? state.projects : fallbackProjects;
  const allowedStatuses = PORTFOLIO_FILTER_STATUSES[state.portfolioFilter];
  const filteredByStatus = allowedStatuses ? all.filter((p) => allowedStatuses.includes(p.status)) : all;
  const filteredByOwner = state.portfolioOwnerFilter
    ? filteredByStatus.filter((p) => (p.owner || "") === state.portfolioOwnerFilter)
    : filteredByStatus;
  const rows = [...filteredByOwner].sort(comparePortfolioProjects);
  const canMutate = canMutateWork();

  renderPortfolioFilter();

  document.querySelector("#projectRows").innerHTML = rows.length
    ? rows.map((project) => {
        const canRequestApproval = canMutate && project.id && ["Draft", "Rejected", "Review"].includes(project.status);
        const isSelected = project.id && project.id === state.selectedProjectId;
        const approvalActionLabel = project.status === "Approved"
          ? "승인 완료"
          : project.status === "Review"
            ? "승인 요청 중"
            : canRequestApproval ? "승인 요청" : "승인 대기";
        const riCounts = projectRiCounts(project.id);
        return `
          <tr class="${isSelected ? "selected-row" : ""}">
            <td>
              <span class="project-name-link"
                data-project-action="detail" data-project-id="${project.id || ""}"
                role="button" tabindex="0">${escapeHtml(project.name)}</span>
            </td>
            <td>${escapeHtml(project.owner)}</td>
            <td><span class="status-pill ${statusClass(project.status)}">${statusLabel(project.status)}</span></td>
            <td>${renderTenantBadge(project.tenant_id)}</td>
            <td>${escapeHtml(projectTypeLabel(project.template_key))}</td>
            <td>${escapeHtml(project.start_date || "-")}</td>
            <td>
              <div class="ri-count-group">
                ${riCountButton({ type: "risks", count: riCounts.risks, projectId: project.id, label: "R" })}
                ${riCountButton({ type: "issues", count: riCounts.issues, projectId: project.id, label: "I" })}
              </div>
            </td>
            <td>
              <div class="table-actions">
                <button class="table-action" type="button"
                  data-project-action="plan" data-project-id="${project.id || ""}"
                  ${project.id ? "" : "disabled"}>WBS 관리</button>
                <button class="table-action" type="button"
                  data-project-action="approval" data-project-id="${project.id || ""}"
                  ${canRequestApproval ? "" : "disabled"}>${escapeHtml(approvalActionLabel)}</button>
              </div>
            </td>
          </tr>`;
      }).join("")
    : `<tr class="empty-row"><td colspan="8">${
        allowedStatuses || state.portfolioOwnerFilter ? "조건에 맞는 프로젝트 없음" : "등록된 프로젝트 없음"
      }</td></tr>`;
}

function renderProjectPlan() {
  // WBS 계획은 #wbs-plan 패널(renderWbsPlan)에서 처리
}

/* ══════════════════════════════════════════════════════
   프로젝트 상세 드로어
══════════════════════════════════════════════════════ */

function openProjectDrawer(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;

  document.querySelector("#drawerProjectName").textContent = project.name;
  const statusEl = document.querySelector("#drawerProjectStatus");
  statusEl.textContent = statusLabel(project.status);
  statusEl.className = `status-pill ${statusClass(project.status)}`;

  renderProjectDrawerContent(project);

  const drawer = document.querySelector("#projectDrawer");
  drawer.hidden = false;
  document.querySelector("#drawerClose").focus();
}

function closeProjectDrawer() {
  document.querySelector("#projectDrawer").hidden = true;
}

function renderProjectDrawerContent(project) {
  const meta = project.metadata || {};
  const canMutate = canMutateWork();
  const canRequestApproval = canMutate && project.id && ["Draft", "Rejected", "Review"].includes(project.status);

  // 관련 승인 이력
  const relatedApprovals = state.approvals.filter((a) => a.project_id === project.id || a.project_name === project.name).slice(0, 3);

  // WBS 현황 (state.wbsPlanRows가 있는 경우)
  const wbsRows = state.wbsPlanProjectId === project.id ? state.wbsPlanRows : [];
  const wbsSummary = wbsRows.length
    ? (() => {
        const phases = wbsRows.filter((r) => r.item_type === "단계");
        const tasks  = wbsRows.filter((r) => r.item_type === "작업");
        const miles  = wbsRows.filter((r) => r.item_type === "마일스톤");
        return `${wbsRows.length}개 항목 (단계 ${phases.length} / 작업 ${tasks.length} / 마일스톤 ${miles.length})`;
      })()
    : null;

  const template = state.templates.find((t) => t.key === project.template_key);
  const phases = template?.phases || [];

  document.querySelector("#drawerContent").innerHTML = `
    <!-- 빠른 액션 -->
    <div class="drawer-section">
      <div class="drawer-actions">
        <button type="button" class="primary-action" data-drawer-action="wbs" data-project-id="${escapeHtml(project.id)}">WBS 관리 열기</button>
        <button type="button" data-drawer-action="workboard" data-project-id="${escapeHtml(project.id)}">작업 현황</button>
        <button type="button" data-drawer-action="approval" data-project-id="${escapeHtml(project.id)}" ${canRequestApproval ? "" : "disabled"}>승인 요청</button>
        <button type="button" data-drawer-action="sync" data-project-id="${escapeHtml(project.id)}">외부 연동</button>
      </div>
    </div>

    <!-- 기본 정보 -->
    <div class="drawer-section">
      <h3 class="drawer-section-title">기본 정보</h3>
      <div class="drawer-info-grid">
        <dl class="drawer-info-item">
          <dt>담당자</dt>
          <dd>${escapeHtml(project.owner || "-")}</dd>
        </dl>
        <dl class="drawer-info-item">
          <dt>PM</dt>
          <dd>${escapeHtml(meta.project_manager || "-")}</dd>
        </dl>
        <dl class="drawer-info-item">
          <dt>시작일</dt>
          <dd>${escapeHtml(project.start_date || "-")}</dd>
        </dl>
        <dl class="drawer-info-item">
          <dt>종료 예정일</dt>
          <dd>${escapeHtml(meta.end_date || "-")}</dd>
        </dl>
        <dl class="drawer-info-item">
          <dt>고객사 / 발주처</dt>
          <dd>${escapeHtml(meta.client_name || "-")}</dd>
        </dl>
        <dl class="drawer-info-item">
          <dt>예산</dt>
          <dd>${escapeHtml(meta.budget || "-")}</dd>
        </dl>
        <dl class="drawer-info-item">
          <dt>유형</dt>
          <dd>${escapeHtml(projectTypeLabel(project.template_key))}</dd>
        </dl>
        <dl class="drawer-info-item">
          <dt>외부 연동 ID</dt>
          <dd>${project.openproject_project_id ? `#${escapeHtml(project.openproject_project_id)}` : "미연결"}</dd>
        </dl>
      </div>
      ${meta.description ? `
        <div>
          <p class="drawer-section-title" style="margin-bottom:6px">프로젝트 개요</p>
          <p class="drawer-description">${escapeHtml(meta.description)}</p>
        </div>` : ""}
    </div>

    <!-- 표준 WBS 단계 구성 -->
    ${phases.length ? `
    <div class="drawer-section">
      <h3 class="drawer-section-title">WBS 단계 구성 (${escapeHtml(template.name)})</h3>
      <div class="drawer-phase-bar">
        ${phases.map((ph) => `
          <div class="drawer-phase-row">
            <span>${escapeHtml(ph.name)}</span>
            <div class="drawer-phase-track">
              <div class="drawer-phase-fill" style="width:${ph.weight || 0}%"></div>
            </div>
            <span>${ph.weight || 0}%</span>
          </div>`).join("")}
      </div>
    </div>` : ""}

    <!-- WBS 현황 (로드된 경우) -->
    ${wbsSummary ? `
    <div class="drawer-section">
      <h3 class="drawer-section-title">WBS 현황</h3>
      <p style="font-size:0.86rem;color:var(--text-muted)">${escapeHtml(wbsSummary)}</p>
    </div>` : ""}

    <!-- 승인 이력 -->
    <div class="drawer-section">
      <h3 class="drawer-section-title">승인 이력</h3>
      ${relatedApprovals.length
        ? relatedApprovals.map((a) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface-muted)">
            <div>
              <strong style="font-size:0.84rem;display:block">${escapeHtml(a.title || "-")}</strong>
              <small style="color:var(--text-muted)">${escapeHtml(a.requester || "-")} · ${a.created_at ? formatTimestamp(a.created_at) : "-"}</small>
            </div>
            <span class="status-pill ${statusClass(a.status)}">${statusLabel(a.status)}</span>
          </div>`).join("")
        : `<p style="font-size:0.84rem;color:var(--text-muted)">승인 이력 없음</p>`}
    </div>
  `;
}

/* ── 승인 프로세스 단계 정의 ─────────────────────── */
/* 승인 파이프라인 3단계 (기준선 반영은 별도 배지) */
const PIPE_STEPS = [
  { label: "초안", statuses: ["Draft"] },
  { label: "검토", statuses: ["Review"] },
  { label: "승인", statuses: ["Approved", "Synced", "Closed"] },
];

function pipeActiveIndex(status) {
  if (status === "Rejected") return 1;   // 검토 단계에서 반려
  for (let i = 0; i < PIPE_STEPS.length; i++) {
    if (PIPE_STEPS[i].statuses.includes(status)) return i;
  }
  return 0;
}

function renderApprovalPipelineCard(project, approval) {
  const canMutate   = canMutateWork();
  const activeIdx   = pipeActiveIndex(project.status);
  const isRejected  = project.status === "Rejected";
  const isPending   = approval?.status === "Pending";
  const isApproved  = project.status === "Approved" || project.status === "Synced" || project.status === "Closed";

  /* D-day */
  let ddayHtml = "";
  if (isPending && approval.due_date) {
    const days = Math.ceil((new Date(approval.due_date) - new Date()) / 86400000);
    const label = days >= 0 ? `D-${days}` : `D+${Math.abs(days)} 초과`;
    ddayHtml = `<span class="pipe-dday ${days < 0 ? "overdue" : ""}">${escapeHtml(label)}</span>`;
  }

  /* 파이프라인 스텝 HTML */
  const stepsHtml = PIPE_STEPS.map((step, idx) => {
    let dotClass = "empty";
    if (isRejected && idx === 1) dotClass = "rejected";          // 검토 단계에서 반려
    else if (idx < activeIdx)    dotClass = "done";
    else if (idx === activeIdx)  dotClass = isPending ? "pending" : "active";

    const connClass = idx < activeIdx ? "done" : "";
    const symbol    = dotClass === "done" ? "✓" : dotClass === "rejected" ? "✗" : String(idx + 1);

    return `
      <div class="pipe-step">
        <div class="pipe-dot ${dotClass}">${symbol}</div>
        <span class="pipe-step-label">${escapeHtml(step.label)}</span>
      </div>
      ${idx < PIPE_STEPS.length - 1 ? `<div class="pipe-connector ${connClass}"></div>` : ""}`;
  }).join("");

  /* 푸터 */
  let footerHtml = "";
  if (isPending && canMutate) {
    footerHtml = `
      <div class="pipe-footer-meta">
        <span class="pipe-requester">요청자: ${escapeHtml(approval.requester || "-")}</span>
        ${ddayHtml}
      </div>
      <div class="pipe-actions">
        <button class="pipe-reject-btn"  type="button"
          data-approval-action="reject"  data-approval-id="${escapeHtml(approval.id)}">반려</button>
        <button class="pipe-approve-btn" type="button"
          data-approval-action="approve" data-approval-id="${escapeHtml(approval.id)}">승인</button>
      </div>`;
  } else if (isPending && !canMutate) {
    footerHtml = `<div class="pipe-footer-meta"><span class="pipe-requester">요청자: ${escapeHtml(approval.requester || "-")}</span>${ddayHtml}<span>PMO 승인 대기 중</span></div>`;
  } else if (isApproved && approval) {
    footerHtml = `<div class="pipe-footer-meta">
      <span>${approval.decided_at ? formatTimestamp(approval.decided_at) : ""} 승인 완료</span>
      ${approval.reviewer ? `<span>· ${escapeHtml(approval.reviewer)}</span>` : ""}
    </div>`;
  } else if (isRejected && approval) {
    footerHtml = `
      <div class="pipe-footer-meta pipe-footer-rejected">
        <span>반려 · ${escapeHtml(approval.decision_comment || "WBS 수정 필요")}</span>
      </div>
      ${(canMutate && project.id) ? `
        <div class="pipe-actions">
          <button class="pipe-approve-btn" type="button" style="background:#e8f0fd;border-color:#bfdbfe;color:var(--blue)"
            data-project-action="plan" data-project-id="${escapeHtml(project.id)}">WBS 수정</button>
          <button class="pipe-approve-btn" type="button"
            data-approval-action-project="reapply" data-project-id="${escapeHtml(project.id)}">재승인 요청</button>
        </div>` : ""}`;
  } else if (!approval && project.id && ["Draft"].includes(project.status)) {
    footerHtml = `<div class="pipe-footer-meta"><span>WBS 등록 후 승인 요청 가능</span></div>`;
  }

  /* 기준선 반영 배지 (외부 연동 상태) */
  const isSynced  = project.status === "Synced" || project.status === "Closed";
  const hasSyncId = Boolean(project.openproject_project_id);
  const syncBadge = (isSynced || hasSyncId)
    ? `<span class="pipe-sync-badge ${isSynced ? "synced" : "linked"}">🔗 ${isSynced ? "기준선 반영 완료" : "외부 연동 연결됨"}</span>`
    : "";

  return `
    <div class="approval-pipe-card ${isPending ? "pending" : ""} ${isRejected ? "rejected" : ""}">
      <div class="pipe-header">
        <div class="pipe-project-info">
          <span class="pipe-project-name">${escapeHtml(project.name)}</span>
          <span class="status-pill ${statusClass(project.status)}" style="font-size:0.7rem">${statusLabel(project.status)}</span>
          ${syncBadge}
        </div>
        <span class="pipe-type">${escapeHtml(projectTypeLabel(project.template_key))}</span>
      </div>
      <div class="pipe-steps">${stepsHtml}</div>
      ${footerHtml ? `<div class="pipe-footer">${footerHtml}</div>` : ""}
    </div>`;
}

/* ── 승인 이력 공통 렌더 (뷰에 따라 파이프라인 / 테이블 분기) ── */
function renderApprovals() {
  const approvalStatus = document.querySelector("#approvalStatus");
  const pendingCount   = state.approvals.filter((a) => a.status === "Pending").length;
  approvalStatus.textContent = pendingCount ? `승인 대기 ${pendingCount}건` : "정상";
  approvalStatus.className   = `status-pill ${pendingCount ? "attention" : "stable"}`;

  const container = document.querySelector("#approvalPipelineList");
  if (!container) return;

  const viewId = document.body.dataset.portalView || "";

  if (viewId === "approvals") {
    /* ── 승인 이력 메뉴: 테이블 리스트 ── */
    renderApprovalTable(container);
  } else {
    /* ── 대시보드: 파이프라인 카드 ── */
    renderApprovalPipeline(container);
  }
}

function renderApprovalPipeline(container) {
  const projects = state.apiConnected ? state.projects : fallbackProjects;
  if (!projects.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.84rem;padding:8px">등록된 프로젝트가 없습니다.</p>`;
    return;
  }

  /* 프로젝트별 최신 승인 맵 */
  const latestApproval = {};
  state.approvals.forEach((a) => {
    const existing = latestApproval[a.project_id];
    if (!existing || new Date(a.created_at) > new Date(existing.created_at)) {
      latestApproval[a.project_id] = a;
    }
  });

  /* 정렬: 대기 먼저 → 최근 생성순 */
  const sorted = [...projects].sort((a, b) => {
    const aP = latestApproval[a.id]?.status === "Pending" ? 1 : 0;
    const bP = latestApproval[b.id]?.status === "Pending" ? 1 : 0;
    if (aP !== bP) return bP - aP;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  container.innerHTML = sorted.map((p) => renderApprovalPipelineCard(p, latestApproval[p.id])).join("");
}

function renderApprovalTable(container) {
  /* 승인 이력 메뉴: 기존 테이블 형태 */
  const rows = state.approvals.length ? state.approvals : fallbackApprovals;
  const canMutate = canMutateWork();

  container.innerHTML = `
    <div class="table-wrap">
      <table class="approval-table">
        <thead>
          <tr>
            <th>제목</th>
            <th>프로젝트</th>
            <th>상태</th>
            <th>요청자</th>
            <th>요청일</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((approval) => {
            const isPending = canMutate && approval.status === "Pending" && approval.id;
            const reqDate   = approval.created_at ? formatTimestamp(approval.created_at) : (approval.due_date || "-");
            return `
              <tr>
                <td>
                  <strong style="font-size:0.86rem;display:block">${escapeHtml(approval.title || "-")}</strong>
                  <small style="color:var(--text-muted);font-size:0.74rem">${escapeHtml(approval.request_type || "-")}</small>
                </td>
                <td>${escapeHtml(approval.project_name || "-")}</td>
                <td><span class="status-pill ${statusClass(approval.status)}">${statusLabel(approval.status)}</span></td>
                <td>${escapeHtml(approval.requester || "-")}</td>
                <td>${escapeHtml(reqDate)}</td>
                <td>
                  <div class="pipe-actions">
                    <button class="pipe-reject-btn"  type="button"
                      data-approval-action="reject"  data-approval-id="${approval.id || ""}"
                      ${isPending ? "" : "disabled"}>반려</button>
                    <button class="pipe-approve-btn" type="button"
                      data-approval-action="approve" data-approval-id="${approval.id || ""}"
                      ${isPending ? "" : "disabled"}>승인</button>
                  </div>
                </td>
              </tr>`;
          }).join("") || `<tr class="empty-row"><td colspan="6">승인 이력 없음</td></tr>`}
        </tbody>
      </table>
    </div>`;
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
  const hasPending  = Boolean(state.pendingImportJobId);
  const canMutate   = canMutateWork();

  if (state.importType === "custom") {
    const projectId = document.querySelector("#importProjectSelect")?.value;
    applyButton.disabled = !canMutate || !hasPending || !projectId;
    applyButton.textContent = "프로젝트에 반영";
  } else {
    applyButton.disabled = !canMutate || !hasPending;
    applyButton.textContent = "반영";
  }
}

function setImportType(type) {
  state.importType = type;
  const panel = document.querySelector("#tplTabImport");
  if (panel) panel.dataset.importType = type;

  // 토글 버튼 상태
  document.querySelectorAll(".type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.importType === type);
  });

  // 안내 문구 토글
  const stdNotice = document.querySelector("#importStdNotice");
  const cstNotice = document.querySelector("#importCstNotice");
  if (stdNotice) stdNotice.hidden = type !== "standard";
  if (cstNotice) cstNotice.hidden = type !== "custom";

  renderApplyButton();
}

function renderImportProjectSelect() {
  const sel = document.querySelector("#importProjectSelect");
  if (!sel) return;
  const projects = (state.apiConnected ? state.projects : fallbackProjects)
    .filter((p) => p.id && ["Draft","Review","Rejected"].includes(p.status));
  sel.innerHTML = [
    `<option value="">프로젝트 선택…</option>`,
    ...projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} [${statusLabel(p.status)}]</option>`),
  ].join("");
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
    .map((template) => `<option value="${template.key}">${escapeHtml(template.name)} · ${escapeHtml(projectTypeLabel(template.project_type))}</option>`)
    .join("");
  selector.value = state.templates.some((template) => template.key === selectedValue)
    ? selectedValue
    : defaultTemplateKey();
  syncProjectDeliveryModeWithTemplate();
}

function syncProjectDeliveryModeWithTemplate() {
  const templateSelector = document.querySelector("#projectTemplateSelect");
  const modeSelector = document.querySelector("#projectDeliveryModeInput");
  if (!templateSelector || !modeSelector) return;
  modeSelector.value = templateDeliveryModeByKey(templateSelector.value);
}

function renderSyncProjectSelect() {
  const selector = document.querySelector("#syncProjectSelect");
  const projects = state.projects.filter((project) => project.id);
  if (!externalIntegrationEnabled()) {
    selector.innerHTML = '<option value="">외부 연동 사용 안 함</option>';
    selector.disabled = true;
    ["#syncPreflightButton", "#syncDryRunButton", "#syncRunButton"].forEach((id) => {
      const el = document.querySelector(id);
      if (el) el.disabled = true;
    });
    return;
  }
  const selectedValue = state.userSelectedSyncProject && selector.value ? selector.value : projects[0]?.id || "";

  selector.innerHTML = projects.length
    ? projects
        .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
        .join("")
    : '<option value="">프로젝트 없음</option>';
  selector.value = projects.some((project) => project.id === selectedValue) ? selectedValue : projects[0]?.id || "";
  selector.disabled = !projects.length;

  const hasProject  = Boolean(selector.value);
  const canMutate   = canMutateWork();
  const canSyncAction = hasProject && canMutate;

  // 프로젝트 상태 확인 — Approved만 실제 기준선 반영 허용
  const selectedProject = state.projects.find((p) => p.id === selector.value);
  const projectStatus   = selectedProject?.status || "";
  const isApproved      = projectStatus === "Approved";
  const isSynced        = projectStatus === "Synced" || projectStatus === "Closed";

  const canActualSync = canSyncAction
    && Boolean(state.pmPreflight?.ready_for_actual_sync)
    && isApproved;

  document.querySelector("#syncPreflightButton").disabled = !canSyncAction;
  document.querySelector("#syncDryRunButton").disabled    = !canSyncAction;
  document.querySelector("#syncRunButton").disabled       = !canActualSync;

  // 기준선 반영 버튼 tooltip — 상태에 따라 안내 메시지 변경
  let syncTitle = "외부 도구에 기준선 작업 항목을 반영합니다";
  if (!state.pmPreflight?.ready_for_actual_sync) {
    syncTitle = "점검 버튼을 클릭해 연계 상태를 확인하세요";
  } else if (isSynced) {
    syncTitle = `프로젝트 상태가 '${statusLabel(projectStatus)}'입니다. 기준선 반영이 이미 완료된 프로젝트입니다.`;
  } else if (!isApproved && hasProject) {
    syncTitle = `프로젝트 상태가 '${statusLabel(projectStatus)}'입니다. 승인(Approved) 상태에서만 기준선 반영이 가능합니다.`;
  }
  document.querySelector("#syncRunButton").title = syncTitle;
}

function selectedSyncProjectId() {
  return document.querySelector("#syncProjectSelect").value;
}

function renderSyncPanel() {
  if (!externalIntegrationEnabled()) {
    document.querySelector("#syncEngineStatus").textContent = "사용 안 함";
    document.querySelector("#syncEngineStatus").className = "status-pill attention";
    document.querySelector("#syncMode").textContent = "내부 WBS Only · 선택형 외부 연동 꺼짐";
    document.querySelector("#syncState").textContent = "작업 현황, 자원 가동율, 주간 보고서는 내부 WBS 기준으로 운영됩니다.";
    document.querySelector("#syncPendingRows").textContent = "-";
    document.querySelector("#syncChecks").innerHTML = `
      <article class="sync-check">
        <div>
          <strong>외부 연동 비활성</strong>
          <small>설정 토글을 켜면 기준선 반영과 외부 상태 가져오기를 다시 사용할 수 있습니다.</small>
        </div>
        <span class="status-pill attention">선택</span>
      </article>`;
    document.querySelector("#syncPayloadPreview").textContent = "외부 연동을 사용하지 않는 동안 payload 생성과 실제 기준선 반영은 실행하지 않습니다.";
    ["#syncPreflightButton", "#syncDryRunButton", "#syncRunButton", "#syncPullButton", "#opInstanceCheckBtn"].forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) el.disabled = true;
    });
    renderSyncedProjectsList();
    renderOpInstanceSection();
    return;
  }
  const preflight = state.pmPreflight || fallbackPreflight;
  const stateValue = preflight.state || "dry_run_only";
  const status = document.querySelector("#syncEngineStatus");
  status.textContent = syncStateLabel(stateValue);
  status.className = `status-pill ${syncStateClass(stateValue)}`;

  const engine = preflight.engine || {};
  document.querySelector("#syncMode").textContent = `${engineModeLabel(engine.adapter || "openproject")} · ${
    engine.enabled ? "실행 허용" : "비활성"
  }`;
  const selProj   = state.projects.find((p) => p.id === selectedSyncProjectId());
  const projState = selProj ? ` · 프로젝트: ${statusLabel(selProj.status)}` : "";
  document.querySelector("#syncState").textContent =
    (preflight.ready_for_actual_sync ? "실제 기준선 반영 준비" : "모의 반영 모드") + projState;

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
          <strong>기준선 반영 요청</strong>
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
      ? `${statusLabel(state.syncDetail.status)}: 기준선 행 ${summary?.total_rows ?? 0}개`
      : "샘플 payload 대기";
  document.querySelector("#syncPayloadPreview").textContent = preview;

  // 역방향·양방향 연계 섹션 업데이트
  renderSyncPullSection();
  renderAutoSyncStatus();
  // 온프레미스 인스턴스 섹션 업데이트
  renderOpInstanceSection();
}

function renderSyncPullSection() {
  const projectId = selectedSyncProjectId();
  const pullBtn   = document.querySelector("#syncPullButton");
  const statusEl  = document.querySelector("#syncPullStatus");
  const webhookEl = document.querySelector("#syncWebhookUrl");

  // Webhook URL 표시
  const webhookUrl = `${API_BASE}/api/webhooks/openproject`;
  if (webhookEl) webhookEl.textContent = webhookUrl;

  if (!projectId) {
    if (pullBtn) pullBtn.disabled = true;
    if (statusEl) statusEl.textContent = "기준선이 반영된 프로젝트를 선택하면 상태 가져오기가 활성화됩니다.";
    return;
  }

  const project    = state.projects.find((p) => p.id === projectId);
  const meta       = project?.metadata || {};
  const engineMeta = meta.pm_engine || {};
  const wps        = engineMeta.work_packages || {};
  const wpCount    = Object.keys(wps).length;
  const hasSynced  = wpCount > 0;
  const isAutoSynced = Boolean(engineMeta.auto_synced_on_approval);

  if (pullBtn) pullBtn.disabled = !hasSynced || !canMutateWork();

  if (statusEl) {
    if (!hasSynced) {
      statusEl.textContent = "아직 반영된 작업 항목이 없습니다. 승인 시 자동 기준선 반영 또는 수동 반영을 실행하세요.";
    } else {
      const lastPull  = engineMeta.last_pull_at;
      const lastSync  = engineMeta.last_sync_at;
      const autoNote  = isAutoSynced ? " (승인 시 자동 기준선 반영)" : "";
      const pullNote  = lastPull ? ` · Pull: ${formatTimestamp(lastPull)}` : "";
      const syncNote  = lastSync ? ` · Push: ${formatTimestamp(lastSync)}` : "";
      statusEl.textContent = `${wpCount}개 항목 매핑됨${autoNote}${syncNote}${pullNote}`;
    }
  }
}

/* 자동 기준선 반영 상태 배지 업데이트 */
function renderAutoSyncStatus() {
  const badgeEl = document.querySelector("#autoSyncStatus");
  if (!badgeEl) return;

  const preflight = state.pmPreflight || fallbackPreflight;
  const engine    = preflight.engine || {};
  const ready     = preflight.ready_for_actual_sync;
  const adapter   = engine.adapter || "";
  const isMock    = adapter === "mock";

  if (isMock) {
    badgeEl.textContent = "모의 엔진";
    badgeEl.style.cssText = "background:#fef3c7;color:#92400e;border-color:#fde68a";
  } else if (ready) {
    badgeEl.textContent = "✓ 활성화";
    badgeEl.style.cssText = "background:#dcfce7;color:#15803d;border-color:#bbf7d0";
  } else {
    badgeEl.textContent = "설정 필요";
    badgeEl.style.cssText = "background:#fff1f2;color:#dc2626;border-color:#fecdd3";
  }
}

function renderOpInstanceSection() {
  if (!externalIntegrationEnabled()) {
    const urlEl = document.querySelector("#opInstanceUrl");
    if (urlEl) urlEl.textContent = "-";
    const openBtn = document.querySelector("#opInstanceOpenBtn");
    if (openBtn) openBtn.hidden = true;
    const statusEl = document.querySelector("#opInstanceStatus");
    if (statusEl) {
      statusEl.textContent = "선택 꺼짐";
      statusEl.className = "op-instance-status checking";
    }
    const metaEl = document.querySelector("#opInstanceMeta");
    if (metaEl) {
      metaEl.innerHTML = `<span class="op-meta-item">운영 기준 <strong>내부 WBS</strong></span>`;
    }
    return;
  }
  const preflight  = state.pmPreflight || fallbackPreflight;
  const engine     = preflight.engine || preflight.runtime || {};
  const baseUrl    = engine.base_url || "http://localhost:8080";

  // URL 표시
  const urlEl = document.querySelector("#opInstanceUrl");
  if (urlEl) urlEl.textContent = baseUrl;

  // 열기 버튼 href 업데이트
  const openBtn = document.querySelector("#opInstanceOpenBtn");
  if (openBtn) {
    openBtn.href = baseUrl;
    openBtn.hidden = false;
  }

  // 연결 상태 배지 (preflight checks 기반)
  const statusEl = document.querySelector("#opInstanceStatus");
  if (statusEl) {
    const apiCheck = (preflight.checks || []).find((c) => c.name === "api_root");
    if (apiCheck) {
      if (apiCheck.ok || apiCheck.status === "pass") {
        statusEl.textContent = "● 연결됨";
        statusEl.className   = "op-instance-status online";
      } else if (apiCheck.status === "fail") {
        statusEl.textContent = "● 오프라인";
        statusEl.className   = "op-instance-status offline";
      } else {
        statusEl.textContent = "● 확인 필요";
        statusEl.className   = "op-instance-status checking";
      }
    } else {
      statusEl.textContent = "미확인";
      statusEl.className   = "op-instance-status checking";
    }
  }

  // 메타 정보
  const metaEl = document.querySelector("#opInstanceMeta");
  if (metaEl) {
    const authMode   = engine.auth_mode || "bearer";
    const hasToken   = engine.token_configured ?? Boolean(engine.api_token);
    const syncEnabled = engine.enabled ?? false;
    const adapter    = engine.adapter || "openproject";

    metaEl.innerHTML = [
      `<span class="op-meta-item">어댑터 <strong>${escapeHtml(engineModeLabel(adapter))}</strong></span>`,
      `<span class="op-meta-item">인증 <strong>${escapeHtml(authMode.toUpperCase())}</strong></span>`,
      `<span class="op-meta-item">토큰 <strong>${hasToken ? "✓ 설정됨" : "✗ 미설정"}</strong></span>`,
      `<span class="op-meta-item">실 기준선 반영 <strong>${syncEnabled ? "✓ 허용" : "✗ 비활성"}</strong></span>`,
    ].join("");
  }
}

async function checkOpInstanceConnection() {
  const statusEl  = document.querySelector("#opInstanceStatus");
  const checkBtn  = document.querySelector("#opInstanceCheckBtn");
  if (statusEl) { statusEl.textContent = "● 확인 중…"; statusEl.className = "op-instance-status checking"; }
  if (checkBtn) checkBtn.disabled = true;

  try {
    await refreshEnginePreflight();  // preflight 재실행
    renderOpInstanceSection();
  } catch {
    if (statusEl) { statusEl.textContent = "● 오류"; statusEl.className = "op-instance-status offline"; }
  } finally {
    if (checkBtn) checkBtn.disabled = false;
  }
}

/* 기준선 반영 완료 프로젝트 목록 + 외부 뷰 링크 */
function renderSyncedProjectsList() {
  const container   = document.querySelector("#opSyncedProjectList");
  const countEl     = document.querySelector("#syncedProjectCount");
  if (!container) return;

  if (!externalIntegrationEnabled()) {
    if (countEl) countEl.textContent = "0";
    container.innerHTML = `<p class="sync-pull-status">외부 연동을 사용하지 않는 동안 기준선 반영 프로젝트 목록은 표시하지 않습니다.</p>`;
    return;
  }

  const engine      = state.pmPreflight?.engine || state.pmPreflight?.runtime || {};
  const baseUrl     = engine.base_url || "http://localhost:8080";
  const syncedProjects = state.projects.filter((p) =>
    (p.status === "Synced" || p.status === "Closed") && p.openproject_project_id
  );

  if (countEl) countEl.textContent = syncedProjects.length;

  if (!syncedProjects.length) {
    container.innerHTML = `<p class="sync-pull-status">기준선 반영 완료 프로젝트가 없습니다. 승인된 프로젝트의 기준선을 반영하면 여기에 표시됩니다.</p>`;
    return;
  }

  container.innerHTML = syncedProjects.map((p) => {
    const meta       = p.metadata || {};
    const engineMeta = meta.pm_engine || {};
    const opProjId   = p.openproject_project_id || engineMeta.project_id || "";
    const opIdentifier = engineMeta.project_identifier || opProjId;

    const wpUrl    = opIdentifier ? `${baseUrl}/projects/${opIdentifier}/work_packages` : "#";
    const ganttUrl = opIdentifier ? `${baseUrl}/projects/${opIdentifier}/work_packages/gantt` : "#";
    const boardUrl = opIdentifier ? `${baseUrl}/projects/${opIdentifier}/work_packages/board` : "#";

    return `
      <div class="op-project-card">
        <div class="op-project-info">
          <strong>${escapeHtml(p.name)}</strong>
          <small>OP ID: ${escapeHtml(opProjId)} · ${escapeHtml(projectTypeLabel(p.template_key))}</small>
        </div>
        <div class="op-project-links">
          <a class="op-link-btn" href="${wpUrl}" target="_blank" rel="noopener" title="작업 항목 목록">
            📋 작업 항목
          </a>
          <a class="op-link-btn" href="${ganttUrl}" target="_blank" rel="noopener" title="간트 차트">
            📊 간트 차트
          </a>
          <a class="op-link-btn secondary" href="${boardUrl}" target="_blank" rel="noopener" title="칸반 보드">
            🗂 보드
          </a>
          <a class="op-link-btn secondary" href="${baseUrl}/projects/${opIdentifier}" target="_blank" rel="noopener" title="OpenProject 프로젝트 홈">
            ↗ OP 홈
          </a>
        </div>
      </div>`;
  }).join("");
}

function renderSyncRuns() {
  document.querySelector("#syncRunCount").textContent = state.syncRuns.length;
  document.querySelector("#syncRunList").innerHTML = state.syncRuns.length
    ? state.syncRuns
        .map((run) => {
          const countText = run.status === "Synced"
            ? `${run.created_work_packages || 0}개 생성`
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
  if (!status) return;
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

function activeUserGroups() {
  return (state.userGroups || []).filter((group) => group.status === "Active");
}

function userGroupOptions(selectedGroupId = "", { includeInactive = false, placeholder = "소속 그룹 선택" } = {}) {
  const selected = String(selectedGroupId || "");
  const groups = (state.userGroups || [])
    .filter((group) => includeInactive || group.status === "Active" || String(group.id) === selected)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true }));
  return [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...groups.map((group) => {
      const suffix = group.status === "Suspended" ? " (중지)" : "";
      return `<option value="${escapeHtml(group.id)}" ${String(group.id) === selected ? "selected" : ""}>${escapeHtml(group.name || "미지정")}${suffix}</option>`;
    }),
  ].join("");
}

function renderUserGroupControls() {
  const createSelect = document.querySelector("#userGroupInput");
  const filterSelect = document.querySelector("#userGroupFilter");
  const groupList = document.querySelector("#userGroupList");
  const activeGroups = activeUserGroups();

  if (createSelect) {
    const current = activeGroups.some((group) => String(group.id) === createSelect.value)
      ? createSelect.value
      : activeGroups[0]?.id || "";
    createSelect.innerHTML = userGroupOptions(current);
    createSelect.value = current;
    createSelect.disabled = !activeGroups.length;
  }

  if (filterSelect) {
    const groups = state.userGroups || [];
    const current = groups.some((group) => String(group.id) === state.userGroupFilter) ? state.userGroupFilter : "";
    state.userGroupFilter = current;
    filterSelect.innerHTML = userGroupOptions(current, { includeInactive: true, placeholder: "그룹 전체" });
    filterSelect.value = current;
  }

  if (groupList) {
    groupList.innerHTML = (state.userGroups || []).length
      ? state.userGroups.map((group) => `
          <span class="user-group-chip ${group.status === "Suspended" ? "is-suspended" : ""}" title="${escapeHtml(group.description || group.name || "")}">
            ${escapeHtml(group.name || "미지정")}
            <small>${Number(group.user_count || 0)}명</small>
          </span>
        `).join("")
      : `<span class="user-group-empty">등록된 소속 그룹 없음</span>`;
  }
}

function compareTableValues(a, b, dir = "asc") {
  const normalize = (value) => {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "number") return value;
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return timestamp;
    return String(value).toLowerCase();
  };
  const av = normalize(a);
  const bv = normalize(b);
  let result;
  if (typeof av === "number" && typeof bv === "number") {
    result = av - bv;
  } else {
    result = String(av).localeCompare(String(bv), "ko", { numeric: true, sensitivity: "base" });
  }
  return dir === "desc" ? -result : result;
}

function updateSortButtons(selector, activeKey, dir) {
  document.querySelectorAll(selector).forEach((btn) => {
    const key = btn.dataset.projectSort || btn.dataset.riSort || btn.dataset.userSort;
    const active = key === activeKey;
    btn.classList.toggle("active", active);
    const icon = btn.querySelector("span");
    if (icon) icon.textContent = active ? (dir === "asc" ? "↑" : "↓") : "";
  });
}

function renderUserTableControls() {
  const roleSelect = document.querySelector("#userRoleFilter");
  const statusSelect = document.querySelector("#userStatusFilter");
  renderUserGroupControls();
  if (roleSelect) {
    const roles = [...new Set(state.users.map((user) => user.role).filter(Boolean))].sort();
    const current = roles.includes(state.userRoleFilter) ? state.userRoleFilter : "";
    state.userRoleFilter = current;
    roleSelect.innerHTML = [
      `<option value="">역할 전체</option>`,
      ...roles.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(roleLabel(role))}</option>`),
    ].join("");
    roleSelect.value = current;
  }
  if (statusSelect) {
    const statuses = [...new Set(state.users.map((user) => user.status).filter(Boolean))].sort();
    const current = statuses.includes(state.userStatusFilter) ? state.userStatusFilter : "";
    state.userStatusFilter = current;
    statusSelect.innerHTML = [
      `<option value="">상태 전체</option>`,
      ...statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(userStatusLabel(status))}</option>`),
    ].join("");
    statusSelect.value = current;
  }
  updateSortButtons("[data-user-sort]", state.userSortKey, state.userSortDir);
}

function renderUsersPanel() {
  if (!document.querySelector("#userRows")) return;
  renderUserTableControls();
  const rows = state.users
    .filter((user) => !state.userRoleFilter || user.role === state.userRoleFilter)
    .filter((user) => !state.userStatusFilter || user.status === state.userStatusFilter)
    .filter((user) => !state.userGroupFilter || user.group_id === state.userGroupFilter)
    .sort((a, b) => compareTableValues(a[state.userSortKey], b[state.userSortKey], state.userSortDir));
  document.querySelector("#userCount").textContent = rows.length;
  document.querySelector("#userRows").innerHTML = rows.length
    ? rows
        .map(
          (user) => `
            <tr data-user-id="${escapeHtml(user.id)}">
              <td>
                <strong>${escapeHtml(user.display_name)}</strong>
                <small>${escapeHtml(user.email)}</small>
                <small>${user.must_change_password ? "비밀번호 변경 필요" : "비밀번호 정상"}</small>
              </td>
              <td>
                <select data-user-field="group_id" aria-label="${escapeHtml(user.email)} 소속 그룹">
                  ${userGroupOptions(user.group_id, { includeInactive: true })}
                </select>
                <small>${escapeHtml(user.group_name || "미지정")}${user.group_status === "Suspended" ? " · 중지" : ""}</small>
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
        <td colspan="7">조건에 맞는 사용자 없음</td>
      </tr>
    `;
}

/* 감사 로그 이벤트 분류 */
const AUDIT_TAB_TYPES = {
  all:      null,
  auth:     ["auth.login", "auth.logout", "auth.login_failed", "auth.login_locked",
             "auth.password_changed", "auth.password_change_failed"],
  project:  ["project.created", "project.status_changed",
             "import.previewed", "import.created", "import.applied",
             "project_wbs.import_applied", "template.resequenced", "work_item.updated",
             "project_member.added", "project_member.role_changed", "project_member.removed"],
  approval: ["approval.created", "approval.approved", "approval.rejected"],
  system:   ["user.created", "user.updated", "user.sessions_revoked",
             "setting.updated", "pm_engine.sync_recorded"],
};

/* WBS 추가/변경/삭제 등 감사 이벤트의 상세 변경 내용 한 줄 요약 */
function auditDetailLine(event) {
  const meta = event.metadata || {};

  if (event.event_type === "project_wbs.import_applied") {
    const added = meta.added || 0;
    const changed = meta.changed || 0;
    const removed = meta.removed || 0;
    if (!added && !changed && !removed) return "";

    const parts = [];
    if (added)   parts.push(`추가 ${added}건`);
    if (changed) parts.push(`변경 ${changed}건`);
    if (removed) parts.push(`삭제 ${removed}건`);
    let line = parts.join(" · ");

    const items = Array.isArray(meta.diff_items) ? meta.diff_items : [];
    if (items.length) {
      const tagFor = (change) => (change === "added" ? "+" : change === "removed" ? "-" : "~");
      const sample = items
        .slice(0, 5)
        .map((it) => `${tagFor(it.change)}${it.code || ""}${it.name ? ` ${it.name}` : ""}`)
        .join(", ");
      line += ` (${sample}${items.length > 5 ? " 외" : ""})`;
    }
    return line;
  }

  if (event.event_type === "work_item.updated" && meta.changes) {
    return meta.changes;
  }

  return "";
}

function renderAuditPanel() {
  const auditCount = document.querySelector("#auditCount");
  const auditList  = document.querySelector("#auditList");
  if (!auditList) return;

  /* 서브탭 활성화 */
  document.querySelectorAll(".audit-sub-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.auditTab === state.auditTab);
  });

  const allowedTypes = AUDIT_TAB_TYPES[state.auditTab];
  const filtered = allowedTypes
    ? state.auditEvents.filter((e) => allowedTypes.includes(e.event_type))
    : state.auditEvents;

  if (auditCount) auditCount.textContent = filtered.length;

  auditList.innerHTML = filtered.length
    ? filtered.map((event) => {
        const detail = auditDetailLine(event);
        return `
        <article class="audit-event">
          <div>
            <strong>${escapeHtml(auditSummaryLabel(event.summary))}</strong>
            <small>${escapeHtml(eventTypeLabel(event.event_type))} · ${escapeHtml(event.actor_email || "시스템")}</small>
            ${detail ? `<small class="audit-event-detail">${escapeHtml(detail)}</small>` : ""}
          </div>
          <span>${escapeHtml(formatTimestamp(event.created_at))}</span>
        </article>`;
      }).join("")
    : `<article class="audit-event empty-run"><div><strong>이벤트 없음</strong><small>해당 분류의 감사 이력이 없습니다.</small></div></article>`;
}

/* ── 설정 탭 전환 ──────────────────────────────── */
const STG_TABS = ["platform", "policy", "approvals", "operations", "users", "audit", "openproject", "auth", "smtp", "tenants"];

function switchSettingsTab(tabId) {
  if (!STG_TABS.includes(tabId)) return;
  state.settingsTab = tabId;

  document.querySelectorAll(".stg-tab").forEach((btn) => {
    const active = btn.dataset.stgTab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  STG_TABS.forEach((t) => {
    const el = document.getElementById(`stgTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (el) el.hidden = t !== tabId;
  });

  // 탭 전환 시 콘텐츠 렌더링
  if (tabId === "approvals")    renderSettingsApprovals();
  if (tabId === "policy")       renderProjectPolicyPanel();
  if (tabId === "operations")   renderOperationsPanel();
  if (tabId === "users")        renderUsersPanel();
  if (tabId === "audit")        renderAuditPanel();
  if (tabId === "platform")     renderSettingsPanel();
  if (tabId === "openproject")  { renderSyncPanel(); renderSyncedProjectsList(); }
  if (tabId === "auth")         renderAuthSettingsTab();
  if (tabId === "smtp")         renderSmtpTab();
  if (tabId === "tenants")      renderTenantsTab();
}

function renderSettingsApprovals() {
  const container = document.querySelector("#stgApprovalList");
  if (!container) return;

  // 상단: 승인 파이프라인 + 타임라인 뷰
  const tlWrap = document.createElement("div");
  tlWrap.style.marginBottom = "20px";
  renderApprovalTimeline(tlWrap);

  // 하단: 테이블 형식 이력
  const tableWrap = document.createElement("div");
  renderApprovalTable(tableWrap);

  container.innerHTML = "";
  container.appendChild(tlWrap);
  container.appendChild(tableWrap);
}

function selectedSetting() {
  const settings = state.settings?.settings || [];
  return settings.find((setting) => setting.key === state.selectedSettingKey) || settings[0] || null;
}

function renderSettingsPanel() {
  // 설정 탭이 보이지 않는 경우 DOM 없음 방지
  if (!document.querySelector("#settingsCards")) return;
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
  document.querySelector("#settingsEngineMode").textContent = `${engine.display_name || engineModeLabel(engine.adapter || "openproject")} · ${engineModeLabel(engine.mode || "adapter")}`;
  document.querySelector("#settingsEngineBoundary").textContent = engine.dependency_boundary || "pm-engine-api";
  document.querySelector("#settingsEngineRuntime").textContent = externalIntegrationEnabled()
    ? (engine.enabled ? "실제 기준선 반영 허용" : "모의 반영 보호")
    : "외부 연동 사용 안 함";
  document.querySelector("#settingsJsonInput").value = setting ? JSON.stringify(setting.value || {}, null, 2) : "{}";
  document.querySelector("#settingsJsonInput").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsSaveButton").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsStatus").textContent = state.settingsStatus;
  const externalToggle = document.querySelector("#externalIntegrationToggle");
  if (externalToggle) {
    externalToggle.checked = externalIntegrationEnabled();
    externalToggle.disabled = !canManageUsers();
  }
}

function renderProjectPolicyPanel() {
  const container = document.querySelector("#projectPolicyPanel");
  if (!container) return;
  const policy = projectOperationPolicy();
  const canEdit = canManageUsers();
  const dodText = (policy.default_dod_items || []).join("\n");
  const fibText = storyPointOptions(policy).join(", ");
  container.innerHTML = `
    <div class="policy-header">
      <div>
        <p class="eyebrow">현재 테넌트</p>
        <h3>${escapeHtml(tenantDisplayName(policy.tenant_id))}</h3>
      </div>
      <div class="policy-summary">
        <span>${escapeHtml(deliveryPolicyLabel(policy.default_delivery_mode))}</span>
        <span>${escapeHtml(policy.story_point_mode === "fibonacci" ? "피보나치 SP" : "숫자 직접 입력")}</span>
        <span>${escapeHtml(sprintPolicyLabel(policy.sprint_length_policy))}</span>
      </div>
    </div>
    <div class="policy-grid">
      <label class="policy-field">
        <span>신규 프로젝트 기본 방법론</span>
        <select id="policyDefaultDeliveryMode" ${canEdit ? "" : "disabled"}>
          <option value="waterfall" ${policy.default_delivery_mode === "waterfall" ? "selected" : ""}>Waterfall - 표준 WBS/간트</option>
          <option value="agile" ${policy.default_delivery_mode === "agile" ? "selected" : ""}>Agile - 백로그/스프린트</option>
          <option value="hybrid" ${policy.default_delivery_mode === "hybrid" ? "selected" : ""}>Hybrid - WBS + Sprint</option>
        </select>
      </label>
      <label class="policy-field">
        <span>Story Point 산정 방식</span>
        <select id="policyStoryPointMode" ${canEdit ? "" : "disabled"}>
          <option value="numeric" ${policy.story_point_mode === "numeric" ? "selected" : ""}>숫자 직접 입력</option>
          <option value="fibonacci" ${policy.story_point_mode === "fibonacci" ? "selected" : ""}>피보나치 값만 허용</option>
        </select>
      </label>
      <label class="policy-field">
        <span>피보나치 허용값</span>
        <input id="policyFibonacciPoints" value="${escapeHtml(fibText)}" ${canEdit ? "" : "disabled"} />
      </label>
      <label class="policy-field">
        <span>Sprint 길이 정책</span>
        <select id="policySprintLength" ${canEdit ? "" : "disabled"}>
          <option value="custom" ${policy.sprint_length_policy === "custom" ? "selected" : ""}>프로젝트별 자유 설정</option>
          <option value="fixed_1w" ${policy.sprint_length_policy === "fixed_1w" ? "selected" : ""}>1주 고정</option>
          <option value="fixed_2w" ${policy.sprint_length_policy === "fixed_2w" ? "selected" : ""}>2주 고정</option>
          <option value="fixed_4w" ${policy.sprint_length_policy === "fixed_4w" ? "selected" : ""}>4주 고정</option>
        </select>
      </label>
      <label class="policy-field">
        <span>DoD 관리 방식</span>
        <select id="policyDodManagement" ${canEdit ? "" : "disabled"}>
          <option value="organization" ${policy.dod_management === "organization" ? "selected" : ""}>전사 공통 기준 우선</option>
          <option value="team" ${policy.dod_management === "team" ? "selected" : ""}>팀별 커스터마이징 허용</option>
        </select>
      </label>
      <label class="policy-field policy-toggle">
        <span>OpenProject Sprint → Version 자동 생성</span>
        <input id="policyOpenProjectVersionSync" type="checkbox" ${policy.openproject_sprint_version_sync ? "checked" : ""} ${canEdit ? "" : "disabled"} />
      </label>
      <label class="policy-field policy-dod-field">
        <span>기본 DoD 항목</span>
        <textarea id="policyDodItems" rows="6" ${canEdit ? "" : "disabled"} placeholder="한 줄에 하나씩 입력">${escapeHtml(dodText)}</textarea>
      </label>
    </div>
    <div class="settings-actions policy-actions">
      <p class="form-status" id="projectPolicyStatus">${escapeHtml(state.projectPolicyStatus || "")}</p>
      <button class="primary-button" id="projectPolicySaveButton" type="button" ${canEdit ? "" : "disabled"}>운영 정책 저장</button>
    </div>
  `;
}

/* ── 사용자 가이드 렌더링 ───────────────────────────────────────────── */

function guideToneClass(tone) {
  const map = { good: "good", warn: "warn", bad: "bad", info: "info", blocked: "info", neutral: "" };
  return map[tone] || "";
}

function guideNavButton(targetView, label, tone) {
  if (!targetView) return "";
  const cls = `guide-nav-btn ${guideToneClass(tone)}`;
  return `<button class="${cls}" type="button" data-guide-navigate="${escapeHtml(targetView)}">${escapeHtml(label)} →</button>`;
}

function renderGuideHero(hero) {
  const tags = (hero.tags || []).map((t) => `<span class="guide-tag">${escapeHtml(t)}</span>`).join("");
  return `
    <div class="guide-hero">
      <p class="guide-hero-eyebrow">${escapeHtml(hero.eyebrow || "")}</p>
      <h3>${escapeHtml(hero.title)}</h3>
      ${hero.description ? `<p>${escapeHtml(hero.description)}</p>` : ""}
      ${tags ? `<div class="guide-tag-row">${tags}</div>` : ""}
    </div>`;
}

function renderGuideSummary(items) {
  if (!items || !items.length) return "";
  const cards = items.map((item) => `
    <div class="guide-summary-card ${guideToneClass(item.tone)}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">핵심 요약</h4>
      <div class="guide-summary-grid">${cards}</div>
    </div>`;
}

function renderGuideActions(actions) {
  if (!actions || !actions.length) return "";
  const items = actions.map((action) => `
    <div class="guide-action-item">
      <div>
        <strong>${escapeHtml(action.label)}</strong>
        ${action.description ? `<span>${escapeHtml(action.description)}</span>` : ""}
      </div>
      ${guideNavButton(action.targetView, "이동", action.tone)}
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">바로 실행</h4>
      <div class="guide-action-list">${items}</div>
    </div>`;
}

function renderGuideSteps(steps) {
  if (!steps || !steps.length) return "";
  const sorted = [...steps].sort((a, b) => (a.order || 0) - (b.order || 0));
  const items = sorted.map((step) => {
    const checks = (step.checks || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");
    const caution = step.caution ? `<div class="guide-caution">⚠ ${escapeHtml(step.caution)}</div>` : "";
    return `
      <div class="guide-step ${escapeHtml(step.status || "")}">
        <div class="guide-step-num">${escapeHtml(String(step.order || ""))}</div>
        <div class="guide-step-body">
          <strong>${escapeHtml(step.title)}</strong>
          ${step.outcome ? `<p>${escapeHtml(step.outcome)}</p>` : ""}
          ${checks ? `<ul class="guide-check-list">${checks}</ul>` : ""}
          ${caution}
          ${guideNavButton(step.targetView, "관련 화면", "info")}
        </div>
      </div>`;
  }).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">절차</h4>
      <div class="guide-timeline">${items}</div>
    </div>`;
}

function renderGuideTasks(tasks) {
  if (!tasks || !tasks.length) return "";
  const items = tasks.map((task) => {
    const checks = (task.checks || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");
    const badge = task.required
      ? `<span class="status-pill attention" style="font-size:0.7rem">필수</span>`
      : `<span class="status-pill" style="font-size:0.7rem;background:var(--surface-muted)">선택</span>`;
    return `
      <div class="guide-task ${escapeHtml(task.status || "")}">
        <div class="guide-task-header">
          <strong>${escapeHtml(task.title)}</strong>
          ${badge}
        </div>
        ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ""}
        ${checks ? `<ul class="guide-check-list">${checks}</ul>` : ""}
        ${guideNavButton(task.targetView, "관련 화면", "info")}
      </div>`;
  }).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">작업 목록</h4>
      <div class="guide-task-list">${items}</div>
    </div>`;
}

function renderGuideRunModes(modes) {
  if (!modes || !modes.length) return "";
  const items = modes.map((mode) => {
    const facts = (mode.facts || []).map((f) => `
      <div class="guide-summary-card" style="min-height:auto">
        <span>${escapeHtml(f.label)}</span>
        <strong style="font-size:0.84rem">${escapeHtml(f.value)}</strong>
      </div>`).join("");
    return `
      <div class="guide-task">
        <strong>${escapeHtml(mode.name)}</strong>
        ${mode.trigger ? `<p>${escapeHtml(mode.trigger)}</p>` : ""}
        ${facts ? `<div class="guide-summary-grid">${facts}</div>` : ""}
      </div>`;
  }).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">실행 방식</h4>
      <div class="guide-task-list">${items}</div>
    </div>`;
}

function renderGuideQuestions(questions) {
  if (!questions || !questions.length) return "";
  const items = questions.map((q) => `
    <div class="guide-qa-item">
      <details>
        <summary>${escapeHtml(q.question)}</summary>
        <p class="guide-qa-answer">${escapeHtml(q.answer)}</p>
        ${guideNavButton(q.targetView, "관련 화면", "info")}
      </details>
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">자주 묻는 상황</h4>
      <div class="guide-qa-list">${items}</div>
    </div>`;
}

function renderGuideResources(resources) {
  if (!resources || !resources.length) return "";
  const items = resources.map((r) => `
    <div class="guide-resource-item">
      <div>
        <strong>${escapeHtml(r.title)}</strong>
        ${r.description ? `<p>${escapeHtml(r.description)}</p>` : ""}
        ${r.meta ? `<span>${escapeHtml(r.meta)}</span>` : ""}
      </div>
      ${guideNavButton(r.targetView, "이동", "info")}
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">참고 자료</h4>
      <div class="guide-resource-list">${items}</div>
    </div>`;
}

function renderGuideGuardrails(guardrails) {
  if (!guardrails || !guardrails.length) return "";
  const items = guardrails.map((g) => {
    const text = typeof g === "string" ? g : (g.text || "");
    return `<div class="guide-guardrail-item">${escapeHtml(text)}</div>`;
  }).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">안전 기준</h4>
      <div class="guide-guardrail-list">${items}</div>
    </div>`;
}

function renderGuideDecisions(decisions) {
  if (!decisions || !decisions.length) return "";
  const items = decisions.map((d) => `
    <div class="guide-summary-card" style="border-left: 3px solid var(--blue)">
      <strong>${escapeHtml(d.title)}</strong>
      <p>${escapeHtml(d.description)}</p>
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">확인 순서</h4>
      <div class="guide-summary-grid">${items}</div>
    </div>`;
}

function renderGuidePanel() {
  const viewId = state.guideSelectedView || "dashboard";
  const guide = WBS_GUIDE_CONTENTS[viewId];

  const menuHtml = WBS_GUIDE_MENUS.map((menu) => {
    const isActive = menu.id === viewId;
    return `<button class="guide-menu-btn ${isActive ? "active" : ""}" type="button" role="tab" aria-selected="${isActive ? "true" : "false"}" aria-controls="guideContent" data-guide-view="${escapeHtml(menu.id)}">${escapeHtml(menu.label)}</button>`;
  }).join("");
  document.querySelector("#guideMenu").innerHTML = menuHtml;

  const labelMap = { overview: "개요", "empty-state": "첫 시작", "task-list": "작업 목록", procedure: "절차", troubleshooting: "문제 해결", reference: "참고" };
  document.querySelector("#guideViewLabel").textContent = labelMap[guide?.kind] || "가이드";

  if (!guide) {
    document.querySelector("#guideContent").innerHTML = `<p style="color:var(--text-muted)">가이드 콘텐츠가 없습니다.</p>`;
    return;
  }

  const sections = [
    renderGuideHero(guide.hero),
    renderGuideSummary(guide.summary),
    renderGuideActions(guide.actions),
    renderGuideSteps(guide.steps),
    renderGuideTasks(guide.tasks),
    renderGuideRunModes(guide.runModes),
    renderGuideQuestions(guide.questions),
    renderGuideResources(guide.resources),
    renderGuideGuardrails(guide.guardrails),
    renderGuideDecisions(guide.decisions),
  ].filter(Boolean).join("");

  document.querySelector("#guideContent").innerHTML = sections;
}

/* ══════════════════════════════════════════════════════
   WBS 계획 — CRUD
══════════════════════════════════════════════════════ */

function wbsPlanFilteredRows() {
  const rows = state.wbsPlanRows;
  const q = state.wbsPlanSearch.trim().toLowerCase();
  return rows.filter((row) => {
    const matchSearch = !q || [row.code, row.parent_code, row.name, row.item_type, row.owner]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
    const matchPhase = !state.wbsPlanPhaseFilter || row.code === state.wbsPlanPhaseFilter
      || (row.parent_code && row.parent_code.startsWith(state.wbsPlanPhaseFilter));
    const matchType = !state.wbsPlanTypeFilter || row.item_type === state.wbsPlanTypeFilter;
    return matchSearch && matchPhase && matchType;
  });
}

/* ── WBS 가중치 현황 요약 ────────────────────────── */
function renderWbsWeightSummary() {
  const el = document.querySelector("#wbsWeightSummary");
  if (!el) return;

  const rows = state.wbsPlanRows;
  if (!rows.length) {
    el.innerHTML = `<span class="wbs-weight-title">가중치 현황</span>`;
    return;
  }

  // 루트 노드 찾기
  const roots = rows.filter((r) => !r.parent_code);
  const root  = roots.length === 1 ? roots[0] : null;

  // 단계(phase) 노드: 루트의 직계 자식
  const phases = root
    ? rows.filter((r) => r.parent_code === root.code && r.item_type !== "마일스톤")
    : roots;

  // 단계별 가중치
  const PHASE_COLORS = ["#0078d4","#107c10","#6264a7","#ff8c00","#d13438","#00b7c3","#9333ea"];

  let phaseHtml = "";
  let totalPhaseWeight = 0;

  if (phases.length) {
    phaseHtml = phases.map((ph, idx) => {
      const w   = ph.weight ?? 0;
      const pct = Math.min(100, w);
      totalPhaseWeight += w;
      const color = PHASE_COLORS[idx % PHASE_COLORS.length];
      const name  = ph.name.length > 8 ? ph.name.slice(0, 7) + "…" : ph.name;
      return `
        <div class="wbs-phase-bar-row">
          <span class="wbs-phase-bar-label" title="${escapeHtml(ph.name)}">${escapeHtml(name)}</span>
          <div class="wbs-phase-bar-track">
            <div class="wbs-phase-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="wbs-phase-bar-value">${w}%</span>
        </div>`;
    }).join("");
  } else {
    // 단계 없을 경우: 전체 항목의 최상위 레벨 요약
    const topRows = rows.slice(0, 5);
    topRows.forEach((r) => { totalPhaseWeight += r.weight ?? 0; });
    phaseHtml = topRows.map((r, idx) => {
      const w   = r.weight ?? 0;
      const color = PHASE_COLORS[idx % PHASE_COLORS.length];
      const name  = (r.name || r.code || "").slice(0, 8);
      return `
        <div class="wbs-phase-bar-row">
          <span class="wbs-phase-bar-label">${escapeHtml(name)}</span>
          <div class="wbs-phase-bar-track">
            <div class="wbs-phase-bar-fill" style="width:${Math.min(100,w)}%;background:${color}"></div>
          </div>
          <span class="wbs-phase-bar-value">${w}%</span>
        </div>`;
    }).join("");
    if (rows.length > 5) {
      phaseHtml += `<div style="font-size:0.68rem;color:var(--text-muted);text-align:right">외 ${rows.length - 5}개…</div>`;
    }
  }

  // 전체 합계
  const rootWeight = root?.weight ?? totalPhaseWeight;
  const totalWeight = rows.reduce((s, r) => {
    if (!r.parent_code) return s + (r.weight ?? 0);
    return s;
  }, 0);
  const displayTotal = rootWeight || totalWeight;
  const statusCls = displayTotal > 100 ? "over" : displayTotal < 99 ? "warn" : "ok";

  el.innerHTML = `
    <div class="wbs-weight-header">
      <span class="wbs-weight-title">가중치 현황</span>
      <span class="wbs-weight-total">${rows.length}개 항목</span>
    </div>
    <div class="wbs-phase-bars">${phaseHtml}</div>
    <div class="wbs-total-bar-row">
      <span class="wbs-total-bar-label">합계</span>
      <div class="wbs-total-bar-track">
        <div class="wbs-total-bar-fill ${statusCls}" style="width:${Math.min(100,displayTotal)}%"></div>
      </div>
      <span class="wbs-total-bar-value ${statusCls}">${displayTotal}%</span>
    </div>`;
}

function renderWbsPlanFilters() {
  const rows   = state.wbsPlanRows;
  const roots  = rows.filter((r) => !r.parent_code);
  const root   = roots.length === 1 ? roots[0] : null;
  const phases = root ? rows.filter((r) => r.parent_code === root.code) : [];
  const types  = [...new Set(rows.map((r) => r.item_type).filter(Boolean))];

  // 단계 필터 (새 UI에 존재)
  const phaseFilter = document.querySelector("#wbsPlanPhaseFilter");
  if (phaseFilter) {
    phaseFilter.innerHTML = ['<option value="">전체 단계</option>',
      ...phases.map((p) => `<option value="${escapeHtml(p.code)}">${escapeHtml(p.name)}</option>`)
    ].join("");
    phaseFilter.value    = state.wbsPlanPhaseFilter;
    phaseFilter.disabled = !phases.length;
  }

  // 유형 필터 (구 UI 전용 — 새 UI에는 없음, null 가드)
  const typeFilter = document.querySelector("#wbsPlanTypeFilter");
  if (typeFilter) {
    typeFilter.innerHTML = ['<option value="">전체 유형</option>',
      ...types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(itemTypeLabel(t))}</option>`)
    ].join("");
    typeFilter.value    = state.wbsPlanTypeFilter;
    typeFilter.disabled = !types.length;
  }

  // 검색 인풋 (새 UI에 존재)
  const searchInput = document.querySelector("#wbsPlanSearch");
  if (searchInput) {
    searchInput.value    = state.wbsPlanSearch;
    searchInput.disabled = !rows.length;
  }

  document.querySelectorAll("[data-wbs-type-chip]").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.wbsTypeChip === state.wbsPlanTypeFilter);
    chip.disabled = !rows.length && chip.dataset.wbsTypeChip !== "";
  });
}

function renderWbsPlanProjectList() {
  const select = document.querySelector("#wbsPlanProjectSelect");
  if (!select) return;
  const projects = state.apiConnected ? state.projects : fallbackProjects;
  const validProjects = projects.filter((p) => p.id);
  select.innerHTML = [
    `<option value="">프로젝트 선택…</option>`,
    ...validProjects.map((p) => {
      const label = formatProjectSelectLabel(p) + `  [${statusLabel(p.status)}]`;
      return `<option value="${escapeHtml(p.id)}"
        ${p.id === state.wbsPlanProjectId ? "selected" : ""}
       >${escapeHtml(label)}</option>`;
    }),
  ].join("");
  select.disabled = !validProjects.length;
}

/* WBS 행 깊이 계산 */
function wbsItemDepth(row, rowByCode) {
  let depth = 0;
  let cur = row;
  const seen = new Set([row.code]);
  while (cur?.parent_code && !seen.has(cur.parent_code)) {
    seen.add(cur.parent_code);
    cur = rowByCode.get(cur.parent_code);
    depth++;
  }
  return depth;
}

/* 부모→자식 맵 */
function buildChildMap(rows) {
  const map = {};
  rows.forEach((r) => {
    if (r.parent_code) {
      if (!map[r.parent_code]) map[r.parent_code] = [];
      map[r.parent_code].push(r.code);
    }
  });
  return map;
}

/* 코드가 펼쳐진 상태인지 */
function isWbsExpanded(code) {
  return state.wbsExpanded[code] !== false; // undefined = expanded by default
}

/* WBS 보드 단일 행 HTML */
function renderWbsBoardItem(row, depth, hasChildren, canMutate) {
  const type     = row.item_type || "작업";
  const typeLabel = itemTypeLabel(type);
  const isPhase   = type === "단계" || type === "프로젝트";
  const isMile    = type === "마일스톤";
  const expanded  = hasChildren ? isWbsExpanded(row.code) : true;
  const syncedCls = row.already_synced ? "synced" : "";
  const meta      = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};

  const dateStr = (row.start_date || row.finish_date)
    ? `${row.start_date || ""} ~ ${row.finish_date || ""}`.trim().replace(/^~ |~ $/, "")
    : "";

  return `
    <div class="wbs-item ${isPhase ? "wbs-phase" : ""} ${isMile ? "wbs-milestone" : ""}"
         role="listitem"
         data-code="${escapeHtml(row.code || "")}"
         data-type="${escapeHtml(type)}"
         style="--depth:${depth}">
      <div class="wbs-item-gutter">
        ${hasChildren
          ? `<button class="wbs-expand-btn" type="button"
               data-wbs-toggle="${escapeHtml(row.code)}"
               aria-label="${expanded ? "접기" : "펼치기"}"
               aria-expanded="${expanded}">${expanded ? "▼" : "▶"}</button>`
          : `<span class="wbs-leaf"></span>`}
      </div>
      <div class="wbs-item-body">
        <div class="wbs-item-main">
          ${row.code ? `<code class="wbs-code">${escapeHtml(row.code)}</code>` : ""}
          <span class="wbs-name">${escapeHtml(row.name || "")}</span>
        </div>
        <div class="wbs-item-meta">
          <span class="wbs-type-badge" data-type="${escapeHtml(type)}">${escapeHtml(typeLabel)}</span>
          ${row.owner   ? `<span class="wbs-owner">👤 ${escapeHtml(row.owner)}</span>` : ""}
          ${row.weight != null ? `<span class="wbs-weight">${row.weight}%</span>` : ""}
          ${dateStr     ? `<span class="wbs-dates">📅 ${escapeHtml(dateStr)}</span>` : ""}
          <span class="wbs-sync-badge ${syncedCls}">${row.already_synced ? "✓ 기준선 반영" : "대기"}</span>
          ${meta.op_status ? `<span class="wbs-op-status-badge ${meta.op_status === "완료" || meta.op_progress >= 100 ? "done" : ""}">OP: ${escapeHtml(meta.op_status)}</span>` : ""}
          ${meta.op_progress != null ? `<span class="wbs-op-progress-text">${meta.op_progress}%</span>` : ""}
        </div>
      </div>
      ${meta.op_progress != null && row.already_synced ? `
        <div class="wbs-item-progress" title="외부 진행률: ${meta.op_progress}%">
          <div class="wbs-item-progress-fill" style="width:${Math.min(100, meta.op_progress)}%"></div>
        </div>` : ""}
      <div class="wbs-item-actions">
        <button type="button" class="add-child-btn"
          data-wbs-add-child="${escapeHtml(row.code || "")}"
          ${canMutate && row.code ? "" : "disabled"}>＋ 하위</button>
        <button type="button"
          data-wbs-edit="${escapeHtml(row.code || "")}"
          ${canMutate ? "" : "disabled"}>수정</button>
        <button type="button" class="delete-btn"
          data-wbs-delete="${escapeHtml(row.code || "")}"
          ${canMutate ? "" : "disabled"}>삭제</button>
      </div>
    </div>`;
}

/* ── 상태·우선순위 설정 ───────────────────────────── */
const WBS_STATUSES  = ["대기", "진행중", "완료", "지연", "보류"];
const WBS_PRIORITIES = ["높음", "보통", "낮음"];

const STATUS_STYLE = {
  "대기":  { bg:"#f3f4f6", color:"#6b7280" },
  "진행중": { bg:"#dbeafe", color:"#1d4ed8" },
  "완료":  { bg:"#dcfce7", color:"#15803d" },
  "지연":  { bg:"#fee2e2", color:"#dc2626" },
  "보류":  { bg:"#fef3c7", color:"#d97706" },
};

/* 필터링 (기준선 유형/단계/검색) */
function wbsProFilteredRows() {
  const rows   = state.wbsPlanRows;
  const q      = state.wbsPlanSearch.trim().toLowerCase();
  const tf     = state.wbsPlanTypeFilter;
  const phase  = state.wbsPlanPhaseFilter;
  return rows.filter((r) => {
    const matchSearch = !q || [r.code,r.name,r.item_type,r.owner].filter(Boolean).join(" ").toLowerCase().includes(q);
    const matchType   = !tf || r.item_type === tf;
    const matchPhase  = !phase || r.code === phase || (r.parent_code && r.parent_code.startsWith(phase));
    return matchSearch && matchType && matchPhase;
  });
}

/* 가중치 미니 배지 업데이트 */
function renderWbsWeightMini() {
  const el = document.querySelector("#wbsWeightMini");
  if (!el) return;
  const rows = state.wbsPlanRows;
  if (!rows.length) { el.innerHTML = ""; return; }
  const total = rows.filter((r)=>!r.parent_code).reduce((s,r)=>s+(r.weight??0),0);
  const statusCls = total>100 ? "red" : total<99 ? "amber" : "green";
  const colors = { red: "var(--red)", amber: "var(--amber)", green: "var(--green)" };
  el.innerHTML = `
    <div class="wbs-weight-mini-bar">
      <div class="wbs-weight-mini-fill" style="width:${Math.min(100,total)}%;background:${colors[statusCls]}"></div>
    </div>
    <span style="font-weight:800;color:${colors[statusCls]}">${total}%</span>
    <span>가중치</span>`;
}

/* 테이블 단일 행 HTML */
function renderWbsProRow(row, depth, hasChildren, canMutate, rowNo) {
  const meta      = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
  const type      = row.item_type || "작업";
  const expanded  = hasChildren ? isWbsExpanded(row.code) : true;
  const crList      = Array.isArray(meta.cr_list) ? meta.cr_list : [];
  const reviewer    = meta.reviewer || "";
  const approver    = meta.approver || "";
  const wbsVersion  = meta.wbs_version ? `v${meta.wbs_version}` : "";
  const dodDone     = (meta.dod_items || []).filter((d) => d.done).length;
  const dodTotal    = (meta.dod_items || []).length;
  const projectTenant = state.projects.find((project) => project.id === state.wbsPlanProjectId)?.tenant_id;
  const rowTenant = row.tenant_id || projectTenant || state.currentTenantId || "default";
  const progressRaw = meta.progress ?? row.progress;
  const rowProgress = Number.isFinite(Number(progressRaw)) ? Math.max(0, Math.min(100, Math.round(Number(progressRaw)))) : 0;

  // RACI 배지
  const team = meta.team || "";
  const raciBadges = [
    row.owner    ? `<span class="raci-badge raci-r" title="담당: ${escapeHtml(row.owner)}">R</span>` : "",
    reviewer     ? `<span class="raci-badge raci-a" title="검토: ${escapeHtml(reviewer)}">A</span>` : "",
    approver     ? `<span class="raci-badge raci-c" title="승인: ${escapeHtml(approver)}">C</span>` : "",
    team         ? `<span class="wbs-team-badge" title="조직/팀">${escapeHtml(team)}</span>` : "",
  ].filter(Boolean).join("");

  return `
    <tr class="wbs-pro-tr"
        data-code="${escapeHtml(row.code||"")}" data-type="${escapeHtml(type)}"
        draggable="${canMutate ? "true" : "false"}">
      <td class="td-freeze td-cb">
        <span class="wbs-drag-handle" title="드래그하여 순서 변경">⠿</span>
        <span class="wbs-row-no">${rowNo}</span>
      </td>
      <td class="td-freeze td-code" style="--depth:0">
        <div style="display:flex;align-items:center;gap:4px">
          <code class="wbs-code-cell">${escapeHtml(row.code||"")}</code>
          ${wbsVersion ? `<span class="wbs-version-badge" style="font-size:0.6rem;height:16px">${escapeHtml(wbsVersion)}</span>` : ""}
        </div>
      </td>
      <td class="td-freeze td-name" style="--depth:${depth}">
        <div class="wbs-name-cell">
          ${hasChildren
            ? `<button class="wbs-toggle-btn" type="button" data-wbs-toggle="${escapeHtml(row.code)}" aria-label="${expanded?"접기":"펼치기"}">${expanded?"▾":"▸"}</button>`
            : `<span class="wbs-no-toggle"></span>`}
          <span class="wbs-type-dot" data-type="${escapeHtml(type)}"></span>
          <span class="wbs-name-text" data-wbs-inline-name="${escapeHtml(row.code||"")}">${escapeHtml(row.name||"")}${dodTotal ? `<span style="font-size:0.64rem;color:var(--text-muted);margin-left:4px">${dodDone}/${dodTotal}</span>` : ""}</span>
        </div>
      </td>
      <td class="td-type"><span class="wbs-type-badge" data-type="${escapeHtml(type)}">${escapeHtml(itemTypeLabel(type))}</span></td>
      <td class="td-tenant">${renderTenantBadge(rowTenant)}</td>
      <td class="td-owner">
        <div style="display:flex;align-items:center;gap:4px">
          <span class="wbs-owner-cell" data-wbs-inline-owner="${escapeHtml(row.code||"")}">
            ${row.owner
              ? `<span class="owner-avatar">${(row.owner[0]||"?").toUpperCase()}</span><span style="font-size:0.78rem">${escapeHtml(row.owner)}</span>`
              : `<span class="owner-empty">미배정</span>`}
          </span>
          ${raciBadges ? `<div class="wbs-raci-cell">${raciBadges}</div>` : ""}
        </div>
      </td>
      <td class="td-date">
        ${canMutate
          ? `<input type="date" class="wbs-date-input" data-wbs-date-start="${escapeHtml(row.code||"")}" value="${escapeHtml(row.start_date||"")}" title="시작일" />`
          : `<span style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(row.start_date||"-")}</span>`}
      </td>
      <td class="td-date">
        ${canMutate
          ? `<input type="date" class="wbs-date-input" data-wbs-date-end="${escapeHtml(row.code||"")}" value="${escapeHtml(row.finish_date||"")}" title="종료일" />`
          : `<span style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(row.finish_date||"-")}</span>`}
      </td>
      <td class="td-progress">
        <div class="wbs-progress-cell">
          <div class="wbs-pro-progress-bar"><div class="wbs-pro-progress-fill ${rowProgress >= 100 ? "done" : ""}" style="width:${rowProgress}%"></div></div>
          <span class="wbs-progress-pct">${rowProgress}%</span>
        </div>
      </td>
      <td class="td-weight">
        ${row.weight!=null ? `<span class="wbs-weight-pill">${row.weight}%</span>` : `<span style="color:var(--text-muted);font-size:0.76rem">-</span>`}
      </td>
      <td class="td-actions">
        <div class="wbs-row-actions">
          <button class="row-act-btn" type="button" data-wbs-detail="${escapeHtml(row.code||"")}" title="상세/사전">☰</button>
          ${canMutate && row.code ? `
            <button class="row-act-btn" type="button" data-wbs-cr="${escapeHtml(row.code)}" title="변경 요청 (CR)${crList.length ? " · "+crList.length+"건" : ""}">CR${crList.length ? `<sup>${crList.length}</sup>` : ""}</button>
            <button class="row-act-btn" type="button" data-wbs-add-child="${escapeHtml(row.code)}" title="하위 추가">+</button>
            <button class="row-act-btn danger" type="button" data-wbs-delete="${escapeHtml(row.code)}" title="삭제">×</button>` : ""}
        </div>
      </td>
    </tr>`;
}

function renderWbsPlanTable() {
  const canMutate  = canMutateWork();
  const hasProject = Boolean(state.wbsPlanProjectId);

  document.querySelector("#wbsAddRowButton").disabled       = !hasProject || !canMutate;
  const ownerMapBtn = document.querySelector("#wbsOwnerMapButton");
  if (ownerMapBtn) ownerMapBtn.disabled = !hasProject;
  const saveBtn = document.querySelector("#wbsSaveButton");
  const saveable = hasProject && canMutate && state.wbsPlanDirty;
  saveBtn.disabled = !saveable;
  saveBtn.title = !hasProject     ? "프로젝트를 먼저 선택하세요"
    : !canMutate                  ? "편집 권한이 없습니다"
    : !state.wbsPlanDirty         ? "변경 사항 없음 (행 추가·수정·삭제 후 활성화됩니다)"
    : "변경 사항을 서버에 저장합니다";
  document.querySelector("#wbsPlanDownloadButton").disabled = !hasProject;
  const ulLabel = document.querySelector("#wbsPlanUploadLabel");
  const ulInput = document.querySelector("#wbsPlanExcelInput");
  if (ulLabel) ulLabel.setAttribute("aria-disabled", (!hasProject || !canMutate) ? "true" : "false");
  if (ulLabel) ulLabel.classList.toggle("disabled-control", !hasProject || !canMutate);
  if (ulInput) ulInput.disabled = !hasProject || !canMutate;

  const selectEl = document.querySelector("#wbsPlanProjectSelect");
  if (selectEl && state.wbsPlanProjectId && selectEl.value !== state.wbsPlanProjectId) {
    selectEl.value = state.wbsPlanProjectId;
  }

  renderWbsPlanFilters();
  renderWbsWeightSummary();
  renderWbsWeightMini();

  const allRows   = state.wbsPlanRows;
  const rowByCode = new Map(allRows.map((r) => [r.code, r]));
  const childMap  = buildChildMap(allRows);
  const filtered  = wbsProFilteredRows();

  const countEl = document.querySelector("#wbsBoardCount");
  if (countEl) countEl.textContent = filtered.length ? `${filtered.length}개` : "";

  const tbody = document.querySelector("#wbsTableBody");
  if (!tbody) return;

  if (!hasProject) {
    tbody.innerHTML = `<tr class="wbs-empty-row"><td colspan="11"><strong>프로젝트를 선택하세요</strong></td></tr>`;
    return;
  }
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="wbs-empty-row"><td colspan="11">${
      state.wbsPlanTypeFilter || state.wbsPlanPhaseFilter || state.wbsPlanSearch ? "검색 조건에 맞는 항목 없음" : "행 추가 버튼이나 Excel 업로드로 WBS를 시작하세요"
    }</td></tr>`;
    return;
  }

  const rendered = [];
  const visited  = new Set();
  const hasActiveWbsPlanFilter = Boolean(state.wbsPlanTypeFilter || state.wbsPlanPhaseFilter || state.wbsPlanSearch.trim());
  const filteredKeys = new Set(filtered.map((row) => row.code).filter(Boolean));
  const visibleKeys = new Set(filteredKeys);

  if (hasActiveWbsPlanFilter) {
    filtered.forEach((row) => {
      let cur = row;
      const seen = new Set();
      while (cur?.parent_code && !seen.has(cur.parent_code)) {
        seen.add(cur.parent_code);
        visibleKeys.add(cur.parent_code);
        cur = rowByCode.get(cur.parent_code);
      }
    });
  }

  function hasVisibleDescendant(code) {
    return (childMap[code] || []).some((childCode) => visibleKeys.has(childCode) || hasVisibleDescendant(childCode));
  }

  let rowCounter = 0;

  function walkProRow(code) {
    if (visited.has(code)) return;
    visited.add(code);
    const row = rowByCode.get(code);
    if (!row) return;
    if (hasActiveWbsPlanFilter && !visibleKeys.has(code)) return;
    const depth      = wbsItemDepth(row, rowByCode);
    const children   = childMap[code] || [];
    const hasChildren = children.length > 0;
    const expanded   = isWbsExpanded(code);
    rowCounter += 1;
    rendered.push(renderWbsProRow(row, depth, hasChildren, canMutate, rowCounter));
    if (hasChildren && (expanded || (hasActiveWbsPlanFilter && hasVisibleDescendant(code)))) {
      children.forEach((c) => walkProRow(c));
    }
  }

  allRows
    .filter((r) => !r.parent_code || !rowByCode.has(r.parent_code))
    .forEach((r) => {
      if (r.code) {
        walkProRow(r.code);
      } else if (!hasActiveWbsPlanFilter) {
        rowCounter += 1;
        rendered.push(renderWbsProRow(r, 0, false, canMutate, rowCounter));
      }
    });

  if (hasActiveWbsPlanFilter) {
    filtered.forEach((r) => {
      if (r.code && visited.has(r.code)) return;
      rowCounter += 1;
      rendered.push(renderWbsProRow(r, wbsItemDepth(r,rowByCode), false, canMutate, rowCounter));
    });
  }

  tbody.innerHTML = rendered.join("");
}

function renderWbsPlan() {
  renderWbsPlanProjectList();
  renderWbsPlanTable();
}

async function loadWbsPlanProject(projectId) {
  if (!projectId) return;
  state.wbsPlanProjectId = projectId;
  state.wbsPlanDirty  = false;
  state.wbsExpanded   = {};        // 새 프로젝트: 전체 펼침
  state.wbsPlanSearch = "";
  state.wbsPlanPhaseFilter = "";
  state.wbsPlanTypeFilter  = "";
  const statusEl = document.querySelector("#wbsPlanStatus");
  if (statusEl) statusEl.textContent = "";

  try {
    const rows = await request(`/api/projects/${encodeURIComponent(projectId)}/wbs-items`);
    state.wbsPlanRows = rows.map((r) => ({ ...r }));
  } catch {
    // sync-plan 기반 폴백
    try {
      const plan = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-plan`);
      state.wbsPlanRows = (plan.rows || []).map((r) => ({ ...r }));
    } catch {
      state.wbsPlanRows = [];
    }
  }
  renderWbsPlan();
}

function openWbsRowDialog(mode, row = null) {
  const dialog = document.querySelector("#wbsRowDialog");
  const form   = document.querySelector("#wbsRowForm");
  form.reset();
  document.querySelector("#wbsRowFormStatus").textContent = "";
  document.querySelector("#wbsRowDialogTitle").textContent = mode === "add" ? "행 추가" : "행 수정";
  state.wbsPlanEditCode = mode === "edit" ? (row?.code || null) : null;

  const meta = (row?.metadata && typeof row.metadata === "object") ? row.metadata : {};

  // 기본 필드
  document.querySelector("#wbsRowCode").value       = row?.code        || "";
  document.querySelector("#wbsRowParentCode").value = row?.parent_code || "";
  document.querySelector("#wbsRowName").value       = row?.name        || "";
  document.querySelector("#wbsRowItemType").value   = row?.item_type   || "작업";
  document.querySelector("#wbsRowOwner").value      = row?.owner       || "";
  document.querySelector("#wbsRowWeight").value     = row?.weight != null ? row.weight : "";
  document.querySelector("#wbsRowStartDate").value  = row?.start_date  || "";
  document.querySelector("#wbsRowFinishDate").value = row?.finish_date || "";

  // 실행 상태/진척률은 작업 현황에서 관리하며, 과거 데이터 호환을 위해 값만 보존합니다.
  const statusEl   = document.querySelector("#wbsRowStatus");
  const priorityEl = document.querySelector("#wbsRowPriority");
  const progressEl = document.querySelector("#wbsRowProgress");
  const progressLbl = document.querySelector("#wbsRowProgressLabel");
  const effortEl   = document.querySelector("#wbsRowEffort");

  if (statusEl)   statusEl.value   = meta.status   || "대기";
  if (priorityEl) priorityEl.value = meta.priority  || "보통";
  if (progressEl) {
    progressEl.value = meta.progress ?? 0;
    if (progressLbl) progressLbl.textContent = `${meta.progress ?? 0}%`;
    progressEl.oninput = () => { if (progressLbl) progressLbl.textContent = `${progressEl.value}%`; };
  }
  if (effortEl) effortEl.value = meta.effort || "";

  // R&R 필드
  const reviewerEl = document.querySelector("#wbsRowReviewer");
  const approverEl = document.querySelector("#wbsRowApprover");
  if (reviewerEl) reviewerEl.value = meta.reviewer || "";
  if (approverEl) approverEl.value = meta.approver || "";

  // 조직/팀 필드
  const teamEl = document.querySelector("#wbsRowTeam");
  if (teamEl) teamEl.value = meta.team || row?.team || "";

  dialog.showModal();
  document.querySelector("#wbsRowName").focus();
}

function closeWbsRowDialog() {
  document.querySelector("#wbsRowDialog").close();
}

function applyWbsRowForm() {
  const code       = document.querySelector("#wbsRowCode").value.trim()       || null;
  const parentCode = document.querySelector("#wbsRowParentCode").value.trim() || null;
  const name       = document.querySelector("#wbsRowName").value.trim();
  const itemType   = document.querySelector("#wbsRowItemType").value;
  const owner      = document.querySelector("#wbsRowOwner").value.trim()      || null;
  const weightRaw  = document.querySelector("#wbsRowWeight").value;
  const weight     = weightRaw !== "" ? parseFloat(weightRaw) : null;
  const startDate  = document.querySelector("#wbsRowStartDate").value         || null;
  const finishDate = document.querySelector("#wbsRowFinishDate").value        || null;
  const effort     = document.querySelector("#wbsRowEffort")?.value.trim() || null;

  if (!name) {
    document.querySelector("#wbsRowFormStatus").textContent = "작업명은 필수입니다.";
    return false;
  }

  // metadata 병합
  const existingRow = state.wbsPlanEditCode
    ? state.wbsPlanRows.find((r) => r.code === state.wbsPlanEditCode)
    : null;
  const existingMeta = (existingRow?.metadata && typeof existingRow.metadata === "object") ? existingRow.metadata : {};
  const reviewer   = document.querySelector("#wbsRowReviewer")?.value.trim() || null;
  const approver   = document.querySelector("#wbsRowApprover")?.value.trim() || null;
  const team       = document.querySelector("#wbsRowTeam")?.value.trim()     || null;
  const metadata = { ...existingMeta, effort, reviewer, approver, team };

  const newRow = { code, parent_code: parentCode, name, item_type: itemType, owner, weight, start_date: startDate, finish_date: finishDate, metadata };

  if (state.wbsPlanEditCode) {
    // 수정
    const idx = state.wbsPlanRows.findIndex((r) => r.code === state.wbsPlanEditCode);
    if (idx >= 0) {
      state.wbsPlanRows[idx] = { ...state.wbsPlanRows[idx], ...newRow };
      // 코드가 변경된 경우 하위 항목 parent_code도 업데이트
      if (code && code !== state.wbsPlanEditCode) {
        state.wbsPlanRows.forEach((r) => {
          if (r.parent_code === state.wbsPlanEditCode) r.parent_code = code;
        });
      }
    }
  } else {
    // 추가 — 임시 코드가 없으면 null로 저장 (서버에서 자동 생성)
    state.wbsPlanRows.push(newRow);
  }

  state.wbsPlanDirty = true;
  closeWbsRowDialog();
  renderWbsPlanTable();
  return true;
}

function deleteWbsRow(code) {
  if (!code) return;
  if (!window.confirm(`"${code}" 행을 삭제하시겠습니까? 하위 항목도 함께 삭제됩니다.`)) return;

  // 해당 코드 및 모든 하위 항목 제거
  const toRemove = new Set();
  function collectChildren(parentCode) {
    state.wbsPlanRows.forEach((r) => {
      if (r.parent_code === parentCode && !toRemove.has(r.code)) {
        toRemove.add(r.code);
        collectChildren(r.code);
      }
    });
  }
  toRemove.add(code);
  collectChildren(code);

  state.wbsPlanRows = state.wbsPlanRows.filter((r) => !toRemove.has(r.code));
  state.wbsPlanDirty = true;
  renderWbsPlanTable();
}

async function saveWbsPlan() {
  if (!state.wbsPlanProjectId || !state.wbsPlanDirty) return;
  const statusEl = document.querySelector("#wbsPlanStatus");
  const saveBtn  = document.querySelector("#wbsSaveButton");
  saveBtn.disabled = true;
  if (statusEl) statusEl.textContent = "저장 중…";

  try {
    const result = await request(`/api/projects/${encodeURIComponent(state.wbsPlanProjectId)}/wbs-items`, {
      method: "POST",
      body: JSON.stringify({ rows: state.wbsPlanRows, source: "portal-editor" }),
    });
    state.wbsPlanRows  = (result.rows || []).map((r) => ({ ...r }));
    state.wbsPlanDirty = false;

    const ver   = result.wbs_version ?? result.summary?.wbs_version ?? "";
    const rows  = result.summary?.rows ?? 0;
    const verStr = ver ? ` (v${ver})` : "";
    if (statusEl) statusEl.textContent = `저장 완료${verStr} — ${rows}행`;

    // 프로젝트 metadata에 버전 정보 반영 (로컬 state 갱신)
    const proj = state.projects.find((p) => p.id === state.wbsPlanProjectId);
    if (proj) {
      const meta = proj.metadata || {};
      meta.wbs_version    = ver;
      meta.wbs_last_saved = new Date().toISOString();
      meta.wbs_rows       = rows;
      proj.metadata = meta;
    }

    // 셀렉트 옵션 버전 텍스트 업데이트
    const sel = document.querySelector("#wbsPlanProjectSelect");
    if (sel) {
      const opt = sel.querySelector(`option[value="${CSS.escape(state.wbsPlanProjectId)}"]`);
      if (opt && proj) {
        opt.textContent = formatProjectSelectLabel(proj);
      }
    }

    renderWbsPlanTable();
    renderWbsWeightMini();
    if (state.opViewProjectId === state.wbsPlanProjectId) {
      state.opViewRows = state.wbsPlanRows.map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
      renderOpViewPanels();
    }

    // 작업 현황(워크보드)에 동일 프로젝트가 로드되어 있으면 즉시 동기화
    if (state.workboardProjectId === state.wbsPlanProjectId) {
      state.workboardRows = state.wbsPlanRows.map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
      state.workboardLoadedProjectId = state.wbsPlanProjectId;
      if (proj && ["agile", "hybrid"].includes(projectDeliveryMode(proj))) {
        await syncAgileFromWbs(state.wbsPlanProjectId);
        const [syncedItems, syncedMetrics] = await Promise.all([
          request(`/api/projects/${encodeURIComponent(state.wbsPlanProjectId)}/agile/backlog`).catch(() => null),
          request(`/api/projects/${encodeURIComponent(state.wbsPlanProjectId)}/agile/metrics`).catch(() => null),
        ]);
        if (syncedItems) state.agileItems = syncedItems;
        if (syncedMetrics) state.agileMetrics = syncedMetrics;
        state.agileLoadedProjectId = state.wbsPlanProjectId;
      }
      if (document.body.dataset.portalView === "workboard") {
        renderWorkboardPanel();
      }
    }
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message;
    saveBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════
   내부 작업 현황 — 내 작업 / PM 보드 / 간트
══════════════════════════════════════════════════════ */

function workboardProjects() {
  return (state.projects || []).filter((project) => project && project.id);
}

function ensureWorkboardProjectSelection() {
  const projects = workboardProjects();
  if (!projects.length) {
    state.workboardProjectId = null;
    return null;
  }
  const exists = projects.some((project) => project.id === state.workboardProjectId);
  if (!state.workboardProjectId || !exists) {
    state.workboardProjectId = projects[0].id;
    state.workboardLoadedProjectId = null;
    state.workboardRows = [];
  }
  return state.workboardProjectId;
}

function normalizeTaskMetadata(metadata) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
}

function workboardTaskRows() {
  return (state.workboardRows || [])
    .map((row) => ({ ...row, project_id: row.project_id || state.workboardProjectId }))
    .filter((row) => (row.item_type || "작업") !== "프로젝트");
}

function workboardRowProjectId(row) {
  return String(row?.project_id || state.workboardProjectId || "");
}

function workboardTaskKey(row) {
  return `${workboardRowProjectId(row)}::${String(row?.code || row?.id || "")}`;
}

function splitWorkboardTaskKey(key) {
  const [projectId, ...codeParts] = String(key || "").split("::");
  return { projectId, code: codeParts.join("::") };
}

function allWorkboardRows() {
  const rows = [...(state.workboardRows || []), ...(state.myWorkItems || [])];
  const seen = new Set();
  return rows
    .map((row) => ({ ...row, project_id: row.project_id || state.workboardProjectId }))
    .filter((row) => {
      const key = workboardTaskKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function canEditWorkboardTask(row) {
  return canMutateWork() || isMyWorkboardTask(row);
}

function workboardTaskStatus(row) {
  const meta = normalizeTaskMetadata(row?.metadata);
  const raw = meta.status || row?.status || "";
  if (WBS_STATUSES.includes(raw)) return raw;
  if (raw === "진행 중") return "진행중";
  if (raw === "미시작") return "대기";
  return isWorkboardOverdue(row) ? "지연" : "대기";
}

function workboardTaskProgress(row) {
  const meta = normalizeTaskMetadata(row?.metadata);
  const value = Number(meta.progress ?? row?.progress ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function workboardTaskPriority(row) {
  const meta = normalizeTaskMetadata(row?.metadata);
  return meta.priority || "보통";
}

function workboardTaskOwnerText(row) {
  const meta = normalizeTaskMetadata(row?.metadata);
  return [row?.owner, meta.reviewer, meta.approver, meta.team].filter(Boolean).join(" · ");
}

function workboardCurrentUserTokens() {
  const user = state.currentUser || {};
  const raw = [
    user.display_name,
    user.email,
    user.email ? String(user.email).split("@")[0] : "",
  ].filter(Boolean);
  return raw.map((token) => String(token).trim().toLowerCase()).filter(Boolean);
}

function isMyWorkboardTask(row) {
  const tokens = workboardCurrentUserTokens();
  if (!tokens.length) return false;
  const haystack = workboardTaskOwnerText(row).toLowerCase();
  return tokens.some((token) => token && haystack.includes(token));
}

function isWorkboardOverdue(row) {
  const status = normalizeTaskMetadata(row?.metadata).status || row?.status || "";
  if (status === "완료") return false;
  const finish = parseIsoDate(row?.finish_date);
  if (!finish) return false;
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return finish < utcToday;
}

function workboardProjectRiskCounts(projectId) {
  const risks = state.risks.filter((item) => item.project_id === projectId && isOpenRiStatus(item.status)).length;
  const issues = state.issues.filter((item) => item.project_id === projectId && isOpenRiStatus(item.status)).length;
  return { risks, issues };
}

function currentWorkboardProject() {
  return state.projects.find((project) => project.id === state.workboardProjectId) || null;
}

function projectDeliveryMode(project = currentWorkboardProject()) {
  return project?.delivery_mode || project?.metadata?.delivery_mode || "waterfall";
}

function isAgileCapableProject(project = currentWorkboardProject()) {
  return ["agile", "hybrid"].includes(projectDeliveryMode(project));
}

function agileStatusLabel(status) {
  const labels = {
    Backlog: "Backlog",
    Ready: "Ready",
    "In Progress": "In Progress",
    Review: "Review",
    Done: "Done",
  };
  return labels[status] || status || "-";
}

function agilePriorityLabel(priority) {
  const labels = { Must: "Must", Should: "Should", Could: "Could", Wont: "Won't" };
  return labels[priority] || priority || "-";
}

function agileItemKey(item) {
  return String(item?.id || "");
}

function sprintById(id) {
  return state.agileSprints.find((sprint) => sprint.id === id) || null;
}

function activeAgileSprint() {
  const today = new Date().toISOString().slice(0, 10);
  return state.agileSprints.find((sprint) => sprint.status === "Active")
    || state.agileSprints.find((sprint) => sprint.start_date <= today && sprint.end_date >= today)
    || state.agileSprints[0]
    || null;
}

function ensureAgileSprintSelection() {
  const active = activeAgileSprint();
  if (!state.agileSelectedSprintId || !state.agileSprints.some((sprint) => sprint.id === state.agileSelectedSprintId)) {
    state.agileSelectedSprintId = active?.id || "";
  }
  return state.agileSelectedSprintId;
}

function agileSprintOptions(selectedId = "", includeBacklog = true) {
  const base = includeBacklog ? [`<option value="">백로그</option>`] : [];
  return base.concat(state.agileSprints.map((sprint) => `
    <option value="${escapeHtml(sprint.id)}" ${sprint.id === selectedId ? "selected" : ""}>
      ${escapeHtml(sprint.name)} (${escapeHtml(sprint.status)})
    </option>`)).join("");
}

function agileWbsOptions(selectedCode = "") {
  const rows = workboardTaskRows();
  return [`<option value="">WBS 미연결</option>`].concat(rows.map((row) => `
    <option value="${escapeHtml(row.code || "")}" ${row.code === selectedCode ? "selected" : ""}>
      ${escapeHtml(row.code || "-")} · ${escapeHtml(row.name || "-")}
    </option>`)).join("");
}

function renderDeliveryModeSelect() {
  const sel = document.querySelector("#projectDeliveryModeSelect");
  if (!sel) return;
  const project = currentWorkboardProject();
  const mode = projectDeliveryMode(project);
  sel.value = mode;
  sel.disabled = !project || !canMutateWork();
  sel.title = project ? "프로젝트 수행 방식" : "프로젝트를 선택하세요";
}

function renderWorkboardProjectSelect() {
  const sel = document.querySelector("#workboardProjectSelect");
  if (!sel) return;
  const projects = workboardProjects();
  ensureWorkboardProjectSelection();
  sel.innerHTML = projects.length
    ? projects.map((project) => `
      <option value="${escapeHtml(project.id)}" ${project.id === state.workboardProjectId ? "selected" : ""}>
        ${escapeHtml(project.name)} [${escapeHtml(DELIVERY_MODE_LABELS[projectDeliveryMode(project)] || "Waterfall")} · ${escapeHtml(statusLabel(project.status || "Draft"))}]
      </option>`).join("")
    : `<option value="">프로젝트 없음</option>`;
  sel.disabled = !projects.length;
  renderDeliveryModeSelect();
  const refreshBtn = document.querySelector("#workboardRefreshBtn");
  if (refreshBtn) refreshBtn.disabled = !state.workboardProjectId || state.workboardLoading;
}

function updateWorkboardStatus(message = "", tone = "") {
  const el = document.querySelector("#workboardStatus");
  if (!el) return;
  const text = message || state.workboardStatusMessage || "대기";
  el.textContent = text;
  el.className = `status-pill ${tone}`.trim();
}

function maybeLoadWorkboardProject() {
  const projectId = ensureWorkboardProjectSelection();
  if (!projectId || state.workboardLoading || state.workboardLoadedProjectId === projectId) return;
  loadWorkboardProject(projectId);
}

async function loadWorkboardProject(projectId = state.workboardProjectId) {
  if (!projectId) return;
  state.workboardProjectId = projectId;
  state.workboardLoading = true;
  state.agileLoading = true;
  state.workboardStatusMessage = "로딩 중";
  renderWorkboardPanel();
  try {
    if (canAccessOperations()) {
      await request("/api/work-items/alerts/scan", { method: "POST" }).catch(() => null);
    }
    const rows = await request(`/api/projects/${encodeURIComponent(projectId)}/work-items`);
    state.workboardRows = (rows || []).map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
    await loadAgileProject(projectId, { render: false });
    state.myWorkItems = (await request("/api/me/work-items").catch(() => state.myWorkItems || []))
      .map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
    state.workboardLoadedProjectId = projectId;
    state.workboardStatusMessage = `${state.workboardRows.length}개 항목`;
    loadNotifications();
  } catch (error) {
    state.workboardRows = [];
    state.agileSprints = [];
    state.agileItems = [];
    state.agileMetrics = null;
    state.agileLoadedProjectId = null;
    state.workboardLoadedProjectId = null;
    state.workboardStatusMessage = error.message;
  } finally {
    state.workboardLoading = false;
    state.agileLoading = false;
    renderWorkboardPanel();
  }
}

async function syncAgileFromWbs(projectId = state.workboardProjectId) {
  if (!projectId) return null;
  try {
    return await request(`/api/projects/${encodeURIComponent(projectId)}/agile/sync-from-wbs`, { method: "POST" });
  } catch (_) {
    return null;
  }
}

async function loadAgileProject(projectId = state.workboardProjectId, options = {}) {
  if (!projectId) return;
  state.agileLoading = true;
  try {
    const [sprints, items, metrics] = await Promise.all([
      request(`/api/projects/${encodeURIComponent(projectId)}/agile/sprints`),
      request(`/api/projects/${encodeURIComponent(projectId)}/agile/backlog`),
      request(`/api/projects/${encodeURIComponent(projectId)}/agile/metrics`),
    ]);
    state.agileSprints = sprints || [];
    state.agileItems = items || [];
    state.agileMetrics = metrics || null;

    // WBS 항목이 있는데 Agile 항목이 비어 있으면 자동 동기화
    if (!state.agileItems.length && state.workboardRows?.length) {
      await syncAgileFromWbs(projectId);
      const [syncedItems, syncedMetrics] = await Promise.all([
        request(`/api/projects/${encodeURIComponent(projectId)}/agile/backlog`),
        request(`/api/projects/${encodeURIComponent(projectId)}/agile/metrics`),
      ]);
      state.agileItems = syncedItems || [];
      state.agileMetrics = syncedMetrics || null;
    }

    state.agileLoadedProjectId = projectId;
    ensureAgileSprintSelection();
  } catch (error) {
    state.agileSprints = [];
    state.agileItems = [];
    state.agileMetrics = null;
    state.agileLoadedProjectId = null;
    state.workboardStatusMessage = error.message;
  } finally {
    state.agileLoading = false;
    if (options.render !== false) renderWorkboardPanel();
  }
}

function renderWorkboardAlerts(rows) {
  const wrap = document.querySelector("#workboardAlertRow");
  if (!wrap || !state.workboardProjectId) {
    if (wrap) wrap.innerHTML = "";
    return;
  }

  const view = state.workboardView;

  // Agile 탭: agileMetrics 기준으로 상단 카드 업데이트
  if (["agile-backlog", "agile-board", "agile-metrics"].includes(view)) {
    if (state.agileLoadedProjectId !== state.workboardProjectId) {
      wrap.innerHTML = "";
      return;
    }
    const totals = state.agileMetrics?.totals || {};
    const ri = workboardProjectRiskCounts(state.workboardProjectId);
    const remaining = state.agileMetrics?.burndown?.remaining_points ?? "-";
    wrap.innerHTML = `
      <div class="workboard-alert"><strong>${totals.total_items || 0}</strong><span>Agile 항목</span></div>
      <div class="workboard-alert"><strong>${Number(totals.completion_rate || 0)}%</strong><span>SP 완료율</span></div>
      <div class="workboard-alert"><strong>${Number(totals.done_points || 0)}/${Number(totals.total_points || 0)}</strong><span>완료/전체 SP</span></div>
      <div class="workboard-alert"><strong>${remaining}</strong><span>잔여 SP (활성 Sprint)</span></div>`;
    return;
  }

  // 내 작업 탭: 프로젝트 미로딩 시 myWorkItems로 카드 표시
  const effectiveRows = (view === "mine" && !rows.length && state.myWorkItems?.length)
    ? state.myWorkItems
    : rows;

  // 일반 탭: 프로젝트 미로딩 + 대체 데이터 없으면 클리어
  if (!effectiveRows.length && state.workboardLoadedProjectId !== state.workboardProjectId) {
    wrap.innerHTML = "";
    return;
  }

  const overdue = effectiveRows.filter(isWorkboardOverdue).length;
  const done = effectiveRows.filter((row) => workboardTaskStatus(row) === "완료").length;
  const avgProgress = effectiveRows.length
    ? Math.round(effectiveRows.reduce((sum, row) => sum + workboardTaskProgress(row), 0) / effectiveRows.length)
    : 0;
  const pendingApprovals = effectiveRows.filter((row) => {
    const meta = normalizeTaskMetadata(row.metadata);
    return meta.approver && workboardTaskStatus(row) !== "완료";
  }).length;
  const ri = workboardProjectRiskCounts(state.workboardProjectId);
  wrap.innerHTML = `
    <div class="workboard-alert ${overdue ? "overdue" : ""}"><strong>${overdue}</strong><span>지연/기한 초과 알림</span></div>
    <div class="workboard-alert"><strong>${avgProgress}%</strong><span>평균 진행률</span></div>
    <div class="workboard-alert"><strong>${done}/${effectiveRows.length}</strong><span>완료 작업 항목</span></div>
    <div class="workboard-alert"><strong>${ri.risks + ri.issues}/${pendingApprovals}</strong><span>리스크·이슈 / 승인 확인</span></div>`;
}

function renderWorkboardPanel() {
  const panel = document.querySelector("#workboard");
  const body = document.querySelector("#workboardBody");
  if (!panel || !body) return;
  const projectId = ensureWorkboardProjectSelection();
  renderWorkboardProjectSelect();
  renderDeliveryModeSelect();
  panel.dataset.workboardView = state.workboardView;
  document.querySelectorAll(".workboard-tab").forEach((tab) => {
    const active = tab.dataset.workboardView === state.workboardView;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (state.workboardLoading) {
    updateWorkboardStatus("로딩 중", "attention");
    renderWorkboardAlerts([]);
    body.innerHTML = `
      <div class="skeleton-stack">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>`;
    renderWorkboardDrawer();
    return;
  }

  if (!projectId) {
    updateWorkboardStatus("프로젝트 없음", "attention");
    renderWorkboardAlerts([]);
    body.innerHTML = `<div class="workboard-empty">등록된 프로젝트가 없습니다. 프로젝트를 먼저 생성하세요.</div>`;
    renderWorkboardDrawer();
    return;
  }

  if (state.workboardLoadedProjectId !== projectId) {
    if (state.workboardView === "mine") {
      updateWorkboardStatus(`${state.myWorkItems.length}개 내 작업`, state.myWorkItems.length ? "stable" : "attention");
      renderWorkboardAlerts(state.myWorkItems || []);
      body.innerHTML = renderMyWorkboardTasks([]);
      renderWorkboardDrawer();
      return;
    }
    updateWorkboardStatus("조회 필요", "attention");
    renderWorkboardAlerts([]);
    body.innerHTML = `<div class="workboard-empty">조회 버튼을 눌러 선택한 프로젝트의 내부 WBS 작업 항목을 불러오세요.</div>`;
    renderWorkboardDrawer();
    return;
  }

  const rows = workboardTaskRows();
  updateWorkboardStatus(state.workboardStatusMessage || `${rows.length}개 항목`, rows.length ? "stable" : "attention");
  renderWorkboardAlerts(rows);

  if (state.workboardView === "agile-backlog") {
    body.innerHTML = renderAgileBacklog();
  } else if (state.workboardView === "agile-board") {
    body.innerHTML = renderAgileSprintBoard();
  } else if (state.workboardView === "agile-metrics") {
    body.innerHTML = renderAgileMetrics();
  } else if (!rows.length && state.workboardView !== "mine") {
    body.innerHTML = `<div class="workboard-empty">이 프로젝트에는 아직 WBS 작업 항목이 없습니다. WBS 관리에서 항목을 추가하세요.</div>`;
  } else if (state.workboardView === "board") {
    body.innerHTML = renderWorkboardBoard(rows);
  } else if (state.workboardView === "gantt") {
    body.innerHTML = renderInternalGantt(rows);
  } else {
    body.innerHTML = renderMyWorkboardTasks(rows);
  }
  renderWorkboardDrawer();
}

function renderWorkboardProgress(row) {
  const progress = workboardTaskProgress(row);
  return `
    <div class="workboard-progress">
      <div class="workboard-progress-track"><div class="workboard-progress-fill" style="width:${progress}%"></div></div>
      <span>${progress}%</span>
    </div>`;
}

function renderWorkboardStatusPill(row) {
  const status = workboardTaskStatus(row);
  return `<span class="workboard-status-pill status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function renderMyWorkboardTasks(rows) {
  const mine = (state.myWorkItems?.length ? state.myWorkItems : rows.filter(isMyWorkboardTask))
    .map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
  const visible = mine.length ? mine : [];
  const summary = mine.length
    ? `${mine.length}개 내 작업`
    : "현재 로그인 사용자와 담당자/검토자/승인자가 매칭된 작업이 없습니다.";
  if (!visible.length) {
    return `
      <div class="workboard-summary-line"><span>${escapeHtml(summary)}</span></div>
      <div class="workboard-empty">전체 작업 보드에서 담당자를 지정하면 이 화면에 개인 작업이 표시됩니다.</div>`;
  }
  const rowsHtml = visible.map((row) => `
    <tr>
      <td>
        <div class="workboard-task-title">
          <strong>${escapeHtml(row.name || "-")}</strong>
          <span>${escapeHtml(row.project_name || "프로젝트")} · ${escapeHtml(row.code || "-")} · ${escapeHtml(row.item_type || "작업")}</span>
        </div>
      </td>
      <td>${escapeHtml(row.owner || "미배정")}</td>
      <td>${renderWorkboardStatusPill(row)}</td>
      <td>${renderWorkboardProgress(row)}</td>
      <td>${escapeHtml(row.finish_date || "기한 없음")}</td>
      <td><button class="wbs-pro-btn-sm" type="button" data-workboard-task="${escapeHtml(workboardTaskKey(row))}">상세</button></td>
    </tr>`).join("");
  return `
    <div class="workboard-summary-line"><span>${escapeHtml(summary)}</span><span>현재 테넌트의 담당/검토/승인 매칭 작업입니다.</span></div>
    <div class="workboard-table-wrap">
      <table class="workboard-table">
        <thead><tr><th>작업 항목</th><th>담당자</th><th>상태</th><th>진척률</th><th>기한</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function renderWorkboardBoard(rows) {
  const columns = WBS_STATUSES.map((status) => {
    const items = rows.filter((row) => workboardTaskStatus(row) === status);
    const cards = items.length ? items.map((row) => {
      const editable = canEditWorkboardTask(row);
      const itemType = row.item_type || "작업";
      return `
      <button class="workboard-card" type="button" data-type="${escapeHtml(itemType)}"
        draggable="${editable ? "true" : "false"}"
        data-workboard-task="${escapeHtml(workboardTaskKey(row))}"
        data-workboard-project="${escapeHtml(workboardRowProjectId(row))}">
        <div class="workboard-card-head">
          <span class="card-type-badge">${escapeHtml(itemTypeLabel(itemType))}</span>
          <span class="workboard-card-code">${escapeHtml(row.code || "-")}</span>
        </div>
        <strong>${escapeHtml(row.name || "-")}</strong>
        ${renderWorkboardProgress(row)}
        <div class="workboard-card-meta">
          <span>${escapeHtml(row.owner || "미배정")}</span>
          <span>${escapeHtml(row.finish_date || "기한 없음")}</span>
        </div>
      </button>`;
    }).join("") : `<div class="workboard-empty" style="padding:14px;font-size:0.78rem">항목 없음</div>`;
    return `
      <section class="workboard-board-column" data-workboard-status="${escapeHtml(status)}" data-workboard-drop-status="${escapeHtml(status)}">
        <div class="workboard-board-head"><span>${escapeHtml(status)}</span><small>${items.length}</small></div>
        <div class="workboard-card-list">${cards}</div>
      </section>`;
  }).join("");
  return `
    <div class="workboard-summary-line"><span>PM용 프로젝트 작업 보드</span><span>카드를 컬럼으로 이동해 상태를 바로 변경합니다.</span></div>
    <div class="workboard-board">${columns}</div>`;
}

function renderInternalGantt(rows) {
  const datedRows = rows.filter((row) => row.start_date || row.finish_date);
  if (!datedRows.length) {
    return `<div class="workboard-empty">시작일 또는 종료일이 있는 WBS 작업 항목이 없습니다. 상세에서 기간을 입력하면 간트에 표시됩니다.</div>`;
  }
  const allDates = datedRows.flatMap((row) => [row.start_date, row.finish_date].filter(Boolean)).map(parseIsoDate).filter(Boolean);
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  minDate.setUTCDate(1);
  maxDate.setUTCMonth(maxDate.getUTCMonth() + 1, 0);
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000));
  const months = [];
  let cur = new Date(minDate);
  while (cur <= maxDate) {
    const nextMonth = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    const end = nextMonth > maxDate ? maxDate : new Date(nextMonth - 1);
    const days = Math.ceil((end - cur) / 86400000) + 1;
    months.push({ label: `${cur.getUTCMonth() + 1}월`, pct: (days / totalDays * 100).toFixed(2) });
    cur = nextMonth;
  }
  const header = months.map((month) => `<div class="workboard-gantt-month" style="flex:${month.pct}">${month.label}</div>`).join("");
  const rowsHtml = datedRows.map((row) => {
    const startIso = row.start_date || row.finish_date;
    const finishIso = row.finish_date || row.start_date;
    const start = parseIsoDate(startIso);
    const finish = parseIsoDate(finishIso) || start;
    const left = Math.max(0, ((start - minDate) / 86400000 / totalDays) * 100);
    const width = Math.max(0.5, ((finish - start) / 86400000 + 1) / totalDays * 100);
    const progress = workboardTaskProgress(row);
    const status = workboardTaskStatus(row);
    const canEdit = canEditWorkboardTask(row);
    const editAttrs = canEdit ? `
            data-wb-gantt-task="${escapeHtml(workboardTaskKey(row))}"
            data-wb-gantt-start="${escapeHtml(startIso)}"
            data-wb-gantt-finish="${escapeHtml(finishIso)}"
            data-wb-gantt-scale-start="${escapeHtml(formatIsoDate(minDate))}"
            data-wb-gantt-total-days="${totalDays}"` : "";
    return `
      <div class="workboard-gantt-row">
        <div class="workboard-gantt-label">
          <span class="workboard-gantt-code">${escapeHtml(row.code || "-")}</span>
          <span class="workboard-gantt-name">${escapeHtml(row.name || "-")}</span>
        </div>
        <div class="workboard-gantt-track">
          <button class="workboard-gantt-bar ${canEdit ? "workboard-gantt-editable" : ""}" type="button"
            data-workboard-task="${escapeHtml(workboardTaskKey(row))}"
            data-status="${escapeHtml(status)}"
            ${editAttrs}
            style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"
            title="${escapeHtml(row.name || "-")} (${escapeHtml(startIso)}~${escapeHtml(finishIso)})">
            ${canEdit ? `
              <span class="workboard-gantt-handle start" data-wb-gantt-handle="start" title="시작일 조정"></span>
              <span class="workboard-gantt-handle end" data-wb-gantt-handle="end" title="종료일 조정"></span>
              <span class="workboard-gantt-date-badge">${escapeHtml(startIso)} ~ ${escapeHtml(finishIso)}</span>
            ` : ""}
            <span class="workboard-gantt-bar-progress" style="width:${progress}%"></span>
          </button>
        </div>
      </div>`;
  }).join("");
  return `
    <div class="workboard-summary-line"><span>PM용 내부 WBS 간트</span><span>막대 이동 또는 양끝 핸들로 기간을 조정합니다.</span></div>
    <div class="workboard-gantt-wrap">
      <div class="workboard-gantt">
        <div class="workboard-gantt-header">
          <div class="workboard-gantt-label">작업명</div>
          <div class="workboard-gantt-scale">${header}</div>
        </div>
        ${rowsHtml}
      </div>
    </div>`;
}

function renderAgileModeNotice() {
  const project = currentWorkboardProject();
  const mode = projectDeliveryMode(project);
  const label = DELIVERY_MODE_LABELS[mode] || "Waterfall";
  const tone = isAgileCapableProject(project) ? "stable" : "attention";
  const text = isAgileCapableProject(project)
    ? `${label} 수행 방식으로 백로그와 스프린트를 운영합니다.`
    : "현재 프로젝트는 Waterfall입니다. Agile 또는 Hybrid로 전환하면 백로그와 스프린트 보드를 실행 기준으로 사용할 수 있습니다.";
  return `<div class="agile-mode-banner ${tone}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function renderAgileSprintCards() {
  if (!state.agileSprints.length) {
    return `<div class="workboard-empty agile-empty-compact">등록된 스프린트가 없습니다.</div>`;
  }
  return state.agileSprints.map((sprint) => {
    const items = state.agileItems.filter((item) => item.sprint_id === sprint.id);
    const planned = items.reduce((sum, item) => sum + Number(item.story_points || 0), 0);
    const done = items.filter((item) => item.status === "Done").reduce((sum, item) => sum + Number(item.story_points || 0), 0);
    const pct = planned ? Math.round(done / planned * 100) : 0;
    return `
      <article class="agile-sprint-card">
        <div class="agile-sprint-card-head">
          <strong>${escapeHtml(sprint.name)}</strong>
          <select data-agile-sprint-field="status" data-agile-sprint-id="${escapeHtml(sprint.id)}" ${canMutateWork() ? "" : "disabled"}>
            ${AGILE_SPRINT_STATUSES.map((status) => `<option value="${status}" ${sprint.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </div>
        <p>${escapeHtml(sprint.goal || "Sprint Goal 미입력")}</p>
        <div class="workboard-progress">
          <div class="workboard-progress-track"><div class="workboard-progress-fill" style="width:${pct}%"></div></div>
          <span>${done}/${planned || sprint.capacity_points || 0} SP</span>
        </div>
        <div class="workboard-card-meta">
          <span>${escapeHtml(sprint.start_date || "-")} ~ ${escapeHtml(sprint.end_date || "-")}</span>
          <span>${items.length}개 항목</span>
        </div>
      </article>`;
  }).join("");
}

function renderStoryPointControl({ id = "", value = 0, attrs = "", placeholder = "SP" } = {}) {
  const policy = projectOperationPolicy();
  if (policy.story_point_mode === "fibonacci") {
    const current = Number(value || 0);
    const options = [0, ...storyPointOptions(policy)]
      .filter((point, index, list) => list.indexOf(point) === index)
      .map((point) => `<option value="${point}" ${Math.abs(current - Number(point)) < 0.001 ? "selected" : ""}>${point} SP</option>`)
      .join("");
    return `<select ${id ? `id="${escapeHtml(id)}"` : ""} class="agile-inline-select agile-points-input" ${attrs}>${options}</select>`;
  }
  const inputValue = value === 0 || value ? value : "";
  return `<input ${id ? `id="${escapeHtml(id)}"` : ""} class="agile-points-input" type="number" min="0" step="0.5" value="${escapeHtml(inputValue)}" placeholder="${escapeHtml(placeholder)}" ${attrs} />`;
}

function renderAgileBacklog() {
  const canMutate = canMutateWork();
  const policy = projectOperationPolicy();
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = defaultSprintEndDate(today, policy);
  const fixedSprint = Boolean(sprintPolicyDays(policy));
  const sprintStatusOptions = AGILE_SPRINT_STATUSES.map((status) => `<option value="${status}">${status}</option>`).join("");
  const typeOptions = AGILE_TYPES.map((type) => `<option value="${type}">${type}</option>`).join("");
  const priorityOptions = AGILE_PRIORITIES.map((priority) => `<option value="${priority}">${agilePriorityLabel(priority)}</option>`).join("");
  const backlogRows = state.agileItems.map((item) => {
    const statusOptions = AGILE_STATUSES.map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${agileStatusLabel(status)}</option>`).join("");
    return `
      <tr>
        <td>
          <div class="workboard-task-title">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.item_type)} · ${escapeHtml(agilePriorityLabel(item.priority))}${item.wbs_code ? ` · WBS ${escapeHtml(item.wbs_code)}` : ""}</span>
          </div>
        </td>
        <td>${escapeHtml(item.assignee || "미배정")}</td>
        <td>
          <select class="agile-inline-select" data-agile-item-field="status" data-agile-item-id="${escapeHtml(item.id)}" ${canMutate ? "" : "disabled"}>${statusOptions}</select>
        </td>
        <td>
          ${renderStoryPointControl({
            value: item.story_points || 0,
            attrs: `data-agile-item-field="story_points" data-agile-item-id="${escapeHtml(item.id)}" ${canMutate ? "" : "disabled"}`,
          })}
        </td>
        <td>
          <select class="agile-inline-select" data-agile-item-field="sprint_id" data-agile-item-id="${escapeHtml(item.id)}" ${canMutate ? "" : "disabled"}>
            ${agileSprintOptions(item.sprint_id || "", true)}
          </select>
        </td>
        <td>
          <select class="agile-inline-select" data-agile-item-field="wbs_code" data-agile-item-id="${escapeHtml(item.id)}" ${canMutate ? "" : "disabled"}>
            ${agileWbsOptions(item.wbs_code || "")}
          </select>
        </td>
      </tr>`;
  }).join("");

  return `
    ${renderAgileModeNotice()}
    <div class="agile-layout">
      <section class="agile-panel">
        <div class="agile-panel-head">
          <strong>스프린트</strong>
          <span>${state.agileSprints.length}개</span>
        </div>
        ${canMutate ? `
          <div class="agile-form-grid">
            <input id="agileSprintName" placeholder="Sprint 1" />
            <input id="agileSprintGoal" placeholder="Sprint Goal" />
            <select id="agileSprintStatus">${sprintStatusOptions}</select>
            <input id="agileSprintStart" type="date" value="${today}" data-sprint-policy-start />
            <input id="agileSprintEnd" type="date" value="${defaultEnd}" ${fixedSprint ? "readonly" : ""} title="${escapeHtml(sprintPolicyLabel(policy.sprint_length_policy))}" />
            <input id="agileSprintCapacity" type="number" min="0" step="1" placeholder="계획 SP" />
            <button class="sync-ctrl-btn" type="button" data-agile-add-sprint>스프린트 추가</button>
          </div>` : ""}
        <div class="agile-sprint-list">${renderAgileSprintCards()}</div>
      </section>

      <section class="agile-panel">
        <div class="agile-panel-head">
          <strong>백로그</strong>
          <span>${state.agileItems.length}개 항목</span>
          ${canMutate ? `<button class="wbs-pro-btn-sm" type="button" id="agileWbsSyncBtn" title="WBS 작업 목록을 백로그에 다시 동기화합니다">WBS 재동기화</button>` : ""}
        </div>
        ${canMutate ? `
          <div class="agile-form-grid agile-item-form">
            <input id="agileItemTitle" placeholder="Story / Task 제목" />
            <select id="agileItemType">${typeOptions}</select>
            ${renderStoryPointControl({ id: "agileItemPoints", value: 0, placeholder: "SP" })}
            <select id="agileItemPriority">${priorityOptions}</select>
            <input id="agileItemAssignee" placeholder="담당자" />
            <select id="agileItemSprint">${agileSprintOptions("", true)}</select>
            <select id="agileItemWbs">${agileWbsOptions("")}</select>
            <button class="sync-ctrl-btn" type="button" data-agile-add-item>항목 추가</button>
          </div>` : ""}
        <div class="workboard-table-wrap">
          <table class="workboard-table agile-backlog-table">
            <thead><tr><th>항목</th><th>담당자</th><th>상태</th><th>SP</th><th>Sprint</th><th>WBS 연결</th></tr></thead>
            <tbody>${backlogRows || `<tr><td colspan="6"><div class="workboard-empty">백로그 항목이 없습니다.</div></td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </div>`;
}

function renderAgileSprintBoard() {
  ensureAgileSprintSelection();
  const selectedSprintId = state.agileSelectedSprintId;
  const sprint = sprintById(selectedSprintId);
  const items = state.agileItems.filter((item) => (selectedSprintId ? item.sprint_id === selectedSprintId : !item.sprint_id));
  const selector = `
    <select id="agileBoardSprintSelect" class="agile-board-sprint-select" aria-label="스프린트 선택">
      <option value="" ${!selectedSprintId ? "selected" : ""}>백로그</option>
      ${state.agileSprints.map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === selectedSprintId ? "selected" : ""}>${escapeHtml(s.name)} (${escapeHtml(s.status)})</option>`).join("")}
    </select>`;
  const planned = items.reduce((sum, item) => sum + Number(item.story_points || 0), 0);
  const done = items.filter((item) => item.status === "Done").reduce((sum, item) => sum + Number(item.story_points || 0), 0);
  const columns = AGILE_STATUSES.map((status) => {
    const columnItems = items.filter((item) => item.status === status);
    const cards = columnItems.length ? columnItems.map((item) => `
      <button class="workboard-card agile-card" type="button" data-type="${escapeHtml(item.item_type || "Task")}" draggable="${canMutateWork() ? "true" : "false"}" data-agile-card="${escapeHtml(item.id)}">
        <div class="workboard-card-head">
          <span class="card-type-badge">${escapeHtml(itemTypeLabel(item.item_type || "Task"))}</span>
          ${item.wbs_code ? `<span class="agile-wbs-chip">WBS ${escapeHtml(item.wbs_code)}</span>` : ""}
        </div>
        <strong>${escapeHtml(item.title)}</strong>
        <div class="workboard-card-meta">
          <span>${Number(item.story_points || 0)} SP</span>
          <span>${escapeHtml(item.assignee || "미배정")}</span>
        </div>
      </button>`).join("") : `<div class="workboard-empty" style="padding:14px;font-size:0.78rem">항목 없음</div>`;
    return `
      <section class="workboard-board-column agile-board-column" data-agile-drop-status="${escapeHtml(status)}">
        <div class="workboard-board-head"><span>${escapeHtml(agileStatusLabel(status))}</span><small>${columnItems.length}</small></div>
        <div class="workboard-card-list">${cards}</div>
      </section>`;
  }).join("");
  return `
    ${renderAgileModeNotice()}
    <div class="workboard-summary-line">
      <span>${sprint ? escapeHtml(sprint.name) : "백로그"} · ${done}/${planned} SP 완료</span>
      <span>${selector}</span>
    </div>
    <div class="workboard-board agile-board">${columns}</div>`;
}

function renderAgileBurndownChart(burndown) {
  if (!burndown?.days?.length) {
    return `<div class="workboard-empty agile-empty-compact">활성 스프린트가 없거나 번다운을 계산할 Story Point가 없습니다.</div>`;
  }
  const width = 680;
  const height = 220;
  const pad = 28;
  const maxY = Math.max(1, ...burndown.days.map((d) => Number(d.ideal_remaining || 0)), ...burndown.days.map((d) => Number(d.actual_remaining || 0)));
  const x = (index) => pad + (index / Math.max(1, burndown.days.length - 1)) * (width - pad * 2);
  const y = (value) => height - pad - (Number(value || 0) / maxY) * (height - pad * 2);
  const idealPoints = burndown.days.map((day, index) => `${x(index)},${y(day.ideal_remaining)}`).join(" ");
  const actualPoints = burndown.days
    .map((day, index) => day.actual_remaining == null ? null : `${x(index)},${y(day.actual_remaining)}`)
    .filter(Boolean)
    .join(" ");
  return `
    <svg class="agile-burndown-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sprint burndown">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" />
      <polyline class="ideal" points="${idealPoints}" />
      ${actualPoints ? `<polyline class="actual" points="${actualPoints}" />` : ""}
      <text x="${pad}" y="18">${escapeHtml(burndown.name)} · 잔여 ${Number(burndown.remaining_points || 0)} SP</text>
      <text x="${width - 150}" y="${height - 8}">Ideal / Actual</text>
    </svg>`;
}

function renderAgileMetrics() {
  const metrics = state.agileMetrics || {};
  const totals = metrics.totals || {};
  const velocityRows = (metrics.velocity_history || []).map((row) => {
    const planned = Number(row.planned_points || 0);
    const done = Number(row.done_points || 0);
    const pct = planned ? Math.round(done / planned * 100) : 0;
    return `
      <div class="agile-velocity-row">
        <span>${escapeHtml(row.name)}</span>
        <div class="workboard-progress-track"><div class="workboard-progress-fill" style="width:${pct}%"></div></div>
        <strong>${done}/${planned} SP</strong>
      </div>`;
  }).join("");
  const wbsRows = (metrics.wbs_progress || []).map((row) => `
    <tr>
      <td><code>${escapeHtml(row.wbs_code)}</code></td>
      <td>${escapeHtml(row.wbs_name || "-")}</td>
      <td>${Number(row.done_points || 0)}/${Number(row.total_points || 0)} SP</td>
      <td>${Number(row.completion_rate || 0)}%</td>
    </tr>`).join("");
  return `
    ${renderAgileModeNotice()}
    <div class="agile-metric-grid">
      <div class="workboard-alert"><strong>${totals.total_items || 0}</strong><span>Agile 항목</span></div>
      <div class="workboard-alert"><strong>${Number(totals.done_points || 0)}/${Number(totals.total_points || 0)}</strong><span>완료/전체 SP</span></div>
      <div class="workboard-alert"><strong>${Number(totals.completion_rate || 0)}%</strong><span>SP 완료율</span></div>
      <div class="workboard-alert"><strong>${totals.hybrid_links || 0}</strong><span>WBS 연결</span></div>
    </div>
    <div class="agile-layout">
      <section class="agile-panel">
        <div class="agile-panel-head"><strong>Sprint Burndown</strong><span>잔여 SP</span></div>
        ${renderAgileBurndownChart(metrics.burndown)}
      </section>
      <section class="agile-panel">
        <div class="agile-panel-head"><strong>Velocity</strong><span>스프린트별 완료 SP</span></div>
        <div class="agile-velocity-list">${velocityRows || `<div class="workboard-empty agile-empty-compact">스프린트 이력이 없습니다.</div>`}</div>
      </section>
    </div>
    <section class="agile-panel agile-hybrid-panel">
      <div class="agile-panel-head"><strong>Hybrid WBS 연결 현황</strong><span>${(metrics.wbs_progress || []).length}개 WBS</span></div>
      <div class="workboard-table-wrap">
        <table class="workboard-table">
          <thead><tr><th>WBS 코드</th><th>WBS 항목</th><th>Story Point</th><th>완료율</th></tr></thead>
          <tbody>${wbsRows || `<tr><td colspan="4"><div class="workboard-empty">WBS에 연결된 Agile 항목이 없습니다.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
}

function selectedWorkboardRow() {
  const key = state.workboardSelectedCode;
  if (!key) return null;
  return allWorkboardRows().find((row) => workboardTaskKey(row) === key) || null;
}

function openWorkboardTask(key) {
  state.workboardSelectedCode = key;
  renderWorkboardDrawer();
}

function closeWorkboardDrawer() {
  state.workboardSelectedCode = null;
  renderWorkboardDrawer();
}

function renderTaskLog(items, emptyText) {
  if (!items || !items.length) {
    return `<div class="task-log-item"><span>${escapeHtml(emptyText)}</span></div>`;
  }
  return items.slice().reverse().map((item) => `
    <div class="task-log-item">
      <strong>${escapeHtml(item.author || item.actor || item.name || "시스템")}</strong>
      <span>${escapeHtml(item.ts || item.at || item.created_at || "")}</span>
      ${item.url
        ? `<p><a class="task-attachment-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name || item.url)}</a></p>`
        : `<p>${escapeHtml(item.text || item.action || item.summary || "")}</p>`}
    </div>`).join("");
}

function renderWorkboardDrawer() {
  const drawer = document.querySelector("#workboardDrawer");
  const body = document.querySelector("#workboardDrawerBody");
  if (!drawer || !body) return;
  const row = selectedWorkboardRow();
  if (!row) {
    drawer.hidden = true;
    return;
  }
  const meta = normalizeTaskMetadata(row.metadata);
  const canMutate = canEditWorkboardTask(row);
  const statusOpts = WBS_STATUSES.map((status) => `<option value="${status}" ${workboardTaskStatus(row) === status ? "selected" : ""}>${status}</option>`).join("");
  const priorityOpts = WBS_PRIORITIES.map((priority) => `<option value="${priority}" ${workboardTaskPriority(row) === priority ? "selected" : ""}>${priority}</option>`).join("");
  const comments = Array.isArray(meta.comments) ? meta.comments : [];
  const history = Array.isArray(meta.history) ? meta.history : [];
  const attachments = Array.isArray(meta.attachments) ? meta.attachments : Array.isArray(meta.deliverables) ? meta.deliverables : [];

  document.querySelector("#workTaskCode").textContent = row.code || "작업 항목";
  document.querySelector("#workTaskTitle").textContent = row.name || "작업 상세";
  document.querySelector("#workTaskSaveBtn").disabled = !canMutate;
  drawer.hidden = false;
  body.innerHTML = `
    <div class="workboard-form-grid">
      <label><span>작업명</span><input id="workTaskName" value="${escapeHtml(row.name || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>담당자</span><input id="workTaskOwner" value="${escapeHtml(row.owner || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>상태</span><select id="workTaskStatus" ${canMutate ? "" : "disabled"}>${statusOpts}</select></label>
      <label><span>우선순위</span><select id="workTaskPriority" ${canMutate ? "" : "disabled"}>${priorityOpts}</select></label>
      <label><span>시작일</span><input id="workTaskStart" type="date" value="${escapeHtml(row.start_date || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>종료일</span><input id="workTaskFinish" type="date" value="${escapeHtml(row.finish_date || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>검토자</span><input id="workTaskReviewer" value="${escapeHtml(meta.reviewer || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>승인자</span><input id="workTaskApprover" value="${escapeHtml(meta.approver || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>팀</span><input id="workTaskTeam" value="${escapeHtml(meta.team || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>예상 공수(h)</span><input id="workTaskEffort" type="number" min="0" step="0.5" value="${escapeHtml(meta.effort || "")}" ${canMutate ? "" : "disabled"} /></label>
    </div>
    <label class="workboard-form-wide">
      <span id="workTaskProgressLabel">진척률 ${workboardTaskProgress(row)}%</span>
      <input id="workTaskProgress" type="range" min="0" max="100" value="${workboardTaskProgress(row)}" ${canMutate ? "" : "disabled"} />
    </label>
    <label class="workboard-form-wide">
      <span>댓글</span>
      <div class="task-comments">${renderTaskLog(comments, "등록된 댓글이 없습니다.")}</div>
      ${canMutate ? `<textarea id="workTaskComment" rows="3" placeholder="이번 변경에 대한 댓글을 남기세요."></textarea>` : ""}
    </label>
    <label class="workboard-form-wide">
      <span>첨부/산출물</span>
      <div class="task-attachments">${renderTaskLog(attachments, "등록된 첨부 또는 산출물이 없습니다.")}</div>
    </label>
    ${canMutate ? `
      <div class="workboard-form-grid">
        <label><span>파일 업로드</span><input id="workTaskAttachmentFile" type="file" /></label>
        <label><span>첨부명</span><input id="workTaskAttachmentName" placeholder="예) 요구사항정의서 v1" /></label>
        <label><span>첨부 URL</span><input id="workTaskAttachmentUrl" placeholder="https:// 또는 공유 링크" /></label>
      </div>` : ""}
    <label class="workboard-form-wide">
      <span>변경 이력</span>
      <div class="task-history">${renderTaskLog(history, "아직 변경 이력이 없습니다.")}</div>
    </label>`;
}

function workboardPayloadRow(row, index) {
  const metadata = normalizeTaskMetadata(row.metadata);
  return {
    level: row.level ?? null,
    code: row.code || null,
    parent_code: row.parent_code || null,
    name: row.name || row.subject || `작업 ${index + 1}`,
    item_type: row.item_type || "작업",
    owner: row.owner || null,
    weight: row.weight ?? null,
    start_date: row.start_date || null,
    finish_date: row.finish_date || null,
    deliverable_type: row.deliverable_type || metadata.deliverable_type || null,
    inspection_required: Boolean(row.inspection_required ?? metadata.inspection_required ?? false),
    progress_formula: row.progress_formula || metadata.progress_formula || null,
    notes: row.notes || null,
    metadata,
  };
}

async function saveWorkboardRows(source = "workboard") {
  const projectId = state.workboardProjectId;
  if (!projectId) return null;
  const result = await request(`/api/projects/${encodeURIComponent(projectId)}/wbs-items`, {
    method: "POST",
    body: JSON.stringify({
      rows: state.workboardRows.map(workboardPayloadRow),
      source,
    }),
  });
  state.workboardRows = (result.rows || state.workboardRows).map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
  state.workboardLoadedProjectId = projectId;
  if (state.wbsPlanProjectId === projectId) {
    state.wbsPlanRows = state.workboardRows.map((row) => ({ ...row }));
    state.wbsPlanDirty = false;
  }
  state.workboardStatusMessage = `저장 완료${result.wbs_version ? ` v${result.wbs_version}` : ""}`;
  return result;
}

function taskChangeSummary(before, after) {
  const entries = [
    ["상태", before.status, after.status],
    ["진척률", `${before.progress}%`, `${after.progress}%`],
    ["담당자", before.owner || "-", after.owner || "-"],
    ["시작일", before.start_date || "-", after.start_date || "-"],
    ["종료일", before.finish_date || "-", after.finish_date || "-"],
  ];
  return entries
    .filter(([, oldValue, newValue]) => oldValue !== newValue)
    .map(([label, oldValue, newValue]) => `${label}: ${oldValue} → ${newValue}`)
    .join(", ");
}

function applyWorkboardItemUpdate(updated) {
  if (!updated) return;
  const normalized = { ...updated, metadata: normalizeTaskMetadata(updated.metadata) };
  const key = workboardTaskKey(normalized);
  const mergeRows = (rows, appendCurrentProject = false) => {
    let found = false;
    const next = (rows || []).map((row) => {
      if (workboardTaskKey(row) === key) {
        found = true;
        return { ...row, ...normalized };
      }
      return row;
    });
    if (appendCurrentProject && !found && normalized.project_id === state.workboardProjectId) next.push(normalized);
    return next;
  };
  state.workboardRows = mergeRows(state.workboardRows, true);
  state.myWorkItems = mergeRows(state.myWorkItems, false);
  if (state.wbsPlanProjectId === normalized.project_id) {
    state.wbsPlanRows = state.wbsPlanRows.map((row) => (
      row.code === normalized.code
        ? { ...row, ...normalized, metadata: normalizeTaskMetadata(normalized.metadata) }
        : row
    ));
  }
  state.workboardSelectedCode = key;
}

async function patchWorkboardTask(row, payload) {
  const projectId = workboardRowProjectId(row);
  const code = row?.code;
  if (!projectId || !code) throw new Error("작업 항목 식별 정보를 확인할 수 없습니다.");
  const updated = await request(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(code)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  applyWorkboardItemUpdate(updated);
  return updated;
}

async function uploadWorkboardAttachment(row, file) {
  if (!file) return null;
  const projectId = workboardRowProjectId(row);
  const code = row?.code;
  const formData = new FormData();
  formData.append("file", file);
  const result = await request(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(code)}/attachments`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (result?.item) applyWorkboardItemUpdate(result.item);
  return result;
}

async function quickUpdateWorkboardTask(key, payload) {
  const row = allWorkboardRows().find((item) => workboardTaskKey(item) === key);
  if (!row || !canEditWorkboardTask(row)) return;
  state.workboardStatusMessage = "저장 중";
  updateWorkboardStatus("저장 중", "attention");
  try {
    const updated = await patchWorkboardTask(row, payload);
    state.workboardStatusMessage = "저장 완료";
    renderWorkboardPanel();
    loadNotifications();
    return updated;
  } catch (error) {
    state.workboardStatusMessage = error.message;
    updateWorkboardStatus(error.message, "critical");
    renderWorkboardPanel();
    return null;
  }
}

async function updateProjectDeliveryMode(mode) {
  const projectId = state.workboardProjectId;
  if (!projectId || !canMutateWork()) return;
  state.workboardStatusMessage = "수행 방식 저장 중";
  updateWorkboardStatus("저장 중", "attention");
  try {
    const project = await request(`/api/projects/${encodeURIComponent(projectId)}/delivery-mode`, {
      method: "PATCH",
      body: JSON.stringify({ delivery_mode: mode }),
    });
    state.projects = state.projects.map((item) => item.id === project.id ? project : item);
    state.workboardStatusMessage = `${DELIVERY_MODE_LABELS[mode] || mode} 적용`;
    renderWorkboardPanel();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}

async function refreshAgileAfterChange() {
  await loadAgileProject(state.workboardProjectId, { render: false });
  renderWorkboardPanel();
}

async function createAgileSprint() {
  if (!state.workboardProjectId || !canMutateWork()) return;
  const name = document.querySelector("#agileSprintName")?.value.trim();
  if (!name) {
    state.workboardStatusMessage = "스프린트명을 입력하세요";
    renderWorkboardPanel();
    return;
  }
  const policy = projectOperationPolicy();
  const startDate = document.querySelector("#agileSprintStart")?.value || new Date().toISOString().slice(0, 10);
  const payload = {
    name,
    goal: document.querySelector("#agileSprintGoal")?.value.trim() || "",
    status: document.querySelector("#agileSprintStatus")?.value || "Planning",
    start_date: startDate,
    end_date: sprintPolicyDays(policy)
      ? defaultSprintEndDate(startDate, policy)
      : (document.querySelector("#agileSprintEnd")?.value || defaultSprintEndDate(startDate, policy)),
    capacity_points: Number(document.querySelector("#agileSprintCapacity")?.value || 0),
  };
  state.workboardStatusMessage = "스프린트 저장 중";
  updateWorkboardStatus("저장 중", "attention");
  try {
    await request(`/api/projects/${encodeURIComponent(state.workboardProjectId)}/agile/sprints`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.workboardStatusMessage = "스프린트 추가 완료";
    await refreshAgileAfterChange();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}

async function createAgileItem() {
  if (!state.workboardProjectId || !canMutateWork()) return;
  const title = document.querySelector("#agileItemTitle")?.value.trim();
  if (!title) {
    state.workboardStatusMessage = "백로그 항목 제목을 입력하세요";
    renderWorkboardPanel();
    return;
  }
  const payload = {
    title,
    item_type: document.querySelector("#agileItemType")?.value || "Story",
    story_points: Number(document.querySelector("#agileItemPoints")?.value || 0),
    priority: document.querySelector("#agileItemPriority")?.value || "Should",
    assignee: document.querySelector("#agileItemAssignee")?.value.trim() || null,
    sprint_id: document.querySelector("#agileItemSprint")?.value || null,
    wbs_code: document.querySelector("#agileItemWbs")?.value || null,
    status: document.querySelector("#agileItemSprint")?.value ? "Ready" : "Backlog",
  };
  state.workboardStatusMessage = "백로그 저장 중";
  updateWorkboardStatus("저장 중", "attention");
  try {
    await request(`/api/projects/${encodeURIComponent(state.workboardProjectId)}/agile/backlog`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.workboardStatusMessage = "백로그 항목 추가 완료";
    await refreshAgileAfterChange();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}

async function updateAgileSprintField(sprintId, field, value) {
  if (!sprintId || !field || !canMutateWork()) return;
  try {
    await request(`/api/agile/sprints/${encodeURIComponent(sprintId)}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: value }),
    });
    state.workboardStatusMessage = "스프린트 업데이트 완료";
    await refreshAgileAfterChange();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}

async function updateAgileItemField(itemId, field, value) {
  if (!itemId || !field) return;
  const payload = { [field]: field === "story_points" ? Number(value || 0) : (value || null) };
  if (field === "status") payload.status = value || "Backlog";
  try {
    await request(`/api/agile/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.workboardStatusMessage = "Agile 항목 업데이트 완료";
    await refreshAgileAfterChange();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}

async function saveWorkboardTaskUpdate() {
  const row = selectedWorkboardRow();
  if (!row || !canEditWorkboardTask(row)) return;
  const saveBtn = document.querySelector("#workTaskSaveBtn");
  if (saveBtn) saveBtn.disabled = true;
  const before = {
    status: workboardTaskStatus(row),
    progress: workboardTaskProgress(row),
    owner: row.owner || "",
    start_date: row.start_date || "",
    finish_date: row.finish_date || "",
  };
  const after = {
    status: document.querySelector("#workTaskStatus")?.value || before.status,
    progress: Number(document.querySelector("#workTaskProgress")?.value || before.progress),
    owner: document.querySelector("#workTaskOwner")?.value.trim() || "",
    start_date: document.querySelector("#workTaskStart")?.value || null,
    finish_date: document.querySelector("#workTaskFinish")?.value || null,
  };
  const effortRaw = document.querySelector("#workTaskEffort")?.value;
  const comment = document.querySelector("#workTaskComment")?.value.trim();
  const attachmentName = document.querySelector("#workTaskAttachmentName")?.value.trim();
  const attachmentUrl = document.querySelector("#workTaskAttachmentUrl")?.value.trim();
  const file = document.querySelector("#workTaskAttachmentFile")?.files?.[0] || null;
  const payload = {
    name: document.querySelector("#workTaskName")?.value.trim() || row.name,
    owner: after.owner || "",
    status: after.status,
    progress: Math.max(0, Math.min(100, Number.isFinite(after.progress) ? after.progress : 0)),
    priority: document.querySelector("#workTaskPriority")?.value || "보통",
    start_date: after.start_date,
    finish_date: after.finish_date,
    reviewer: document.querySelector("#workTaskReviewer")?.value.trim() || "",
    approver: document.querySelector("#workTaskApprover")?.value.trim() || "",
    team: document.querySelector("#workTaskTeam")?.value.trim() || "",
    comment: comment || null,
    attachment_name: attachmentName || null,
    attachment_url: attachmentUrl || null,
  };
  if (effortRaw !== "") payload.effort = Number(effortRaw || 0);
  const summary = taskChangeSummary(before, after);
  try {
    let updated = await patchWorkboardTask(row, payload);
    if (file) {
      const uploadResult = await uploadWorkboardAttachment(updated || row, file);
      updated = uploadResult?.item || updated;
    }
    state.myWorkItems = (await request("/api/me/work-items").catch(() => state.myWorkItems || []))
      .map((item) => ({ ...item, metadata: normalizeTaskMetadata(item.metadata) }));
    state.workboardStatusMessage = summary || comment || attachmentName || attachmentUrl || file ? "저장 완료" : "변경 없음";
    state.workboardSelectedCode = null;
    loadNotifications();
    renderWorkboardPanel();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    updateWorkboardStatus(error.message, "critical");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

/* 셀렉트 옵션 텍스트: 프로젝트명 + 버전 정보 */
function formatProjectSelectLabel(p) {
  const meta = p.metadata || {};
  const ver  = meta.wbs_version;
  const rows = meta.wbs_rows;
  const savedAt = meta.wbs_last_saved
    ? new Date(meta.wbs_last_saved).toLocaleString("ko-KR", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" })
    : null;

  let label = p.name;
  if (ver) label += `  [v${ver}`;
  if (rows != null) label += ver ? ` · ${rows}행` : `  [${rows}행`;
  if (savedAt) label += ver || rows != null ? ` · ${savedAt}` : `  [${savedAt}`;
  if (ver || rows != null || savedAt) label += "]";
  return label;
}

function renderAll() {
  renderAuthState();
  renderNotifBell();
  renderMetrics();
  renderTemplates();
  renderTemplateSelect();
  renderImportProjectSelect();
  renderProjects();
  renderProjectPlan();
  renderApprovals();
  renderImportPreview();
  renderImportDiff();
  renderApplyButton();
  renderImportHistory();
  renderTemplateVersions();
  renderProjectTemplateSelect();
  // Sync 패널은 설정 > OpenProject 탭이 활성일 때만 렌더링
  if (state.settingsTab === "openproject") {
    renderSyncProjectSelect();
    renderSyncPanel();
    renderSyncRuns();
    renderSyncedProjectsList();
  }
  renderOperationsPanel();
  renderUsersPanel();
  renderAuditPanel();
  renderSettingsPanel();
  renderProjectPolicyPanel();
  renderWbsPlan();
  renderWorkboardPanel();
  if (document.body.dataset.portalView === "op-view") {
    maybeLoadOpViewProject();
  } else {
    renderOpViewProjectSelect();
    renderOpViewPanels();
  }
  renderGuidePanel();
  renderRisksPanel();
  renderAnnouncementsPanel();
}

async function loadData({ tenantId = state.currentTenantId } = {}) {
  const runId = (state.loadDataRunId || 0) + 1;
  state.loadDataRunId = runId;
  const isCurrentRun = () => runId === state.loadDataRunId && tenantId === state.currentTenantId;
  showAppSkeletons();
  try {
    const [dashboard, templates, projects, approvals, pmPreflight, operationsHealth, importJobs, users, userGroups, auditEvents, settings, projectPolicy, risks, issues, myWorkItems, announcements] = await Promise.all([
      request("/api/dashboard"),
      request("/api/templates"),
      request("/api/projects"),
      request("/api/approvals"),
      request("/api/pm-engine/preflight"),
      canAccessOperations() ? request("/api/operations/health") : Promise.resolve(restrictedOperationsHealth),
      request("/api/imports?limit=8"),
      canManageUsers() ? request("/api/users") : Promise.resolve([]),
      canManageUsers() ? request("/api/user-groups") : Promise.resolve([]),
      canViewAudit() ? request("/api/audit-events?limit=30") : Promise.resolve([]),
      canViewSettings() ? request("/api/settings") : Promise.resolve(fallbackSettings),
      canViewSettings() ? request("/api/project-operation-policy") : Promise.resolve({ ...fallbackProjectOperationPolicy, tenant_id: state.currentTenantId || "default" }),
      request("/api/risks").catch(() => []),
      request("/api/issues").catch(() => []),
      request("/api/me/work-items").catch(() => []),
      request("/api/announcements").catch(() => []),
    ]);

    if (!isCurrentRun()) return;

    state.dashboard = dashboard;
    state.templates = templates;
    state.projects = projects;
    state.approvals = approvals;
    state.pmPreflight = pmPreflight;
    state.operationsHealth = operationsHealth;
    state.importJobs = importJobs;
    state.risks = risks;
    state.issues = issues;
    state.announcements = announcements || [];
    state.myWorkItems = (myWorkItems || []).map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
    loadNotifications();
    startNotifPolling();
    state.users = users;
    state.userGroups = userGroups;
    refreshUserDatalist();
    state.auditEvents = auditEvents;
    state.settings = settings;
    state.projectOperationPolicy = projectPolicy || { ...fallbackProjectOperationPolicy, tenant_id: state.currentTenantId || "default" };
    try {
      state.templateVersions = await request(`/api/templates/${encodeURIComponent(defaultTemplateKey())}/versions?limit=8`);
      if (!isCurrentRun()) return;
    } catch (error) {
      if (!isCurrentRun()) return;
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
      try {
        await loadProjectPlan(state.selectedProjectId, { render: false });
      } catch (error) {
        state.projectPlan = null;
        state.wbsPlanRows = [];
      }
      if (!isCurrentRun()) return;
    } else {
      state.projectPlan = null;
    }
    const currentSyncProjectId = document.querySelector("#syncProjectSelect")?.value;
    const syncProjectId = state.userSelectedSyncProject && projects.some((project) => project.id === currentSyncProjectId)
      ? currentSyncProjectId
      : projects[0]?.id || null;
    if (syncProjectId) {
      try {
        await loadSyncRuns(syncProjectId, { render: false });
      } catch (error) {
        state.syncRuns = [];
      }
      if (!isCurrentRun()) return;
    } else {
      state.syncRuns = [];
    }
  } catch (error) {
    if (!isCurrentRun()) return;
    const tenantAccessError = /tenant|테넌트|assigned/i.test(error.message || "");
    state.apiConnected = false;
    if (tenantAccessError) {
      state.projects = [];
      state.approvals = [];
      state.risks = [];
      state.issues = [];
      state.myWorkItems = [];
      state.projectPlan = null;
      state.selectedProjectId = null;
      state.dashboard = createDashboardState();
    } else {
      state.projects = state.projects.length ? state.projects : fallbackProjects;
      state.dashboard.metrics.projects = state.projects.length;
      state.dashboard.metrics.templates = state.templates.length;
      state.dashboard.metrics.pending_approvals = state.approvals.filter((approval) => approval.status === "Pending").length;
    }
    state.operationsHealth = {
      ...fallbackOperationsHealth,
      status: "critical",
      checks: [{ key: "operations", label: "운영 상태", status: "fail", message: error.message }],
    };
    state.syncRuns = [];
    state.importJobs = [];
    state.templateVersions = [];
    state.users = [];
    state.userGroups = [];
    state.auditEvents = [];
    state.myWorkItems = [];
    state.settings = fallbackSettings;
    state.projectOperationPolicy = { ...fallbackProjectOperationPolicy, tenant_id: state.currentTenantId || "default" };
  } finally {
    if (isCurrentRun()) hideAppSkeletons();
  }

  if (isCurrentRun()) renderAll();
}

function openProjectDialog() {
  const dialog = document.querySelector("#projectDialog");
  document.querySelector("#projectForm").reset();
  document.querySelector("#projectFormStatus").textContent = "";
  document.querySelector("#projectStartInput").value = new Date().toISOString().slice(0, 10);
  renderProjectTemplateSelect(false);
  const modeSelector = document.querySelector("#projectDeliveryModeInput");
  if (modeSelector) modeSelector.value = projectOperationPolicy().default_delivery_mode || "waterfall";
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
    start_date: document.querySelector("#projectStartInput").value || null,
    delivery_mode: document.querySelector("#projectDeliveryModeInput")?.value || "waterfall",
    end_date: document.querySelector("#projectEndInput")?.value || null,
    description: document.querySelector("#projectDescInput")?.value.trim() || null,
    client_name: document.querySelector("#projectClientInput")?.value.trim() || null,
    budget: document.querySelector("#projectBudgetInput")?.value.trim() || null,
    project_manager: document.querySelector("#projectManagerInput")?.value.trim() || null,
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
    group_id: document.querySelector("#userGroupInput").value,
    password: document.querySelector("#userPasswordInput").value,
    status: "Active",
  };

  submitButton.disabled = true;
  status.textContent = "";
  if (!payload.group_id) {
    status.textContent = "소속 그룹을 선택하세요.";
    submitButton.disabled = false;
    return;
  }

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

async function createUserGroup() {
  if (!canManageUsers()) return;
  const input = document.querySelector("#userGroupNameInput");
  const status = document.querySelector("#userFormStatus");
  const button = document.querySelector("#userGroupCreateButton");
  const name = input?.value.trim() || "";
  status.textContent = "";
  if (!name) {
    status.textContent = "추가할 소속 그룹명을 입력하세요.";
    return;
  }

  button.disabled = true;
  try {
    await request("/api/user-groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    input.value = "";
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function updatePortalUser(row) {
  if (!canManageUsers() || !row?.dataset.userId) return;

  const status = document.querySelector("#userFormStatus");
  const passwordInput = row.querySelector('[data-user-field="password"]');
  const payload = {
    role: row.querySelector('[data-user-field="role"]').value,
    status: row.querySelector('[data-user-field="status"]').value,
    group_id: row.querySelector('[data-user-field="group_id"]').value,
  };
  if (!payload.group_id) {
    status.textContent = "사용자 소속 그룹을 선택하세요.";
    return;
  }
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

  const project = state.projects.find((p) => p.id === projectId);
  const requester = state.currentUser?.display_name || state.currentUser?.email || "PMO";

  try {
    const approval = await request("/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        requester,
        reviewer: "PMO Lead",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        auto_approve_internal: false,   // 수동 승인: Pending 상태로 생성
        metadata: {
          source: "wbs-portal",
          approval_scope: "manual",
          project_name: project?.name,
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

  /* 반려 시 코멘트 필수 강제 */
  let comment = action === "approve" ? "PMO 포털에서 승인" : "";
  if (action === "reject") {
    comment = window.prompt("반려 사유를 입력하세요 (필수):", "");
    if (comment === null) return;                 // 취소
    if (!comment.trim()) {
      alert("반려 사유는 필수입니다. 입력 후 다시 시도하세요.");
      return;
    }
  }

  try {
    const approval = await request(`/api/approvals/${encodeURIComponent(approvalId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({
        reviewer: state.currentUser?.display_name || "PMO Lead",
        comment,
      }),
    });

    state.approvals = state.approvals.map((item) => (item.id === approval.id ? approval : item));

    // 승인 완료 후 자동 동기화 결과 알림
    if (action === "approve" && approval.auto_sync) {
      const sync = approval.auto_sync;
      if (sync.triggered && !sync.error) {
        const msg = `✅ 승인 완료 + 외부 도구 기준선 자동 반영 (${sync.created ?? 0}개 작업 항목 생성)`;
        showAutoSyncToast(msg, "success");
      } else if (sync.triggered && sync.error) {
        showAutoSyncToast(`✅ 승인 완료 (외부 기준선 자동 반영 실패: ${sync.error.slice(0,60)})`, "warn");
      } else if (!sync.triggered) {
        // OP 미연결 시 → 토스트 없음 (정상)
      }
    }

    await loadData();
  } catch (error) {
    renderImportResult({
      status: "Rejected", accepted_rows: 0, rejected_rows: 1,
      errors: [{ message: error.message }], warnings: [], rows: [],
    });
  }
}

/* 자동 동기화 결과 토스트 알림 */
function showAutoSyncToast(message, type = "success") {
  const existing = document.querySelector(".auto-sync-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `auto-sync-toast auto-sync-toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:200;
    padding:12px 18px; border-radius:8px; font-size:0.84rem; font-weight:600;
    max-width:380px; box-shadow:0 8px 24px rgba(0,0,0,0.15);
    animation:slideInToast 0.25s ease;
    background:${type === "success" ? "#dcfce7" : "#fef3c7"};
    color:${type === "success" ? "#15803d" : "#92400e"};
    border:1px solid ${type === "success" ? "#bbf7d0" : "#fde68a"};
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
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
  renderImportHistory();
}

/* ── 인증 포함 Excel 다운로드 헬퍼 ──────────────── */
async function authenticatedDownload(url, filename) {
  try {
    const resp = await fetch(url, {
      headers: authHeaders(),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(typeof err.detail === "string" ? err.detail : `다운로드 실패 (${resp.status})`);
    }
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    alert(`Excel 다운로드 실패: ${error.message}`);
  }
}

function downloadTemplateExcel() {
  const template = selectedTemplate();
  authenticatedDownload(
    `${API_BASE}/api/templates/${encodeURIComponent(template.key)}/excel`,
    `${template.name}.xlsx`,
  );
}

/* WBS 계획 패널용: 선택 프로젝트의 템플릿 Excel 다운로드 */
function downloadWbsPlanExcel() {
  const project = state.projects.find((p) => p.id === state.wbsPlanProjectId);
  if (!project) { alert("프로젝트를 먼저 선택하세요."); return; }
  const templateKey = project.template_key || "si-standard";
  const template    = state.templates.find((t) => t.key === templateKey);
  const filename    = `${project.name}_WBS양식.xlsx`;
  authenticatedDownload(
    `${API_BASE}/api/templates/${encodeURIComponent(templateKey)}/excel`,
    filename,
  );
}

/* WBS 계획 패널용: Excel 업로드 → 편집기 행 채우기 */
async function uploadWbsPlanExcel(event) {
  const [file] = event.target.files;
  if (!file) return;

  const project  = state.projects.find((p) => p.id === state.wbsPlanProjectId);
  const statusEl = document.querySelector("#wbsPlanStatus");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("template_key",  project?.template_key || "uploaded");
  formData.append("template_name", project?.name || "WBS 업로드");
  formData.append("project_type",  "Uploaded");
  formData.append("description",   `${project?.name || ""} Excel 업로드`);

  if (statusEl) { statusEl.textContent = "Excel 파싱 중…"; statusEl.className = "form-status"; }

  try {
    const preview = await request("/api/templates/import/preview", { method: "POST", body: formData });

    const errorCount = preview.errors?.length ?? 0;
    const rows       = (preview.rows || []).filter((r) => r.name);  // 빈 행 제외

    if (errorCount && !rows.length) {
      if (statusEl) statusEl.textContent = `오류 ${errorCount}건 — 업로드 불가`;
      return;
    }

    // 편집기 행을 업로드된 내용으로 교체 (바로 저장하지 않고 사용자가 검토 후 저장)
    state.wbsPlanRows  = rows.map((r) => ({
      code:        r.code        || null,
      parent_code: r.parent_code || null,
      name:        r.name,
      item_type:   r.item_type   || "작업",
      owner:       r.owner       || null,
      weight:      r.weight      ?? null,
      start_date:  r.start_date  || null,
      finish_date: r.finish_date || null,
    }));
    state.wbsPlanDirty = true;

    const warnMsg = errorCount ? ` (경고 ${errorCount}건 포함)` : "";
    if (statusEl) statusEl.textContent = `${rows.length}행 로드됨${warnMsg} — 내용 확인 후 저장하세요`;
    renderWbsPlanTable();
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message;
  } finally {
    event.target.value = "";
  }
}

function downloadImportErrorsExcel() {
  const jobId = document.querySelector("#importErrorWorkbookButton").dataset.importJobId;
  if (!jobId) return;
  authenticatedDownload(
    `${API_BASE}/api/imports/${encodeURIComponent(jobId)}/errors.xlsx`,
    "import_errors.xlsx",
  );
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

async function applyImportPreview() {
  if (!state.pendingImportJobId) return;

  // 일반 WBS 모드: 프로젝트에 반영
  if (state.importType === "custom") {
    const projectId = document.querySelector("#importProjectSelect")?.value;
    if (!projectId) { alert("프로젝트를 선택하세요."); return; }
    await applyImportToProject(projectId);
    return;
  }

  // 표준 WBS 모드: 템플릿에 반영
  const jobId = state.pendingImportJobId;
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "실행 중";
  document.querySelector("#importStatus").className = "status-pill attention";

  try {
    const result = await request(`/api/imports/${encodeURIComponent(jobId)}/apply`, { method: "POST" });
    renderImportResult(result);
    await loadData();
  } catch (error) {
    renderImportResult({ status: "Rejected", accepted_rows: 0, rejected_rows: 1, errors: [{ message: error.message }], warnings: [], rows: [] });
  }
}

async function applyImportToProject(projectId) {
  if (!state.pendingImportJobId) return;
  const jobId = state.pendingImportJobId;
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "반영 중";
  document.querySelector("#importStatus").className = "status-pill attention";

  try {
    const result = await request(
      `/api/projects/${encodeURIComponent(projectId)}/imports/${encodeURIComponent(jobId)}/apply`,
      { method: "POST" },
    );
    document.querySelector("#importStatus").textContent = `반영 완료 — ${result.summary?.rows ?? 0}행`;
    document.querySelector("#importStatus").className = "status-pill stable";
    // WBS 계획 캐시 갱신
    if (state.wbsPlanProjectId === projectId) {
      state.wbsPlanRows  = (result.rows || []).map((r) => ({ ...r }));
      state.wbsPlanDirty = false;
      renderWbsPlan();
    }
    await loadData();
  } catch (error) {
    document.querySelector("#importStatus").textContent = error.message;
    document.querySelector("#importStatus").className = "status-pill critical";
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

async function saveProjectOperationPolicy() {
  if (!canManageUsers()) return;
  const points = String(document.querySelector("#policyFibonacciPoints")?.value || "")
    .split(/[,\s]+/)
    .map((value) => Number(value.trim()))
    .filter((value, index, list) => Number.isFinite(value) && value > 0 && list.indexOf(value) === index)
    .sort((a, b) => a - b);
  if (!points.length) {
    state.projectPolicyStatus = "피보나치 허용값을 1개 이상 입력하세요";
    renderProjectPolicyPanel();
    return;
  }
  const dodItems = String(document.querySelector("#policyDodItems")?.value || "")
    .split("\n")
    .map((value) => value.trim())
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .slice(0, 20);
  const payload = {
    default_delivery_mode: document.querySelector("#policyDefaultDeliveryMode")?.value || "waterfall",
    story_point_mode: document.querySelector("#policyStoryPointMode")?.value || "numeric",
    fibonacci_points: points,
    sprint_length_policy: document.querySelector("#policySprintLength")?.value || "custom",
    dod_management: document.querySelector("#policyDodManagement")?.value || "team",
    default_dod_items: dodItems,
    openproject_sprint_version_sync: Boolean(document.querySelector("#policyOpenProjectVersionSync")?.checked),
  };
  const button = document.querySelector("#projectPolicySaveButton");
  if (button) button.disabled = true;
  state.projectPolicyStatus = "저장 중";
  renderProjectPolicyPanel();
  try {
    state.projectOperationPolicy = await request("/api/project-operation-policy", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    state.projectPolicyStatus = "저장되었습니다";
  } catch (error) {
    state.projectPolicyStatus = error.message;
  } finally {
    renderProjectPolicyPanel();
  }
}

async function saveExternalIntegrationPreference(enabled) {
  if (!canManageUsers()) return;
  const setting = (state.settings?.settings || []).find((item) => item.key === "pm_engine");
  if (!setting) return;
  const value = {
    ...(setting.value || {}),
    portal_enabled: Boolean(enabled),
  };
  state.settingsStatus = "";
  try {
    const result = await request("/api/settings/pm_engine", {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    state.settings = await request("/api/settings");
    if (result.pm_engine) {
      state.pmPreflight = {
        ...state.pmPreflight,
        engine: result.pm_engine,
        ready_for_actual_sync: Boolean(enabled) && state.pmPreflight.ready_for_actual_sync,
      };
    }
    state.settingsStatus = enabled ? "외부 연동을 사용합니다" : "외부 연동을 사용하지 않습니다";
  } catch (error) {
    state.settingsStatus = error.message;
  } finally {
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

  document.querySelector("#syncEngineStatus").textContent = "모의 반영";
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

  document.querySelector("#syncEngineStatus").textContent = "기준선 반영 중";
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

/* ── 외부 도구 → AX WBS 역방향 Pull ────────────── */
async function pullOpenProjectStatus() {
  const projectId = selectedSyncProjectId();
  if (!projectId) return;

  const pullBtn  = document.querySelector("#syncPullButton");
  const statusEl = document.querySelector("#syncPullStatus");

  if (pullBtn) pullBtn.disabled = true;
  if (statusEl) statusEl.textContent = "외부 도구에서 상태 가져오는 중…";

  try {
    const result = await request(
      `/api/projects/${encodeURIComponent(projectId)}/sync-pull`,
      { method: "POST" },
    );

    if (statusEl) {
      statusEl.textContent = `완료 — ${result.updated}개 항목 업데이트됨 · ${result.pulled_at ? formatTimestamp(result.pulled_at) : ""}`;
    }

    // WBS 관리 메뉴에 해당 프로젝트가 로드된 경우 재로드
    if (state.wbsPlanProjectId === projectId) {
      const rows = await request(`/api/projects/${encodeURIComponent(projectId)}/wbs-items`);
      state.wbsPlanRows = rows.map((r) => ({ ...r }));
      renderWbsPlanTable();
    }

    await loadData();
  } catch (error) {
    if (statusEl) statusEl.textContent = `오류: ${error.message}`;
    if (pullBtn) pullBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════
   WBS 현황 뷰 (작업 항목 + 간트 차트)
══════════════════════════════════════════════════════ */

function opViewProjects() {
  return (state.projects || []).filter((project) => project && project.id);
}

function currentOpViewProject() {
  return state.projects.find((project) => project.id === state.opViewProjectId) || null;
}

function ensureOpViewProjectSelection() {
  const projects = opViewProjects();
  if (!projects.length) {
    state.opViewProjectId = null;
    state.opViewRows = [];
    return null;
  }
  const exists = projects.some((project) => project.id === state.opViewProjectId);
  if (!state.opViewProjectId || !exists) {
    state.opViewProjectId = projects[0].id;
    state.opViewRows = [];
  }
  return state.opViewProjectId;
}

function normalizeWbsStatus(value) {
  const raw = String(value || "").trim();
  const aliases = {
    "미시작": "대기",
    "진행 중": "진행중",
    "진행": "진행중",
    "done": "완료",
    "Done": "완료",
    "closed": "완료",
    "Closed": "완료",
  };
  const status = aliases[raw] || raw || "대기";
  return WBS_STATUSES.includes(status) ? status : "대기";
}

function opRowMeta(row) {
  return normalizeTaskMetadata(row?.metadata);
}

function opRowStatus(row) {
  const meta = opRowMeta(row);
  return normalizeWbsStatus(meta.status || row?.status || row?.op_status);
}

function opRowProgress(row) {
  const meta = opRowMeta(row);
  const value = meta.progress ?? row?.progress ?? row?.op_progress;
  const number = Number(value);
  if (Number.isFinite(number)) return Math.max(0, Math.min(100, Math.round(number)));
  return opRowStatus(row) === "완료" ? 100 : 0;
}

function opRowOwner(row) {
  const meta = opRowMeta(row);
  return row?.owner || row?.assignee || meta.owner || meta.assignee || "";
}

function opRowType(row) {
  return row?.item_type || row?.op_type || "작업";
}

function opRowName(row) {
  return row?.name || row?.subject || "";
}

function opRowKey(row) {
  return String(row?.code || row?.id || "");
}

function todayUtcDate() {
  const today = new Date();
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
}

function isOpRowDelayed(row) {
  const status = opRowStatus(row);
  if (status === "완료") return false;
  if (status === "지연") return true;
  const finish = parseIsoDate(row?.finish_date);
  if (!finish) return false;
  return finish < todayUtcDate();
}

function isOpRowInProgressWindow(row) {
  const status = opRowStatus(row);
  if (["완료", "지연", "보류"].includes(status)) return false;
  if (isOpRowDelayed(row)) return false;
  const start = parseIsoDate(row?.start_date);
  const finish = parseIsoDate(row?.finish_date);
  const today = todayUtcDate();
  if (start) return start <= today && (!finish || finish >= today);
  if (finish) return status === "진행중";
  return status === "진행중";
}

function filteredOpViewRows(options = {}) {
  const q = state.opViewSearch.trim().toLowerCase();
  const tf = state.opViewTypeFilter;
  const sf = state.opViewStatusFilter || "";
  const delayedOnly = options.delayedOnly === true;
  return (state.opViewRows || []).filter((row) => {
    const haystack = [opRowKey(row), opRowName(row), opRowOwner(row)].filter(Boolean).join(" ").toLowerCase();
    return (!q || haystack.includes(q))
      && (!tf || opRowType(row) === tf)
      && (!sf || opRowStatus(row) === sf)
      && (!delayedOnly || isOpRowDelayed(row));
  });
}

function renderOpViewPanels() {
  renderOpViewSummary();
  renderOpWorkPackages();
  renderOpGantt();
  renderOpAssigneeSummary();
  renderOpDelayedRows();
}

function maybeLoadOpViewProject() {
  const projectId = ensureOpViewProjectSelection();
  renderOpViewProjectSelect();
  if (!projectId) {
    renderOpViewPanels();
    return;
  }
  if (!state.opViewRows.length) loadOpViewProject(projectId);
}

function renderOpViewProjectSelect() {
  const sel = document.querySelector("#opViewProjectSelect");
  if (!sel) return;
  const projects = opViewProjects();
  const exists = projects.some((project) => project.id === state.opViewProjectId);
  if (!exists) {
    state.opViewProjectId = null;
    state.opViewRows = [];
  }

  sel.innerHTML = projects.length
    ? [
        `<option value="">프로젝트 선택…</option>`,
        ...projects.map((project) => {
          const mode = DELIVERY_MODE_LABELS[projectDeliveryMode(project)] || "Waterfall";
          const linked = project.openproject_project_id ? " · 외부 연동됨" : "";
          return `<option value="${escapeHtml(project.id)}" ${project.id === state.opViewProjectId ? "selected" : ""}>
            ${escapeHtml(project.name)} [${escapeHtml(mode)} · ${escapeHtml(statusLabel(project.status || "Draft"))}${escapeHtml(linked)}]
          </option>`;
        }),
      ].join("")
    : `<option value="">프로젝트 없음</option>`;
  sel.disabled = !projects.length;

  const refreshBtn = document.querySelector("#opViewRefreshBtn");
  if (refreshBtn) refreshBtn.disabled = !state.opViewProjectId;

  const sourceEl = document.querySelector("#opViewSource");
  if (sourceEl) {
    const project = currentOpViewProject();
    sourceEl.hidden = false;
    sourceEl.textContent = project?.openproject_project_id ? "내부 WBS · 외부 연동됨" : "내부 WBS";
    sourceEl.className = `status-pill ${project?.openproject_project_id ? "stable" : "attention"}`;
  }
}

async function loadOpViewProject(projectId) {
  if (!projectId) {
    state.opViewProjectId = null;
    state.opViewRows = [];
    renderOpViewPanels();
    return;
  }
  state.opViewProjectId = projectId;
  state.opViewRows = [];

  const sourceEl = document.querySelector("#opViewSource");
  if (sourceEl) { sourceEl.hidden = false; sourceEl.textContent = "로딩 중…"; sourceEl.className = "status-pill attention"; }

  try {
    const rows = await request(`/api/projects/${encodeURIComponent(projectId)}/wbs-items`);
    state.opViewRows = (rows || []).map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
    if (sourceEl) {
      const project = currentOpViewProject();
      sourceEl.textContent = project?.openproject_project_id ? "내부 WBS · 외부 연동됨" : "내부 WBS";
      sourceEl.className   = `status-pill ${project?.openproject_project_id ? "stable" : "attention"}`;
    }
  } catch (e) {
    try {
      const plan = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-plan`);
      state.opViewRows = (plan.rows || []).map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
      if (sourceEl) { sourceEl.textContent = "내부 WBS · 기준선 계획"; sourceEl.className = "status-pill attention"; }
    } catch {
      state.opViewRows = [];
      if (sourceEl) { sourceEl.textContent = "오류"; sourceEl.className = "status-pill critical"; }
    }
  }

  const refreshBtn = document.querySelector("#opViewRefreshBtn");
  if (refreshBtn) refreshBtn.disabled = false;

  renderOpViewPanels();
}

function switchOpViewTab(tabId) {
  state.opViewTab = tabId;
  const panel = document.querySelector("#op-view");
  if (panel) panel.dataset.opTab = tabId;
  document.querySelectorAll(".op-view-tab").forEach((btn) => {
    const active = btn.dataset.opTab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  const panels = {
    wp: document.querySelector("#opTabWp"),
    gantt: document.querySelector("#opTabGantt"),
    assignee: document.querySelector("#opTabAssignee"),
    delayed: document.querySelector("#opTabDelayed"),
  };
  Object.entries(panels).forEach(([id, element]) => {
    if (element) element.hidden = tabId !== id;
  });
  renderOpViewPanels();
}

function parseIsoDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return "";
  return dateValue.toISOString().slice(0, 10);
}

function addDaysIso(value, days) {
  const dateValue = parseIsoDate(value);
  if (!dateValue) return "";
  dateValue.setUTCDate(dateValue.getUTCDate() + days);
  return formatIsoDate(dateValue);
}

function diffDaysIso(fromValue, toValue) {
  const from = parseIsoDate(fromValue);
  const to = parseIsoDate(toValue);
  if (!from || !to) return 0;
  return Math.round((to - from) / 86400000);
}

function minIsoDate(a, b) {
  return diffDaysIso(a, b) < 0 ? a : b;
}

function maxIsoDate(a, b) {
  return diffDaysIso(a, b) > 0 ? a : b;
}

function setOpGanttEditStatus(message, status = "idle") {
  state.opGanttEditMessage = message || "";
  state.opGanttEditStatus = status;
  const el = document.querySelector("#opGanttEditStatus");
  if (!el) return;
  el.textContent = state.opGanttEditMessage || (canMutateWork() ? "드래그 편집 가능" : "조회 전용");
  el.className = `op-gantt-edit-status ${status === "saving" ? "is-saving" : status === "error" ? "is-error" : ""}`.trim();
}

function renderOpViewSummary() {
  const wrap = document.querySelector("#opViewSummary");
  if (!wrap) return;
  const project = currentOpViewProject();
  const rows = state.opViewRows || [];
  if (!project) {
    wrap.innerHTML = `
      <div class="workboard-alert"><strong>${opViewProjects().length}</strong><span>현재 테넌트 프로젝트</span></div>
      <div class="workboard-alert"><strong>-</strong><span>프로젝트 선택 대기</span></div>`;
    return;
  }

  const done = rows.filter((row) => opRowStatus(row) === "완료").length;
  const active = rows.filter(isOpRowInProgressWindow).length;
  const delayed = rows.filter(isOpRowDelayed).length;
  const avgProgress = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + opRowProgress(row), 0) / rows.length)
    : 0;
  const mode = DELIVERY_MODE_LABELS[projectDeliveryMode(project)] || "Waterfall";
  const linked = project.openproject_project_id ? "외부 연동됨" : "내부 WBS";

  wrap.innerHTML = `
    <div class="workboard-alert"><strong>${rows.length}</strong><span>전체 WBS 항목</span></div>
    <div class="workboard-alert"><strong>${active}</strong><span>진행중</span></div>
    <div class="workboard-alert"><strong>${done}</strong><span>완료</span></div>
    <div class="workboard-alert ${delayed ? "overdue" : ""}"><strong>${delayed}</strong><span>지연/기한 초과</span></div>
    <div class="workboard-alert"><strong>${avgProgress}%</strong><span>평균 진행률</span></div>
    <div class="workboard-alert"><strong>${escapeHtml(mode)}</strong><span>${escapeHtml(linked)}</span></div>`;
}

function renderOpWorkPackages() {
  const tbody = document.querySelector("#opWpList");
  const count = document.querySelector("#opWpCount");
  if (!tbody) return;

  const rows = state.opViewRows || [];

  // 유형 필터 옵션 갱신
  const typeFilter = document.querySelector("#opWpTypeFilter");
  if (typeFilter) {
    const types  = [...new Set(rows.map(opRowType).filter(Boolean))];
    const curVal = typeFilter.value;
    typeFilter.innerHTML = [`<option value="">전체 유형</option>`,
      ...types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(itemTypeLabel(t))}</option>`)].join("");
    typeFilter.value = curVal;
  }

  const filtered = filteredOpViewRows();

  if (count) count.textContent = `${filtered.length}개`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr class="wbs-empty-row"><td colspan="8"><strong>${
      state.opViewProjectId ? "항목 없음" : "프로젝트를 선택하세요"
    }</strong></td></tr>`;
    return;
  }

  // 깊이 계산 (계층 구조 지원)
  const codeMap = new Map(rows.map((r) => [opRowKey(r), r]));
  const getDepth = (r) => {
    let d = 0, cur = r;
    const seen = new Set([opRowKey(r)]);
    while (cur?.parent_code && !seen.has(cur.parent_code)) {
      seen.add(cur.parent_code);
      cur = codeMap.get(cur.parent_code);
      d++;
    }
    return Math.min(d, 6);
  };

  // DFS로 계층 순서 렌더링
  const visited  = new Set();
  const rendered = [];
  const childMap = {};
  rows.forEach((r) => {
    if (r.parent_code) {
      const pk = r.parent_code;
      if (!childMap[pk]) childMap[pk] = [];
      childMap[pk].push(opRowKey(r));
    }
  });
  const filteredKeys = new Set(filtered.map(opRowKey));

  function hasFilteredDescendant(key) {
    return (childMap[key] || []).some((childKey) => filteredKeys.has(childKey) || hasFilteredDescendant(childKey));
  }

  function walkOpRow(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const r = codeMap.get(key);
    if (!r) return;
    const includeRow = filteredKeys.has(key);
    const includeDescendant = hasFilteredDescendant(key);
    if (!includeRow && !includeDescendant) return;

    const type     = opRowType(r);
    const depth    = getDepth(r);
    const children = childMap[key] || [];
    const hasChildren = children.length > 0;

    const status   = opRowStatus(r);
    const sc       = STATUS_STYLE[status] || STATUS_STYLE["대기"];
    const isDone   = status === "완료";

    const pct      = opRowProgress(r);
    const pctCls   = isDone ? "done" : "";

    const owner    = opRowOwner(r);
    const code     = opRowKey(r);
    const name     = opRowName(r);

    if (includeRow) {
      rendered.push(`
        <tr class="wbs-pro-tr${isDone ? " row-done" : ""}"
            data-code="${escapeHtml(code)}" data-type="${escapeHtml(type)}" data-status="${escapeHtml(status)}">
          <td class="td-freeze td-code" style="--depth:0">
            <code class="wbs-code-cell">${escapeHtml(code)}</code>
          </td>
          <td class="td-freeze td-name" style="--depth:${depth}">
            <div class="wbs-name-cell">
              ${hasChildren
                ? `<button class="wbs-toggle-btn" type="button" data-op-toggle="${escapeHtml(code)}"
                     aria-label="접기/펼치기">${isWbsExpanded(code) ? "▾" : "▸"}</button>`
                : `<span class="wbs-no-toggle"></span>`}
              <span class="wbs-type-dot" data-type="${escapeHtml(type)}"></span>
              <span class="wbs-name-text">${escapeHtml(name)}</span>
            </div>
          </td>
          <td class="td-owner">
            ${owner
              ? `<div class="wbs-owner-cell"><span class="owner-avatar">${escapeHtml((owner[0]||"?").toUpperCase())}</span><span style="font-size:0.8rem">${escapeHtml(owner)}</span></div>`
              : `<span class="owner-empty">미배정</span>`}
          </td>
          <td class="td-status">
            <span class="wbs-status-btn" style="background:${sc.bg};color:${sc.color}">${escapeHtml(status)}</span>
          </td>
          <td class="td-progress">
            <div class="wbs-progress-cell">
              <div class="wbs-pro-progress-bar">
                <div class="wbs-pro-progress-fill ${pctCls}" style="width:${pct}%"></div>
              </div>
              <span class="wbs-progress-pct">${pct}%</span>
            </div>
          </td>
          <td style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(r.start_date || "-")}</td>
          <td style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(r.finish_date || "-")}</td>
          <td class="td-weight">
            ${r.weight != null
              ? `<span class="wbs-weight-pill">${escapeHtml(String(r.weight))}%</span>`
              : `<span style="color:var(--text-muted);font-size:0.76rem">-</span>`}
          </td>
        </tr>`);
    }

    // 자식 행 재귀 (expanded일 때만)
    if (hasChildren && (isWbsExpanded(code) || includeDescendant)) {
      children.forEach((c) => walkOpRow(c));
    }
  }

  // 루트 노드 먼저
  rows.filter((r) => !r.parent_code).forEach((r) => {
    const key = opRowKey(r);
    if (key) walkOpRow(key);
  });
  // 필터된 항목 중 아직 미방문
  filtered.forEach((r) => {
    const key = opRowKey(r);
    if (!visited.has(key)) rendered.push(`
      <tr class="wbs-pro-tr" data-type="${escapeHtml(opRowType(r))}">
        <td class="td-freeze td-code"><code class="wbs-code-cell">${escapeHtml(key)}</code></td>
        <td class="td-freeze td-name"><div class="wbs-name-cell">
          <span class="wbs-no-toggle"></span>
          <span class="wbs-type-dot" data-type="${escapeHtml(opRowType(r))}"></span>
          <span class="wbs-name-text">${escapeHtml(opRowName(r))}</span>
        </div></td>
        <td colspan="6"></td>
      </tr>`);
  });

  tbody.innerHTML = rendered.join("");
}

function renderOpAssigneeSummary() {
  const wrap = document.querySelector("#opAssigneeWrap");
  if (!wrap) return;
  const rows = filteredOpViewRows();
  if (!state.opViewProjectId) {
    wrap.innerHTML = `<div class="workboard-empty">프로젝트를 선택하면 담당자별 현황이 표시됩니다.</div>`;
    return;
  }
  if (!rows.length) {
    wrap.innerHTML = `<div class="workboard-empty">담당자별로 집계할 WBS 항목이 없습니다.</div>`;
    return;
  }

  const groups = new Map();
  rows.forEach((row) => {
    const owner = opRowOwner(row) || "미배정";
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(row);
  });

  const body = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([owner, items]) => {
      const done = items.filter((row) => opRowStatus(row) === "완료").length;
      const delayed = items.filter(isOpRowDelayed).length;
      const avg = Math.round(items.reduce((sum, row) => sum + opRowProgress(row), 0) / Math.max(1, items.length));
      return `
        <tr>
          <td><div class="wbs-owner-cell"><span class="owner-avatar">${escapeHtml((owner[0] || "?").toUpperCase())}</span><span>${escapeHtml(owner)}</span></div></td>
          <td>${items.length}</td>
          <td>${done}</td>
          <td>${delayed}</td>
          <td>
            <div class="wbs-progress-cell">
              <div class="wbs-pro-progress-bar"><div class="wbs-pro-progress-fill ${avg >= 100 ? "done" : delayed ? "late" : ""}" style="width:${avg}%"></div></div>
              <span class="wbs-progress-pct">${avg}%</span>
            </div>
          </td>
        </tr>`;
    }).join("");

  wrap.innerHTML = `
    <table class="workboard-table">
      <thead><tr><th>담당자</th><th>전체</th><th>완료</th><th>지연</th><th>평균 진행률</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderOpDelayedRows() {
  const wrap = document.querySelector("#opDelayedWrap");
  if (!wrap) return;
  const rows = filteredOpViewRows({ delayedOnly: true });
  if (!state.opViewProjectId) {
    wrap.innerHTML = `<div class="workboard-empty">프로젝트를 선택하면 지연 항목이 표시됩니다.</div>`;
    return;
  }
  if (!rows.length) {
    wrap.innerHTML = `<div class="workboard-empty">현재 필터 기준의 지연 항목이 없습니다.</div>`;
    return;
  }

  const body = rows.map((row) => {
    const status = opRowStatus(row);
    const sc = STATUS_STYLE[status] || STATUS_STYLE["대기"];
    return `
      <tr>
        <td><code class="wbs-code-cell">${escapeHtml(opRowKey(row))}</code></td>
        <td><strong>${escapeHtml(opRowName(row))}</strong><br><span style="color:var(--text-muted);font-size:0.76rem">${escapeHtml(itemTypeLabel(opRowType(row)))}</span></td>
        <td>${escapeHtml(opRowOwner(row) || "미배정")}</td>
        <td><span class="wbs-status-btn" style="background:${sc.bg};color:${sc.color}">${escapeHtml(status)}</span></td>
        <td>${opRowProgress(row)}%</td>
        <td>${escapeHtml(row.finish_date || "-")}</td>
      </tr>`;
  }).join("");

  wrap.innerHTML = `
    <table class="workboard-table">
      <thead><tr><th>WBS 코드</th><th>작업명</th><th>담당자</th><th>상태</th><th>진행률</th><th>종료일</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/* ── 간트 차트 렌더링 ─────────────────────────── */
function renderOpGantt() {
  const wrap = document.querySelector("#opGanttWrap");
  if (!wrap) return;

  const rows = filteredOpViewRows();
  if (!rows.length) {
    wrap.innerHTML = `<p class="sync-pull-status" style="padding:24px;text-align:center">${state.opViewProjectId ? "표시할 WBS 항목이 없습니다." : "프로젝트를 선택하면 간트 차트가 표시됩니다."}</p>`;
    return;
  }

  // 전체 기간 계산
  const allDates = rows.flatMap((r) => [r.start_date, r.finish_date].filter(Boolean)).map(parseIsoDate).filter(Boolean);
  const project = currentOpViewProject();
  const projectStart = parseIsoDate(project?.start_date);
  const projectFinish = parseIsoDate(project?.end_date || project?.finish_date);
  if (!allDates.length && projectStart) allDates.push(projectStart);
  if (!allDates.length && projectFinish) allDates.push(projectFinish);
  if (projectStart && projectFinish) allDates.push(projectStart, projectFinish);
  if (!allDates.length) {
    const today = new Date();
    allDates.push(
      new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1)),
      new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 0)),
    );
  }
  const minDate  = new Date(Math.min(...allDates));
  const maxDate  = new Date(Math.max(...allDates));
  minDate.setUTCDate(1);
  maxDate.setUTCMonth(maxDate.getUTCMonth() + 1, 0);
  const scaleStartIso = formatIsoDate(minDate);
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000));
  const canEdit = false;

  // 월 헤더 생성
  const months = [];
  let cur = new Date(minDate);
  while (cur <= maxDate) {
    const nextMonth = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    const end  = nextMonth > maxDate ? maxDate : new Date(nextMonth - 1);
    const days = Math.ceil((end - cur) / 86400000) + 1;
    months.push({ label: `${cur.getUTCMonth() + 1}월`, days, pct: (days / totalDays * 100).toFixed(2) });
    cur = nextMonth;
  }

  const monthHeaderHtml = months.map((m) =>
    `<div class="op-gantt-month" style="flex:${m.pct}">${m.label}</div>`
  ).join("");

  const today = new Date();
  const todayPct = Math.max(0, Math.min(100, ((today - minDate) / 86400000 / totalDays) * 100));
  const todayHtml = `<div class="op-gantt-today" style="left:${todayPct.toFixed(2)}%"></div>`;
  const codeMap2 = new Map(state.opViewRows.map((x) => [opRowKey(x), x]));

  // 행 렌더링
  const rowsHtml = rows.map((r) => {
    const type    = opRowType(r);
    const isMile  = type === "마일스톤";
    const wpId    = opRowKey(r);
    const code    = opRowKey(r);
    let depth = 0, c = r; const seen2 = new Set([r.code]);
    while (c?.parent_code && !seen2.has(c.parent_code)) { seen2.add(c.parent_code); c = codeMap2.get(c.parent_code); depth++; }
    depth = Math.min(depth, 5);

    const labelHtml = `
      <div class="op-gantt-label" style="--depth:${depth}">
        <span class="op-gantt-label-code">${escapeHtml(r.code || "")}</span>
        ${escapeHtml(opRowName(r))}
      </div>`;

    let barHtml = "";
    if (r.start_date || r.finish_date) {
      const startIso = r.start_date || r.finish_date;
      const finishIso = r.finish_date || r.start_date;
      const sDate = parseIsoDate(startIso);
      const eDate = parseIsoDate(finishIso) || sDate;
      const left  = Math.max(0, ((sDate - minDate) / 86400000 / totalDays * 100));
      const width = Math.max(0.3, ((eDate - sDate) / 86400000 + 1) / totalDays * 100);
      const progress = opRowProgress(r);
      const editAttrs = canEdit ? `
        data-gantt-wp-id="${escapeHtml(wpId)}"
        data-gantt-code="${escapeHtml(code)}"
        data-gantt-start="${escapeHtml(startIso)}"
        data-gantt-finish="${escapeHtml(finishIso)}"
        data-gantt-scale-start="${escapeHtml(scaleStartIso)}"
        data-gantt-total-days="${totalDays}"` : "";

      if (isMile) {
        barHtml = `<div class="op-gantt-diamond" style="left:${left.toFixed(2)}%" title="${escapeHtml(opRowName(r))}"></div>`;
      } else {
        const progressBar = progress != null ? `<div class="op-gantt-bar-progress" style="width:${progress}%"></div>` : "";
        barHtml = `
          <div class="op-gantt-bar ${canEdit ? "op-gantt-editable" : ""}" data-type="${escapeHtml(type)}"
            ${editAttrs}
            style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"
            data-status="${escapeHtml(opRowStatus(r))}"
            title="${escapeHtml(opRowName(r))} (${r.start_date || "?"}~${r.finish_date || "?"})">
            ${canEdit ? `
              <span class="op-gantt-handle start" data-gantt-handle="start" title="시작일 조정"></span>
              <span class="op-gantt-handle end" data-gantt-handle="end" title="종료일 조정"></span>
              <span class="op-gantt-date-badge">${escapeHtml(startIso)} ~ ${escapeHtml(finishIso)}</span>
            ` : ""}
            ${progressBar}
          </div>`;
      }
    } else {
      barHtml = `<span class="op-gantt-missing-date">일정 미입력</span>`;
    }

    return `
      <div class="op-gantt-row" data-type="${escapeHtml(type)}">
        ${labelHtml}
        <div class="op-gantt-track">${barHtml}${todayHtml}</div>
      </div>`;
  }).join("");

  wrap.innerHTML = `
    <div class="op-gantt-meta">
      <span>내부 WBS 일정 조회</span>
      <span id="opGanttEditStatus" class="op-gantt-edit-status"></span>
    </div>
    <div class="op-gantt">
      <div class="op-gantt-header">
        <div class="op-gantt-header-label">작업명</div>
        <div class="op-gantt-timeline-header">${monthHeaderHtml}</div>
      </div>
      ${rowsHtml}
    </div>`;
  setOpGanttEditStatus("조회 전용", "idle");
}

function ganttDateFromPointer(drag, event) {
  const rect = drag.track.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  return addDaysIso(drag.scaleStart, Math.round(pct * drag.totalDays));
}

function ganttPreviewDates(drag, event) {
  if (drag.mode === "move") {
    const rect = drag.track.getBoundingClientRect();
    const pxPerDay = Math.max(1, rect.width) / Math.max(1, drag.totalDays);
    const deltaDays = Math.round((event.clientX - drag.pointerStartX) / pxPerDay);
    return {
      start_date: addDaysIso(drag.originalStart, deltaDays),
      finish_date: addDaysIso(drag.originalFinish, deltaDays),
    };
  }

  const pointerDate = ganttDateFromPointer(drag, event);
  if (drag.mode === "start") {
    return {
      start_date: minIsoDate(pointerDate, drag.originalFinish),
      finish_date: drag.originalFinish,
    };
  }
  return {
    start_date: drag.originalStart,
    finish_date: maxIsoDate(pointerDate, drag.originalStart),
  };
}

function updateGanttBarPreview(drag, preview) {
  const leftDays = diffDaysIso(drag.scaleStart, preview.start_date);
  const spanDays = Math.max(1, diffDaysIso(preview.start_date, preview.finish_date) + 1);
  const left = Math.max(0, Math.min(100, (leftDays / drag.totalDays) * 100));
  const width = Math.max(0.3, Math.min(100 - left, (spanDays / drag.totalDays) * 100));
  drag.bar.style.left = `${left.toFixed(2)}%`;
  drag.bar.style.width = `${width.toFixed(2)}%`;
  const badge = drag.bar.querySelector(".op-gantt-date-badge, .workboard-gantt-date-badge");
  if (badge) badge.textContent = `${preview.start_date} ~ ${preview.finish_date}`;
  drag.preview = preview;
}

function applyGanttDateUpdate(result) {
  const wpId = String(result.work_package_id || "");
  const code = String(result.code || "");
  state.opViewRows = state.opViewRows.map((row) => {
    const rowId = String(row.id || "");
    const rowCode = String(row.code || "");
    if ((wpId && rowId === wpId) || (code && rowCode === code)) {
      return {
        ...row,
        start_date: result.start_date,
        finish_date: result.finish_date,
        source: result.source || row.source,
      };
    }
    return row;
  });
}

document.addEventListener("pointerdown", (event) => {
  const bar = event.target.closest(".workboard-gantt-editable[data-wb-gantt-task]");
  if (!bar || event.button !== 0) return;
  const row = allWorkboardRows().find((item) => workboardTaskKey(item) === bar.dataset.wbGanttTask);
  if (!row || !canEditWorkboardTask(row)) return;
  const track = bar.closest(".workboard-gantt-track");
  if (!track) return;
  const handle = event.target.closest("[data-wb-gantt-handle]");
  const originalStart = bar.dataset.wbGanttStart;
  const originalFinish = bar.dataset.wbGanttFinish || originalStart;
  if (!originalStart || !originalFinish) return;

  state.workboardGanttDrag = {
    bar,
    track,
    mode: handle?.dataset.wbGanttHandle || "move",
    taskKey: bar.dataset.wbGanttTask,
    originalStart,
    originalFinish,
    scaleStart: bar.dataset.wbGanttScaleStart,
    totalDays: Number(bar.dataset.wbGanttTotalDays || 1),
    pointerStartX: event.clientX,
    preview: { start_date: originalStart, finish_date: originalFinish },
  };
  bar.classList.add("is-dragging");
  bar.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

document.addEventListener("pointermove", (event) => {
  const drag = state.workboardGanttDrag;
  if (!drag) return;
  updateGanttBarPreview(drag, ganttPreviewDates(drag, event));
});

document.addEventListener("pointerup", async (event) => {
  const drag = state.workboardGanttDrag;
  if (!drag) return;
  state.workboardGanttDrag = null;
  drag.bar.classList.remove("is-dragging");
  const preview = drag.preview || ganttPreviewDates(drag, event);
  if (preview.start_date === drag.originalStart && preview.finish_date === drag.originalFinish) {
    renderWorkboardPanel();
    return;
  }
  await quickUpdateWorkboardTask(drag.taskKey, preview);
});

document.addEventListener("pointerdown", (event) => {
  const bar = event.target.closest(".op-gantt-editable[data-gantt-wp-id]");
  if (!bar || event.button !== 0 || !canMutateWork()) return;
  const track = bar.closest(".op-gantt-track");
  if (!track || !state.opViewProjectId) return;
  const handle = event.target.closest("[data-gantt-handle]");
  const originalStart = bar.dataset.ganttStart;
  const originalFinish = bar.dataset.ganttFinish || originalStart;
  if (!originalStart || !originalFinish) return;

  state.opGanttDrag = {
    bar,
    track,
    mode: handle?.dataset.ganttHandle || "move",
    projectId: state.opViewProjectId,
    wpId: bar.dataset.ganttWpId,
    code: bar.dataset.ganttCode || "",
    originalStart,
    originalFinish,
    scaleStart: bar.dataset.ganttScaleStart,
    totalDays: Number(bar.dataset.ganttTotalDays || 1),
    pointerStartX: event.clientX,
    preview: { start_date: originalStart, finish_date: originalFinish },
  };
  bar.classList.add("is-dragging");
  bar.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

document.addEventListener("pointermove", (event) => {
  const drag = state.opGanttDrag;
  if (!drag) return;
  updateGanttBarPreview(drag, ganttPreviewDates(drag, event));
});

document.addEventListener("pointerup", async (event) => {
  const drag = state.opGanttDrag;
  if (!drag) return;
  state.opGanttDrag = null;
  drag.bar.classList.remove("is-dragging");
  const preview = drag.preview || ganttPreviewDates(drag, event);
  if (preview.start_date === drag.originalStart && preview.finish_date === drag.originalFinish) {
    renderOpGantt();
    return;
  }

  setOpGanttEditStatus("저장 중…", "saving");
  try {
    const result = await request(
      `/api/projects/${encodeURIComponent(drag.projectId)}/op-work-packages/${encodeURIComponent(drag.wpId)}/dates`,
      {
        method: "PATCH",
        body: JSON.stringify(preview),
      },
    );
    applyGanttDateUpdate(result);
    setOpGanttEditStatus("저장됨", "idle");
    renderOpWorkPackages();
    renderOpGantt();
  } catch (error) {
    setOpGanttEditStatus(`저장 실패: ${error.message}`, "error");
    renderOpGantt();
  }
});

const navLinks = [...document.querySelectorAll(".nav-list a[href^='#']")];
const viewAliases = {
  admin:    "operations",
  "wbs":    "wbs-plan",
  "sync":   "settings",   // OpenProject → 설정 탭으로 리다이렉트
};

// #sync URL로 접근 시 settings로 이동 후 openproject 탭 열기
if (window.location.hash === "#sync") {
  window.history.replaceState(null, "", "#settings");
}
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

function viewLabel(viewId = "dashboard") {
  const link = navLinks.find((item) => normalizedViewId(item.hash) === viewId);
  return link?.textContent.trim() || "대시보드";
}

function updateTopbarTitle(viewId = "dashboard") {
  const title = document.querySelector("#topbarTitle");
  const eyebrow = document.querySelector("#topbarEyebrow");
  if (eyebrow) eyebrow.textContent = "기업 WBS 플랫폼";
  if (title) title.textContent = viewLabel(viewId);
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
  updateTopbarTitle(viewId);
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
  if (viewId === "workboard") {
    renderWorkboardPanel();
    maybeLoadWorkboardProject();
  }
  if (viewId === "op-view") {
    maybeLoadOpViewProject();
  }
  if (viewId === "portfolio") applyPortfolioTab();
  if (viewId === "announcements") renderAnnouncementsPanel();
  if (viewId === "risks") renderRisksPanel();
  if (viewId === "resource") renderResourcePanel();
  if (viewId === "settings" && state.settingsTab === "tenants") renderTenantsTab();
  if (viewId === "settings" && state.settingsTab === "auth") renderAuthSettingsTab();
  if (viewId === "settings" && state.settingsTab === "smtp") renderSmtpTab();
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
  if (session.tenant?.id) {
    state.currentTenantId = session.tenant.id;
    state.currentTenant = session.tenant;
    window.localStorage.setItem(TENANT_ID_KEY, state.currentTenantId);
  }
  if (session.token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  }
  document.querySelector("#loginStatus").textContent = "";
  renderAuthState();
  await loadTenantSwitcher();
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

document.querySelector("#tenantSelect")?.addEventListener("change", (event) => {
  switchTenant(event.target.value);
});
document.querySelector("#tenantSelect")?.addEventListener("input", (event) => {
  switchTenant(event.target.value);
});
document.querySelector("#tenantSwitcher")?.addEventListener("change", (event) => {
  if (event.target?.matches?.("#tenantSelect")) {
    switchTenant(event.target.value);
  }
});

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

document.querySelector("#loginForm").addEventListener("submit", loginUser);
document.querySelector("#passwordDialogClose").addEventListener("click", closePasswordDialog);
document.querySelector("#passwordCancelButton").addEventListener("click", closePasswordDialog);
document.querySelector("#passwordForm").addEventListener("submit", changePassword);
document.querySelector("#createProjectButton").addEventListener("click", openProjectDialog);

/* ── 사용자 아이콘 드롭다운 ──────────────────────── */
function toggleUserDropdown(open) {
  const btn      = document.querySelector("#userAvatarBtn");
  const dropdown = document.querySelector("#userDropdown");
  if (!btn || !dropdown) return;
  const isOpen = open !== undefined ? open : dropdown.hidden;
  dropdown.hidden = !isOpen;
  btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

document.querySelector("#userAvatarBtn").addEventListener("click", (event) => {
  event.stopPropagation();
  const dropdown = document.querySelector("#userDropdown");
  toggleUserDropdown(dropdown.hidden);
});

/* 드롭다운 내 버튼 클릭 후 닫기 */
document.querySelector("#refreshButton").addEventListener("click", () => {
  toggleUserDropdown(false);
  loadData();
});
document.querySelector("#logoutButton").addEventListener("click", () => {
  toggleUserDropdown(false);
  logoutUser();
});
document.querySelector("#passwordButton").addEventListener("click", () => {
  toggleUserDropdown(false);
  openPasswordDialog(false);
});

/* 외부 클릭 시 드롭다운 닫기 */
document.addEventListener("click", (event) => {
  if (!event.target.closest("#userMenuWrap")) {
    toggleUserDropdown(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") toggleUserDropdown(false);
});
document.querySelector("#projectDialogClose").addEventListener("click", closeProjectDialog);
document.querySelector("#projectCancelButton").addEventListener("click", closeProjectDialog);
document.querySelector("#projectTemplateSelect").addEventListener("change", syncProjectDeliveryModeWithTemplate);
document.querySelector("#projectForm").addEventListener("submit", createProject);
document.querySelector("#userCreateForm").addEventListener("submit", createPortalUser);
document.querySelector("#userGroupCreateButton").addEventListener("click", createUserGroup);
document.querySelector("#importErrorWorkbookButton").addEventListener("click", downloadImportErrorsExcel);
document.querySelector("#renumberButton").addEventListener("click", renumberTemplateCodes);
// #applyImportButton 이벤트는 하단 templates 클릭 핸들러 블록에서 등록
document.querySelector("#syncRefreshButton").addEventListener("click", refreshEnginePreflight);
document.querySelector("#syncPreflightButton").addEventListener("click", loadProjectSyncPreflight);
document.querySelector("#syncDryRunButton").addEventListener("click", dryRunProjectSync);
document.querySelector("#syncRunButton").addEventListener("click", runProjectSync);

/* ── 역방향 연계 이벤트 ──────────────────────── */
document.querySelector("#syncPullButton").addEventListener("click", pullOpenProjectStatus);
document.querySelector("#opInstanceCheckBtn").addEventListener("click", checkOpInstanceConnection);
document.querySelector("#syncWebhookCopyBtn").addEventListener("click", () => {
  const url = document.querySelector("#syncWebhookUrl")?.textContent?.trim();
  if (!url || url === "-") return;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector("#syncWebhookCopyBtn");
    const orig = btn.textContent;
    btn.textContent = "✅";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => alert(url));
});
document.querySelector("#projectRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-action]");
  if (!button) return;
  const pid = button.dataset.projectId;
  if (button.dataset.projectAction === "detail") {
    if (pid) openProjectDrawer(pid);
    return;
  }
  if (button.disabled) return;
  if (button.dataset.projectAction === "plan") {
    if (pid) {
      applyPortalView("#wbs-plan", { behavior: "smooth" });
      loadWbsPlanProject(pid);
    }
    return;
  }
  requestProjectApproval(pid);
});

/* 드로어 닫기 */
document.querySelector("#drawerClose").addEventListener("click", closeProjectDrawer);
document.querySelector("#drawerBackdrop").addEventListener("click", closeProjectDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#projectDrawer").hidden) {
    closeProjectDrawer();
  }
});

/* 드로어 내부 빠른 액션 */
document.querySelector("#drawerContent").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-drawer-action]");
  if (!btn) return;
  const pid = btn.dataset.projectId;
  if (btn.dataset.drawerAction === "wbs") {
    closeProjectDrawer();
    applyPortalView("#wbs-plan", { behavior: "smooth" });
    if (pid) loadWbsPlanProject(pid);
  } else if (btn.dataset.drawerAction === "workboard") {
    closeProjectDrawer();
    state.workboardProjectId = pid || state.workboardProjectId;
    state.workboardLoadedProjectId = null;
    applyPortalView("#workboard", { behavior: "smooth" });
    if (pid) loadWorkboardProject(pid);
  } else if (btn.dataset.drawerAction === "approval") {
    closeProjectDrawer();
    requestProjectApproval(pid);
  } else if (btn.dataset.drawerAction === "sync") {
    closeProjectDrawer();
    applyPortalView("#sync", { behavior: "smooth" });
  }
});
document.querySelector("#approvalPipelineList").addEventListener("click", (event) => {
  // 승인/반려 버튼
  const approvalBtn = event.target.closest("[data-approval-action]");
  if (approvalBtn && !approvalBtn.disabled) {
    decideApproval(approvalBtn.dataset.approvalId, approvalBtn.dataset.approvalAction);
    return;
  }
  // 반려 후 재승인 요청
  const reapplyBtn = event.target.closest("[data-approval-action-project='reapply']");
  if (reapplyBtn) {
    requestProjectApproval(reapplyBtn.dataset.projectId);
    return;
  }
  // 반려 후 WBS 수정 이동
  const planBtn = event.target.closest("[data-project-action='plan']");
  if (planBtn && !planBtn.disabled) {
    const pid = planBtn.dataset.projectId;
    applyPortalView("#wbs-plan", { behavior: "smooth" });
    if (pid) loadWbsPlanProject(pid);
  }
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
document.querySelector(".nav-list").addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#']");
  if (!link) return;
  event.preventDefault();
  applyPortalView(link.hash, { behavior: "smooth" });
  // 승인 이력 패널은 뷰에 따라 레이아웃이 달라지므로 즉시 재렌더링
  if (link.hash === "#approvals" || link.hash === "#dashboard") {
    renderApprovals();
  }
});
document.querySelector("#auditRefreshButton").addEventListener("click", () => {
  loadData().then(() => renderAuditPanel());
});

/* 설정 탭 전환 */
document.querySelector("#settingsTabBar").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-stg-tab]");
  if (!tab || tab.hidden) return;
  switchSettingsTab(tab.dataset.stgTab);
});

/* 감사 로그 서브탭 */
document.querySelector("#auditSubTabBar").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-audit-tab]");
  if (!tab) return;
  state.auditTab = tab.dataset.auditTab;
  renderAuditPanel();
});

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
document.querySelector("#projectPolicyPanel")?.addEventListener("click", (event) => {
  if (event.target.closest("#projectPolicySaveButton")) saveProjectOperationPolicy();
});
document.querySelector("#externalIntegrationToggle")?.addEventListener("change", (event) => {
  saveExternalIntegrationPreference(event.target.checked);
});
document.querySelector("#importHistoryList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-import-job-id]");
  if (!button) return;
  loadImportJob(button.dataset.importJobId);
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

/* 포트폴리오 필터 */
document.querySelector("#portfolioFilter").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-filter]");
  if (!btn) return;
  state.portfolioFilter = btn.dataset.filter;
  renderProjects();
});

document.querySelector("#portfolioOwnerFilter")?.addEventListener("change", (event) => {
  state.portfolioOwnerFilter = event.target.value;
  renderProjects();
});

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-project-sort]");
  if (!btn) return;
  const key = btn.dataset.projectSort;
  if (!key) return;
  if (state.portfolioSortKey === key) {
    state.portfolioSortDir = state.portfolioSortDir === "asc" ? "desc" : "asc";
  } else {
    state.portfolioSortKey = key;
    state.portfolioSortDir = "asc";
  }
  renderProjects();
});

/* ── WBS 계획 이벤트 ──────────────────────────────── */

/* 프로젝트 셀렉트 변경 */
document.querySelector("#wbsPlanProjectSelect").addEventListener("change", (event) => {
  const projectId = event.target.value;
  if (!projectId) return;
  if (projectId === state.wbsPlanProjectId) return;
  if (state.wbsPlanDirty && !window.confirm("저장하지 않은 변경사항이 있습니다. 프로젝트를 변경하시겠습니까?")) {
    // 되돌리기
    event.target.value = state.wbsPlanProjectId || "";
    return;
  }
  loadWbsPlanProject(projectId);
});

/* WBS 보드 — 수정 / 삭제 / 하위추가 / 펼치기 */
/* ── WBS 테이블 이벤트 ───────────────────────────── */

/* 상세 패널 열기 */
function openWbsDetailPanel(code) {
  const row = state.wbsPlanRows.find((r) => r.code === code);
  if (!row) return;
  state.wbsSelectedCode = code;
  const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
  const canMutate = canMutateWork();

  document.querySelector("#wbsDetailCode").textContent  = row.code || "-";
  document.querySelector("#wbsDetailTitle").textContent = row.name || "작업 상세";
  document.querySelector("#wbsDetailPanel").hidden = false;

  const statusOpts = WBS_STATUSES.map((s) => `<option value="${s}" ${(meta.status||"대기")===s?"selected":""}>${s}</option>`).join("");
  const prioOpts   = WBS_PRIORITIES.map((p) => `<option value="${p}" ${(meta.priority||"보통")===p?"selected":""}>${p}</option>`).join("");
  const typeOpts   = ["작업","단계","산출물","마일스톤","리스크","이슈","변경요청"].map((t) => `<option value="${t}" ${(row.item_type||"작업")===t?"selected":""}>${t}</option>`).join("");
  const comments   = Array.isArray(meta.comments) ? meta.comments : [];
  const commentHtml = comments.length
    ? comments.map((c) => `<div class="wbs-comment-item"><div class="wbs-comment-meta"><span class="wbs-comment-author">${escapeHtml(c.author||"익명")}</span><span class="wbs-comment-time">${escapeHtml(c.ts||"")}</span></div><p class="wbs-comment-text">${escapeHtml(c.text||"")}</p></div>`).join("")
    : `<p style="color:var(--text-muted);font-size:0.8rem">코멘트 없음</p>`;

  document.querySelector("#wbsDetailBody").innerHTML = `
    <div class="wbs-detail-field">
      <label class="wbs-detail-label">작업명</label>
      <input id="detailName" value="${escapeHtml(row.name||"")}" ${canMutate?"":"disabled"} />
    </div>
    <div class="wbs-detail-row2">
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">유형</label>
        <select id="detailType" ${canMutate?"":"disabled"}>${typeOpts}</select>
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">담당자</label>
        <input id="detailOwner" value="${escapeHtml(row.owner||"")}" ${canMutate?"":"disabled"} />
      </div>
    </div>
    <div class="wbs-detail-row2">
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">상태</label>
        <select id="detailStatus" ${canMutate?"":"disabled"}>${statusOpts}</select>
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">우선순위</label>
        <select id="detailPriority" ${canMutate?"":"disabled"}>${prioOpts}</select>
      </div>
    </div>
    <div class="wbs-detail-field">
      <label class="wbs-detail-label">진행률 (${meta.progress??0}%)</label>
      <input id="detailProgress" type="range" min="0" max="100" value="${meta.progress??0}" ${canMutate?"":"disabled"} style="width:100%;accent-color:var(--blue)" />
    </div>
    <div class="wbs-detail-row2">
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">시작일</label>
        <input id="detailStart" type="date" value="${escapeHtml(row.start_date||"")}" ${canMutate?"":"disabled"} />
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">종료일</label>
        <input id="detailEnd" type="date" value="${escapeHtml(row.finish_date||"")}" ${canMutate?"":"disabled"} />
      </div>
    </div>
    <div class="wbs-detail-row2">
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">가중치 (%)</label>
        <input id="detailWeight" type="number" min="0" max="100" value="${row.weight??""}" ${canMutate?"":"disabled"} />
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">공수 (시간)</label>
        <input id="detailEffort" value="${escapeHtml(meta.effort||"")}" placeholder="예) 8h" ${canMutate?"":"disabled"} />
      </div>
    </div>
    <div class="wbs-detail-field">
      <label class="wbs-detail-label">설명</label>
      <textarea id="detailDesc" ${canMutate?"":"disabled"}>${escapeHtml(meta.description||"")}</textarea>
    </div>
    <div class="wbs-detail-field">
      <label class="wbs-detail-label">코멘트 (${comments.length})</label>
      <div class="wbs-comment-list">${commentHtml}</div>
      ${canMutate ? `
        <div class="wbs-comment-input-row">
          <textarea id="detailCommentInput" placeholder="코멘트를 입력하세요…" rows="2"></textarea>
          <button type="button" id="detailCommentSubmit">등록</button>
        </div>` : ""}
    </div>`;

  /* 진행률 실시간 레이블 */
  const progressEl = document.querySelector("#detailProgress");
  if (progressEl) {
    progressEl.addEventListener("input", () => {
      progressEl.previousElementSibling.textContent = `진행률 (${progressEl.value}%)`;
    });
  }

  /* 코멘트 등록 */
  const submitBtn = document.querySelector("#detailCommentSubmit");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const input = document.querySelector("#detailCommentInput");
      const text  = input?.value.trim();
      if (!text) return;
      const row = state.wbsPlanRows.find((r) => r.code === state.wbsSelectedCode);
      if (!row) return;
      const meta = (row.metadata && typeof row.metadata === "object") ? { ...row.metadata } : {};
      const comments = Array.isArray(meta.comments) ? [...meta.comments] : [];
      comments.push({
        author: state.currentUser?.display_name || "PMO",
        text,
        ts: new Date().toLocaleString("ko-KR", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" }),
      });
      meta.comments = comments;
      row.metadata  = meta;
      state.wbsPlanDirty = true;
      input.value = "";
      openWbsDetailPanel(state.wbsSelectedCode);
    });
  }
}

function saveWbsDetailPanel() {
  saveWbsDictPartial();  // 새 함수로 위임
  document.querySelector("#wbsDetailPanel").hidden = true;
  state.wbsSelectedCode = null;
  renderWbsPlanTable();
}

/* 상태 팝업 */
function openStatusPopup(code, anchorEl) {
  document.querySelector(".wbs-status-popup")?.remove();
  const popup = document.createElement("div");
  popup.className = "wbs-status-popup";
  const rect = anchorEl.getBoundingClientRect();
  popup.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;
  WBS_STATUSES.forEach((s) => {
    const sc = STATUS_STYLE[s] || STATUS_STYLE["대기"];
    const btn = document.createElement("button");
    btn.className = "wbs-status-option";
    btn.type = "button";
    btn.textContent = s;
    btn.style.background = sc.bg;
    btn.style.color = sc.color;
    btn.addEventListener("click", () => {
      const row = state.wbsPlanRows.find((r) => r.code === code);
      if (row) {
        const meta = (row.metadata && typeof row.metadata === "object") ? { ...row.metadata } : {};
        meta.status = s;
        row.metadata = meta;
        state.wbsPlanDirty = true;
        renderWbsPlanTable();
      }
      popup.remove();
    });
    popup.appendChild(btn);
  });
  document.body.appendChild(popup);
  setTimeout(() => { document.addEventListener("click", () => popup.remove(), { once: true }); }, 0);
}

/* 인라인 편집 */
function startInlineEdit(el, code, field) {
  if (!canMutateWork()) return;
  const row = state.wbsPlanRows.find((r) => r.code === code);
  if (!row) return;
  const currentVal = field === "name" ? (row.name || "") : (row.owner || "");
  const input = document.createElement("input");
  input.className = "wbs-name-input";
  input.value = currentVal;
  if (field === "owner") {
    input.setAttribute("list", "wbsUserDatalist");
    input.setAttribute("autocomplete", "off");
    input.placeholder = "담당자 검색...";
  }
  el.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const val = input.value.trim();
    if (field === "name" && val) row.name = val;
    if (field === "owner") row.owner = val || null;
    state.wbsPlanDirty = true;
    renderWbsPlanTable();
  };
  input.addEventListener("blur",    commit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") renderWbsPlanTable(); });
}

/* 사용자 datalist 갱신 */
function refreshUserDatalist() {
  const dl = document.querySelector("#wbsUserDatalist");
  if (!dl) return;
  dl.innerHTML = (state.users || []).map((u) =>
    `<option value="${escapeHtml(u.display_name)}">${escapeHtml(u.email || "")}</option>`
  ).join("");
}

/* 담당자 검증 모달 열기 */
async function openOwnerMapModal() {
  const projectId = state.wbsPlanProjectId;
  if (!projectId) return;
  const dialog  = document.querySelector("#ownerMapDialog");
  const body    = document.querySelector("#ownerMapBody");
  const statusEl = document.querySelector("#ownerMapStatus");
  statusEl.textContent = "";
  body.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;padding:16px 0">불러오는 중…</p>`;
  dialog.showModal();

  let data;
  try {
    data = await request(`/api/projects/${encodeURIComponent(projectId)}/owner-map`);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--red);font-size:0.82rem">불러오기 실패: ${escapeHtml(String(err))}</p>`;
    return;
  }

  const { assignees = [], users = [] } = data;
  if (!assignees.length) {
    body.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;padding:16px 0">담당자 항목이 없습니다.</p>`;
    return;
  }

  const userOptions = [
    `<option value="">— 변경 없음 —</option>`,
    ...users.map((u) => `<option value="${escapeHtml(u.display_name)}">${escapeHtml(u.display_name)} (${escapeHtml(u.email || "")})</option>`),
  ].join("");

  const unmatched = assignees.filter((a) => !a.matched_user);
  const matched   = assignees.filter((a) =>  a.matched_user);

  const renderSection = (title, items, isUnmatched) => {
    if (!items.length) return "";
    const rows = items.map((a) => {
      const count = a.usages.length;
      const fields = [...new Set(a.usages.map((u) => u.field === "owner" ? "담당자" : u.field === "reviewer" ? "검토자" : "승인자"))].join(", ");
      const badge = isUnmatched
        ? `<span class="status-pill warning" style="font-size:0.68rem">미매칭</span>`
        : `<span class="status-pill stable" style="font-size:0.68rem">매칭됨</span>`;
      return `<tr>
        <td style="padding:8px 6px;font-size:0.82rem;white-space:nowrap">${escapeHtml(a.raw_name)} ${badge}</td>
        <td style="padding:8px 6px;font-size:0.75rem;color:var(--text-muted)">${fields} · ${count}개 항목</td>
        <td style="padding:8px 6px">
          <select class="owner-map-select" data-raw="${escapeHtml(a.raw_name)}" style="font-size:0.8rem;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);min-width:180px">
            ${userOptions}
          </select>
        </td>
      </tr>`;
    }).join("");
    return `<p style="font-size:0.75rem;font-weight:600;color:var(--text-muted);margin:12px 0 4px;text-transform:uppercase;letter-spacing:0.04em">${title}</p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:6px;font-size:0.72rem;color:var(--text-muted);font-weight:500">담당자 입력값</th>
          <th style="text-align:left;padding:6px;font-size:0.72rem;color:var(--text-muted);font-weight:500">사용 위치</th>
          <th style="text-align:left;padding:6px;font-size:0.72rem;color:var(--text-muted);font-weight:500">대체할 계정</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  body.innerHTML = renderSection(`미매칭 (${unmatched.length}건)`, unmatched, true)
    + renderSection(`매칭됨 (${matched.length}건)`, matched, false);
}

/* 담당자 일괄 매핑 적용 */
async function applyOwnerRemap() {
  const projectId = state.wbsPlanProjectId;
  if (!projectId) return;
  const selects = document.querySelectorAll(".owner-map-select");
  const mappings = {};
  selects.forEach((sel) => {
    const raw = sel.dataset.raw;
    const val = sel.value;
    if (val) mappings[raw] = val;
  });
  if (!Object.keys(mappings).length) {
    document.querySelector("#ownerMapStatus").textContent = "변경할 매핑을 선택하세요.";
    return;
  }
  const statusEl = document.querySelector("#ownerMapStatus");
  statusEl.textContent = "적용 중…";
  try {
    const result = await request(`/api/projects/${encodeURIComponent(projectId)}/owner-remap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings }),
    });
    statusEl.style.color = "var(--green)";
    statusEl.textContent = `${result.updated}개 항목이 업데이트되었습니다.`;
    // WBS 데이터 새로고침
    await loadWbsPlanProject(projectId);
    setTimeout(() => document.querySelector("#ownerMapDialog")?.close(), 1200);
  } catch (err) {
    statusEl.style.color = "var(--red)";
    statusEl.textContent = `오류: ${escapeHtml(String(err))}`;
  }
}

/* CSV 내보내기 */
function exportWbsCsv() {
  const rows = state.wbsPlanRows;
  if (!rows.length) return;
  const header = ["WBS코드","작업명","유형","담당자","상태","진행률","우선순위","시작일","종료일","가중치"];
  const lines  = [header.join(",")];
  rows.forEach((r) => {
    const meta = r.metadata || {};
    lines.push([
      r.code, r.name, r.item_type||"작업", r.owner||"",
      meta.status||"대기", (meta.progress??0)+"%",
      meta.priority||"보통", r.start_date||"", r.finish_date||"", r.weight??""
    ].map((v) => `"${String(v).replace(/"/g,'""')}"`).join(","));
  });
  const blob = new Blob(["﻿"+lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = "wbs_export.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* 기준선 유형 칩 클릭 */
document.querySelector("#wbsBaselineChips")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-wbs-type-chip]");
  if (!chip) return;
  state.wbsPlanTypeFilter = chip.dataset.wbsTypeChip;
  document.querySelectorAll("[data-wbs-type-chip]").forEach((c) => c.classList.toggle("active", c.dataset.wbsTypeChip === state.wbsPlanTypeFilter));
  renderWbsPlanTable();
});

/* 접기·펼치기·CSV */
document.querySelector("#wbsCollapseAllBtn").addEventListener("click", () => {
  // 자식이 있는 모든 항목을 collapsed 처리
  const childMap = buildChildMap(state.wbsPlanRows);
  state.wbsPlanRows.forEach((r) => {
    if (r.code && (childMap[r.code] || []).length > 0) {
      state.wbsExpanded[r.code] = false;
    }
  });
  renderWbsPlanTable();
});
document.querySelector("#wbsExpandAllBtn").addEventListener("click", () => {
  state.wbsExpanded = {}; // 모든 항목 undefined → 기본값 expanded
  renderWbsPlanTable();
});

document.querySelector("#wbsExportCsvBtn")?.addEventListener("click", exportWbsCsv);
document.querySelector("#wbsExportExcelBtn")?.addEventListener("click", () => {
  const pid = state.wbsPlanProjectId || state.selectedProjectId;
  if (!pid) { alert("프로젝트를 먼저 선택하세요."); return; }
  window.location.href = `/api/projects/${pid}/export-excel`;
});
document.querySelector("#wbsExportDocxBtn")?.addEventListener("click", exportWbsDocx);
document.querySelector("#wbsPrintReportBtn")?.addEventListener("click", printWbsReport);

// P2-03: PMO 주간 보고서 Excel 다운로드
document.querySelector("#wbsWeeklyReportBtn")?.addEventListener("click", () => {
  const today = new Date();
  const from = new Date(today); from.setDate(today.getDate() - 7);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `/api/reports/weekly-excel?from_date=${fmt(from)}&to_date=${fmt(today)}`;
  const a = document.createElement("a");
  a.href = url; a.download = ""; a.click();
});

/* 상세 패널 닫기·저장 */
/* ══════════════════════════════════════════════════════
   PHASE 1 기능 — 드래그앤드롭 + WBS사전 + CR
══════════════════════════════════════════════════════ */

/* ── 드래그 앤 드롭 ──────────────────────────────── */
function initWbsDragDrop() {
  const tbody = document.querySelector("#wbsTableBody");
  if (!tbody) return;

  tbody.addEventListener("dragstart", (e) => {
    const tr = e.target.closest("tr[data-code]");
    if (!tr) return;
    state.wbsDragCode = tr.dataset.code;
    e.dataTransfer.effectAllowed = "move";
    tr.style.opacity = "0.5";
  });

  tbody.addEventListener("dragend", (e) => {
    const tr = e.target.closest("tr[data-code]");
    if (tr) tr.style.opacity = "";
    document.querySelectorAll(".wbs-drag-over").forEach((el) => el.classList.remove("wbs-drag-over"));
    state.wbsDragCode = null;
  });

  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const tr = e.target.closest("tr[data-code]");
    document.querySelectorAll(".wbs-drag-over").forEach((el) => el.classList.remove("wbs-drag-over"));
    if (tr && tr.dataset.code !== state.wbsDragCode) tr.classList.add("wbs-drag-over");
  });

  tbody.addEventListener("drop", (e) => {
    e.preventDefault();
    const targetTr = e.target.closest("tr[data-code]");
    if (!targetTr || !state.wbsDragCode || targetTr.dataset.code === state.wbsDragCode) return;

    const dragCode   = state.wbsDragCode;
    const targetCode = targetTr.dataset.code;

    const rows     = state.wbsPlanRows;
    const fromIdx  = rows.findIndex((r) => r.code === dragCode);
    const toIdx    = rows.findIndex((r) => r.code === targetCode);
    if (fromIdx < 0 || toIdx < 0) return;

    // 배열에서 이동
    const [moved] = rows.splice(fromIdx, 1);
    rows.splice(toIdx, 0, moved);

    // sort_order 재설정
    rows.forEach((r, i) => { r.sort_order = i + 1; });

    state.wbsPlanDirty = true;
    renderWbsPlanTable();
  });
}

/* ── WBS 사전 (Detail Panel 탭 확장) ────────────── */
function openWbsDetailPanel(code) {
  const row = state.wbsPlanRows.find((r) => r.code === code);
  if (!row) return;

  // 편집 잠금 확인
  const lockResult = acquireEditLock(code);
  if (lockResult.locked) {
    const ok = window.confirm(`"${lockResult.lockedBy}"이(가) ${lockResult.elapsed}초 전부터 이 항목을 편집 중입니다. 그래도 열겠습니까?`);
    if (!ok) return;
  }

  state.wbsSelectedCode = code;
  state.wbsDictTab = "basic";

  const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
  const canMutate = canMutateWork();

  document.querySelector("#wbsDetailCode").textContent  = row.code || "-";
  document.querySelector("#wbsDetailTitle").textContent = row.name || "작업 상세";

  // 편집 잠금 배지 표시/숨김
  let lockBadge = document.querySelector("#wbsDetailLockBadge");
  if (!lockBadge) {
    lockBadge = document.createElement("span");
    lockBadge.id = "wbsDetailLockBadge";
    lockBadge.className = "approval-level-badge";
    lockBadge.style.cssText = "margin-left:8px;font-size:0.7rem";
    document.querySelector("#wbsDetailTitle")?.after(lockBadge);
  }
  if (!canMutate) {
    lockBadge.textContent = "🔒 읽기 전용";
    lockBadge.style.display = "inline-block";
  } else if (lockResult && lockResult.locked) {
    lockBadge.textContent = `⚠️ ${lockResult.lockedBy} 편집 중`;
    lockBadge.style.display = "inline-block";
  } else {
    lockBadge.style.display = "none";
  }

  document.querySelector("#wbsDetailPanel").hidden = false;

  renderWbsDictPanel(row, meta, canMutate);
}

function renderWbsDictPanel(row, meta, canMutate) {
  const tab     = state.wbsDictTab;
  const code    = row.code || "";
  const version = meta.wbs_version ? `v${meta.wbs_version}` : "v1.0";
  const crList  = Array.isArray(meta.cr_list) ? meta.cr_list : [];
  const dodItems = Array.isArray(meta.dod_items) ? meta.dod_items : [];

  /* 탭 바 (업무 부하 탭 추가) */
  const tabBar = `
    <div class="wbs-dict-tabs">
      <button class="wbs-dict-tab ${tab==="basic"?"active":""}" data-dict-tab="basic">기본</button>
      <button class="wbs-dict-tab ${tab==="dict"?"active":""}" data-dict-tab="dict">사전 <small>(${dodItems.filter(d=>d.done).length}/${dodItems.length})</small></button>
      <button class="wbs-dict-tab ${tab==="scope"?"active":""}" data-dict-tab="scope">범위</button>
      <button class="wbs-dict-tab ${tab==="cr"?"active":""}" data-dict-tab="cr">CR <small>${crList.length?crList.length:""}</small></button>
    </div>`;

  let content = "";

  if (tab === "basic") {
    /* 기존 기본 정보 + R&R */
    const typeOpts   = ["작업","단계","산출물","마일스톤","리스크","이슈","변경요청"].map((t) => `<option value="${t}" ${(row.item_type||"작업")===t?"selected":""}>${t}</option>`).join("");

    content = `
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">작업명</label>
        <input id="detailName" value="${escapeHtml(row.name||"")}" ${canMutate?"":"disabled"} />
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">유형</label><select id="detailType" ${canMutate?"":"disabled"}>${typeOpts}</select></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">버전</label><span class="wbs-version-badge">${escapeHtml(version)}</span></div>
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">담당자 (R)</label><input id="detailOwner" value="${escapeHtml(row.owner||"")}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">검토자 (A)</label><input id="detailReviewer" value="${escapeHtml(meta.reviewer||"")}" ${canMutate?"":"disabled"} /></div>
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">승인자 (C)</label><input id="detailApprover" value="${escapeHtml(meta.approver||"")}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">조직 / 팀</label><input id="detailTeam" value="${escapeHtml(meta.team||"")}" ${canMutate?"":"disabled"} placeholder="예) PMO팀, 개발1팀" /></div>
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">시작일</label><input id="detailStart" type="date" value="${escapeHtml(row.start_date||"")}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">종료일</label><input id="detailEnd" type="date" value="${escapeHtml(row.finish_date||"")}" ${canMutate?"":"disabled"} /></div>
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">가중치 (%)</label><input id="detailWeight" type="number" min="0" max="100" value="${row.weight??""}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">공수 (시간)</label><input id="detailEffort" value="${escapeHtml(meta.effort||"")}" ${canMutate?"":"disabled"} placeholder="예) 8h" /></div>
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">비고 (메모)</label>
        ${canMutate ? createRichTextEditor("detailNotesToolbar", "detailNotesEditor", escapeHtml(meta.notes||"")) : `<div class="rt-editor rt-editor--readonly">${meta.notes||"<em style='color:var(--text-muted)'>비고 없음</em>"}</div>`}
      </div>`;
  }

  if (tab === "dict") {
    /* WBS 사전: DoD 체크리스트 + 산출물 */
    const dodHtml = dodItems.map((item, idx) => `
      <div class="wbs-dod-item ${item.done?"done":""}">
        <input type="checkbox" ${item.done?"checked":""} data-dod-idx="${idx}" ${canMutate?"":"disabled"} />
        <span class="wbs-dod-item-text">${escapeHtml(item.text||"")}</span>
        ${canMutate ? `<button class="wbs-dod-del" type="button" data-dod-del="${idx}" title="삭제">×</button>` : ""}
      </div>`).join("");

    const deliverables = Array.isArray(meta.deliverables) ? meta.deliverables : [];
    const delivHtml = deliverables.map((d, idx) => `
      <div class="wbs-deliverable-item">
        <span>📄 ${escapeHtml(d.name||"")}</span>
        ${canMutate ? `<button class="row-act-btn danger" type="button" data-deliv-del="${idx}" style="width:16px;height:16px;font-size:0.6rem">×</button>` : ""}
      </div>`).join("");

    content = `
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">완료 기준 (DoD) — ${dodItems.filter(d=>d.done).length}/${dodItems.length} 완료</label>
        <div class="wbs-dod-list">${dodHtml || '<p style="color:var(--text-muted);font-size:0.8rem">DoD 항목 없음</p>'}</div>
        ${canMutate ? `<div style="display:flex;gap:6px">
          <input id="dodNewText" type="text" placeholder="새 DoD 항목 입력…" style="flex:1;min-height:28px;border:1px solid var(--line);border-radius:var(--radius);padding:0 8px;font:inherit;font-size:0.8rem" />
          <button class="wbs-add-row-btn" type="button" id="dodAddBtn" style="width:auto;padding:0 10px">+ 추가</button>
        </div>` : ""}
      </div>
      <div class="wbs-detail-field" style="margin-top:12px">
        <label class="wbs-detail-label">산출물 목록</label>
        <div>${delivHtml || '<p style="color:var(--text-muted);font-size:0.8rem">산출물 없음</p>'}</div>
        ${canMutate ? `<div style="display:flex;gap:6px;margin-top:6px">
          <input id="delivNewName" type="text" placeholder="산출물명 입력…" style="flex:1;min-height:28px;border:1px solid var(--line);border-radius:var(--radius);padding:0 8px;font:inherit;font-size:0.8rem" />
          <button class="wbs-add-row-btn" type="button" id="delivAddBtn" style="width:auto;padding:0 10px">+ 추가</button>
        </div>` : ""}
      </div>`;
  }

  if (tab === "scope") {
    /* 범위 정의 */
    const sc = meta.scope || {};
    content = `
      <p style="font-size:0.76rem;color:var(--text-muted);margin:0 0 10px">작업 항목의 범위를 포함/제외/가정/제약 4가지로 정의합니다.</p>
      <div class="wbs-scope-grid">
        <div class="wbs-scope-card in">
          <label>✅ 포함 (In Scope)</label>
          <textarea id="scopeIn" ${canMutate?"":"disabled"} placeholder="이 작업에 포함되는 내용...">${escapeHtml(sc.in||"")}</textarea>
        </div>
        <div class="wbs-scope-card out">
          <label>❌ 제외 (Out of Scope)</label>
          <textarea id="scopeOut" ${canMutate?"":"disabled"} placeholder="이 작업에서 제외되는 내용...">${escapeHtml(sc.out||"")}</textarea>
        </div>
        <div class="wbs-scope-card assume">
          <label>💡 가정 (Assumptions)</label>
          <textarea id="scopeAssume" ${canMutate?"":"disabled"} placeholder="작업 수행 시 전제 조건...">${escapeHtml(sc.assumptions||"")}</textarea>
        </div>
        <div class="wbs-scope-card const">
          <label>⚠ 제약 (Constraints)</label>
          <textarea id="scopeConst" ${canMutate?"":"disabled"} placeholder="일정/비용/기술적 제약...">${escapeHtml(sc.constraints||"")}</textarea>
        </div>
      </div>`;
  }

  if (tab === "cr") {
    /* 변경 요청 이력 + CR 승인 워크플로우 */
    const statusLabelMap = { "등록": "등록", "승인": "승인", "반려": "반려", undefined: "등록" };
    const crHtml = crList.length
      ? crList.map((cr, idx) => {
          const st        = cr.status || "등록";
          const stCls     = st === "승인" ? "approved" : st === "반려" ? "rejected" : "pending";
          const canDecide = canMutate && st === "등록";
          return `
            <div class="cr-item">
              <div class="cr-item-header">
                <span class="cr-item-title">${escapeHtml(cr.id||"")} ${escapeHtml(cr.title||"")}</span>
                <div style="display:flex;gap:5px;align-items:center">
                  <span class="cr-type-badge">${escapeHtml(cr.type||"")}</span>
                  <span class="cr-status-${stCls}">${escapeHtml(st)}</span>
                  ${canDecide ? `
                    <button class="rt-btn cr-approve-btn" type="button" data-cr-approve="${escapeHtml(cr.id)}" data-cr-code="${escapeHtml(code)}">승인</button>
                    <button class="rt-btn cr-reject-btn"  type="button" data-cr-reject="${escapeHtml(cr.id)}" data-cr-code="${escapeHtml(code)}">반려</button>` : ""}
                </div>
              </div>
              <p class="cr-item-meta">${escapeHtml(cr.requestedBy||"")} · ${escapeHtml(cr.date||"")} · 영향도: ${escapeHtml(cr.impact||"")}
                ${cr.decidedBy ? ` · ${st}: ${escapeHtml(cr.decidedBy)} (${escapeHtml(cr.decidedAt||"")})` : ""}
              </p>
              <p style="font-size:0.78rem;margin:4px 0 0;color:var(--text-muted)">${escapeHtml(cr.reason||"")}</p>
              ${cr.before||cr.after ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;font-size:0.74rem">
                <div style="background:#fff1f2;padding:4px 6px;border-radius:4px"><strong>변경 전:</strong> ${escapeHtml(cr.before||"-")}</div>
                <div style="background:#f0fdf4;padding:4px 6px;border-radius:4px"><strong>변경 후:</strong> ${escapeHtml(cr.after||"-")}</div>
              </div>` : ""}
            </div>`;
        }).join("")
      : `<p style="color:var(--text-muted);font-size:0.82rem">변경 요청 이력 없음</p>`;

    content = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:0.78rem;color:var(--text-muted)">${crList.length}건 (승인: ${crList.filter(c=>c.status==="승인").length} / 반려: ${crList.filter(c=>c.status==="반려").length})</span>
        ${canMutate ? `<button class="wbs-cr-btn" type="button" data-wbs-cr="${escapeHtml(code)}">+ CR 등록</button>` : ""}
      </div>
      <div class="cr-history-list">${crHtml}</div>`;
  }

  if (tab === "workload") {
    /* 업무 부하 가시화 */
    content = `<div id="workloadContainer"></div>`;
  }

  document.querySelector("#wbsDetailBody").innerHTML = tabBar + content;

  /* 탭 전환 이벤트 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-dict-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      saveWbsDictPartial();  // 현재 탭 데이터 저장
      state.wbsDictTab = btn.dataset.dictTab;
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (r) renderWbsDictPanel(r, r.metadata||{}, canMutateWork());
    });
  });

  /* DoD 체크 토글 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-dod-idx]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {}; const items = [...(m.dod_items||[])];
      items[Number(cb.dataset.dodIdx)].done = cb.checked;
      r.metadata = { ...m, dod_items: items }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  });

  /* DoD 삭제 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-dod-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {}; const items = [...(m.dod_items||[])];
      items.splice(Number(btn.dataset.dodDel), 1);
      r.metadata = { ...m, dod_items: items }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  });

  /* DoD 추가 */
  const dodAddBtn = document.querySelector("#dodAddBtn");
  if (dodAddBtn) {
    dodAddBtn.addEventListener("click", () => {
      const input = document.querySelector("#dodNewText");
      const text  = input?.value.trim();
      if (!text) return;
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {};
      const items = [...(m.dod_items||[]), { text, done: false }];
      r.metadata = { ...m, dod_items: items }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  }

  /* 산출물 추가 */
  const delivAddBtn = document.querySelector("#delivAddBtn");
  if (delivAddBtn) {
    delivAddBtn.addEventListener("click", () => {
      const input = document.querySelector("#delivNewName");
      const name  = input?.value.trim();
      if (!name) return;
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {};
      const deliverables = [...(m.deliverables||[]), { name }];
      r.metadata = { ...m, deliverables }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  }

  /* 산출물 삭제 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-deliv-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {}; const arr = [...(m.deliverables||[])];
      arr.splice(Number(btn.dataset.delivDel), 1);
      r.metadata = { ...m, deliverables: arr }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  });

  /* CR 등록 버튼 (탭 내부) */
  document.querySelector("#wbsDetailBody").querySelector("[data-wbs-cr]")?.addEventListener("click", (e) => {
    openWbsCrDialog(e.target.closest("[data-wbs-cr]").dataset.wbsCr);
  });

  /* CR 승인/반려 버튼 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-cr-approve]").forEach(btn => {
    btn.addEventListener("click", () => approveCrItem(btn.dataset.crCode, btn.dataset.crApprove, "승인"));
  });
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-cr-reject]").forEach(btn => {
    btn.addEventListener("click", () => {
      const reason = window.prompt("반려 사유를 입력하세요:");
      if (reason !== null) approveCrItem(btn.dataset.crCode, btn.dataset.crReject, "반려", reason);
    });
  });

  /* 워크로드 탭: renderWorkloadPanel 호출 */
  if (tab === "workload") {
    const wlContainer = document.querySelector("#workloadContainer");
    if (wlContainer) renderWorkloadPanel(wlContainer);
  }

  /* 리치텍스트 에디터 바인딩 (기본 탭 비고 필드) */
  if (tab === "basic" && document.querySelector("#detailNotesToolbar")) {
    bindRichTextEditor("detailNotesToolbar");
  }

  /* 코멘트 @멘션 시스템 연결 */
  const commentInput = document.querySelector("#detailCommentInput");
  if (commentInput) setupMentionSystem(commentInput);

  /* 진행률 실시간 레이블 */
  const progressEl = document.querySelector("#detailProgress");
  if (progressEl) {
    progressEl.addEventListener("input", () => {
      const prev = progressEl.previousElementSibling;
      if (prev) prev.textContent = `진행률 (${progressEl.value}%)`;
    });
  }

  /* 코멘트 등록 */
  const submitBtn = document.querySelector("#detailCommentSubmit");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const input = document.querySelector("#detailCommentInput");
      const text  = input?.value.trim();
      if (!text) return;
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {}; const comments = [...(m.comments||[])];
      comments.push({ author: state.currentUser?.display_name||"PMO", text, ts: new Date().toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) });
      r.metadata = { ...m, comments }; state.wbsPlanDirty = true;
      if (input) input.value = "";
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  }
}

/* 탭 전환 전 현재 입력 저장 */
function saveWbsDictPartial() {
  const code = state.wbsSelectedCode;
  const row  = code ? state.wbsPlanRows.find((r) => r.code === code) : null;
  if (!row) return;
  const meta = { ...(row.metadata||{}) };
  const tab  = state.wbsDictTab;

  if (tab === "basic") {
    const n = document.querySelector("#detailName")?.value.trim();
    const o = document.querySelector("#detailOwner")?.value.trim();
    if (n) row.name  = n;
    if (o !== undefined) row.owner = o;
    meta.reviewer = document.querySelector("#detailReviewer")?.value.trim() || meta.reviewer;
    meta.approver = document.querySelector("#detailApprover")?.value.trim() || meta.approver;
    const start   = document.querySelector("#detailStart")?.value;
    const end     = document.querySelector("#detailEnd")?.value;
    if (start !== undefined) row.start_date  = start || null;
    if (end   !== undefined) row.finish_date = end   || null;
    const weight  = document.querySelector("#detailWeight")?.value;
    if (weight !== "") row.weight = weight !== null && weight !== undefined ? Number(weight) : row.weight;
    const type    = document.querySelector("#detailType")?.value;
    if (type) row.item_type = type;
    const notesEl = document.querySelector("#detailNotesEditor");
    if (notesEl) meta.notes = notesEl.innerHTML;
    const teamEl2 = document.querySelector("#detailTeam");
    if (teamEl2 !== null && teamEl2 !== undefined) meta.team = teamEl2.value.trim();
    const effortEl2 = document.querySelector("#detailEffort");
    if (effortEl2 !== null && effortEl2 !== undefined) meta.effort = effortEl2.value.trim();
  }
  if (tab === "scope") {
    meta.scope = {
      in:          document.querySelector("#scopeIn")?.value    || "",
      out:         document.querySelector("#scopeOut")?.value   || "",
      assumptions: document.querySelector("#scopeAssume")?.value || "",
      constraints: document.querySelector("#scopeConst")?.value || "",
    };
  }
  row.metadata = meta;
  state.wbsPlanDirty = true;
}

/* ── 변경 요청 (CR) ──────────────────────────────── */
function openWbsCrDialog(code) {
  state.wbsCrTargetCode = code;
  const row  = state.wbsPlanRows.find((r) => r.code === code);
  const meta = row?.metadata || {};
  document.querySelector("#wbsCrDialogTitle").textContent = `변경 요청 — ${escapeHtml(row?.name||code)}`;
  document.querySelector("#crTitle").value  = "";
  document.querySelector("#crReason").value = "";
  document.querySelector("#crBefore").value = "";
  document.querySelector("#crAfter").value  = "";
  document.querySelector("#crScope").value  = "";
  document.querySelector("#wbsCrStatus").textContent = "";
  document.querySelector("#wbsCrDialog").showModal();
}

function applyWbsCrForm() {
  const code    = state.wbsCrTargetCode;
  const row     = code ? state.wbsPlanRows.find((r) => r.code === code) : null;
  if (!row) return;

  const title  = document.querySelector("#crTitle")?.value.trim();
  const type   = document.querySelector("#crType")?.value;
  const impact = document.querySelector("#crImpact")?.value;
  const reason = document.querySelector("#crReason")?.value.trim();
  const before = document.querySelector("#crBefore")?.value.trim();
  const after  = document.querySelector("#crAfter")?.value.trim();
  const scope  = document.querySelector("#crScope")?.value.trim();

  if (!title || !reason) {
    document.querySelector("#wbsCrStatus").textContent = "제목과 변경 사유는 필수입니다.";
    return;
  }

  const meta    = { ...(row.metadata||{}) };
  const crList  = [...(meta.cr_list||[])];
  const crVer   = crList.length + 1;

  // 버전 자동 증가: v1.0 → v1.1 → v1.2
  const curVer  = meta.wbs_version || 1;
  const newVer  = Math.round((curVer + 0.1) * 10) / 10;

  crList.push({
    id:          `CR-${String(crList.length+1).padStart(3,"0")}`,
    title,
    type,
    impact,
    reason,
    before,
    after,
    scope,
    requestedBy: state.currentUser?.display_name || "PMO",
    date:        new Date().toLocaleDateString("ko-KR"),
    status:      "등록",
  });

  meta.cr_list    = crList;
  meta.wbs_version = newVer;
  row.metadata    = meta;
  state.wbsPlanDirty = true;

  document.querySelector("#wbsCrDialog").close();
  state.wbsCrTargetCode = null;

  // 상세 패널이 열려있으면 CR 탭으로 전환
  if (state.wbsSelectedCode === code) {
    state.wbsDictTab = "cr";
    renderWbsDictPanel(row, meta, canMutateWork());
  }
  renderWbsPlanTable();
  showAutoSyncToast(`CR 등록 완료 — ${escapeHtml(title)} (버전 v${newVer})`, "success");
}

document.querySelector("#wbsDetailClose").addEventListener("click",  () => { saveWbsDictPartial(); document.querySelector("#wbsDetailPanel").hidden = true; state.wbsSelectedCode = null; });
document.querySelector("#wbsDetailCancelBtn").addEventListener("click", () => { document.querySelector("#wbsDetailPanel").hidden = true; state.wbsSelectedCode = null; });
document.querySelector("#wbsDetailSaveBtn").addEventListener("click", saveWbsDetailPanel);

/* 테이블 본체 이벤트 위임 */
document.querySelector("#wbsTableBody").addEventListener("click", (event) => {
  const deleteBtn   = event.target.closest("[data-wbs-delete]");
  const addChildBtn = event.target.closest("[data-wbs-add-child]");
  const toggleBtn   = event.target.closest("[data-wbs-toggle]");
  const detailBtn   = event.target.closest("[data-wbs-detail]");
  const statusBtn   = event.target.closest("[data-wbs-status]");
  const nameSpan    = event.target.closest("[data-wbs-inline-name]");
  const ownerSpan   = event.target.closest("[data-wbs-inline-owner]");

  if (detailBtn)   { openWbsDetailPanel(detailBtn.dataset.wbsDetail); return; }
  if (statusBtn)   { openStatusPopup(statusBtn.dataset.wbsStatus, statusBtn); return; }
  if (nameSpan)    { startInlineEdit(nameSpan, nameSpan.dataset.wbsInlineName, "name"); return; }
  if (ownerSpan)   { startInlineEdit(ownerSpan, ownerSpan.dataset.wbsInlineOwner, "owner"); return; }
  if (toggleBtn)   { state.wbsExpanded[toggleBtn.dataset.wbsToggle] = !isWbsExpanded(toggleBtn.dataset.wbsToggle); renderWbsPlanTable(); return; }
  if (addChildBtn && !addChildBtn.disabled) { openWbsRowDialog("add", { code:null, parent_code:addChildBtn.dataset.wbsAddChild, item_type:"작업" }); return; }
  if (deleteBtn && !deleteBtn.disabled) { deleteWbsRow(deleteBtn.dataset.wbsDelete); return; }
});

/* 기존 wbsBoardRows 이벤트 (더 이상 없으므로 dummy) */
document.querySelector("#wbsBoardRows")?.addEventListener("click", (event) => {
  const editBtn     = event.target.closest("[data-wbs-edit]");
  const deleteBtn   = event.target.closest("[data-wbs-delete]");
  const addChildBtn = event.target.closest("[data-wbs-add-child]");
  const toggleBtn   = event.target.closest("[data-wbs-toggle]");

  if (editBtn && !editBtn.disabled) {
    const row = state.wbsPlanRows.find((r) => r.code === editBtn.dataset.wbsEdit);
    if (row) openWbsRowDialog("edit", row);
    return;
  }
  if (deleteBtn && !deleteBtn.disabled) {
    deleteWbsRow(deleteBtn.dataset.wbsDelete);
    return;
  }
  if (addChildBtn && !addChildBtn.disabled) {
    // 하위 항목 추가: 부모 코드 자동 설정
    const parentCode = addChildBtn.dataset.wbsAddChild;
    openWbsRowDialog("add", { code: null, parent_code: parentCode, item_type: "작업" });
    return;
  }
  if (toggleBtn) {
    const code = toggleBtn.dataset.wbsToggle;
    state.wbsExpanded[code] = !isWbsExpanded(code);
    renderWbsPlanTable();
    return;
  }
});

/* WBS 계획 Excel 다운로드 */
document.querySelector("#wbsPlanDownloadButton").addEventListener("click", downloadWbsPlanExcel);

/* WBS 계획 Excel 업로드 */
document.querySelector("#wbsPlanExcelInput").addEventListener("change", uploadWbsPlanExcel);

/* WBS 행 추가 버튼 */
document.querySelector("#wbsAddRowButton").addEventListener("click", () => {
  openWbsRowDialog("add");
});

/* WBS 저장 버튼 */
document.querySelector("#wbsSaveButton").addEventListener("click", () => {
  saveWbsPlan();
});

/* 담당자 검증 버튼 */
document.querySelector("#wbsOwnerMapButton")?.addEventListener("click", openOwnerMapModal);
document.querySelector("#ownerMapClose")?.addEventListener("click",     () => document.querySelector("#ownerMapDialog")?.close());
document.querySelector("#ownerMapCancelBtn")?.addEventListener("click", () => document.querySelector("#ownerMapDialog")?.close());
document.querySelector("#ownerMapApplyBtn")?.addEventListener("click",  applyOwnerRemap);

/* WBS 행 다이얼로그 닫기/취소 */
document.querySelector("#wbsRowDialogClose").addEventListener("click",  closeWbsRowDialog);
document.querySelector("#wbsRowCancelButton").addEventListener("click", closeWbsRowDialog);

/* WBS 행 다이얼로그 제출 */
document.querySelector("#wbsRowForm").addEventListener("submit", (event) => {
  event.preventDefault();
  applyWbsRowForm();
});

/* WBS 계획 필터 */
document.querySelector("#wbsPlanSearch").addEventListener("input", (event) => {
  state.wbsPlanSearch = event.target.value;
  renderWbsPlanTable();
});
document.querySelector("#wbsPlanPhaseFilter").addEventListener("change", (event) => {
  state.wbsPlanPhaseFilter = event.target.value;
  renderWbsPlanTable();
});
// #wbsPlanTypeFilter는 새 프로 테이블 UI에서 제거됨

/* ── 표준 WBS 개별 다운로드 (인증 포함) ──────────── */
document.querySelector("#templateList").addEventListener("click", (event) => {
  // 미리보기 버튼
  const previewBtn = event.target.closest("[data-template-preview]");
  if (previewBtn) {
    openTemplateDrawer(previewBtn.dataset.templatePreview);
    return;
  }
  // 다운로드 버튼
  const dlBtn = event.target.closest("[data-template-download]");
  if (dlBtn) {
    const key      = dlBtn.dataset.templateDownload;
    const template = state.templates.find((t) => t.key === key);
    const filename = template ? `${template.name}.xlsx` : `${key}.xlsx`;
    if (key) authenticatedDownload(`${API_BASE}/api/templates/${encodeURIComponent(key)}/excel`, filename);
  }
});

/* ── 템플릿 드로어 이벤트 ───────────────────────── */
document.querySelector("#templateDrawerClose").addEventListener("click", closeTemplateDrawer);
document.querySelector("#templateDrawerBackdrop").addEventListener("click", closeTemplateDrawer);
document.querySelector("#templateDrawerDownload").addEventListener("click", () => {
  const key = document.querySelector("#templateDrawerDownload").dataset.templateKey;
  if (!key) return;
  const template = state.templates.find((t) => t.key === key);
  const filename  = template ? `${template.name}.xlsx` : `${key}.xlsx`;
  authenticatedDownload(`${API_BASE}/api/templates/${encodeURIComponent(key)}/excel`, filename);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#templateDrawer").hidden) {
    closeTemplateDrawer();
  }
});

/* ── 승인 이력 이벤트 (테이블 구조) ─────────────────── */
/* 기존 approvalList 이벤트는 approvalRows로 이동 */

window.addEventListener("popstate", () => applyPortalView(window.location.hash, {
  updateHistory: false,
}));

/* 가이드 메뉴 탭 클릭 */
document.querySelector("#guideMenu").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-guide-view]");
  if (!btn) return;
  state.guideSelectedView = btn.dataset.guideView;
  renderGuidePanel();
});

document.querySelector("#guideMenu").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(document.querySelectorAll("#guideMenu [role='tab']"));
  const currentIndex = tabs.indexOf(document.activeElement);
  if (!tabs.length || currentIndex < 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  const nextTab = tabs[nextIndex];
  state.guideSelectedView = nextTab.dataset.guideView;
  renderGuidePanel();
  document.querySelector(`#guideMenu [data-guide-view="${CSS.escape(state.guideSelectedView)}"]`)?.focus();
});

/* 가이드 내부 '이동' 버튼 클릭 → 해당 포털 뷰로 이동 */
document.querySelector("#guideContent").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-guide-navigate]");
  if (!btn) return;
  const targetView = btn.dataset.guideNavigate;
  if (targetView) {
    applyPortalView(`#${targetView}`, { behavior: "smooth" });
  }
});

/* ── 내부 작업 현황 이벤트 ─────────────────────── */
document.querySelector("#workboardProjectSelect")?.addEventListener("change", (event) => {
  loadWorkboardProject(event.target.value || null);
});

document.querySelector("#projectDeliveryModeSelect")?.addEventListener("change", (event) => {
  updateProjectDeliveryMode(event.target.value || "waterfall");
});

document.querySelector("#workboardRefreshBtn")?.addEventListener("click", () => {
  if (state.workboardProjectId) loadWorkboardProject(state.workboardProjectId);
});

document.querySelector("#workboardTabBar")?.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-workboard-view]");
  if (!tab) return;
  state.workboardView = tab.dataset.workboardView;
  renderWorkboardPanel();
});

document.querySelector("#workboardTabBar")?.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(document.querySelectorAll("#workboardTabBar [role='tab']"));
  const currentIndex = tabs.indexOf(document.activeElement);
  if (!tabs.length || currentIndex < 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  const next = tabs[nextIndex];
  state.workboardView = next.dataset.workboardView;
  renderWorkboardPanel();
  next.focus();
});

document.querySelector("#workboardBody")?.addEventListener("click", async (event) => {
  const addSprint = event.target.closest("[data-agile-add-sprint]");
  if (addSprint) {
    createAgileSprint();
    return;
  }
  const addItem = event.target.closest("[data-agile-add-item]");
  if (addItem) {
    createAgileItem();
    return;
  }
  const syncBtn = event.target.closest("#agileWbsSyncBtn");
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.textContent = "동기화 중…";
    const result = await syncAgileFromWbs(state.workboardProjectId);
    state.workboardStatusMessage = result
      ? `WBS 동기화 완료 (생성 ${result.created} 갱신 ${result.updated})`
      : "동기화 실패";
    await loadAgileProject(state.workboardProjectId, { render: false });
    renderWorkboardPanel();
    return;
  }
  const taskBtn = event.target.closest("[data-workboard-task]");
  if (!taskBtn) return;
  openWorkboardTask(taskBtn.dataset.workboardTask);
});

document.querySelector("#workboardBody")?.addEventListener("change", (event) => {
  if (event.target?.matches?.("#agileSprintStart")) {
    const endInput = document.querySelector("#agileSprintEnd");
    if (endInput && sprintPolicyDays(projectOperationPolicy())) {
      endInput.value = defaultSprintEndDate(event.target.value, projectOperationPolicy());
    }
    return;
  }
  if (event.target?.id === "agileBoardSprintSelect") {
    state.agileSelectedSprintId = event.target.value || "";
    renderWorkboardPanel();
    return;
  }
  const itemField = event.target.closest("[data-agile-item-field]");
  if (itemField) {
    updateAgileItemField(itemField.dataset.agileItemId, itemField.dataset.agileItemField, itemField.value);
    return;
  }
  const sprintField = event.target.closest("[data-agile-sprint-field]");
  if (sprintField) {
    updateAgileSprintField(sprintField.dataset.agileSprintId, sprintField.dataset.agileSprintField, sprintField.value);
  }
});

document.querySelector("#workboardBody")?.addEventListener("dragstart", (event) => {
  const agileCard = event.target.closest(".agile-card[data-agile-card]");
  if (agileCard) {
    if (!canMutateWork()) {
      event.preventDefault();
      return;
    }
    state.agileDragKey = agileCard.dataset.agileCard;
    agileCard.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.agileDragKey);
    return;
  }
  const card = event.target.closest(".workboard-card[data-workboard-task]");
  if (!card) return;
  const row = allWorkboardRows().find((item) => workboardTaskKey(item) === card.dataset.workboardTask);
  if (!row || !canEditWorkboardTask(row)) {
    event.preventDefault();
    return;
  }
  state.workboardDragKey = card.dataset.workboardTask;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.workboardDragKey);
});

document.querySelector("#workboardBody")?.addEventListener("dragover", (event) => {
  const agileColumn = event.target.closest("[data-agile-drop-status]");
  if (agileColumn && state.agileDragKey) {
    event.preventDefault();
    agileColumn.classList.add("is-drop-target");
    event.dataTransfer.dropEffect = "move";
    return;
  }
  const column = event.target.closest("[data-workboard-drop-status]");
  if (!column || !state.workboardDragKey) return;
  event.preventDefault();
  column.classList.add("is-drop-target");
  event.dataTransfer.dropEffect = "move";
});

document.querySelector("#workboardBody")?.addEventListener("dragleave", (event) => {
  const agileColumn = event.target.closest("[data-agile-drop-status]");
  if (agileColumn && !agileColumn.contains(event.relatedTarget)) agileColumn.classList.remove("is-drop-target");
  const column = event.target.closest("[data-workboard-drop-status]");
  if (column && !column.contains(event.relatedTarget)) column.classList.remove("is-drop-target");
});

document.querySelector("#workboardBody")?.addEventListener("drop", async (event) => {
  const agileColumn = event.target.closest("[data-agile-drop-status]");
  const agileKey = state.agileDragKey || event.dataTransfer.getData("text/plain");
  if (agileColumn && agileKey) {
    event.preventDefault();
    document.querySelectorAll(".agile-board-column.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    state.agileDragKey = null;
    await updateAgileItemField(agileKey, "status", agileColumn.dataset.agileDropStatus);
    return;
  }
  const column = event.target.closest("[data-workboard-drop-status]");
  const key = state.workboardDragKey || event.dataTransfer.getData("text/plain");
  if (!column || !key) return;
  event.preventDefault();
  document.querySelectorAll(".workboard-board-column.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  state.workboardDragKey = null;
  await quickUpdateWorkboardTask(key, { status: column.dataset.workboardDropStatus });
});

document.querySelector("#workboardBody")?.addEventListener("dragend", () => {
  state.workboardDragKey = null;
  state.agileDragKey = null;
  document.querySelectorAll(".workboard-card.is-dragging, .workboard-board-column.is-drop-target").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
  document.querySelectorAll(".agile-card.is-dragging, .agile-board-column.is-drop-target").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
});

document.querySelector("#workTaskCloseBtn")?.addEventListener("click", closeWorkboardDrawer);
document.querySelector("#workTaskCancelBtn")?.addEventListener("click", closeWorkboardDrawer);
document.querySelector("#workboardDrawerBackdrop")?.addEventListener("click", closeWorkboardDrawer);
document.querySelector("#workTaskSaveBtn")?.addEventListener("click", saveWorkboardTaskUpdate);
document.querySelector("#workboardDrawer")?.addEventListener("input", (event) => {
  if (event.target?.id === "workTaskProgress") {
    const label = document.querySelector("#workTaskProgressLabel");
    if (label) label.textContent = `진척률 ${event.target.value}%`;
  }
});

/* ── 프로젝트 동기화 뷰 이벤트 ──────────────────── */
document.querySelector("#opViewProjectSelect").addEventListener("change", (event) => {
  const pid = event.target.value;
  if (pid !== state.opViewProjectId) loadOpViewProject(pid || null);
});

document.querySelector("#opViewRefreshBtn").addEventListener("click", () => {
  if (state.opViewProjectId) loadOpViewProject(state.opViewProjectId);
});

document.querySelector("#opViewTabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-op-tab]");
  if (tab) switchOpViewTab(tab.dataset.opTab);
});

document.querySelector("#opWpSearch").addEventListener("input", (event) => {
  state.opViewSearch = event.target.value;
  renderOpViewPanels();
});

document.querySelector("#opWpTypeFilter").addEventListener("change", (event) => {
  state.opViewTypeFilter = event.target.value;
  renderOpViewPanels();
});

/* WBS 현황 상태 칩 + 접기/펼치기 */
document.querySelector("#opStatusChips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-op-chip]");
  if (!chip) return;
  state.opViewStatusFilter = chip.dataset.opChip;
  document.querySelectorAll("#opStatusChips .wbs-chip").forEach((c) =>
    c.classList.toggle("active", c.dataset.opChip === state.opViewStatusFilter));
  renderOpViewPanels();
});

/* WBS 현황 테이블 접기/펼치기 (▾/▸) */
document.querySelector("#opWpList").addEventListener("click", (event) => {
  const toggleBtn = event.target.closest("[data-op-toggle]");
  if (toggleBtn) {
    const code = toggleBtn.dataset.opToggle;
    state.wbsExpanded[code] = !isWbsExpanded(code);
    renderOpViewPanels();
  }
});

/* ── 표준 WBS 탭 전환 ──────────────────────────── */
/* ── 표준 WBS 패널 탭 전환 + 일반 WBS 버튼 ─────── */
document.querySelector("#templates").addEventListener("click", (event) => {
  // 탭 전환
  const tab = event.target.closest("[data-tpl-tab]");
  if (tab) {
    const tabId = tab.dataset.tplTab;
    document.querySelectorAll(".tpl-tab").forEach((btn) => {
      const isActive = btn.dataset.tplTab === tabId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.querySelector("#templates").dataset.activeTab = tabId;
    document.getElementById("tplTabList").hidden   = tabId !== "list";
    document.getElementById("tplTabImport").hidden = tabId !== "import";
    return;
  }

  // 목록 탭 안의 표준 / 일반 WBS 전환
  const listTab = event.target.closest("[data-wbs-list-tab]");
  if (listTab) {
    setWbsListTab(listTab.dataset.wbsListTab);
    return;
  }

  // 일반 WBS 목록 — 미리보기
  const previewBtn = event.target.closest("[data-custom-wbs-preview]");
  if (previewBtn && !previewBtn.disabled) {
    openProjectWbsPreview(previewBtn.dataset.customWbsPreview);
    return;
  }

  // 일반 WBS 목록 — Excel 업로드 탭 이동
  const uploadBtn = event.target.closest("[data-custom-wbs-upload]");
  if (uploadBtn && !uploadBtn.disabled) {
    openCustomWbsUploadTab(uploadBtn.dataset.customWbsUpload);
    return;
  }

  // Excel 업로드 탭 — WBS 유형 토글
  const typeBtn = event.target.closest("[data-import-type]");
  if (typeBtn) {
    setImportType(typeBtn.dataset.importType);
    return;
  }
});

/* 일반 WBS 탭 — 프로젝트 셀렉트 변경 시 반영 버튼 갱신 */
document.querySelector("#importProjectSelect").addEventListener("change", () => {
  renderApplyButton();
});

/* 반영 버튼 — 유형에 따라 분기 */
document.querySelector("#applyImportButton").addEventListener("click", applyImportPreview);

/* CR 다이얼로그 이벤트 */
document.querySelector("#wbsCrClose").addEventListener("click",    () => document.querySelector("#wbsCrDialog").close());
document.querySelector("#wbsCrCancelBtn").addEventListener("click", () => document.querySelector("#wbsCrDialog").close());
document.querySelector("#wbsCrForm").addEventListener("submit", (e) => { e.preventDefault(); applyWbsCrForm(); });

/* WBS 테이블에서 CR 버튼 클릭 */
document.querySelector("#wbsTableBody").addEventListener("click", (e2) => {
  const crBtn = e2.target.closest("[data-wbs-cr]");
  if (crBtn && !crBtn.disabled) openWbsCrDialog(crBtn.dataset.wbsCr);
}, true);  // capture phase로 등록해 기존 리스너보다 먼저 실행

/* ── 날짜 피커 인라인 편집 이벤트 ── */
document.querySelector("#wbsTableBody").addEventListener("change", (event) => {
  const startInput = event.target.closest("[data-wbs-date-start]");
  const endInput   = event.target.closest("[data-wbs-date-end]");
  if (startInput) {
    const row = state.wbsPlanRows.find((r) => r.code === startInput.dataset.wbsDateStart);
    if (row) { row.start_date = startInput.value || null; state.wbsPlanDirty = true; renderWbsPlanTable(); }
  }
  if (endInput) {
    const row = state.wbsPlanRows.find((r) => r.code === endInput.dataset.wbsDateEnd);
    if (row) { row.finish_date = endInput.value || null; state.wbsPlanDirty = true; renderWbsPlanTable(); }
  }
});

/* ══════════════════════════════════════════════════════
   Phase 1 잔여 기능 구현
══════════════════════════════════════════════════════ */

/* ── 3. Depth 설정 ──────────────────────────────── */
function getWbsMaxDepth() { return Number(state.wbsMaxDepth ?? 10); }

/* ── 4. Rich Text 편집기 헬퍼 ───────────────────── */
function createRichTextEditor(id, initialHtml, { placeholder = "내용을 입력하세요…" } = {}) {
  return `
    <div class="rt-toolbar" id="${id}Toolbar">
      <button class="rt-btn" type="button" data-rt-cmd="bold"        title="굵게 (Ctrl+B)"><b>B</b></button>
      <button class="rt-btn" type="button" data-rt-cmd="italic"      title="기울임 (Ctrl+I)"><i>I</i></button>
      <button class="rt-btn" type="button" data-rt-cmd="underline"   title="밑줄 (Ctrl+U)"><u>U</u></button>
      <button class="rt-btn" type="button" data-rt-cmd="insertUnorderedList" title="목록">• —</button>
      <button class="rt-btn" type="button" data-rt-cmd="insertOrderedList"   title="번호 목록">1.</button>
      <button class="rt-btn" type="button" data-rt-cmd="formatBlock:h3"      title="제목">H</button>
    </div>
    <div class="rt-editor" id="${id}" contenteditable="true" data-placeholder="${escapeHtml(placeholder)}">${initialHtml||""}</div>`;
}

function bindRichTextEditor(toolbarId) {
  const toolbar = document.querySelector(`#${toolbarId}`);
  if (!toolbar) return;
  toolbar.querySelectorAll("[data-rt-cmd]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const [cmd, val] = btn.dataset.rtCmd.split(":");
      document.execCommand(cmd, false, val || undefined);
      btn.classList.toggle("active", document.queryCommandState(cmd));
    });
  });
  const editor = toolbar.nextElementSibling;
  if (editor) {
    editor.addEventListener("keyup", () => {
      toolbar.querySelectorAll("[data-rt-cmd]").forEach((btn) => {
        const [cmd] = btn.dataset.rtCmd.split(":");
        btn.classList.toggle("active", document.queryCommandState(cmd));
      });
    });
  }
}

/* ── 5. CR 승인 워크플로우 ──────────────────────── */
function approveCrItem(code, crId, action) {
  const row = state.wbsPlanRows.find((r) => r.code === code);
  if (!row) return;
  const meta   = row.metadata || {};
  const crList = Array.isArray(meta.cr_list) ? [...meta.cr_list] : [];
  const idx    = crList.findIndex((c) => c.id === crId);
  if (idx < 0) return;

  let comment = "";
  if (action === "reject") {
    comment = window.prompt("CR 반려 사유를 입력하세요 (필수):", "");
    if (!comment?.trim()) { alert("반려 사유는 필수입니다."); return; }
  }

  crList[idx].status     = action === "approve" ? "승인" : "반려";
  crList[idx].decidedBy  = state.currentUser?.display_name || "PMO";
  crList[idx].decidedAt  = new Date().toLocaleDateString("ko-KR");
  if (comment) crList[idx].rejectComment = comment;

  // 승인 시 버전 자동 증가 (패치)
  if (action === "approve") {
    const curVer = meta.wbs_version || 1;
    meta.wbs_version = Math.round((curVer + 0.1) * 10) / 10;
    showAutoSyncToast(`CR 승인 완료 — 버전 v${meta.wbs_version}로 갱신`, "success");
  }

  meta.cr_list = crList;
  row.metadata = meta;
  state.wbsPlanDirty = true;

  if (state.wbsSelectedCode === code) {
    state.wbsDictTab = "cr";
    renderWbsDictPanel(row, meta, canMutateWork());
  }
  renderWbsPlanTable();
}

/* ── 6. 업무 부하 가시화 ─────────────────────────── */
function renderWorkloadPanel(containerEl) {
  if (!containerEl) return;
  const rows    = state.wbsPlanRows;
  const persons = {};

  rows.forEach((r) => {
    const owner = r.owner || "미배정";
    if (!persons[owner]) persons[owner] = { tasks: 0, weight: 0, hours: 0 };
    persons[owner].tasks++;
    persons[owner].weight += r.weight ?? 0;
    const effortStr = (r.metadata?.effort || "").replace(/h|시간/gi, "");
    const effort    = parseFloat(effortStr) || 0;
    persons[owner].hours += effort;
  });

  const maxWeight = Math.max(...Object.values(persons).map((p) => p.weight), 1);

  const html = Object.entries(persons)
    .sort((a, b) => b[1].weight - a[1].weight)
    .map(([name, data]) => {
      const pct    = (data.weight / maxWeight * 100).toFixed(1);
      const cls    = data.weight > 50 ? "over" : data.weight > 30 ? "warn" : "ok";
      return `
        <div class="workload-row">
          <span class="workload-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <div class="workload-bar-wrap">
            <div class="workload-bar-fill ${cls}" style="width:${pct}%"></div>
          </div>
          <span class="workload-tasks">${data.tasks}건</span>
          <span class="workload-hours">${data.hours > 0 ? data.hours+"h" : "-"}</span>
        </div>`;
    }).join("") || `<p style="color:var(--text-muted);font-size:0.8rem">담당자 배정 없음</p>`;

  containerEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-bottom:6px">
      <span>담당자</span><span>바 = 가중치 합 / 건수 / 공수</span>
    </div>
    <div class="workload-section">${html}</div>`;
}

/* ── 8. 승인 이력 타임라인 ──────────────────────── */
function renderApprovalTimeline(container) {
  if (!container) return;
  const approvals = state.approvals;

  if (!approvals.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.84rem;padding:8px">승인 이력 없음</p>`;
    return;
  }

  const statusMap = {
    "Pending":  { cls: "pending",  icon: "⏳", label: "검토 대기" },
    "Approved": { cls: "approved", icon: "✓",  label: "승인 완료" },
    "Rejected": { cls: "rejected", icon: "✗",  label: "반려" },
  };

  const items = approvals.slice().reverse().map((a) => {
    const s   = statusMap[a.status] || { cls: "draft", icon: "◦", label: a.status };
    const dt  = a.decided_at ? formatTimestamp(a.decided_at) : (a.created_at ? formatTimestamp(a.created_at) : "-");
    return `
      <div class="approval-timeline-item">
        <div class="approval-tl-dot ${s.cls}" title="${s.label}">${s.icon}</div>
        <div class="approval-tl-content">
          <div class="approval-tl-title">${escapeHtml(a.project_name||"-")} — ${escapeHtml(a.title||"-")}</div>
          <div class="approval-tl-meta">${s.label} · ${escapeHtml(a.requester||"-")} → ${escapeHtml(a.reviewer||"-")} · ${escapeHtml(dt)}</div>
          ${a.decision_comment ? `<div class="approval-tl-comment">"${escapeHtml(a.decision_comment)}"</div>` : ""}
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="approval-timeline-wrap">
      <div class="approval-timeline-line"></div>
      ${items}
    </div>`;
}

/* ── 9. 멀티레벨 승인 (PM → PMO) ─────────────────── */
const APPROVAL_LEVELS = { 1: "PMO 단일 승인", 2: "PM → PMO 2단계 승인" };

function renderApprovalLevelBadge(project) {
  const level = project?.metadata?.approval_level ?? 1;
  return `<span class="approval-level-badge">L${level}: ${escapeHtml(APPROVAL_LEVELS[level]||"단일")}</span>`;
}

/* ── 10. PDF 보고서 (CSS 인쇄) ────────────────────── */
function printWbsReport() {
  const project = state.projects.find((p) => p.id === state.wbsPlanProjectId);
  const name    = project?.name || "WBS 보고서";
  const origTitle = document.title;
  document.title  = name;
  window.print();
  document.title  = origTitle;
}

/* ── 11. Word(.docx) 출력 ─────────────────────────── */
async function exportWbsDocx() {
  if (!state.wbsPlanProjectId) { alert("프로젝트를 먼저 선택하세요."); return; }
  const statusEl = document.querySelector("#wbsPlanStatus");
  if (statusEl) statusEl.textContent = "Word 문서 생성 중…";
  try {
  const result = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(state.wbsPlanProjectId)}/wbs-docx`, {
    headers: authHeaders(),
  });
    if (!result.ok) throw new Error(`${result.status} ${result.statusText}`);
    const blob     = await result.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    const project  = state.projects.find((p) => p.id === state.wbsPlanProjectId);
    a.href         = url;
    a.download     = `${project?.name || "WBS"}_사전.docx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (statusEl) statusEl.textContent = "Word 문서 다운로드 완료";
  } catch (e) {
    if (statusEl) statusEl.textContent = `Word 출력 실패: ${e.message}`;
  }
}

/* ── 12. @멘션 시스템 ────────────────────────────── */
let mentionPopupState = { active: false, query: "", start: 0, textareaEl: null };

function setupMentionSystem(textareaEl) {
  if (!textareaEl) return;
  textareaEl.addEventListener("input", (e) => {
    const val    = textareaEl.value;
    const cursor = textareaEl.selectionStart;
    const atPos  = val.lastIndexOf("@", cursor - 1);
    if (atPos >= 0 && cursor - atPos <= 20) {
      const query = val.slice(atPos + 1, cursor).toLowerCase();
      mentionPopupState = { active: true, query, start: atPos, textareaEl };
      showMentionPopup(textareaEl, query);
    } else {
      hideMentionPopup();
    }
  });
  textareaEl.addEventListener("keydown", (e) => {
    if (!mentionPopupState.active) return;
    const popup = document.querySelector(".mention-popup");
    if (!popup) return;
    const items = popup.querySelectorAll(".mention-item");
    let activeIdx = [...items].findIndex((el) => el.classList.contains("active"));
    if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(activeIdx + 1, items.length - 1)]?.classList.add("active"); items[activeIdx]?.classList.remove("active"); }
    if (e.key === "ArrowUp")   { e.preventDefault(); items[Math.max(activeIdx - 1, 0)]?.classList.add("active"); items[activeIdx]?.classList.remove("active"); }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); const active = popup.querySelector(".mention-item.active") || popup.querySelector(".mention-item"); if (active) active.click(); }
    if (e.key === "Escape") hideMentionPopup();
  });
}

function showMentionPopup(anchor, query) {
  hideMentionPopup();
  const users = state.users.filter((u) =>
    u.display_name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query)
  ).slice(0, 8);
  if (!users.length) return;

  const popup = document.createElement("div");
  popup.className = "mention-popup";
  const rect = anchor.getBoundingClientRect();
  popup.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;

  users.forEach((u, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `mention-item${i === 0 ? " active" : ""}`;
    item.innerHTML = `<span class="owner-avatar">${(u.display_name[0]||"?").toUpperCase()}</span>${escapeHtml(u.display_name)} <span style="color:var(--text-muted);font-size:0.68rem">${escapeHtml(u.email||"")}</span>`;
    item.addEventListener("click", () => insertMention(u.display_name));
    popup.appendChild(item);
  });

  document.body.appendChild(popup);
  mentionPopupState.active = true;
  setTimeout(() => document.addEventListener("click", hideMentionPopup, { once: true }), 0);
}

function hideMentionPopup() {
  document.querySelector(".mention-popup")?.remove();
  mentionPopupState.active = false;
}

function insertMention(name) {
  const el  = mentionPopupState.textareaEl;
  if (!el) return;
  const val  = el.value;
  const atPos = mentionPopupState.start;
  const after = val.indexOf(" ", atPos) > -1 ? val.indexOf(" ", atPos) : val.length;
  el.value   = val.slice(0, atPos) + `@${name} ` + val.slice(after);
  el.focus();
  hideMentionPopup();
}

/* ── 13. 편집 잠금(Lock) ─────────────────────────── */
const editLocks = {};  // code → {user, since}

function acquireEditLock(code) {
  const user = state.currentUser?.display_name || "PMO";
  if (editLocks[code] && editLocks[code].user !== user) {
    const since = editLocks[code].since;
    const elapsed = Math.floor((Date.now() - since) / 1000);
    if (elapsed < 300) {  // 5분 미만이면 잠금 유지
      return { locked: true, lockedBy: editLocks[code].user, elapsed };
    }
  }
  editLocks[code] = { user, since: Date.now() };
  return { locked: false };
}

function releaseEditLock(code) {
  const user = state.currentUser?.display_name || "PMO";
  if (editLocks[code]?.user === user) delete editLocks[code];
}

/* ── P2-04: 알림 시스템 ─────────────────────────────────────────────── */

let notifPollTimer = null;

function renderNotifBell() {
  const wrap    = document.querySelector("#notifWrap");
  const badge   = document.querySelector("#notifBadge");
  const list    = document.querySelector("#notifList");
  if (!wrap) return;

  if (!state.currentUser) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const notifs  = state.notifications || [];
  const unread  = notifs.filter((n) => !n.is_read);

  if (badge) {
    badge.hidden = unread.length === 0;
    badge.textContent = unread.length > 9 ? "9+" : String(unread.length);
  }

  if (!list) return;
  list.innerHTML = notifs.length
    ? notifs.slice(0, 20).map((n) => {
        const ago = formatTimeAgo(n.created_at);
        return `
          <div class="notif-item ${n.is_read ? "" : "unread"}" data-notif-id="${escapeHtml(n.id)}">
            <div class="notif-item-title">${escapeHtml(n.title)}</div>
            ${n.body ? `<div class="notif-item-body">${escapeHtml(n.body)}</div>` : ""}
            <div class="notif-item-time">${escapeHtml(ago)}</div>
          </div>`;
      }).join("")
    : `<div class="notif-empty">새 알림이 없습니다.</div>`;
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

async function loadNotifications() {
  try {
    state.notifications = await request("/api/notifications?limit=30");
    renderNotifBell();
  } catch (_) {}
}

function startNotifPolling() {
  if (notifPollTimer) return;
  notifPollTimer = setInterval(() => {
    if (state.currentUser) loadNotifications();
  }, 30000);
}

// 벨 버튼 클릭 — 드롭다운 열기/닫기
document.querySelector("#notifBellBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const dropdown = document.querySelector("#notifDropdown");
  const btn      = document.querySelector("#notifBellBtn");
  if (!dropdown) return;
  const isOpen = !dropdown.hidden;
  dropdown.hidden = isOpen;
  btn.setAttribute("aria-expanded", String(!isOpen));
  if (!isOpen) loadNotifications();
});

// 드롭다운 외부 클릭 시 닫기
document.addEventListener("click", (e) => {
  const wrap = document.querySelector("#notifWrap");
  if (wrap && !wrap.contains(e.target)) {
    const dropdown = document.querySelector("#notifDropdown");
    if (dropdown) dropdown.hidden = true;
  }
});

// 알림 항목 클릭 → 읽음 처리
document.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-notif-id]");
  if (!item) return;
  const nid = item.dataset.notifId;
  try {
    await request(`/api/notifications/${encodeURIComponent(nid)}/read`, { method: "POST" });
    state.notifications = (state.notifications || []).map((n) =>
      n.id === nid ? { ...n, is_read: true } : n
    );
    renderNotifBell();
  } catch (_) {}
});

// 모두 읽음
document.querySelector("#notifReadAll")?.addEventListener("click", async () => {
  try {
    await request("/api/notifications/read-all", { method: "POST" });
    state.notifications = (state.notifications || []).map((n) => ({ ...n, is_read: true }));
    renderNotifBell();
  } catch (_) {}
});

/* 드래그 앤 드롭 초기화 */
initWbsDragDrop();

restoreSession();

/* ── P2-02: 리스크·이슈 트래킹 ─────────────────────────────────── */

function renderRisksPanel() {
  if (document.body.dataset.portalView !== "risks") return;
  renderRiProjectFilter();
  renderRiStatusFilter();
  renderRiOwnerFilter();
  renderRiTable();
}

function renderRiProjectFilter() {
  const sel = document.querySelector("#riProjectFilter");
  if (!sel) return;
  const current = sel.value || state.riProjectFilter;
  const opts = state.projects.map((p) =>
    `<option value="${escapeHtml(p.id)}" ${p.id === current ? "selected" : ""}>${escapeHtml(p.name)}</option>`
  ).join("");
  sel.innerHTML = `<option value="">전체 프로젝트</option>${opts}`;
}

function renderRiStatusFilter() {
  const sel = document.querySelector("#riStatusFilter");
  if (!sel) return;
  const isRisks = state.riTab === "risks";
  const statuses = isRisks
    ? ["Open", "Mitigated", "Closed"]
    : ["Open", "In Progress", "Resolved", "Closed"];
  const validStatus = state.riStatusFilter === RI_OPEN_STATUS_FILTER || statuses.includes(state.riStatusFilter);
  if (!validStatus) state.riStatusFilter = "";
  sel.innerHTML = `<option value="">전체 상태</option><option value="${RI_OPEN_STATUS_FILTER}" ${state.riStatusFilter === RI_OPEN_STATUS_FILTER ? "selected" : ""}>미종료 전체</option>${
    statuses.map((s) => `<option value="${s}" ${s === state.riStatusFilter ? "selected" : ""}>${s}</option>`).join("")
  }`;
}

function riOwnerValue(row) {
  return state.riTab === "risks" ? row.owner : row.assignee;
}

function renderRiOwnerFilter() {
  const sel = document.querySelector("#riOwnerFilter");
  if (!sel) return;
  const source = state.riTab === "risks" ? state.risks : state.issues;
  const owners = [...new Set(source.map((row) => riOwnerValue(row)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));
  const current = owners.includes(state.riOwnerFilter) ? state.riOwnerFilter : "";
  if (state.riOwnerFilter !== current) state.riOwnerFilter = current;
  sel.innerHTML = [
    `<option value="">담당자 전체</option>`,
    ...owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`),
  ].join("");
  sel.value = current;
}

function riSeverityLabel(v) {
  return `<span class="ri-sev-${v}">${v}</span>`;
}
function riStatusPill(s) {
  return `<span class="ri-status-pill ri-status-${CSS.escape(s)}">${escapeHtml(s)}</span>`;
}

function riStatusMatches(row) {
  if (!state.riStatusFilter) return true;
  if (state.riStatusFilter === RI_OPEN_STATUS_FILTER) return isOpenRiStatus(row.status);
  return row.status === state.riStatusFilter;
}

function filteredRiRows(tab = state.riTab) {
  const pid = state.riProjectFilter;
  const owner = state.riOwnerFilter;
  const rows = tab === "risks" ? state.risks : state.issues;
  return rows.filter((row) =>
    (!pid || row.project_id === pid) &&
    riStatusMatches(row) &&
    (!owner || (tab === "risks" ? row.owner === owner : row.assignee === owner))
  ).sort((a, b) => compareTableValues(a[state.riSortKey], b[state.riSortKey], state.riSortDir));
}

function riProjectName(projectId) {
  return state.projects.find((project) => project.id === projectId)?.name || "";
}

function closeRiDetailDrawer() {
  const drawer = document.querySelector("#riDetailDrawer");
  if (drawer) drawer.hidden = true;
}

function renderRiDetailDrawer(type, id) {
  const isRisk = type === "risk";
  const item = isRisk
    ? state.risks.find((row) => row.id === id)
    : state.issues.find((row) => row.id === id);
  if (!item) return;
  state.riDetail = { type, id };
  const drawer = document.querySelector("#riDetailDrawer");
  const eyebrow = document.querySelector("#riDetailEyebrow");
  const title = document.querySelector("#riDetailTitle");
  const body = document.querySelector("#riDetailBody");
  if (!drawer || !eyebrow || !title || !body) return;

  const ownerLabel = isRisk ? "담당자" : "담당자";
  const owner = isRisk ? item.owner : item.assignee;
  const severityRows = isRisk
    ? `
      <div class="ri-detail-stat"><span>심각도</span><strong class="ri-sev-${escapeHtml(item.severity)}">${escapeHtml(item.severity || "-")}</strong></div>
      <div class="ri-detail-stat"><span>발생 가능성</span><strong class="ri-sev-${escapeHtml(item.likelihood)}">${escapeHtml(item.likelihood || "-")}</strong></div>`
    : `<div class="ri-detail-stat"><span>우선순위</span><strong class="ri-sev-${escapeHtml(item.priority)}">${escapeHtml(item.priority || "-")}</strong></div>`;
  eyebrow.textContent = isRisk ? "리스크 상세" : "이슈 상세";
  title.textContent = item.title || "-";
  body.innerHTML = `
    <div class="ri-detail-summary">
      ${severityRows}
      <div class="ri-detail-stat"><span>상태</span>${riStatusPill(item.status || "-")}</div>
      <div class="ri-detail-stat"><span>목표일</span><strong>${escapeHtml(item.due_date || "-")}</strong></div>
    </div>
    <dl class="ri-detail-list">
      <dt>프로젝트</dt><dd>${escapeHtml(item.project_name || riProjectName(item.project_id) || "-")}</dd>
      <dt>${ownerLabel}</dt><dd>${escapeHtml(owner || "-")}</dd>
      <dt>WBS 코드</dt><dd>${escapeHtml(item.wbs_code || "-")}</dd>
      <dt>등록일</dt><dd>${escapeHtml(formatTimestamp(item.created_at))}</dd>
      <dt>수정일</dt><dd>${escapeHtml(formatTimestamp(item.updated_at))}</dd>
    </dl>
    <section class="ri-detail-section">
      <h3>설명</h3>
      <p>${escapeHtml(item.description || "등록된 설명이 없습니다.")}</p>
    </section>
    ${isRisk ? `
      <section class="ri-detail-section">
        <h3>대응 전략</h3>
        <p>${escapeHtml(item.mitigation || "등록된 대응 전략이 없습니다.")}</p>
      </section>` : ""}
    <div class="ri-detail-actions">
      <button class="secondary-button" type="button" data-ri-detail-go-project="${escapeHtml(item.project_id || "")}">프로젝트 현황</button>
      ${canMutateWork() && isRisk && item.status !== "Closed" ? `<button class="primary-button" type="button" data-risk-close="${escapeHtml(item.id)}">리스크 종료</button>` : ""}
      ${canMutateWork() && !isRisk && !["Resolved", "Closed"].includes(item.status) ? `<button class="primary-button" type="button" data-issue-resolve="${escapeHtml(item.id)}">이슈 해결</button>` : ""}
    </div>`;
  drawer.hidden = false;
}

function renderRiTable() {
  const isRisks = state.riTab === "risks";
  const riTabRisks = document.querySelector("#riTabRisks");
  const riTabIssues = document.querySelector("#riTabIssues");
  if (riTabRisks) riTabRisks.hidden = !isRisks;
  if (riTabIssues) riTabIssues.hidden = isRisks;

  // 탭 버튼 active
  document.querySelectorAll(".ri-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.riTab === state.riTab);
  });

  // + 버튼 토글
  const createRiskBtn = document.querySelector("#createRiskBtn");
  const createIssueBtn = document.querySelector("#createIssueBtn");
  if (createRiskBtn) createRiskBtn.style.display = isRisks ? "" : "none";
  if (createIssueBtn) createIssueBtn.style.display = isRisks ? "none" : "";

  updateSortButtons("[data-ri-sort]", state.riSortKey, state.riSortDir);

  if (isRisks) {
    const rows = filteredRiRows("risks");
    const count = document.querySelector("#riCount");
    if (count) count.textContent = `${rows.length}건`;
    const tbody = document.querySelector("#riskTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((r) => `
      <tr class="ri-click-row" data-ri-item-type="risk" data-ri-item-id="${escapeHtml(r.id)}" tabindex="0">
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.project_name || "")}</td>
        <td style="max-width:200px">${escapeHtml(r.title)}</td>
        <td>${riSeverityLabel(r.severity)}</td>
        <td>${riSeverityLabel(r.likelihood)}</td>
        <td>${escapeHtml(r.owner || "")}</td>
        <td>${riStatusPill(r.status)}</td>
        <td style="white-space:nowrap">${r.due_date || "—"}</td>
        <td>
          <button class="wbs-pro-btn-sm" data-ri-detail="risk" data-ri-id="${escapeHtml(r.id)}" type="button">상세</button>
          ${canMutateWork() ? `<button class="wbs-pro-btn-sm" data-risk-close="${escapeHtml(r.id)}" type="button" ${r.status === "Closed" ? "disabled" : ""}>종료</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">등록된 리스크가 없습니다.</td></tr>`;
  } else {
    const rows = filteredRiRows("issues");
    const count = document.querySelector("#riCount");
    if (count) count.textContent = `${rows.length}건`;
    const tbody = document.querySelector("#issueTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((r) => `
      <tr class="ri-click-row" data-ri-item-type="issue" data-ri-item-id="${escapeHtml(r.id)}" tabindex="0">
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.project_name || "")}</td>
        <td style="max-width:200px">${escapeHtml(r.title)}</td>
        <td>${riSeverityLabel(r.priority)}</td>
        <td>${escapeHtml(r.assignee || "")}</td>
        <td>${riStatusPill(r.status)}</td>
        <td style="white-space:nowrap">${r.due_date || "—"}</td>
        <td>
          <button class="wbs-pro-btn-sm" data-ri-detail="issue" data-ri-id="${escapeHtml(r.id)}" type="button">상세</button>
          ${canMutateWork() ? `<button class="wbs-pro-btn-sm" data-issue-resolve="${escapeHtml(r.id)}" type="button" ${["Resolved","Closed"].includes(r.status) ? "disabled" : ""}>해결</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">등록된 이슈가 없습니다.</td></tr>`;
  }
}

// 탭 전환
document.addEventListener("click", (e) => {
  const riNavigateBtn = e.target.closest("[data-ri-navigate]");
  if (riNavigateBtn) {
    e.preventDefault();
    navigateToRiList({
      tab: riNavigateBtn.dataset.riNavigate,
      projectId: riNavigateBtn.dataset.riProjectId || "",
      status: riNavigateBtn.dataset.riStatus || RI_OPEN_STATUS_FILTER,
    });
    return;
  }

  const riDetailBtn = e.target.closest("[data-ri-detail]");
  if (riDetailBtn) {
    renderRiDetailDrawer(riDetailBtn.dataset.riDetail, riDetailBtn.dataset.riId);
    return;
  }

  const riRow = e.target.closest("tr[data-ri-item-id]");
  if (riRow && !e.target.closest("button,a,input,select,textarea")) {
    renderRiDetailDrawer(riRow.dataset.riItemType, riRow.dataset.riItemId);
    return;
  }

  const riProjectBtn = e.target.closest("[data-ri-detail-go-project]");
  if (riProjectBtn) {
    const pid = riProjectBtn.dataset.riDetailGoProject;
    closeRiDetailDrawer();
    state.portfolioFilter = "all";
    state.portfolioOwnerFilter = "";
    renderProjects();
    applyPortalView("#portfolio", { behavior: "smooth" });
    if (pid) openProjectDrawer(pid);
    return;
  }

  const tabBtn = e.target.closest(".ri-tab");
  if (tabBtn && tabBtn.dataset.riTab) {
    state.riTab = tabBtn.dataset.riTab;
    state.riStatusFilter = "";
    state.riOwnerFilter = "";
    state.riSortKey = state.riTab === "risks" ? "due_date" : "due_date";
    state.riSortDir = "asc";
    renderRiStatusFilter();
    renderRiOwnerFilter();
    renderRiTable();
    closeRiDetailDrawer();
    return;
  }

  const riSortBtn = e.target.closest("[data-ri-sort]");
  if (riSortBtn) {
    const key = riSortBtn.dataset.riSort;
    if (state.riSortKey === key) {
      state.riSortDir = state.riSortDir === "asc" ? "desc" : "asc";
    } else {
      state.riSortKey = key;
      state.riSortDir = "asc";
    }
    renderRiTable();
    return;
  }

  const userSortBtn = e.target.closest("[data-user-sort]");
  if (userSortBtn) {
    const key = userSortBtn.dataset.userSort;
    if (state.userSortKey === key) {
      state.userSortDir = state.userSortDir === "asc" ? "desc" : "asc";
    } else {
      state.userSortKey = key;
      state.userSortDir = "asc";
    }
    renderUsersPanel();
    return;
  }

  // 리스크 종료 버튼
  const closeRiskBtn = e.target.closest("[data-risk-close]");
  if (closeRiskBtn) {
    const rid = closeRiskBtn.dataset.riskClose;
    closeRiskBtn.disabled = true;
    request(`/api/risks/${encodeURIComponent(rid)}`, {
      method: "PATCH", body: JSON.stringify({ status: "Closed" }),
    }).then((updated) => {
      state.risks = state.risks.map((r) => r.id === rid ? { ...r, ...updated } : r);
      renderRiTable();
      if (state.riDetail?.type === "risk" && state.riDetail.id === rid) renderRiDetailDrawer("risk", rid);
    }).catch((err) => { closeRiskBtn.disabled = false; alert(err.message); });
    return;
  }

  // 이슈 해결 버튼
  const resolveIssueBtn = e.target.closest("[data-issue-resolve]");
  if (resolveIssueBtn) {
    const iid = resolveIssueBtn.dataset.issueResolve;
    resolveIssueBtn.disabled = true;
    request(`/api/issues/${encodeURIComponent(iid)}`, {
      method: "PATCH", body: JSON.stringify({ status: "Resolved" }),
    }).then((updated) => {
      state.issues = state.issues.map((i) => i.id === iid ? { ...i, ...updated } : i);
      renderRiTable();
      if (state.riDetail?.type === "issue" && state.riDetail.id === iid) renderRiDetailDrawer("issue", iid);
    }).catch((err) => { resolveIssueBtn.disabled = false; alert(err.message); });
    return;
  }
});

document.querySelector("#riDetailClose")?.addEventListener("click", closeRiDetailDrawer);
document.querySelector("#riDetailBackdrop")?.addEventListener("click", closeRiDetailDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#riDetailDrawer")?.hidden) {
    closeRiDetailDrawer();
  }
  if ((event.key === "Enter" || event.key === " ") && event.target?.matches?.("tr[data-ri-item-id]")) {
    event.preventDefault();
    renderRiDetailDrawer(event.target.dataset.riItemType, event.target.dataset.riItemId);
  }
});

// 프로젝트·상태 필터
document.addEventListener("change", (e) => {
  if (e.target.id === "riProjectFilter") {
    state.riProjectFilter = e.target.value;
    renderRiTable();
    closeRiDetailDrawer();
  }
  if (e.target.id === "riStatusFilter") {
    state.riStatusFilter = e.target.value;
    renderRiTable();
    closeRiDetailDrawer();
  }
  if (e.target.id === "riOwnerFilter") {
    state.riOwnerFilter = e.target.value;
    renderRiTable();
    closeRiDetailDrawer();
  }
  if (e.target.id === "userRoleFilter") {
    state.userRoleFilter = e.target.value;
    renderUsersPanel();
  }
  if (e.target.id === "userStatusFilter") {
    state.userStatusFilter = e.target.value;
    renderUsersPanel();
  }
  if (e.target.id === "userGroupFilter") {
    state.userGroupFilter = e.target.value;
    renderUsersPanel();
  }
});

// 리스크 등록 다이얼로그
(function initRiskDialog() {
  const openBtn = document.querySelector("#createRiskBtn");
  const dialog  = document.querySelector("#riskDialog");
  const form    = document.querySelector("#riskForm");
  const cancelBtn = document.querySelector("#riskDialogCancel");
  const closeBtn  = document.querySelector("#riskDialogClose");
  const status    = document.querySelector("#riskFormStatus");
  if (!dialog) return;

  openBtn?.addEventListener("click", () => {
    form.reset();
    if (status) status.textContent = "";
    // 프로젝트 선택 시 필터 값 미리 세팅
    dialog.showModal();
  });
  cancelBtn?.addEventListener("click", () => dialog.close());
  closeBtn?.addEventListener("click",  () => dialog.close());

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.querySelector("#riskDialogSubmit");
    submitBtn.disabled = true;
    if (status) status.textContent = "";

    const pid = state.riProjectFilter || state.projects[0]?.id;
    if (!pid) { if (status) status.textContent = "프로젝트를 선택하세요."; submitBtn.disabled = false; return; }

    const body = {
      title:       document.querySelector("#riskTitle").value.trim(),
      description: document.querySelector("#riskDescription").value.trim(),
      severity:    document.querySelector("#riskSeverity").value,
      likelihood:  document.querySelector("#riskLikelihood").value,
      owner:       document.querySelector("#riskOwner").value.trim() || "PMO",
      mitigation:  document.querySelector("#riskMitigation").value.trim(),
      due_date:    document.querySelector("#riskDueDate").value || null,
    };
    try {
      const created = await request(`/api/projects/${encodeURIComponent(pid)}/risks`, {
        method: "POST", body: JSON.stringify(body),
      });
      const proj = state.projects.find((p) => p.id === pid);
      state.risks = [{ ...created, project_name: proj?.name || "" }, ...state.risks];
      dialog.close();
      renderRiTable();
    } catch (err) {
      if (status) status.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

// 이슈 등록 다이얼로그
(function initIssueDialog() {
  const openBtn = document.querySelector("#createIssueBtn");
  const dialog  = document.querySelector("#issueDialog");
  const form    = document.querySelector("#issueForm");
  const cancelBtn = document.querySelector("#issueDialogCancel");
  const closeBtn  = document.querySelector("#issueDialogClose");
  const status    = document.querySelector("#issueFormStatus");
  if (!dialog) return;

  openBtn?.addEventListener("click", () => {
    form.reset();
    if (status) status.textContent = "";
    dialog.showModal();
  });
  cancelBtn?.addEventListener("click", () => dialog.close());
  closeBtn?.addEventListener("click",  () => dialog.close());

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.querySelector("#issueDialogSubmit");
    submitBtn.disabled = true;
    if (status) status.textContent = "";

    const pid = state.riProjectFilter || state.projects[0]?.id;
    if (!pid) { if (status) status.textContent = "프로젝트를 선택하세요."; submitBtn.disabled = false; return; }

    const body = {
      title:       document.querySelector("#issueTitle").value.trim(),
      description: document.querySelector("#issueDescription").value.trim(),
      priority:    document.querySelector("#issuePriority").value,
      assignee:    document.querySelector("#issueAssignee").value.trim() || "PMO",
      due_date:    document.querySelector("#issueDueDate").value || null,
    };
    try {
      const created = await request(`/api/projects/${encodeURIComponent(pid)}/issues`, {
        method: "POST", body: JSON.stringify(body),
      });
      const proj = state.projects.find((p) => p.id === pid);
      state.issues = [{ ...created, project_name: proj?.name || "" }, ...state.issues];
      dialog.close();
      renderRiTable();
    } catch (err) {
      if (status) status.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

/* ══════════════════════════════════════════════════════════════════
   P3-01: 프로젝트 상세 페이지
   ══════════════════════════════════════════════════════════════════ */

async function openProjectDetailToTab(projectId, tab) {
  await openProjectDetail(projectId);
  state.pdTab = tab;
  state.pdCrList = [];
  state.pdDiffData = null;
  state.pdMembersList = null;
  state.pdMemberCandidates = null;
  renderProjectDetailBody();
}

async function openProjectDetail(projectId) {
  state.pdTab = "overview";
  state.projectDetail = null;
  state.pdCrList = [];
  state.pdDiffData = null;
  state.pdMembersList = null;
  state.pdMemberCandidates = null;
  applyPortalView("#projectDetail", { updateHistory: true });
  document.querySelector("#pdTitle").textContent = "로딩 중…";
  try {
    const detail = await request(`/api/projects/${projectId}`);
    state.projectDetail = detail;
    document.querySelector("#pdTitle").textContent = detail.project.name;
    renderProjectDetailBody();
  } catch (e) {
    document.querySelector("#pdBody").innerHTML = `<p class="empty-state">프로젝트를 불러올 수 없습니다.</p>`;
  }
}

function renderProjectDetailBody() {
  const d = state.projectDetail;
  if (!d) return;
  const body = document.querySelector("#pdBody");
  if (!body) return;

  // 탭 활성화
  document.querySelectorAll(".pd-tab").forEach(btn => {
    const active = btn.dataset.pdTab === state.pdTab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (state.pdTab === "overview") {
    const p = d.project;
    const s = d.wbs_summary;
    const meta = p.metadata || {};
    body.innerHTML = `
      <div class="pd-overview-grid">
        <div class="pd-kpi-row">
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">전체 진행률</span>
            <span class="pd-kpi-value">${s.progress_pct}%</span>
            <div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width:${Math.min(s.progress_pct,100)}%"></div></div>
          </div>
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">SPI</span>
            <span class="pd-kpi-value ${s.spi !== null ? (s.spi >= 1 ? 'kpi-green' : 'kpi-red') : ''}">${s.spi !== null ? s.spi : '—'}</span>
          </div>
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">WBS 항목</span>
            <span class="pd-kpi-value">${s.done_items}/${s.total_items}</span>
          </div>
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">미결 리스크</span>
            <span class="pd-kpi-value ${d.risks.filter(r=>r.status!=='Closed').length > 0 ? 'kpi-red' : 'kpi-green'}">${d.risks.filter(r=>r.status!=='Closed').length}</span>
          </div>
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">미결 이슈</span>
            <span class="pd-kpi-value ${d.issues.filter(i=>i.status!=='Closed').length > 0 ? 'kpi-red' : 'kpi-green'}">${d.issues.filter(i=>i.status!=='Closed').length}</span>
          </div>
        </div>
        <dl class="definition-list" style="margin-top:20px">
          <dt>상태</dt><dd>${p.status}</dd>
          <dt>PM</dt><dd>${meta.project_manager || p.owner || '—'}</dd>
          <dt>시작일</dt><dd>${p.start_date || '—'}</dd>
          <dt>종료일</dt><dd>${meta.end_date || '—'}</dd>
          <dt>고객사</dt><dd>${meta.client_name || '—'}</dd>
          <dt>예산</dt><dd>${meta.budget ? Number(meta.budget).toLocaleString() + ' 원' : '—'}</dd>
          <dt>설명</dt><dd>${meta.description || '—'}</dd>
          ${d.last_sync ? `<dt>최근 동기화</dt><dd>${d.last_sync.status} (${(d.last_sync.finished_at||'').substring(0,16)})</dd>` : ''}
        </dl>
      </div>`;
  } else if (state.pdTab === "risks") {
    const rows = d.risks.length === 0
      ? `<tr><td colspan="5" class="empty-state">등록된 리스크가 없습니다.</td></tr>`
      : d.risks.map(r => `<tr>
          <td>${r.wbs_code || '—'}</td>
          <td>${r.title}</td>
          <td><span class="ri-status-pill sev-${r.severity === '높음' ? 'high' : r.severity === '보통' ? 'med' : 'low'}">${r.severity}</span></td>
          <td><span class="ri-status-pill st-${r.status === 'Closed' ? 'closed' : 'open'}">${r.status}</span></td>
          <td>${r.owner}</td>
        </tr>`).join("");
    body.innerHTML = `<table class="ri-table"><thead><tr><th>코드</th><th>제목</th><th>심각도</th><th>상태</th><th>담당</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else if (state.pdTab === "issues") {
    const rows = d.issues.length === 0
      ? `<tr><td colspan="5" class="empty-state">등록된 이슈가 없습니다.</td></tr>`
      : d.issues.map(i => `<tr>
          <td>${i.wbs_code || '—'}</td>
          <td>${i.title}</td>
          <td><span class="ri-status-pill sev-${i.priority === '높음' ? 'high' : i.priority === '보통' ? 'med' : 'low'}">${i.priority}</span></td>
          <td><span class="ri-status-pill st-${i.status === 'Closed' ? 'closed' : 'open'}">${i.status}</span></td>
          <td>${i.assignee || '—'}</td>
        </tr>`).join("");
    body.innerHTML = `<table class="ri-table"><thead><tr><th>코드</th><th>제목</th><th>우선순위</th><th>상태</th><th>담당</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else if (state.pdTab === "approvals") {
    const rows = d.approvals.length === 0
      ? `<tr><td colspan="4" class="empty-state">승인 이력이 없습니다.</td></tr>`
      : d.approvals.map(a => `<tr>
          <td>${a.version || '—'}</td>
          <td>${a.status}</td>
          <td>${a.reviewer_name || '—'}</td>
          <td>${(a.created_at||'').substring(0,10)}</td>
        </tr>`).join("");
    body.innerHTML = `<table class="ri-table"><thead><tr><th>버전</th><th>상태</th><th>검토자</th><th>요청일</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else if (state.pdTab === "cr") {
    renderPdCrTab();
  } else if (state.pdTab === "diff") {
    renderPdDiffTab();
  } else if (state.pdTab === "members") {
    renderPdMembersTab();
  } else if (state.pdTab === "wbs") {
    body.innerHTML = `<p class="empty-state" style="padding:40px">WBS 상세는 <a href="#wbs-plan" style="color:var(--blue)">WBS 관리</a> 탭에서 확인하세요.</p>`;
  }
}

async function renderPdCrTab() {
  const body = document.querySelector("#pdBody");
  if (!state.projectDetail) return;
  const pid = state.projectDetail.project.id;
  if (!state.pdCrList.length) {
    try { state.pdCrList = await request(`/api/projects/${pid}/change-requests`); } catch { state.pdCrList = []; }
  }
  const canMutate = canMutateWork();
  const rows = state.pdCrList.length === 0
    ? `<tr><td colspan="7" class="empty-state">등록된 변경요청이 없습니다.</td></tr>`
    : state.pdCrList.map(cr => {
        const isOpen = cr.status === "Open";
        let actionsHtml = "—";
        if (isOpen && canMutate) {
          actionsHtml = `<div class="pipe-actions">
              <button class="pipe-reject-btn"  type="button" data-cr-action="Rejected" data-cr-id="${escapeHtml(cr.id)}">반려</button>
              <button class="pipe-approve-btn" type="button" data-cr-action="Approved" data-cr-id="${escapeHtml(cr.id)}">승인</button>
            </div>`;
        } else if (cr.status === "Approved" || cr.status === "Rejected") {
          actionsHtml = `<span class="ri-status-pill ${cr.status === "Approved" ? "st-closed" : "st-closed"}">${cr.status === "Approved" ? "승인됨" : "반려됨"}</span>`;
          if (cr.resolution) actionsHtml += `<div class="cr-resolution-note">${escapeHtml(cr.resolution)}</div>`;
        }
        return `<tr>
        <td>${cr.version}</td>
        <td>${cr.title}</td>
        <td><span class="ri-status-pill sev-${cr.priority === '높음' ? 'high' : cr.priority === '보통' ? 'med' : 'low'}">${cr.priority}</span></td>
        <td><span class="ri-status-pill st-${cr.status === 'Approved' ? 'closed' : cr.status === 'Rejected' ? 'closed' : 'open'}">${cr.status}</span></td>
        <td>${cr.requested_by || '—'}</td>
        <td>${(cr.created_at||'').substring(0,10)}</td>
        <td>${actionsHtml}</td>
      </tr>`;
      }).join("");
  body.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="primary-button btn-sm" id="addCrBtn">+ 변경요청 등록</button>
    </div>
    <table class="ri-table"><thead><tr><th>번호</th><th>제목</th><th>우선순위</th><th>상태</th><th>요청자</th><th>등록일</th><th>처리</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  document.querySelector("#addCrBtn")?.addEventListener("click", () => {
    document.querySelector("#crDialog")?.showModal();
  });
  body.querySelectorAll("[data-cr-action]").forEach((btn) => {
    btn.addEventListener("click", () => decideChangeRequest(btn.dataset.crId, btn.dataset.crAction));
  });
}

async function decideChangeRequest(crId, action) {
  if (!crId) return;
  let resolution = "";
  if (action === "Rejected") {
    resolution = window.prompt("반려 사유를 입력하세요 (필수):", "");
    if (resolution === null) return;
    if (!resolution.trim()) {
      alert("반려 사유는 필수입니다. 입력 후 다시 시도하세요.");
      return;
    }
  } else {
    if (!window.confirm("이 변경요청을 승인하시겠습니까?")) return;
  }

  try {
    const payload = { status: action };
    if (resolution.trim()) payload.resolution = resolution.trim();
    const updated = await request(`/api/change-requests/${encodeURIComponent(crId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.pdCrList = state.pdCrList.map((cr) => cr.id === updated.id ? updated : cr);
    state.portfolioCr = null;
    renderPdCrTab();
  } catch (err) {
    alert(err?.message || "처리 중 오류가 발생했습니다.");
  }
}

async function renderPdDiffTab() {
  const body = document.querySelector("#pdBody");
  if (!state.projectDetail) return;
  const pid = state.projectDetail.project.id;
  body.innerHTML = `<p class="empty-state">베이스라인과 비교 중…</p>`;
  try {
    const diff = await request(`/api/projects/${pid}/wbs-diff`);
    state.pdDiffData = diff;
    const { summary, added, removed, changed } = diff;
    if (summary.added + summary.removed + summary.changed === 0) {
      body.innerHTML = `<p class="empty-state">베이스라인과 차이가 없습니다.</p>`;
      return;
    }
    const addedRows = added.map(r => `<tr class="diff-added"><td>+</td><td>${r.code}</td><td>${r.name}</td><td colspan="2">신규 추가</td></tr>`).join("");
    const removedRows = removed.map(r => `<tr class="diff-removed"><td>-</td><td>${r.code}</td><td>${r.name}</td><td colspan="2">삭제됨</td></tr>`).join("");
    const changedRows = changed.map(r => {
      const fieldStr = Object.entries(r.changes).map(([k,v]) => `${k}: ${v.before} → ${v.after}`).join(", ");
      return `<tr class="diff-changed"><td>~</td><td>${r.code}</td><td>${r.name}</td><td colspan="2">${fieldStr}</td></tr>`;
    }).join("");
    body.innerHTML = `
      <div class="diff-summary-bar">
        <span class="diff-badge added">+${summary.added} 추가</span>
        <span class="diff-badge removed">-${summary.removed} 삭제</span>
        <span class="diff-badge changed">~${summary.changed} 변경</span>
        <span class="diff-badge unchanged">${summary.unchanged} 동일</span>
      </div>
      <table class="ri-table diff-table">
        <thead><tr><th>구분</th><th>코드</th><th>항목명</th><th colspan="2">변경 내용</th></tr></thead>
        <tbody>${addedRows}${removedRows}${changedRows}</tbody>
      </table>`;
  } catch {
    body.innerHTML = `<p class="empty-state">베이스라인이 없거나 비교에 실패했습니다.</p>`;
  }
}

async function renderPdMembersTab() {
  const body = document.querySelector("#pdBody");
  if (!state.projectDetail) return;
  const pid = state.projectDetail.project.id;
  const isAdmin = state.projectDetail.project_role === "admin";

  if (!state.pdMembersList) {
    body.innerHTML = `<p class="empty-state">멤버 목록을 불러오는 중…</p>`;
    try {
      state.pdMembersList = await request(`/api/projects/${pid}/members`);
    } catch {
      body.innerHTML = `<p class="empty-state">멤버 목록을 불러올 수 없습니다.</p>`;
      return;
    }
  }
  if (isAdmin && !state.pdMemberCandidates) {
    try {
      state.pdMemberCandidates = await request(`/api/projects/${pid}/members/candidates`);
    } catch {
      state.pdMemberCandidates = [];
    }
  }

  const rows = state.pdMembersList.length === 0
    ? `<tr><td colspan="5" class="empty-state">등록된 멤버가 없습니다.</td></tr>`
    : state.pdMembersList.map(m => `
        <tr data-member-id="${escapeHtml(m.id)}">
          <td>
            <strong>${escapeHtml(m.display_name || m.email)}</strong>
            <small>${escapeHtml(m.email)}</small>
          </td>
          <td><span class="resource-role-badge">${escapeHtml(roleLabel(m.global_role))}</span></td>
          <td>
            ${isAdmin
              ? `<select data-member-role aria-label="${escapeHtml(m.email)} 프로젝트 역할">${roleOptions(m.project_role)}</select>`
              : `<span class="resource-role-badge">${escapeHtml(roleLabel(m.project_role))}</span>`}
          </td>
          <td>${escapeHtml(formatTimestamp(m.created_at))}</td>
          ${isAdmin ? `
          <td>
            <div class="table-actions">
              <button class="table-action" type="button" data-member-action="save">저장</button>
              <button class="table-action" type="button" data-member-action="remove">제거</button>
            </div>
          </td>` : ""}
        </tr>
      `).join("");

  const addRow = isAdmin ? `
    <div class="pd-member-add" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <select id="pdMemberCandidateSelect" style="flex:1" ${state.pdMemberCandidates.length === 0 ? "disabled" : ""}>
        ${state.pdMemberCandidates.length === 0
          ? `<option value="">추가 가능한 사용자가 없습니다</option>`
          : state.pdMemberCandidates.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.display_name || u.email)} (${escapeHtml(u.email)})</option>`).join("")}
      </select>
      <select id="pdMemberRoleSelect">${roleOptions("viewer")}</select>
      <button class="primary-button btn-sm" id="addMemberBtn" ${state.pdMemberCandidates.length === 0 ? "disabled" : ""}>+ 멤버 추가</button>
    </div>
  ` : "";

  body.innerHTML = `
    ${addRow}
    <table class="ri-table">
      <thead><tr><th>이름</th><th>전역 역할</th><th>프로젝트 역할</th><th>등록일</th>${isAdmin ? "<th>작업</th>" : ""}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  if (!isAdmin) return;

  document.querySelector("#addMemberBtn")?.addEventListener("click", async () => {
    const select = document.querySelector("#pdMemberCandidateSelect");
    const userId = select?.value;
    const role = document.querySelector("#pdMemberRoleSelect")?.value;
    if (!userId) return;
    const btn = document.querySelector("#addMemberBtn");
    btn.disabled = true;
    try {
      const created = await request(`/api/projects/${pid}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, project_role: role }),
      });
      state.pdMembersList.push(created);
      state.pdMemberCandidates = state.pdMemberCandidates.filter(u => u.id !== userId);
      showAutoSyncToast("멤버를 추가했습니다.");
      renderPdMembersTab();
    } catch (err) {
      showAutoSyncToast(err.message || "멤버 추가에 실패했습니다.", "error");
      btn.disabled = false;
    }
  });

  body.querySelectorAll("tr[data-member-id]").forEach(tr => {
    const memberId = tr.dataset.memberId;
    tr.querySelector('[data-member-action="save"]')?.addEventListener("click", async () => {
      const role = tr.querySelector("[data-member-role]")?.value;
      try {
        const updated = await request(`/api/projects/${pid}/members/${memberId}`, {
          method: "PATCH",
          body: JSON.stringify({ project_role: role }),
        });
        const idx = state.pdMembersList.findIndex(m => m.id === memberId);
        if (idx >= 0) state.pdMembersList[idx] = updated;
        showAutoSyncToast("프로젝트 역할을 변경했습니다.");
      } catch (err) {
        showAutoSyncToast(err.message || "역할 변경에 실패했습니다.", "error");
      }
    });
    tr.querySelector('[data-member-action="remove"]')?.addEventListener("click", async () => {
      const member = state.pdMembersList.find(m => m.id === memberId);
      if (!window.confirm(`${member?.display_name || member?.email || "이 멤버"}를 프로젝트에서 제거하시겠습니까?`)) return;
      try {
        await request(`/api/projects/${pid}/members/${memberId}`, { method: "DELETE" });
        state.pdMembersList = state.pdMembersList.filter(m => m.id !== memberId);
        if (member) {
          state.pdMemberCandidates = [
            ...(state.pdMemberCandidates || []),
            { id: member.user_id, email: member.email, display_name: member.display_name, global_role: member.global_role },
          ];
        }
        showAutoSyncToast("멤버를 제거했습니다.");
        renderPdMembersTab();
      } catch (err) {
        showAutoSyncToast(err.message || "멤버 제거에 실패했습니다.", "error");
      }
    });
  });
}

// 프로젝트 상세 탭 클릭 이벤트
(function initProjectDetailTabs() {
  const tabBar = document.querySelector("#pdTabBar");
  if (!tabBar) return;
  tabBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".pd-tab[data-pd-tab]");
    if (!btn) return;
    state.pdTab = btn.dataset.pdTab;
    state.pdCrList = [];
    state.pdDiffData = null;
    state.pdMembersList = null;
    state.pdMemberCandidates = null;
    renderProjectDetailBody();
  });
  document.querySelector("#pdBackBtn")?.addEventListener("click", () => {
    applyPortalView("#portfolio", { behavior: "smooth" });
  });
})();

// CR 다이얼로그 제출
(function initCrDialog() {
  const dialog = document.querySelector("#crDialog");
  const form   = document.querySelector("#crForm");
  if (!dialog || !form) return;
  document.querySelector("#crDialogCancel")?.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.querySelector("#crFormStatus");
    const btn = document.querySelector("#crDialogSubmit");
    const pid = state.projectDetail?.project?.id;
    if (!pid) return;
    btn.disabled = true;
    try {
      const payload = {
        title: document.querySelector("#crTitle").value.trim(),
        priority: document.querySelector("#crPriority").value,
        requested_by: document.querySelector("#crRequestedBy").value.trim(),
        wbs_code: document.querySelector("#crWbsCode").value.trim() || null,
        impact_schedule_days: parseInt(document.querySelector("#crScheduleDays").value)||null,
        impact_cost: parseFloat(document.querySelector("#crCost").value)||null,
        impact_scope: document.querySelector("#crImpactScope").value.trim(),
        description: document.querySelector("#crDescription").value.trim(),
      };
      const cr = await request(`/api/projects/${pid}/change-requests`, { method: "POST", body: JSON.stringify(payload) });
      state.pdCrList.unshift(cr);
      status.textContent = `${cr.version} 등록 완료`;
      setTimeout(() => { dialog.close(); renderPdCrTab(); }, 800);
    } catch(err) {
      status.textContent = `오류: ${err.message || "등록 실패"}`;
    } finally { btn.disabled = false; }
  });
})();

/* ══════════════════════════════════════════════════════════════════
   P3-05: 자원 배분 패널
   ══════════════════════════════════════════════════════════════════ */

function resourceNumber(value, fractionDigits = 0) {
  const n = Number(value || 0);
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function renderResourceTabs() {
  document.querySelectorAll("[data-resource-view]").forEach((btn) => {
    const active = btn.dataset.resourceView === state.resourceView;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderResourceKpis(items) {
  return `
    <div class="resource-kpi-grid">
      ${items.map((item) => `
        <div class="resource-kpi-card">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
        </div>
      `).join("")}
    </div>`;
}

function renderResourceProjectList(projects = []) {
  if (!projects.length) return `<span class="resource-muted">프로젝트 없음</span>`;
  return `
    <div class="res-project-list">
      ${projects.slice(0, 4).map((p) => `
        <div class="res-project-row">
          <span title="${escapeHtml(p.project_name || "")}">${escapeHtml(p.project_name || "-")}</span>
          <span>${resourceNumber(p.task_count)}건 · ${resourceNumber(p.avg_progress, 1)}%</span>
        </div>
      `).join("")}
      ${projects.length > 4 ? `<div class="res-project-more">외 ${projects.length - 4}개 프로젝트</div>` : ""}
    </div>`;
}

function renderResourceTaskList(tasks = []) {
  if (!tasks.length) return `<span class="resource-muted">할당 작업 없음</span>`;
  return `
    <div class="resource-task-list">
      ${tasks.slice(0, 4).map((task) => `
        <div class="resource-task-item">
          <strong>${escapeHtml(task.code || "-")} · ${escapeHtml(task.name || "-")}</strong>
          <span>${escapeHtml(task.project_name || "-")} · ${escapeHtml(task.finish_date || "기한 없음")}</span>
        </div>
      `).join("")}
      ${tasks.length > 4 ? `<div class="res-project-more">외 ${tasks.length - 4}건</div>` : ""}
    </div>`;
}

function resourceProgressCell(value, stateClass = "") {
  const pct = Math.max(0, Math.min(Number(value || 0), 100));
  return `
    <div class="resource-progress-cell">
      <div class="kpi-progress-bar">
        <div class="kpi-progress-fill ${stateClass}" style="width:${pct}%"></div>
      </div>
      <span>${resourceNumber(value, 1)}%</span>
    </div>`;
}

function renderResourceWorkload(data) {
  const summary = data.summary || {};
  const rows = data.assignees || [];
  const kpis = renderResourceKpis([
    { label: "담당자", value: `${resourceNumber(summary.total_assignees)}명`, note: "WBS owner 기준" },
    { label: "배정 작업", value: `${resourceNumber(summary.total_tasks)}건`, note: `${resourceNumber(summary.open_tasks)}건 미완료` },
    { label: "가중치 합계", value: resourceNumber(summary.total_weight, 1), note: "WBS weight 합산" },
    { label: "추정 공수", value: `${resourceNumber(summary.estimated_effort_hours, 1)}h`, note: "미입력 작업은 8h 추정" },
  ]);
  const table = rows.length
    ? `
      <table class="ri-table resource-table">
        <thead>
          <tr>
            <th>담당자</th><th>계정 연결</th><th>전체</th><th>미완료</th><th>가중치</th><th>추정 공수</th><th>평균 진척</th><th>프로젝트별</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((a) => `
            <tr>
              <td class="res-assignee">${escapeHtml(a.assignee || "-")}</td>
              <td>${a.matched_user ? `<span class="resource-match-badge">${escapeHtml(a.matched_user.display_name || a.matched_user.email || "-")}</span>` : `<span class="resource-unmatched">미연결</span>`}</td>
              <td>${resourceNumber(a.total_tasks)}</td>
              <td>${resourceNumber(a.open_tasks)}</td>
              <td>${resourceNumber(a.total_weight, 1)}</td>
              <td>${resourceNumber(a.estimated_effort_hours, 1)}h</td>
              <td>${resourceProgressCell(a.avg_progress)}</td>
              <td>${renderResourceProjectList(a.projects)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : `<p class="empty-state">해당 기간에 배정된 WBS 작업이 없습니다.</p>`;
  return `
    <div class="resource-context">
      <strong>WBS 작업 부하</strong>
      <span>WBS 항목의 담당자(owner) 텍스트를 기준으로 기간과 겹치는 작업을 집계합니다.</span>
    </div>
    ${kpis}
    ${table}`;
}

function renderResourceAccounts(data) {
  const summary = data.summary || {};
  const rows = data.account_tasks || [];
  const unmapped = data.unmapped_assignments || [];
  const activeRows = rows.filter((row) => row.status === "Active");
  const kpis = renderResourceKpis([
    { label: "활성 계정", value: `${resourceNumber(activeRows.length)}명`, note: "현재 테넌트 기준" },
    { label: "할당 계정", value: `${resourceNumber(summary.mapped_accounts)}명`, note: "WBS 담당자와 매핑됨" },
    { label: "미연결 담당자", value: `${resourceNumber(summary.unmapped_assignees)}명`, note: "계정 매핑 필요" },
    { label: "미완료 작업", value: `${resourceNumber(summary.open_tasks)}건`, note: "계정 매핑 포함" },
  ]);
  const table = rows.length
    ? `
      <table class="ri-table resource-table">
        <thead>
          <tr>
            <th>사용자 계정</th><th>역할</th><th>매핑 담당명</th><th>할당</th><th>미완료</th><th>실제 공수</th><th>추정 공수</th><th>주요 작업</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((user) => `
            <tr>
              <td>
                <strong>${escapeHtml(user.display_name || "-")}</strong>
                <span class="resource-account-email">${escapeHtml(user.email || "")}</span>
              </td>
              <td><span class="resource-role-badge">${escapeHtml(user.role || "-")}</span></td>
              <td>${user.matched_owners?.length ? user.matched_owners.map((owner) => `<span class="resource-match-badge">${escapeHtml(owner)}</span>`).join(" ") : `<span class="resource-muted">없음</span>`}</td>
              <td>${resourceNumber(user.total_tasks)}</td>
              <td>${resourceNumber(user.open_tasks)}</td>
              <td>${resourceNumber(user.total_effort_hours, 1)}h</td>
              <td>${resourceNumber(user.estimated_effort_hours, 1)}h</td>
              <td>${renderResourceTaskList(user.tasks)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : `<p class="empty-state">조회 가능한 사용자 계정이 없습니다.</p>`;
  const unmappedHtml = unmapped.length
    ? `
      <div class="resource-alert">
        <strong>계정과 연결되지 않은 담당자</strong>
        <span>${unmapped.map((item) => `${item.assignee} ${item.total_tasks}건`).join(" · ")}</span>
      </div>`
    : "";
  return `
    <div class="resource-context">
      <strong>계정별 할당 모니터링</strong>
      <span>WBS 담당자명을 사용자 표시명, 이메일, 이메일 ID와 매칭해 계정별 작업을 보여줍니다.</span>
    </div>
    ${kpis}
    ${unmappedHtml}
    ${table}`;
}

function renderResourceCapacity(data) {
  const summary = data.summary || {};
  const rows = data.pmo_capacity || [];
  const basis = data.capacity_basis || {};
  const avgUtil = rows.length
    ? rows.reduce((sum, item) => sum + Number(item.utilization_pct || 0), 0) / rows.length
    : 0;
  const kpis = renderResourceKpis([
    { label: "PMO 인원", value: `${resourceNumber(summary.pmo_members)}명`, note: "admin/pmo 역할" },
    { label: "가용 공수", value: `${resourceNumber(summary.pmo_capacity_hours, 1)}h`, note: `${resourceNumber(summary.workdays)}영업일 × ${resourceNumber(basis.daily_hours || 8)}h` },
    { label: "계획 공수", value: `${resourceNumber(summary.pmo_planned_hours, 1)}h`, note: "할당 작업 기준" },
    { label: "평균 가동율", value: `${resourceNumber(avgUtil, 1)}%`, note: "계획 공수 / 가용 공수" },
  ]);
  const table = rows.length
    ? `
      <table class="ri-table resource-table">
        <thead>
          <tr>
            <th>PMO 계정</th><th>역할</th><th>가용 공수</th><th>계획 공수</th><th>가동율</th><th>할당</th><th>미완료</th><th>계산 기준</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>
                <strong>${escapeHtml(item.display_name || "-")}</strong>
                <span class="resource-account-email">${escapeHtml(item.email || "")}</span>
              </td>
              <td><span class="resource-role-badge">${escapeHtml(item.role || "-")}</span></td>
              <td>${resourceNumber(item.capacity_hours, 1)}h</td>
              <td>${resourceNumber(item.planned_hours, 1)}h</td>
              <td>${resourceProgressCell(item.utilization_pct, `resource-util-${item.state || "low"}`)}</td>
              <td>${resourceNumber(item.task_count)}건</td>
              <td>${resourceNumber(item.open_tasks)}건</td>
              <td>${item.inferred_effort_tasks ? `<span class="resource-muted">${resourceNumber(item.inferred_effort_tasks)}건 8h 추정 포함</span>` : `<span class="resource-match-badge">공수 입력 기준</span>`}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : `<p class="empty-state">PMO/admin 계정이 없습니다.</p>`;
  return `
    <div class="resource-context">
      <strong>PMO 인원 가동율</strong>
      <span>admin/pmo 계정의 할당 작업을 기준으로 기간 내 가용 공수 대비 계획 공수를 산정합니다.</span>
    </div>
    ${kpis}
    <p class="resource-note">${escapeHtml(basis.fallback || "공수 미입력 작업은 기본 추정값으로 계산됩니다.")}</p>
    ${table}`;
}

async function renderResourcePanel() {
  const body = document.querySelector("#resourceBody");
  if (!body) return;
  renderResourceTabs();
  if (!state.resourceData) {
    body.innerHTML = `
      <div class="resource-context">
        <strong>조회 전</strong>
        <span>기간을 선택한 뒤 조회하면 세 관점의 자원 현황을 탭으로 나누어 확인할 수 있습니다.</span>
      </div>
      <p class="empty-state">날짜를 선택하고 조회하세요.</p>`;
    return;
  }
  const { from_date, to_date } = state.resourceData;
  const viewHtml = state.resourceView === "accounts"
    ? renderResourceAccounts(state.resourceData)
    : state.resourceView === "capacity"
      ? renderResourceCapacity(state.resourceData)
      : renderResourceWorkload(state.resourceData);
  body.innerHTML = `
    <div class="resource-summary">
      <strong>${from_date} ~ ${to_date}</strong>
      <span>${escapeHtml(state.resourceView === "workload" ? "WBS 담당자 기준" : state.resourceView === "accounts" ? "사용자 계정 기준" : "PMO 가동율 기준")} · ${state.resourceData.data_source === "internal_wbs" ? "내부 WBS 데이터" : "데이터 출처 확인 필요"}</span>
    </div>
    ${viewHtml}`;
}

// 자원 배분 조회 버튼
(function initResourcePanel() {
  // 기본 날짜 세팅
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().substring(0,10);
  const todayStr = today.toISOString().substring(0,10);
  const fromEl = document.querySelector("#resourceFrom");
  const toEl   = document.querySelector("#resourceTo");
  if (fromEl) fromEl.value = firstDay;
  if (toEl)   toEl.value   = todayStr;

  document.querySelector("#resourceTabBar")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-resource-view]");
    if (!btn) return;
    state.resourceView = btn.dataset.resourceView;
    renderResourcePanel();
  });

  document.querySelector("#resourceRefreshBtn")?.addEventListener("click", async () => {
    const from = fromEl?.value || firstDay;
    const to   = toEl?.value || todayStr;
    const btn = document.querySelector("#resourceRefreshBtn");
    btn.disabled = true;
    const body = document.querySelector("#resourceBody");
    if (body) body.innerHTML = `<div class="skeleton-stack"><div class="skeleton-line medium"></div><div class="skeleton-card"></div></div>`;
    try {
      state.resourceData = await request(`/api/reports/resource-load?from_date=${from}&to_date=${to}`);
      renderResourcePanel();
    } catch { document.querySelector("#resourceBody").innerHTML = `<p class="empty-state">데이터를 불러올 수 없습니다.</p>`; }
    finally { btn.disabled = false; }
  });
})();

/* ══════════════════════════════════════════════════════════════════
   P3-06: 감사 로그 CSV 내보내기
   ══════════════════════════════════════════════════════════════════ */

(function initAuditExport() {
  document.addEventListener("click", (e) => {
    if (!e.target.matches("#auditExportCsvBtn")) return;
    const token = state.authToken;
    if (!token) return;
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/audit-events/export.csv`;
    a.setAttribute("download", "");
    // fetch with auth header and blob download
    fetch(a.href, { headers: authHeaders() })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `audit-${new Date().toISOString().substring(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }).catch(() => alert("CSV 내보내기에 실패했습니다."));
  });
})();

/* ══════════════════════════════════════════════════════════════════
   P3-08: 설정 탭 — 인증(LDAP) · SMTP · 테넌트
   ══════════════════════════════════════════════════════════════════ */

async function renderAuthSettingsTab() {
  if (!state.authSettings) {
    try { state.authSettings = await request("/api/settings/auth"); } catch { return; }
  }
  const d = state.authSettings;
  const setVal = (id, val) => { const el = document.querySelector(`#${id}`); if (el) el.value = val || ""; };
  document.querySelector("#authBackendLabel") && (document.querySelector("#authBackendLabel").textContent = d.auth_backend);
  setVal("ldapServer",     d.ldap_server);
  setVal("ldapPort",       d.ldap_port);
  setVal("ldapBindDN",     d.ldap_bind_dn);
  setVal("ldapBaseDN",     d.ldap_base_dn);
  setVal("ldapUserFilter", d.ldap_user_filter);
  setVal("ldapAttrEmail",  d.ldap_attr_email);
  setVal("ldapAttrName",   d.ldap_attr_name);
  const sslEl = document.querySelector("#ldapUseSSL");
  if (sslEl) sslEl.value = d.ldap_use_ssl ? "true" : "false";
}

function renderLdapDiagnostics(diagnostics) {
  const list = document.querySelector("#ldapDiagnosticList");
  if (!list) return;
  const steps = diagnostics?.steps || [];
  list.innerHTML = steps.length
    ? steps.map((step) => `
      <div class="ldap-diagnostic-item">
        <span class="ldap-diagnostic-badge ${escapeHtml(step.status || "warn")}">${escapeHtml(step.status || "warn")}</span>
        <div>
          <strong>${escapeHtml(step.label || step.key || "진단")}</strong>
          <span>${escapeHtml(step.message || "")}</span>
        </div>
      </div>
    `).join("")
    : "";
}

document.querySelector("#ldapTestBtn")?.addEventListener("click", async () => {
  const email = document.querySelector("#ldapTestEmail")?.value.trim();
  const pwd   = document.querySelector("#ldapTestPassword")?.value;
  const status = document.querySelector("#ldapTestStatus");
  if (!email || !pwd) { if (status) status.textContent = "이메일과 비밀번호를 입력하세요."; return; }
  if (status) status.textContent = "테스트 중…";
  try {
    const res = await request("/api/settings/auth/test-ldap", { method: "POST", body: JSON.stringify({ email, password: pwd }) });
    if (status) status.textContent = res.message;
    if (status) status.style.color = res.success ? "var(--green)" : "var(--red)";
    renderLdapDiagnostics(res.diagnostics);
  } catch { if (status) status.textContent = "테스트 실패"; }
});

document.querySelector("#ldapDiagnosticsBtn")?.addEventListener("click", async () => {
  const email = document.querySelector("#ldapTestEmail")?.value.trim();
  const pwd   = document.querySelector("#ldapTestPassword")?.value;
  const status = document.querySelector("#ldapTestStatus");
  if (status) {
    status.textContent = "실 서버 검증 중…";
    status.style.color = "";
  }
  try {
    const res = await request("/api/settings/auth/ldap-diagnostics", {
      method: "POST",
      body: JSON.stringify({ email: email || null, password: pwd || null }),
    });
    renderLdapDiagnostics(res);
    if (status) {
      status.textContent = res.success ? "LDAP 실 서버 검증 통과" : "LDAP 실 서버 검증 실패";
      status.style.color = res.success ? "var(--green)" : "var(--red)";
    }
  } catch (error) {
    if (status) status.textContent = `검증 실패: ${error.message}`;
  }
});

function renderSmtpTab() {
  // SMTP는 서버 환경변수 기반 — 현재 설정을 platform settings에서 읽어 표시
  const s = state.settings || {};
  const setTxt = (id, val) => { const el = document.querySelector(`#${id}`); if (el) el.textContent = val || "미설정"; };
  setTxt("smtpHostVal", s.smtp_host);
  setTxt("smtpPortVal", s.smtp_port);
  setTxt("smtpUserVal", s.smtp_user);
  setTxt("smtpFromVal", s.notify_from_email);
}

async function renderTenantsTab() {
  if (!state.tenants.length) {
    try { state.tenants = await request("/api/tenants"); } catch { state.tenants = []; }
    renderTenantSwitcher();
  }
  const tbody = document.querySelector("#tenantTableBody");
  if (!tbody) return;
  if (!state.tenants.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">테넌트가 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.tenants.map(t => `<tr>
    <td><code>${t.id}</code></td>
    <td>${t.name}</td>
    <td><span class="ri-status-pill st-${t.status === 'Active' ? 'open' : 'closed'}">${t.status}</span></td>
    <td>${Number(t.project_count || 0)}개 / ${Number(t.wbs_item_count || 0)}행</td>
    <td>${(t.created_at||'').substring(0,10)}</td>
    <td>
      ${t.id !== 'default' ? `<button class="secondary-button btn-sm" data-tenant-suspend="${t.id}" data-tenant-status="${t.status}">
        ${t.status === 'Active' ? '중지' : '활성화'}
      </button>` : '—'}
    </td>
  </tr>`).join("");
}

// 테넌트 상태 변경
document.querySelector("#tenantTableBody")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-tenant-suspend]");
  if (!btn) return;
  const id = btn.dataset.tenantSuspend;
  const newStatus = btn.dataset.tenantStatus === "Active" ? "Suspended" : "Active";
  try {
    await request(`/api/tenants/${id}?status=${newStatus}`, { method: "PATCH" });
    state.tenants = [];
    renderTenantsTab();
  } catch { alert("상태 변경에 실패했습니다."); }
});

// 테넌트 추가 다이얼로그
(function initTenantDialog() {
  const dialog = document.querySelector("#tenantDialog");
  const form   = document.querySelector("#tenantForm");
  if (!dialog || !form) return;
  document.querySelector("#addTenantBtn")?.addEventListener("click", () => dialog.showModal());
  document.querySelector("#tenantDialogCancel")?.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.querySelector("#tenantFormStatus");
    const btn = document.querySelector("#tenantDialogSubmit");
    btn.disabled = true;
    try {
      await request("/api/tenants", { method: "POST", body: JSON.stringify({
        id: document.querySelector("#tenantId").value.trim(),
        name: document.querySelector("#tenantName").value.trim(),
      })});
      state.tenants = [];
      dialog.close();
      renderTenantsTab();
    } catch(err) {
      if (status) status.textContent = `오류: ${err.message || "추가 실패"}`;
    } finally { btn.disabled = false; }
  });
})();

// 포트폴리오 카드에서 상세 페이지로 이동 연결
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open-project]");
  if (!btn) return;
  openProjectDetail(btn.dataset.openProject);
});

/* ══════════════════════════════════════════════════════════════════
   P3-07: 백업 / 복원 UI
   ══════════════════════════════════════════════════════════════════ */

async function loadBackupList() {
  const tbody = document.querySelector("#backupTableBody");
  if (!tbody) return;
  try {
    const list = await request("/api/operations/backups");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">백업 파일이 없습니다.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(b => `<tr>
      <td style="font-family:monospace;font-size:12px">${b.filename}</td>
      <td>${b.size_human}</td>
      <td>${(b.created_at||'').replace('T',' ').substring(0,19)} UTC</td>
      <td style="white-space:nowrap;display:flex;gap:6px">
        <button class="secondary-button btn-sm" data-backup-download="${b.filename}">다운로드</button>
        <button class="secondary-button btn-sm" style="color:var(--red)" data-backup-delete="${b.filename}">삭제</button>
      </td>
    </tr>`).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">목록을 불러올 수 없습니다.</td></tr>`;
  }
}

(function initBackupUI() {
  // 백업 트리거
  document.querySelector("#backupTriggerBtn")?.addEventListener("click", async () => {
    const btn = document.querySelector("#backupTriggerBtn");
    const status = document.querySelector("#backupStatus");
    btn.disabled = true;
    if (status) { status.textContent = "백업 실행 중…"; status.style.color = "var(--secondary-text)"; }
    try {
      const res = await request("/api/operations/backup", { method: "POST" });
      if (status) { status.textContent = `✓ ${res.filename} (${res.size_human})`; status.style.color = "var(--green)"; }
      await loadBackupList();
    } catch (e) {
      if (status) { status.textContent = `✗ 백업 실패: ${e.message || "오류"}`; status.style.color = "var(--red)"; }
    } finally { btn.disabled = false; }
  });

  // 목록 새로고침
  document.querySelector("#backupRefreshBtn")?.addEventListener("click", loadBackupList);

  // 다운로드 / 삭제 (이벤트 위임)
  document.querySelector("#backupTableBody")?.addEventListener("click", async (e) => {
    const dlBtn  = e.target.closest("[data-backup-download]");
    const delBtn = e.target.closest("[data-backup-delete]");

    if (dlBtn) {
      const filename = dlBtn.dataset.backupDownload;
      const token = state.authToken;
      fetch(`${API_BASE}/api/operations/backups/${encodeURIComponent(filename)}`, {
        headers: authHeaders(),
      }).then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      }).catch(() => alert("다운로드에 실패했습니다."));
    }

    if (delBtn) {
      const filename = delBtn.dataset.backupDelete;
      if (!confirm(`백업 파일 "${filename}"을 삭제하시겠습니까?`)) return;
      try {
        await request(`/api/operations/backups/${encodeURIComponent(filename)}`, { method: "DELETE" });
        await loadBackupList();
      } catch { alert("삭제에 실패했습니다."); }
    }
  });
})();

// 운영 점검 탭 전환 시 백업 목록 자동 로드
const _origRenderOperationsPanel = typeof renderOperationsPanel === "function" ? renderOperationsPanel : null;
if (_origRenderOperationsPanel) {
  window._p3OperationsPanelPatched = true;
}
// switchSettingsTab에서 operations 탭 전환 시 loadBackupList() 호출
document.querySelector("#settingsTabBar")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".stg-tab[data-stg-tab='operations']");
  if (btn) setTimeout(loadBackupList, 100);
});

/* ═══════════════════════════════════════════════════════════════
   다크모드 토글
   ═══════════════════════════════════════════════════════════════ */
(function initTheme() {
  const STORAGE_KEY = "wbs-theme";
  const btn = document.getElementById("themeToggleBtn");
  const body = document.body;

  // 시스템 선호도 감지
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme(dark) {
    if (dark) {
      body.classList.add("dark-mode");
      body.classList.remove("light-mode");
      if (btn) { btn.textContent = "☀️"; btn.title = "라이트 모드로 전환"; }
    } else {
      body.classList.remove("dark-mode");
      body.classList.add("light-mode");
      if (btn) { btn.textContent = "🌙"; btn.title = "다크 모드로 전환"; }
    }
  }

  // 저장된 설정 우선, 없으면 라이트 모드로 시작 (시스템 설정과 무관)
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark") applyTheme(true);
  else applyTheme(false);

  // 시스템 선호도 변경 감지 (저장값 없을 때만)
  prefersDark.addEventListener("change", e => {
    if (!localStorage.getItem(STORAGE_KEY)) applyTheme(e.matches);
  });

  // 토글 버튼 클릭
  btn?.addEventListener("click", () => {
    const isDark = body.classList.contains("dark-mode");
    applyTheme(!isDark);
    localStorage.setItem(STORAGE_KEY, isDark ? "light" : "dark");
  });
})();

/* ═══════════════════════════════════════════════════════════════
   모바일 사이드바 드로어
   ═══════════════════════════════════════════════════════════════ */
(function initMobileMenu() {
  const sidebar   = document.querySelector(".sidebar");
  const backdrop  = document.getElementById("sidebarBackdrop");
  const menuBtn   = document.getElementById("mobMenuBtn");

  if (!sidebar || !menuBtn) return;

  function openSidebar() {
    sidebar.classList.add("sidebar-open");
    backdrop?.classList.add("visible");
    menuBtn.setAttribute("aria-expanded", "true");
    menuBtn.textContent = "✕";
  }

  function closeSidebar() {
    sidebar.classList.remove("sidebar-open");
    backdrop?.classList.remove("visible");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.textContent = "☰";
  }

  menuBtn.addEventListener("click", () => {
    sidebar.classList.contains("sidebar-open") ? closeSidebar() : openSidebar();
  });

  // 백드롭 클릭 시 닫기
  backdrop?.addEventListener("click", closeSidebar);

  // 메뉴 항목 클릭 시 닫기 (모바일)
  sidebar.querySelectorAll(".nav-list a").forEach(a => {
    a.addEventListener("click", () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });
})();

/* ═══════════════════════════════════════════════════════════════
   대시보드 위젯 커스터마이징
   ═══════════════════════════════════════════════════════════════ */
(function initWidgetCustomizer() {
  const STORAGE_KEY = "wbs-widget-prefs";

  // 위젯 정의: panelId → 패널 article ID, navHash → 사이드바 링크 href
  const WIDGETS = [
    { id: "portfolio",  label: "프로젝트 현황",      navHash: "#portfolio"  },
    { id: "approvals",  label: "승인 이력",           navHash: "#approvals"  },
    { id: "workboard",  label: "작업 현황",           navHash: "#workboard"  },
    { id: "sync",       label: "외부 연동",           navHash: "#sync"       },
    { id: "risks",      label: "리스크·이슈",         navHash: "#risks"      },
    { id: "resource",   label: "자원 배분",           navHash: "#resource"   },
    { id: "templates",  label: "표준/일반 WBS 관리", navHash: "#templates"  },
  ];

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  function savePrefs(prefs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }

  function applyPrefs(prefs) {
    WIDGETS.forEach(w => {
      const panelEl = document.getElementById(w.id);
      // nav 링크: href="#portfolio" 등으로 찾기
      const navEl = document.querySelector(`.nav-list a[href="${w.navHash}"]`);
      const hidden = prefs[w.id] === false;

      // 패널 숨김 (대시보드에 동시 표시되는 portfolio, approvals 등에 효과적)
      if (panelEl) panelEl.dataset.widgetHidden = hidden ? "true" : "false";

      // nav 링크 숨김 (라우팅 기반 패널에 대해 진입 차단)
      if (navEl) navEl.style.display = hidden ? "none" : "";

      // 현재 뷰가 숨김 처리된 위젯이면 대시보드로 리다이렉트
      if (hidden && window.location.hash === w.navHash) {
        if (typeof applyPortalView === "function") {
          applyPortalView("#dashboard", { updateHistory: true });
        }
      }
    });
  }

  // 초기 적용
  applyPrefs(loadPrefs());
  setTimeout(() => applyPrefs(loadPrefs()), 400);

  // 설정 > 플랫폼 설정 탭 내부의 위젯 표시 설정 패널 렌더링
  const panel = document.getElementById("widgetTogglePanel");
  if (!panel) return;

  function renderChips() {
    const prefs = loadPrefs();
    panel.innerHTML = WIDGETS.map(w => {
      const visible = prefs[w.id] !== false;
      return `<button class="widget-toggle-chip ${visible ? "active" : ""}" data-widget-id="${w.id}" type="button">${visible ? "✓ " : ""}${w.label}</button>`;
    }).join("");
  }

  renderChips();

  panel.addEventListener("click", e => {
    const chip = e.target.closest("[data-widget-id]");
    if (!chip) return;
    const id = chip.dataset.widgetId;
    const p = loadPrefs();
    const wasVisible = p[id] !== false;
    p[id] = !wasVisible;
    savePrefs(p);
    const nowVisible = p[id] !== false;
    chip.classList.toggle("active", nowVisible);
    chip.textContent = (nowVisible ? "✓ " : "") + WIDGETS.find(w => w.id === id)?.label;
    applyPrefs(p);
  });
})();

/* ═══════════════════════════════════════════════════════════════
   주간 보고서 자동 발송 스케줄 저장 (서버 스케줄러)
   ═══════════════════════════════════════════════════════════════ */
(function initScheduleSettings() {
  const MAX_SCHEDULE_RECIPIENTS = 10;
  const SCHEDULE_ITEMS = [
    { key: "weekly-pmo", label: "PMO 주간 보고서", toggleId: "schedWeeklyReport", stateId: "weeklyScheduleState" },
    { key: "risk-escalation", label: "리스크 에스컬레이션", toggleId: "schedRiskEscalation", stateId: "riskScheduleState" },
    { key: "approval-reminder", label: "승인 대기 리마인더", toggleId: "schedApprovalReminder", stateId: "approvalScheduleState" },
  ];
  const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
  const recipientState = [];

  function emailLooksValid(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function setRecipientHint(message, isError = false) {
    const hint = document.getElementById("schedWeeklyRecipientHint");
    if (!hint) return;
    hint.textContent = message || "쉼표, Enter 또는 붙여넣기로 추가할 수 있습니다.";
    hint.classList.toggle("is-error", !!isError);
  }

  function renderRecipients() {
    const chips = document.getElementById("schedWeeklyRecipientChips");
    const count = document.getElementById("scheduleRecipientCount");
    const input = document.getElementById("schedWeeklyRecipientInput");
    if (chips) {
      chips.innerHTML = recipientState.map((email) => `
        <span class="recipient-chip">
          <span>${escapeHtml(email)}</span>
          <button class="recipient-remove" type="button" title="수신자 삭제" aria-label="${escapeHtml(email)} 삭제" data-remove-recipient="${escapeHtml(email)}">×</button>
        </span>
      `).join("");
    }
    if (count) count.textContent = `${recipientState.length} / ${MAX_SCHEDULE_RECIPIENTS}`;
    if (input) {
      input.disabled = recipientState.length >= MAX_SCHEDULE_RECIPIENTS;
      input.placeholder = recipientState.length >= MAX_SCHEDULE_RECIPIENTS
        ? "최대 10명까지 등록됨"
        : "이메일 입력 후 Enter";
    }
  }

  function addRecipients(raw, options = {}) {
    const tokens = Array.isArray(raw)
      ? raw
      : String(raw || "").split(/[,\n;]/);
    let added = 0;
    let invalid = 0;
    let duplicate = 0;
    let overflow = 0;

    tokens.map((item) => String(item || "").trim()).filter(Boolean).forEach((email) => {
      if (!emailLooksValid(email)) {
        invalid += 1;
        return;
      }
      const normalized = email.toLowerCase();
      if (recipientState.some((existing) => existing.toLowerCase() === normalized)) {
        duplicate += 1;
        return;
      }
      if (recipientState.length >= MAX_SCHEDULE_RECIPIENTS) {
        overflow += 1;
        return;
      }
      recipientState.push(email);
      added += 1;
    });

    renderRecipients();
    if (!options.silent) {
      if (overflow) setRecipientHint(`수신 이메일은 최대 ${MAX_SCHEDULE_RECIPIENTS}명까지 등록할 수 있습니다.`, true);
      else if (invalid) setRecipientHint("올바른 이메일 주소만 추가됩니다.", true);
      else if (duplicate && !added) setRecipientHint("이미 등록된 이메일입니다.", true);
      else if (added) setRecipientHint(`${added}명 추가됨`);
    }
    return added;
  }

  function setRecipients(values) {
    recipientState.splice(0, recipientState.length);
    addRecipients(values || [], { silent: true });
    setRecipientHint();
  }

  function scheduleRecipients() {
    return recipientState.slice();
  }

  function scheduleMap(schedules) {
    return new Map((schedules || []).map((item) => [String(item.key), item]));
  }

  function scheduleTimeLabel(schedule) {
    if (!schedule) return "스케줄 정보 없음";
    const hour = String(schedule.hour ?? 0).padStart(2, "0");
    const minute = String(schedule.minute ?? 0).padStart(2, "0");
    if (schedule.report_type === "weekly_project_status") {
      return `매주 ${WEEKDAY_LABELS[schedule.day_of_week] || "월"} ${hour}:${minute}`;
    }
    return `매일 ${hour}:${minute}`;
  }

  function setScheduleStates(map) {
    SCHEDULE_ITEMS.forEach((item) => {
      const schedule = map.get(item.key);
      const toggle = document.getElementById(item.toggleId);
      const stateEl = document.getElementById(item.stateId);
      if (toggle && schedule) toggle.checked = !!schedule.enabled;
      if (stateEl) {
        stateEl.textContent = schedule?.enabled ? "활성" : "비활성";
        stateEl.className = `schedule-state status-pill ${schedule?.enabled ? "stable" : "attention"}`;
      }
    });
  }

  function renderScheduleSummary(data) {
    const summary = document.getElementById("scheduleSummaryList");
    const runtime = document.getElementById("scheduleRuntimeSummary");
    const schedules = scheduleMap(data?.schedules || []);
    if (runtime) {
      const runtimeLabel = data?.runtime?.running ? "서버 스케줄러 실행 중" : "서버 스케줄러 중지";
      const smtpLabel = data?.smtp?.configured ? "SMTP 설정됨" : "SMTP 미설정";
      runtime.textContent = `${runtimeLabel} · 작업 ${data?.runtime?.jobs ?? 0}개 · ${smtpLabel}`;
    }
    if (!summary) return;
    summary.innerHTML = SCHEDULE_ITEMS.map((item) => {
      const schedule = schedules.get(item.key);
      const enabled = schedule?.enabled ? "활성" : "비활성";
      const nextRun = schedule?.next_run_at ? formatTimestamp(schedule.next_run_at) : "계산 대기";
      const lastRun = schedule?.last_run_at ? formatTimestamp(schedule.last_run_at) : "실행 이력 없음";
      return `
        <div class="schedule-summary-item">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(enabled)} · ${escapeHtml(scheduleTimeLabel(schedule))}</span>
          <span>다음 실행: ${escapeHtml(nextRun)}</span>
          <span>최근 실행: ${escapeHtml(lastRun)}</span>
        </div>
      `;
    }).join("");
  }

  async function loadReportSchedulePrefs() {
    const status = document.getElementById("scheduleServerStatus");
    const weeklyEl = document.getElementById("schedWeeklyReport");
    if (!state.authToken || !weeklyEl) return;
    if (status) status.textContent = "스케줄 불러오는 중…";
    try {
      const data = await request("/api/report-schedules");
      const map = scheduleMap(data.schedules || []);
      const weekly = map.get("weekly-pmo");
      setScheduleStates(map);
      setRecipients(weekly?.recipients || []);
      renderScheduleSummary(data);
      if (status) {
        const runtime = data.runtime?.running ? "실행 중" : "중지";
        const smtp = data.smtp?.configured ? "SMTP 설정됨" : "SMTP 미설정";
        status.textContent = `서버 스케줄러 ${runtime} · ${smtp} · 수신자 ${scheduleRecipients().length}명`;
      }
    } catch (error) {
      if (status) status.textContent = `스케줄 조회 실패: ${error.message}`;
    }
  }

  document.getElementById("settingsTabBar")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-stg-tab='smtp']")) {
      setTimeout(loadReportSchedulePrefs, 80);
    }
  });

  document.addEventListener("click", async (event) => {
    if (!event.target.closest("#saveScheduleBtn")) return;
    const btn = document.getElementById("saveScheduleBtn");
    const status = document.getElementById("scheduleServerStatus");
    if (!btn) return;
    const recipients = scheduleRecipients();
    if (recipients.length > MAX_SCHEDULE_RECIPIENTS) {
      setRecipientHint(`수신 이메일은 최대 ${MAX_SCHEDULE_RECIPIENTS}명까지 등록할 수 있습니다.`, true);
      return;
    }

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "저장 중…";
    if (status) status.textContent = "";
    try {
      const results = [];
      for (const item of SCHEDULE_ITEMS) {
        const toggle = document.getElementById(item.toggleId);
        const result = await request(`/api/report-schedules/${item.key}`, {
          method: "PATCH",
          body: JSON.stringify({
            enabled: !!toggle?.checked,
            recipients,
            metadata: { ui_surface: "smtp-settings", recipient_policy: "shared" },
          }),
        });
        results.push(result);
      }
      const schedules = results.map((result) => result.schedule).filter(Boolean);
      const lastResult = results[results.length - 1] || {};
      const map = scheduleMap(schedules);
      setScheduleStates(map);
      renderScheduleSummary({
        schedules,
        runtime: lastResult.runtime,
        smtp: { configured: schedules.some((schedule) => schedule.smtp_configured) },
      });
      if (status) {
        const enabledCount = schedules.filter((schedule) => schedule.enabled).length;
        status.textContent = `저장 완료 · 활성 스케줄 ${enabledCount}개 · 수신자 ${recipients.length}명`;
      }
      btn.textContent = "✓ 저장됨";
      setTimeout(() => { btn.textContent = original; }, 1400);
    } catch (error) {
      if (status) status.textContent = `저장 실패: ${error.message}`;
      btn.textContent = original;
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("schedWeeklyRecipientChips")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-recipient]");
    if (!btn) return;
    const email = btn.getAttribute("data-remove-recipient");
    const index = recipientState.findIndex((item) => item === email);
    if (index >= 0) recipientState.splice(index, 1);
    renderRecipients();
    setRecipientHint("수신자 삭제됨");
  });

  const recipientInput = document.getElementById("schedWeeklyRecipientInput");
  recipientInput?.addEventListener("keydown", (event) => {
    if (!["Enter", ",", ";"].includes(event.key)) return;
    event.preventDefault();
    const input = event.currentTarget;
    addRecipients(input.value);
    input.value = "";
  });
  recipientInput?.addEventListener("blur", (event) => {
    const input = event.currentTarget;
    if (!input.value.trim()) return;
    addRecipients(input.value);
    input.value = "";
  });
  recipientInput?.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text") || "";
    if (!/[,\n;]/.test(pasted)) return;
    event.preventDefault();
    addRecipients(pasted);
  });

  renderRecipients();
})();
