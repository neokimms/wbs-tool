(function () {
  window.WBS_PORTAL_GUIDE_CONTENT = {
    title: "WBS 포털 사용 가이드",
    summary:
      "프로젝트 생성부터 표준 WBS 반영, OpenProject 동기화, 운영 점검까지 PMO 업무 순서대로 따라갈 수 있는 현장용 안내입니다.",
    updatedAt: "2026-06-03",
    quickStart: [
      "대시보드에서 프로젝트, 승인, OpenProject 상태를 먼저 확인합니다.",
      "WBS 계획 메뉴에서 대상 프로젝트를 선택하고 WBS 계획을 검토합니다.",
      "표준 WBS 또는 Excel 반영 메뉴에서 템플릿을 내려받고 계층형 WBS를 업로드합니다.",
      "OpenProject 메뉴에서 점검, 모의 실행, 실제 동기화 순서로 진행합니다.",
      "운영 점검과 감사 로그에서 배포 상태와 변경 이력을 확인합니다.",
    ],
    sections: [
      {
        id: "dashboard",
        menu: "대시보드",
        kind: "overview",
        title: "첫 화면에서 전체 상태 파악",
        summary: "프로젝트 수, 표준 WBS 수, 승인 대기, OpenProject 연계 상태를 한 화면에서 확인합니다.",
        highlights: [
          "프로젝트 지표는 초안, 검토, 승인, 진행 상태 프로젝트를 빠르게 가늠하는 기준입니다.",
          "승인 지표가 늘어나면 승인 이력 메뉴에서 처리 내역과 자동 승인 결과를 확인합니다.",
          "OpenProject 상태가 준비가 아니면 동기화 전에 OpenProject 메뉴의 점검을 먼저 실행합니다.",
        ],
        checkpoints: ["상단 새로고침으로 최신 데이터를 다시 불러옵니다.", "권한에 따라 사용자, 설정, 감사 로그 메뉴가 숨겨질 수 있습니다."],
      },
      {
        id: "portfolio",
        menu: "WBS 계획",
        kind: "procedure",
        title: "프로젝트 생성과 WBS 계획 관리",
        summary: "프로젝트를 생성하고, 템플릿 기반 WBS를 검토한 뒤 프로젝트별 Excel 업로드로 계획을 보정합니다.",
        steps: [
          {
            title: "프로젝트 생성",
            detail: "상단의 프로젝트 생성 버튼을 누르고 프로젝트명, 담당자, 템플릿, 시작일을 입력합니다.",
          },
          {
            title: "보기 전환",
            detail: "PMO 탭은 전체, 수행 탭은 일반 작업, 리스크 탭은 리스크/이슈/변경요청 중심으로 WBS를 필터링합니다.",
          },
          {
            title: "프로젝트 WBS 다운로드",
            detail: "프로젝트 WBS 다운로드 버튼으로 현재 프로젝트의 계층형 Excel을 내려받습니다.",
          },
          {
            title: "프로젝트 WBS 업로드",
            detail: "수정한 Excel을 프로젝트 WBS 업로드로 미리보기한 뒤, 오류와 diff를 확인하고 프로젝트 WBS 반영을 누릅니다.",
          },
        ],
        checkpoints: ["가중치 합계 오류가 있으면 기본 정책상 반영이 차단됩니다.", "기준선이 잠긴 프로젝트는 실제 동기화 전에 변경 영향도를 먼저 확인합니다."],
      },
      {
        id: "templates",
        menu: "표준 WBS",
        kind: "task-list",
        title: "회사 표준 템플릿 관리",
        summary: "SI 구축, 데이터 이관, 유지보수 운영 표준 템플릿을 확인하고 Excel 작업의 기준으로 사용합니다.",
        tasks: [
          "템플릿 목록에서 프로젝트 유형과 단계 구성을 확인합니다.",
          "다운로드 버튼으로 표준 WBS Excel을 내려받습니다.",
          "단계, 산출물, 작업, 마일스톤, 리스크, 이슈, 변경요청 유형을 회사 표준에 맞춰 정리합니다.",
          "수정한 템플릿은 Excel 반영 메뉴에서 검증 후 적용합니다.",
        ],
        checkpoints: ["데이터 이관 템플릿은 소스 분석부터 검증까지 6단계입니다.", "유지보수 템플릿은 요청 접수부터 회고까지 6단계입니다."],
      },
      {
        id: "imports",
        menu: "Excel 반영",
        kind: "procedure",
        title: "계층형 Excel 검증과 반영",
        summary: "실무 PM이 작성한 Excel을 업로드하고, 오류와 변경 비교를 확인한 뒤 표준 템플릿에 반영합니다.",
        steps: [
          {
            title: "템플릿 선택",
            detail: "적용 대상 템플릿을 선택합니다. 프로젝트별 WBS는 WBS 계획 메뉴의 업로드 버튼을 사용합니다.",
          },
          {
            title: "Excel 업로드",
            detail: "WBS 코드, 상위 코드, 작업명, 유형, 가중치가 포함된 파일을 업로드합니다.",
          },
          {
            title: "오류 확인",
            detail: "오류 목록과 오류 Excel을 확인합니다. 필수값 누락, 중복 코드, 가중치 불일치를 먼저 수정합니다.",
          },
          {
            title: "diff 확인 후 반영",
            detail: "추가, 수정, 삭제 예정 항목을 확인하고 반영 버튼으로 템플릿 버전을 생성합니다.",
          },
        ],
        checkpoints: ["코드 정렬은 계층형 WBS 코드를 다시 번호 매길 때 사용합니다.", "오류가 있는 업로드는 반영 버튼이 비활성화됩니다."],
      },
      {
        id: "sync",
        menu: "OpenProject",
        kind: "procedure",
        title: "OpenProject CE 동기화 Runbook",
        summary: "WBS 포털을 기준선 관리 도구로 사용하고, OpenProject에는 작업 패키지를 안전하게 생성/갱신합니다.",
        steps: [
          {
            title: "점검",
            detail: "점검 버튼으로 API 토큰, 프로젝트 선택, 기준선 잠금, WBS 행 수를 확인합니다.",
          },
          {
            title: "모의 실행",
            detail: "모의 실행으로 생성/수정될 Work Package payload를 확인합니다.",
          },
          {
            title: "가져오기",
            detail: "OpenProject에서 변경된 상태, 진척률, 일정 정보를 포털 WBS 메타데이터로 가져옵니다.",
          },
          {
            title: "실제 동기화",
            detail: "점검 결과가 준비 상태이고 PMO 권한이 있을 때 실제 동기화를 실행합니다.",
          },
        ],
        checkpoints: ["mock 어댑터에서는 실제 외부 쓰기 없이 동작을 확인합니다.", "실제 동기화는 기준선 잠금 이후의 변경 통제 흐름과 함께 사용합니다."],
      },
      {
        id: "approvals",
        menu: "승인 이력",
        kind: "reference",
        title: "승인 상태와 자동 승인 정책",
        summary: "내부 승인 요청은 현재 자동 승인으로 처리되며, PMO는 이력과 결정 사유를 확인합니다.",
        references: [
          { label: "Pending", description: "승인 대기 상태입니다. 자동 승인 처리 전의 요청을 의미합니다." },
          { label: "Approved", description: "승인 완료 상태입니다. 프로젝트 생성, 템플릿 반영, 기준선 잠금 등이 기록됩니다." },
          { label: "Rejected", description: "정책 위반이나 오류로 반려된 요청입니다. 반려된 Excel import는 반영할 수 없습니다." },
          { label: "더 보기", description: "승인 이력이 5건을 초과하면 더 보기 버튼으로 목록을 확장합니다." },
        ],
      },
      {
        id: "operations",
        menu: "운영 점검",
        kind: "troubleshooting",
        title: "운영 헬스체크와 장애 조치",
        summary: "PostgreSQL, API, 포털, OpenProject, 백업, 모니터링 상태를 점검합니다.",
        issues: [
          {
            symptom: "API 또는 DB 점검 실패",
            cause: "PostgreSQL 컨테이너 미기동, DB 연결 정보 오류, 마이그레이션 미적용 가능성이 있습니다.",
            action: "Docker Compose 상태를 확인하고 API smoke test를 다시 실행합니다.",
          },
          {
            symptom: "OpenProject 점검 실패",
            cause: "토큰 누락, Base URL 오류, Enterprise 기능 의존 설정이 원인일 수 있습니다.",
            action: "설정 메뉴의 PM 엔진 어댑터와 OpenProject 토큰을 확인합니다.",
          },
          {
            symptom: "백업 또는 모니터링 경고",
            cause: "백업 경로, Prometheus, postgres exporter 설정이 준비되지 않았을 수 있습니다.",
            action: "운영 매뉴얼의 백업/복구 절차와 Compose profile 설정을 확인합니다.",
          },
        ],
      },
      {
        id: "users",
        menu: "사용자",
        kind: "task-list",
        title: "계정, 역할, 세션 관리",
        summary: "관리자는 사용자 계정을 생성하고 역할을 부여하며, 필요 시 세션을 회수합니다.",
        tasks: [
          "사용자 이메일, 표시 이름, 역할, 초기 비밀번호를 입력해 계정을 생성합니다.",
          "viewer는 조회 중심, pmo는 WBS/승인/동기화 업무, admin은 사용자와 설정까지 관리합니다.",
          "비밀번호 변경 필요 상태의 사용자는 로그인 후 새 비밀번호를 설정해야 합니다.",
          "의심 세션이나 퇴사자 계정은 세션 회수와 계정 비활성화를 함께 처리합니다.",
        ],
        checkpoints: ["운영 환경에서는 로그인 별칭을 비활성화해야 합니다.", "비밀번호 정책은 환경변수로 길이, 숫자, 특수문자, 대문자 요구를 조정합니다."],
      },
      {
        id: "audit",
        menu: "감사 로그",
        kind: "reference",
        title: "변경 이력과 보안 이벤트 추적",
        summary: "프로젝트, 사용자, 설정, Excel import, 동기화 실행 이벤트를 시간순으로 추적합니다.",
        references: [
          { label: "project", description: "프로젝트 생성, 상태 변경, 기준선 잠금 이벤트입니다." },
          { label: "import", description: "Excel 미리보기, 오류, 템플릿 또는 프로젝트 WBS 반영 이벤트입니다." },
          { label: "sync", description: "OpenProject 점검, 모의 실행, 가져오기, 실제 동기화 이벤트입니다." },
          { label: "security", description: "로그인 실패, 계정 잠금, 비밀번호 변경, 세션 회수 이벤트입니다." },
          { label: "settings", description: "PM 엔진 어댑터와 보안 정책 설정 변경 이벤트입니다." },
        ],
      },
      {
        id: "settings",
        menu: "설정",
        kind: "reference",
        title: "PM 엔진 어댑터와 운영 정책",
        summary: "OpenProject 연계 방식, 모의 실행 보호, 실제 동기화 허용 여부를 관리합니다.",
        references: [
          { label: "어댑터", description: "openproject는 실제 CE API 연계, mock은 내부 검증용 모의 엔진입니다." },
          { label: "모드", description: "ce-api-adapter는 OpenProject API 경계로 동작하고, mock은 로컬 검증용입니다." },
          { label: "실제 동기화 허용", description: "체크 시 actual sync가 가능해집니다. 운영에서는 PMO 승인 절차와 함께 사용합니다." },
          { label: "고급 JSON", description: "폼으로 표현되지 않는 설정을 확인하는 고급 영역입니다. 일반 운영자는 폼 UI를 우선 사용합니다." },
        ],
      },
    ],
  };
})();
