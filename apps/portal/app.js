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
  wbsExpanded: {},    // code → boolean (기본 expanded)
  wbsPlanProjectId: null,
  wbsPlanRows: [],          // 편집 중인 클라이언트 사이드 행
  wbsPlanDirty: false,      // 저장 안 된 변경 있음
  wbsPlanEditCode: null,    // 현재 수정 중인 WBS 코드 (null=신규)
  wbsPlanSearch: "",
  wbsPlanPhaseFilter: "",
  wbsPlanTypeFilter: "",
};

/* ── 사용자 가이드 콘텐츠 정의 ─────────────────────────────────────── */

const WBS_GUIDE_MENUS = [
  { id: "dashboard",  label: "대시보드" },
  { id: "portfolio",  label: "프로젝트" },
  { id: "templates",  label: "표준 WBS" },
  { id: "approvals",  label: "승인 이력" },
  { id: "imports",    label: "Excel 반영" },
  { id: "sync",       label: "OpenProject" },
  { id: "operations", label: "운영 점검" },
  { id: "users",      label: "사용자" },
  { id: "audit",      label: "감사 로그" },
  { id: "settings",   label: "설정" },
];

const WBS_GUIDE_CONTENTS = {
  dashboard: {
    kind: "overview",
    hero: {
      eyebrow: "사용자 가이드",
      title: "WBS 포털 개요",
      description: "PMO와 프로젝트 팀이 WBS 기준선을 관리하고 OpenProject로 작업 패키지를 동기화하는 통합 운영 포털입니다. 로그인 후 역할에 따라 접근 가능한 메뉴가 달라집니다.",
      tags: ["PMO", "WBS", "OpenProject", "승인"],
    },
    summary: [
      { id: "admin",  label: "관리자",  value: "admin",   description: "사용자 관리, 설정 변경, 전체 메뉴 접근 가능", tone: "good" },
      { id: "pmo",    label: "PMO",     value: "pmo",     description: "프로젝트 생성, WBS 업로드, 승인 처리 가능", tone: "info" },
      { id: "viewer", label: "조회자",  value: "viewer",  description: "대시보드, 프로젝트, 표준 WBS, 승인 이력 조회 전용", tone: "neutral" },
    ],
    actions: [
      { id: "go-portfolio", label: "프로젝트 현황 보기",  description: "등록된 프로젝트 목록과 WBS 계획을 확인합니다.", targetView: "portfolio", tone: "good" },
      { id: "go-templates", label: "표준 WBS 다운로드",  description: "회사 표준 WBS 템플릿을 Excel로 받아 작성합니다.", targetView: "templates", tone: "info" },
      { id: "go-imports",   label: "Excel 업로드 시작",  description: "작성한 WBS Excel을 업로드하고 검증합니다.", targetView: "imports",   tone: "info" },
    ],
    resources: [
      { id: "wbs-concept", title: "WBS 코드 체계",       description: "부모 코드에 순서 번호를 붙여 계층을 표현합니다. 마일스톤은 M1, M2... 접두사를 사용합니다.", meta: "WBS 코드 규칙" },
      { id: "workflow",    title: "프로젝트 상태 흐름",   description: "초안 → 검토 → 승인 → 동기화 완료 순서로 진행됩니다. 반려 시 초안으로 돌아갑니다.", meta: "워크플로우" },
    ],
  },

  portfolio: {
    kind: "procedure",
    hero: {
      eyebrow: "프로젝트",
      title: "프로젝트 생성부터 OpenProject 동기화까지",
      description: "PMO 권한으로 프로젝트를 생성하고, WBS를 반영한 뒤, 승인을 거쳐 OpenProject 작업 패키지로 동기화합니다.",
      tags: ["프로젝트 생성", "WBS 반영", "승인", "동기화"],
    },
    steps: [
      {
        id: "create",  order: 1, title: "프로젝트 생성",
        outcome: "프로젝트명, 담당자, 템플릿, 시작일을 입력해 초안 상태로 등록합니다.",
        targetView: "portfolio", status: "ready",
        checks: ["프로젝트 생성 버튼 → 다이얼로그 입력", "템플릿은 SI 구축 / 데이터 이관 / 유지보수 중 선택"],
      },
      {
        id: "upload-wbs", order: 2, title: "WBS Excel 업로드 (선택)",
        outcome: "표준 WBS 대신 팀이 작성한 커스텀 WBS를 프로젝트에 반영합니다.",
        targetView: "imports", status: "ready",
        checks: ["Excel 반영 메뉴에서 템플릿 다운로드", "WBS 작성 후 업로드 → 검증 통과 확인", "반영 버튼으로 프로젝트에 적용"],
      },
      {
        id: "approval", order: 3, title: "승인 요청",
        outcome: "PMO가 프로젝트 행의 자동 승인 버튼을 누르면 기준선이 잠깁니다.",
        targetView: "portfolio", status: "ready",
        checks: ["프로젝트 목록에서 해당 프로젝트의 자동 승인 버튼 클릭", "승인 이력 메뉴에서 상태 확인"],
        caution: "승인 전에는 실제 OpenProject 동기화가 차단됩니다.",
      },
      {
        id: "sync", order: 4, title: "OpenProject 동기화",
        outcome: "승인된 WBS 항목을 OpenProject 작업 패키지로 생성합니다.",
        targetView: "sync", status: "ready",
        checks: ["OpenProject 메뉴 → 점검 버튼으로 연결 상태 확인", "모의 실행으로 payload 사전 검토", "동기화 버튼 클릭 (admin/PMO 권한 + 승인 상태 필요)"],
      },
    ],
    guardrails: [
      "프로젝트 상태가 '승인'이어야 실제 동기화가 가능합니다.",
      "동기화 후 프로젝트 상태는 '동기화 완료'로 자동 변경됩니다.",
    ],
  },

  templates: {
    kind: "task-list",
    hero: {
      eyebrow: "표준 WBS",
      title: "회사 표준 WBS 템플릿 관리",
      description: "SI 구축, 데이터 이관, 유지보수 유형별 표준 WBS 템플릿을 Excel로 다운로드하고, 수정 후 업로드해 갱신합니다.",
      tags: ["SI 구축", "데이터 이관", "유지보수", "Excel"],
    },
    tasks: [
      {
        id: "download", title: "표준 WBS 다운로드",
        description: "템플릿 선택 후 다운로드 버튼 또는 상단 Excel 다운로드 버튼을 클릭합니다. WBS 코드, 작업명, 유형, 가중치가 포함된 워크시트를 받습니다.",
        status: "ready", required: true, targetView: "templates",
        checks: ["템플릿 선택 드롭다운에서 유형 선택", "Excel 다운로드 버튼 클릭", "Guide 시트에서 작성 규칙 확인"],
      },
      {
        id: "edit", title: "WBS 항목 작성·수정",
        description: "Excel의 WBS 시트에서 항목을 추가하거나 수정합니다. WBS 코드는 비워도 레벨과 순서 기준으로 자동 생성됩니다.",
        status: "ready", required: true,
        checks: ["작업명(필수), 유형, 담당자, 가중치 입력", "가중치 합계가 부모와 일치하도록 조정", "코드는 비워도 무방"],
      },
      {
        id: "upload", title: "수정된 Excel 업로드",
        description: "Excel 반영 메뉴에서 수정된 파일을 업로드하면 계층·일정·가중치 검증이 자동 실행됩니다.",
        status: "ready", required: true, targetView: "imports",
        checks: ["Excel 업로드 버튼 클릭 후 파일 선택", "정상/오류 행 수 확인", "diff 비교로 변경 내용 검토"],
      },
      {
        id: "renumber", title: "WBS 코드 정렬 (선택)",
        description: "항목 순서가 바뀐 경우 코드 정렬 버튼을 눌러 계층 구조에 맞게 코드를 재정렬합니다.",
        status: "ready", required: false,
        checks: ["코드 정렬 버튼 클릭", "결과 미리보기에서 변경 행 수 확인"],
      },
    ],
    guardrails: [
      "템플릿 변경 시 버전이 자동 저장됩니다. 이전 버전은 템플릿 버전 목록에서 확인할 수 있습니다.",
      "검증 오류가 있으면 반영 버튼이 비활성화됩니다. 오류 Excel 다운로드로 상세 내용을 확인하세요.",
    ],
  },

  approvals: {
    kind: "reference",
    hero: {
      eyebrow: "승인 이력",
      title: "WBS 기준선 승인 정책",
      description: "PMO가 프로젝트의 WBS 기준선 잠금을 요청하고, PMO Lead가 승인 또는 반려합니다. 내부 PMO 기준선은 자동 승인됩니다.",
      tags: ["승인", "반려", "기준선", "자동 승인"],
    },
    summary: [
      { id: "pending",  label: "대기",      value: "Pending",  description: "승인 요청이 접수되어 PMO Lead의 검토를 기다리는 상태", tone: "warn" },
      { id: "approved", label: "승인",      value: "Approved", description: "기준선이 잠겨 실제 OpenProject 동기화가 허용됩니다.", tone: "good" },
      { id: "rejected", label: "반려",      value: "Rejected", description: "WBS 수정이 필요한 상태. 프로젝트를 초안으로 되돌려 재작업합니다.", tone: "bad" },
    ],
    resources: [
      { id: "auto-approve",   title: "자동 승인 정책",     description: "프로젝트 행의 자동 승인 버튼을 클릭하면 내부 PMO 기준선으로 즉시 승인됩니다.", meta: "기본 정책" },
      { id: "manual-approve", title: "수동 승인/반려",     description: "승인 이력 목록에서 대기 상태 항목의 승인 또는 반려 버튼을 클릭합니다. PMO/admin 권한 필요.", meta: "수동 처리" },
      { id: "baseline",       title: "기준선 잠금 효과",   description: "승인 완료 시 WBS 행이 스냅샷으로 저장되어 버전 이력이 보존됩니다.", meta: "기준선" },
    ],
    guardrails: [
      "승인 처리는 PMO 또는 admin 권한이 필요합니다.",
      "반려 후에는 프로젝트가 자동으로 '검토' 상태로 돌아갑니다.",
    ],
  },

  imports: {
    kind: "procedure",
    hero: {
      eyebrow: "Excel 반영",
      title: "WBS Excel 업로드 절차",
      description: "Excel 파일을 업로드해 계층·일정·가중치를 검증하고, diff 비교 후 반영합니다. 오류가 있으면 오류 Excel로 상세 내용을 확인할 수 있습니다.",
      tags: ["Excel", "검증", "diff", "반영"],
    },
    steps: [
      {
        id: "download-template", order: 1, title: "템플릿 다운로드",
        outcome: "작성 기준이 담긴 Excel 워크북을 받습니다.",
        targetView: "templates", status: "ready",
        checks: ["상단 Excel 다운로드 버튼 또는 표준 WBS 메뉴에서 다운로드", "Guide 시트의 작성 규칙 확인"],
      },
      {
        id: "fill-wbs", order: 2, title: "WBS 작성",
        outcome: "WBS 시트에 항목을 입력합니다. WBS 코드는 생략 가능합니다.",
        status: "ready",
        checks: ["작업명 필수 입력", "가중치 0-100 범위 입력", "부모 코드가 있는 경우 해당 코드 입력"],
      },
      {
        id: "upload", order: 3, title: "파일 업로드",
        outcome: "파일을 업로드하면 자동 검증이 실행됩니다.",
        status: "ready",
        checks: ["Excel 업로드 라벨 클릭 후 .xlsx 파일 선택", "정상/오류 행 수 및 문제 목록 확인"],
        caution: "오류가 1건이라도 있으면 반영 버튼이 비활성화됩니다.",
      },
      {
        id: "review-diff", order: 4, title: "변경 비교 확인",
        outcome: "기존 데이터 대비 추가·변경·삭제 행을 확인합니다.",
        status: "ready",
        checks: ["변경 비교 섹션에서 추가/변경/삭제 항목 검토", "예상과 다른 변경이 있으면 Excel 재수정"],
      },
      {
        id: "apply", order: 5, title: "반영",
        outcome: "검증 통과 후 반영 버튼을 눌러 데이터베이스에 저장합니다.",
        status: "ready",
        checks: ["반영 버튼 클릭 (PMO/admin 권한 필요)", "반영 후 프로젝트 메뉴에서 WBS 계획 확인"],
      },
    ],
    questions: [
      { id: "error-excel",  question: "오류가 있을 때 어디서 내용을 확인하나요?", answer: "오류 Excel 버튼이 활성화되면 클릭해 다운로드하세요. Issues 시트에 행 번호, 필드, 오류 메시지가 정리되어 있습니다." },
      { id: "auto-code",    question: "WBS 코드를 비워두면 어떻게 되나요?",       answer: "레벨 값과 행 순서를 기반으로 코드가 자동 생성됩니다. 자동 생성된 코드는 경고로 표시됩니다." },
      { id: "weight-warn",  question: "가중치 합 경고가 나오면 어떻게 하나요?",    answer: "형제 노드 가중치 합이 부모 가중치와 달라도 업로드는 가능합니다. 다만 진척률 계산이 부정확해질 수 있으므로 가급적 일치시키세요." },
    ],
  },

  sync: {
    kind: "procedure",
    hero: {
      eyebrow: "OpenProject",
      title: "OpenProject 동기화 절차",
      description: "WBS 기준선이 승인된 프로젝트를 OpenProject 작업 패키지로 동기화합니다. 사전 점검 → 모의 실행 → 실제 동기화 순서로 진행합니다.",
      tags: ["preflight", "dry-run", "동기화", "작업 패키지"],
    },
    steps: [
      {
        id: "preflight", order: 1, title: "사전 점검",
        outcome: "OpenProject API 연결 상태, 토큰 설정, 인증 사용자를 확인합니다.",
        status: "ready",
        checks: ["프로젝트 선택 드롭다운에서 동기화 대상 선택", "점검 버튼 클릭 → 체크 항목 결과 확인", "API 루트, 동기화 설정, API 토큰, 인증 사용자 모두 '정상' 확인"],
        caution: "API 토큰이 설정되지 않으면 실제 동기화가 차단됩니다.",
      },
      {
        id: "dry-run", order: 2, title: "모의 실행",
        outcome: "실제 작업 패키지를 생성하지 않고 payload를 사전 검토합니다.",
        status: "ready",
        checks: ["모의 실행 버튼 클릭", "payload 미리보기에서 전송될 데이터 확인", "대기 행 수가 예상과 일치하는지 확인"],
      },
      {
        id: "actual-sync", order: 3, title: "실제 동기화",
        outcome: "프로젝트 WBS 항목을 OpenProject에 작업 패키지로 생성합니다.",
        status: "ready",
        checks: ["동기화 버튼 클릭 (승인 상태 + API 준비 완료 시에만 활성화)", "최근 실행 목록에서 생성된 작업 패키지 수 확인"],
        caution: "동기화 버튼은 프로젝트 상태가 '승인'이고 preflight가 준비됐을 때만 활성화됩니다.",
      },
    ],
    runModes: [
      {
        id: "mock",   name: "모의 엔진",      trigger: "PM_ENGINE_ADAPTER=mock 환경 변수 설정",
        facts: [{ label: "용도", value: "로컬 개발·데모 환경에서 실제 OpenProject 없이 동기화 흐름 검증" }],
      },
      {
        id: "actual", name: "CE API 어댑터",  trigger: "OPENPROJECT_SYNC_ENABLED=true + API 토큰 설정",
        facts: [{ label: "용도", value: "실제 온프레미스 OpenProject CE와 연동" }],
      },
    ],
    questions: [
      { id: "sync-disabled", question: "동기화 버튼이 비활성화되어 있습니다.",   answer: "① 프로젝트 상태가 '승인'인지 확인, ② preflight 점검에서 모든 항목이 정상인지 확인, ③ OPENPROJECT_SYNC_ENABLED=true 설정 여부 확인." },
      { id: "already-synced", question: "이미 동기화된 항목은 어떻게 되나요?", answer: "코드별로 이미 생성된 작업 패키지는 건너뜁니다. 신규 항목만 추가 생성됩니다." },
    ],
  },

  operations: {
    kind: "troubleshooting",
    hero: {
      eyebrow: "운영 점검",
      title: "제품화 체크리스트 문제 해결",
      description: "18개 헬스체크 항목을 확인하고, 오류 또는 경고 항목에 대한 조치 방법을 안내합니다.",
      tags: ["헬스체크", "PostgreSQL", "백업", "보안"],
    },
    questions: [
      { id: "db-fail",       question: "PostgreSQL 항목이 오류 상태입니다.",        answer: "API 컨테이너가 데이터베이스에 연결할 수 없는 상태입니다. docker compose logs wbs-api 로 에러를 확인하고, DATABASE_URL 환경 변수와 postgres 서비스 상태를 점검하세요." },
      { id: "schema-fail",   question: "스키마 마이그레이션 항목이 실패합니다.",    answer: "WBS_RUN_MIGRATIONS_ON_STARTUP=true 설정을 확인하세요. 필요하면 wbs-api 컨테이너를 재시작하면 마이그레이션이 재실행됩니다." },
      { id: "backup-warn",   question: "백업 리허설 경고가 표시됩니다.",             answer: "scripts/backup-postgres.sh를 실행해 최신 백업을 생성하세요. 백업 파일은 backups/postgres/ 에 저장됩니다." },
      { id: "cors-warn",     question: "CORS 정책 경고가 표시됩니다.",               answer: "WBS_ALLOW_FILE_ORIGIN=true로 file:// origin이 허용된 상태입니다. 운영 환경에서는 false로 변경하고 PORTAL_ORIGIN을 정확한 도메인으로 설정하세요." },
      { id: "op-warn",       question: "OpenProject preflight 항목이 경고입니다.",  answer: "OPENPROJECT_SYNC_ENABLED=false이거나 API 토큰이 없는 경우입니다. 모의 실행 모드에서는 정상이며, 실 동기화가 필요한 경우에만 설정하세요." },
      { id: "setting-warn",  question: "설정 레지스트리 항목이 경고입니다.",         answer: "시스템 설정이 3건 미만입니다. 설정 메뉴에서 PM 엔진 어댑터 설정을 저장하면 항목이 추가됩니다." },
      { id: "user-locked",   question: "계정 잠금 경고가 표시됩니다.",               answer: "로그인 5회 실패로 잠긴 계정이 있습니다. 사용자 메뉴에서 해당 계정의 세션 종료 후 비밀번호를 재설정하거나, 15분 후 자동 해제를 기다리세요." },
    ],
    decisions: [
      { id: "critical", title: "전체 상태가 '오류'",  description: "오류 항목을 우선 해결합니다. PostgreSQL 연결, 스키마 마이그레이션, 접근 제어 순서로 확인하세요." },
      { id: "watch",    title: "전체 상태가 '주의'",  description: "서비스는 작동 중이지만 개선이 필요합니다. 백업, CORS, OpenProject 설정을 순서대로 검토하세요." },
    ],
  },

  users: {
    kind: "task-list",
    hero: {
      eyebrow: "사용자 관리",
      title: "포털 사용자 계정 관리",
      description: "admin 권한으로 포털 사용자를 생성하고, 역할을 설정하고, 보안 정책을 적용합니다.",
      tags: ["계정 생성", "역할", "비밀번호", "세션"],
    },
    tasks: [
      {
        id: "create-user", title: "계정 생성",
        description: "이메일, 표시 이름, 역할, 초기 비밀번호를 입력합니다. 계정 생성 후 사용자에게 초기 비밀번호 변경을 안내하세요.",
        status: "ready", required: true, ownerRole: "admin",
        checks: ["이메일은 회사 도메인 사용 권장", "역할: 관리자/PMO/조회자 중 선택", "비밀번호 8자 이상"],
      },
      {
        id: "set-role", title: "역할 변경",
        description: "사용자 목록에서 역할 드롭다운을 변경하고 저장 버튼을 클릭합니다.",
        status: "ready", required: false, ownerRole: "admin",
        checks: ["admin: 전체 관리 권한", "pmo: 프로젝트/WBS/승인 작업 권한", "viewer: 조회 전용"],
      },
      {
        id: "reset-pw", title: "비밀번호 초기화",
        description: "사용자 행에서 새 비밀번호를 입력하고 저장하면 즉시 변경되며 다음 로그인 시 변경을 강제합니다.",
        status: "ready", required: false, ownerRole: "admin",
        checks: ["비밀번호 입력란에 신규 비밀번호 입력 후 저장", "사용자는 다음 로그인 시 비밀번호 변경 화면으로 이동"],
      },
      {
        id: "revoke", title: "세션 종료",
        description: "특정 사용자의 모든 활성 세션을 즉시 종료합니다. 계정 탈취 의심 시 즉시 실행하세요.",
        status: "ready", required: false, ownerRole: "admin",
        checks: ["세션 종료 버튼 클릭 → 즉시 적용", "해당 사용자는 재로그인 필요"],
      },
    ],
    guardrails: [
      "사용자 관리는 admin 권한 전용입니다.",
      "로그인 5회 실패 시 15분간 계정이 잠깁니다. 운영 점검 메뉴에서 잠긴 계정 수를 확인할 수 있습니다.",
    ],
  },

  audit: {
    kind: "reference",
    hero: {
      eyebrow: "감사 로그",
      title: "운영 감사 이벤트 안내",
      description: "포털에서 발생하는 주요 행위가 자동으로 기록됩니다. 최근 30건을 조회할 수 있으며 admin/PMO 권한이 필요합니다.",
      tags: ["감사", "이벤트", "보안", "로그"],
    },
    summary: [
      { id: "retention", label: "보존 기간",  value: "365일",  description: "기본 보존 기간이며 WBS_AUDIT_RETENTION_DAYS 환경 변수로 변경 가능합니다.", tone: "info" },
      { id: "access",    label: "접근 권한",  value: "PMO+",   description: "admin 및 pmo 역할만 감사 로그를 조회할 수 있습니다.", tone: "warn" },
    ],
    resources: [
      { id: "auth-events",    title: "인증 이벤트",          description: "로그인, 로그아웃, 로그인 실패, 계정 잠금, 비밀번호 변경이 기록됩니다.", meta: "auth.*" },
      { id: "project-events", title: "프로젝트 이벤트",      description: "프로젝트 생성, 상태 변경, 승인 생성·완료·반려가 기록됩니다.", meta: "project.* / approval.*" },
      { id: "import-events",  title: "Excel 반영 이벤트",    description: "미리보기, 반영, 프로젝트 WBS 반영 시 행위자와 파일명이 저장됩니다.", meta: "import.*" },
      { id: "sync-events",    title: "동기화 이벤트",        description: "모의 실행, 실제 동기화 결과가 행위자, 엔진, 생성된 작업 패키지 수와 함께 기록됩니다.", meta: "pm_engine.*" },
      { id: "setting-events", title: "설정·사용자 이벤트",   description: "설정 변경, 사용자 생성·수정, 세션 종료 이벤트가 저장됩니다.", meta: "setting.* / user.*" },
    ],
  },

  settings: {
    kind: "reference",
    hero: {
      eyebrow: "설정",
      title: "플랫폼 설정 가이드",
      description: "PM 엔진 어댑터 등 플랫폼 동작에 영향을 주는 설정을 관리합니다. admin 권한이 필요합니다.",
      tags: ["PM 엔진", "어댑터", "환경 변수"],
    },
    summary: [
      { id: "mock",   label: "모의 엔진",  value: "mock",        description: "실제 OpenProject 없이 동기화 흐름을 테스트합니다. 개발·데모 환경 전용.", tone: "warn" },
      { id: "real",   label: "CE 어댑터", value: "openproject",  description: "온프레미스 OpenProject CE와 실제 연동합니다. 운영 환경 권장.", tone: "good" },
    ],
    resources: [
      { id: "env-sync",    title: "OPENPROJECT_SYNC_ENABLED",  description: "true로 설정해야 실제 동기화 버튼이 활성화됩니다.", meta: "환경 변수" },
      { id: "env-token",   title: "OPENPROJECT_API_TOKEN",     description: "OpenProject API key. 없으면 실 동기화가 차단됩니다.", meta: "환경 변수" },
      { id: "env-url",     title: "OPENPROJECT_BASE_URL",      description: "온프레미스 OpenProject 주소. docker compose 기준 기본값: http://openproject", meta: "환경 변수" },
      { id: "env-adapter", title: "PM_ENGINE_ADAPTER",         description: "openproject(기본) 또는 mock. 설정 메뉴의 PM 엔진 어댑터와 연동됩니다.", meta: "환경 변수" },
      { id: "env-session", title: "WBS_SESSION_TTL_HOURS",     description: "세션 유지 시간(기본 12시간). 보안 정책에 맞게 조정하세요.", meta: "환경 변수" },
    ],
    guardrails: [
      "설정 변경은 admin 권한 전용입니다.",
      "PM 엔진 어댑터 설정 오류 시 OpenProject 동기화 전체가 차단됩니다. 변경 전 반드시 사전 점검을 실행하세요.",
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
  if (viewId === "operations") return canAccessOperations();
  if (viewId === "users") return canManageUsers();
  if (viewId === "audit") return canViewAudit();
  if (viewId === "settings") return canViewSettings();
  if (viewId === "wbs-plan") return Boolean(state.currentUser);
  if (viewId === "guide") return Boolean(state.currentUser);
  return true;
}

/* 역할 레벨 */
const ROLE_LEVEL = { viewer: 1, pmo: 2, admin: 3 };

function renderAuthState() {
  const isAuthenticated = Boolean(state.currentUser && state.authToken);
  document.body.dataset.auth = isAuthenticated ? "authenticated" : "login";
  document.querySelector("#userBadge").textContent = isAuthenticated
    ? `${state.currentUser.display_name} · ${roleLabel(state.currentUser.role)}`
    : "-";

  /* ── 역할 기반 메뉴 표시/숨김 ── */
  const userLevel = ROLE_LEVEL[state.currentUser?.role] || 0;
  document.querySelectorAll(".nav-list a[data-min-role]").forEach((link) => {
    const minLevel = ROLE_LEVEL[link.dataset.minRole] || 1;
    link.classList.toggle("nav-role-hidden", userLevel < minLevel);
    link.hidden = userLevel < minLevel;
  });

  /* ── 패널 접근 제어 (기존 toggleNavAndPanel 유지) ── */
  toggleNavAndPanel("#operations", canAccessOperations());
  toggleNavAndPanel("#users", canManageUsers());
  toggleNavAndPanel("#audit", canViewAudit());
  toggleNavAndPanel("#settings", canViewSettings());

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
  // metric-grid DOM 요소는 제거됨 — portfolioMeta에서 요약 표시
  renderPortfolioMeta();
}

function renderPortfolioMeta() {
  const meta = document.querySelector("#portfolioMeta");
  if (!meta) return;
  const total   = state.dashboard.metrics.projects || state.projects.length;
  const pending = state.dashboard.metrics.pending_approvals || 0;
  const syncLbl = syncStateLabel(state.pmPreflight?.state);
  const syncCls = syncStateClass(state.pmPreflight?.state);
  meta.innerHTML = `
    <span><strong>${total}</strong>개 프로젝트</span>
    <span><strong>${pending}</strong>건 승인 대기</span>
    <span>OpenProject <span class="status-pill ${syncCls}" style="font-size:0.72rem;padding:1px 7px">${escapeHtml(syncLbl)}</span></span>
  `;
}

function renderPortfolioFilter() {
  document.querySelectorAll("#portfolioFilter .filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === state.portfolioFilter);
  });
}

function renderTemplates() {
  /* ── 표준 WBS 목록 ── */
  const templateList = document.querySelector("#templateList");
  if (templateList) {
    templateList.innerHTML = state.templates
      .map((template) => {
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
      })
      .join("");
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
const PIPE_STEPS = [
  { label: "초안",   statuses: ["Draft"] },
  { label: "검토",   statuses: ["Review"] },
  { label: "승인",   statuses: ["Approved"] },
  { label: "동기화", statuses: ["Synced", "Closed"] },
];

function pipeActiveIndex(status) {
  if (status === "Rejected") return 1;      // 검토 단계에서 반려
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

  return `
    <div class="approval-pipe-card ${isPending ? "pending" : ""} ${isRejected ? "rejected" : ""}">
      <div class="pipe-header">
        <div class="pipe-project-info">
          <span class="pipe-project-name">${escapeHtml(project.name)}</span>
          <span class="status-pill ${statusClass(project.status)}" style="font-size:0.7rem">${statusLabel(project.status)}</span>
        </div>
        <span class="pipe-type">${escapeHtml(projectTypeLabel(project.template_key))}</span>
      </div>
      <div class="pipe-steps">${stepsHtml}</div>
      ${footerHtml ? `<div class="pipe-footer">${footerHtml}</div>` : ""}
    </div>`;
}

function renderApprovals() {
  const approvalStatus = document.querySelector("#approvalStatus");
  const pendingCount   = state.approvals.filter((a) => a.status === "Pending").length;
  approvalStatus.textContent = pendingCount ? `승인 대기 ${pendingCount}건` : "정상";
  approvalStatus.className   = `status-pill ${pendingCount ? "attention" : "stable"}`;

  const container = document.querySelector("#approvalPipelineList");
  if (!container) return;

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

  /* 정렬: 승인 대기 먼저 → 최근 생성순 */
  const sorted = [...projects].sort((a, b) => {
    const aPending = latestApproval[a.id]?.status === "Pending" ? 1 : 0;
    const bPending = latestApproval[b.id]?.status === "Pending" ? 1 : 0;
    if (aPending !== bPending) return bPending - aPending;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  container.innerHTML = sorted.map((p) => renderApprovalPipelineCard(p, latestApproval[p.id])).join("");
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

function renderWbsPlanFilters() {
  const rows = state.wbsPlanRows;
  const roots = rows.filter((r) => !r.parent_code);
  const root  = roots.length === 1 ? roots[0] : null;
  const phases = root ? rows.filter((r) => r.parent_code === root.code) : [];
  const types  = [...new Set(rows.map((r) => r.item_type).filter(Boolean))];

  const phaseFilter = document.querySelector("#wbsPlanPhaseFilter");
  phaseFilter.innerHTML = ['<option value="">전체 단계</option>',
    ...phases.map((p) => `<option value="${escapeHtml(p.code)}">${escapeHtml(p.name)}</option>`)
  ].join("");
  phaseFilter.value = state.wbsPlanPhaseFilter;
  phaseFilter.disabled = !phases.length;

  const typeFilter = document.querySelector("#wbsPlanTypeFilter");
  typeFilter.innerHTML = ['<option value="">전체 유형</option>',
    ...types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(itemTypeLabel(t))}</option>`)
  ].join("");
  typeFilter.value = state.wbsPlanTypeFilter;
  typeFilter.disabled = !types.length;

  const searchInput = document.querySelector("#wbsPlanSearch");
  searchInput.value = state.wbsPlanSearch;
  searchInput.disabled = !rows.length;
}

function renderWbsPlanProjectList() {
  const select = document.querySelector("#wbsPlanProjectSelect");
  if (!select) return;
  const projects = state.apiConnected ? state.projects : fallbackProjects;
  const validProjects = projects.filter((p) => p.id);
  select.innerHTML = [
    `<option value="">프로젝트 선택…</option>`,
    ...validProjects.map((p) =>
      `<option value="${escapeHtml(p.id)}"
        ${p.id === state.wbsPlanProjectId ? "selected" : ""}
       >${escapeHtml(p.name)}  [${statusLabel(p.status)}]</option>`
    ),
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
        </div>
      </div>
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

function renderWbsPlanTable() {
  const canMutate  = canMutateWork();
  const hasProject = Boolean(state.wbsPlanProjectId);

  document.querySelector("#wbsAddRowButton").disabled       = !hasProject || !canMutate;
  document.querySelector("#wbsSaveButton").disabled         = !hasProject || !canMutate || !state.wbsPlanDirty;
  document.querySelector("#wbsPlanDownloadButton").disabled = !hasProject;
  const ulLabel = document.querySelector("#wbsPlanUploadLabel");
  const ulInput = document.querySelector("#wbsPlanExcelInput");
  if (ulLabel) ulLabel.setAttribute("aria-disabled", (!hasProject || !canMutate) ? "true" : "false");
  if (ulLabel) ulLabel.classList.toggle("disabled-control", !hasProject || !canMutate);
  if (ulInput) ulInput.disabled = !hasProject || !canMutate;

  const project = state.projects.find((p) => p.id === state.wbsPlanProjectId);
  // select 동기화 (다른 경로로 projectId가 변경된 경우 대비)
  const selectEl = document.querySelector("#wbsPlanProjectSelect");
  if (selectEl && state.wbsPlanProjectId && selectEl.value !== state.wbsPlanProjectId) {
    selectEl.value = state.wbsPlanProjectId;
  }

  renderWbsPlanFilters();

  const allRows   = state.wbsPlanRows;
  const rowByCode = new Map(allRows.map((r) => [r.code, r]));
  const childMap  = buildChildMap(allRows);
  const filtered  = wbsPlanFilteredRows();

  const countEl = document.querySelector("#wbsBoardCount");
  if (countEl) countEl.textContent = filtered.length ? `${filtered.length}개 항목` : "";

  const board = document.querySelector("#wbsBoardRows");
  if (!board) return;

  if (!hasProject) {
    board.innerHTML = `<div class="wbs-board-empty"><strong>프로젝트를 선택하세요</strong><span>좌측 목록에서 프로젝트를 클릭하면<br>WBS 항목이 표시됩니다.</span></div>`;
    return;
  }

  if (!filtered.length) {
    board.innerHTML = `<div class="wbs-board-empty"><strong>WBS 항목 없음</strong><span>행 추가 버튼이나 Excel 업로드로<br>WBS를 시작하세요.</span></div>`;
    return;
  }

  /* 계층 순서 정렬 (DFS) + 숨김 처리 */
  const rendered  = [];
  const visited   = new Set();

  function walkRow(code) {
    if (visited.has(code)) return;
    visited.add(code);
    const row = rowByCode.get(code);
    if (!row) return;

    const depth      = wbsItemDepth(row, rowByCode);
    const children   = childMap[code] || [];
    const hasChildren = children.length > 0;
    const expanded   = isWbsExpanded(code);

    rendered.push(renderWbsBoardItem(row, depth, hasChildren, canMutate));

    if (hasChildren && expanded) {
      children.forEach((childCode) => walkRow(childCode));
    }
  }

  /* 루트 노드(parent_code 없음) 먼저 */
  const roots = filtered.filter((r) => !r.parent_code);
  roots.forEach((r) => { if (r.code) walkRow(r.code); });

  /* 루트에 없지만 filtered에 있는 행 (필터로 중간 노드 없어진 경우) */
  filtered.forEach((r) => {
    if (!visited.has(r.code)) {
      const depth = wbsItemDepth(r, rowByCode);
      rendered.push(renderWbsBoardItem(r, depth, false, canMutate));
    }
  });

  board.innerHTML = rendered.join("");
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

  if (row) {
    document.querySelector("#wbsRowCode").value       = row.code       || "";
    document.querySelector("#wbsRowParentCode").value = row.parent_code || "";
    document.querySelector("#wbsRowName").value       = row.name        || "";
    document.querySelector("#wbsRowItemType").value   = row.item_type   || "작업";
    document.querySelector("#wbsRowOwner").value      = row.owner       || "";
    document.querySelector("#wbsRowWeight").value     = row.weight != null ? row.weight : "";
    document.querySelector("#wbsRowStartDate").value  = row.start_date  || "";
    document.querySelector("#wbsRowFinishDate").value = row.finish_date || "";
  }
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

  if (!name) {
    document.querySelector("#wbsRowFormStatus").textContent = "작업명은 필수입니다.";
    return false;
  }

  const newRow = { code, parent_code: parentCode, name, item_type: itemType, owner, weight, start_date: startDate, finish_date: finishDate };

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
  statusEl.textContent = "저장 중…";

  try {
    const result = await request(`/api/projects/${encodeURIComponent(state.wbsPlanProjectId)}/wbs-items`, {
      method: "POST",
      body: JSON.stringify({ rows: state.wbsPlanRows, source: "portal-editor" }),
    });
    state.wbsPlanRows  = (result.rows || []).map((r) => ({ ...r }));
    state.wbsPlanDirty = false;
    statusEl.textContent = `저장 완료 — ${result.summary?.rows ?? 0}행`;
    renderWbsPlanTable();
  } catch (error) {
    statusEl.textContent = error.message;
    saveBtn.disabled = false;
  }
}

function renderAll() {
  renderAuthState();
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
  renderSyncProjectSelect();
  renderSyncPanel();
  renderSyncRuns();
  renderOperationsPanel();
  renderUsersPanel();
  renderAuditPanel();
  renderSettingsPanel();
  renderWbsPlan();
  renderGuidePanel();
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

const navLinks = [...document.querySelectorAll(".nav-list a[href^='#']")];
const viewAliases = {
  admin:   "operations",
  "wbs":   "wbs-plan",
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
document.querySelector("#importErrorWorkbookButton").addEventListener("click", downloadImportErrorsExcel);
document.querySelector("#renumberButton").addEventListener("click", renumberTemplateCodes);
// #applyImportButton 이벤트는 하단 templates 클릭 핸들러 블록에서 등록
document.querySelector("#syncRefreshButton").addEventListener("click", refreshEnginePreflight);
document.querySelector("#syncPreflightButton").addEventListener("click", loadProjectSyncPreflight);
document.querySelector("#syncDryRunButton").addEventListener("click", dryRunProjectSync);
document.querySelector("#syncRunButton").addEventListener("click", runProjectSync);
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
document.querySelector("#wbsBoardRows").addEventListener("click", (event) => {
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
document.querySelector("#wbsPlanTypeFilter").addEventListener("change", (event) => {
  state.wbsPlanTypeFilter = event.target.value;
  renderWbsPlanTable();
});

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

restoreSession();
