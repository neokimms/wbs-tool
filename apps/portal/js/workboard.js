/* AX WBS 포털 — 작업 현황
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

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
      <td class="u-text-muted-78">${it.start_date||""}</td>
      <td class="u-text-muted-78">${it.end_date||""}</td>
    </tr>`;
  }).join("");
  return `<table class="ri-table u-w-full">
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
      <td class="u-text-muted-75">${it.start_date||""}</td>
      <td class="u-text-muted-75">${it.end_date||""}</td>
      <td style="min-width:100px"><div style="background:var(--line);border-radius:4px;height:8px"><div style="background:var(--blue);width:${pct}%;height:8px;border-radius:4px"></div></div></td>
      <td class="u-text-muted-75">${pct}%</td>
    </tr>`;
  }).join("");
  return `<table class="ri-table u-w-full">
    <thead><tr><th>작업명</th><th>시작일</th><th>종료일</th><th>진행률</th><th>%</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
