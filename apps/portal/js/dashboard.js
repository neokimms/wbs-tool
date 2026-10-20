/* AX WBS 포털 — 인증 상태·대시보드·포트폴리오·템플릿 목록 렌더링
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

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
        <div class="kpi-card-spi ${spiCls}" title="계획 ${k.planned_pct ?? 0}% 대비 실적 ${progress}% (SPI = EV ÷ PV)">SPI ${spiVal}</div>
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

/* ── origin/main 이식: renderAuthState 의존 헬퍼 ── */
function toggleNavAndPanel(hash, allowed) {
  const link = document.querySelector(`.nav-list a[href="${hash}"]`);
  const panel = document.querySelector(hash);
  if (link) link.hidden = !allowed;
  if (panel) panel.hidden = !allowed;
}

/* ── origin/main 이식: renderTemplates 의존 헬퍼 ── */
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

function deliveryModeLabel(mode) {
  return DELIVERY_MODE_LABELS[mode] || mode || "Waterfall";
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
function renderDeliveryModeBadge(mode, extraClass = "") {
  const normalized = DELIVERY_MODE_ORDER.includes(mode) ? mode : "waterfall";
  const className = `delivery-mode-badge mode-${normalized} ${extraClass}`.trim();
  return `<span class="${escapeHtml(className)}">${escapeHtml(deliveryModeLabel(normalized))}</span>`;
}
function groupByDeliveryMode(items, modeGetter) {
  return DELIVERY_MODE_ORDER
    .map((mode) => ({
      mode,
      items: items.filter((item) => modeGetter(item) === mode),
    }))
    .filter((group) => group.items.length);
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

/* ── origin/main 이식: renderCustomWbsList 의존 헬퍼 ── */
function deliveryModeOrder(mode) {
  const index = DELIVERY_MODE_ORDER.indexOf(mode);
  return index === -1 ? DELIVERY_MODE_ORDER.length : index;
}
function compareProjectsForWbsList(a, b) {
  const modeDiff = deliveryModeOrder(projectDeliveryMode(a)) - deliveryModeOrder(projectDeliveryMode(b));
  if (modeDiff) return modeDiff;
  const templateDiff = orderedIndex(TEMPLATE_KEY_ORDER, a.template_key || "") - orderedIndex(TEMPLATE_KEY_ORDER, b.template_key || "");
  if (templateDiff) return templateDiff;
  return (a.name || "").localeCompare(b.name || "", "ko");
}
function projectTemplateLabel(project) {
  const template = state.templates.find((t) => t.key === project?.template_key)
    || fallbackTemplates.find((t) => t.key === project?.template_key);
  if (template) return projectTypeLabel(template.project_type);
  return projectTypeLabel(project?.template_key);
}
function currentWorkboardProject() {
  return state.projects.find((project) => project.id === state.workboardProjectId) || null;
}
function projectDeliveryMode(project = currentWorkboardProject()) {
  return project?.delivery_mode || project?.metadata?.delivery_mode || "waterfall";
}