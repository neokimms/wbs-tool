/* AX WBS 포털 — 테마·모바일 메뉴·사이드바·위젯·일정 설정
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

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

      // 참고: 서버에 /api/settings/schedule 엔드포인트가 없어 브라우저 저장만 사용한다.
    }
  });
})();
