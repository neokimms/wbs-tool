/* AX WBS 포털 — 화면 전환(라우팅)·로그인 세션
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

const navLinks = [...document.querySelectorAll(".nav-list a[href^='#']")];
const viewAliases = {
  admin:    "operations",
  "wbs":    "wbs-plan",
  "sync":   "settings",   // OpenProject → 설정 탭으로 리다이렉트
};

// #sync URL로 접근 시 settings로 이동 후 openproject 탭 열기
if (window.location.hash === "#sync") {
  window.history.replaceState(null, "", "#settings");
}
const viewIds = new Set(navLinks.map((link) => link.hash.slice(1)));

function rawViewId(hash = "") {
  return String(hash || "")
    .replace(/^#/, "")
    .trim();
}

function normalizedViewId(hash = "") {
  const rawId = rawViewId(hash);
  const mappedId = viewAliases[rawId] || rawId || "dashboard";
  return viewIds.has(mappedId) ? mappedId : "dashboard";
}

function updateActiveNavigation(viewId = "dashboard") {
  navLinks.forEach((link) => {
    const isActive = normalizedViewId(link.hash) === viewId;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  updateTopbarTitle(viewId);
}

function applyPortalView(hash = "", options = {}) {
  const rawId = rawViewId(hash);
  let viewId = normalizedViewId(hash);
  if (!canAccessView(viewId)) {
    viewId = "dashboard";
  }
  const nextHash = `#${viewId}`;
  document.body.dataset.portalView = viewId;
  updateActiveNavigation(viewId);

  if (viewAliases[rawId] && window.location.hash !== nextHash) {
    window.history.replaceState(null, "", nextHash);
  } else if (options.updateHistory !== false && window.location.hash !== nextHash) {
    window.history.pushState(null, "", nextHash);
  }

  if (options.scrollToTop !== false) {
    window.scrollTo({ top: 0, behavior: options.behavior || "auto" });
  }
  if (viewId === "workboard") {
    renderWorkboardPanel();
    maybeLoadWorkboardProject();
  }
  if (viewId === "op-view") {
    maybeLoadOpViewProject();
  }
  if (viewId === "portfolio") applyPortfolioTab();
  if (viewId === "announcements") renderAnnouncementsPanel();
  if (viewId === "risks") renderRisksPanel();
  if (viewId === "resource") renderResourcePanel();
  if (viewId === "settings" && state.settingsTab === "tenants") renderTenantsTab();
  if (viewId === "settings" && state.settingsTab === "auth") renderAuthSettingsTab();
  if (viewId === "settings" && state.settingsTab === "smtp") renderSmtpTab();
  if (viewId === "notes") { attachNoteEvents(); renderNotes(); }
  if (viewId === "meetings" && typeof renderMeetingsPanel === "function") renderMeetingsPanel();
  if (viewId === "workboard" && typeof renderWorkboardMyActions === "function") renderWorkboardMyActions();
}


function clearSession(message = "") {
  state.authToken = null;
  state.currentUser = null;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  document.body.dataset.auth = "login";
  document.querySelector("#loginStatus").textContent = message;
  document.querySelector("#loginPasswordInput").value = "";
  renderAuthState();
}

async function activateSession(session) {
  state.authToken = session.token || state.authToken;
  state.currentUser = session.user;
  if (session.tenant?.id) {
    state.currentTenantId = session.tenant.id;
    state.currentTenant = session.tenant;
    window.localStorage.setItem(TENANT_ID_KEY, state.currentTenantId);
  }
  if (session.token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  }
  document.querySelector("#loginStatus").textContent = "";
  renderAuthState();
  await loadTenantSwitcher();
  applyPortalView(window.location.hash || "#dashboard", {
    updateHistory: false,
    scrollToTop: false,
  });
  await loadData();
  if (state.currentUser?.must_change_password) {
    openPasswordDialog(true);
  }
}

async function restoreSession() {
  if (!state.authToken) {
    clearSession();
    return;
  }

  try {
    const session = await request("/api/auth/me");
    await activateSession(session);
  } catch (error) {
    clearSession("세션이 만료되었습니다");
  }
}

async function loginUser(event) {
  event.preventDefault();
  const submitButton = document.querySelector("#loginSubmitButton");
  const status = document.querySelector("#loginStatus");
  const payload = {
    email: document.querySelector("#loginEmailInput").value.trim(),
    password: document.querySelector("#loginPasswordInput").value,
  };

  submitButton.disabled = true;
  status.textContent = "";
  state.authToken = null;

  try {
    const session = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await activateSession(session);
  } catch (error) {
    clearSession(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function logoutUser() {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch (error) {
    // Local session cleanup is still valid even if the server session expired.
  } finally {
    clearSession();
  }
}

function openPasswordDialog(required = false) {
  const dialog = document.querySelector("#passwordDialog");
  document.querySelector("#passwordForm").reset();
  document.querySelector("#passwordFormStatus").textContent = required ? "초기 비밀번호를 변경해야 합니다" : "";
  document.querySelector("#passwordDialogClose").disabled = required;
  document.querySelector("#passwordCancelButton").disabled = required;
  dialog.dataset.required = required ? "true" : "false";
  dialog.showModal();
  document.querySelector("#currentPasswordInput").focus();
}

function closePasswordDialog() {
  const dialog = document.querySelector("#passwordDialog");
  if (dialog.dataset.required === "true") return;
  dialog.close();
}

async function changePassword(event) {
  event.preventDefault();
  const submitButton = document.querySelector("#passwordSubmitButton");
  const status = document.querySelector("#passwordFormStatus");
  const newPassword = document.querySelector("#newPasswordInput").value;
  const confirmPassword = document.querySelector("#confirmPasswordInput").value;
  if (newPassword !== confirmPassword) {
    status.textContent = "새 비밀번호 확인이 일치하지 않습니다";
    return;
  }

  submitButton.disabled = true;
  status.textContent = "";
  try {
    const result = await request("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        current_password: document.querySelector("#currentPasswordInput").value,
        new_password: newPassword,
      }),
    });
    state.currentUser = result.user;
    document.querySelector("#passwordDialog").dataset.required = "false";
    document.querySelector("#passwordDialog").close();
    renderAll();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

document.querySelector("#loginForm").addEventListener("submit", loginUser);
document.querySelector("#passwordDialogClose").addEventListener("click", closePasswordDialog);
document.querySelector("#passwordCancelButton").addEventListener("click", closePasswordDialog);
document.querySelector("#passwordForm").addEventListener("submit", changePassword);
document.querySelector("#createProjectButton").addEventListener("click", openProjectDialog);

/* ── origin/main 이식: updateActiveNavigation 의존 헬퍼 ── */
function viewLabel(viewId = "dashboard") {
  const link = navLinks.find((item) => normalizedViewId(item.hash) === viewId);
  return link?.textContent.trim() || "대시보드";
}
function updateTopbarTitle(viewId = "dashboard") {
  const title = document.querySelector("#topbarTitle");
  const eyebrow = document.querySelector("#topbarEyebrow");
  if (eyebrow) eyebrow.textContent = "기업 WBS 플랫폼";
  if (title) title.textContent = viewLabel(viewId);
}

/* ── origin/main 이식: activateSession 의존 헬퍼 ── */

function renderTenantSwitcher() {
  const wrap = document.querySelector("#tenantSwitcher");
  const select = document.querySelector("#tenantSelect");
  const badge = document.querySelector("#tenantStatusBadge");
  if (!wrap || !select || !badge) return;
  const isAuthenticated = Boolean(state.currentUser && state.authToken);
  wrap.hidden = !isAuthenticated;
  if (!isAuthenticated) return;

  const tenants = state.tenants.length
    ? state.tenants
    : [{ id: state.currentTenantId || "default", name: state.currentTenantId || "default", status: state.currentTenant?.status || "Active" }];
  const selectedExists = tenants.some((tenant) => tenant.id === state.currentTenantId);
  if (!selectedExists) {
    tenants.unshift({ id: state.currentTenantId || "default", name: state.currentTenantId || "default", status: state.currentTenant?.status || "Active" });
  }
  select.innerHTML = tenants.map((tenant) => `
    <option value="${escapeHtml(tenant.id)}" ${tenant.id === state.currentTenantId ? "selected" : ""}>
      ${escapeHtml(tenant.name || tenant.id)}${tenant.status === "Suspended" ? " (중지)" : ""}
    </option>
  `).join("");
  const current = tenants.find((tenant) => tenant.id === state.currentTenantId) || tenants[0];
  badge.textContent = current?.status === "Suspended" ? "중지" : current?.id || state.currentTenantId;
  badge.classList.toggle("is-suspended", current?.status === "Suspended");
}
async function loadTenantSwitcher() {
  if (!state.authToken) return;
  try {
    state.tenants = await request("/api/tenants");
    state.currentTenant = state.tenants.find((tenant) => tenant.id === state.currentTenantId) || state.currentTenant;
  } catch (error) {
    state.tenants = [];
  }
  renderTenantSwitcher();
}

/* ── origin/main 이식: 테넌트 전환 ── */
function resetTenantScopedState() {
  state.dashboard = createDashboardState();
  state.projects = [];
  state.approvals = [];
  state.importJobs = [];
  state.users = [];
  state.userGroups = [];
  state.auditEvents = [];
  state.risks = [];
  state.issues = [];
  state.notifications = [];
  state.projectOperationPolicy = { ...fallbackProjectOperationPolicy, tenant_id: state.currentTenantId || "default" };
  state.projectPolicyStatus = "";
  state.selectedProjectId = null;
  state.projectPlan = null;
  state.projectDetail = null;
  state.syncRuns = [];
  state.resourceData = null;
  state.wbsPlanProjectId = null;
  state.wbsPlanRows = [];
  state.workboardProjectId = null;
  state.workboardLoadedProjectId = null;
  state.workboardRows = [];
  state.myWorkItems = [];
  state.workboardSelectedCode = null;
  state.workboardStatusMessage = "";
  state.workboardDragKey = null;
  state.workboardGanttDrag = null;
  state.agileSprints = [];
  state.agileItems = [];
  state.agileMetrics = null;
  state.agileLoadedProjectId = null;
  state.agileLoading = false;
  state.agileSelectedSprintId = "";
  state.agileDragKey = null;
  state.opViewProjectId = null;
  state.opViewRows = [];
}
async function switchTenant(tenantId) {
  if (!tenantId || tenantId === state.currentTenantId) return;
  state.currentTenantId = tenantId;
  window.localStorage.setItem(TENANT_ID_KEY, tenantId);
  state.currentTenant = state.tenants.find((tenant) => tenant.id === tenantId) || { id: tenantId, status: "Active" };
  resetTenantScopedState();
  renderTenantSwitcher();
  renderAll();
  showAppSkeletons();
  try {
    await loadData({ tenantId });
    await loadTenantSwitcher();
  } catch (error) {
    alert(`테넌트 전환 실패: ${error.message}`);
  }
}
window.switchTenant = switchTenant;
document.querySelector("#tenantSelect")?.addEventListener("change", (event) => {
  switchTenant(event.target.value);
});
document.querySelector("#tenantSelect")?.addEventListener("input", (event) => {
  switchTenant(event.target.value);
});
document.querySelector("#tenantSwitcher")?.addEventListener("change", (event) => {
  if (event.target?.matches?.("#tenantSelect")) {
    switchTenant(event.target.value);
  }
});

/* ── origin/main 이식: applyPortalView 의존 헬퍼 ── */
function maybeLoadWorkboardProject() {
  const projectId = ensureWorkboardProjectSelection();
  if (!projectId || state.workboardLoading || state.workboardLoadedProjectId === projectId) return;
  loadWorkboardProject(projectId);
}