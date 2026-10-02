/* AX WBS 포털 — 리스크·이슈
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ── P2-02: 리스크·이슈 트래킹 ─────────────────────────────────── */

function renderRisksPanel() {
  if (document.body.dataset.portalView !== "risks") return;
  renderRiProjectFilter();
  renderRiStatusFilter();
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
  sel.innerHTML = `<option value="">전체 상태</option>${
    statuses.map((s) => `<option value="${s}" ${s === state.riStatusFilter ? "selected" : ""}>${s}</option>`).join("")
  }`;
}

function riSeverityLabel(v) {
  return `<span class="ri-sev-${v}">${v}</span>`;
}
function riStatusPill(s) {
  return `<span class="ri-status-pill ri-status-${CSS.escape(s)}">${escapeHtml(s)}</span>`;
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

  const pid = state.riProjectFilter;
  const st = state.riStatusFilter;

  if (isRisks) {
    const rows = state.risks.filter((r) =>
      (!pid || r.project_id === pid) && (!st || r.status === st)
    );
    const count = document.querySelector("#riCount");
    if (count) count.textContent = `${rows.length}건`;
    const tbody = document.querySelector("#riskTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.project_name || "")}</td>
        <td style="max-width:200px">${escapeHtml(r.title)}</td>
        <td>${riSeverityLabel(r.severity)}</td>
        <td>${riSeverityLabel(r.likelihood)}</td>
        <td>${escapeHtml(r.owner || "")}</td>
        <td>${riStatusPill(r.status)}</td>
        <td class="u-nowrap">${r.due_date || "—"}</td>
        <td>
          ${canMutateWork() ? `<button class="wbs-pro-btn-sm" data-risk-close="${escapeHtml(r.id)}" type="button" ${r.status === "Closed" ? "disabled" : ""}>종료</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">등록된 리스크가 없습니다.</td></tr>`;
  } else {
    const rows = state.issues.filter((r) =>
      (!pid || r.project_id === pid) && (!st || r.status === st)
    );
    const count = document.querySelector("#riCount");
    if (count) count.textContent = `${rows.length}건`;
    const tbody = document.querySelector("#issueTableBody");
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.project_name || "")}</td>
        <td style="max-width:200px">${escapeHtml(r.title)}</td>
        <td>${riSeverityLabel(r.priority)}</td>
        <td>${escapeHtml(r.assignee || "")}</td>
        <td>${riStatusPill(r.status)}</td>
        <td class="u-nowrap">${r.due_date || "—"}</td>
        <td>
          ${canMutateWork() ? `<button class="wbs-pro-btn-sm" data-issue-resolve="${escapeHtml(r.id)}" type="button" ${["Resolved","Closed"].includes(r.status) ? "disabled" : ""}>해결</button>` : ""}
        </td>
      </tr>`).join("") : `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">등록된 이슈가 없습니다.</td></tr>`;
  }
}

// 탭 전환
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".ri-tab");
  if (tabBtn && tabBtn.dataset.riTab) {
    state.riTab = tabBtn.dataset.riTab;
    state.riStatusFilter = "";
    renderRiStatusFilter();
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
    }).catch((err) => { resolveIssueBtn.disabled = false; alert(err.message); });
    return;
  }
});

// 프로젝트·상태 필터
document.addEventListener("change", (e) => {
  if (e.target.id === "riProjectFilter") {
    state.riProjectFilter = e.target.value;
    renderRiTable();
  }
  if (e.target.id === "riStatusFilter") {
    state.riStatusFilter = e.target.value;
    renderRiTable();
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
