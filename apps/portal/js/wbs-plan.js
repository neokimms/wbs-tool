/* AX WBS 포털 — WBS 관리(기준선) 표·행 편집·저장
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ══════════════════════════════════════════════════════
   WBS 계획 — CRUD
══════════════════════════════════════════════════════ */


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
  const tf     = state.wbsPlanTypeFilter;
  const phase  = state.wbsPlanPhaseFilter;
  return rows.filter((r) => {
    const meta = r.metadata || {};
    const matchSearch = !q || [r.code,r.name,r.item_type,r.owner].filter(Boolean).join(" ").toLowerCase().includes(q);
    const matchStatus = !sf  || (meta.status || "대기") === sf;
    const matchType   = !tf || r.item_type === tf;
    const matchPhase  = !phase || r.code === phase || (r.parent_code && r.parent_code.startsWith(phase));
    return matchSearch && matchStatus && matchType && matchPhase;
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

/* ── WBS 진척률 공통 산식 (서버 wbs_rules.compute_wbs_rollup 과 동일 규칙) ──
   · 진척률은 최하위 작업에만 입력, 상위 항목은 leaf 가중 평균으로 자동 계산
   · 리스크/이슈/변경요청 제외, 마일스톤은 명시 가중치 없으면 0 */
const WBS_NON_PROGRESS_TYPES = new Set(["리스크", "이슈", "변경요청"]);
function computeWbsRollupMap(rows) {
  const items = (rows || []).filter((r) => r && r.code && !WBS_NON_PROGRESS_TYPES.has(r.item_type || "작업"));
  const byCode = new Map(items.map((r) => [r.code, r]));
  const kids = new Map();
  items.forEach((r) => {
    const parent = r.parent_code && byCode.has(r.parent_code) ? r.parent_code : null;
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(r.code);
  });
  const metaOf = (r) => (r.metadata && typeof r.metadata === "object" ? r.metadata : {});
  const rawW = (r) => { const v = Number(metaOf(r).weight ?? r.weight); return Number.isFinite(v) && v > 0 ? v : null; };
  const leafPct = (r) => { const m = metaOf(r); if ((m.status || r.status) === "완료") return 100; const v = Number(m.progress ?? r.progress ?? 0); return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0)); };
  const eff = new Map();
  (function assign(parent, pw) {
    const ks = kids.get(parent) || [];
    if (!ks.length) return;
    let ws = ks.map((k) => rawW(byCode.get(k)));
    const isMs = ks.map((k) => (byCode.get(k).item_type || "") === "마일스톤");
    const sharable = ws.map((w, i) => (w == null && !isMs[i] ? i : -1)).filter((i) => i >= 0);
    if (ws.every((w) => w == null) && sharable.length) ws = ws.map((_, i) => (sharable.includes(i) ? pw / sharable.length : 0));
    else ws = ws.map((w) => w || 0);
    ks.forEach((k, i) => { eff.set(k, ws[i]); assign(k, ws[i]); });
  })(null, 100);
  const out = new Map();
  function walk(code) {
    const ks = kids.get(code) || [];
    const r = byCode.get(code);
    if (!ks.length) { const p = leafPct(r); const w = eff.get(code) || 0; out.set(code, { isLeaf: true, progress: Math.round(p) }); return [w, w * p / 100, [p]]; }
    let wt = 0, we = 0, leafVals = [];
    ks.forEach((k) => { const [a, b, c] = walk(k); wt += a; we += b; leafVals = leafVals.concat(c); });
    const prog = wt > 0 ? (we / wt) * 100 : (leafVals.length ? leafVals.reduce((x, y) => x + y, 0) / leafVals.length : 0);
    out.set(code, { isLeaf: false, progress: Math.round(prog * 10) / 10 });
    return [wt, we, leafVals];
  }
  (kids.get(null) || []).forEach(walk);
  return out;
}
function wbsRowIsParent(code) {
  return (state.wbsPlanRows || []).some((r) => r.parent_code === code);
}

function renderWbsProRow(row, depth, hasChildren, canMutate) {
  const meta      = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
  const type      = row.item_type || "작업";
  const status    = meta.status || "대기";
  const priority  = meta.priority || "보통";
  const _roll     = state._wbsRollup && state._wbsRollup.get(row.code);
  const isRollup  = !!(_roll && !_roll.isLeaf);
  const progress  = _roll ? _roll.progress : (meta.progress ?? 0);  // leaf: '완료'는 100%로 표시(서버 산식과 동일)
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
          <span class="wbs-progress-pct"${isRollup ? ' title="하위 작업 가중 합산(자동 계산)"' : ""}>${progress}%${isRollup ? '<span class="wbs-rollup-mark">Σ</span>' : ""}</span>
        </div>
      </td>
      <td class="td-priority">
        <span class="priority-${escapeHtml(priority)}" title="${escapeHtml(priority)}">${pIcons[priority]||"🟡"}</span>
      </td>
      <td class="td-date">
        ${canMutate
          ? `<input type="date" class="wbs-date-input" data-wbs-date-start="${escapeHtml(row.code||"")}" value="${escapeHtml(row.start_date||"")}" title="시작일" />`
          : `<span class="u-text-muted-78">${escapeHtml(row.start_date||"-")}</span>`}
      </td>
      <td class="td-date">
        ${canMutate
          ? `<input type="date" class="wbs-date-input" data-wbs-date-end="${escapeHtml(row.code||"")}" value="${escapeHtml(row.finish_date||"")}" title="종료일" />`
          : `<span class="u-text-muted-78">${escapeHtml(row.finish_date||"-")}</span>`}
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
  state._wbsRollup = computeWbsRollupMap(allRows);
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
      state.wbsStatusFilter || state.wbsPlanTypeFilter || state.wbsPlanPhaseFilter || state.wbsPlanSearch ? "검색 조건에 맞는 항목 없음" : "행 추가 버튼이나 Excel 업로드로 WBS를 시작하세요"
    }</td></tr>`;
    return;
  }

  const rendered = [];
  const visited  = new Set();
  const hasActiveWbsPlanFilter = Boolean(state.wbsStatusFilter || state.wbsPlanTypeFilter || state.wbsPlanPhaseFilter || state.wbsPlanSearch.trim());
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

  // 새 필드 (metadata 기반)
  const statusEl   = document.querySelector("#wbsRowStatus");
  const priorityEl = document.querySelector("#wbsRowPriority");
  const progressEl = document.querySelector("#wbsRowProgress");
  const progressLbl = document.querySelector("#wbsRowProgressLabel");
  const effortEl   = document.querySelector("#wbsRowEffort");

  if (statusEl)   statusEl.value   = meta.status   || "대기";
  if (priorityEl) priorityEl.value = meta.priority  || "보통";
  if (progressEl) {
    const _dlgParent = mode === "edit" && row?.code && wbsRowIsParent(row.code);
    const _dlgNode   = _dlgParent ? computeWbsRollupMap(state.wbsPlanRows).get(row.code) : null;
    progressEl.disabled = !!_dlgParent;
    progressEl.title = _dlgParent ? "상위 항목 진척률은 하위 작업에서 자동 계산됩니다" : "";
    progressEl.value = _dlgNode ? _dlgNode.progress : (meta.progress ?? 0);
    if (progressLbl) progressLbl.textContent = _dlgNode ? `${_dlgNode.progress}% (자동)` : `${meta.progress ?? 0}%`;
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
  const _progEl    = document.querySelector("#wbsRowProgress");
  const progressIn = _progEl?.disabled ? null : Number(_progEl?.value ?? 0);
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
  const progress = progressIn ?? existingMeta.progress ?? 0;  // 상위 항목은 자동 계산(입력값 무시)
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
