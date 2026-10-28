/* AX WBS 포털 — 템플릿 드로어·프로젝트 목록/드로어
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

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


function resetProjectPlanFilters() {
  state.projectWbsSearch = "";
  state.projectPhaseFilter = "";
  state.projectTypeFilter = "";
}


const PORTFOLIO_FILTER_STATUSES = {
  all:      null,
  active:   ["Draft", "Review", "Approved"],
  closed:   ["Synced", "Closed"],
  rejected: ["Rejected"],
};

const PHASE_COLORS = ["#0071e3", "#1f9d55", "#b7791f", "#7356bf", "#d92d20", "#0891b2", "#9333ea"];


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
                  ${project.id ? "" : "disabled"}>WBS 계획</button>
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
        <button type="button" class="primary-action" data-drawer-action="wbs" data-project-id="${escapeHtml(project.id)}">WBS 계획 열기</button>
        <button type="button" data-drawer-action="workboard" data-project-id="${escapeHtml(project.id)}">작업 보드</button>
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
              <small class="u-text-muted">${escapeHtml(a.requester || "-")} · ${a.created_at ? formatTimestamp(a.created_at) : "-"}</small>
            </div>
            <span class="status-pill ${statusClass(a.status)}">${statusLabel(a.status)}</span>
          </div>`).join("")
        : `<p style="font-size:0.84rem;color:var(--text-muted)">승인 이력 없음</p>`}
    </div>
  `;
}

/* ── origin/main 이식: renderProjects 의존 헬퍼 ── */
function tenantDisplayName(tenantId) {
  const id = tenantId || state.currentTenantId || "default";
  const tenant = state.tenants.find((item) => item.id === id);
  return tenant?.name || id;
}
function renderTenantBadge(tenantId) {
  const id = tenantId || state.currentTenantId || "default";
  return `<span class="tenant-inline-badge" title="테넌트 ID: ${escapeHtml(id)}">${escapeHtml(tenantDisplayName(id))}</span>`;
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