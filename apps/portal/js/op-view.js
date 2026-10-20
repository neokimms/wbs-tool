/* AX WBS 포털 — WBS 현황(OpenProject 동기화 뷰)·간트
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

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
    renderOpViewPanels();
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
        <td class="u-text-muted-78">${escapeHtml(r.start_date || "-")}</td>
        <td class="u-text-muted-78">${escapeHtml(r.finish_date || "-")}</td>
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

  // 표시 기간 = 사용자가 등록한 프로젝트 기간(시작일~종료일)
  //  · 프로젝트 기간이 없으면 WBS 항목 일정의 최소~최대로 대체
  //  · 기간 밖 일정은 막대를 잘라 표시하고 안내 문구로 알림 ('전체 일정 보기'로 확장 가능)
  const toDate = (d) => { const v = new Date(`${String(d).slice(0, 10)}T00:00:00`); return Number.isNaN(v.getTime()) ? null : v; };
  const project   = (state.projects || []).find((p) => String(p.id) === String(state.opViewProjectId));
  const pStart    = project?.start_date ? toDate(project.start_date) : null;
  const pEnd      = project?.metadata?.end_date ? toDate(project.metadata.end_date) : null;
  const itemDates = rows.flatMap((r) => [r.start_date, r.finish_date].filter(Boolean)).map(toDate).filter(Boolean);
  const itemMin   = new Date(Math.min(...itemDates));
  const itemMax   = new Date(Math.max(...itemDates));
  const fullRange = !!state.opGanttFullRange;
  const rangeStart = fullRange || !pStart ? (pStart && pStart < itemMin ? pStart : itemMin) : pStart;
  const rangeEnd   = fullRange || !pEnd ? (pEnd && pEnd > itemMax ? pEnd : itemMax) : pEnd;
  const outOfRange = (pStart || pEnd) ? rows.filter((r) => {
    const s = r.start_date ? toDate(r.start_date) : null;
    const e = r.finish_date ? toDate(r.finish_date) : null;
    return (pStart && ((s && s < pStart) || (e && e < pStart))) || (pEnd && ((e && e > pEnd) || (s && s > pEnd)));
  }) : [];
  const minDate  = new Date(rangeStart);
  const maxDate  = new Date(rangeEnd);
  minDate.setDate(1);
  maxDate.setMonth(maxDate.getMonth() + 1, 0);
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000) + 1);
  const fmt = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "?";

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
  // 작업명 컬럼 너비: 사용자가 드래그로 조절, 브라우저에 기억 (기본 340px)
  if (!state.opGanttLabelW) {
    let saved = 0;
    try { saved = Number(localStorage.getItem("opGanttLabelW")) || 0; } catch (_) { /* storage unavailable */ }
    state.opGanttLabelW = saved >= 200 && saved <= 720 ? saved : 340;
  }
  const LABEL_WIDTH   = state.opGanttLabelW;
  const MIN_MONTH_PX  = 120;
  const SCROLL_THRESHOLD = 6;
  const useFixedWidth = months.length > SCROLL_THRESHOLD;
  const timelineMinPx = useFixedWidth ? months.length * MIN_MONTH_PX : 0;
  const ganttMinWidth = useFixedWidth ? LABEL_WIDTH + timelineMinPx : LABEL_WIDTH + 580;

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
      <div class="op-gantt-label" style="--depth:${depth}" title="${escapeHtml(`${r.code || ""} ${r.name || r.subject || ""}`.trim())}">
        <span class="op-gantt-label-code">${escapeHtml(r.code || "")}</span>
        <span class="op-gantt-label-name">${escapeHtml(r.name || r.subject || "")}</span>
      </div>`;

    let barHtml = "";
    if (r.start_date || r.finish_date) {
      const sRaw  = r.start_date ? toDate(r.start_date) : toDate(r.finish_date);
      const eRaw  = r.finish_date ? toDate(r.finish_date) : sRaw;
      // 표시 기간 밖은 잘라서 그림
      const sDate = sRaw < minDate ? minDate : sRaw > maxDate ? maxDate : sRaw;
      const eDate = eRaw > maxDate ? maxDate : eRaw < minDate ? minDate : eRaw;
      const clipL = sRaw < minDate, clipR = eRaw > maxDate;
      const left  = Math.max(0, ((sDate - minDate) / 86400000 / totalDays * 100));
      const width = Math.min(100 - left, Math.max(0.3, ((eDate - sDate) / 86400000 + 1) / totalDays * 100));
      const progress = r.op_progress ?? null;

      if (isMile) {
        barHtml = `<div class="op-gantt-diamond" style="left:${left.toFixed(2)}%" title="${escapeHtml(r.name || "")}"></div>`;
      } else {
        const progressBar = progress != null ? `<div class="op-gantt-bar-progress" style="width:${100 - progress}%;float:right"></div>` : "";
        const dateRange = (r.start_date || r.finish_date)
          ? ` (${r.start_date || "?"}~${r.finish_date || "?"})`
          : "";
        const barLabel = `<span class="op-gantt-bar-label">${escapeHtml(r.name || "")}${escapeHtml(dateRange)}</span>`;
        const clipCls = `${clipL ? " op-gantt-bar-clip-left" : ""}${clipR ? " op-gantt-bar-clip-right" : ""}`;
        barHtml = `
          <div class="op-gantt-bar${clipCls}" data-type="${escapeHtml(type)}"
            style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"
            title="${escapeHtml(r.name || "")} (${r.start_date || "?"}~${r.finish_date || "?"})${clipL || clipR ? " — 표시 기간 밖 일정 포함" : ""}">
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

  const rangeLabel = (pStart || pEnd) && !fullRange
    ? `프로젝트 기간 ${fmt(pStart || itemMin)} ~ ${fmt(pEnd || itemMax)} 기준`
    : `전체 일정 ${fmt(rangeStart)} ~ ${fmt(rangeEnd)} 기준`;
  const noticeHtml = (pStart || pEnd) ? `
    <div class="op-gantt-range-bar${outOfRange.length ? " has-warning" : ""}">
      <span>${rangeLabel}</span>
      ${outOfRange.length ? `<span class="op-gantt-range-warn" title="${escapeHtml(outOfRange.map((r) => `${r.code} ${r.start_date || "?"}~${r.finish_date || "?"}`).join("\n"))}">⚠ 프로젝트 기간 밖 일정 ${outOfRange.length}건 (${escapeHtml(outOfRange.slice(0, 3).map((r) => r.code).join(", "))}${outOfRange.length > 3 ? " 외" : ""}) — WBS 일정 확인 필요</span>` : ""}
      ${outOfRange.length ? `<button type="button" class="secondary-button mt-small" data-op-gantt-range>${fullRange ? "프로젝트 기간으로 보기" : "전체 일정 보기"}</button>` : ""}
    </div>` : "";

  wrap.innerHTML = `${noticeHtml}
    <div class="op-gantt" style="min-width:${ganttMinWidth}px;--op-gantt-label-w:${LABEL_WIDTH}px">
      <div class="op-gantt-header">
        <div class="op-gantt-header-label">작업명<span class="op-gantt-resizer" data-op-gantt-resizer title="드래그하여 작업명 너비 조절 (더블클릭: 기본값)"></span></div>
        <div class="op-gantt-timeline-header">${monthHeaderHtml}</div>
      </div>
      ${rowsHtml}
    </div>`;
  // 작업명 컬럼 너비 드래그 조절
  const ganttEl = wrap.querySelector(".op-gantt");
  const resizer = wrap.querySelector("[data-op-gantt-resizer]");
  const applyLabelW = (w, persist) => {
    const clamped = Math.max(200, Math.min(720, Math.round(w)));
    state.opGanttLabelW = clamped;
    ganttEl.style.setProperty("--op-gantt-label-w", `${clamped}px`);
    ganttEl.style.minWidth = `${(useFixedWidth ? timelineMinPx : 580) + clamped}px`;
    if (persist) { try { localStorage.setItem("opGanttLabelW", String(clamped)); } catch (_) { /* ignore */ } }
  };
  resizer?.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    const startX = ev.clientX, startW = state.opGanttLabelW;
    resizer.setPointerCapture?.(ev.pointerId);
    document.body.classList.add("op-gantt-resizing");
    const move = (e) => applyLabelW(startW + (e.clientX - startX), false);
    const up = () => {
      resizer.removeEventListener("pointermove", move);
      resizer.removeEventListener("pointerup", up);
      resizer.removeEventListener("pointercancel", up);
      document.body.classList.remove("op-gantt-resizing");
      applyLabelW(state.opGanttLabelW, true);
    };
    resizer.addEventListener("pointermove", move);
    resizer.addEventListener("pointerup", up);
    resizer.addEventListener("pointercancel", up);
  });
  resizer?.addEventListener("dblclick", () => applyLabelW(340, true));

  wrap.querySelector("[data-op-gantt-range]")?.addEventListener("click", () => {
    state.opGanttFullRange = !state.opGanttFullRange;
    renderOpGantt();
  });
}

/* ── origin/main 이식: 요약 스트립·화면 진입 시 자동 조회 (데이터 원천은 로컬 op-work-packages 유지) ── */
function renderOpViewPanels() {
  renderOpViewSummary();
  renderOpWorkPackages();
  renderOpGantt();
  // 담당자·지연 탭은 로컬 렌더러 사용 (OpenProject 작업패키지 + 로컬 폴백 데이터 기준)
  if (state.opViewTab === "assignee") renderOpAssignee();
  if (state.opViewTab === "delayed") renderOpDelayed();
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

function maybeLoadOpViewProject() {
  const projectId = ensureOpViewProjectSelection();
  renderOpViewProjectSelect();
  if (!projectId) {
    renderOpViewPanels();
    return;
  }
  if (!state.opViewRows.length) loadOpViewProject(projectId);
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

/* ── origin/main 이식: WBS 현황 요약 의존 헬퍼 ── */
function opViewProjects() {
  return (state.projects || []).filter((project) => project && project.id);
}
function currentOpViewProject() {
  return state.projects.find((project) => project.id === state.opViewProjectId) || null;
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
