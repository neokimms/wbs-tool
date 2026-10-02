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
  riTab: "risks",           // "risks" | "issues"
  riProjectFilter: "",
  riStatusFilter: "",
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
};

/* ── 사용자 가이드 콘텐츠 정의 ─────────────────────────────────────── */

const WBS_GUIDE_MENUS = [
  { id: "dashboard",  label: "대시보드" },
  { id: "portfolio",  label: "프로젝트 현황" },
  { id: "op-view",    label: "WBS 현황" },
  { id: "wbs-plan",   label: "WBS 관리" },
  { id: "templates",  label: "표준/일반 WBS 관리" },
  { id: "notes",      label: "노트/보고서" },
  { id: "settings",   label: "설정" },
];

const WBS_GUIDE_CONTENTS = {
  dashboard: {
    kind: "overview",
    hero: {
      eyebrow: "사용자 가이드",
      title: "AX WBS 포털 개요",
      description: "PMO와 프로젝트 팀이 WBS 기준선을 등록·관리하고 승인 프로세스를 운영하는 통합 포털입니다. 역할에 따라 접근 가능한 메뉴와 기능이 달라집니다.",
      tags: ["AX WBS", "PMO", "WBS", "승인"],
    },
    summary: [
      { id: "admin",  label: "관리자(admin)", value: "전체 메뉴", description: "모든 메뉴 접근 가능. 설정 탭 전체(플랫폼 설정·사용자·운영 점검·감사 로그·승인 이력·OpenProject) 사용.", tone: "good" },
      { id: "pmo",    label: "PMO",           value: "핵심 메뉴", description: "프로젝트 생성·WBS 현황·WBS 관리·승인 처리 가능. WBS 현황, 설정 탭 내 OpenProject·감사 로그 조회.", tone: "info" },
      { id: "viewer", label: "조회자",        value: "조회 전용", description: "대시보드·프로젝트 현황·WBS 관리·표준/일반 WBS 관리 조회 전용.", tone: "neutral" },
    ],
    actions: [
      { id: "go-portfolio", label: "프로젝트 현황",       description: "프로젝트 목록 확인, 승인 요청, WBS 관리 이동",                  targetView: "portfolio", tone: "good" },
      { id: "go-op-view",   label: "WBS 현황",           description: "OpenProject 동기화 완료 프로젝트의 작업패키지·간트 차트 조회",    targetView: "op-view",   tone: "info" },
      { id: "go-wbs",       label: "WBS 관리",           description: "프로젝트 WBS 항목 조회·추가·수정·삭제",                          targetView: "wbs-plan",  tone: "info" },
    ],
    resources: [
      { id: "wbs-code",  title: "WBS 코드 체계",     description: "부모 코드에 순서 번호를 붙여 계층을 표현합니다. 마일스톤은 코드에 M1·M2 접두사 사용.", meta: "WBS 코드 규칙" },
      { id: "workflow",  title: "프로젝트 상태 흐름", description: "초안 → 검토(승인 요청) → 승인 → 동기화 완료. 반려 시 초안으로 복귀.", meta: "승인 워크플로우" },
      { id: "menu-map",  title: "메뉴 구성 (7개)",    description: "대시보드 / 프로젝트 현황 / WBS 현황 / WBS 관리 / 표준·일반 WBS 관리 / 설정(6탭) / 사용자 가이드", meta: "메뉴 구조" },
    ],
  },

  portfolio: {
    kind: "procedure",
    hero: {
      eyebrow: "프로젝트 현황",
      title: "프로젝트 등록부터 승인까지",
      description: "PMO 권한으로 프로젝트를 생성하고, WBS를 등록한 뒤 승인을 요청합니다. 승인 후 OpenProject 동기화가 가능합니다.",
      tags: ["프로젝트 생성", "WBS 등록", "승인 요청", "상세 정보"],
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
        checks: ["프로젝트명(파란색 링크) 클릭", "기본 정보·단계 구성·WBS 현황·승인 이력 확인", "빠른 액션: WBS 관리 열기·승인 요청·OpenProject 연계"],
      },
      {
        id: "wbs", order: 3, title: "WBS 등록",
        outcome: "WBS 관리 메뉴에서 항목을 직접 추가하거나 Excel을 업로드합니다.",
        targetView: "wbs-plan", status: "ready",
        checks: ["WBS 관리 버튼 클릭 또는 좌측 WBS 관리 메뉴 이동", "프로젝트 선택 후 행 추가 또는 ↑ Excel 업로드"],
      },
      {
        id: "approval", order: 4, title: "승인 요청",
        outcome: "PMO가 프로젝트 행의 승인 요청 버튼을 클릭하면 검토 상태로 변경되고 PMO Lead 승인 대기가 됩니다.",
        targetView: "portfolio", status: "ready",
        checks: ["프로젝트 목록에서 승인 요청 버튼 클릭", "설정 > 승인 이력 탭에서 대기 항목 확인", "PMO Lead가 승인/반려 처리"],
        caution: "승인 전에는 OpenProject 실제 동기화가 차단됩니다.",
      },
    ],
    guardrails: [
      "프로젝트 상태가 승인이어야 OpenProject 동기화 버튼이 활성화됩니다.",
      "반려 시 담당자는 WBS 관리에서 내용을 수정한 뒤 재승인 요청합니다.",
      "필터 버튼(전체·진행·완료·반려)으로 상태별 프로젝트 목록을 확인합니다.",
    ],
  },

  "wbs-plan": {
    kind: "procedure",
    hero: {
      eyebrow: "WBS 관리",
      title: "프로젝트 WBS 항목 관리",
      description: "프로젝트를 선택하고 WBS 항목을 조회·추가·수정·삭제합니다. 행 추가 다이얼로그 또는 Excel 업로드로 대량 등록이 가능합니다. 업로드 이력 관리 및 WBS 초기화 기능을 제공합니다.",
      tags: ["WBS 항목", "계층 구조", "행 추가", "Excel 업로드", "이력 관리"],
    },
    steps: [
      {
        id: "select", order: 1, title: "프로젝트 선택",
        outcome: "상단 드롭다운에서 프로젝트를 선택하면 해당 프로젝트의 WBS 항목이 보드에 표시됩니다.",
        status: "ready",
        checks: ["상단 [프로젝트 선택] 드롭다운 클릭", "프로젝트명과 상태 확인 후 선택"],
      },
      {
        id: "view", order: 2, title: "WBS 보드 확인",
        outcome: "유형별 색상 코딩(단계=파랑·작업=초록·산출물=보라·마일스톤=주황)으로 계층 구조를 시각적으로 확인합니다.",
        status: "ready",
        checks: ["▼/▶ 버튼으로 단계별 접기·펼치기", "검색 및 단계·유형 필터로 원하는 항목 탐색"],
      },
      {
        id: "add", order: 3, title: "행 추가",
        outcome: "행 추가 버튼으로 다이얼로그를 열어 WBS 코드·작업명·유형·담당자·가중치·일정을 입력합니다.",
        status: "ready",
        checks: ["행 추가 버튼 클릭", "작업명(필수) 입력, WBS 코드는 비워두면 자동 생성", "상위 항목 안에 하위 항목 추가 시 ＋ 하위 버튼 사용"],
      },
      {
        id: "edit-del", order: 4, title: "수정·삭제",
        outcome: "항목 행에 마우스를 올리면 수정·삭제·＋하위 버튼이 나타납니다.",
        status: "ready",
        checks: ["수정: 기존 값이 채워진 다이얼로그에서 변경 후 저장", "삭제: 해당 항목과 모든 하위 항목이 함께 삭제됨"],
        caution: "삭제는 하위 항목을 포함해 즉시 적용됩니다. 저장 버튼으로 최종 확정하세요.",
      },
      {
        id: "upload", order: 5, title: "Excel 일괄 업로드",
        outcome: "표준/일반 WBS 관리 메뉴 [Excel 업로드] 탭에서 파일을 업로드합니다. 검증 후 [반영] 버튼을 클릭하면 WBS 항목이 프로젝트에 적용됩니다.",
        status: "ready",
        targetView: "templates",
        checks: [
          "표준/일반 WBS 관리 > Excel 업로드 탭 이동",
          "일반 WBS 선택 후 프로젝트 드롭다운에서 대상 프로젝트 선택 (필수)",
          "Excel 파일 업로드 — 동일 파일 재업로드 시 기존 미리보기 재사용 여부를 확인",
          "항목 목록 검증 완료 후 [반영] 버튼 클릭",
          "반영 완료 시 WBS 관리 메뉴로 자동 이동하여 결과 확인",
        ],
        caution: "프로젝트를 먼저 선택해야 반영 버튼이 활성화됩니다. 프로젝트 상태가 초안·검토·반려인 경우에만 업로드가 가능합니다.",
      },
      {
        id: "import-history", order: 6, title: "업로드 이력 관리",
        outcome: "Excel 업로드 탭의 이력 목록에서 과거 업로드 건을 확인하고 불필요한 항목을 삭제합니다.",
        status: "ready",
        checks: [
          "이력 목록에서 각 업로드 건의 상태(미리보기/반영 완료) 확인",
          "불필요한 이력 항목 오른쪽 ✕ 버튼으로 삭제",
          "반영 완료(Applied) 상태의 이력은 삭제 불가 — 업로드 기록 보존 목적",
        ],
        caution: "이력 삭제는 WBS 데이터에는 영향을 주지 않습니다. 업로드 히스토리 레코드만 삭제됩니다.",
      },
      {
        id: "clear", order: 7, title: "WBS 초기화",
        outcome: "WBS 관리 툴바의 [초기화] 버튼으로 현재 프로젝트의 WBS 항목 전체를 삭제합니다.",
        status: "ready",
        checks: [
          "프로젝트 선택 후 툴바의 [초기화] 버튼 클릭 (WBS 항목이 있을 때 활성화)",
          "확인 다이얼로그에서 삭제 확정",
          "초기화 후 Excel 업로드로 새 WBS 등록 가능",
        ],
        caution: "초기화는 해당 프로젝트의 모든 WBS 항목을 즉시 삭제합니다. 프로젝트 상태가 초안·검토·반려인 경우에만 실행 가능합니다.",
      },
      {
        id: "save", order: 8, title: "저장",
        outcome: "저장 버튼을 클릭하면 모든 변경사항이 서버에 반영됩니다.",
        status: "ready",
        checks: ["저장 버튼 클릭 (변경사항 있을 때만 활성화)", "프로젝트 상태가 초안·검토·반려일 때만 편집 가능"],
        caution: "승인 완료·동기화 완료 상태의 프로젝트는 WBS 수정이 불가합니다.",
      },
    ],
    questions: [
      { id: "q-code",    question: "WBS 코드를 비워두면 어떻게 되나요?",         answer: "레벨과 행 순서 기반으로 자동 생성됩니다. 예) SI.1.1" },
      { id: "q-sync",    question: "동기화 상태가 '대기'인 것은 무엇인가요?",     answer: "OpenProject와 아직 연동되지 않은 항목입니다. 설정 > OpenProject 탭에서 동기화를 실행하면 '완료'로 변경됩니다." },
      { id: "q-approve", question: "저장 버튼이 비활성화되어 있습니다.",          answer: "변경사항이 없거나 프로젝트 상태가 승인 이후 단계입니다. 반려된 프로젝트는 다시 수정 가능합니다." },
      { id: "q-upload",  question: "동일한 Excel 파일을 다시 업로드하면 어떻게 되나요?", answer: "이미 같은 파일로 미리보기 중인 이력이 있으면 재사용 여부를 묻는 팝업이 표시됩니다. 재사용하면 파일을 다시 전송하지 않습니다." },
      { id: "q-clear",   question: "초기화 버튼이 비활성화되어 있습니다.",         answer: "등록된 WBS 항목이 없거나 프로젝트를 선택하지 않은 상태입니다. 또는 승인/동기화 완료 상태의 프로젝트는 초기화가 불가합니다." },
    ],
  },

  templates: {
    kind: "task-list",
    hero: {
      eyebrow: "표준/일반 WBS 관리",
      title: "표준 WBS 조회 및 Excel 업로드",
      description: "회사 공식 표준 WBS 3종(SI 구축·데이터 이관·유지보수)을 확인하고 다운로드합니다. Excel 업로드 탭에서 표준 또는 프로젝트별 WBS를 업로드할 수 있습니다.",
      tags: ["표준 WBS", "일반 WBS", "미리보기", "Excel 업로드"],
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
        description: "각 템플릿 카드의 ↓ Excel 버튼을 클릭합니다. WBS 코드·작업명·유형·가중치·일정이 포함된 워크북이 다운로드됩니다.",
        status: "ready", required: true, targetView: "templates",
        checks: ["원하는 유형(SI 구축/데이터 이관/유지보수)의 ↓ Excel 클릭", "Guide 시트에서 작성 규칙 확인"],
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
        checks: [
          "[표준 WBS]: 선택한 표준 템플릿 항목 교체 — 해당 유형 신규 프로젝트에 적용",
          "[일반 WBS]: 프로젝트 드롭다운에서 대상 프로젝트 선택 (필수) 후 파일 업로드",
          "검증 통과 후 [반영] 버튼 클릭 — 반영 완료 시 WBS 관리 메뉴로 자동 이동",
          "업로드 이력 목록에서 각 항목 오른쪽 ✕ 버튼으로 불필요한 이력 삭제 가능",
        ],
        caution: "표준 WBS 교체는 해당 유형을 사용하는 신규 프로젝트에 영향을 줍니다. 일반 WBS는 프로젝트를 먼저 선택해야 반영이 가능합니다.",
      },
    ],
    guardrails: [
      "표준 WBS는 회사 공식 양식입니다. 수정 시 변경 이력이 자동으로 저장됩니다.",
      "일반 WBS 업로드는 프로젝트 상태가 초안·검토·반려일 때만 가능합니다.",
      "반영 완료(Applied) 상태의 업로드 이력은 삭제할 수 없습니다 — 이력 보존 목적.",
      "동일한 파일을 다시 업로드하면 기존 미리보기 이력 재사용 여부를 선택할 수 있습니다.",
    ],
  },

  "op-view": {
    kind: "procedure",
    hero: {
      eyebrow: "WBS 현황",
      title: "WBS 현황 — 작업패키지 & 간트 차트",
      description: "OpenProject와 동기화 완료된 프로젝트의 작업패키지 목록과 간트 차트를 AX WBS 포털에서 직접 확인합니다. 로그인 없이 OpenProject 데이터를 조회할 수 있습니다.",
      tags: ["작업패키지", "간트 차트", "OpenProject", "WBS 현황"],
    },
    steps: [
      {
        id: "select", order: 1, title: "프로젝트 선택",
        outcome: "상단 드롭다운에서 동기화 완료 프로젝트를 선택합니다.",
        status: "ready",
        checks: ["드롭다운에는 상태가 '동기화 완료'인 프로젝트만 표시됩니다", "목록이 비어 있으면 먼저 프로젝트를 승인 후 설정 > OpenProject 탭에서 동기화를 실행하세요"],
      },
      {
        id: "wp", order: 2, title: "작업패키지 목록 확인",
        outcome: "OpenProject의 작업패키지가 AX WBS 스타일로 계층 목록으로 표시됩니다.",
        status: "ready",
        checks: ["유형별 색상 코딩(단계·작업·산출물·마일스톤 등)", "상태 배지: 진행 중, 완료 등 (미시작 상태는 배지 미표시)", "검색 및 유형 필터 사용 가능"],
      },
      {
        id: "gantt", order: 3, title: "간트 차트 확인",
        outcome: "WBS 항목의 시작일·종료일을 기반으로 타임라인 간트 차트를 표시합니다. 각 바 안에 업무명과 기간(시작일~종료일)이 함께 표시되어 한눈에 확인 가능합니다.",
        status: "ready",
        checks: [
          "📊 간트 차트 탭 클릭",
          "오늘 날짜 기준선 표시됨",
          "진척률(%) 바가 바 안에 표시됩니다",
          "바 안에 업무명과 기간(예: 요구사항 분석 (2026-01-01~2026-01-31)) 텍스트 표시",
        ],
        caution: "일정(시작일·종료일)이 없는 항목은 간트 바가 표시되지 않습니다. WBS 관리에서 날짜를 입력하세요.",
      },
      {
        id: "refresh", order: 4, title: "최신 데이터 가져오기",
        outcome: "↻ 새로고침 버튼으로 OpenProject에서 최신 진척률·상태를 가져옵니다.",
        status: "ready",
        checks: ["새로고침 버튼 클릭 → OP API 재조회", "OpenProject 오프라인 시 포털 로컬 데이터가 표시됩니다"],
      },
    ],
    questions: [
      { id: "q1", question: "동기화 완료 프로젝트가 목록에 없습니다.",        answer: "프로젝트 현황에서 '승인' 상태인 프로젝트를 선택 후, 설정 > OpenProject 탭에서 동기화를 먼저 실행하세요." },
      { id: "q2", question: "간트 차트가 표시되지 않습니다.",                 answer: "WBS 항목에 시작일과 종료일이 입력되어야 간트 바가 표시됩니다. WBS 관리 메뉴에서 날짜를 입력하세요." },
      { id: "q3", question: "상태가 '미시작'인 항목이 있습니다.",             answer: "OpenProject의 기본 상태(New)로 아직 작업이 시작되지 않은 항목입니다. OpenProject에서 상태를 변경하면 진행 중/완료 배지가 표시됩니다." },
      { id: "q4", question: "작업패키지 목록과 WBS 관리의 차이가 무엇인가요?", answer: "WBS 관리는 AX WBS 내에서 항목을 추가·수정·삭제하는 편집 화면입니다. WBS 현황은 OpenProject로 전송된 항목의 실시간 상태를 조회하는 뷰어입니다." },
    ],
  },

  notes: {
    kind: "reference",
    hero: {
      eyebrow: "노트/보고서",
      title: "노트 / 보고서 작성 및 관리",
      description: "폴더 기반으로 노트를 분류하고 리치 텍스트 에디터로 주간 보고서·월간 보고서·회의록·이슈 보고서를 작성합니다. 삭제된 노트는 숨김 처리되어 DB에 보존되며 관리자가 복구할 수 있습니다.",
      tags: ["노트", "보고서", "회의록", "소프트 딜리트", "이력 관리"],
    },
    summary: [
      { id: "folder",   label: "폴더 관리",    value: "전체",   description: "폴더 생성·이름 변경·삭제 가능. 기본 폴더 4개(주간 보고·월간 보고·회의록·기타) 제공.", tone: "info" },
      { id: "editor",   label: "리치 텍스트",  value: "전체",   description: "제목·본문 에디터. 굵게·기울임·밑줄·제목(H1~H3)·목록·표·코드블록·인용문 지원. 1.2초 자동 저장.", tone: "good" },
      { id: "template", label: "보고서 템플릿", value: "전체",   description: "주간 보고서·월간 보고서·회의록·이슈 보고 4종 템플릿. 날짜·주차 자동 입력.", tone: "good" },
      { id: "softdel",  label: "삭제 보존",    value: "전체",   description: "삭제 버튼 클릭 시 노트가 숨김 처리됩니다. DB 레코드는 유지되며 관리자가 복구 가능합니다.", tone: "warn" },
    ],
    actions: [
      { id: "new-note",     label: "+ 새 노트",      description: "현재 선택된 폴더에 빈 노트를 생성합니다.",                       targetView: "notes", tone: "good" },
      { id: "template-btn", label: "템플릿 적용",    description: "에디터 우측 상단 '📋 템플릿' 버튼으로 4종 보고서 양식을 삽입합니다.", targetView: "notes", tone: "info" },
      { id: "print-btn",    label: "인쇄",           description: "'🖨️ 인쇄' 버튼으로 별도 창에서 인쇄 최적화 뷰를 열어 PDF로 저장하거나 출력합니다.", targetView: "notes", tone: "info" },
    ],
    resources: [
      { id: "autosave",    title: "자동 저장",        description: "제목 또는 내용 수정 후 1.2초 경과 시 자동 저장됩니다. 에디터 하단 '저장됨 HH:MM' 상태가 표시됩니다.", meta: "저장 방식" },
      { id: "folder-del",  title: "폴더 삭제 주의",   description: "폴더 삭제 시 해당 폴더의 노트는 미분류(폴더 없음) 상태로 이동됩니다. 노트 내용은 삭제되지 않습니다.", meta: "데이터 보존" },
      { id: "soft-delete", title: "소프트 딜리트 구조", description: "노트 삭제 → deleted_at 컬럼에 시각 기록 → 목록에서 숨김. 감사 로그(설정 > 감사 로그)에 'note.deleted' 이벤트로 기록됩니다.", meta: "이력 관리" },
      { id: "restore",     title: "삭제 노트 복구",   description: "admin 계정으로 API 직접 호출: POST /api/notes/{id}/restore. 복구 시 'note.restored' 감사 이벤트 생성.", meta: "admin 전용" },
      { id: "audit-note",  title: "감사 로그 연동",   description: "노트 생성(note.created)·삭제(note.deleted)·복구(note.restored) 이벤트가 설정 > 감사 로그 탭에서 조회됩니다.", meta: "감사 추적" },
    ],
    guardrails: [
      "삭제 버튼은 노트를 완전히 삭제하지 않습니다. 숨김 처리되어 DB에 보존됩니다.",
      "폴더 삭제(🗑 버튼)는 폴더만 삭제하며 노트는 미분류로 이동됩니다.",
      "삭제된 노트 복구는 admin 권한 계정으로 API를 통해서만 가능합니다.",
      "자동 저장은 마지막 입력으로부터 1.2초 후 실행됩니다. 브라우저를 바로 닫으면 미저장 내용이 손실될 수 있습니다.",
    ],
  },
  settings: {
    kind: "reference",
    hero: {
      eyebrow: "설정",
      title: "설정 메뉴 안내 (6개 탭)",
      description: "설정 메뉴는 플랫폼 설정·승인 이력·운영 점검·사용자·감사 로그·OpenProject 6개 탭으로 구성됩니다. 탭별 접근 권한이 다릅니다.",
      tags: ["플랫폼 설정", "승인 이력", "운영 점검", "OpenProject 연계"],
    },
    summary: [
      { id: "platform",     label: "플랫폼 설정",    value: "admin",  description: "PM 엔진 어댑터(mock/openproject) 및 환경 변수 설정. admin 전용.", tone: "warn" },
      { id: "approvals",    label: "승인 이력",       value: "pmo+",   description: "프로젝트별 승인 파이프라인(초안→검토→승인) 및 승인/반려 처리 목록.", tone: "info" },
      { id: "operations",   label: "운영 점검",       value: "pmo+",   description: "18개 헬스체크 항목(DB·마이그레이션·백업·CORS 등). PMO/admin.", tone: "info" },
      { id: "users",        label: "사용자",          value: "admin",  description: "포털 계정 생성·역할 변경·비밀번호 초기화·세션 종료. admin 전용.", tone: "warn" },
      { id: "audit",        label: "감사 로그",       value: "pmo+",   description: "인증·프로젝트·승인·시스템 이벤트 5개 서브탭 분류 + 스크롤.", tone: "info" },
      { id: "openproject",  label: "OpenProject",    value: "pmo+",   description: "동기화 실행(점검→모의→실제), 역방향 상태 가져오기, Webhook URL, 인스턴스 연결 확인.", tone: "info" },
    ],
    resources: [
      { id: "approval-flow",  title: "승인 이력 탭",       description: "승인 요청 → 검토(Pending) → PMO Lead 승인/반려 파이프라인 카드 형태. 반려 후 WBS 수정 → 재승인 요청 가능.", meta: "승인 프로세스" },
      { id: "op-tab",         title: "OpenProject 탭",    description: "점검(4개 체크) → 모의 실행(payload 확인) → 동기화(Approved 상태만 가능). 역방향 Pull 및 Webhook 설정 포함.", meta: "OP 동기화" },
      { id: "audit-tabs",     title: "감사 로그 탭",       description: "전체·인증·프로젝트/WBS·승인·시스템 5개 서브탭. 365일 보존, 화면 최대 높이 기준 스크롤.", meta: "로그 분류" },
      { id: "env-vars",       title: "주요 환경 변수",     description: "PM_ENGINE_ADAPTER, OPENPROJECT_SYNC_ENABLED, OPENPROJECT_API_TOKEN, WBS_SESSION_TTL_HOURS", meta: ".env 파일" },
    ],
    guardrails: [
      "플랫폼 설정·사용자 탭은 admin 권한 전용입니다.",
      "OpenProject 탭에서 동기화 버튼은 프로젝트 상태가 '승인'일 때만 활성화됩니다.",
      "역방향 Pull 버튼은 OpenProject에서 상태를 가져와 AX WBS 항목의 진척률을 업데이트합니다.",
    ],
  },
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
    // 세션 만료: 로그아웃 API 자체가 아닌 요청에서 401이 오면 자동 세션 정리
    if (response.status === 401 && !path.includes("/api/auth/")) {
      clearSession("세션이 만료되었습니다. 다시 로그인해 주세요.");
      throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
    }
    let detail = `Request failed: ${response.status}`;
    try {
      const errorBody = await response.json();
      detail = typeof errorBody.detail === "string" ? errorBody.detail : JSON.stringify(errorBody.detail || detail);
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

  /* ── 역할 기반 메뉴 표시/숨김 ── */
  const userLevel = ROLE_LEVEL[state.currentUser?.role] || 0;
  document.querySelectorAll(".nav-list a[data-min-role]").forEach((link) => {
    const minLevel = ROLE_LEVEL[link.dataset.minRole] || 1;
    link.classList.toggle("nav-role-hidden", userLevel < minLevel);
    link.hidden = userLevel < minLevel;
  });

  /* ── 설정 탭 권한별 표시 ── */
  const stgTabBar = document.querySelector("#settingsTabBar");
  if (stgTabBar) {
    stgTabBar.querySelectorAll(".stg-tab[data-stg-tab]").forEach((btn) => {
      const tab = btn.dataset.stgTab;
      let visible = true;
      if (tab === "platform")     visible = canViewSettings();
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

function renderPortfolioMeta() {
  const meta = document.querySelector("#portfolioMeta");
  if (!meta) return;
  const m       = state.dashboard.metrics || {};
  const total   = m.projects || state.projects.length;
  const pending = m.pending_approvals || 0;
  const risks   = m.risk_count || 0;
  const issues  = m.issue_count || 0;
  const spi     = m.portfolio_spi;
  const syncLbl = syncStateLabel(state.pmPreflight?.state);
  const syncCls = syncStateClass(state.pmPreflight?.state);

  const spiHtml = spi != null
    ? `<span>SPI <strong class="${spi >= 1 ? "kpi-good" : spi >= 0.8 ? "kpi-warn" : "kpi-bad"}">${spi.toFixed(2)}</strong></span>`
    : "";
  const riskHtml = risks > 0
    ? `<span class="kpi-badge kpi-risk">리스크 <strong>${risks}</strong></span>`
    : "";
  const issueHtml = issues > 0
    ? `<span class="kpi-badge kpi-issue">이슈 <strong>${issues}</strong></span>`
    : "";

  meta.innerHTML = `
    <span><strong>${total}</strong>개 프로젝트</span>
    <span><strong>${pending}</strong>건 승인 대기</span>
    ${spiHtml}
    ${riskHtml}
    ${issueHtml}
    <span>OpenProject <span class="status-pill ${syncCls}" style="font-size:0.72rem;padding:1px 7px">${escapeHtml(syncLbl)}</span></span>
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
}

function renderTemplates() {
  /* ── 표준 WBS 목록 (3개 분류) ── */
  const templateList = document.querySelector("#templateList");
  if (templateList) {
    // 3개 방법론 분류
    const METHOD_GROUPS = [
      {
        key: "waterfall",
        label: "Waterfall / SI 계열",
        icon: "🏗️",
        types: ["System Integration", "Maintenance", "Data Migration"],
        color: "var(--blue)",
      },
      {
        key: "agile",
        label: "Agile / 스크럼",
        icon: "🔄",
        types: ["Agile"],
        color: "#1f9d55",
      },
      {
        key: "hybrid",
        label: "Hybrid / 혼합형",
        icon: "⚡",
        types: ["Hybrid"],
        color: "#7356bf",
      },
    ];

    const makeCard = (template) => {
      const meta = [
        escapeHtml(projectTypeLabel(template.project_type)),
        template.item_count ? `${template.item_count}개 항목` : null,
      ].filter(Boolean).join(" · ");
      return `
      <div class="template-card">
        <div class="template-card-info">
          <strong>${escapeHtml(template.name)}</strong>
          <span>${meta}</span>
          <span class="tpl-sep">|</span>
          <p>${escapeHtml(template.description)}</p>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button class="secondary-button" type="button"
            data-template-preview="${escapeHtml(template.key)}"
            style="font-size:0.76rem;padding:0 10px;min-height:26px"
            title="웹에서 미리보기">🔍 미리보기</button>
          <button class="secondary-button" type="button"
            data-template-download="${escapeHtml(template.key)}"
            style="font-size:0.76rem;padding:0 10px;min-height:26px"
            title="${escapeHtml(template.name)} Excel 다운로드">↓ Excel</button>
        </div>
      </div>`;
    };

    const html = METHOD_GROUPS.map((group) => {
      const groupTemplates = state.templates.filter((t) => group.types.includes(t.project_type));
      if (!groupTemplates.length) return "";
      return `
      <div class="tpl-method-group">
        <div class="tpl-method-header">
          <span class="tpl-method-icon">${group.icon}</span>
          <span class="tpl-method-label" style="color:${group.color}">${group.label}</span>
          <span class="tpl-method-count">${groupTemplates.length}종</span>
        </div>
        ${groupTemplates.map(makeCard).join("")}
      </div>`;
    }).join("");

    templateList.innerHTML = html ||
      `<div class="wbs-board-empty"><strong>등록된 표준 WBS 없음</strong><span>API 연결 후 자동으로 불러옵니다.</span></div>`;
  }

  /* ── 일반 WBS (프로젝트별) 목록 ── */
  renderCustomWbsList();
}

function renderCustomWbsList() {
  const container = document.querySelector("#customWbsList");
  if (!container) return;

  const projects = state.apiConnected ? state.projects : fallbackProjects;
  if (!projects.length) {
    container.innerHTML = `<div class="custom-wbs-empty">등록된 프로젝트가 없습니다. 프로젝트를 먼저 생성하세요.</div>`;
    return;
  }

  container.innerHTML = projects.map((p) => {
    const wbsCount = p.id && state.wbsPlanProjectId === p.id ? state.wbsPlanRows.length : null;
    const countText = wbsCount != null ? `WBS ${wbsCount}개 항목` : "";
    const meta = p.metadata || {};
    const desc = [
      escapeHtml(projectTypeLabel(p.template_key)),
      countText ? escapeHtml(countText) : null,
    ].filter(Boolean).join(" · ");
    return `
      <div class="template-card">
        <div class="template-card-info">
          <strong>${escapeHtml(p.name)}</strong>
          <span>${desc}</span>
          ${meta.description ? `<span class="tpl-sep">|</span><p>${escapeHtml(meta.description)}</p>` : ""}
        </div>
        <span class="status-pill ${statusClass(p.status)}" style="flex-shrink:0">${statusLabel(p.status)}</span>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <button class="secondary-button" type="button"
            data-custom-wbs-preview="${escapeHtml(p.id || "")}"
            ${p.id ? "" : "disabled"}
            style="font-size:0.76rem;padding:0 10px;min-height:26px"
            title="${escapeHtml(p.name)} WBS 미리보기">🔍 미리보기</button>
          <button class="secondary-button" type="button"
            data-custom-wbs-upload="${escapeHtml(p.id || "")}"
            ${(p.id && ["Draft","Review","Rejected"].includes(p.status) && canMutateWork()) ? "" : "disabled"}
            style="font-size:0.76rem;padding:0 10px;min-height:26px">↑ Excel</button>
        </div>
      </div>`;
  }).join("");
}

/* 일반 WBS 목록에서 빠른 업로드 (선택 프로젝트 → Excel 업로드 탭 이동) */
function navigateToProjectWbs(projectId) {
  // templateDrawer 닫기
  const drawer = document.querySelector("#templateDrawer");
  if (drawer) drawer.hidden = true;
  // #importApplyNotice 초기화
  const noticeEl = document.querySelector("#importApplyNotice");
  if (noticeEl) noticeEl.hidden = true;
  // WBS 관리 섹션으로 이동 후 프로젝트 로드
  window.location.hash = "wbs-plan";
  // hash 변경 후 프로젝트 선택 드롭다운에 반영
  requestAnimationFrame(() => {
    const sel = document.querySelector("#wbsPlanProjectSelect");
    if (sel && projectId) {
      sel.value = projectId;
      sel.dispatchEvent(new Event("change"));
    }
  });
}

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

function renderProjects() {
  const all = state.apiConnected ? state.projects : state.projects.length ? state.projects : fallbackProjects;
  const allowedStatuses = PORTFOLIO_FILTER_STATUSES[state.portfolioFilter];
  const rows = allowedStatuses ? all.filter((p) => allowedStatuses.includes(p.status)) : all;
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
        return `
          <tr class="${isSelected ? "selected-row" : ""}">
            <td>
              <span class="project-name-link"
                data-project-action="detail" data-project-id="${project.id || ""}"
                role="button" tabindex="0">${escapeHtml(project.name)}</span>
            </td>
            <td>${escapeHtml(project.owner)}</td>
            <td><span class="status-pill ${statusClass(project.status)}">${statusLabel(project.status)}</span></td>
            <td>${escapeHtml(projectTypeLabel(project.template_key))}</td>
            <td>${escapeHtml(project.start_date || "-")}</td>
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
    : `<tr class="empty-row"><td colspan="6">${allowedStatuses ? "해당 상태의 프로젝트 없음" : "등록된 프로젝트 없음"}</td></tr>`;
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
        <button type="button" data-drawer-action="approval" data-project-id="${escapeHtml(project.id)}" ${canRequestApproval ? "" : "disabled"}>승인 요청</button>
        <button type="button" data-drawer-action="sync" data-project-id="${escapeHtml(project.id)}">OpenProject 연계</button>
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
          <dt>OpenProject</dt>
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
/* 승인 파이프라인 3단계 (동기화는 별도 배지) */
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

  /* 동기화 배지 (OpenProject 연동 상태) */
  const isSynced  = project.status === "Synced" || project.status === "Closed";
  const hasSyncId = Boolean(project.openproject_project_id);
  const syncBadge = (isSynced || hasSyncId)
    ? `<span class="pipe-sync-badge ${isSynced ? "synced" : "linked"}">🔗 ${isSynced ? "OpenProject 동기화 완료" : "OpenProject 연결됨"}</span>`
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
          const canDelete = job.status !== "Applied";
          return `
            <div class="import-job-row ${selected ? "selected-import-job" : ""}">
              <button
                class="import-job"
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
              ${canDelete ? `<button class="import-job-delete-btn" type="button" title="이력 삭제" data-import-job-delete="${escapeHtml(job.id)}">✕</button>` : ""}
            </div>
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

async function deleteImportJob(jobId) {
  if (!window.confirm("이 업로드 이력을 삭제하시겠습니까?")) return;
  try {
    await request(`/api/imports/${encodeURIComponent(jobId)}`, { method: "DELETE" });
    state.importJobs = state.importJobs.filter((j) => j.id !== jobId);
    if (state.selectedImportJobId === jobId) {
      state.selectedImportJobId = null;
      state.pendingImportJobId  = null;
      renderApplyButton();
      document.querySelector("#importStatus").textContent = "대기";
      document.querySelector("#importStatus").className = "status-pill attention";
    }
    renderImportHistory();
  } catch (error) {
    alert(error.message);
  }
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

  const hasProject  = Boolean(selector.value);
  const canMutate   = canMutateWork();
  const canSyncAction = hasProject && canMutate;

  // 프로젝트 상태 확인 — Approved만 실 동기화 허용
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

  // 동기화 버튼 tooltip — 상태에 따라 안내 메시지 변경
  let syncTitle = "OpenProject 작업 패키지를 생성합니다";
  if (!state.pmPreflight?.ready_for_actual_sync) {
    syncTitle = "점검 버튼을 클릭해 연계 상태를 확인하세요";
  } else if (isSynced) {
    syncTitle = `프로젝트 상태가 '${statusLabel(projectStatus)}'입니다. 동기화가 이미 완료된 프로젝트입니다.`;
  } else if (!isApproved && hasProject) {
    syncTitle = `프로젝트 상태가 '${statusLabel(projectStatus)}'입니다. 승인(Approved) 상태에서만 동기화 가능합니다.`;
  }
  document.querySelector("#syncRunButton").title = syncTitle;
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
  const selProj   = state.projects.find((p) => p.id === selectedSyncProjectId());
  const projState = selProj ? ` · 프로젝트: ${statusLabel(selProj.status)}` : "";
  document.querySelector("#syncState").textContent =
    (preflight.ready_for_actual_sync ? "실제 동기화 준비" : "모의 실행 모드") + projState;

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
    if (statusEl) statusEl.textContent = "동기화된 프로젝트를 선택하면 상태 가져오기가 활성화됩니다.";
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
      statusEl.textContent = "아직 동기화된 작업 패키지가 없습니다. 승인 시 자동 동기화되거나 수동 동기화를 실행하세요.";
    } else {
      const lastPull  = engineMeta.last_pull_at;
      const lastSync  = engineMeta.last_sync_at;
      const autoNote  = isAutoSynced ? " (승인 시 자동 동기화)" : "";
      const pullNote  = lastPull ? ` · Pull: ${formatTimestamp(lastPull)}` : "";
      const syncNote  = lastSync ? ` · Push: ${formatTimestamp(lastSync)}` : "";
      statusEl.textContent = `${wpCount}개 항목 매핑됨${autoNote}${syncNote}${pullNote}`;
    }
  }
}

/* 자동 동기화 상태 배지 업데이트 */
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
      `<span class="op-meta-item">실 동기화 <strong>${syncEnabled ? "✓ 허용" : "✗ 비활성"}</strong></span>`,
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

/* 동기화 완료 프로젝트 목록 + OP 뷰 링크 */
function renderSyncedProjectsList() {
  const container   = document.querySelector("#opSyncedProjectList");
  const countEl     = document.querySelector("#syncedProjectCount");
  if (!container) return;

  const engine      = state.pmPreflight?.engine || state.pmPreflight?.runtime || {};
  const baseUrl     = engine.base_url || "http://localhost:8080";
  const syncedProjects = state.projects.filter((p) =>
    (p.status === "Synced" || p.status === "Closed") && p.openproject_project_id
  );

  if (countEl) countEl.textContent = syncedProjects.length;

  if (!syncedProjects.length) {
    container.innerHTML = `<p class="sync-pull-status">동기화 완료된 프로젝트가 없습니다. 승인된 프로젝트를 동기화하면 여기에 표시됩니다.</p>`;
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
          <a class="op-link-btn" href="${wpUrl}" target="_blank" rel="noopener" title="작업패키지 목록">
            📋 작업패키지
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

function renderUsersPanel() {
  if (!document.querySelector("#userRows")) return;
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

/* 감사 로그 이벤트 분류 */
const AUDIT_TAB_TYPES = {
  all:      null,
  auth:     ["auth.login", "auth.logout", "auth.login_failed", "auth.login_locked",
             "auth.password_changed", "auth.password_change_failed"],
  project:  ["project.created", "project.status_changed",
             "import.previewed", "import.created", "import.applied",
             "project_wbs.import_applied", "template.resequenced"],
  approval: ["approval.created", "approval.approved", "approval.rejected"],
  system:   ["user.created", "user.updated", "user.sessions_revoked",
             "setting.updated", "pm_engine.sync_recorded"],
};

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
    ? filtered.map((event) => `
        <article class="audit-event">
          <div>
            <strong>${escapeHtml(auditSummaryLabel(event.summary))}</strong>
            <small>${escapeHtml(eventTypeLabel(event.event_type))} · ${escapeHtml(event.actor_email || "시스템")}</small>
          </div>
          <span>${escapeHtml(formatTimestamp(event.created_at))}</span>
        </article>`).join("")
    : `<article class="audit-event empty-run"><div><strong>이벤트 없음</strong><small>해당 분류의 감사 이력이 없습니다.</small></div></article>`;
}

/* ── 설정 탭 전환 ──────────────────────────────── */
const STG_TABS = ["platform", "approvals", "operations", "users", "audit", "openproject", "auth", "smtp", "tenants"];

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
  document.querySelector("#settingsEngineRuntime").textContent = engine.enabled ? "실제 동기화 허용" : "모의 실행 보호";
  document.querySelector("#settingsJsonInput").value = setting ? JSON.stringify(setting.value || {}, null, 2) : "{}";
  document.querySelector("#settingsJsonInput").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsSaveButton").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsStatus").textContent = state.settingsStatus;
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
    return `<button class="guide-menu-btn ${isActive ? "active" : ""}" type="button" data-guide-view="${escapeHtml(menu.id)}">${escapeHtml(menu.label)}</button>`;
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
          <span class="wbs-sync-badge ${syncedCls}">${row.already_synced ? "✓ 동기화" : "대기"}</span>
          ${meta.op_status ? `<span class="wbs-op-status-badge ${meta.op_status === "완료" || meta.op_progress >= 100 ? "done" : ""}">OP: ${escapeHtml(meta.op_status)}</span>` : ""}
          ${meta.op_progress != null ? `<span class="wbs-op-progress-text">${meta.op_progress}%</span>` : ""}
        </div>
      </div>
      ${meta.op_progress != null && row.already_synced ? `
        <div class="wbs-item-progress" title="OpenProject 진척률: ${meta.op_progress}%">
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

/* 필터링 (상태 칩 추가) */
function wbsProFilteredRows() {
  const rows   = state.wbsPlanRows;
  const q      = state.wbsPlanSearch.trim().toLowerCase();
  const sf     = state.wbsStatusFilter;
  const phase  = state.wbsPlanPhaseFilter;
  return rows.filter((r) => {
    const meta = r.metadata || {};
    const matchSearch = !q || [r.code,r.name,r.owner].filter(Boolean).join(" ").toLowerCase().includes(q);
    const matchStatus = !sf  || (meta.status || "대기") === sf;
    const matchPhase  = !phase || r.code === phase || (r.parent_code && r.parent_code.startsWith(phase));
    return matchSearch && matchStatus && matchPhase;
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
function renderWbsProRow(row, depth, hasChildren, canMutate) {
  const meta      = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
  const type      = row.item_type || "작업";
  const status    = meta.status || "대기";
  const priority  = meta.priority || "보통";
  const progress  = meta.progress ?? 0;
  const expanded  = hasChildren ? isWbsExpanded(row.code) : true;
  const sc        = STATUS_STYLE[status] || STATUS_STYLE["대기"];
  const isDone    = status === "완료";
  const isLate    = status === "지연";
  const progCls   = isDone ? "done" : isLate ? "late" : "";
  const pIcons    = { "높음":"🔴","보통":"🟡","낮음":"⚪" };
  const commentsArr = Array.isArray(meta.comments) ? meta.comments : [];
  const crList      = Array.isArray(meta.cr_list) ? meta.cr_list : [];
  const reviewer    = meta.reviewer || "";
  const approver    = meta.approver || "";
  const wbsVersion  = meta.wbs_version ? `v${meta.wbs_version}` : "";
  const dodDone     = (meta.dod_items || []).filter((d) => d.done).length;
  const dodTotal    = (meta.dod_items || []).length;

  // RACI 배지
  const team = meta.team || "";
  const raciBadges = [
    row.owner    ? `<span class="raci-badge raci-r" title="담당: ${escapeHtml(row.owner)}">R</span>` : "",
    reviewer     ? `<span class="raci-badge raci-a" title="검토: ${escapeHtml(reviewer)}">A</span>` : "",
    approver     ? `<span class="raci-badge raci-c" title="승인: ${escapeHtml(approver)}">C</span>` : "",
    team         ? `<span class="wbs-team-badge" title="조직/팀">${escapeHtml(team)}</span>` : "",
  ].filter(Boolean).join("");

  return `
    <tr class="wbs-pro-tr${isDone?" row-done":""}"
        data-code="${escapeHtml(row.code||"")}" data-type="${escapeHtml(type)}" data-status="${escapeHtml(status)}"
        draggable="${canMutate ? "true" : "false"}">
      <td class="td-freeze td-cb">
        <span class="wbs-drag-handle" title="드래그하여 순서 변경">⠿</span>
        <input type="checkbox" class="wbs-row-check" data-code="${escapeHtml(row.code||"")}" />
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
      <td class="td-status">
        <button class="wbs-status-btn status-${escapeHtml(status)}" type="button"
          data-wbs-status="${escapeHtml(row.code||"")}"
          style="background:${sc.bg};color:${sc.color}">
          ${escapeHtml(status)}
        </button>
      </td>
      <td class="td-progress">
        <div class="wbs-progress-cell">
          <div class="wbs-pro-progress-bar">
            <div class="wbs-pro-progress-fill ${progCls}" style="width:${progress}%"></div>
          </div>
          <span class="wbs-progress-pct">${progress}%</span>
        </div>
      </td>
      <td class="td-priority">
        <span class="priority-${escapeHtml(priority)}" title="${escapeHtml(priority)}">${pIcons[priority]||"🟡"}</span>
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
  const saveBtn = document.querySelector("#wbsSaveButton");
  const saveable = hasProject && canMutate && state.wbsPlanDirty;
  saveBtn.disabled = !saveable;
  saveBtn.title = !hasProject     ? "프로젝트를 먼저 선택하세요"
    : !canMutate                  ? "편집 권한이 없습니다"
    : !state.wbsPlanDirty         ? "변경 사항 없음 (행 추가·수정·삭제 후 활성화됩니다)"
    : "변경 사항을 서버에 저장합니다";
  const clearBtn = document.querySelector("#wbsClearButton");
  if (clearBtn) {
    clearBtn.disabled = !hasProject || !canMutate || state.wbsPlanRows.length === 0;
    clearBtn.title = !hasProject  ? "프로젝트를 먼저 선택하세요"
      : !canMutate                ? "편집 권한이 없습니다"
      : state.wbsPlanRows.length === 0 ? "WBS 항목이 없습니다"
      : "WBS 항목을 전체 삭제합니다. 저장 후 되돌릴 수 없습니다";
  }
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
      state.wbsStatusFilter || state.wbsPlanSearch ? "검색 조건에 맞는 항목 없음" : "행 추가 버튼이나 Excel 업로드로 WBS를 시작하세요"
    }</td></tr>`;
    return;
  }

  const rendered = [];
  const visited  = new Set();
  function walkProRow(code) {
    if (visited.has(code)) return;
    visited.add(code);
    const row = rowByCode.get(code);
    if (!row) return;
    const depth      = wbsItemDepth(row, rowByCode);
    const children   = childMap[code] || [];
    const hasChildren = children.length > 0;
    const expanded   = isWbsExpanded(code);
    rendered.push(renderWbsProRow(row, depth, hasChildren, canMutate));
    if (hasChildren && expanded) children.forEach((c) => walkProRow(c));
  }

  allRows.filter((r) => !r.parent_code).forEach((r) => { if (r.code) walkProRow(r.code); });
  filtered.forEach((r) => { if (!visited.has(r.code)) rendered.push(renderWbsProRow(r, wbsItemDepth(r,rowByCode), false, canMutate)); });

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

  // 새 필드 (metadata 기반)
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
  // 새 필드
  const status     = document.querySelector("#wbsRowStatus")?.value   || "대기";
  const priority   = document.querySelector("#wbsRowPriority")?.value || "보통";
  const progress   = Number(document.querySelector("#wbsRowProgress")?.value ?? 0);
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
  const metadata = { ...existingMeta, status, priority, progress, effort, reviewer, approver, team };

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

async function clearWbsPlan() {
  if (!state.wbsPlanProjectId) return;
  const project = state.projects.find((p) => p.id === state.wbsPlanProjectId);
  const name = project?.name ?? "이 프로젝트";
  if (!window.confirm(`"${name}"의 WBS 항목을 모두 삭제하고 초기화하시겠습니까?\n\n이 작업은 즉시 서버에 반영되며 되돌릴 수 없습니다.`)) return;

  const statusEl = document.querySelector("#wbsPlanStatus");
  const clearBtn = document.querySelector("#wbsClearButton");
  if (clearBtn) clearBtn.disabled = true;
  if (statusEl) statusEl.textContent = "초기화 중…";

  try {
    const result = await request(
      `/api/projects/${encodeURIComponent(state.wbsPlanProjectId)}/wbs-items`,
      { method: "DELETE" },
    );
    state.wbsPlanRows  = [];
    state.wbsPlanDirty = false;
    if (statusEl) statusEl.textContent = `초기화 완료 — ${result.deleted_rows}개 항목 삭제됨`;
    renderWbsPlanTable();
    await loadData();
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message;
    if (clearBtn) clearBtn.disabled = false;
  }
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
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message;
    saveBtn.disabled = false;
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
  if (state.settingsTab === "approvals") renderSettingsApprovals();
  renderOperationsPanel();
  renderUsersPanel();
  renderAuditPanel();
  renderSettingsPanel();
  renderWbsPlan();
  renderOpViewProjectSelect();
  renderGuidePanel();
  renderRisksPanel();
}

async function loadData() {
  try {
    const [dashboard, templates, projects, approvals, pmPreflight, operationsHealth, importJobs, users, auditEvents, settings, risks, issues] = await Promise.all([
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
      request("/api/risks").catch(() => []),
      request("/api/issues").catch(() => []),
    ]);

    state.dashboard = dashboard;
    state.templates = templates;
    state.projects = projects;
    state.approvals = approvals;
    state.pmPreflight = pmPreflight;
    state.operationsHealth = operationsHealth;
    state.importJobs = importJobs;
    state.risks = risks;
    state.issues = issues;
    loadNotifications();
    startNotifPolling();
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
    start_date: document.querySelector("#projectStartInput").value || null,
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
        const msg = `✅ 승인 완료 + OpenProject 자동 동기화 (${sync.created ?? 0}개 작업패키지 생성)`;
        showAutoSyncToast(msg, "success");
      } else if (sync.triggered && sync.error) {
        showAutoSyncToast(`✅ 승인 완료 (OP 자동 동기화 실패: ${sync.error.slice(0,60)})`, "warn");
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
      headers: { Authorization: `Bearer ${state.authToken}` },
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

  // 일반 WBS 모드: 프로젝트가 선택되지 않으면 안내
  if (state.importType === "custom") {
    const projectId = document.querySelector("#importProjectSelect")?.value;
    if (!projectId) {
      const statusEl = document.querySelector("#importStatus");
      if (statusEl) {
        statusEl.textContent = "프로젝트를 먼저 선택하세요";
        statusEl.className = "status-pill critical";
      }
      event.target.value = "";
      return;
    }
    // 동일 파일·프로젝트로 Preview 상태 job이 이미 있으면 재사용 여부 확인
    const existing = state.importJobs.find(
      (j) => j.source_file === file.name && j.status === "Preview",
    );
    if (existing) {
      const reuse = window.confirm(
        `"${file.name}" 파일의 미반영 업로드 이력이 있습니다.\n\n기존 이력을 재사용하려면 [확인], 새로 업로드하려면 [취소]를 누르세요.`,
      );
      if (reuse) {
        event.target.value = "";
        loadImportJob(existing.id);
        return;
      }
    }
  }

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
  const _noticeEl = document.querySelector("#importApplyNotice");
  if (_noticeEl) _noticeEl.hidden = true;

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
    const rows = result.summary?.rows ?? 0;
    const statusEl = document.querySelector("#importStatus");
    statusEl.textContent = `반영 완료 — ${rows}행`;
    statusEl.className = "status-pill stable";
    await loadData();
    // notice 초기화
    const noticeEl = document.querySelector("#importApplyNotice");
    if (noticeEl) noticeEl.hidden = true;
    // WBS 관리 탭으로 이동 후 서버에서 전체 WBS 재로드
    window.location.hash = "wbs-plan";
    const drawer = document.querySelector("#templateDrawer");
    if (drawer) drawer.hidden = true;
    // state.wbsPlanProjectId를 먼저 초기화해야 loadWbsPlanProject가 실행됨
    state.wbsPlanProjectId = null;
    await loadWbsPlanProject(projectId);
    const sel = document.querySelector("#wbsPlanProjectSelect");
    if (sel) sel.value = projectId;
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

/* ── OpenProject → AX WBS 역방향 Pull ────────────── */
async function pullOpenProjectStatus() {
  const projectId = selectedSyncProjectId();
  if (!projectId) return;

  const pullBtn  = document.querySelector("#syncPullButton");
  const statusEl = document.querySelector("#syncPullStatus");

  if (pullBtn) pullBtn.disabled = true;
  if (statusEl) statusEl.textContent = "OpenProject에서 상태 가져오는 중…";

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
   WBS 현황 뷰 (작업패키지 + 간트 차트)
══════════════════════════════════════════════════════ */

function renderOpViewProjectSelect() {
  const sel = document.querySelector("#opViewProjectSelect");
  if (!sel) return;

  const STATUS_GROUP = [
    { label: "🔗 OpenProject 동기화 완료", statuses: ["Synced", "Closed"], check: (p) => p.openproject_project_id },
    { label: "✅ 승인 완료 (로컬 WBS)",    statuses: ["Approved"],           check: () => true },
    { label: "📋 진행 중 / 초안",          statuses: ["Draft", "Review", "Rejected"], check: () => true },
  ];

  const allProjects = state.apiConnected ? state.projects : fallbackProjects;
  let html = `<option value="">프로젝트 선택…</option>`;

  for (const group of STATUS_GROUP) {
    const matched = allProjects.filter(
      (p) => group.statuses.includes(p.status) && group.check(p)
    );
    if (!matched.length) continue;
    html += `<optgroup label="${group.label}">`;
    html += matched.map((p) =>
      `<option value="${escapeHtml(p.id)}" ${p.id === state.opViewProjectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    ).join("");
    html += `</optgroup>`;
  }

  sel.innerHTML = html;
  sel.disabled  = !allProjects.length;

  const refreshBtn = document.querySelector("#opViewRefreshBtn");
  if (refreshBtn) refreshBtn.disabled = !state.opViewProjectId;
}

async function loadOpViewProject(projectId) {
  if (!projectId) {
    state.opViewProjectId = null;
    state.opViewRows = [];
    renderOpWorkPackages();
    renderOpGantt();
    return;
  }
  state.opViewProjectId = projectId;
  state.opViewRows = [];

  const sourceEl = document.querySelector("#opViewSource");
  if (sourceEl) { sourceEl.hidden = false; sourceEl.textContent = "로딩 중…"; sourceEl.className = "status-pill attention"; }

  try {
    const data = await request(`/api/projects/${encodeURIComponent(projectId)}/op-work-packages`);
    state.opViewRows = data.items || [];
    if (sourceEl) {
      sourceEl.textContent = data.source === "openproject" ? "OpenProject" : "로컬 데이터";
      sourceEl.className   = `status-pill ${data.source === "openproject" ? "stable" : "attention"}`;
    }
  } catch (e) {
    if (sourceEl) { sourceEl.textContent = "오류"; sourceEl.className = "status-pill critical"; }
  }

  const refreshBtn = document.querySelector("#opViewRefreshBtn");
  if (refreshBtn) refreshBtn.disabled = false;

  renderOpWorkPackages();
  renderOpGantt();
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
  const ALL_TABS = ["wp", "gantt", "assignee", "delayed"];
  ALL_TABS.forEach((t) => {
    const el = document.querySelector(`#opTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (el) el.hidden = t !== tabId;
  });
  if (tabId === "assignee") renderOpAssignee();
  if (tabId === "delayed")  renderOpDelayed();
}

/* ── 담당자별 현황 ────────────────────────────── */
function renderOpAssignee() {
  const wrap = document.querySelector("#opAssigneeWrap");
  if (!wrap) return;
  const rows = state.opViewRows;

  if (!rows.length) {
    wrap.innerHTML = `<div class="wbs-board-empty"><strong>데이터 없음</strong><span>프로젝트를 선택하세요.</span></div>`;
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);

  // owner / assignee 기준 그룹핑
  const groups = new Map();
  rows.forEach((r) => {
    const owner = r.assignee || r.owner || "미배정";
    if (!groups.has(owner)) groups.set(owner, { total:0, done:0, inprogress:0, delayed:0, progressSum:0, items:[] });
    const g = groups.get(owner);
    g.total++;
    g.items.push(r);
    const st = r.op_status || "";
    if (st === "완료") g.done++;
    else if (st === "진행 중") g.inprogress++;
    if (r.finish_date && new Date(r.finish_date) < today && st !== "완료") g.delayed++;
    g.progressSum += (r.op_progress ?? 0);
  });

  const sorted = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);

  wrap.innerHTML = `
    <table class="op-assignee-table">
      <thead>
        <tr>
          <th>담당자</th>
          <th class="center">전체</th>
          <th class="center">완료</th>
          <th class="center">진행중</th>
          <th class="center">지연</th>
          <th style="min-width:160px">평균 진행률</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(([name, g]) => {
          const avg = g.total ? Math.round(g.progressSum / g.total) : 0;
          const pct = avg;
          const barColor = g.delayed > 0 ? "#d92d20" : g.done === g.total ? "#1f9d55" : "#0071e3";
          return `<tr>
            <td><span class="op-assignee-name">${escapeHtml(name)}</span></td>
            <td class="center"><span class="op-count-badge">${g.total}</span></td>
            <td class="center"><span class="op-count-badge done">${g.done}</span></td>
            <td class="center"><span class="op-count-badge progress">${g.inprogress}</span></td>
            <td class="center">${g.delayed ? `<span class="op-count-badge delayed">${g.delayed}</span>` : `<span class="op-count-badge">0</span>`}</td>
            <td>
              <div class="op-progress-bar-wrap">
                <div class="op-progress-bar-fill" style="width:${pct}%;background:${barColor}"></div>
                <span class="op-progress-label">${pct}%</span>
              </div>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

/* ── 지연 항목 ───────────────────────────────── */
function renderOpDelayed() {
  const wrap = document.querySelector("#opDelayedWrap");
  if (!wrap) return;
  const rows = state.opViewRows;

  if (!rows.length) {
    wrap.innerHTML = `<div class="wbs-board-empty"><strong>데이터 없음</strong><span>프로젝트를 선택하세요.</span></div>`;
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const delayed = rows.filter((r) => {
    if (!r.finish_date) return false;
    const end = new Date(r.finish_date);
    const st  = r.op_status || "";
    return end < today && st !== "완료";
  }).sort((a, b) => new Date(a.finish_date) - new Date(b.finish_date));

  if (!delayed.length) {
    wrap.innerHTML = `<div class="wbs-board-empty" style="color:var(--green)"><strong>✅ 지연 항목 없음</strong><span>모든 항목이 기한 내 진행 중입니다.</span></div>`;
    return;
  }

  const dayDiff = (d) => Math.floor((today - new Date(d)) / 86400000);

  wrap.innerHTML = `
    <div style="margin-bottom:10px">
      <span class="status-pill critical">${delayed.length}건 지연</span>
    </div>
    <table class="op-assignee-table">
      <thead>
        <tr>
          <th>WBS 코드</th>
          <th>작업명</th>
          <th>담당자</th>
          <th class="center">종료 예정일</th>
          <th class="center">지연 일수</th>
          <th class="center">진행률</th>
          <th class="center">상태</th>
        </tr>
      </thead>
      <tbody>
        ${delayed.map((r) => {
          const days = dayDiff(r.finish_date);
          const pct  = r.op_progress ?? 0;
          const st   = r.op_status || "미시작";
          return `<tr>
            <td><code style="font-size:0.76rem">${escapeHtml(r.code || "-")}</code></td>
            <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.name || r.subject || "-")}</td>
            <td>${escapeHtml(r.assignee || r.owner || "미배정")}</td>
            <td class="center" style="color:var(--red);font-weight:600">${r.finish_date}</td>
            <td class="center"><span class="op-count-badge delayed">+${days}일</span></td>
            <td class="center">${pct}%</td>
            <td class="center"><span class="status-pill critical" style="font-size:0.72rem">${escapeHtml(st)}</span></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

/* ── 작업패키지 테이블 렌더링 ─────────────────── */
/* OP 상태 색상 매핑 (WBS 관리 STATUS_STYLE과 동일한 방식) */
const OP_STATUS_COLOR = {
  "미시작":  { bg: "#f3f4f6", color: "#6b7280" },
  "진행 중": { bg: "#dbeafe", color: "#1d4ed8" },
  "완료":    { bg: "#dcfce7", color: "#15803d" },
  "지연":    { bg: "#fee2e2", color: "#dc2626" },
  "보류":    { bg: "#fef3c7", color: "#d97706" },
};

function renderOpWorkPackages() {
  const tbody = document.querySelector("#opWpList");
  const count = document.querySelector("#opWpCount");
  if (!tbody) return;

  const q       = state.opViewSearch.trim().toLowerCase();
  const tf      = state.opViewTypeFilter;
  const sf      = state.opViewStatusFilter || "";   // 상태 칩 필터
  const rows    = state.opViewRows;

  // 유형 필터 옵션 갱신
  const typeFilter = document.querySelector("#opWpTypeFilter");
  if (typeFilter) {
    const types  = [...new Set(rows.map((r) => r.item_type || r.op_type || "작업").filter(Boolean))];
    const curVal = typeFilter.value;
    typeFilter.innerHTML = [`<option value="">전체 유형</option>`,
      ...types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(itemTypeLabel(t))}</option>`)].join("");
    typeFilter.value = curVal;
  }

  const filtered = rows.filter((r) => {
    const name = (r.name || r.subject || "").toLowerCase();
    const code = (r.code || "").toLowerCase();
    const type = r.item_type || r.op_type || "작업";
    const st   = r.op_status || "미시작";
    return (!q  || name.includes(q) || code.includes(q))
        && (!tf || type === tf)
        && (!sf || st === sf);
  });

  if (count) count.textContent = `${filtered.length}개`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr class="wbs-empty-row"><td colspan="8"><strong>${
      state.opViewProjectId ? "항목 없음" : "프로젝트를 선택하세요"
    }</strong></td></tr>`;
    return;
  }

  // 깊이 계산 (계층 구조 지원)
  const codeMap = new Map(rows.map((r) => [r.code || String(r.id), r]));
  const getDepth = (r) => {
    let d = 0, cur = r;
    const seen = new Set([r.code || String(r.id)]);
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
      childMap[pk].push(r.code || String(r.id));
    }
  });

  function walkOpRow(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const r = codeMap.get(key);
    if (!r) return;

    const type     = r.item_type || r.op_type || "작업";
    const depth    = getDepth(r);
    const children = childMap[key] || [];
    const hasChildren = children.length > 0;

    // 상태 스타일 — WBS 관리와 동일한 STATUS_STYLE 사용
    const status   = r.op_status || "미시작";
    const sc       = OP_STATUS_COLOR[status] || OP_STATUS_COLOR["미시작"];
    const isDone   = status === "완료";

    // 진척률 (null=미설정, 0=0%, >0=실제)
    const rawPct   = r.op_progress;
    const hasPct   = rawPct != null && rawPct > 0;
    const pct      = rawPct ?? 0;
    const pctCls   = isDone ? "done" : "";

    // 담당자
    const owner    = r.assignee || r.owner || "";

    // 코드·이름
    const code     = r.code || String(r.id || "");
    const name     = r.name || r.subject || "";

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
            ? `<div class="wbs-owner-cell"><span class="owner-avatar">${(owner[0]||"?").toUpperCase()}</span><span style="font-size:0.8rem">${escapeHtml(owner)}</span></div>`
            : `<span class="owner-empty">미배정</span>`}
        </td>
        <td class="td-status">
          <span class="wbs-status-btn" style="background:${sc.bg};color:${sc.color}">${escapeHtml(status)}</span>
        </td>
        <td class="td-progress">
          <div class="wbs-progress-cell">
            <div class="wbs-pro-progress-bar">
              <div class="wbs-pro-progress-fill ${pctCls}" style="width:${hasPct ? pct : 0}%"></div>
            </div>
            <span class="wbs-progress-pct">${hasPct ? pct + "%" : "-"}</span>
          </div>
        </td>
        <td style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(r.start_date || "-")}</td>
        <td style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(r.finish_date || "-")}</td>
        <td class="td-weight">
          ${r.weight != null
            ? `<span class="wbs-weight-pill">${r.weight}%</span>`
            : `<span style="color:var(--text-muted);font-size:0.76rem">-</span>`}
        </td>
      </tr>`);

    // 자식 행 재귀 (expanded일 때만)
    if (hasChildren && isWbsExpanded(code)) {
      children.forEach((c) => walkOpRow(c));
    }
  }

  // 루트 노드 먼저
  rows.filter((r) => !r.parent_code).forEach((r) => {
    const key = r.code || String(r.id);
    if (key) walkOpRow(key);
  });
  // 필터된 항목 중 아직 미방문
  filtered.forEach((r) => {
    const key = r.code || String(r.id);
    if (!visited.has(key)) rendered.push(`
      <tr class="wbs-pro-tr" data-type="${escapeHtml(r.item_type||"작업")}">
        <td class="td-freeze td-code"><code class="wbs-code-cell">${escapeHtml(key)}</code></td>
        <td class="td-freeze td-name"><div class="wbs-name-cell">
          <span class="wbs-no-toggle"></span>
          <span class="wbs-type-dot" data-type="${escapeHtml(r.item_type||"")}"></span>
          <span class="wbs-name-text">${escapeHtml(r.name||r.subject||"")}</span>
        </div></td>
        <td colspan="6"></td>
      </tr>`);
  });

  tbody.innerHTML = rendered.join("");
}

/* ── 간트 차트 렌더링 ─────────────────────────── */
function renderOpGantt() {
  const wrap = document.querySelector("#opGanttWrap");
  if (!wrap) return;

  const rows = state.opViewRows.filter((r) => r.start_date || r.finish_date);
  if (!rows.length) {
    wrap.innerHTML = `<p class="sync-pull-status" style="padding:24px;text-align:center">${state.opViewProjectId ? "일정 데이터가 없습니다. 상태 가져오기 또는 날짜를 입력하세요." : "프로젝트를 선택하면 간트 차트가 표시됩니다."}</p>`;
    return;
  }

  // 전체 기간 계산
  const allDates = rows.flatMap((r) => [r.start_date, r.finish_date].filter(Boolean)).map((d) => new Date(d));
  const minDate  = new Date(Math.min(...allDates));
  const maxDate  = new Date(Math.max(...allDates));
  minDate.setDate(1);
  maxDate.setMonth(maxDate.getMonth() + 1, 0);
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000));

  // 월 헤더 생성
  const months = [];
  let cur = new Date(minDate);
  while (cur <= maxDate) {
    const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end  = nextMonth > maxDate ? maxDate : new Date(nextMonth - 1);
    const days = Math.ceil((end - cur) / 86400000) + 1;
    const yearLabel = cur.getMonth() === 0 ? `${cur.getFullYear()}년 ` : "";
    months.push({
      label: `${yearLabel}${cur.getMonth() + 1}월`,
      days,
      pct: (days / totalDays * 100).toFixed(2),
    });
    cur = nextMonth;
  }

  // 7개월 이상: 월당 최소 120px 고정 → 가로 스크롤 발생
  // 6개월 이하: 기존 방식 (% 비율로 컨테이너 너비에 맞게 표시)
  const LABEL_WIDTH   = 220;
  const MIN_MONTH_PX  = 120;
  const SCROLL_THRESHOLD = 6;
  const useFixedWidth = months.length > SCROLL_THRESHOLD;
  const timelineMinPx = useFixedWidth ? months.length * MIN_MONTH_PX : 0;
  const ganttMinWidth = useFixedWidth ? LABEL_WIDTH + timelineMinPx : 800;

  const monthHeaderHtml = months.map((m) => {
    const style = useFixedWidth
      ? `min-width:${MIN_MONTH_PX}px;flex:${m.days}`   // px 최소 보장 + 일수 비례 flex
      : `flex:${m.pct}`;                                // % 비율 (기존)
    return `<div class="op-gantt-month" style="${style}">${m.label}</div>`;
  }).join("");

  const today = new Date();
  const todayPct = Math.max(0, Math.min(100, ((today - minDate) / 86400000 / totalDays) * 100));
  const todayHtml = `<div class="op-gantt-today" style="left:${todayPct.toFixed(2)}%"></div>`;

  // 행 렌더링
  const rowsHtml = state.opViewRows.map((r) => {
    const type    = r.item_type || r.op_type || "작업";
    const isMile  = type === "마일스톤";
    const codeMap2 = new Map(state.opViewRows.map((x) => [x.code || String(x.id), x]));
    let depth = 0, c = r; const seen2 = new Set([r.code]);
    while (c?.parent_code && !seen2.has(c.parent_code)) { seen2.add(c.parent_code); c = codeMap2.get(c.parent_code); depth++; }
    depth = Math.min(depth, 5);

    const labelHtml = `
      <div class="op-gantt-label" style="--depth:${depth}">
        <span class="op-gantt-label-code">${escapeHtml(r.code || "")}</span>
        ${escapeHtml(r.name || r.subject || "")}
      </div>`;

    let barHtml = "";
    if (r.start_date || r.finish_date) {
      const sDate = r.start_date ? new Date(r.start_date) : new Date(r.finish_date);
      const eDate = r.finish_date ? new Date(r.finish_date) : sDate;
      const left  = Math.max(0, ((sDate - minDate) / 86400000 / totalDays * 100));
      const width = Math.max(0.3, ((eDate - sDate) / 86400000 + 1) / totalDays * 100);
      const progress = r.op_progress ?? null;

      if (isMile) {
        barHtml = `<div class="op-gantt-diamond" style="left:${left.toFixed(2)}%" title="${escapeHtml(r.name || "")}"></div>`;
      } else {
        const progressBar = progress != null ? `<div class="op-gantt-bar-progress" style="width:${100 - progress}%;float:right"></div>` : "";
        const dateRange = (r.start_date || r.finish_date)
          ? ` (${r.start_date || "?"}~${r.finish_date || "?"})`
          : "";
        const barLabel = `<span class="op-gantt-bar-label">${escapeHtml(r.name || "")}${escapeHtml(dateRange)}</span>`;
        barHtml = `
          <div class="op-gantt-bar" data-type="${escapeHtml(type)}"
            style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"
            title="${escapeHtml(r.name || "")} (${r.start_date || "?"}~${r.finish_date || "?"})">
            ${progressBar}${barLabel}
          </div>`;
      }
    }

    return `
      <div class="op-gantt-row" data-type="${escapeHtml(type)}">
        ${labelHtml}
        <div class="op-gantt-track">${barHtml}${todayHtml}</div>
      </div>`;
  }).join("");

  wrap.innerHTML = `
    <div class="op-gantt" style="min-width:${ganttMinWidth}px">
      <div class="op-gantt-header">
        <div class="op-gantt-header-label">작업명</div>
        <div class="op-gantt-timeline-header">${monthHeaderHtml}</div>
      </div>
      ${rowsHtml}
    </div>`;
}

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
  if (viewId === "announcements") renderAnnouncementsPanel();
  if (viewId === "workboard") initWorkboardPanel();
  if (viewId === "risks") renderRisksPanel();
  if (viewId === "resource") renderResourcePanel();
  if (viewId === "settings" && state.settingsTab === "tenants") renderTenantsTab();
  if (viewId === "settings" && state.settingsTab === "auth") renderAuthSettingsTab();
  if (viewId === "settings" && state.settingsTab === "smtp") renderSmtpTab();
  if (viewId === "notes") { attachNoteEvents(); renderNotes(); }
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
document.querySelector("#projectForm").addEventListener("submit", createProject);
document.querySelector("#userCreateForm").addEventListener("submit", createPortalUser);
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
document.querySelector("#stgApprovalList").addEventListener("click", (event) => {
  const approvalBtn = event.target.closest("[data-approval-action]");
  if (approvalBtn && !approvalBtn.disabled) {
    decideApproval(approvalBtn.dataset.approvalId, approvalBtn.dataset.approvalAction);
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
document.querySelector("#importHistoryList").addEventListener("click", (event) => {
  const deleteBtn = event.target.closest("[data-import-job-delete]");
  if (deleteBtn) { deleteImportJob(deleteBtn.dataset.importJobDelete); return; }
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
  el.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const val = input.value.trim();
    if (field === "name" && val) row.name = val;
    if (field === "owner") row.owner = val;
    state.wbsPlanDirty = true;
    renderWbsPlanTable();
  };
  input.addEventListener("blur",    commit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") renderWbsPlanTable(); });
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

/* 상태 칩 클릭 */
document.querySelector("#wbsStatusChips")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-chip]");
  if (!chip) return;
  state.wbsStatusFilter = chip.dataset.chip;
  document.querySelectorAll(".wbs-chip").forEach((c) => c.classList.toggle("active", c.dataset.chip === state.wbsStatusFilter));
  renderWbsPlanTable();
});

/* 접기·펼치기·CSV */
document.querySelector("#wbsCollapseAllBtn")?.addEventListener("click", () => {
  // 자식이 있는 모든 항목을 collapsed 처리
  const childMap = buildChildMap(state.wbsPlanRows);
  state.wbsPlanRows.forEach((r) => {
    if (r.code && (childMap[r.code] || []).length > 0) {
      state.wbsExpanded[r.code] = false;
    }
  });
  renderWbsPlanTable();
});
document.querySelector("#wbsExpandAllBtn")?.addEventListener("click", () => {
  state.wbsExpanded = {}; // 모든 항목 undefined → 기본값 expanded
  renderWbsPlanTable();
});

/* 전체 선택 체크박스 */
document.querySelector("#wbsCheckAll")?.addEventListener("change", (event) => {
  const checked = event.target.checked;
  document.querySelectorAll(".wbs-row-check").forEach((cb) => { cb.checked = checked; });
});
document.querySelector("#wbsExportCsvBtn")?.addEventListener("click", exportWbsCsv);
document.querySelector("#wbsExportExcelBtn")?.addEventListener("click", () => {
  const pid = state.selectedProjectId;
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
      <button class="wbs-dict-tab ${tab==="workload"?"active":""}" data-dict-tab="workload">부하</button>
    </div>`;

  let content = "";

  if (tab === "basic") {
    /* 기존 기본 정보 + R&R */
    const statusOpts = WBS_STATUSES.map((s) => `<option value="${s}" ${(meta.status||"대기")===s?"selected":""}>${s}</option>`).join("");
    const prioOpts   = WBS_PRIORITIES.map((p) => `<option value="${p}" ${(meta.priority||"보통")===p?"selected":""}>${p}</option>`).join("");
    const typeOpts   = ["작업","단계","산출물","마일스톤","리스크","이슈","변경요청"].map((t) => `<option value="${t}" ${(row.item_type||"작업")===t?"selected":""}>${t}</option>`).join("");
    const comments   = Array.isArray(meta.comments) ? meta.comments : [];
    const commentHtml = comments.length
      ? comments.map((c) => `<div class="wbs-comment-item"><div class="wbs-comment-meta"><span class="wbs-comment-author">${escapeHtml(c.author||"익명")}</span><span class="wbs-comment-time">${escapeHtml(c.ts||"")}</span></div><p class="wbs-comment-text">${escapeHtml(c.text||"")}</p></div>`).join("")
      : `<p style="color:var(--text-muted);font-size:0.8rem">코멘트 없음</p>`;

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
        <div class="wbs-detail-field"><label class="wbs-detail-label">상태</label><select id="detailStatus" ${canMutate?"":"disabled"}>${statusOpts}</select></div>
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">진행률 (${meta.progress??0}%)</label>
        <input id="detailProgress" type="range" min="0" max="100" value="${meta.progress??0}" ${canMutate?"":"disabled"} style="width:100%;accent-color:var(--blue)" />
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">시작일</label><input id="detailStart" type="date" value="${escapeHtml(row.start_date||"")}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">종료일</label><input id="detailEnd" type="date" value="${escapeHtml(row.finish_date||"")}" ${canMutate?"":"disabled"} /></div>
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">가중치 (%)</label><input id="detailWeight" type="number" min="0" max="100" value="${row.weight??""}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">우선순위</label><select id="detailPriority" ${canMutate?"":"disabled"}>${WBS_PRIORITIES.map((p)=>`<option value="${p}" ${(meta.priority||"보통")===p?"selected":""}>${p}</option>`).join("")}</select></div>
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">조직 / 팀</label>
        <input id="detailTeam" value="${escapeHtml(meta.team||"")}" ${canMutate?"":"disabled"} placeholder="예) PMO팀, 개발1팀" />
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">비고 (메모)</label>
        ${canMutate ? createRichTextEditor("detailNotesToolbar", "detailNotesEditor", escapeHtml(meta.notes||"")) : `<div class="rt-editor rt-editor--readonly">${meta.notes||"<em style='color:var(--text-muted)'>비고 없음</em>"}</div>`}
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">코멘트 (${comments.length})</label>
        <div class="wbs-comment-list">${commentHtml}</div>
        ${canMutate ? `<div class="wbs-comment-input-row"><textarea id="detailCommentInput" placeholder="코멘트를 입력하세요… @멘션 가능" rows="2"></textarea><button type="button" id="detailCommentSubmit">등록</button></div>` : ""}
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
      <p style="font-size:0.76rem;color:var(--text-muted);margin:0 0 10px">작업 패키지의 범위를 포함/제외/가정/제약 4가지로 정의합니다.</p>
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
    meta.status   = document.querySelector("#detailStatus")?.value   || meta.status;
    meta.priority = document.querySelector("#detailPriority")?.value || meta.priority;
    meta.progress = Number(document.querySelector("#detailProgress")?.value ?? meta.progress ?? 0);
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

/* WBS 초기화 버튼 */
document.querySelector("#wbsClearButton").addEventListener("click", () => {
  clearWbsPlan();
});

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

/* 가이드 내부 '이동' 버튼 클릭 → 해당 포털 뷰로 이동 */
document.querySelector("#guideContent").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-guide-navigate]");
  if (!btn) return;
  const targetView = btn.dataset.guideNavigate;
  if (targetView) {
    applyPortalView(`#${targetView}`, { behavior: "smooth" });
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
  renderOpWorkPackages();
});

document.querySelector("#opWpTypeFilter").addEventListener("change", (event) => {
  state.opViewTypeFilter = event.target.value;
  renderOpWorkPackages();
});

/* WBS 현황 상태 칩 + 접기/펼치기 */
document.querySelector("#opStatusChips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-op-chip]");
  if (!chip) return;
  state.opViewStatusFilter = chip.dataset.opChip;
  document.querySelectorAll("#opStatusChips .wbs-chip").forEach((c) =>
    c.classList.toggle("active", c.dataset.opChip === state.opViewStatusFilter));
  renderOpWorkPackages();
});

/* WBS 현황 테이블 접기/펼치기 (▾/▸) */
document.querySelector("#opWpList").addEventListener("click", (event) => {
  const toggleBtn = event.target.closest("[data-op-toggle]");
  if (toggleBtn) {
    const code = toggleBtn.dataset.opToggle;
    state.wbsExpanded[code] = !isWbsExpanded(code);
    renderOpWorkPackages();
  }
});

/* ── 표준 WBS 탭 전환 ──────────────────────────── */
/* ── 표준 WBS 패널 탭 전환 + 일반 WBS 버튼 ─────── */
document.querySelector("#templates").addEventListener("click", (event) => {
  // 표준/일반 WBS 목록 서브탭 전환
  const listTab = event.target.closest("[data-wbs-list-tab]");
  if (listTab) {
    const listTabId = listTab.dataset.wbsListTab;
    document.querySelectorAll(".wbs-list-tab").forEach((btn) => {
      const isActive = btn.dataset.wbsListTab === listTabId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.querySelectorAll("[data-wbs-list-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.wbsListPanel !== listTabId;
    });
    return;
  }

  // 탭 전환 (목록 ↔ Excel 업로드)
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
      headers: { Authorization: `Bearer ${state.authToken}` },
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

/* ── 작업 현황 ───────────────────────────────────────────────────── */

let _workboardInited = false;

function initWorkboardPanel() {
  if (!_workboardInited) {
    _workboardInited = true;
    _setupWorkboardListeners();
  }
  _populateWorkboardProjects();
}

function _setupWorkboardListeners() {
  const projSel     = document.getElementById("workboardProjectSelect");
  const modeSel     = document.getElementById("projectDeliveryModeSelect");
  const refreshBtn  = document.getElementById("workboardRefreshBtn");
  const tabBar      = document.getElementById("workboardTabBar");

  if (projSel) projSel.addEventListener("change", () => {
    const pid = projSel.value;
    if (pid) _autoSetDeliveryMode(pid);
  });

  if (modeSel) modeSel.addEventListener("change", () => _applyWorkboardMode(modeSel.value));

  if (refreshBtn) refreshBtn.addEventListener("click", () => _loadWorkboardData());

  if (tabBar) {
    tabBar.querySelectorAll(".workboard-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        tabBar.querySelectorAll(".workboard-tab").forEach(b => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const view = btn.dataset.workboardView;
        document.getElementById("workboard")?.setAttribute("data-workboard-view", view);
        _renderWorkboardTab(view);
      });
    });
  }
}

function _populateWorkboardProjects() {
  const sel = document.getElementById("workboardProjectSelect");
  if (!sel) return;
  const projects = state.projects || [];
  const cur = sel.value;
  sel.innerHTML = '<option value="">프로젝트 선택…</option>' +
    projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function _autoSetDeliveryMode(projectId) {
  const project = (state.projects || []).find(p => p.id === projectId);
  if (!project) return;
  const modeSel = document.getElementById("projectDeliveryModeSelect");
  if (!modeSel) return;
  const type = (project.project_type || project.template_key || "").toLowerCase();
  let mode = "waterfall";
  if (type.includes("agile")) mode = "agile";
  else if (type.includes("hybrid")) mode = "hybrid";
  modeSel.value = mode;
  _applyWorkboardMode(mode);
}

function _applyWorkboardMode(mode) {
  const tabBar = document.getElementById("workboardTabBar");
  if (!tabBar) return;
  const agileOnly = ["agile-backlog", "agile-board", "agile-metrics"];
  tabBar.querySelectorAll(".workboard-tab").forEach(btn => {
    const view = btn.dataset.workboardView;
    if (agileOnly.includes(view)) {
      btn.style.display = (mode === "agile" || mode === "hybrid") ? "" : "none";
    }
  });
}

async function _loadWorkboardData() {
  const projSel = document.getElementById("workboardProjectSelect");
  const statusEl = document.getElementById("workboardStatus");
  const alertRow = document.getElementById("workboardAlertRow");
  const body     = document.getElementById("workboardBody");
  if (!projSel?.value) {
    if (alertRow) alertRow.innerHTML = '<span class="status-pill warn">프로젝트를 선택하세요.</span>';
    return;
  }
  if (statusEl) { statusEl.textContent = "조회 중…"; statusEl.className = "status-pill"; }
  if (alertRow) alertRow.innerHTML = "";
  try {
    const raw = await request(`/api/projects/${projSel.value}/wbs-items`);
    const rawItems = Array.isArray(raw) ? raw : (raw.items || []);
    // 필드 정규화: API 반환 필드명 → 렌더링 함수 기대 필드명
    const OP_STATUS_MAP = {
      "새로 만들기": "대기", "New": "대기", "미시작": "대기",
      "In progress": "진행중", "진행 중": "진행중",
      "Closed": "완료", "Done": "완료",
      "지연": "지연", "지체": "지연",
    };
    state._workboardItems = rawItems.map((it, idx) => {
      const meta = (typeof it.metadata === 'object' && it.metadata) ? it.metadata : {};
      const rawStatus = meta.op_status || meta.status || it.status || "";
      const mappedStatus = OP_STATUS_MAP[rawStatus] || rawStatus || "대기";
      const codeParts = (it.code || "").split(".");
      return {
        ...it,
        wbs_code:      it.code || it.wbs_code || "",
        assignee_name: it.owner || it.assignee_name || "",
        status:        mappedStatus,
        progress:      meta.op_progress ?? meta.progress ?? it.progress ?? 0,
        end_date:      it.finish_date || it.end_date || "",
        depth:         Math.max(0, codeParts.length - 1),
        sprint_id:     meta.sprint_id || it.sprint_id || null,
      };
    });

    if (statusEl) { statusEl.textContent = `${state._workboardItems.length}개 항목`; statusEl.className = "status-pill stable"; }
    const activeTab = document.querySelector(".workboard-tab.active")?.dataset?.workboardView || "mine";
    _renderWorkboardTab(activeTab);
  } catch (e) {
    if (statusEl) { statusEl.textContent = "오류"; statusEl.className = "status-pill warn"; }
    if (alertRow) alertRow.innerHTML = `<span class="status-pill warn">데이터를 불러오지 못했습니다: ${e?.message || ""}</span>`;
  }
}

function _renderWorkboardTab(view) {
  const body = document.getElementById("workboardBody");
  if (!body) return;
  const items = state._workboardItems || [];

  if (view === "mine") {
    const me = state.currentUser?.display_name || "";
    const mine = items.filter(i => i.assignee_name === me || !me);
    body.innerHTML = _renderWorkboardTable(mine.length ? mine : items, "내 작업");
  } else if (view === "board") {
    body.innerHTML = _renderWorkboardKanban(items);
  } else if (view === "gantt") {
    body.innerHTML = _renderWorkboardGanttSimple(items);
  } else if (view === "agile-backlog") {
    body.innerHTML = _renderWorkboardTable(items.filter(i => !i.sprint_id), "백로그 항목");
  } else if (view === "agile-board") {
    body.innerHTML = _renderWorkboardKanban(items);
  } else if (view === "agile-metrics") {
    body.innerHTML = '<p class="resource-lead" style="padding:24px">번다운·Velocity 차트는 스프린트 데이터가 필요합니다.</p>';
  } else {
    body.innerHTML = _renderWorkboardTable(items, "전체 항목");
  }
}

function _renderWorkboardTable(items, title) {
  if (!items.length) return `<p class="resource-lead" style="padding:24px;color:var(--text-muted)">${title}: 항목이 없습니다.</p>`;
  const STATUS_LABEL = { "대기": "대기", "진행중": "진행중", "완료": "완료", "지연": "지연", "보류": "보류" };
  const rows = items.map(it => {
    const statusCls = { "완료": "green", "지연": "red", "진행중": "blue", "보류": "warn" }[it.status] || "";
    const pct = it.progress ?? 0;
    return `<tr>
      <td style="color:var(--text-muted);font-size:0.78rem;white-space:nowrap">${escapeHtml(it.wbs_code||"")}</td>
      <td style="padding-left:${(it.depth||0)*14}px">${escapeHtml(it.name||"")}</td>
      <td>${escapeHtml(it.assignee_name||"-")}</td>
      <td><span class="status-pill ${statusCls}" style="font-size:0.72rem">${escapeHtml(it.status||"-")}</span></td>
      <td style="min-width:80px"><div style="background:var(--line);border-radius:4px;height:6px"><div style="background:var(--blue);width:${pct}%;height:6px;border-radius:4px"></div></div></td>
      <td style="font-size:0.78rem;color:var(--text-muted)">${it.start_date||""}</td>
      <td style="font-size:0.78rem;color:var(--text-muted)">${it.end_date||""}</td>
    </tr>`;
  }).join("");
  return `<table class="ri-table" style="width:100%">
    <thead><tr>
      <th>코드</th><th>작업명</th><th>담당자</th><th>상태</th><th>진행률</th><th>시작일</th><th>종료일</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _renderWorkboardKanban(items) {
  const cols = [
    { key: "대기",   label: "대기",   color: "#64748b", bg: "rgba(100,116,139,0.08)" },
    { key: "진행중", label: "진행중", color: "#0071e3", bg: "rgba(0,113,227,0.07)"   },
    { key: "완료",   label: "완료",   color: "#1f9d55", bg: "rgba(31,157,85,0.07)"   },
    { key: "지연",   label: "지연",   color: "#d92d20", bg: "rgba(217,45,32,0.07)"   },
  ];
  const TYPE_COLOR = {
    "프로젝트": "#7356bf", "단계": "#0071e3", "산출물": "#1f9d55",
    "Task": "#b7791f",    "Story": "#0e7490", "작업": "#64748b",
    "마일스톤": "#d92d20", "리스크": "#ea580c", "이슈": "#9333ea",
  };
  const grouped = {};
  cols.forEach(c => { grouped[c.key] = []; });
  items.forEach(it => {
    const key = it.status in grouped ? it.status : "대기";
    grouped[key].push(it);
  });

  const colsHtml = cols.map(c => {
    const cards = grouped[c.key].map(it => {
      const pct      = Math.min(100, Math.max(0, it.progress ?? 0));
      const typeColor= TYPE_COLOR[it.item_type] || TYPE_COLOR["작업"];
      const assignee = it.assignee_name || "미배정";
      const initial  = assignee !== "미배정" ? assignee.charAt(0) : "?";
      const dateStr  = it.end_date ? `~ ${it.end_date}` : (it.start_date ? it.start_date : "");
      const wbsCode  = it.wbs_code || "";
      const typeLabel= it.item_type || "작업";
      return `
      <div class="wb-kanban-card" style="
        background: var(--surface);
        border: 1px solid var(--line);
        border-left: 4px solid ${typeColor};
        border-radius: 8px;
        padding: 10px 12px 8px;
        margin-bottom: 8px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        cursor: pointer;
        transition: box-shadow 0.15s, transform 0.1s;
      " onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,0.12)';this.style.transform='translateY(-1px)'"
         onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)';this.style.transform=''">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
          <span style="font-size:0.7rem;font-weight:600;color:${typeColor};background:${typeColor}18;padding:1px 6px;border-radius:4px">${escapeHtml(typeLabel)}</span>
          ${wbsCode ? `<span style="font-size:0.68rem;color:var(--text-muted);font-family:monospace">${escapeHtml(wbsCode)}</span>` : ""}
        </div>
        <div style="font-size:0.85rem;font-weight:600;color:var(--text);line-height:1.35;margin-bottom:7px">${escapeHtml(it.name||"")}</div>
        <div style="background:var(--line);border-radius:3px;height:4px;margin-bottom:7px">
          <div style="background:${pct>=100?'#1f9d55':pct>0?'#0071e3':'var(--line)'};width:${pct}%;height:4px;border-radius:3px;transition:width 0.3s"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:5px">
            <div style="width:20px;height:20px;border-radius:50%;background:${assignee==='미배정'?'var(--line)':typeColor};display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;color:${assignee==='미배정'?'var(--text-muted)':'#fff'};flex-shrink:0">${escapeHtml(initial)}</div>
            <span style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(assignee)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            ${dateStr ? `<span style="font-size:0.68rem;color:var(--text-muted)">${escapeHtml(dateStr)}</span>` : ""}
            <span style="font-size:0.7rem;font-weight:600;color:${pct>=100?'#1f9d55':pct>0?'#0071e3':'var(--text-muted)'}">${pct}%</span>
          </div>
        </div>
      </div>`;
    }).join("") || `<div style="color:var(--text-muted);font-size:0.8rem;padding:16px 0;text-align:center;opacity:0.6">항목 없음</div>`;

    return `
    <div style="flex:1;min-width:220px;background:${c.bg};border-radius:10px;padding:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 2px 8px;border-bottom:2px solid ${c.color};margin-bottom:10px">
        <span style="font-weight:700;font-size:0.8rem;color:${c.color}">${c.label}</span>
        <span style="font-size:0.72rem;font-weight:600;color:#fff;background:${c.color};border-radius:12px;padding:1px 7px;min-width:20px;text-align:center">${grouped[c.key].length}</span>
      </div>
      ${cards}
    </div>`;
  }).join("");

  return `<div style="display:flex;gap:10px;padding:14px;overflow-x:auto;min-height:300px;align-items:flex-start">${colsHtml}</div>`;
}

function _renderWorkboardGanttSimple(items) {
  if (!items.length) return `<p class="resource-lead" style="padding:24px;color:var(--text-muted)">항목이 없습니다.</p>`;
  const rows = items.slice(0, 30).map(it => {
    const pct = it.progress ?? 0;
    return `<tr>
      <td style="padding-left:${(it.depth||0)*12}px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${escapeHtml(it.name||"")}</td>
      <td style="font-size:0.75rem;color:var(--text-muted)">${it.start_date||""}</td>
      <td style="font-size:0.75rem;color:var(--text-muted)">${it.end_date||""}</td>
      <td style="min-width:100px"><div style="background:var(--line);border-radius:4px;height:8px"><div style="background:var(--blue);width:${pct}%;height:8px;border-radius:4px"></div></div></td>
      <td style="font-size:0.75rem;color:var(--text-muted)">${pct}%</td>
    </tr>`;
  }).join("");
  return `<table class="ri-table" style="width:100%">
    <thead><tr><th>작업명</th><th>시작일</th><th>종료일</th><th>진행률</th><th>%</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ── 공지사항 ────────────────────────────────────────────────────── */

(function initAnnouncements() {
  const panel = document.getElementById("announcements");
  if (!panel) return;

  const createBtn   = document.getElementById("createAnnouncementBtn");
  const filterSel   = document.getElementById("announceFilter");
  const listEl      = document.getElementById("announceList");
  const dialog      = document.getElementById("announceDialog");
  const form        = document.getElementById("announceForm");
  const closeBtn    = document.getElementById("announceDialogClose");
  const cancelBtn   = document.getElementById("announceDialogCancel");
  const submitBtn   = document.getElementById("announceDialogSubmit");
  const statusEl    = document.getElementById("announceFormStatus");
  const scopeSel    = document.getElementById("announceScope");
  const tenantCheck = document.getElementById("announceTenantWide");
  const pinnedCheck = document.getElementById("announcePinned");
  const titleInput  = document.getElementById("announceTitle");
  const bodyInput   = document.getElementById("announceBody");

  const detailDialog = document.getElementById("announceDetailDialog");
  const detailTitle  = document.getElementById("announceDetailTitle");
  const detailClose  = document.getElementById("announceDetailClose");
  const detailCancel = document.getElementById("announceDetailCancel");
  const detailScope  = document.getElementById("announceDetailScope");
  const detailInfo   = document.getElementById("announceDetailInfo");
  const detailBody   = document.getElementById("announceDetailBody");
  const detailEdit   = document.getElementById("announceDetailEdit");
  const detailDelete = document.getElementById("announceDetailDelete");
  const detailPinWrap   = document.getElementById("announceDetailPinWrap");
  const detailPinnedChk = document.getElementById("announceDetailPinned");

  let editingId = null;
  let viewingItem = null;
  let allProjects = [];

  async function loadProjects() {
    try {
      const data = await request("/api/projects");
      allProjects = Array.isArray(data) ? data : (data.items || []);
    } catch { allProjects = []; }
  }

  function populateScopeSelect() {
    scopeSel.innerHTML = '<option value="">-- 프로젝트 선택 (선택 안 하면 전사 공지) --</option>' +
      allProjects.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  async function loadList() {
    listEl.innerHTML = '<p class="resource-lead" style="padding:16px">불러오는 중…</p>';
    const filter = filterSel?.value || "all";
    let url = "/api/announcements";
    if (filter === "project") url += "?scope=project";
    else if (filter === "tenant") url += "?scope=tenant";
    try {
      const items = await request(url);
      if (!items.length) {
        listEl.innerHTML = '<p class="resource-lead" style="padding:16px;color:var(--text-muted)">등록된 공지가 없습니다.</p>';
        return;
      }
      listEl.innerHTML = items.map(it => {
        const scopeLabel = it.project_name ? `📁 ${it.project_name}` : "🏢 전사";
        const pinBadge   = it.pinned ? '<span class="ann-pin-badge">📌 고정</span>' : "";
        const date = it.created_at ? new Date(it.created_at).toLocaleDateString("ko-KR") : "";
        return `<div class="announce-card" data-id="${it.id}" tabindex="0" role="button">
          <div class="announce-card-header">
            <span class="announce-scope-badge">${scopeLabel}</span>
            ${pinBadge}
            <span class="announce-card-title">${esc(it.title)}</span>
          </div>
          <div class="announce-card-meta">${esc(it.author_name || "")} · ${date}</div>
        </div>`;
      }).join("");
      listEl.querySelectorAll(".announce-card").forEach(card => {
        card.addEventListener("click", () => openDetail(items.find(i => String(i.id) === card.dataset.id)));
        card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") card.click(); });
      });
    } catch {
      listEl.innerHTML = '<p class="resource-lead" style="padding:16px;color:var(--red)">목록을 불러오지 못했습니다.</p>';
    }
  }

  function openDetail(item) {
    if (!item) return;
    viewingItem = item;
    detailTitle.textContent = item.title;
    detailScope.textContent = item.project_name ? `📁 ${item.project_name}` : "🏢 전사";
    const date = item.created_at ? new Date(item.created_at).toLocaleDateString("ko-KR") : "";
    detailInfo.textContent = `${item.author_name || ""} · ${date}`;
    detailBody.textContent = item.body || "";

    const canEdit = canMutateWork();
    if (detailEdit)   detailEdit.style.display   = canEdit ? "" : "none";
    if (detailDelete) detailDelete.style.display  = canEdit ? "" : "none";
    if (detailPinWrap) {
      detailPinWrap.style.display = canEdit ? "" : "none";
      if (detailPinnedChk) detailPinnedChk.checked = !!item.pinned;
    }
    detailDialog.showModal();
  }

  function openCreate() {
    editingId = null;
    form.reset();
    if (statusEl) statusEl.textContent = "";
    document.getElementById("announceDialogTitle").textContent = "새 공지 작성";
    populateScopeSelect();
    dialog.showModal();
  }

  function openEdit() {
    if (!viewingItem) return;
    editingId = viewingItem.id;
    populateScopeSelect();
    titleInput.value = viewingItem.title || "";
    bodyInput.value  = viewingItem.body  || "";
    pinnedCheck.checked = !!viewingItem.pinned;
    scopeSel.value = viewingItem.project_id || "";
    tenantCheck.checked = !viewingItem.project_id;
    if (statusEl) statusEl.textContent = "";
    document.getElementById("announceDialogTitle").textContent = "공지 수정";
    detailDialog.close();
    dialog.showModal();
  }

  async function submitForm(e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) { if (statusEl) statusEl.textContent = "제목을 입력하세요."; return; }
    const projectId = tenantCheck.checked ? null : (scopeSel.value || null);
    const payload = { title, body: bodyInput.value.trim(), pinned: pinnedCheck.checked, project_id: projectId };
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "저장 중…"; }
    try {
      if (editingId) {
        await request(`/api/announcements/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await request("/api/announcements", { method: "POST", body: JSON.stringify(payload) });
      }
      dialog.close();
      loadList();
    } catch (err) {
      if (statusEl) statusEl.textContent = err?.message || "저장 실패";
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "등록"; }
    }
  }

  async function deleteItem() {
    if (!viewingItem || !confirm(`"${viewingItem.title}" 공지를 삭제하시겠습니까?`)) return;
    try {
      await request(`/api/announcements/${viewingItem.id}`, { method: "DELETE" });
      detailDialog.close();
      loadList();
    } catch { alert("삭제 실패"); }
  }

  function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  // 이벤트 연결
  createBtn?.addEventListener("click", openCreate);
  filterSel?.addEventListener("change", loadList);
  closeBtn?.addEventListener("click", () => dialog.close());
  cancelBtn?.addEventListener("click", () => dialog.close());
  form?.addEventListener("submit", submitForm);
  detailClose?.addEventListener("click", () => detailDialog.close());
  detailCancel?.addEventListener("click", () => detailDialog.close());
  detailEdit?.addEventListener("click", openEdit);
  detailDelete?.addEventListener("click", deleteItem);

  // 권한에 따라 새 글 버튼 표시 (admin/pmo)
  function applyPermission() {
    if (createBtn) createBtn.style.display = canMutateWork() ? "" : "none";
  }

  // 공개 초기화 함수
  window._initAnnouncementsPanel = async function () {
    applyPermission();
    await loadProjects();
    await loadList();
  };
})();

function renderAnnouncementsPanel() {
  if (window._initAnnouncementsPanel) window._initAnnouncementsPanel();
}

/* ── P2-02: 리스크·이슈 트래킹 ─────────────────────────────────── */

function renderRisksPanel() {
  if (document.body.dataset.portalView !== "risks") return;
  renderRiProjectFilter();
  renderRiStatusFilter();
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
  sel.innerHTML = `<option value="">전체 상태</option>${
    statuses.map((s) => `<option value="${s}" ${s === state.riStatusFilter ? "selected" : ""}>${s}</option>`).join("")
  }`;
}

function riSeverityLabel(v) {
  return `<span class="ri-sev-${v}">${v}</span>`;
}
function riStatusPill(s) {
  return `<span class="ri-status-pill ri-status-${CSS.escape(s)}">${escapeHtml(s)}</span>`;
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

  const pid = state.riProjectFilter;
  const st = state.riStatusFilter;

  if (isRisks) {
    const rows = state.risks.filter((r) =>
      (!pid || r.project_id === pid) && (!st || r.status === st)
    );
    const count = document.querySelector("#riCount");
    if (count) count.textContent = `${rows.length}건`;
    const tbody = document.querySelector("#riskTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.project_name || "")}</td>
        <td style="max-width:200px">${escapeHtml(r.title)}</td>
        <td>${riSeverityLabel(r.severity)}</td>
        <td>${riSeverityLabel(r.likelihood)}</td>
        <td>${escapeHtml(r.owner || "")}</td>
        <td>${riStatusPill(r.status)}</td>
        <td style="white-space:nowrap">${r.due_date || "—"}</td>
        <td>
          ${canMutateWork() ? `<button class="wbs-pro-btn-sm" data-risk-close="${escapeHtml(r.id)}" type="button" ${r.status === "Closed" ? "disabled" : ""}>종료</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">등록된 리스크가 없습니다.</td></tr>`;
  } else {
    const rows = state.issues.filter((r) =>
      (!pid || r.project_id === pid) && (!st || r.status === st)
    );
    const count = document.querySelector("#riCount");
    if (count) count.textContent = `${rows.length}건`;
    const tbody = document.querySelector("#issueTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.project_name || "")}</td>
        <td style="max-width:200px">${escapeHtml(r.title)}</td>
        <td>${riSeverityLabel(r.priority)}</td>
        <td>${escapeHtml(r.assignee || "")}</td>
        <td>${riStatusPill(r.status)}</td>
        <td style="white-space:nowrap">${r.due_date || "—"}</td>
        <td>
          ${canMutateWork() ? `<button class="wbs-pro-btn-sm" data-issue-resolve="${escapeHtml(r.id)}" type="button" ${["Resolved","Closed"].includes(r.status) ? "disabled" : ""}>해결</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">등록된 이슈가 없습니다.</td></tr>`;
  }
}

// 탭 전환
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".ri-tab");
  if (tabBtn && tabBtn.dataset.riTab) {
    state.riTab = tabBtn.dataset.riTab;
    state.riStatusFilter = "";
    renderRiStatusFilter();
    renderRiTable();
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
    }).catch((err) => { resolveIssueBtn.disabled = false; alert(err.message); });
    return;
  }
});

// 프로젝트·상태 필터
document.addEventListener("change", (e) => {
  if (e.target.id === "riProjectFilter") {
    state.riProjectFilter = e.target.value;
    renderRiTable();
  }
  if (e.target.id === "riStatusFilter") {
    state.riStatusFilter = e.target.value;
    renderRiTable();
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

async function openProjectDetail(projectId) {
  state.pdTab = "overview";
  state.projectDetail = null;
  state.pdCrList = [];
  state.pdDiffData = null;
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
  const rows = state.pdCrList.length === 0
    ? `<tr><td colspan="6" class="empty-state">등록된 변경요청이 없습니다.</td></tr>`
    : state.pdCrList.map(cr => `<tr>
        <td>${cr.version}</td>
        <td>${cr.title}</td>
        <td><span class="ri-status-pill sev-${cr.priority === '높음' ? 'high' : cr.priority === '보통' ? 'med' : 'low'}">${cr.priority}</span></td>
        <td><span class="ri-status-pill st-${cr.status === 'Approved' ? 'closed' : cr.status === 'Rejected' ? 'closed' : 'open'}">${cr.status}</span></td>
        <td>${cr.requested_by || '—'}</td>
        <td>${(cr.created_at||'').substring(0,10)}</td>
      </tr>`).join("");
  body.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="primary-button btn-sm" id="addCrBtn">+ 변경요청 등록</button>
    </div>
    <table class="ri-table"><thead><tr><th>번호</th><th>제목</th><th>우선순위</th><th>상태</th><th>요청자</th><th>등록일</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  document.querySelector("#addCrBtn")?.addEventListener("click", () => {
    document.querySelector("#crDialog")?.showModal();
  });
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

async function renderResourcePanel() {
  const body = document.querySelector("#resourceBody");
  if (!body) return;
  if (!state.resourceData) {
    body.innerHTML = `<p class="empty-state">날짜를 선택하고 조회하세요.</p>`;
    return;
  }
  const { from_date, to_date, assignees } = state.resourceData;
  if (!assignees.length) {
    body.innerHTML = `<p class="empty-state">해당 기간에 배정된 작업이 없습니다.</p>`;
    return;
  }
  const rows = assignees.map(a => {
    const pct = a.total_tasks ? Math.round(a.done_tasks / a.total_tasks * 100) : 0;
    const projects = a.projects.map(p =>
      `<div class="res-project-row"><span>${p.project_name}</span><span>${p.task_count}건 (${p.avg_progress}%)</span></div>`
    ).join("");
    return `<tr>
      <td class="res-assignee">${a.assignee}</td>
      <td>${a.total_tasks}</td>
      <td>${a.done_tasks}</td>
      <td>
        <div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width:${pct}%"></div></div>
        <span style="font-size:11px;color:var(--secondary-text)">${pct}%</span>
      </td>
      <td><div class="res-project-list">${projects}</div></td>
    </tr>`;
  }).join("");
  body.innerHTML = `
    <p class="stg-desc" style="margin-bottom:12px">${from_date} ~ ${to_date} 기간 작업 배분 현황</p>
    <table class="ri-table resource-table">
      <thead><tr><th>담당자</th><th>전체</th><th>완료</th><th>진행률</th><th>프로젝트별</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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

  document.querySelector("#resourceRefreshBtn")?.addEventListener("click", async () => {
    const from = fromEl?.value || firstDay;
    const to   = toEl?.value || todayStr;
    const btn = document.querySelector("#resourceRefreshBtn");
    btn.disabled = true;
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
    fetch(a.href, { headers: { Authorization: `Bearer ${token}` }})
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
  } catch { if (status) status.textContent = "테스트 실패"; }
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
  }
  const tbody = document.querySelector("#tenantTableBody");
  if (!tbody) return;
  if (!state.tenants.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">테넌트가 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.tenants.map(t => `<tr>
    <td><code>${t.id}</code></td>
    <td>${t.name}</td>
    <td><span class="ri-status-pill st-${t.status === 'Active' ? 'open' : 'closed'}">${t.status}</span></td>
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
        headers: { Authorization: `Bearer ${token}` },
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

  // 저장된 설정 우선, 없으면 시스템 설정
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark") applyTheme(true);
  else if (saved === "light") applyTheme(false);
  else applyTheme(prefersDark.matches);

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
   데스크탑 사이드바 접기/펼치기
   ═══════════════════════════════════════════════════════════════ */
(function initSidebarToggle() {
  const sidebar = document.querySelector(".sidebar");
  const toggleBtn = document.getElementById("sidebarToggleBtn");
  if (!sidebar || !toggleBtn) return;

  const STORAGE_KEY = "wbs-sidebar-collapsed";
  const collapsed = localStorage.getItem(STORAGE_KEY) === "1";
  if (collapsed) sidebar.classList.add("collapsed");
  updateToggleIcon();

  toggleBtn.addEventListener("click", () => {
    const isNowCollapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem(STORAGE_KEY, isNowCollapsed ? "1" : "0");
    updateToggleIcon();
  });

  function updateToggleIcon() {
    const isCollapsed = sidebar.classList.contains("collapsed");
    toggleBtn.setAttribute("aria-pressed", String(isCollapsed));
    toggleBtn.setAttribute("title", isCollapsed ? "메뉴 펼치기" : "메뉴 접기");
    toggleBtn.querySelector("svg path").setAttribute("d",
      isCollapsed
        ? "M4 4h16v16H4V4Zm2 2v12h12V6H6Zm2 2h8v2H8V8Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z"
        : "M4 4h16v16H4V4Zm2 2v12h4V6H6Zm6 0v12h6V6h-6Z"
    );
  }
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
    { id: "sync",       label: "OpenProject 동기화", navHash: "#sync"       },
    { id: "risks",      label: "리스크·이슈",         navHash: "#risks"      },
    { id: "resource",   label: "자원 배분",           navHash: "#resource"   },
    { id: "templates",  label: "표준 WBS 관리",       navHash: "#templates"  },
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

  // 커스터마이저 버튼 (topbar에 동적 삽입)
  const toolbar = document.querySelector(".toolbar");
  if (!toolbar) return;

  const custBtn = document.createElement("button");
  custBtn.className = "widget-customizer-btn";
  custBtn.id = "widgetCustomizerBtn";
  custBtn.title = "위젯 표시/숨김 설정";
  custBtn.innerHTML = `⊞ 위젯`;
  custBtn.type = "button";

  // themeToggleBtn 앞에 삽입
  const themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) toolbar.insertBefore(custBtn, themeBtn);
  else toolbar.prepend(custBtn);

  // 커스터마이저 패널 (드롭다운)
  const panel = document.createElement("div");
  panel.id = "widgetCustomizerPanel";
  panel.style.cssText = `
    display:none; position:fixed; top:70px; right:16px;
    background:var(--surface); border:1px solid var(--line);
    border-radius:var(--radius); box-shadow:var(--shadow);
    padding:14px; z-index:300; min-width:220px;
  `;

  const prefs = loadPrefs();
  const chips = WIDGETS.map(w => {
    const visible = prefs[w.id] !== false;
    return `<button class="widget-toggle-chip ${visible ? "active" : ""}" data-widget-id="${w.id}" type="button">${visible ? "✓ " : ""}${w.label}</button>`;
  }).join("");

  panel.innerHTML = `
    <p style="font-size:12px;font-weight:700;color:var(--text-muted);margin:0 0 10px">위젯 표시 설정</p>
    <div class="widget-toggle-bar">${chips}</div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:8px">클릭으로 위젯을 표시/숨김 전환합니다.</p>
  `;
  document.body.appendChild(panel);

  custBtn.addEventListener("click", e => {
    e.stopPropagation();
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
  });

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

  document.addEventListener("click", e => {
    if (!panel.contains(e.target) && e.target !== custBtn) {
      panel.style.display = "none";
    }
  });
})();

/* ═══════════════════════════════════════════════════════════════
   주간 보고서 자동 발송 스케줄 저장 (로컬 설정)
   ═══════════════════════════════════════════════════════════════ */
(function initScheduleSettings() {
  const STORAGE_KEY = "wbs-schedule-prefs";

  function loadSchedulePrefs() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  function applySchedulePrefs() {
    const prefs = loadSchedulePrefs();
    const weeklyEl   = document.getElementById("schedWeeklyReport");
    const riskEl     = document.getElementById("schedRiskEscalation");
    const approvalEl = document.getElementById("schedApprovalReminder");
    if (weeklyEl)   weeklyEl.checked   = !!prefs.weeklyReport;
    if (riskEl)     riskEl.checked     = !!prefs.riskEscalation;
    if (approvalEl) approvalEl.checked = !!prefs.approvalReminder;
  }

  // 알림 탭이 활성화될 때 설정 적용
  document.getElementById("settingsTabBar")?.addEventListener("click", e => {
    if (e.target.closest("[data-stg-tab='smtp']")) {
      setTimeout(applySchedulePrefs, 50);
    }
  });

  // 저장 버튼
  document.addEventListener("click", e => {
    if (e.target.closest("#saveScheduleBtn")) {
      const prefs = {
        weeklyReport:      !!document.getElementById("schedWeeklyReport")?.checked,
        riskEscalation:    !!document.getElementById("schedRiskEscalation")?.checked,
        approvalReminder:  !!document.getElementById("schedApprovalReminder")?.checked,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      const btn = document.getElementById("saveScheduleBtn");
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "✓ 저장됨";
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800);
      }

      // API에 스케줄 설정 동기화 (서버 지원 여부 무관하게 fire-and-forget)
      if (state?.authToken) {
        fetch(`${API_BASE}/api/settings/schedule`, {
          method: "POST",
          headers: { Authorization: `Bearer ${state.authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(prefs),
        }).catch(() => {}); // 미구현이면 무시
      }
    }
  });
})();


// ─────────────────────────────────────────────────────────────────────────────
// 노트 / 보고서 모듈  (오프라인 동작 – 외부 CDN 의존성 없음)
// ─────────────────────────────────────────────────────────────────────────────

/* ── 유틸 ── */
function noteAuthHdr() {
  return { Authorization: `Bearer ${state.authToken}`, "Content-Type": "application/json" };
}
function noteToday() {
  return new Date().toISOString().slice(0, 10);
}
function noteFmt(dateStr) {
  if (!dateStr) return "";
  return dateStr.slice(0, 10).replace(/-/g, ".");
}

/* ── API 호출 ── */
async function loadNoteFolders() {
  try {
    const res = await fetch(`${API_BASE}/api/notes/folders`, { headers: noteAuthHdr() });
    if (res.ok) state.noteFolders = await res.json();
  } catch(e) { /* offline */ }
}

async function loadNotes(folderId = null, q = "") {
  try {
    const params = new URLSearchParams();
    if (folderId) params.set("folder_id", folderId);
    if (q)        params.set("q", q);
    const res = await fetch(`${API_BASE}/api/notes?${params}`, { headers: noteAuthHdr() });
    if (res.ok) state.notes = await res.json();
  } catch(e) { state.notes = []; }
}

async function loadNoteContent(noteId) {
  const res = await fetch(`${API_BASE}/api/notes/${noteId}`, { headers: noteAuthHdr() });
  if (!res.ok) throw new Error("Note not found");
  return res.json();
}

async function apiCreateFolder(name) {
  const res = await fetch(`${API_BASE}/api/notes/folders`, {
    method: "POST", headers: noteAuthHdr(), body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create folder");
  return res.json();
}

async function apiRenameFolder(id, name) {
  const res = await fetch(`${API_BASE}/api/notes/folders/${id}`, {
    method: "PATCH", headers: noteAuthHdr(), body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to rename folder");
  return res.json();
}

async function apiDeleteFolder(id) {
  await fetch(`${API_BASE}/api/notes/folders/${id}`, { method: "DELETE", headers: noteAuthHdr() });
}

async function apiCreateNote(payload) {
  const res = await fetch(`${API_BASE}/api/notes`, {
    method: "POST", headers: noteAuthHdr(), body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create note");
  return res.json();
}

async function apiSaveNote(id, payload) {
  const res = await fetch(`${API_BASE}/api/notes/${id}`, {
    method: "PATCH", headers: noteAuthHdr(), body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save note");
  return res.json();
}

async function apiDeleteNote(id) {
  await fetch(`${API_BASE}/api/notes/${id}`, { method: "DELETE", headers: noteAuthHdr() });
}

/* ── 보고서 템플릿 ── */
function getNoteTemplate(key) {
  const today = noteToday();
  const [y, m, d] = today.split("-");
  const week = Math.ceil(parseInt(d) / 7);
  const tpls = {
    weekly: {
      title: `${y}년 ${parseInt(m)}월 ${week}주차 주간 보고`,
      content: `<h2>${y}년 ${parseInt(m)}월 ${week}주차 주간 보고</h2>
<p><strong>보고일:</strong> ${today} &nbsp;|&nbsp; <strong>작성자:</strong> &nbsp;</p>
<hr>
<h3>1. 금주 주요 실적</h3>
<ul><li></li><li></li><li></li></ul>
<h3>2. 차주 계획</h3>
<ul><li></li><li></li><li></li></ul>
<h3>3. 리스크 및 이슈</h3>
<table border="1" style="width:100%;border-collapse:collapse"><tbody>
  <tr><th>구분</th><th>내용</th><th>영향도</th><th>조치계획</th></tr>
  <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</tbody></table>
<h3>4. 특이사항</h3>
<p></p>`,
    },
    monthly: {
      title: `${y}년 ${parseInt(m)}월 월간 보고`,
      content: `<h2>${y}년 ${parseInt(m)}월 월간 보고</h2>
<p><strong>보고일:</strong> ${today} &nbsp;|&nbsp; <strong>작성자:</strong> &nbsp;</p>
<hr>
<h3>1. 월간 실적 요약</h3>
<table border="1" style="width:100%;border-collapse:collapse"><tbody>
  <tr><th>프로젝트</th><th>계획 진척률</th><th>실적 진척률</th><th>SPI</th><th>비고</th></tr>
  <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</tbody></table>
<h3>2. 주요 성과</h3>
<ul><li></li><li></li></ul>
<h3>3. 리스크 현황</h3>
<ul><li></li><li></li></ul>
<h3>4. 익월 계획</h3>
<ul><li></li><li></li></ul>
<h3>5. 경영 보고 사항</h3>
<p></p>`,
    },
    meeting: {
      title: `회의록 - ${today}`,
      content: `<h2>회의록</h2>
<table border="1" style="width:100%;border-collapse:collapse"><tbody>
  <tr><th>일시</th><td>${today}</td><th>장소</th><td>&nbsp;</td></tr>
  <tr><th>참석자</th><td colspan="3">&nbsp;</td></tr>
  <tr><th>안건</th><td colspan="3">&nbsp;</td></tr>
</tbody></table>
<hr>
<h3>논의 내용</h3>
<ol><li></li><li></li><li></li></ol>
<h3>결정 사항</h3>
<ul><li>☐ &nbsp;</li><li>☐ &nbsp;</li></ul>
<h3>다음 회의</h3>
<p><strong>일시:</strong> &nbsp;&nbsp;<strong>장소:</strong> </p>`,
    },
    issue: {
      title: `이슈 보고 - ${today}`,
      content: `<h2>이슈 보고서</h2>
<p><strong>보고일:</strong> ${today} &nbsp;|&nbsp; <strong>작성자:</strong> &nbsp;</p>
<hr>
<h3>이슈 개요</h3>
<table border="1" style="width:100%;border-collapse:collapse"><tbody>
  <tr><th>이슈명</th><td colspan="3">&nbsp;</td></tr>
  <tr><th>발생일</th><td>&nbsp;</td><th>심각도</th><td>[ ] 긴급 &nbsp;[ ] 높음 &nbsp;[ ] 중간 &nbsp;[ ] 낮음</td></tr>
  <tr><th>영향 범위</th><td colspan="3">&nbsp;</td></tr>
</tbody></table>
<h3>이슈 상세</h3>
<p></p>
<h3>원인 분석</h3>
<p></p>
<h3>조치 계획</h3>
<ul><li>☐ &nbsp;</li><li>☐ &nbsp;</li></ul>
<h3>완료 기준</h3>
<p></p>`,
    },
  };
  return tpls[key] || null;
}

/* ── 폴더 트리 렌더링 ── */
function renderFolderTree() {
  const el = document.getElementById("folderTree");
  if (!el) return;
  if (!state.noteFolders.length) {
    el.innerHTML = `<p class="folder-tree-empty">폴더가 없습니다</p>`;
    return;
  }
  el.innerHTML = state.noteFolders.map((f) => {
    const active = f.id === state.selectedFolderId;
    return `<div class="folder-item${active ? " active" : ""}" data-folder-id="${f.id}" role="treeitem" tabindex="0">
      <svg viewBox="0 0 24 24" width="15" height="15" class="folder-icon"><path d="M3 7h7l2 2h9v11H3z"/></svg>
      <span class="folder-name">${escapeHtml(f.name)}</span>
      <div class="folder-actions">
        <button class="folder-action-btn" data-folder-rename="${f.id}" title="이름 변경">✏️</button>
        <button class="folder-action-btn" data-folder-delete="${f.id}" title="삭제">🗑</button>
      </div>
    </div>`;
  }).join("");
}

/* ── 노트 목록 렌더링 ── */
function renderNoteList() {
  const el = document.getElementById("noteList");
  if (!el) return;
  if (!state.notes.length) {
    el.innerHTML = `<div class="note-list-empty">노트가 없습니다<br><small>위의 '+ 새 노트'를 클릭하세요</small></div>`;
    return;
  }
  el.innerHTML = state.notes.map((n) => {
    const active = n.id === state.selectedNoteId;
    return `<div class="note-list-item${active ? " active" : ""}" data-note-id="${n.id}" role="listitem" tabindex="0">
      <div class="note-list-title">${escapeHtml(n.title || "제목 없음")}</div>
      <div class="note-list-meta">${noteFmt(n.updated_at)}</div>
    </div>`;
  }).join("");
}

/* ── 에디터 표시/숨김 ── */
function showNoteEditor(visible) {
  const empty  = document.getElementById("noteEditorEmpty");
  const wrap   = document.getElementById("noteEditorWrap");
  const layout = document.querySelector(".notes-layout");
  if (empty) empty.hidden = visible;
  if (wrap)  wrap.hidden  = !visible;
  if (layout) layout.classList.toggle("editor-open", visible);
}

/* ─────────────────────────────────────────────────────────────
   오프라인 리치 텍스트 에디터 (document.execCommand 기반)
   외부 라이브러리 불필요 – 브라우저 내장 편집 엔진 사용
   ───────────────────────────────────────────────────────────── */

function getNoteEditorEl() {
  return document.getElementById("tiptapEditorEl");
}

function initNoteEditor(content = "") {
  const el = getNoteEditorEl();
  if (!el) return false;

  // contenteditable 영역으로 전환
  el.innerHTML = "";
  el.contentEditable = "true";
  el.spellcheck = false;
  if (!el.getAttribute("data-placeholder")) {
    el.setAttribute("data-placeholder", "내용을 입력하세요…");
  }
  el.innerHTML = content || "";
  el.focus();

  // 변경 감지 → 자동 저장
  el.oninput = () => scheduleNoteSave();

  // 툴바 연결
  const toolbar = document.getElementById("tiptapToolbar");
  if (toolbar && !toolbar._bound) {
    toolbar._bound = true;
    toolbar.addEventListener("mousedown", (e) => {
      // mousedown 에서 preventDefault 해야 에디터 포커스가 유지됨
      const btn = e.target.closest("[data-tt]");
      if (!btn) return;
      e.preventDefault();
      execNoteCmd(btn.dataset.tt);
    });
  }

  return true;
}

function execNoteCmd(cmd) {
  const el = getNoteEditorEl();
  if (!el) return;
  el.focus();

  const cmdMap = {
    bold:        () => document.execCommand("bold"),
    italic:      () => document.execCommand("italic"),
    underline:   () => document.execCommand("underline"),
    strike:      () => document.execCommand("strikeThrough"),
    h1:          () => document.execCommand("formatBlock", false, "<h1>"),
    h2:          () => document.execCommand("formatBlock", false, "<h2>"),
    h3:          () => document.execCommand("formatBlock", false, "<h3>"),
    bulletList:  () => document.execCommand("insertUnorderedList"),
    orderedList: () => document.execCommand("insertOrderedList"),
    taskList:    () => insertTaskItem(),
    codeBlock:   () => document.execCommand("formatBlock", false, "<pre>"),
    blockquote:  () => document.execCommand("formatBlock", false, "<blockquote>"),
    hr:          () => document.execCommand("insertHorizontalRule"),
    table:       () => insertTable(),
    undo:        () => document.execCommand("undo"),
    redo:        () => document.execCommand("redo"),
  };
  if (cmdMap[cmd]) cmdMap[cmd]();
  syncToolbarState();
}

function insertTaskItem() {
  const html = `<ul class="task-list"><li><label><input type="checkbox"> </label></li></ul>`;
  document.execCommand("insertHTML", false, html);
}

function insertTable() {
  const rows = 3, cols = 3;
  let html = `<table border="1" style="width:100%;border-collapse:collapse"><thead><tr>`;
  for (let c = 0; c < cols; c++) html += `<th style="padding:6px 10px;background:#f5f5f7">&nbsp;</th>`;
  html += `</tr></thead><tbody>`;
  for (let r = 0; r < rows - 1; r++) {
    html += `<tr>`;
    for (let c = 0; c < cols; c++) html += `<td style="padding:6px 10px">&nbsp;</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table><p></p>`;
  document.execCommand("insertHTML", false, html);
}

/* 툴바 활성 상태 동기화 */
function syncToolbarState() {
  const toolbar = document.getElementById("tiptapToolbar");
  if (!toolbar) return;
  const checks = {
    bold:       () => document.queryCommandState("bold"),
    italic:     () => document.queryCommandState("italic"),
    underline:  () => document.queryCommandState("underline"),
    strike:     () => document.queryCommandState("strikeThrough"),
    bulletList: () => document.queryCommandState("insertUnorderedList"),
    orderedList:() => document.queryCommandState("insertOrderedList"),
  };
  toolbar.querySelectorAll("[data-tt]").forEach((btn) => {
    const fn = checks[btn.dataset.tt];
    btn.classList.toggle("is-active", fn ? fn() : false);
  });
}

function getNoteHTML() {
  const el = getNoteEditorEl();
  return el ? el.innerHTML : "";
}

/* ── 자동 저장 ── */
function scheduleNoteSave() {
  if (!state.selectedNoteId) return;
  const status = document.getElementById("noteSaveStatus");
  if (status) status.textContent = "저장 중…";
  clearTimeout(state.noteSaveTimer);
  state.noteSaveTimer = setTimeout(async () => {
    if (!state.selectedNoteId) return;
    try {
      const title   = (document.getElementById("noteTitleInput")?.value || "").trim() || "제목 없음";
      const content = getNoteHTML();
      await apiSaveNote(state.selectedNoteId, { title, content });
      const idx = state.notes.findIndex((n) => n.id === state.selectedNoteId);
      if (idx >= 0) state.notes[idx].title = title;
      renderNoteList();
      if (status) status.textContent = "저장됨 " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } catch(e) {
      if (status) status.textContent = "저장 실패";
    }
  }, 1200);
}

/* ── 노트 열기 ── */
async function openNote(noteId) {
  state.selectedNoteId = noteId;
  renderNoteList();
  showNoteEditor(true);

  const titleEl = document.getElementById("noteTitleInput");
  if (titleEl) titleEl.value = "불러오는 중…";

  try {
    const note = await loadNoteContent(noteId);
    if (titleEl) titleEl.value = note.title || "";
    initNoteEditor(note.content || "");
  } catch(e) {
    if (titleEl) titleEl.value = "오류: 노트를 불러올 수 없습니다";
  }
}

/* ── 메인 렌더 ── */
async function renderNotes() {
  await loadNoteFolders();
  await loadNotes(state.selectedFolderId);
  renderFolderTree();
  renderNoteList();
  if (!state.selectedNoteId) showNoteEditor(false);
}

/* ── 이벤트 연결 (패널 진입 1회) ── */
let _notesEventsAttached = false;
function attachNoteEvents() {
  if (_notesEventsAttached) return;
  _notesEventsAttached = true;

  /* 폴더 트리 */
  document.getElementById("folderTree")?.addEventListener("click", async (e) => {
    const renameBtn = e.target.closest("[data-folder-rename]");
    const deleteBtn = e.target.closest("[data-folder-delete]");
    const item      = e.target.closest("[data-folder-id]");
    if (renameBtn) {
      e.stopPropagation();
      const id  = renameBtn.dataset.folderRename;
      const cur = state.noteFolders.find((f) => f.id === id)?.name || "";
      const name = prompt("폴더 이름 변경:", cur);
      if (name && name.trim() && name.trim() !== cur) {
        await apiRenameFolder(id, name.trim());
        await loadNoteFolders();
        renderFolderTree();
      }
    } else if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.dataset.folderDelete;
      const f  = state.noteFolders.find((x) => x.id === id);
      if (confirm(`'${f?.name}' 폴더를 삭제할까요? 폴더 안의 노트는 미분류로 이동됩니다.`)) {
        await apiDeleteFolder(id);
        if (state.selectedFolderId === id) state.selectedFolderId = null;
        await renderNotes();
      }
    } else if (item) {
      const fid = item.dataset.folderId;
      state.selectedFolderId = state.selectedFolderId === fid ? null : fid;
      await loadNotes(state.selectedFolderId);
      renderFolderTree();
      renderNoteList();
    }
  });

  /* 새 폴더 */
  document.getElementById("newFolderBtn")?.addEventListener("click", async () => {
    const name = prompt("새 폴더 이름:");
    if (!name || !name.trim()) return;
    await apiCreateFolder(name.trim());
    await loadNoteFolders();
    renderFolderTree();
  });

  /* 노트 목록 */
  document.getElementById("noteList")?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-note-id]");
    if (!item) return;
    openNote(item.dataset.noteId);
  });

  /* 새 노트 */
  document.getElementById("newNoteBtn")?.addEventListener("click", async () => {
    const note = await apiCreateNote({
      folder_id: state.selectedFolderId || null,
      title: `노트 - ${noteToday()}`,
      content: "",
    });
    state.notes.unshift(note);
    renderNoteList();
    openNote(note.id);
  });

  /* 제목 입력 → 자동 저장 */
  document.getElementById("noteTitleInput")?.addEventListener("input", () => scheduleNoteSave());

  /* 에디터 셀렉션 변경 → 툴바 상태 */
  document.getElementById("tiptapEditorEl")?.addEventListener("keyup", syncToolbarState);
  document.getElementById("tiptapEditorEl")?.addEventListener("mouseup", syncToolbarState);

  /* 노트 삭제 */
  document.getElementById("noteDeleteBtn")?.addEventListener("click", async () => {
    if (!state.selectedNoteId) return;
    const note = state.notes.find((n) => n.id === state.selectedNoteId);
    if (!confirm(`'${note?.title || "이 노트"}'를 삭제할까요?`)) return;
    await apiDeleteNote(state.selectedNoteId);
    state.notes = state.notes.filter((n) => n.id !== state.selectedNoteId);
    state.selectedNoteId = null;
    const el = getNoteEditorEl();
    if (el) { el.innerHTML = ""; el.contentEditable = "false"; }
    renderNoteList();
    showNoteEditor(false);
  });

  /* 템플릿 picker 토글 */
  document.getElementById("noteTemplateBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const picker = document.getElementById("templatePicker");
    if (picker) picker.hidden = !picker.hidden;
  });

  /* 템플릿 선택 */
  document.getElementById("templatePicker")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-tpl]");
    if (!btn) return;
    document.getElementById("templatePicker").hidden = true;
    const key = btn.dataset.tpl;
    const tpl = getNoteTemplate(key);
    if (!tpl) return;

    const editorEl = getNoteEditorEl();
    if (editorEl && editorEl.contentEditable === "true") {
      const titleEl = document.getElementById("noteTitleInput");
      if (titleEl && !titleEl.value.trim()) titleEl.value = tpl.title;
      editorEl.innerHTML = tpl.content;
      scheduleNoteSave();
    } else {
      const note = await apiCreateNote({
        folder_id: state.selectedFolderId || null,
        title: tpl.title,
        content: tpl.content,
        template_key: key,
      });
      state.notes.unshift(note);
      renderNoteList();
      openNote(note.id);
    }
  });

  /* 인쇄 */
  document.getElementById("notePrintBtn")?.addEventListener("click", () => {
    const title   = document.getElementById("noteTitleInput")?.value || "노트";
    const content = getNoteHTML();
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #111; }
        h1,h2,h3 { margin-top: 1.5em; }
        table { border-collapse: collapse; width: 100%; }
        td,th { border: 1px solid #ccc; padding: 6px 10px; }
        code, pre { background: #f4f4f4; }
        blockquote { border-left: 3px solid #ccc; margin: 0; padding-left: 16px; color: #555; }
        @media print { body { margin: 0; } }
      </style>
    </head><body><h1>${escapeHtml(title)}</h1>${content}</body></html>`);
    win.document.close();
    win.print();
  });

  /* 문서 클릭 → picker 닫기 */
  document.addEventListener("click", () => {
    const picker = document.getElementById("templatePicker");
    if (picker && !picker.hidden) picker.hidden = true;
  });

  /* 검색 */
  let _noteSearchTimer = null;
  document.getElementById("noteSearch")?.addEventListener("input", (e) => {
    clearTimeout(_noteSearchTimer);
    _noteSearchTimer = setTimeout(async () => {
      await loadNotes(state.selectedFolderId, e.target.value.trim());
      renderNoteList();
    }, 350);
  });
}

/* ── nav 클릭 → 노트 패널 진입 ── */
document.querySelector(".nav-list")?.addEventListener("click", (e) => {
  const link = e.target.closest("a[href='#notes']");
  if (!link) return;
  setTimeout(() => {
    attachNoteEvents();
    renderNotes();
  }, 50);
}, true);
