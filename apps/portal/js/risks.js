/* AX WBS 포털 — 리스크·이슈
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것)
   상세 드로어·담당자 필터·정렬·미종료 건 바로가기는 origin/main(6/11) 에서 이식 */

/* ── 미종료 리스크·이슈 집계 / 목록 바로가기 (대시보드·프로젝트 현황·작업 현황 공용) ── */
const RI_OPEN_STATUS_FILTER = "__open__";

function isOpenRiStatus(status) {
  return status !== "Closed";
}

function projectRiCounts(projectId) {
  const risks = state.risks.filter((item) => item.project_id === projectId && isOpenRiStatus(item.status)).length;
  const issues = state.issues.filter((item) => item.project_id === projectId && isOpenRiStatus(item.status)).length;
  return { risks, issues };
}

function riCountButton({ type, count, projectId = "", label = "" }) {
  const isRisk = type === "risks";
  const text = label || (isRisk ? "리스크" : "이슈");
  return `
    <button class="ri-count-pill ${isRisk ? "kpi-risk" : "kpi-issue"}" type="button"
      data-ri-navigate="${isRisk ? "risks" : "issues"}"
      data-ri-status="${RI_OPEN_STATUS_FILTER}"
      ${projectId ? `data-ri-project-id="${escapeHtml(projectId)}"` : ""}
      ${count ? "" : "disabled"}
      title="${escapeHtml(text)} ${Number(count || 0)}건 보기">
      <span>${escapeHtml(text)}</span><strong>${Number(count || 0)}</strong>
    </button>`;
}

function navigateToRiList({ tab = "risks", projectId = "", status = RI_OPEN_STATUS_FILTER, owner = "" } = {}) {
  state.riTab = tab === "issues" ? "issues" : "risks";
  state.riProjectFilter = projectId || "";
  state.riStatusFilter = status || "";
  state.riOwnerFilter = owner || "";
  state.riSortKey = "due_date";
  state.riSortDir = "asc";
  state.riDetail = null;
  closeRiDetailDrawer();
  applyPortalView("#risks", { behavior: "smooth" });
}

/* ── P2-02: 리스크·이슈 트래킹 ─────────────────────────────────── */

function renderRisksPanel() {
  if (document.body.dataset.portalView !== "risks") return;
  renderRiProjectFilter();
  renderRiStatusFilter();
  renderRiOwnerFilter();
  renderRiTable();
}

function renderRiProjectFilter() {
  const sel = document.querySelector("#riProjectFilter");
  if (!sel) return;
  const current = sel.value || state.riProjectFilter;
  const opts = state.projects.map((p) =>
    `<option value="${escapeHtml(p.id)}" ${p.id === current ? "selected" : ""}>${escapeHtml(p.name)}</option>`
  ).join("");
  sel.innerHTML = `<option value="">전체 프로젝트</option>${opts}`;
}

function renderRiStatusFilter() {
  const sel = document.querySelector("#riStatusFilter");
  if (!sel) return;
  const isRisks = state.riTab === "risks";
  const statuses = isRisks
    ? ["Open", "Mitigated", "Closed"]
    : ["Open", "In Progress", "Resolved", "Closed"];
  const validStatus = state.riStatusFilter === RI_OPEN_STATUS_FILTER || statuses.includes(state.riStatusFilter);
  if (!validStatus) state.riStatusFilter = "";
  sel.innerHTML = `<option value="">전체 상태</option><option value="${RI_OPEN_STATUS_FILTER}" ${state.riStatusFilter === RI_OPEN_STATUS_FILTER ? "selected" : ""}>미종료 전체</option>${
    statuses.map((s) => `<option value="${s}" ${s === state.riStatusFilter ? "selected" : ""}>${s}</option>`).join("")
  }`;
}

function riOwnerValue(row) {
  return state.riTab === "risks" ? row.owner : row.assignee;
}

function renderRiOwnerFilter() {
  const sel = document.querySelector("#riOwnerFilter");
  if (!sel) return;
  const source = state.riTab === "risks" ? state.risks : state.issues;
  const owners = [...new Set(source.map((row) => riOwnerValue(row)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));
  const current = owners.includes(state.riOwnerFilter) ? state.riOwnerFilter : "";
  if (state.riOwnerFilter !== current) state.riOwnerFilter = current;
  sel.innerHTML = [
    `<option value="">담당자 전체</option>`,
    ...owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`),
  ].join("");
  sel.value = current;
}

function riSeverityLabel(v) {
  return `<span class="ri-sev-${v}">${v}</span>`;
}
function riStatusPill(s) {
  return `<span class="ri-status-pill ri-status-${CSS.escape(s)}">${escapeHtml(s)}</span>`;
}

function riStatusMatches(row) {
  if (!state.riStatusFilter) return true;
  if (state.riStatusFilter === RI_OPEN_STATUS_FILTER) return isOpenRiStatus(row.status);
  return row.status === state.riStatusFilter;
}

function filteredRiRows(tab = state.riTab) {
  const pid = state.riProjectFilter;
  const owner = state.riOwnerFilter;
  const rows = tab === "risks" ? state.risks : state.issues;
  return rows.filter((row) =>
    (!pid || row.project_id === pid) &&
    riStatusMatches(row) &&
    (!owner || (tab === "risks" ? row.owner === owner : row.assignee === owner))
  ).sort((a, b) => compareTableValues(a[state.riSortKey], b[state.riSortKey], state.riSortDir));
}

function riProjectName(projectId) {
  return state.projects.find((project) => project.id === projectId)?.name || "";
}

function closeRiDetailDrawer() {
  const drawer = document.querySelector("#riDetailDrawer");
  if (drawer) drawer.hidden = true;
}

function renderRiDetailDrawer(type, id) {
  const isRisk = type === "risk";
  const item = isRisk
    ? state.risks.find((row) => row.id === id)
    : state.issues.find((row) => row.id === id);
  if (!item) return;
  state.riDetail = { type, id };
  const drawer = document.querySelector("#riDetailDrawer");
  const eyebrow = document.querySelector("#riDetailEyebrow");
  const title = document.querySelector("#riDetailTitle");
  const body = document.querySelector("#riDetailBody");
  if (!drawer || !eyebrow || !title || !body) return;

  const ownerLabel = isRisk ? "담당자" : "담당자";
  const owner = isRisk ? item.owner : item.assignee;
  const severityRows = isRisk
    ? `
      <div class="ri-detail-stat"><span>심각도</span><strong class="ri-sev-${escapeHtml(item.severity)}">${escapeHtml(item.severity || "-")}</strong></div>
      <div class="ri-detail-stat"><span>발생 가능성</span><strong class="ri-sev-${escapeHtml(item.likelihood)}">${escapeHtml(item.likelihood || "-")}</strong></div>`
    : `<div class="ri-detail-stat"><span>우선순위</span><strong class="ri-sev-${escapeHtml(item.priority)}">${escapeHtml(item.priority || "-")}</strong></div>`;
  eyebrow.textContent = isRisk ? "리스크 상세" : "이슈 상세";
  title.textContent = item.title || "-";
  body.innerHTML = `
    <div class="ri-detail-summary">
      ${severityRows}
      <div class="ri-detail-stat"><span>상태</span>${riStatusPill(item.status || "-")}</div>
      <div class="ri-detail-stat"><span>목표일</span><strong>${escapeHtml(item.due_date || "-")}</strong></div>
    </div>
    <dl class="ri-detail-list">
      <dt>프로젝트</dt><dd>${escapeHtml(item.project_name || riProjectName(item.project_id) || "-")}</dd>
      <dt>${ownerLabel}</dt><dd>${escapeHtml(owner || "-")}</dd>
      <dt>WBS 코드</dt><dd>${escapeHtml(item.wbs_code || "-")}</dd>
      <dt>등록일</dt><dd>${escapeHtml(formatTimestamp(item.created_at))}</dd>
      <dt>수정일</dt><dd>${escapeHtml(formatTimestamp(item.updated_at))}</dd>
    </dl>
    <section class="ri-detail-section">
      <h3>설명</h3>
      <p>${escapeHtml(item.description || "등록된 설명이 없습니다.")}</p>
    </section>
    ${isRisk ? `
      <section class="ri-detail-section">
        <h3>대응 전략</h3>
        <p>${escapeHtml(item.mitigation || "등록된 대응 전략이 없습니다.")}</p>
      </section>` : ""}
    <div class="ri-detail-actions">
      <button class="secondary-button" type="button" data-ri-detail-go-project="${escapeHtml(item.project_id || "")}">프로젝트 보기</button>
      ${canMutateWork() && isRisk && item.status !== "Closed" ? `<button class="primary-button" type="button" data-risk-close="${escapeHtml(item.id)}">리스크 종료</button>` : ""}
      ${canMutateWork() && !isRisk && !["Resolved", "Closed"].includes(item.status) ? `<button class="primary-button" type="button" data-issue-resolve="${escapeHtml(item.id)}">이슈 해결</button>` : ""}
    </div>`;
  drawer.hidden = false;
}

function renderRiTable() {
  const isRisks = state.riTab === "risks";
  const riTabRisks = document.querySelector("#riTabRisks");
  const riTabIssues = document.querySelector("#riTabIssues");
  if (riTabRisks) riTabRisks.hidden = !isRisks;
  if (riTabIssues) riTabIssues.hidden = isRisks;

  // 탭 버튼 active
  document.querySelectorAll(".ri-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.riTab === state.riTab);
  });

  // + 버튼 토글
  const createRiskBtn = document.querySelector("#createRiskBtn");
  const createIssueBtn = document.querySelector("#createIssueBtn");
  if (createRiskBtn) createRiskBtn.style.display = isRisks ? "" : "none";
  if (createIssueBtn) createIssueBtn.style.display = isRisks ? "none" : "";

  updateSortButtons("[data-ri-sort]", state.riSortKey, state.riSortDir);

  if (isRisks) {
    const rows = filteredRiRows("risks");
    const count = document.querySelector("#riCount");
    if (count) count.textContent = `${rows.length}건`;
    const tbody = document.querySelector("#riskTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((r) => `
      <tr class="ri-click-row" data-ri-item-type="risk" data-ri-item-id="${escapeHtml(r.id)}" tabindex="0">
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.project_name || "")}</td>
        <td style="max-width:200px">${escapeHtml(r.title)}</td>
        <td>${riSeverityLabel(r.severity)}</td>
        <td>${riSeverityLabel(r.likelihood)}</td>
        <td>${escapeHtml(r.owner || "")}</td>
        <td>${riStatusPill(r.status)}</td>
        <td style="white-space:nowrap">${r.due_date || "—"}</td>
        <td>
          <button class="wbs-pro-btn-sm" data-ri-detail="risk" data-ri-id="${escapeHtml(r.id)}" type="button">상세</button>
          ${canMutateWork() ? `<button class="wbs-pro-btn-sm" data-risk-close="${escapeHtml(r.id)}" type="button" ${r.status === "Closed" ? "disabled" : ""}>종료</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">등록된 리스크가 없습니다.</td></tr>`;
  } else {
    const rows = filteredRiRows("issues");
    const count = document.querySelector("#riCount");
    if (count) count.textContent = `${rows.length}건`;
    const tbody = document.querySelector("#issueTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((r) => `
      <tr class="ri-click-row" data-ri-item-type="issue" data-ri-item-id="${escapeHtml(r.id)}" tabindex="0">
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.project_name || "")}</td>
        <td style="max-width:200px">${escapeHtml(r.title)}</td>
        <td>${riSeverityLabel(r.priority)}</td>
        <td>${escapeHtml(r.assignee || "")}</td>
        <td>${riStatusPill(r.status)}</td>
        <td style="white-space:nowrap">${r.due_date || "—"}</td>
        <td>
          <button class="wbs-pro-btn-sm" data-ri-detail="issue" data-ri-id="${escapeHtml(r.id)}" type="button">상세</button>
          ${canMutateWork() ? `<button class="wbs-pro-btn-sm" data-issue-resolve="${escapeHtml(r.id)}" type="button" ${["Resolved","Closed"].includes(r.status) ? "disabled" : ""}>해결</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">등록된 이슈가 없습니다.</td></tr>`;
  }
}

// 탭 전환
document.addEventListener("click", (e) => {
  const riNavigateBtn = e.target.closest("[data-ri-navigate]");
  if (riNavigateBtn) {
    e.preventDefault();
    navigateToRiList({
      tab: riNavigateBtn.dataset.riNavigate,
      projectId: riNavigateBtn.dataset.riProjectId || "",
      status: riNavigateBtn.dataset.riStatus || RI_OPEN_STATUS_FILTER,
    });
    return;
  }

  const riDetailBtn = e.target.closest("[data-ri-detail]");
  if (riDetailBtn) {
    renderRiDetailDrawer(riDetailBtn.dataset.riDetail, riDetailBtn.dataset.riId);
    return;
  }

  const riRow = e.target.closest("tr[data-ri-item-id]");
  if (riRow && !e.target.closest("button,a,input,select,textarea")) {
    renderRiDetailDrawer(riRow.dataset.riItemType, riRow.dataset.riItemId);
    return;
  }

  const riProjectBtn = e.target.closest("[data-ri-detail-go-project]");
  if (riProjectBtn) {
    const pid = riProjectBtn.dataset.riDetailGoProject;
    closeRiDetailDrawer();
    state.portfolioFilter = "all";
    state.portfolioOwnerFilter = "";
    renderProjects();
    applyPortalView("#portfolio", { behavior: "smooth" });
    if (pid) openProjectDrawer(pid);
    return;
  }

  const tabBtn = e.target.closest(".ri-tab");
  if (tabBtn && tabBtn.dataset.riTab) {
    state.riTab = tabBtn.dataset.riTab;
    state.riStatusFilter = "";
    state.riOwnerFilter = "";
    state.riSortKey = state.riTab === "risks" ? "due_date" : "due_date";
    state.riSortDir = "asc";
    renderRiStatusFilter();
    renderRiOwnerFilter();
    renderRiTable();
    closeRiDetailDrawer();
    return;
  }

  const riSortBtn = e.target.closest("[data-ri-sort]");
  if (riSortBtn) {
    const key = riSortBtn.dataset.riSort;
    if (state.riSortKey === key) {
      state.riSortDir = state.riSortDir === "asc" ? "desc" : "asc";
    } else {
      state.riSortKey = key;
      state.riSortDir = "asc";
    }
    renderRiTable();
    return;
  }


  // 리스크 종료 버튼
  const closeRiskBtn = e.target.closest("[data-risk-close]");
  if (closeRiskBtn) {
    const rid = closeRiskBtn.dataset.riskClose;
    closeRiskBtn.disabled = true;
    request(`/api/risks/${encodeURIComponent(rid)}`, {
      method: "PATCH", body: JSON.stringify({ status: "Closed" }),
    }).then((updated) => {
      state.risks = state.risks.map((r) => r.id === rid ? { ...r, ...updated } : r);
      renderRiTable();
      if (state.riDetail?.type === "risk" && state.riDetail.id === rid) renderRiDetailDrawer("risk", rid);
    }).catch((err) => { closeRiskBtn.disabled = false; alert(err.message); });
    return;
  }

  // 이슈 해결 버튼
  const resolveIssueBtn = e.target.closest("[data-issue-resolve]");
  if (resolveIssueBtn) {
    const iid = resolveIssueBtn.dataset.issueResolve;
    resolveIssueBtn.disabled = true;
    request(`/api/issues/${encodeURIComponent(iid)}`, {
      method: "PATCH", body: JSON.stringify({ status: "Resolved" }),
    }).then((updated) => {
      state.issues = state.issues.map((i) => i.id === iid ? { ...i, ...updated } : i);
      renderRiTable();
      if (state.riDetail?.type === "issue" && state.riDetail.id === iid) renderRiDetailDrawer("issue", iid);
    }).catch((err) => { resolveIssueBtn.disabled = false; alert(err.message); });
    return;
  }
});

document.querySelector("#riDetailClose")?.addEventListener("click", closeRiDetailDrawer);
document.querySelector("#riDetailBackdrop")?.addEventListener("click", closeRiDetailDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#riDetailDrawer")?.hidden) {
    closeRiDetailDrawer();
  }
  if ((event.key === "Enter" || event.key === " ") && event.target?.matches?.("tr[data-ri-item-id]")) {
    event.preventDefault();
    renderRiDetailDrawer(event.target.dataset.riItemType, event.target.dataset.riItemId);
  }
});

// 프로젝트·상태 필터
document.addEventListener("change", (e) => {
  if (e.target.id === "riProjectFilter") {
    state.riProjectFilter = e.target.value;
    renderRiTable();
    closeRiDetailDrawer();
  }
  if (e.target.id === "riStatusFilter") {
    state.riStatusFilter = e.target.value;
    renderRiTable();
    closeRiDetailDrawer();
  }
  if (e.target.id === "riOwnerFilter") {
    state.riOwnerFilter = e.target.value;
    renderRiTable();
    closeRiDetailDrawer();
  }
});

// 리스크 등록 다이얼로그
(function initRiskDialog() {
  const openBtn = document.querySelector("#createRiskBtn");
  const dialog  = document.querySelector("#riskDialog");
  const form    = document.querySelector("#riskForm");
  const cancelBtn = document.querySelector("#riskDialogCancel");
  const closeBtn  = document.querySelector("#riskDialogClose");
  const status    = document.querySelector("#riskFormStatus");
  if (!dialog) return;

  openBtn?.addEventListener("click", () => {
    form.reset();
    if (status) status.textContent = "";
    // 프로젝트 선택 시 필터 값 미리 세팅
    dialog.showModal();
  });
  cancelBtn?.addEventListener("click", () => dialog.close());
  closeBtn?.addEventListener("click",  () => dialog.close());

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.querySelector("#riskDialogSubmit");
    submitBtn.disabled = true;
    if (status) status.textContent = "";

    const pid = state.riProjectFilter || state.projects[0]?.id;
    if (!pid) { if (status) status.textContent = "프로젝트를 선택하세요."; submitBtn.disabled = false; return; }

    const body = {
      title:       document.querySelector("#riskTitle").value.trim(),
      description: document.querySelector("#riskDescription").value.trim(),
      severity:    document.querySelector("#riskSeverity").value,
      likelihood:  document.querySelector("#riskLikelihood").value,
      owner:       document.querySelector("#riskOwner").value.trim() || "PMO",
      mitigation:  document.querySelector("#riskMitigation").value.trim(),
      due_date:    document.querySelector("#riskDueDate").value || null,
    };
    try {
      const created = await request(`/api/projects/${encodeURIComponent(pid)}/risks`, {
        method: "POST", body: JSON.stringify(body),
      });
      const proj = state.projects.find((p) => p.id === pid);
      state.risks = [{ ...created, project_name: proj?.name || "" }, ...state.risks];
      dialog.close();
      renderRiTable();
    } catch (err) {
      if (status) status.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

// 이슈 등록 다이얼로그
(function initIssueDialog() {
  const openBtn = document.querySelector("#createIssueBtn");
  const dialog  = document.querySelector("#issueDialog");
  const form    = document.querySelector("#issueForm");
  const cancelBtn = document.querySelector("#issueDialogCancel");
  const closeBtn  = document.querySelector("#issueDialogClose");
  const status    = document.querySelector("#issueFormStatus");
  if (!dialog) return;

  openBtn?.addEventListener("click", () => {
    form.reset();
    if (status) status.textContent = "";
    dialog.showModal();
  });
  cancelBtn?.addEventListener("click", () => dialog.close());
  closeBtn?.addEventListener("click",  () => dialog.close());

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.querySelector("#issueDialogSubmit");
    submitBtn.disabled = true;
    if (status) status.textContent = "";

    const pid = state.riProjectFilter || state.projects[0]?.id;
    if (!pid) { if (status) status.textContent = "프로젝트를 선택하세요."; submitBtn.disabled = false; return; }

    const body = {
      title:       document.querySelector("#issueTitle").value.trim(),
      description: document.querySelector("#issueDescription").value.trim(),
      priority:    document.querySelector("#issuePriority").value,
      assignee:    document.querySelector("#issueAssignee").value.trim() || "PMO",
      due_date:    document.querySelector("#issueDueDate").value || null,
    };
    try {
      const created = await request(`/api/projects/${encodeURIComponent(pid)}/issues`, {
        method: "POST", body: JSON.stringify(body),
      });
      const proj = state.projects.find((p) => p.id === pid);
      state.issues = [{ ...created, project_name: proj?.name || "" }, ...state.issues];
      dialog.close();
      renderRiTable();
    } catch (err) {
      if (status) status.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
