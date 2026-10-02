/* AX WBS 포털 — 사용자 가이드 콘텐츠 정의
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

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
