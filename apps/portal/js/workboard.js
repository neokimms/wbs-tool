/* AX WBS 포털 — 작업 현황 (내부 WBS 작업 운영 + Agile 백로그·스프린트·번다운)
   origin/main(6/11) 구현 이식. 로컬의 '내 Action Item' 영역은 meetings.js 의 renderWorkboardMyActions 가 담당.
   클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것 */

/* ── origin/main 이식: 작업 현황·Agile 화면 ── */
const AGILE_TYPES = ["Epic", "Story", "Task", "Spike", "Bug"];
const AGILE_STATUSES = ["Backlog", "Ready", "In Progress", "Review", "Done"];
const AGILE_PRIORITIES = ["Must", "Should", "Could", "Wont"];
const AGILE_SPRINT_STATUSES = ["Planning", "Active", "Review", "Retrospective", "Closed"];
function sprintPolicyDays(policy = projectOperationPolicy()) {
  const map = { fixed_1w: 7, fixed_2w: 14, fixed_4w: 28 };
  return map[policy.sprint_length_policy] || null;
}
function defaultSprintEndDate(startIso, policy = projectOperationPolicy()) {
  const days = sprintPolicyDays(policy) || 14;
  return addDaysIso(startIso || new Date().toISOString().slice(0, 10), days - 1);
}
function workboardProjects() {
  return (state.projects || []).filter((project) => project && project.id);
}
function ensureWorkboardProjectSelection() {
  const projects = workboardProjects();
  if (!projects.length) {
    state.workboardProjectId = null;
    return null;
  }
  const exists = projects.some((project) => project.id === state.workboardProjectId);
  if (!state.workboardProjectId || !exists) {
    state.workboardProjectId = projects[0].id;
    state.workboardLoadedProjectId = null;
    state.workboardRows = [];
  }
  return state.workboardProjectId;
}
function workboardTaskRows() {
  return (state.workboardRows || [])
    .map((row) => ({ ...row, project_id: row.project_id || state.workboardProjectId }))
    .filter((row) => (row.item_type || "작업") !== "프로젝트");
}
function workboardRowProjectId(row) {
  return String(row?.project_id || state.workboardProjectId || "");
}
function workboardTaskKey(row) {
  return `${workboardRowProjectId(row)}::${String(row?.code || row?.id || "")}`;
}
function allWorkboardRows() {
  const rows = [...(state.workboardRows || []), ...(state.myWorkItems || [])];
  const seen = new Set();
  return rows
    .map((row) => ({ ...row, project_id: row.project_id || state.workboardProjectId }))
    .filter((row) => {
      const key = workboardTaskKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function canEditWorkboardTask(row) {
  return canMutateWork() || isMyWorkboardTask(row);
}
function workboardTaskStatus(row) {
  const meta = normalizeTaskMetadata(row?.metadata);
  const raw = meta.status || row?.status || "";
  if (WBS_STATUSES.includes(raw)) return raw;
  if (raw === "진행 중") return "진행중";
  if (raw === "미시작") return "대기";
  return isWorkboardOverdue(row) ? "지연" : "대기";
}
/* PM 규칙: 진척률은 최하위 작업만 입력, 상위는 leaf 가중 롤업 (computeWbsRollupMap = 서버 compute_wbs_rollup 동일 산식) */
function workboardRollup() {
  if (state._workboardRollupSrc !== state.workboardRows) {
    state._workboardRollupSrc = state.workboardRows;
    state._workboardRollup = computeWbsRollupMap(state.workboardRows || []);
  }
  return state._workboardRollup;
}

function workboardRowIsParent(row) {
  const node = row?.code ? workboardRollup().get(row.code) : null;
  return Boolean(node && !node.isLeaf);
}

function workboardTaskProgress(row) {
  const node = row?.code && (row.project_id || state.workboardProjectId) === state.workboardProjectId
    ? workboardRollup().get(row.code)
    : null;
  if (node) return Math.max(0, Math.min(100, Math.round(node.progress)));
  const meta = normalizeTaskMetadata(row?.metadata);
  const value = Number(meta.progress ?? row?.progress ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
function workboardTaskPriority(row) {
  const meta = normalizeTaskMetadata(row?.metadata);
  return meta.priority || "보통";
}
function workboardTaskOwnerText(row) {
  const meta = normalizeTaskMetadata(row?.metadata);
  return [row?.owner, meta.reviewer, meta.approver, meta.team].filter(Boolean).join(" · ");
}
function workboardCurrentUserTokens() {
  const user = state.currentUser || {};
  const raw = [
    user.display_name,
    user.email,
    user.email ? String(user.email).split("@")[0] : "",
  ].filter(Boolean);
  return raw.map((token) => String(token).trim().toLowerCase()).filter(Boolean);
}
function isMyWorkboardTask(row) {
  const tokens = workboardCurrentUserTokens();
  if (!tokens.length) return false;
  const haystack = workboardTaskOwnerText(row).toLowerCase();
  return tokens.some((token) => token && haystack.includes(token));
}
function isWorkboardOverdue(row) {
  const status = normalizeTaskMetadata(row?.metadata).status || row?.status || "";
  if (status === "완료") return false;
  const finish = parseIsoDate(row?.finish_date);
  if (!finish) return false;
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return finish < utcToday;
}
function workboardProjectRiskCounts(projectId) {
  const risks = state.risks.filter((item) => item.project_id === projectId && isOpenRiStatus(item.status)).length;
  const issues = state.issues.filter((item) => item.project_id === projectId && isOpenRiStatus(item.status)).length;
  return { risks, issues };
}
function isAgileCapableProject(project = currentWorkboardProject()) {
  return ["agile", "hybrid"].includes(projectDeliveryMode(project));
}
function agileStatusLabel(status) {
  const labels = {
    Backlog: "Backlog",
    Ready: "Ready",
    "In Progress": "In Progress",
    Review: "Review",
    Done: "Done",
  };
  return labels[status] || status || "-";
}
function agilePriorityLabel(priority) {
  const labels = { Must: "Must", Should: "Should", Could: "Could", Wont: "Won't" };
  return labels[priority] || priority || "-";
}
function sprintById(id) {
  return state.agileSprints.find((sprint) => sprint.id === id) || null;
}
function activeAgileSprint() {
  const today = new Date().toISOString().slice(0, 10);
  return state.agileSprints.find((sprint) => sprint.status === "Active")
    || state.agileSprints.find((sprint) => sprint.start_date <= today && sprint.end_date >= today)
    || state.agileSprints[0]
    || null;
}
function ensureAgileSprintSelection() {
  const active = activeAgileSprint();
  if (!state.agileSelectedSprintId || !state.agileSprints.some((sprint) => sprint.id === state.agileSelectedSprintId)) {
    state.agileSelectedSprintId = active?.id || "";
  }
  return state.agileSelectedSprintId;
}
function agileSprintOptions(selectedId = "", includeBacklog = true) {
  const base = includeBacklog ? [`<option value="">백로그</option>`] : [];
  return base.concat(state.agileSprints.map((sprint) => `
    <option value="${escapeHtml(sprint.id)}" ${sprint.id === selectedId ? "selected" : ""}>
      ${escapeHtml(sprint.name)} (${escapeHtml(sprint.status)})
    </option>`)).join("");
}
function agileWbsOptions(selectedCode = "") {
  const rows = workboardTaskRows();
  return [`<option value="">WBS 미연결</option>`].concat(rows.map((row) => `
    <option value="${escapeHtml(row.code || "")}" ${row.code === selectedCode ? "selected" : ""}>
      ${escapeHtml(row.code || "-")} · ${escapeHtml(row.name || "-")}
    </option>`)).join("");
}
function renderDeliveryModeSelect() {
  const sel = document.querySelector("#projectDeliveryModeSelect");
  if (!sel) return;
  const project = currentWorkboardProject();
  const mode = projectDeliveryMode(project);
  sel.value = mode;
  sel.disabled = !project || !canMutateWork();
  sel.title = project ? "프로젝트 수행 방식" : "프로젝트를 선택하세요";
}
function renderWorkboardProjectSelect() {
  const sel = document.querySelector("#workboardProjectSelect");
  if (!sel) return;
  const projects = workboardProjects();
  ensureWorkboardProjectSelection();
  sel.innerHTML = projects.length
    ? projects.map((project) => `
      <option value="${escapeHtml(project.id)}" ${project.id === state.workboardProjectId ? "selected" : ""}>
        ${escapeHtml(project.name)} [${escapeHtml(DELIVERY_MODE_LABELS[projectDeliveryMode(project)] || "Waterfall")} · ${escapeHtml(statusLabel(project.status || "Draft"))}]
      </option>`).join("")
    : `<option value="">프로젝트 없음</option>`;
  sel.disabled = !projects.length;
  renderDeliveryModeSelect();
  const refreshBtn = document.querySelector("#workboardRefreshBtn");
  if (refreshBtn) refreshBtn.disabled = !state.workboardProjectId || state.workboardLoading;
}
function updateWorkboardStatus(message = "", tone = "") {
  const el = document.querySelector("#workboardStatus");
  if (!el) return;
  const text = message || state.workboardStatusMessage || "대기";
  el.textContent = text;
  el.className = `status-pill ${tone}`.trim();
}
async function loadWorkboardProject(projectId = state.workboardProjectId) {
  if (!projectId) return;
  state.workboardProjectId = projectId;
  state.workboardLoading = true;
  state.agileLoading = true;
  state.workboardStatusMessage = "로딩 중";
  renderWorkboardPanel();
  try {
    if (canAccessOperations()) {
      await request("/api/work-items/alerts/scan", { method: "POST" }).catch(() => null);
    }
    const rows = await request(`/api/projects/${encodeURIComponent(projectId)}/work-items`);
    state.workboardRows = (rows || []).map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
    await loadAgileProject(projectId, { render: false });
    state.myWorkItems = (await request("/api/me/work-items").catch(() => state.myWorkItems || []))
      .map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
    state.workboardLoadedProjectId = projectId;
    state.workboardStatusMessage = `${state.workboardRows.length}개 항목`;
    loadNotifications();
  } catch (error) {
    state.workboardRows = [];
    state.agileSprints = [];
    state.agileItems = [];
    state.agileMetrics = null;
    state.agileLoadedProjectId = null;
    state.workboardLoadedProjectId = null;
    state.workboardStatusMessage = error.message;
  } finally {
    state.workboardLoading = false;
    state.agileLoading = false;
    renderWorkboardPanel();
  }
}
async function syncAgileFromWbs(projectId = state.workboardProjectId) {
  if (!projectId) return null;
  try {
    return await request(`/api/projects/${encodeURIComponent(projectId)}/agile/sync-from-wbs`, { method: "POST" });
  } catch (_) {
    return null;
  }
}
async function loadAgileProject(projectId = state.workboardProjectId, options = {}) {
  if (!projectId) return;
  state.agileLoading = true;
  try {
    const [sprints, items, metrics] = await Promise.all([
      request(`/api/projects/${encodeURIComponent(projectId)}/agile/sprints`),
      request(`/api/projects/${encodeURIComponent(projectId)}/agile/backlog`),
      request(`/api/projects/${encodeURIComponent(projectId)}/agile/metrics`),
    ]);
    state.agileSprints = sprints || [];
    state.agileItems = items || [];
    state.agileMetrics = metrics || null;

    // WBS 항목이 있는데 Agile 항목이 비어 있으면 자동 동기화
    if (!state.agileItems.length && state.workboardRows?.length) {
      await syncAgileFromWbs(projectId);
      const [syncedItems, syncedMetrics] = await Promise.all([
        request(`/api/projects/${encodeURIComponent(projectId)}/agile/backlog`),
        request(`/api/projects/${encodeURIComponent(projectId)}/agile/metrics`),
      ]);
      state.agileItems = syncedItems || [];
      state.agileMetrics = syncedMetrics || null;
    }

    state.agileLoadedProjectId = projectId;
    ensureAgileSprintSelection();
  } catch (error) {
    state.agileSprints = [];
    state.agileItems = [];
    state.agileMetrics = null;
    state.agileLoadedProjectId = null;
    state.workboardStatusMessage = error.message;
  } finally {
    state.agileLoading = false;
    if (options.render !== false) renderWorkboardPanel();
  }
}
function renderWorkboardAlerts(rows) {
  const wrap = document.querySelector("#workboardAlertRow");
  if (!wrap || !state.workboardProjectId) {
    if (wrap) wrap.innerHTML = "";
    return;
  }

  const view = state.workboardView;

  // Agile 탭: agileMetrics 기준으로 상단 카드 업데이트
  if (["agile-backlog", "agile-board", "agile-metrics"].includes(view)) {
    if (state.agileLoadedProjectId !== state.workboardProjectId) {
      wrap.innerHTML = "";
      return;
    }
    const totals = state.agileMetrics?.totals || {};
    const ri = workboardProjectRiskCounts(state.workboardProjectId);
    const remaining = state.agileMetrics?.burndown?.remaining_points ?? "-";
    wrap.innerHTML = `
      <div class="workboard-alert"><strong>${totals.total_items || 0}</strong><span>Agile 항목</span></div>
      <div class="workboard-alert"><strong>${Number(totals.completion_rate || 0)}%</strong><span>SP 완료율</span></div>
      <div class="workboard-alert"><strong>${Number(totals.done_points || 0)}/${Number(totals.total_points || 0)}</strong><span>완료/전체 SP</span></div>
      <div class="workboard-alert"><strong>${remaining}</strong><span>잔여 SP (활성 Sprint)</span></div>`;
    return;
  }

  // 내 작업 탭: 프로젝트 미로딩 시 myWorkItems로 카드 표시
  const effectiveRows = (view === "mine" && !rows.length && state.myWorkItems?.length)
    ? state.myWorkItems
    : rows;

  // 일반 탭: 프로젝트 미로딩 + 대체 데이터 없으면 클리어
  if (!effectiveRows.length && state.workboardLoadedProjectId !== state.workboardProjectId) {
    wrap.innerHTML = "";
    return;
  }

  const overdue = effectiveRows.filter(isWorkboardOverdue).length;
  const done = effectiveRows.filter((row) => workboardTaskStatus(row) === "완료").length;
  // 프로젝트 진척률 = 최상위 항목들의 롤업 (단순 평균 아님). 프로젝트 미선택(내 작업 대체 데이터)이면 leaf 평균
  const useRollup = effectiveRows === rows && (state.workboardRows || []).length > 0;
  const leafRows = effectiveRows.filter((row) => !workboardRowIsParent(row));
  const avgProgress = useRollup
    ? Math.round(computeWbsOverallProgress(state.workboardRows))
    : leafRows.length
      ? Math.round(leafRows.reduce((sum, row) => sum + workboardTaskProgress(row), 0) / leafRows.length)
      : 0;
  const pendingApprovals = effectiveRows.filter((row) => {
    const meta = normalizeTaskMetadata(row.metadata);
    return meta.approver && workboardTaskStatus(row) !== "완료";
  }).length;
  const ri = workboardProjectRiskCounts(state.workboardProjectId);
  wrap.innerHTML = `
    <div class="workboard-alert ${overdue ? "overdue" : ""}"><strong>${overdue}</strong><span>지연/기한 초과 알림</span></div>
    <div class="workboard-alert"><strong>${avgProgress}%</strong><span>${useRollup ? "프로젝트 진척률(가중 롤업)" : "평균 진행률"}</span></div>
    <div class="workboard-alert"><strong>${done}/${effectiveRows.length}</strong><span>완료 작업 항목</span></div>
    <div class="workboard-alert"><strong>${ri.risks + ri.issues}/${pendingApprovals}</strong><span>리스크·이슈 / 승인 확인</span></div>`;
}
function renderWorkboardPanel() {
  const panel = document.querySelector("#workboard");
  const body = document.querySelector("#workboardBody");
  if (!panel || !body) return;
  const projectId = ensureWorkboardProjectSelection();
  renderWorkboardProjectSelect();
  renderDeliveryModeSelect();
  panel.dataset.workboardView = state.workboardView;
  document.querySelectorAll(".workboard-tab").forEach((tab) => {
    const active = tab.dataset.workboardView === state.workboardView;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (state.workboardLoading) {
    updateWorkboardStatus("로딩 중", "attention");
    renderWorkboardAlerts([]);
    body.innerHTML = `
      <div class="skeleton-stack">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>`;
    renderWorkboardDrawer();
    return;
  }

  if (!projectId) {
    updateWorkboardStatus("프로젝트 없음", "attention");
    renderWorkboardAlerts([]);
    body.innerHTML = `<div class="workboard-empty">등록된 프로젝트가 없습니다. 프로젝트를 먼저 생성하세요.</div>`;
    renderWorkboardDrawer();
    return;
  }

  if (state.workboardLoadedProjectId !== projectId) {
    if (state.workboardView === "mine") {
      updateWorkboardStatus(`${state.myWorkItems.length}개 내 작업`, state.myWorkItems.length ? "stable" : "attention");
      renderWorkboardAlerts(state.myWorkItems || []);
      body.innerHTML = renderMyWorkboardTasks([]);
      renderWorkboardDrawer();
      return;
    }
    updateWorkboardStatus("조회 필요", "attention");
    renderWorkboardAlerts([]);
    body.innerHTML = `<div class="workboard-empty">조회 버튼을 눌러 선택한 프로젝트의 내부 WBS 작업 항목을 불러오세요.</div>`;
    renderWorkboardDrawer();
    return;
  }

  const rows = workboardTaskRows();
  updateWorkboardStatus(state.workboardStatusMessage || `${rows.length}개 항목`, rows.length ? "stable" : "attention");
  renderWorkboardAlerts(rows);

  if (state.workboardView === "agile-backlog") {
    body.innerHTML = renderAgileBacklog();
  } else if (state.workboardView === "agile-board") {
    body.innerHTML = renderAgileSprintBoard();
  } else if (state.workboardView === "agile-metrics") {
    body.innerHTML = renderAgileMetrics();
  } else if (!rows.length && state.workboardView !== "mine") {
    body.innerHTML = `<div class="workboard-empty">이 프로젝트에는 아직 WBS 작업 항목이 없습니다. WBS 관리에서 항목을 추가하세요.</div>`;
  } else if (state.workboardView === "board") {
    body.innerHTML = renderWorkboardBoard(rows);
  } else if (state.workboardView === "gantt") {
    body.innerHTML = renderInternalGantt(rows);
  } else {
    body.innerHTML = renderMyWorkboardTasks(rows);
  }
  renderWorkboardDrawer();
}
function renderWorkboardProgress(row) {
  const progress = workboardTaskProgress(row);
  return `
    <div class="workboard-progress">
      <div class="workboard-progress-track"><div class="workboard-progress-fill" style="width:${progress}%"></div></div>
      <span>${progress}%</span>
    </div>`;
}
function renderWorkboardStatusPill(row) {
  const status = workboardTaskStatus(row);
  return `<span class="workboard-status-pill status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}
function renderMyWorkboardTasks(rows) {
  const mine = (state.myWorkItems?.length ? state.myWorkItems : rows.filter(isMyWorkboardTask))
    .map((row) => ({ ...row, metadata: normalizeTaskMetadata(row.metadata) }));
  const visible = mine.length ? mine : [];
  const summary = mine.length
    ? `${mine.length}개 내 작업`
    : "현재 로그인 사용자와 담당자/검토자/승인자가 매칭된 작업이 없습니다.";
  if (!visible.length) {
    return `
      <div class="workboard-summary-line"><span>${escapeHtml(summary)}</span></div>
      <div class="workboard-empty">전체 작업 보드에서 담당자를 지정하면 이 화면에 개인 작업이 표시됩니다.</div>`;
  }
  const rowsHtml = visible.map((row) => `
    <tr>
      <td>
        <div class="workboard-task-title">
          <strong>${escapeHtml(row.name || "-")}</strong>
          <span>${escapeHtml(row.project_name || "프로젝트")} · ${escapeHtml(row.code || "-")} · ${escapeHtml(row.item_type || "작업")}</span>
        </div>
      </td>
      <td>${escapeHtml(row.owner || "미배정")}</td>
      <td>${renderWorkboardStatusPill(row)}</td>
      <td>${renderWorkboardProgress(row)}</td>
      <td>${escapeHtml(row.finish_date || "기한 없음")}</td>
      <td><button class="wbs-pro-btn-sm" type="button" data-workboard-task="${escapeHtml(workboardTaskKey(row))}">상세</button></td>
    </tr>`).join("");
  return `
    <div class="workboard-summary-line"><span>${escapeHtml(summary)}</span><span>현재 테넌트의 담당/검토/승인 매칭 작업입니다.</span></div>
    <div class="workboard-table-wrap">
      <table class="workboard-table">
        <thead><tr><th>작업 항목</th><th>담당자</th><th>상태</th><th>진척률</th><th>기한</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}
function renderWorkboardBoard(rows) {
  const columns = WBS_STATUSES.map((status) => {
    const items = rows.filter((row) => workboardTaskStatus(row) === status);
    const cards = items.length ? items.map((row) => {
      const editable = canEditWorkboardTask(row);
      const itemType = row.item_type || "작업";
      return `
      <button class="workboard-card" type="button" data-type="${escapeHtml(itemType)}"
        draggable="${editable ? "true" : "false"}"
        data-workboard-task="${escapeHtml(workboardTaskKey(row))}"
        data-workboard-project="${escapeHtml(workboardRowProjectId(row))}">
        <div class="workboard-card-head">
          <span class="card-type-badge">${escapeHtml(itemTypeLabel(itemType))}</span>
          <span class="workboard-card-code">${escapeHtml(row.code || "-")}</span>
        </div>
        <strong>${escapeHtml(row.name || "-")}</strong>
        ${renderWorkboardProgress(row)}
        <div class="workboard-card-meta">
          <span>${escapeHtml(row.owner || "미배정")}</span>
          <span>${escapeHtml(row.finish_date || "기한 없음")}</span>
        </div>
      </button>`;
    }).join("") : `<div class="workboard-empty" style="padding:14px;font-size:0.78rem">항목 없음</div>`;
    return `
      <section class="workboard-board-column" data-workboard-status="${escapeHtml(status)}" data-workboard-drop-status="${escapeHtml(status)}">
        <div class="workboard-board-head"><span>${escapeHtml(status)}</span><small>${items.length}</small></div>
        <div class="workboard-card-list">${cards}</div>
      </section>`;
  }).join("");
  return `
    <div class="workboard-summary-line"><span>PM용 프로젝트 작업 보드</span><span>카드를 컬럼으로 이동해 상태를 바로 변경합니다.</span></div>
    <div class="workboard-board">${columns}</div>`;
}
function renderInternalGantt(rows) {
  const datedRows = rows.filter((row) => row.start_date || row.finish_date);
  if (!datedRows.length) {
    return `<div class="workboard-empty">시작일 또는 종료일이 있는 WBS 작업 항목이 없습니다. 상세에서 기간을 입력하면 간트에 표시됩니다.</div>`;
  }
  const project = currentWorkboardProject();
  const projectDates = [project?.start_date, project?.metadata?.end_date].filter(Boolean);
  const allDates = datedRows.flatMap((row) => [row.start_date, row.finish_date].filter(Boolean))
    .concat(projectDates)
    .map(parseIsoDate)
    .filter(Boolean);
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  minDate.setUTCDate(1);
  maxDate.setUTCMonth(maxDate.getUTCMonth() + 1, 0);
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000));
  const months = [];
  let cur = new Date(minDate);
  while (cur <= maxDate) {
    const nextMonth = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    const end = nextMonth > maxDate ? maxDate : new Date(nextMonth - 1);
    const days = Math.ceil((end - cur) / 86400000) + 1;
    months.push({ label: `${cur.getUTCMonth() + 1}월`, pct: (days / totalDays * 100).toFixed(2) });
    cur = nextMonth;
  }
  const header = months.map((month) => `<div class="workboard-gantt-month" style="flex:${month.pct}">${month.label}</div>`).join("");
  const rowsHtml = datedRows.map((row) => {
    const startIso = row.start_date || row.finish_date;
    const finishIso = row.finish_date || row.start_date;
    const start = parseIsoDate(startIso);
    const finish = parseIsoDate(finishIso) || start;
    const left = Math.max(0, ((start - minDate) / 86400000 / totalDays) * 100);
    const width = Math.max(0.5, ((finish - start) / 86400000 + 1) / totalDays * 100);
    const progress = workboardTaskProgress(row);
    const status = workboardTaskStatus(row);
    const canEdit = canEditWorkboardTask(row);
    const editAttrs = canEdit ? `
            data-wb-gantt-task="${escapeHtml(workboardTaskKey(row))}"
            data-wb-gantt-start="${escapeHtml(startIso)}"
            data-wb-gantt-finish="${escapeHtml(finishIso)}"
            data-wb-gantt-scale-start="${escapeHtml(formatIsoDate(minDate))}"
            data-wb-gantt-total-days="${totalDays}"` : "";
    return `
      <div class="workboard-gantt-row">
        <div class="workboard-gantt-label">
          <span class="workboard-gantt-code">${escapeHtml(row.code || "-")}</span>
          <span class="workboard-gantt-name">${escapeHtml(row.name || "-")}</span>
        </div>
        <div class="workboard-gantt-track">
          <button class="workboard-gantt-bar ${canEdit ? "workboard-gantt-editable" : ""}" type="button"
            data-workboard-task="${escapeHtml(workboardTaskKey(row))}"
            data-status="${escapeHtml(status)}"
            ${editAttrs}
            style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"
            title="${escapeHtml(row.name || "-")} (${escapeHtml(startIso)}~${escapeHtml(finishIso)})">
            ${canEdit ? `
              <span class="workboard-gantt-handle start" data-wb-gantt-handle="start" title="시작일 조정"></span>
              <span class="workboard-gantt-handle end" data-wb-gantt-handle="end" title="종료일 조정"></span>
              <span class="workboard-gantt-date-badge">${escapeHtml(startIso)} ~ ${escapeHtml(finishIso)}</span>
            ` : ""}
            <span class="workboard-gantt-bar-progress" style="width:${progress}%"></span>
          </button>
        </div>
      </div>`;
  }).join("");
  return `
    <div class="workboard-summary-line"><span>PM용 내부 WBS 간트</span><span>막대 이동 또는 양끝 핸들로 기간을 조정합니다.</span></div>
    <div class="workboard-gantt-wrap">
      <div class="workboard-gantt">
        <div class="workboard-gantt-header">
          <div class="workboard-gantt-label">작업명</div>
          <div class="workboard-gantt-scale">${header}</div>
        </div>
        ${rowsHtml}
      </div>
    </div>`;
}
function renderAgileModeNotice() {
  const project = currentWorkboardProject();
  const mode = projectDeliveryMode(project);
  const label = DELIVERY_MODE_LABELS[mode] || "Waterfall";
  const tone = isAgileCapableProject(project) ? "stable" : "attention";
  const text = isAgileCapableProject(project)
    ? `${label} 수행 방식으로 백로그와 스프린트를 운영합니다.`
    : "현재 프로젝트는 Waterfall입니다. Agile 또는 Hybrid로 전환하면 백로그와 스프린트 보드를 실행 기준으로 사용할 수 있습니다.";
  return `<div class="agile-mode-banner ${tone}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(text)}</span></div>`;
}
function renderAgileSprintCards() {
  if (!state.agileSprints.length) {
    return `<div class="workboard-empty agile-empty-compact">등록된 스프린트가 없습니다.</div>`;
  }
  return state.agileSprints.map((sprint) => {
    const items = state.agileItems.filter((item) => item.sprint_id === sprint.id);
    const planned = items.reduce((sum, item) => sum + Number(item.story_points || 0), 0);
    const done = items.filter((item) => item.status === "Done").reduce((sum, item) => sum + Number(item.story_points || 0), 0);
    const pct = planned ? Math.round(done / planned * 100) : 0;
    return `
      <article class="agile-sprint-card">
        <div class="agile-sprint-card-head">
          <strong>${escapeHtml(sprint.name)}</strong>
          <select data-agile-sprint-field="status" data-agile-sprint-id="${escapeHtml(sprint.id)}" ${canMutateWork() ? "" : "disabled"}>
            ${AGILE_SPRINT_STATUSES.map((status) => `<option value="${status}" ${sprint.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </div>
        <p>${escapeHtml(sprint.goal || "Sprint Goal 미입력")}</p>
        <div class="workboard-progress">
          <div class="workboard-progress-track"><div class="workboard-progress-fill" style="width:${pct}%"></div></div>
          <span>${done}/${planned || sprint.capacity_points || 0} SP</span>
        </div>
        <div class="workboard-card-meta">
          <span>${escapeHtml(sprint.start_date || "-")} ~ ${escapeHtml(sprint.end_date || "-")}</span>
          <span>${items.length}개 항목</span>
        </div>
      </article>`;
  }).join("");
}
function renderStoryPointControl({ id = "", value = 0, attrs = "", placeholder = "SP" } = {}) {
  const policy = projectOperationPolicy();
  if (policy.story_point_mode === "fibonacci") {
    const current = Number(value || 0);
    const options = [0, ...storyPointOptions(policy)]
      .filter((point, index, list) => list.indexOf(point) === index)
      .map((point) => `<option value="${point}" ${Math.abs(current - Number(point)) < 0.001 ? "selected" : ""}>${point} SP</option>`)
      .join("");
    return `<select ${id ? `id="${escapeHtml(id)}"` : ""} class="agile-inline-select agile-points-input" ${attrs}>${options}</select>`;
  }
  const inputValue = value === 0 || value ? value : "";
  return `<input ${id ? `id="${escapeHtml(id)}"` : ""} class="agile-points-input" type="number" min="0" step="0.5" value="${escapeHtml(inputValue)}" placeholder="${escapeHtml(placeholder)}" ${attrs} />`;
}
function renderAgileBacklog() {
  const canMutate = canMutateWork();
  const policy = projectOperationPolicy();
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = defaultSprintEndDate(today, policy);
  const fixedSprint = Boolean(sprintPolicyDays(policy));
  const sprintStatusOptions = AGILE_SPRINT_STATUSES.map((status) => `<option value="${status}">${status}</option>`).join("");
  const typeOptions = AGILE_TYPES.map((type) => `<option value="${type}">${type}</option>`).join("");
  const priorityOptions = AGILE_PRIORITIES.map((priority) => `<option value="${priority}">${agilePriorityLabel(priority)}</option>`).join("");
  const backlogRows = state.agileItems.map((item) => {
    const statusOptions = AGILE_STATUSES.map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${agileStatusLabel(status)}</option>`).join("");
    return `
      <tr>
        <td>
          <div class="workboard-task-title">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.item_type)} · ${escapeHtml(agilePriorityLabel(item.priority))}${item.wbs_code ? ` · WBS ${escapeHtml(item.wbs_code)}` : ""}</span>
          </div>
        </td>
        <td>${escapeHtml(item.assignee || "미배정")}</td>
        <td>
          <select class="agile-inline-select" data-agile-item-field="status" data-agile-item-id="${escapeHtml(item.id)}" ${canMutate ? "" : "disabled"}>${statusOptions}</select>
        </td>
        <td>
          ${renderStoryPointControl({
            value: item.story_points || 0,
            attrs: `data-agile-item-field="story_points" data-agile-item-id="${escapeHtml(item.id)}" ${canMutate ? "" : "disabled"}`,
          })}
        </td>
        <td>
          <select class="agile-inline-select" data-agile-item-field="sprint_id" data-agile-item-id="${escapeHtml(item.id)}" ${canMutate ? "" : "disabled"}>
            ${agileSprintOptions(item.sprint_id || "", true)}
          </select>
        </td>
        <td>
          <select class="agile-inline-select" data-agile-item-field="wbs_code" data-agile-item-id="${escapeHtml(item.id)}" ${canMutate ? "" : "disabled"}>
            ${agileWbsOptions(item.wbs_code || "")}
          </select>
        </td>
      </tr>`;
  }).join("");

  return `
    ${renderAgileModeNotice()}
    <div class="agile-layout">
      <section class="agile-panel">
        <div class="agile-panel-head">
          <strong>스프린트</strong>
          <span>${state.agileSprints.length}개</span>
        </div>
        ${canMutate ? `
          <div class="agile-form-grid">
            <input id="agileSprintName" placeholder="Sprint 1" />
            <input id="agileSprintGoal" placeholder="Sprint Goal" />
            <select id="agileSprintStatus">${sprintStatusOptions}</select>
            <input id="agileSprintStart" type="date" value="${today}" data-sprint-policy-start />
            <input id="agileSprintEnd" type="date" value="${defaultEnd}" ${fixedSprint ? "readonly" : ""} title="${escapeHtml(sprintPolicyLabel(policy.sprint_length_policy))}" />
            <input id="agileSprintCapacity" type="number" min="0" step="1" placeholder="계획 SP" />
            <button class="sync-ctrl-btn" type="button" data-agile-add-sprint>스프린트 추가</button>
          </div>` : ""}
        <div class="agile-sprint-list">${renderAgileSprintCards()}</div>
      </section>

      <section class="agile-panel">
        <div class="agile-panel-head">
          <strong>백로그</strong>
          <span>${state.agileItems.length}개 항목</span>
          ${canMutate ? `<button class="wbs-pro-btn-sm" type="button" id="agileWbsSyncBtn" title="WBS 작업 목록을 백로그에 다시 동기화합니다">WBS 재동기화</button>` : ""}
        </div>
        ${canMutate ? `
          <div class="agile-form-grid agile-item-form">
            <input id="agileItemTitle" placeholder="Story / Task 제목" />
            <select id="agileItemType">${typeOptions}</select>
            ${renderStoryPointControl({ id: "agileItemPoints", value: 0, placeholder: "SP" })}
            <select id="agileItemPriority">${priorityOptions}</select>
            <input id="agileItemAssignee" placeholder="담당자" />
            <select id="agileItemSprint">${agileSprintOptions("", true)}</select>
            <select id="agileItemWbs">${agileWbsOptions("")}</select>
            <button class="sync-ctrl-btn" type="button" data-agile-add-item>항목 추가</button>
          </div>` : ""}
        <div class="workboard-table-wrap">
          <table class="workboard-table agile-backlog-table">
            <thead><tr><th>항목</th><th>담당자</th><th>상태</th><th>SP</th><th>Sprint</th><th>WBS 연결</th></tr></thead>
            <tbody>${backlogRows || `<tr><td colspan="6"><div class="workboard-empty">백로그 항목이 없습니다.</div></td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </div>`;
}
function renderAgileSprintBoard() {
  ensureAgileSprintSelection();
  const selectedSprintId = state.agileSelectedSprintId;
  const sprint = sprintById(selectedSprintId);
  const items = state.agileItems.filter((item) => (selectedSprintId ? item.sprint_id === selectedSprintId : !item.sprint_id));
  const selector = `
    <select id="agileBoardSprintSelect" class="agile-board-sprint-select" aria-label="스프린트 선택">
      <option value="" ${!selectedSprintId ? "selected" : ""}>백로그</option>
      ${state.agileSprints.map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === selectedSprintId ? "selected" : ""}>${escapeHtml(s.name)} (${escapeHtml(s.status)})</option>`).join("")}
    </select>`;
  const planned = items.reduce((sum, item) => sum + Number(item.story_points || 0), 0);
  const done = items.filter((item) => item.status === "Done").reduce((sum, item) => sum + Number(item.story_points || 0), 0);
  const columns = AGILE_STATUSES.map((status) => {
    const columnItems = items.filter((item) => item.status === status);
    const cards = columnItems.length ? columnItems.map((item) => `
      <button class="workboard-card agile-card" type="button" data-type="${escapeHtml(item.item_type || "Task")}" draggable="${canMutateWork() ? "true" : "false"}" data-agile-card="${escapeHtml(item.id)}">
        <div class="workboard-card-head">
          <span class="card-type-badge">${escapeHtml(itemTypeLabel(item.item_type || "Task"))}</span>
          ${item.wbs_code ? `<span class="agile-wbs-chip">WBS ${escapeHtml(item.wbs_code)}</span>` : ""}
        </div>
        <strong>${escapeHtml(item.title)}</strong>
        <div class="workboard-card-meta">
          <span>${Number(item.story_points || 0)} SP</span>
          <span>${escapeHtml(item.assignee || "미배정")}</span>
        </div>
      </button>`).join("") : `<div class="workboard-empty" style="padding:14px;font-size:0.78rem">항목 없음</div>`;
    return `
      <section class="workboard-board-column agile-board-column" data-agile-drop-status="${escapeHtml(status)}">
        <div class="workboard-board-head"><span>${escapeHtml(agileStatusLabel(status))}</span><small>${columnItems.length}</small></div>
        <div class="workboard-card-list">${cards}</div>
      </section>`;
  }).join("");
  return `
    ${renderAgileModeNotice()}
    <div class="workboard-summary-line">
      <span>${sprint ? escapeHtml(sprint.name) : "백로그"} · ${done}/${planned} SP 완료</span>
      <span>${selector}</span>
    </div>
    <div class="workboard-board agile-board">${columns}</div>`;
}
function renderAgileBurndownChart(burndown) {
  if (!burndown?.days?.length) {
    return `<div class="workboard-empty agile-empty-compact">활성 스프린트가 없거나 번다운을 계산할 Story Point가 없습니다.</div>`;
  }
  const width = 680;
  const height = 220;
  const pad = 28;
  const maxY = Math.max(1, ...burndown.days.map((d) => Number(d.ideal_remaining || 0)), ...burndown.days.map((d) => Number(d.actual_remaining || 0)));
  const x = (index) => pad + (index / Math.max(1, burndown.days.length - 1)) * (width - pad * 2);
  const y = (value) => height - pad - (Number(value || 0) / maxY) * (height - pad * 2);
  const idealPoints = burndown.days.map((day, index) => `${x(index)},${y(day.ideal_remaining)}`).join(" ");
  const actualPoints = burndown.days
    .map((day, index) => day.actual_remaining == null ? null : `${x(index)},${y(day.actual_remaining)}`)
    .filter(Boolean)
    .join(" ");
  return `
    <svg class="agile-burndown-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sprint burndown">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" />
      <polyline class="ideal" points="${idealPoints}" />
      ${actualPoints ? `<polyline class="actual" points="${actualPoints}" />` : ""}
      <text x="${pad}" y="18">${escapeHtml(burndown.name)} · 잔여 ${Number(burndown.remaining_points || 0)} SP</text>
      <text x="${width - 150}" y="${height - 8}">Ideal / Actual</text>
    </svg>`;
}
function renderAgileMetrics() {
  const metrics = state.agileMetrics || {};
  const totals = metrics.totals || {};
  const velocityRows = (metrics.velocity_history || []).map((row) => {
    const planned = Number(row.planned_points || 0);
    const done = Number(row.done_points || 0);
    const pct = planned ? Math.round(done / planned * 100) : 0;
    return `
      <div class="agile-velocity-row">
        <span>${escapeHtml(row.name)}</span>
        <div class="workboard-progress-track"><div class="workboard-progress-fill" style="width:${pct}%"></div></div>
        <strong>${done}/${planned} SP</strong>
      </div>`;
  }).join("");
  const wbsRows = (metrics.wbs_progress || []).map((row) => `
    <tr>
      <td><code>${escapeHtml(row.wbs_code)}</code></td>
      <td>${escapeHtml(row.wbs_name || "-")}</td>
      <td>${Number(row.done_points || 0)}/${Number(row.total_points || 0)} SP</td>
      <td>${Number(row.completion_rate || 0)}%</td>
    </tr>`).join("");
  return `
    ${renderAgileModeNotice()}
    <div class="agile-metric-grid">
      <div class="workboard-alert"><strong>${totals.total_items || 0}</strong><span>Agile 항목</span></div>
      <div class="workboard-alert"><strong>${Number(totals.done_points || 0)}/${Number(totals.total_points || 0)}</strong><span>완료/전체 SP</span></div>
      <div class="workboard-alert"><strong>${Number(totals.completion_rate || 0)}%</strong><span>SP 완료율</span></div>
      <div class="workboard-alert"><strong>${totals.hybrid_links || 0}</strong><span>WBS 연결</span></div>
    </div>
    <div class="agile-layout">
      <section class="agile-panel">
        <div class="agile-panel-head"><strong>Sprint Burndown</strong><span>잔여 SP</span></div>
        ${renderAgileBurndownChart(metrics.burndown)}
      </section>
      <section class="agile-panel">
        <div class="agile-panel-head"><strong>Velocity</strong><span>스프린트별 완료 SP</span></div>
        <div class="agile-velocity-list">${velocityRows || `<div class="workboard-empty agile-empty-compact">스프린트 이력이 없습니다.</div>`}</div>
      </section>
    </div>
    <section class="agile-panel agile-hybrid-panel">
      <div class="agile-panel-head"><strong>Hybrid WBS 연결 현황</strong><span>${(metrics.wbs_progress || []).length}개 WBS</span></div>
      <div class="workboard-table-wrap">
        <table class="workboard-table">
          <thead><tr><th>WBS 코드</th><th>WBS 항목</th><th>Story Point</th><th>완료율</th></tr></thead>
          <tbody>${wbsRows || `<tr><td colspan="4"><div class="workboard-empty">WBS에 연결된 Agile 항목이 없습니다.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
}
function selectedWorkboardRow() {
  const key = state.workboardSelectedCode;
  if (!key) return null;
  return allWorkboardRows().find((row) => workboardTaskKey(row) === key) || null;
}
function openWorkboardTask(key) {
  state.workboardSelectedCode = key;
  renderWorkboardDrawer();
}
function closeWorkboardDrawer() {
  state.workboardSelectedCode = null;
  renderWorkboardDrawer();
}
function renderTaskLog(items, emptyText) {
  if (!items || !items.length) {
    return `<div class="task-log-item"><span>${escapeHtml(emptyText)}</span></div>`;
  }
  return items.slice().reverse().map((item) => `
    <div class="task-log-item">
      <strong>${escapeHtml(item.author || item.actor || item.name || "시스템")}</strong>
      <span>${escapeHtml(item.ts || item.at || item.created_at || "")}</span>
      ${item.url
        ? `<p><a class="task-attachment-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name || item.url)}</a></p>`
        : `<p>${escapeHtml(item.text || item.action || item.summary || "")}</p>`}
    </div>`).join("");
}
function renderWorkboardDrawer() {
  const drawer = document.querySelector("#workboardDrawer");
  const body = document.querySelector("#workboardDrawerBody");
  if (!drawer || !body) return;
  const row = selectedWorkboardRow();
  if (!row) {
    drawer.hidden = true;
    return;
  }
  const meta = normalizeTaskMetadata(row.metadata);
  const canMutate = canEditWorkboardTask(row);
  const statusOpts = WBS_STATUSES.map((status) => `<option value="${status}" ${workboardTaskStatus(row) === status ? "selected" : ""}>${status}</option>`).join("");
  const priorityOpts = WBS_PRIORITIES.map((priority) => `<option value="${priority}" ${workboardTaskPriority(row) === priority ? "selected" : ""}>${priority}</option>`).join("");
  const comments = Array.isArray(meta.comments) ? meta.comments : [];
  const history = Array.isArray(meta.history) ? meta.history : [];
  const attachments = Array.isArray(meta.attachments) ? meta.attachments : Array.isArray(meta.deliverables) ? meta.deliverables : [];

  document.querySelector("#workTaskCode").textContent = row.code || "작업 항목";
  document.querySelector("#workTaskTitle").textContent = row.name || "작업 상세";
  document.querySelector("#workTaskSaveBtn").disabled = !canMutate;
  drawer.hidden = false;
  body.innerHTML = `
    <div class="workboard-form-grid">
      <label><span>작업명</span><input id="workTaskName" value="${escapeHtml(row.name || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>담당자</span><input id="workTaskOwner" value="${escapeHtml(row.owner || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>상태</span><select id="workTaskStatus" ${canMutate ? "" : "disabled"}>${statusOpts}</select></label>
      <label><span>우선순위</span><select id="workTaskPriority" ${canMutate ? "" : "disabled"}>${priorityOpts}</select></label>
      <label><span>시작일</span><input id="workTaskStart" type="date" value="${escapeHtml(row.start_date || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>종료일</span><input id="workTaskFinish" type="date" value="${escapeHtml(row.finish_date || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>검토자</span><input id="workTaskReviewer" value="${escapeHtml(meta.reviewer || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>승인자</span><input id="workTaskApprover" value="${escapeHtml(meta.approver || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>팀</span><input id="workTaskTeam" value="${escapeHtml(meta.team || "")}" ${canMutate ? "" : "disabled"} /></label>
      <label><span>예상 공수(h)</span><input id="workTaskEffort" type="number" min="0" step="0.5" value="${escapeHtml(meta.effort || "")}" ${canMutate ? "" : "disabled"} /></label>
    </div>
    <label class="workboard-form-wide">
      <span id="workTaskProgressLabel">진척률 ${workboardTaskProgress(row)}%${workboardRowIsParent(row) ? " (하위 작업 가중 합산 — 자동 계산)" : ""}</span>
      <input id="workTaskProgress" type="range" min="0" max="100" value="${workboardTaskProgress(row)}" ${canMutate && !workboardRowIsParent(row) ? "" : "disabled"} />
    </label>
    <label class="workboard-form-wide">
      <span>댓글</span>
      <div class="task-comments">${renderTaskLog(comments, "등록된 댓글이 없습니다.")}</div>
      ${canMutate ? `<textarea id="workTaskComment" rows="3" placeholder="이번 변경에 대한 댓글을 남기세요."></textarea>` : ""}
    </label>
    <label class="workboard-form-wide">
      <span>첨부/산출물</span>
      <div class="task-attachments">${renderTaskLog(attachments, "등록된 첨부 또는 산출물이 없습니다.")}</div>
    </label>
    ${canMutate ? `
      <div class="workboard-form-grid">
        <label><span>파일 업로드</span><input id="workTaskAttachmentFile" type="file" /></label>
        <label><span>첨부명</span><input id="workTaskAttachmentName" placeholder="예) 요구사항정의서 v1" /></label>
        <label><span>첨부 URL</span><input id="workTaskAttachmentUrl" placeholder="https:// 또는 공유 링크" /></label>
      </div>` : ""}
    <label class="workboard-form-wide">
      <span>변경 이력</span>
      <div class="task-history">${renderTaskLog(history, "아직 변경 이력이 없습니다.")}</div>
    </label>`;
}
function taskChangeSummary(before, after) {
  const entries = [
    ["상태", before.status, after.status],
    ["진척률", `${before.progress}%`, `${after.progress}%`],
    ["담당자", before.owner || "-", after.owner || "-"],
    ["시작일", before.start_date || "-", after.start_date || "-"],
    ["종료일", before.finish_date || "-", after.finish_date || "-"],
  ];
  return entries
    .filter(([, oldValue, newValue]) => oldValue !== newValue)
    .map(([label, oldValue, newValue]) => `${label}: ${oldValue} → ${newValue}`)
    .join(", ");
}
function applyWorkboardItemUpdate(updated) {
  if (!updated) return;
  const normalized = { ...updated, metadata: normalizeTaskMetadata(updated.metadata) };
  const key = workboardTaskKey(normalized);
  const mergeRows = (rows, appendCurrentProject = false) => {
    let found = false;
    const next = (rows || []).map((row) => {
      if (workboardTaskKey(row) === key) {
        found = true;
        return { ...row, ...normalized };
      }
      return row;
    });
    if (appendCurrentProject && !found && normalized.project_id === state.workboardProjectId) next.push(normalized);
    return next;
  };
  state.workboardRows = mergeRows(state.workboardRows, true);
  state.myWorkItems = mergeRows(state.myWorkItems, false);
  if (state.wbsPlanProjectId === normalized.project_id) {
    state.wbsPlanRows = state.wbsPlanRows.map((row) => (
      row.code === normalized.code
        ? { ...row, ...normalized, metadata: normalizeTaskMetadata(normalized.metadata) }
        : row
    ));
  }
  state.workboardSelectedCode = key;
}
async function patchWorkboardTask(row, payload) {
  const projectId = workboardRowProjectId(row);
  const code = row?.code;
  if (!projectId || !code) throw new Error("작업 항목 식별 정보를 확인할 수 없습니다.");
  const updated = await request(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(code)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
  applyWorkboardItemUpdate(updated);
  return updated;
}
async function uploadWorkboardAttachment(row, file) {
  if (!file) return null;
  const projectId = workboardRowProjectId(row);
  const code = row?.code;
  const formData = new FormData();
  formData.append("file", file);
  const result = await request(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(code)}/attachments`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (result?.item) applyWorkboardItemUpdate(result.item);
  return result;
}
async function quickUpdateWorkboardTask(key, payload) {
  const row = allWorkboardRows().find((item) => workboardTaskKey(item) === key);
  if (!row || !canEditWorkboardTask(row)) return;
  state.workboardStatusMessage = "저장 중";
  updateWorkboardStatus("저장 중", "attention");
  try {
    const updated = await patchWorkboardTask(row, payload);
    state.workboardStatusMessage = "저장 완료";
    renderWorkboardPanel();
    loadNotifications();
    return updated;
  } catch (error) {
    state.workboardStatusMessage = error.message;
    updateWorkboardStatus(error.message, "critical");
    renderWorkboardPanel();
    return null;
  }
}
async function updateProjectDeliveryMode(mode) {
  const projectId = state.workboardProjectId;
  if (!projectId || !canMutateWork()) return;
  state.workboardStatusMessage = "수행 방식 저장 중";
  updateWorkboardStatus("저장 중", "attention");
  try {
    const project = await request(`/api/projects/${encodeURIComponent(projectId)}/delivery-mode`, {
      method: "PATCH",
      body: JSON.stringify({ delivery_mode: mode }),
    });
    state.projects = state.projects.map((item) => item.id === project.id ? project : item);
    state.workboardStatusMessage = `${DELIVERY_MODE_LABELS[mode] || mode} 적용`;
    renderWorkboardPanel();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}
async function refreshAgileAfterChange() {
  await loadAgileProject(state.workboardProjectId, { render: false });
  renderWorkboardPanel();
}
async function createAgileSprint() {
  if (!state.workboardProjectId || !canMutateWork()) return;
  const name = document.querySelector("#agileSprintName")?.value.trim();
  if (!name) {
    state.workboardStatusMessage = "스프린트명을 입력하세요";
    renderWorkboardPanel();
    return;
  }
  const policy = projectOperationPolicy();
  const startDate = document.querySelector("#agileSprintStart")?.value || new Date().toISOString().slice(0, 10);
  const payload = {
    name,
    goal: document.querySelector("#agileSprintGoal")?.value.trim() || "",
    status: document.querySelector("#agileSprintStatus")?.value || "Planning",
    start_date: startDate,
    end_date: sprintPolicyDays(policy)
      ? defaultSprintEndDate(startDate, policy)
      : (document.querySelector("#agileSprintEnd")?.value || defaultSprintEndDate(startDate, policy)),
    capacity_points: Number(document.querySelector("#agileSprintCapacity")?.value || 0),
  };
  state.workboardStatusMessage = "스프린트 저장 중";
  updateWorkboardStatus("저장 중", "attention");
  try {
    await request(`/api/projects/${encodeURIComponent(state.workboardProjectId)}/agile/sprints`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.workboardStatusMessage = "스프린트 추가 완료";
    await refreshAgileAfterChange();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}
async function createAgileItem() {
  if (!state.workboardProjectId || !canMutateWork()) return;
  const title = document.querySelector("#agileItemTitle")?.value.trim();
  if (!title) {
    state.workboardStatusMessage = "백로그 항목 제목을 입력하세요";
    renderWorkboardPanel();
    return;
  }
  const payload = {
    title,
    item_type: document.querySelector("#agileItemType")?.value || "Story",
    story_points: Number(document.querySelector("#agileItemPoints")?.value || 0),
    priority: document.querySelector("#agileItemPriority")?.value || "Should",
    assignee: document.querySelector("#agileItemAssignee")?.value.trim() || null,
    sprint_id: document.querySelector("#agileItemSprint")?.value || null,
    wbs_code: document.querySelector("#agileItemWbs")?.value || null,
    status: document.querySelector("#agileItemSprint")?.value ? "Ready" : "Backlog",
  };
  state.workboardStatusMessage = "백로그 저장 중";
  updateWorkboardStatus("저장 중", "attention");
  try {
    await request(`/api/projects/${encodeURIComponent(state.workboardProjectId)}/agile/backlog`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.workboardStatusMessage = "백로그 항목 추가 완료";
    await refreshAgileAfterChange();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}
async function updateAgileSprintField(sprintId, field, value) {
  if (!sprintId || !field || !canMutateWork()) return;
  try {
    await request(`/api/agile/sprints/${encodeURIComponent(sprintId)}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: value }),
    });
    state.workboardStatusMessage = "스프린트 업데이트 완료";
    await refreshAgileAfterChange();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}
async function updateAgileItemField(itemId, field, value) {
  if (!itemId || !field) return;
  const payload = { [field]: field === "story_points" ? Number(value || 0) : (value || null) };
  if (field === "status") payload.status = value || "Backlog";
  try {
    await request(`/api/agile/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.workboardStatusMessage = "Agile 항목 업데이트 완료";
    await refreshAgileAfterChange();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    renderWorkboardPanel();
  }
}
async function saveWorkboardTaskUpdate() {
  const row = selectedWorkboardRow();
  if (!row || !canEditWorkboardTask(row)) return;
  const saveBtn = document.querySelector("#workTaskSaveBtn");
  if (saveBtn) saveBtn.disabled = true;
  const before = {
    status: workboardTaskStatus(row),
    progress: workboardTaskProgress(row),
    owner: row.owner || "",
    start_date: row.start_date || "",
    finish_date: row.finish_date || "",
  };
  const after = {
    status: document.querySelector("#workTaskStatus")?.value || before.status,
    progress: Number(document.querySelector("#workTaskProgress")?.value || before.progress),
    owner: document.querySelector("#workTaskOwner")?.value.trim() || "",
    start_date: document.querySelector("#workTaskStart")?.value || null,
    finish_date: document.querySelector("#workTaskFinish")?.value || null,
  };
  const effortRaw = document.querySelector("#workTaskEffort")?.value;
  const comment = document.querySelector("#workTaskComment")?.value.trim();
  const attachmentName = document.querySelector("#workTaskAttachmentName")?.value.trim();
  const attachmentUrl = document.querySelector("#workTaskAttachmentUrl")?.value.trim();
  const file = document.querySelector("#workTaskAttachmentFile")?.files?.[0] || null;
  const payload = {
    name: document.querySelector("#workTaskName")?.value.trim() || row.name,
    owner: after.owner || "",
    status: after.status,
    // 상위 항목 진척률은 롤업 값이므로 저장하지 않음
    progress: workboardRowIsParent(row) ? undefined : Math.max(0, Math.min(100, Number.isFinite(after.progress) ? after.progress : 0)),
    priority: document.querySelector("#workTaskPriority")?.value || "보통",
    start_date: after.start_date,
    finish_date: after.finish_date,
    reviewer: document.querySelector("#workTaskReviewer")?.value.trim() || "",
    approver: document.querySelector("#workTaskApprover")?.value.trim() || "",
    team: document.querySelector("#workTaskTeam")?.value.trim() || "",
    comment: comment || null,
    attachment_name: attachmentName || null,
    attachment_url: attachmentUrl || null,
  };
  if (effortRaw !== "") payload.effort = Number(effortRaw || 0);
  const summary = taskChangeSummary(before, after);
  try {
    let updated = await patchWorkboardTask(row, payload);
    if (file) {
      const uploadResult = await uploadWorkboardAttachment(updated || row, file);
      updated = uploadResult?.item || updated;
    }
    state.myWorkItems = (await request("/api/me/work-items").catch(() => state.myWorkItems || []))
      .map((item) => ({ ...item, metadata: normalizeTaskMetadata(item.metadata) }));
    state.workboardStatusMessage = summary || comment || attachmentName || attachmentUrl || file ? "저장 완료" : "변경 없음";
    state.workboardSelectedCode = null;
    loadNotifications();
    renderWorkboardPanel();
  } catch (error) {
    state.workboardStatusMessage = error.message;
    updateWorkboardStatus(error.message, "critical");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}
function parseIsoDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
function formatIsoDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return "";
  return dateValue.toISOString().slice(0, 10);
}
function addDaysIso(value, days) {
  const dateValue = parseIsoDate(value);
  if (!dateValue) return "";
  dateValue.setUTCDate(dateValue.getUTCDate() + days);
  return formatIsoDate(dateValue);
}
function diffDaysIso(fromValue, toValue) {
  const from = parseIsoDate(fromValue);
  const to = parseIsoDate(toValue);
  if (!from || !to) return 0;
  return Math.round((to - from) / 86400000);
}
function minIsoDate(a, b) {
  return diffDaysIso(a, b) < 0 ? a : b;
}
function maxIsoDate(a, b) {
  return diffDaysIso(a, b) > 0 ? a : b;
}
function ganttDateFromPointer(drag, event) {
  const rect = drag.track.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  return addDaysIso(drag.scaleStart, Math.round(pct * drag.totalDays));
}
function ganttPreviewDates(drag, event) {
  if (drag.mode === "move") {
    const rect = drag.track.getBoundingClientRect();
    const pxPerDay = Math.max(1, rect.width) / Math.max(1, drag.totalDays);
    const deltaDays = Math.round((event.clientX - drag.pointerStartX) / pxPerDay);
    return {
      start_date: addDaysIso(drag.originalStart, deltaDays),
      finish_date: addDaysIso(drag.originalFinish, deltaDays),
    };
  }

  const pointerDate = ganttDateFromPointer(drag, event);
  if (drag.mode === "start") {
    return {
      start_date: minIsoDate(pointerDate, drag.originalFinish),
      finish_date: drag.originalFinish,
    };
  }
  return {
    start_date: drag.originalStart,
    finish_date: maxIsoDate(pointerDate, drag.originalStart),
  };
}
function updateGanttBarPreview(drag, preview) {
  const leftDays = diffDaysIso(drag.scaleStart, preview.start_date);
  const spanDays = Math.max(1, diffDaysIso(preview.start_date, preview.finish_date) + 1);
  const left = Math.max(0, Math.min(100, (leftDays / drag.totalDays) * 100));
  const width = Math.max(0.3, Math.min(100 - left, (spanDays / drag.totalDays) * 100));
  drag.bar.style.left = `${left.toFixed(2)}%`;
  drag.bar.style.width = `${width.toFixed(2)}%`;
  const badge = drag.bar.querySelector(".op-gantt-date-badge, .workboard-gantt-date-badge");
  if (badge) badge.textContent = `${preview.start_date} ~ ${preview.finish_date}`;
  drag.preview = preview;
}
document.querySelector("#workboardProjectSelect")?.addEventListener("change", (event) => {
  loadWorkboardProject(event.target.value || null);
});
document.querySelector("#projectDeliveryModeSelect")?.addEventListener("change", (event) => {
  updateProjectDeliveryMode(event.target.value || "waterfall");
});
document.querySelector("#workboardRefreshBtn")?.addEventListener("click", () => {
  if (state.workboardProjectId) loadWorkboardProject(state.workboardProjectId);
});
document.querySelector("#workboardTabBar")?.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-workboard-view]");
  if (!tab) return;
  state.workboardView = tab.dataset.workboardView;
  renderWorkboardPanel();
});
document.querySelector("#workboardTabBar")?.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(document.querySelectorAll("#workboardTabBar [role='tab']"));
  const currentIndex = tabs.indexOf(document.activeElement);
  if (!tabs.length || currentIndex < 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  const next = tabs[nextIndex];
  state.workboardView = next.dataset.workboardView;
  renderWorkboardPanel();
  next.focus();
});
document.querySelector("#workboardBody")?.addEventListener("click", async (event) => {
  const addSprint = event.target.closest("[data-agile-add-sprint]");
  if (addSprint) {
    createAgileSprint();
    return;
  }
  const addItem = event.target.closest("[data-agile-add-item]");
  if (addItem) {
    createAgileItem();
    return;
  }
  const syncBtn = event.target.closest("#agileWbsSyncBtn");
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.textContent = "동기화 중…";
    const result = await syncAgileFromWbs(state.workboardProjectId);
    state.workboardStatusMessage = result
      ? `WBS 동기화 완료 (생성 ${result.created} 갱신 ${result.updated})`
      : "동기화 실패";
    await loadAgileProject(state.workboardProjectId, { render: false });
    renderWorkboardPanel();
    return;
  }
  const taskBtn = event.target.closest("[data-workboard-task]");
  if (!taskBtn) return;
  openWorkboardTask(taskBtn.dataset.workboardTask);
});
document.querySelector("#workboardBody")?.addEventListener("change", (event) => {
  if (event.target?.matches?.("#agileSprintStart")) {
    const endInput = document.querySelector("#agileSprintEnd");
    if (endInput && sprintPolicyDays(projectOperationPolicy())) {
      endInput.value = defaultSprintEndDate(event.target.value, projectOperationPolicy());
    }
    return;
  }
  if (event.target?.id === "agileBoardSprintSelect") {
    state.agileSelectedSprintId = event.target.value || "";
    renderWorkboardPanel();
    return;
  }
  const itemField = event.target.closest("[data-agile-item-field]");
  if (itemField) {
    updateAgileItemField(itemField.dataset.agileItemId, itemField.dataset.agileItemField, itemField.value);
    return;
  }
  const sprintField = event.target.closest("[data-agile-sprint-field]");
  if (sprintField) {
    updateAgileSprintField(sprintField.dataset.agileSprintId, sprintField.dataset.agileSprintField, sprintField.value);
  }
});
document.querySelector("#workboardBody")?.addEventListener("dragstart", (event) => {
  const agileCard = event.target.closest(".agile-card[data-agile-card]");
  if (agileCard) {
    if (!canMutateWork()) {
      event.preventDefault();
      return;
    }
    state.agileDragKey = agileCard.dataset.agileCard;
    agileCard.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.agileDragKey);
    return;
  }
  const card = event.target.closest(".workboard-card[data-workboard-task]");
  if (!card) return;
  const row = allWorkboardRows().find((item) => workboardTaskKey(item) === card.dataset.workboardTask);
  if (!row || !canEditWorkboardTask(row)) {
    event.preventDefault();
    return;
  }
  state.workboardDragKey = card.dataset.workboardTask;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.workboardDragKey);
});
document.querySelector("#workboardBody")?.addEventListener("dragover", (event) => {
  const agileColumn = event.target.closest("[data-agile-drop-status]");
  if (agileColumn && state.agileDragKey) {
    event.preventDefault();
    agileColumn.classList.add("is-drop-target");
    event.dataTransfer.dropEffect = "move";
    return;
  }
  const column = event.target.closest("[data-workboard-drop-status]");
  if (!column || !state.workboardDragKey) return;
  event.preventDefault();
  column.classList.add("is-drop-target");
  event.dataTransfer.dropEffect = "move";
});
document.querySelector("#workboardBody")?.addEventListener("dragleave", (event) => {
  const agileColumn = event.target.closest("[data-agile-drop-status]");
  if (agileColumn && !agileColumn.contains(event.relatedTarget)) agileColumn.classList.remove("is-drop-target");
  const column = event.target.closest("[data-workboard-drop-status]");
  if (column && !column.contains(event.relatedTarget)) column.classList.remove("is-drop-target");
});
document.querySelector("#workboardBody")?.addEventListener("drop", async (event) => {
  const agileColumn = event.target.closest("[data-agile-drop-status]");
  const agileKey = state.agileDragKey || event.dataTransfer.getData("text/plain");
  if (agileColumn && agileKey) {
    event.preventDefault();
    document.querySelectorAll(".agile-board-column.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    state.agileDragKey = null;
    await updateAgileItemField(agileKey, "status", agileColumn.dataset.agileDropStatus);
    return;
  }
  const column = event.target.closest("[data-workboard-drop-status]");
  const key = state.workboardDragKey || event.dataTransfer.getData("text/plain");
  if (!column || !key) return;
  event.preventDefault();
  document.querySelectorAll(".workboard-board-column.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  state.workboardDragKey = null;
  await quickUpdateWorkboardTask(key, { status: column.dataset.workboardDropStatus });
});
document.querySelector("#workboardBody")?.addEventListener("dragend", () => {
  state.workboardDragKey = null;
  state.agileDragKey = null;
  document.querySelectorAll(".workboard-card.is-dragging, .workboard-board-column.is-drop-target").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
  document.querySelectorAll(".agile-card.is-dragging, .agile-board-column.is-drop-target").forEach((item) => {
    item.classList.remove("is-dragging", "is-drop-target");
  });
});
document.querySelector("#workTaskCloseBtn")?.addEventListener("click", closeWorkboardDrawer);
document.querySelector("#workTaskCancelBtn")?.addEventListener("click", closeWorkboardDrawer);
document.querySelector("#workboardDrawerBackdrop")?.addEventListener("click", closeWorkboardDrawer);
document.querySelector("#workTaskSaveBtn")?.addEventListener("click", saveWorkboardTaskUpdate);
document.querySelector("#workboardDrawer")?.addEventListener("input", (event) => {
  if (event.target?.id === "workTaskProgress") {
    const label = document.querySelector("#workTaskProgressLabel");
    if (label) label.textContent = `진척률 ${event.target.value}%`;
  }
});
document.addEventListener("pointerdown", (event) => {
  const bar = event.target.closest(".workboard-gantt-editable[data-wb-gantt-task]");
  if (!bar || event.button !== 0) return;
  const row = allWorkboardRows().find((item) => workboardTaskKey(item) === bar.dataset.wbGanttTask);
  if (!row || !canEditWorkboardTask(row)) return;
  const track = bar.closest(".workboard-gantt-track");
  if (!track) return;
  const handle = event.target.closest("[data-wb-gantt-handle]");
  const originalStart = bar.dataset.wbGanttStart;
  const originalFinish = bar.dataset.wbGanttFinish || originalStart;
  if (!originalStart || !originalFinish) return;

  state.workboardGanttDrag = {
    bar,
    track,
    mode: handle?.dataset.wbGanttHandle || "move",
    taskKey: bar.dataset.wbGanttTask,
    originalStart,
    originalFinish,
    scaleStart: bar.dataset.wbGanttScaleStart,
    totalDays: Number(bar.dataset.wbGanttTotalDays || 1),
    pointerStartX: event.clientX,
    preview: { start_date: originalStart, finish_date: originalFinish },
  };
  bar.classList.add("is-dragging");
  bar.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
document.addEventListener("pointermove", (event) => {
  const drag = state.workboardGanttDrag;
  if (!drag) return;
  updateGanttBarPreview(drag, ganttPreviewDates(drag, event));
});
document.addEventListener("pointerup", async (event) => {
  const drag = state.workboardGanttDrag;
  if (!drag) return;
  state.workboardGanttDrag = null;
  drag.bar.classList.remove("is-dragging");
  const preview = drag.preview || ganttPreviewDates(drag, event);
  if (preview.start_date === drag.originalStart && preview.finish_date === drag.originalFinish) {
    renderWorkboardPanel();
    return;
  }
  await quickUpdateWorkboardTask(drag.taskKey, preview);
});
