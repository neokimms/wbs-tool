/* ══════════════════════════════════════════════════════════════════
   회의·Action Item · 프로젝트 멤버/역할
   - app.js 의 전역(state, request, escapeHtml, canMutateWork, canCollaborate,
     projectRoleOf, PROJECT_ROLE_LABELS)을 사용한다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  const mt = {
    tab: "meetings",
    projectId: "",
    meetings: [],
    actions: [],
    mine: [],
    members: [],
    workItems: [],
    issues: [],
    editingMeeting: null,
    editingAction: null,
    inited: false,
  };
  window.__mt = mt;

  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => escapeHtml(v);
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const AI_STATUS_CLASS = { "대기": "wait", "진행중": "doing", "완료": "done", "보류": "hold", "취소": "cancel", "지연": "late" };

  function toast(msg, type = "success") {
    if (typeof showAutoSyncToast === "function") showAutoSyncToast(msg, type);
  }

  function statusPill(item) {
    const st = item.display_status || item.status;
    return `<span class="mt-pill mt-st-${AI_STATUS_CLASS[st] || "wait"}">${esc(st)}</span>`;
  }

  function linkBadges(a) {
    const out = [];
    if (a.wbs_code) out.push(`<span class="mt-link mt-link-wbs" title="${esc(a.wbs_name || "")}">WBS ${esc(a.wbs_code)}</span>`);
    if (a.issue_id) out.push(`<span class="mt-link mt-link-issue" title="${esc(a.issue_title || "")}">이슈</span>`);
    if (a.meeting_id) out.push(`<span class="mt-link mt-link-meeting" title="${esc(a.meeting_title || "")}">회의</span>`);
    return out.join("") || `<span class="mt-muted">—</span>`;
  }

  /* ── 데이터 로드 ─────────────────────────────────────────────── */
  async function loadProjectContext(pid) {
    if (!pid) { mt.members = []; mt.workItems = []; mt.issues = []; return; }
    const [members, items, issues] = await Promise.all([
      request(`/api/projects/${pid}/members`).catch(() => []),
      request(`/api/projects/${pid}/work-items`).catch(() => []),
      request(`/api/issues`).catch(() => []),
    ]);
    mt.members = members || [];
    mt.workItems = (items || []).filter((i) => !["리스크", "이슈", "변경요청"].includes(i.item_type));
    mt.issues = (issues || []).filter((i) => String(i.project_id) === String(pid));
    const dl = $("#mtMemberList");
    if (dl) dl.innerHTML = mt.members.map((m) => `<option value="${esc(m.display_name || m.email)}">${esc(PROJECT_ROLE_LABELS[m.project_role] || m.project_role)}</option>`).join("");
  }

  async function loadTab() {
    const pid = mt.projectId;
    const status = $("#mtStatusFilter")?.value ?? "open";
    if (mt.tab === "mine") {
      mt.mine = await request(`/api/me/action-items?include_closed=${status === "" || status === "완료" || status === "취소"}`).catch(() => []);
      return;
    }
    if (!pid) return;
    if (mt.tab === "meetings") {
      mt.meetings = await request(`/api/projects/${pid}/meetings`).catch(() => []);
    } else {
      const q = status ? `?status=${encodeURIComponent(status)}` : "";
      mt.actions = await request(`/api/projects/${pid}/action-items${q}`).catch(() => []);
    }
  }

  /* ── 렌더링 ─────────────────────────────────────────────────── */
  function populateProjects() {
    const sel = $("#mtProjectSelect");
    if (!sel) return;
    const current = mt.projectId || sel.value || state.wbsPlanProjectId || "";
    sel.innerHTML = `<option value="">프로젝트 선택…</option>` + (state.projects || [])
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.project_role ? ` · ${esc(PROJECT_ROLE_LABELS[p.project_role] || p.project_role)}` : ""}</option>`).join("");
    if (current && (state.projects || []).some((p) => String(p.id) === String(current))) sel.value = current;
    else if (!current && state.projects?.length) sel.value = state.projects[0].id;
    mt.projectId = sel.value;
  }

  function renderSummary() {
    const box = $("#mtSummary");
    if (!box) return;
    const list = mt.tab === "mine" ? mt.mine : mt.actions;
    if (mt.tab === "meetings") {
      const open = mt.meetings.reduce((a, m) => a + (m.open_action_count || 0), 0);
      box.innerHTML = `<span>회의 <strong>${mt.meetings.length}</strong></span><span>미결 Action <strong>${open}</strong></span>`;
      return;
    }
    const overdue = list.filter((a) => a.is_overdue).length;
    const open = list.filter((a) => !["완료", "취소"].includes(a.status)).length;
    box.innerHTML = `<span>표시 <strong>${list.length}</strong></span><span>미결 <strong>${open}</strong></span><span class="${overdue ? "mt-warn" : ""}">기한 경과 <strong>${overdue}</strong></span>`;
  }

  function renderMeetingsTable() {
    if (!mt.projectId) return `<p class="empty-state">프로젝트를 선택하세요.</p>`;
    if (!mt.meetings.length) return `<p class="empty-state">등록된 회의가 없습니다. ‘＋ 회의 등록’으로 회의록과 Action Item을 함께 기록하세요.</p>`;
    return `<div class="ri-table-wrap"><table class="ri-table mt-table">
      <thead><tr><th>일자</th><th>유형</th><th>회의명</th><th>진행자</th><th>참석</th><th>Action (미결/전체)</th><th>상태</th></tr></thead>
      <tbody>${mt.meetings.map((m) => `
        <tr class="mt-row" data-meeting-id="${esc(m.id)}">
          <td>${esc(m.meeting_date || "")}</td>
          <td><span class="mt-type">${esc(m.meeting_type)}</span></td>
          <td class="mt-title-cell">${esc(m.title)}</td>
          <td>${esc(m.facilitator || "—")}</td>
          <td>${(m.attendees || []).length}명</td>
          <td><strong class="${m.open_action_count ? "mt-warn" : ""}">${m.open_action_count}</strong> / ${m.action_count}</td>
          <td>${m.status === "Final" ? '<span class="mt-pill mt-st-done">확정</span>' : '<span class="mt-pill mt-st-wait">작성중</span>'}</td>
        </tr>`).join("")}</tbody></table></div>`;
  }

  function renderActionTable(list, { showProject = false } = {}) {
    const overdueOnly = $("#mtOverdueOnly")?.checked;
    const rows = overdueOnly ? list.filter((a) => a.is_overdue) : list;
    const cnt = $("#mtCount"); if (cnt) cnt.textContent = `${rows.length}건`;
    if (!rows.length) return `<p class="empty-state">${mt.tab === "mine" ? "나에게 배정된 Action Item이 없습니다." : "Action Item이 없습니다."}</p>`;
    return `<div class="ri-table-wrap"><table class="ri-table mt-table">
      <thead><tr>${showProject ? "<th>프로젝트</th>" : ""}<th>Action Item</th><th>담당</th><th>기한</th><th>상태</th><th>우선</th><th>연결</th></tr></thead>
      <tbody>${rows.map((a) => `
        <tr class="mt-row${a.is_overdue ? " mt-row-late" : ""}" data-action-id="${esc(a.id)}">
          ${showProject ? `<td>${esc(a.project_name || "")}</td>` : ""}
          <td class="mt-title-cell">${esc(a.title)}${a.meeting_title ? `<div class="mt-sub">${esc(a.meeting_date || "")} ${esc(a.meeting_title)}</div>` : ""}</td>
          <td>${esc(a.assignee || "미지정")}</td>
          <td class="${a.is_overdue ? "mt-warn" : ""}">${esc(a.due_date || "—")}</td>
          <td>
            <select class="mt-inline-status" data-action-status="${esc(a.id)}" aria-label="상태 변경">
              ${["대기", "진행중", "완료", "보류", "취소"].map((s) => `<option ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
            ${a.is_overdue ? '<span class="mt-pill mt-st-late">지연</span>' : ""}
          </td>
          <td>${esc(a.priority)}</td>
          <td>${linkBadges(a)}</td>
        </tr>`).join("")}</tbody></table></div>`;
  }

  function renderBody() {
    const body = $("#mtBody");
    if (!body) return;
    document.querySelectorAll("#mtTabBar [data-mt-tab]").forEach((b) => {
      const on = b.dataset.mtTab === mt.tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    const fb = $("#mtFilterBar"); if (fb) fb.hidden = mt.tab === "meetings";
    const cnt = $("#mtCount"); if (cnt) cnt.textContent = "";
    const canCollab = canCollaborate(mt.projectId);
    $("#mtNewMeetingBtn").disabled = !mt.projectId || !canCollab;
    $("#mtNewActionBtn").disabled = !mt.projectId || !canCollab;
    if (mt.tab === "meetings") body.innerHTML = renderMeetingsTable();
    else if (mt.tab === "actions") body.innerHTML = mt.projectId ? renderActionTable(mt.actions) : `<p class="empty-state">프로젝트를 선택하세요.</p>`;
    else body.innerHTML = renderActionTable(mt.mine, { showProject: true });
    renderSummary();
  }

  async function refresh() {
    const body = $("#mtBody");
    if (body) body.innerHTML = `<p class="empty-state">불러오는 중…</p>`;
    await loadTab();
    renderBody();
  }

  window.renderMeetingsPanel = async function renderMeetingsPanel() {
    initOnce();
    populateProjects();
    await loadProjectContext(mt.projectId);
    await refresh();
  };

  /* ── 이벤트 ─────────────────────────────────────────────────── */
  function initOnce() {
    if (mt.inited) return;
    mt.inited = true;
    $("#mtProjectSelect")?.addEventListener("change", async (e) => {
      mt.projectId = e.target.value;
      await loadProjectContext(mt.projectId);
      await refresh();
    });
    $("#mtTabBar")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-mt-tab]");
      if (!btn) return;
      mt.tab = btn.dataset.mtTab;
      await refresh();
    });
    $("#mtStatusFilter")?.addEventListener("change", refresh);
    $("#mtOverdueOnly")?.addEventListener("change", renderBody);
    $("#mtNewMeetingBtn")?.addEventListener("click", () => openMeetingDialog(null));
    $("#mtNewActionBtn")?.addEventListener("click", () => openActionDialog(null));
    $("#mtBody")?.addEventListener("click", async (e) => {
      if (e.target.closest("select")) return;
      const mrow = e.target.closest("[data-meeting-id]");
      if (mrow) { openMeetingDialog(mrow.dataset.meetingId); return; }
      const arow = e.target.closest("[data-action-id]");
      if (arow) {
        const list = mt.tab === "mine" ? mt.mine : mt.actions;
        openActionDialog(list.find((a) => a.id === arow.dataset.actionId));
      }
    });
    $("#mtBody")?.addEventListener("change", async (e) => {
      const sel = e.target.closest("[data-action-status]");
      if (!sel) return;
      await quickStatus(sel.dataset.actionStatus, sel.value, refresh);
    });
    initMeetingDialog();
    initActionDialog();
  }

  async function quickStatus(id, status, after) {
    try {
      await request(`/api/action-items/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast(`Action Item 상태를 '${status}'(으)로 변경했습니다.`);
    } catch (err) {
      toast(err.message, "warn");
    }
    if (after) await after();
  }

  /* ── 회의 다이얼로그 ────────────────────────────────────────── */
  function wbsOptions(selected) {
    return `<option value="">— 없음 —</option>` + mt.workItems
      .map((w) => `<option value="${esc(w.code)}" ${w.code === selected ? "selected" : ""}>${esc(w.code)} ${esc(w.name)}${w.is_leaf === false ? " (상위)" : ""}</option>`).join("");
  }
  function issueOptions(selected) {
    return `<option value="">— 없음 —</option>` + mt.issues
      .map((i) => `<option value="${esc(i.id)}" ${String(i.id) === String(selected) ? "selected" : ""}>${esc(i.title)}</option>`).join("");
  }

  function aiRowHtml(a = {}) {
    return `<div class="mt-ai-row" data-ai-existing="${esc(a.id || "")}">
      <input class="mt-ai-title" placeholder="Action Item 내용" maxlength="200" value="${esc(a.title || "")}" ${a.id ? "disabled" : ""} />
      <input class="mt-ai-assignee" placeholder="담당자" list="mtMemberList" maxlength="80" value="${esc(a.assignee || "")}" ${a.id ? "disabled" : ""} />
      <input class="mt-ai-due" type="date" value="${esc(a.due_date || "")}" ${a.id ? "disabled" : ""} />
      <select class="mt-ai-wbs" ${a.id ? "disabled" : ""}>${wbsOptions(a.wbs_code)}</select>
      ${a.id ? statusPill(a) : `<button type="button" class="icon-button mt-ai-remove" aria-label="행 삭제">×</button>`}
    </div>`;
  }

  async function openMeetingDialog(meetingId) {
    const dlg = $("#meetingDialog");
    $("#meetingFormStatus").textContent = "";
    let m = null;
    if (meetingId) {
      try { m = await request(`/api/meetings/${meetingId}`); } catch (err) { toast(err.message, "warn"); return; }
    }
    mt.editingMeeting = m;
    $("#meetingDialogTitle").textContent = m ? "회의록" : "회의 등록";
    $("#mtTitle").value = m?.title || "";
    $("#mtType").value = m?.meeting_type || "정기";
    $("#mtDate").value = m?.meeting_date || todayIso();
    $("#mtTime").value = m?.start_time || "";
    $("#mtLocation").value = m?.location || "";
    $("#mtFacilitator").value = m?.facilitator || state.currentUser?.display_name || "";
    $("#mtStatus").value = m?.status || "Draft";
    $("#mtAttendees").value = (m?.attendees || []).join(", ");
    $("#mtAgenda").value = m?.agenda || "";
    $("#mtMinutes").value = m?.minutes || "";
    $("#mtDecisions").value = m?.decisions || "";
    $("#mtAiRows").innerHTML = (m?.action_items || []).map(aiRowHtml).join("") + (m ? "" : aiRowHtml());
    const pid = m?.project_id || mt.projectId;
    const canEdit = !m || canMutateWork(pid) || (m.created_by && String(m.created_by) === String(state.currentUser?.id));
    mt.meetingCanEdit = canEdit;
    dlg.querySelectorAll("#meetingForm .form-grid input, #meetingForm .form-grid textarea, #meetingForm .form-grid select")
      .forEach((el) => { el.disabled = !canEdit; });
    $("#mtAddAiRow").disabled = !canCollaborate(pid);
    $("#meetingDialogSubmit").disabled = !canEdit && !canCollaborate(pid);
    $("#meetingDeleteBtn").hidden = !(m && canMutateWork(pid));
    dlg.showModal();
  }

  function initMeetingDialog() {
    const dlg = $("#meetingDialog");
    const close = () => dlg.close();
    $("#meetingDialogClose")?.addEventListener("click", close);
    $("#meetingDialogCancel")?.addEventListener("click", close);
    $("#mtAddAiRow")?.addEventListener("click", () => $("#mtAiRows").insertAdjacentHTML("beforeend", aiRowHtml()));
    $("#mtAiRows")?.addEventListener("click", (e) => {
      const b = e.target.closest(".mt-ai-remove");
      if (b) b.closest(".mt-ai-row").remove();
    });
    $("#meetingDeleteBtn")?.addEventListener("click", async () => {
      const m = mt.editingMeeting;
      if (!m || !window.confirm("회의를 삭제할까요? (기록은 보존되며 목록에서 숨겨집니다)")) return;
      try {
        await request(`/api/meetings/${m.id}`, { method: "DELETE" });
        dlg.close(); toast("회의를 삭제했습니다."); await refresh();
      } catch (err) { $("#meetingFormStatus").textContent = err.message; }
    });
    $("#meetingForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#meetingFormStatus");
      const newAis = [...document.querySelectorAll("#mtAiRows .mt-ai-row")]
        .filter((r) => !r.dataset.aiExisting)
        .map((r) => ({
          title: r.querySelector(".mt-ai-title").value.trim(),
          assignee: r.querySelector(".mt-ai-assignee").value.trim() || null,
          due_date: r.querySelector(".mt-ai-due").value || null,
          wbs_code: r.querySelector(".mt-ai-wbs").value || null,
        }))
        .filter((a) => a.title);
      const payload = {
        title: $("#mtTitle").value.trim(),
        meeting_type: $("#mtType").value,
        meeting_date: $("#mtDate").value || null,
        start_time: $("#mtTime").value.trim() || null,
        location: $("#mtLocation").value.trim() || null,
        facilitator: $("#mtFacilitator").value.trim() || null,
        attendees: $("#mtAttendees").value.split(",").map((x) => x.trim()).filter(Boolean),
        agenda: $("#mtAgenda").value,
        minutes: $("#mtMinutes").value,
        decisions: $("#mtDecisions").value,
        status: $("#mtStatus").value,
      };
      if (!payload.title) { status.textContent = "회의명은 필수입니다."; return; }
      $("#meetingDialogSubmit").disabled = true;
      try {
        const m = mt.editingMeeting;
        if (m) {
          if (mt.meetingCanEdit) await request(`/api/meetings/${m.id}`, { method: "PATCH", body: JSON.stringify(payload) });
          for (const ai of newAis) {
            await request(`/api/projects/${m.project_id}/action-items?meeting_id=${m.id}`, { method: "POST", body: JSON.stringify(ai) });
          }
        } else {
          await request(`/api/projects/${mt.projectId}/meetings`, { method: "POST", body: JSON.stringify({ ...payload, action_items: newAis }) });
        }
        dlg.close();
        toast(`회의를 저장했습니다.${newAis.length ? ` Action Item ${newAis.length}건 등록` : ""}`);
        await refresh();
        if (state.pdTab === "meetings" && state.projectDetail && typeof renderProjectDetailBody === "function") renderProjectDetailBody();
      } catch (err) {
        status.textContent = err.message;
      } finally {
        $("#meetingDialogSubmit").disabled = false;
      }
    });
  }

  /* ── Action Item 다이얼로그 ─────────────────────────────────── */
  async function openActionDialog(a) {
    const dlg = $("#actionItemDialog");
    $("#actionItemFormStatus").textContent = "";
    const pid = a?.project_id || mt.projectId;
    if (a && String(a.project_id) !== String(mt.projectId)) await loadProjectContext(a.project_id);
    mt.editingAction = a || null;
    $("#actionItemDialogTitle").textContent = a ? "Action Item" : "Action Item 등록";
    $("#aiTitle").value = a?.title || "";
    $("#aiAssignee").value = a?.assignee || "";
    $("#aiDueDate").value = a?.due_date || "";
    $("#aiStatus").value = a?.status || "대기";
    $("#aiPriority").value = a?.priority || "보통";
    $("#aiWbsCode").innerHTML = wbsOptions(a?.wbs_code);
    $("#aiIssueId").innerHTML = issueOptions(a?.issue_id);
    $("#aiDescription").value = a?.description || "";
    $("#aiComment").value = "";
    const comments = a?.metadata?.comments || [];
    $("#aiMetaInfo").innerHTML = a ? `
      <div class="mt-sub">작성 ${esc(a.created_by_name || "—")} · ${esc((a.created_at || "").slice(0, 10))}${a.meeting_title ? ` · 회의: ${esc(a.meeting_title)}` : ""}</div>
      ${comments.length ? `<ul class="mt-comments">${comments.slice(-5).map((c) => `<li><b>${esc(c.author || "")}</b> ${esc(c.text)} <span class="mt-muted">${esc((c.ts || "").slice(0, 16).replace("T", " "))}</span></li>`).join("")}</ul>` : ""}` : "";
    const isAssignee = a && (a.assignee_user_id === state.currentUser?.id ||
      (a.assignee && [state.currentUser?.display_name, state.currentUser?.email].includes(a.assignee)));
    const isAuthor = a && a.created_by === state.currentUser?.id;
    const full = !a ? canCollaborate(pid) : (canMutateWork(pid) || isAuthor);
    ["#aiTitle", "#aiAssignee", "#aiDueDate", "#aiPriority", "#aiWbsCode", "#aiIssueId", "#aiDescription"].forEach((s) => { $(s).disabled = !full; });
    $("#aiStatus").disabled = !(full || isAssignee);
    $("#aiComment").disabled = !(full || isAssignee) || !a;
    $("#actionItemDialogSubmit").disabled = !(full || isAssignee);
    $("#actionItemDeleteBtn").hidden = !(a && canMutateWork(pid));
    dlg.showModal();
  }

  function initActionDialog() {
    const dlg = $("#actionItemDialog");
    const close = () => dlg.close();
    $("#actionItemDialogClose")?.addEventListener("click", close);
    $("#actionItemDialogCancel")?.addEventListener("click", close);
    $("#actionItemDeleteBtn")?.addEventListener("click", async () => {
      const a = mt.editingAction;
      if (!a || !window.confirm("Action Item을 삭제할까요?")) return;
      try { await request(`/api/action-items/${a.id}`, { method: "DELETE" }); dlg.close(); toast("삭제했습니다."); await refresh(); }
      catch (err) { $("#actionItemFormStatus").textContent = err.message; }
    });
    $("#actionItemForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = mt.editingAction;
      const st = $("#actionItemFormStatus");
      const full = !$("#aiTitle").disabled;
      let payload = { status: $("#aiStatus").value };
      if (full) {
        payload = {
          ...payload,
          title: $("#aiTitle").value.trim(),
          assignee: $("#aiAssignee").value.trim() || null,
          due_date: $("#aiDueDate").value || null,
          priority: $("#aiPriority").value,
          wbs_code: $("#aiWbsCode").value || null,
          issue_id: $("#aiIssueId").value || null,
          description: $("#aiDescription").value,
        };
        if (!payload.title) { st.textContent = "내용은 필수입니다."; return; }
      }
      const comment = $("#aiComment").value.trim();
      if (a && comment) payload.comment = comment;
      try {
        if (a) await request(`/api/action-items/${a.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        else await request(`/api/projects/${mt.projectId}/action-items`, { method: "POST", body: JSON.stringify(payload) });
        dlg.close();
        toast(a ? "Action Item을 수정했습니다." : "Action Item을 등록했습니다.");
        await refresh();
        if (typeof renderWorkboardMyActions === "function" && document.body.dataset.portalView === "workboard") renderWorkboardMyActions();
      } catch (err) { st.textContent = err.message; }
    });
  }

  /* ── 작업 현황 > 내 작업: 내 Action Item ───────────────────── */
  window.renderWorkboardMyActions = async function renderWorkboardMyActions() {
    const box = $("#workboardMyActions");
    if (!box) return;
    initOnce();
    let items = [];
    try { items = await request("/api/me/action-items"); } catch { items = []; }
    mt.mine = items;
    if (!items.length) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    const overdue = items.filter((a) => a.is_overdue).length;
    box.innerHTML = `
      <div class="mt-my-head">
        <strong>내 Action Item</strong>
        <span class="mt-muted">미결 ${items.length}건${overdue ? ` · <span class="mt-warn">기한 경과 ${overdue}건</span>` : ""}</span>
        <a href="#meetings" class="mt-more" data-mt-goto-mine>전체 보기 →</a>
      </div>
      <ul class="mt-my-list">${items.slice(0, 6).map((a) => `
        <li class="${a.is_overdue ? "mt-row-late" : ""}">
          <span class="mt-my-title">${esc(a.title)}</span>
          <span class="mt-muted">${esc(a.project_name || "")}${a.wbs_code ? ` · WBS ${esc(a.wbs_code)}` : ""}</span>
          <span class="${a.is_overdue ? "mt-warn" : "mt-muted"}">${esc(a.due_date || "기한 없음")}</span>
          <select class="mt-inline-status" data-my-action-status="${esc(a.id)}" aria-label="상태 변경">
            ${["대기", "진행중", "완료", "보류"].map((s) => `<option ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </li>`).join("")}</ul>`;
    box.querySelectorAll("[data-my-action-status]").forEach((sel) => sel.addEventListener("change", () =>
      quickStatus(sel.dataset.myActionStatus, sel.value, renderWorkboardMyActions)));
    box.querySelector("[data-mt-goto-mine]")?.addEventListener("click", () => { mt.tab = "mine"; });
  };

  /* ── 프로젝트 상세 > 회의·Action 탭 ──────────────────────────── */
  window.renderPdMeetingsTab = async function renderPdMeetingsTab(body, d) {
    const pid = d.project.id;
    body.innerHTML = `<p class="empty-state">불러오는 중…</p>`;
    const [meetings, actions] = await Promise.all([
      request(`/api/projects/${pid}/meetings`).catch(() => []),
      request(`/api/projects/${pid}/action-items?status=open`).catch(() => []),
    ]);
    const overdue = actions.filter((a) => a.is_overdue).length;
    body.innerHTML = `
      <div class="mt-pd-head">
        <span>회의 <strong>${meetings.length}</strong></span>
        <span>미결 Action <strong>${actions.length}</strong></span>
        <span class="${overdue ? "mt-warn" : ""}">기한 경과 <strong>${overdue}</strong></span>
        <span class="u-flex-1"></span>
        <button class="primary-button mt-small" type="button" data-pd-open-meetings>회의·Action 화면에서 관리 →</button>
      </div>
      <h4 class="mt-pd-sub">최근 회의</h4>
      ${meetings.length ? `<table class="ri-table"><thead><tr><th>일자</th><th>회의명</th><th>미결/전체</th></tr></thead><tbody>
        ${meetings.slice(0, 5).map((m) => `<tr><td>${esc(m.meeting_date)}</td><td>${esc(m.title)}</td><td>${m.open_action_count}/${m.action_count}</td></tr>`).join("")}
      </tbody></table>` : `<p class="empty-state">회의 기록이 없습니다.</p>`}
      <h4 class="mt-pd-sub">미결 Action Item</h4>
      ${actions.length ? `<table class="ri-table"><thead><tr><th>내용</th><th>담당</th><th>기한</th><th>상태</th><th>연결</th></tr></thead><tbody>
        ${actions.slice(0, 15).map((a) => `<tr class="${a.is_overdue ? "mt-row-late" : ""}"><td>${esc(a.title)}</td><td>${esc(a.assignee || "미지정")}</td><td>${esc(a.due_date || "—")}</td><td>${statusPill(a)}</td><td>${linkBadges(a)}</td></tr>`).join("")}
      </tbody></table>` : `<p class="empty-state">미결 Action Item이 없습니다.</p>`}`;
    body.querySelector("[data-pd-open-meetings]")?.addEventListener("click", () => {
      mt.projectId = pid; mt.tab = "actions";
      applyPortalView("#meetings", { updateHistory: true });
    });
  };

  /* ── 프로젝트 상세 > 멤버·역할 탭 ────────────────────────────── */
  window.renderPdMembersTab = async function renderPdMembersTab(body, d) {
    const pid = d.project.id;
    const myRole = d.project_role;
    const canManage = ["admin", "pm"].includes(myRole);
    body.innerHTML = `<p class="empty-state">불러오는 중…</p>`;
    const [members, rolesRes, candidates] = await Promise.all([
      request(`/api/projects/${pid}/members`).catch(() => []),
      request(`/api/project-roles`).catch(() => ({ roles: [] })),
      canManage ? request(`/api/projects/${pid}/members/candidates`).catch(() => []) : Promise.resolve([]),
    ]);
    const roles = rolesRes.roles || [];
    const assignable = roles.filter((r) => myRole === "admin" || r.key !== "admin");
    const roleOpts = (cur) => roles.map((r) => `<option value="${r.key}" ${r.key === cur ? "selected" : ""} ${assignable.some((x) => x.key === r.key) ? "" : "disabled"}>${esc(r.label)}</option>`).join("");
    const legend = roles.map((r) => `<li><b>${esc(r.label)}</b> — ${[r.can_edit_wbs ? "WBS·리스크 편집" : "", r.can_manage_members ? "멤버 관리" : "", r.can_collaborate ? "회의·Action·이슈 등록" : "", (!r.can_edit_wbs && !r.can_collaborate) ? "읽기 전용" : ""].filter(Boolean).join(" · ") || "담당 작업 진척 입력"}</li>`).join("");
    body.innerHTML = `
      <div class="mt-pd-head"><span>내 역할 <strong>${esc(PROJECT_ROLE_LABELS[myRole] || myRole)}</strong></span><span>멤버 <strong>${members.length}</strong></span></div>
      <table class="ri-table"><thead><tr><th>이름</th><th>이메일</th><th>프로젝트 역할</th><th></th></tr></thead><tbody>
        ${members.map((m) => {
          const locked = !canManage || (myRole === "pm" && m.project_role === "admin");
          return `<tr>
            <td>${esc(m.display_name || "")}</td><td>${esc(m.email || "")}</td>
            <td>${locked ? esc(PROJECT_ROLE_LABELS[m.project_role] || m.project_role) : `<select data-member-role="${esc(m.id)}">${roleOpts(m.project_role)}</select>`}</td>
            <td>${locked ? "" : `<button class="secondary-button mt-small mt-danger" type="button" data-member-remove="${esc(m.id)}">제외</button>`}</td>
          </tr>`; }).join("")}
      </tbody></table>
      ${canManage ? `<div class="mt-add-member">
        <select id="pdMemberCandidate"><option value="">추가할 사용자…</option>${candidates.map((c) => `<option value="${esc(c.id)}">${esc(c.display_name || c.email)} (${esc(c.email)})</option>`).join("")}</select>
        <select id="pdMemberRole">${assignable.map((r) => `<option value="${r.key}" ${r.key === "member" ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select>
        <button class="primary-button mt-small" type="button" id="pdMemberAdd">멤버 추가</button>
        <span class="form-status" id="pdMemberStatus"></span>
      </div>` : `<p class="mt-muted">멤버 관리는 프로젝트 관리자 또는 PM만 할 수 있습니다.</p>`}
      <ul class="mt-role-legend">${legend}</ul>`;
    const st = () => body.querySelector("#pdMemberStatus");
    const rerender = () => renderPdMembersTab(body, d);
    body.querySelectorAll("[data-member-role]").forEach((sel) => sel.addEventListener("change", async () => {
      try { await request(`/api/projects/${pid}/members/${sel.dataset.memberRole}`, { method: "PATCH", body: JSON.stringify({ project_role: sel.value }) }); toast("역할을 변경했습니다."); }
      catch (err) { toast(err.message, "warn"); }
      rerender();
    }));
    body.querySelectorAll("[data-member-remove]").forEach((b) => b.addEventListener("click", async () => {
      if (!window.confirm("이 멤버를 프로젝트에서 제외할까요?")) return;
      try { await request(`/api/projects/${pid}/members/${b.dataset.memberRemove}`, { method: "DELETE" }); toast("멤버를 제외했습니다."); }
      catch (err) { toast(err.message, "warn"); }
      rerender();
    }));
    body.querySelector("#pdMemberAdd")?.addEventListener("click", async () => {
      const uid = body.querySelector("#pdMemberCandidate").value;
      if (!uid) { st().textContent = "사용자를 선택하세요."; return; }
      try {
        await request(`/api/projects/${pid}/members`, { method: "POST", body: JSON.stringify({ user_id: uid, project_role: body.querySelector("#pdMemberRole").value }) });
        toast("멤버를 추가했습니다."); rerender();
      } catch (err) { st().textContent = err.message; }
    });
  };
})();
