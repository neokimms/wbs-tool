/* AX WBS 포털 — 전체 데이터 로드·프로젝트/사용자/승인/가져오기/동기화 액션·파일 다운로드
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

function renderAll() {
  renderAuthState();
  renderNotifBell();
  renderMetrics();
  renderTemplates();
  renderTemplateSelect();
  renderImportProjectSelect();
  renderProjects();
  renderProjectPlan();
  renderApprovals();
  renderImportPreview();
  renderImportDiff();
  renderApplyButton();
  renderImportHistory();
  renderTemplateVersions();
  renderProjectTemplateSelect();
  // Sync 패널은 설정 > OpenProject 탭이 활성일 때만 렌더링
  if (state.settingsTab === "openproject") {
    renderSyncProjectSelect();
    renderSyncPanel();
    renderSyncRuns();
    renderSyncedProjectsList();
  }
  if (state.settingsTab === "approvals") renderSettingsApprovals();
  renderOperationsPanel();
  renderUsersPanel();
  renderAuditPanel();
  renderSettingsPanel();
  renderWbsPlan();
  renderOpViewProjectSelect();
  renderGuidePanel();
  renderRisksPanel();
}

async function loadData() {
  try {
    const [dashboard, templates, projects, approvals, pmPreflight, operationsHealth, importJobs, users, userGroups, auditEvents, settings, risks, issues] = await Promise.all([
      request("/api/dashboard"),
      request("/api/templates"),
      request("/api/projects"),
      request("/api/approvals"),
      request("/api/pm-engine/preflight"),
      canAccessOperations() ? request("/api/operations/health") : Promise.resolve(restrictedOperationsHealth),
      request("/api/imports?limit=8"),
      canManageUsers() ? request("/api/users") : Promise.resolve([]),
      canManageUsers() ? request("/api/user-groups") : Promise.resolve([]),
      canViewAudit() ? request("/api/audit-events?limit=30") : Promise.resolve([]),
      canViewSettings() ? request("/api/settings") : Promise.resolve(fallbackSettings),
      request("/api/risks").catch(() => []),
      request("/api/issues").catch(() => []),
    ]);

    state.dashboard = dashboard;
    state.templates = templates;
    state.projects = projects;
    state.approvals = approvals;
    state.pmPreflight = pmPreflight;
    // 프로젝트 목록 로드 후 회의·Action 화면이 열려 있으면 프로젝트 선택지를 갱신
    if (document.body.dataset.portalView === "meetings" && typeof renderMeetingsPanel === "function") {
      setTimeout(() => renderMeetingsPanel(), 0);
    }
    state.operationsHealth = operationsHealth;
    state.importJobs = importJobs;
    state.risks = risks;
    state.issues = issues;
    loadNotifications();
    startNotifPolling();
    state.users = users;
    state.userGroups = userGroups;
    state.auditEvents = auditEvents;
    state.settings = settings;
    try {
      state.templateVersions = await request(`/api/templates/${encodeURIComponent(defaultTemplateKey())}/versions?limit=8`);
    } catch (error) {
      state.templateVersions = [];
    }
    state.selectedImportJobId = importJobs.some((job) => job.id === state.selectedImportJobId)
      ? state.selectedImportJobId
      : null;
    state.apiConnected = true;
    state.selectedProjectId = projects.some((project) => project.id === state.selectedProjectId)
      ? state.selectedProjectId
      : projects[0]?.id || null;
    if (state.selectedProjectId) {
      await loadProjectPlan(state.selectedProjectId, { render: false });
    } else {
      state.projectPlan = null;
    }
    const currentSyncProjectId = document.querySelector("#syncProjectSelect")?.value;
    const syncProjectId = state.userSelectedSyncProject && projects.some((project) => project.id === currentSyncProjectId)
      ? currentSyncProjectId
      : projects[0]?.id || null;
    if (syncProjectId) {
      await loadSyncRuns(syncProjectId, { render: false });
    } else {
      state.syncRuns = [];
    }
  } catch (error) {
    state.apiConnected = false;
    state.projects = state.projects.length ? state.projects : fallbackProjects;
    state.dashboard.metrics.projects = state.projects.length;
    state.dashboard.metrics.templates = state.templates.length;
    state.dashboard.metrics.pending_approvals = state.approvals.filter((approval) => approval.status === "Pending").length;
    state.operationsHealth = {
      ...fallbackOperationsHealth,
      status: "critical",
      checks: [{ key: "operations", label: "운영 상태", status: "fail", message: error.message }],
    };
    state.syncRuns = [];
    state.importJobs = [];
    state.templateVersions = [];
    state.users = [];
    state.userGroups = [];
    state.auditEvents = [];
    state.settings = fallbackSettings;
  }

  renderAll();
}

function openProjectDialog() {
  const dialog = document.querySelector("#projectDialog");
  document.querySelector("#projectForm").reset();
  document.querySelector("#projectFormStatus").textContent = "";
  document.querySelector("#projectStartInput").value = new Date().toISOString().slice(0, 10);
  renderProjectTemplateSelect(false);
  const modeSelector = document.querySelector("#projectDeliveryModeInput");
  if (modeSelector) modeSelector.value = projectOperationPolicy().default_delivery_mode || "waterfall";
  dialog.showModal();
  document.querySelector("#projectNameInput").focus();
}

function closeProjectDialog() {
  document.querySelector("#projectDialog").close();
}

async function createProject(event) {
  event.preventDefault();
  const submitButton = document.querySelector("#projectSubmitButton");
  const status = document.querySelector("#projectFormStatus");
  const payload = {
    name: document.querySelector("#projectNameInput").value.trim(),
    template_key: document.querySelector("#projectTemplateSelect").value,
    owner: document.querySelector("#projectOwnerInput").value.trim(),
    start_date: document.querySelector("#projectStartInput").value || null,
    delivery_mode: document.querySelector("#projectDeliveryModeInput")?.value || "waterfall",
    end_date: document.querySelector("#projectEndInput")?.value || null,
    description: document.querySelector("#projectDescInput")?.value.trim() || null,
    client_name: document.querySelector("#projectClientInput")?.value.trim() || null,
    budget: document.querySelector("#projectBudgetInput")?.value.trim() || null,
    project_manager: document.querySelector("#projectManagerInput")?.value.trim() || null,
  };

  submitButton.disabled = true;
  status.textContent = "";

  try {
    const project = await request("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.projects = [project, ...state.projects.filter((item) => item.name !== project.name)];
    state.dashboard.metrics.projects += 1;
    state.selectedProjectId = project.id;
    state.userSelectedSyncProject = false;
    document.querySelector("#projectForm").reset();
    closeProjectDialog();
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function createPortalUser(event) {
  event.preventDefault();
  if (!canManageUsers()) return;

  const submitButton = document.querySelector("#userSubmitButton");
  const status = document.querySelector("#userFormStatus");
  const payload = {
    email: document.querySelector("#userEmailInput").value.trim(),
    display_name: document.querySelector("#userNameInput").value.trim(),
    role: document.querySelector("#userRoleInput").value,
    group_id: document.querySelector("#userGroupInput").value,
    password: document.querySelector("#userPasswordInput").value,
    status: "Active",
  };

  submitButton.disabled = true;
  status.textContent = "";
  if (!payload.group_id) {
    status.textContent = "소속 그룹을 선택하세요.";
    submitButton.disabled = false;
    return;
  }

  try {
    await request("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    document.querySelector("#userCreateForm").reset();
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function updatePortalUser(row) {
  if (!canManageUsers() || !row?.dataset.userId) return;

  const status = document.querySelector("#userFormStatus");
  const passwordInput = row.querySelector('[data-user-field="password"]');
  const payload = {
    role: row.querySelector('[data-user-field="role"]').value,
    status: row.querySelector('[data-user-field="status"]').value,
    group_id: row.querySelector('[data-user-field="group_id"]').value,
  };
  if (!payload.group_id) {
    status.textContent = "사용자 소속 그룹을 선택하세요.";
    return;
  }
  if (passwordInput.value) {
    payload.password = passwordInput.value;
  }

  status.textContent = "";
  try {
    await request(`/api/users/${encodeURIComponent(row.dataset.userId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    passwordInput.value = "";
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function revokePortalUserSessions(row) {
  if (!canManageUsers() || !row?.dataset.userId) return;
  const status = document.querySelector("#userFormStatus");
  status.textContent = "";
  try {
    await request(`/api/users/${encodeURIComponent(row.dataset.userId)}/sessions/revoke`, {
      method: "POST",
    });
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function loadProjectPlan(projectId, options = {}) {
  if (!projectId) return;
  const shouldRender = options.render !== false;
  if (state.selectedProjectId && state.selectedProjectId !== projectId) {
    resetProjectPlanFilters();
  }
  state.selectedProjectId = projectId;

  try {
    state.projectPlan = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-plan`);
    state.syncDetail = state.syncDetail?.project?.id === projectId ? state.syncDetail : null;
  } catch (error) {
    state.projectPlan = {
      project: state.projects.find((project) => project.id === projectId),
      rows: [],
      summary: null,
      openproject: null,
      error: error.message,
    };
  }

  if (shouldRender) renderAll();
}

async function loadSyncRuns(projectId, options = {}) {
  if (!projectId) {
    state.syncRuns = [];
    return;
  }
  const shouldRender = options.render !== false;

  try {
    state.syncRuns = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-runs?limit=6`);
  } catch (error) {
    state.syncRuns = [
      {
        status: "Error",
        mode: "history",
        total_rows: 0,
        pending_work_packages: 0,
        created_work_packages: 0,
        completed_at: new Date().toISOString(),
        error: { message: error.message },
      },
    ];
  }

  if (shouldRender) renderAll();
}

async function requestProjectApproval(projectId) {
  if (!projectId) return;

  const project = state.projects.find((p) => p.id === projectId);
  const requester = state.currentUser?.display_name || state.currentUser?.email || "PMO";

  try {
    const approval = await request("/api/approvals", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        requester,
        reviewer: "PMO Lead",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        auto_approve_internal: false,   // 수동 승인: Pending 상태로 생성
        metadata: {
          source: "wbs-portal",
          approval_scope: "manual",
          project_name: project?.name,
        },
      }),
    });
    state.approvals = [approval, ...state.approvals.filter((item) => item.id !== approval.id)];
    await loadData();
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  }
}

async function decideApproval(approvalId, action) {
  if (!approvalId) return;

  /* 반려 시 코멘트 필수 강제 */
  let comment = action === "approve" ? "PMO 포털에서 승인" : "";
  if (action === "reject") {
    comment = window.prompt("반려 사유를 입력하세요 (필수):", "");
    if (comment === null) return;                 // 취소
    if (!comment.trim()) {
      alert("반려 사유는 필수입니다. 입력 후 다시 시도하세요.");
      return;
    }
  }

  try {
    const approval = await request(`/api/approvals/${encodeURIComponent(approvalId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({
        reviewer: state.currentUser?.display_name || "PMO Lead",
        comment,
      }),
    });

    state.approvals = state.approvals.map((item) => (item.id === approval.id ? approval : item));

    // 승인 완료 후 자동 동기화 결과 알림
    if (action === "approve" && approval.auto_sync) {
      const sync = approval.auto_sync;
      if (sync.triggered && !sync.error) {
        const msg = `✅ 승인 완료 + OpenProject 자동 동기화 (${sync.created ?? 0}개 작업패키지 생성)`;
        showAutoSyncToast(msg, "success");
      } else if (sync.triggered && sync.error) {
        showAutoSyncToast(`✅ 승인 완료 (OP 자동 동기화 실패: ${sync.error.slice(0,60)})`, "warn");
      } else if (!sync.triggered) {
        // OP 미연결 시 → 토스트 없음 (정상)
      }
    }

    await loadData();
  } catch (error) {
    renderImportResult({
      status: "Rejected", accepted_rows: 0, rejected_rows: 1,
      errors: [{ message: error.message }], warnings: [], rows: [],
    });
  }
}

/* 자동 동기화 결과 토스트 알림 */
function showAutoSyncToast(message, type = "success") {
  const existing = document.querySelector(".auto-sync-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `auto-sync-toast auto-sync-toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:200;
    padding:12px 18px; border-radius:8px; font-size:0.84rem; font-weight:600;
    max-width:380px; box-shadow:0 8px 24px rgba(0,0,0,0.15);
    animation:slideInToast 0.25s ease;
    background:${type === "success" ? "#dcfce7" : "#fef3c7"};
    color:${type === "success" ? "#15803d" : "#92400e"};
    border:1px solid ${type === "success" ? "#bbf7d0" : "#fde68a"};
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function loadImportJob(jobId) {
  if (!jobId) return;

  try {
    const result = await request(`/api/imports/${encodeURIComponent(jobId)}`);
    renderImportResult(result);
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  }
}

function selectedTemplate() {
  const selectedKey = document.querySelector("#templateSelect").value;
  return state.templates.find((template) => template.key === selectedKey) || state.templates[0] || fallbackTemplates[0];
}

function renderImportResult(result) {
  state.pendingImportJobId = result.status === "Preview" && result.id ? result.id : null;
  state.selectedImportJobId = result.id || null;
  upsertImportJob(result);
  document.querySelector("#importStatus").textContent = statusLabel(result.status);
  document.querySelector("#importStatus").className = `status-pill ${statusClass(result.status)}`;
  document.querySelector("#acceptedRows").textContent = result.accepted_rows;
  document.querySelector("#rejectedRows").textContent = result.rejected_rows;

  const issues = [...(result.errors || []), ...(result.warnings || [])];
  document.querySelector("#importIssues").innerHTML = issues.length
    ? issues.map((issue) => `<li>${escapeHtml(importIssueMessageLabel(issue.message))}</li>`).join("")
    : "<li>계층, 일정, 가중치 검증 통과</li>";

  state.importPreview = result.rows || [];
  state.importDiffRows = result.diff_rows || [];
  document.querySelector("#importErrorWorkbookButton").disabled = !result.id || !issues.length;
  document.querySelector("#importErrorWorkbookButton").dataset.importJobId = result.id || "";
  renderImportPreview();
  renderImportDiff();
  renderApplyButton();
  renderImportHistory();
}

/* ── 인증 포함 파일 다운로드 공통 헬퍼 ───────────────
   모든 바이너리 다운로드(Excel·Word·CSV·백업)는 이 함수만 사용한다. */
async function downloadFile(pathOrUrl, filename) {
  const url = /^https?:/.test(pathOrUrl) ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${state.authToken}` } });
  if (!resp.ok) {
    if (resp.status === 401) clearSession("세션이 만료되었습니다. 다시 로그인해 주세요.");
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : `다운로드 실패 (${resp.status})`);
  }
  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

async function authenticatedDownload(url, filename) {
  try {
    await downloadFile(url, filename);
  } catch (error) {
    alert(`Excel 다운로드 실패: ${error.message}`);
  }
}


/* WBS 계획 패널용: 선택 프로젝트의 템플릿 Excel 다운로드 */
function downloadWbsPlanExcel() {
  const project = state.projects.find((p) => p.id === state.wbsPlanProjectId);
  if (!project) { alert("프로젝트를 먼저 선택하세요."); return; }
  const templateKey = project.template_key || "si-standard";
  const template    = state.templates.find((t) => t.key === templateKey);
  const filename    = `${project.name}_WBS양식.xlsx`;
  authenticatedDownload(
    `${API_BASE}/api/templates/${encodeURIComponent(templateKey)}/excel`,
    filename,
  );
}

/* WBS 계획 패널용: Excel 업로드 → 편집기 행 채우기 */
async function uploadWbsPlanExcel(event) {
  const [file] = event.target.files;
  if (!file) return;

  const project  = state.projects.find((p) => p.id === state.wbsPlanProjectId);
  const statusEl = document.querySelector("#wbsPlanStatus");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("template_key",  project?.template_key || "uploaded");
  formData.append("template_name", project?.name || "WBS 업로드");
  formData.append("project_type",  "Uploaded");
  formData.append("description",   `${project?.name || ""} Excel 업로드`);

  if (statusEl) { statusEl.textContent = "Excel 파싱 중…"; statusEl.className = "form-status"; }

  try {
    const preview = await request("/api/templates/import/preview", { method: "POST", body: formData });

    const errorCount = preview.errors?.length ?? 0;
    const rows       = (preview.rows || []).filter((r) => r.name);  // 빈 행 제외

    if (errorCount && !rows.length) {
      if (statusEl) statusEl.textContent = `오류 ${errorCount}건 — 업로드 불가`;
      return;
    }

    // 편집기 행을 업로드된 내용으로 교체 (바로 저장하지 않고 사용자가 검토 후 저장)
    state.wbsPlanRows  = rows.map((r) => ({
      code:        r.code        || null,
      parent_code: r.parent_code || null,
      name:        r.name,
      item_type:   r.item_type   || "작업",
      owner:       r.owner       || null,
      weight:      r.weight      ?? null,
      start_date:  r.start_date  || null,
      finish_date: r.finish_date || null,
    }));
    state.wbsPlanDirty = true;

    const warnMsg = errorCount ? ` (경고 ${errorCount}건 포함)` : "";
    if (statusEl) statusEl.textContent = `${rows.length}행 로드됨${warnMsg} — 내용 확인 후 저장하세요`;
    renderWbsPlanTable();
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message;
  } finally {
    event.target.value = "";
  }
}

function downloadImportErrorsExcel() {
  const jobId = document.querySelector("#importErrorWorkbookButton").dataset.importJobId;
  if (!jobId) return;
  authenticatedDownload(
    `${API_BASE}/api/imports/${encodeURIComponent(jobId)}/errors.xlsx`,
    "import_errors.xlsx",
  );
}

async function renumberTemplateCodes() {
  const template = selectedTemplate();
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "실행 중";
  document.querySelector("#importStatus").className = "status-pill attention";

  try {
    const result = await request(`/api/templates/${encodeURIComponent(template.key)}/codes/resequence`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    renderImportResult({
      status: result.status,
      accepted_rows: result.rows?.length || 0,
      rejected_rows: 0,
      errors: [],
      warnings: [
        {
          message: `WBS 코드 정렬 완료: ${result.changed_rows}행 변경`,
        },
      ],
      rows: result.rows || [],
    });
    await loadData();
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  }
}

async function uploadTemplateExcel(event) {
  const [file] = event.target.files;
  if (!file) return;

  // 일반 WBS 모드: 프로젝트가 선택되지 않으면 안내
  if (state.importType === "custom") {
    const projectId = document.querySelector("#importProjectSelect")?.value;
    if (!projectId) {
      const statusEl = document.querySelector("#importStatus");
      if (statusEl) {
        statusEl.textContent = "프로젝트를 먼저 선택하세요";
        statusEl.className = "status-pill critical";
      }
      event.target.value = "";
      return;
    }
    // 동일 파일·프로젝트로 Preview 상태 job이 이미 있으면 재사용 여부 확인
    const existing = state.importJobs.find(
      (j) => j.source_file === file.name && j.status === "Preview",
    );
    if (existing) {
      const reuse = window.confirm(
        `"${file.name}" 파일의 미반영 업로드 이력이 있습니다.\n\n기존 이력을 재사용하려면 [확인], 새로 업로드하려면 [취소]를 누르세요.`,
      );
      if (reuse) {
        event.target.value = "";
        loadImportJob(existing.id);
        return;
      }
    }
  }

  const template = selectedTemplate();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("template_key", template.key);
  formData.append("template_name", template.name);
  formData.append("project_type", template.project_type);
  formData.append("description", template.description);

  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "실행 중";
  document.querySelector("#importStatus").className = "status-pill attention";
  const _noticeEl = document.querySelector("#importApplyNotice");
  if (_noticeEl) _noticeEl.hidden = true;

  try {
    const result = await request("/api/templates/import/preview", {
      method: "POST",
      body: formData,
    });
    renderImportResult(result);
  } catch (error) {
    renderImportResult({
      status: "Rejected",
      accepted_rows: 0,
      rejected_rows: 1,
      errors: [{ message: error.message }],
      warnings: [],
      rows: [],
    });
  } finally {
    event.target.value = "";
  }
}

async function applyImportPreview() {
  if (!state.pendingImportJobId) return;

  // 일반 WBS 모드: 프로젝트에 반영
  if (state.importType === "custom") {
    const projectId = document.querySelector("#importProjectSelect")?.value;
    if (!projectId) { alert("프로젝트를 선택하세요."); return; }
    await applyImportToProject(projectId);
    return;
  }

  // 표준 WBS 모드: 템플릿에 반영
  const jobId = state.pendingImportJobId;
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "실행 중";
  document.querySelector("#importStatus").className = "status-pill attention";

  try {
    const result = await request(`/api/imports/${encodeURIComponent(jobId)}/apply`, { method: "POST" });
    renderImportResult(result);
    await loadData();
  } catch (error) {
    renderImportResult({ status: "Rejected", accepted_rows: 0, rejected_rows: 1, errors: [{ message: error.message }], warnings: [], rows: [] });
  }
}

async function applyImportToProject(projectId) {
  if (!state.pendingImportJobId) return;
  const jobId = state.pendingImportJobId;
  state.pendingImportJobId = null;
  renderApplyButton();
  document.querySelector("#importStatus").textContent = "반영 중";
  document.querySelector("#importStatus").className = "status-pill attention";

  try {
    const result = await request(
      `/api/projects/${encodeURIComponent(projectId)}/imports/${encodeURIComponent(jobId)}/apply`,
      { method: "POST" },
    );
    const rows = result.summary?.rows ?? 0;
    const statusEl = document.querySelector("#importStatus");
    statusEl.textContent = `반영 완료 — ${rows}행`;
    statusEl.className = "status-pill stable";
    await loadData();
    // notice 초기화
    const noticeEl = document.querySelector("#importApplyNotice");
    if (noticeEl) noticeEl.hidden = true;
    // WBS 관리 탭으로 이동 후 서버에서 전체 WBS 재로드
    window.location.hash = "wbs-plan";
    const drawer = document.querySelector("#templateDrawer");
    if (drawer) drawer.hidden = true;
    // state.wbsPlanProjectId를 먼저 초기화해야 loadWbsPlanProject가 실행됨
    state.wbsPlanProjectId = null;
    await loadWbsPlanProject(projectId);
    const sel = document.querySelector("#wbsPlanProjectSelect");
    if (sel) sel.value = projectId;
  } catch (error) {
    document.querySelector("#importStatus").textContent = error.message;
    document.querySelector("#importStatus").className = "status-pill critical";
  }
}

async function refreshEnginePreflight() {
  try {
    state.pmPreflight = await request("/api/pm-engine/preflight");
    state.syncDetail = null;
    if (canViewSettings()) {
      state.settings = await request("/api/settings");
    }
  } catch (error) {
    state.pmPreflight = {
      ...fallbackPreflight,
      state: "offline",
      checks: [{ name: "pm_engine", status: "fail", message: error.message }],
    };
    state.syncDetail = null;
  }

  renderAll();
}

async function saveSelectedSetting() {
  if (!canManageUsers()) return;
  const setting = selectedSetting();
  const status = document.querySelector("#settingsStatus");
  if (!setting) return;

  let value;
  try {
    value = JSON.parse(document.querySelector("#settingsJsonInput").value || "{}");
  } catch (error) {
    status.textContent = "JSON 형식을 확인하세요";
    return;
  }

  document.querySelector("#settingsSaveButton").disabled = true;
  state.settingsStatus = "";
  try {
    const result = await request(`/api/settings/${encodeURIComponent(setting.key)}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    state.settings = await request("/api/settings");
    if (result.pm_engine) {
      state.pmPreflight = {
        ...state.pmPreflight,
        engine: result.pm_engine,
      };
    }
    state.settingsStatus = "저장되었습니다";
    await loadData();
  } catch (error) {
    state.settingsStatus = error.message;
  } finally {
    document.querySelector("#settingsSaveButton").disabled = false;
    renderAll();
  }
}

async function loadProjectSyncPreflight() {
  const projectId = selectedSyncProjectId();
  if (!projectId) return;

  document.querySelector("#syncEngineStatus").textContent = "점검 중";
  document.querySelector("#syncEngineStatus").className = "status-pill attention";

  try {
    const detail = await request(`/api/projects/${encodeURIComponent(projectId)}/sync-preflight`);
    state.pmPreflight = detail.preflight || state.pmPreflight;
    state.syncDetail = detail;
  } catch (error) {
    state.syncDetail = { error: error.message };
  }

  renderAll();
}

async function dryRunProjectSync() {
  const projectId = selectedSyncProjectId();
  if (!projectId) return;

  document.querySelector("#syncEngineStatus").textContent = "모의 반영";
  document.querySelector("#syncEngineStatus").className = "status-pill attention";

  try {
    state.syncDetail = await request(`/api/projects/${encodeURIComponent(projectId)}/sync`, {
      method: "POST",
      body: JSON.stringify({
        dry_run: true,
        create_work_packages: true,
        validate_payloads: true,
        actor: "PMO",
      }),
    });
    await loadSyncRuns(projectId, { render: false });
  } catch (error) {
    state.syncDetail = { error: error.message };
  }

  renderAll();
}

async function runProjectSync() {
  const projectId = selectedSyncProjectId();
  if (!projectId || !state.pmPreflight?.ready_for_actual_sync) return;

  document.querySelector("#syncEngineStatus").textContent = "기준선 반영 중";
  document.querySelector("#syncEngineStatus").className = "status-pill attention";
  document.querySelector("#syncRunButton").disabled = true;

  try {
    state.syncDetail = await request(`/api/projects/${encodeURIComponent(projectId)}/sync`, {
      method: "POST",
      body: JSON.stringify({
        dry_run: false,
        create_work_packages: true,
        validate_payloads: true,
        actor: "PMO",
      }),
    });
    await loadSyncRuns(projectId, { render: false });
    await loadData();
  } catch (error) {
    state.syncDetail = { error: error.message };
    renderAll();
  }
}

/* ── OpenProject → AX WBS 역방향 Pull ────────────── */
async function pullOpenProjectStatus() {
  const projectId = selectedSyncProjectId();
  if (!projectId) return;

  const pullBtn  = document.querySelector("#syncPullButton");
  const statusEl = document.querySelector("#syncPullStatus");

  if (pullBtn) pullBtn.disabled = true;
  if (statusEl) statusEl.textContent = "OpenProject에서 상태 가져오는 중…";

  try {
    const result = await request(
      `/api/projects/${encodeURIComponent(projectId)}/sync-pull`,
      { method: "POST" },
    );

    if (statusEl) {
      statusEl.textContent = `완료 — ${result.updated}개 항목 업데이트됨 · ${result.pulled_at ? formatTimestamp(result.pulled_at) : ""}`;
    }

    // WBS 관리 메뉴에 해당 프로젝트가 로드된 경우 재로드
    if (state.wbsPlanProjectId === projectId) {
      const rows = await request(`/api/projects/${encodeURIComponent(projectId)}/wbs-items`);
      state.wbsPlanRows = rows.map((r) => ({ ...r }));
      renderWbsPlanTable();
    }

    await loadData();
  } catch (error) {
    if (statusEl) statusEl.textContent = `오류: ${error.message}`;
    if (pullBtn) pullBtn.disabled = false;
  }
}

/* ── origin/main 이식: openProjectDialog 의존 헬퍼 ── */

function projectOperationPolicy() {
  return {
    ...fallbackProjectOperationPolicy,
    ...(state.projectOperationPolicy || {}),
    tenant_id: state.projectOperationPolicy?.tenant_id || state.currentTenantId || "default",
  };
}