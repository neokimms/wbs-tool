/* AX WBS 포털 — 전역 이벤트 바인딩
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ── 사용자 아이콘 드롭다운 ──────────────────────── */
function toggleUserDropdown(open) {
  const btn      = document.querySelector("#userAvatarBtn");
  const dropdown = document.querySelector("#userDropdown");
  if (!btn || !dropdown) return;
  const isOpen = open !== undefined ? open : dropdown.hidden;
  dropdown.hidden = !isOpen;
  btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

document.querySelector("#userAvatarBtn").addEventListener("click", (event) => {
  event.stopPropagation();
  const dropdown = document.querySelector("#userDropdown");
  toggleUserDropdown(dropdown.hidden);
});

/* 드롭다운 내 버튼 클릭 후 닫기 */
document.querySelector("#refreshButton").addEventListener("click", () => {
  toggleUserDropdown(false);
  loadData();
});
document.querySelector("#logoutButton").addEventListener("click", () => {
  toggleUserDropdown(false);
  logoutUser();
});
document.querySelector("#passwordButton").addEventListener("click", () => {
  toggleUserDropdown(false);
  openPasswordDialog(false);
});

/* 외부 클릭 시 드롭다운 닫기 */
document.addEventListener("click", (event) => {
  if (!event.target.closest("#userMenuWrap")) {
    toggleUserDropdown(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") toggleUserDropdown(false);
});
document.querySelector("#projectDialogClose").addEventListener("click", closeProjectDialog);
document.querySelector("#projectCancelButton").addEventListener("click", closeProjectDialog);
document.querySelector("#projectForm").addEventListener("submit", createProject);
document.querySelector("#userCreateForm").addEventListener("submit", createPortalUser);
document.querySelector("#importErrorWorkbookButton").addEventListener("click", downloadImportErrorsExcel);
document.querySelector("#renumberButton").addEventListener("click", renumberTemplateCodes);
// #applyImportButton 이벤트는 하단 templates 클릭 핸들러 블록에서 등록
document.querySelector("#syncRefreshButton").addEventListener("click", refreshEnginePreflight);
document.querySelector("#syncPreflightButton").addEventListener("click", loadProjectSyncPreflight);
document.querySelector("#syncDryRunButton").addEventListener("click", dryRunProjectSync);
document.querySelector("#syncRunButton").addEventListener("click", runProjectSync);

/* ── 역방향 연계 이벤트 ──────────────────────── */
document.querySelector("#syncPullButton").addEventListener("click", pullOpenProjectStatus);
document.querySelector("#opInstanceCheckBtn").addEventListener("click", checkOpInstanceConnection);
document.querySelector("#syncWebhookCopyBtn").addEventListener("click", () => {
  const url = document.querySelector("#syncWebhookUrl")?.textContent?.trim();
  if (!url || url === "-") return;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector("#syncWebhookCopyBtn");
    const orig = btn.textContent;
    btn.textContent = "✅";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => alert(url));
});
document.querySelector("#projectRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-action]");
  if (!button) return;
  const pid = button.dataset.projectId;
  if (button.dataset.projectAction === "detail") {
    if (pid) openProjectDrawer(pid);
    return;
  }
  if (button.disabled) return;
  if (button.dataset.projectAction === "plan") {
    if (pid) {
      applyPortalView("#wbs-plan", { behavior: "smooth" });
      loadWbsPlanProject(pid);
    }
    return;
  }
  requestProjectApproval(pid);
});

/* 드로어 닫기 */
document.querySelector("#drawerClose").addEventListener("click", closeProjectDrawer);
document.querySelector("#drawerBackdrop").addEventListener("click", closeProjectDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#projectDrawer").hidden) {
    closeProjectDrawer();
  }
});

/* 드로어 내부 빠른 액션 */
document.querySelector("#drawerContent").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-drawer-action]");
  if (!btn) return;
  const pid = btn.dataset.projectId;
  if (btn.dataset.drawerAction === "wbs") {
    closeProjectDrawer();
    applyPortalView("#wbs-plan", { behavior: "smooth" });
    if (pid) loadWbsPlanProject(pid);
  } else if (btn.dataset.drawerAction === "approval") {
    closeProjectDrawer();
    requestProjectApproval(pid);
  } else if (btn.dataset.drawerAction === "sync") {
    closeProjectDrawer();
    applyPortalView("#sync", { behavior: "smooth" });
  }
});
document.querySelector("#approvalPipelineList").addEventListener("click", (event) => {
  // 승인/반려 버튼
  const approvalBtn = event.target.closest("[data-approval-action]");
  if (approvalBtn && !approvalBtn.disabled) {
    decideApproval(approvalBtn.dataset.approvalId, approvalBtn.dataset.approvalAction);
    return;
  }
  // 반려 후 재승인 요청
  const reapplyBtn = event.target.closest("[data-approval-action-project='reapply']");
  if (reapplyBtn) {
    requestProjectApproval(reapplyBtn.dataset.projectId);
    return;
  }
  // 반려 후 WBS 수정 이동
  const planBtn = event.target.closest("[data-project-action='plan']");
  if (planBtn && !planBtn.disabled) {
    const pid = planBtn.dataset.projectId;
    applyPortalView("#wbs-plan", { behavior: "smooth" });
    if (pid) loadWbsPlanProject(pid);
  }
});
document.querySelector("#stgApprovalList").addEventListener("click", (event) => {
  const approvalBtn = event.target.closest("[data-approval-action]");
  if (approvalBtn && !approvalBtn.disabled) {
    decideApproval(approvalBtn.dataset.approvalId, approvalBtn.dataset.approvalAction);
  }
});
document.querySelector("#userRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-user-action]");
  if (!button || button.disabled) return;
  if (button.dataset.userAction === "revoke") {
    revokePortalUserSessions(button.closest("tr"));
    return;
  }
  updatePortalUser(button.closest("tr"));
});
document.querySelector(".nav-list").addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#']");
  if (!link) return;
  event.preventDefault();
  applyPortalView(link.hash, { behavior: "smooth" });
  // 승인 이력 패널은 뷰에 따라 레이아웃이 달라지므로 즉시 재렌더링
  if (link.hash === "#approvals" || link.hash === "#dashboard") {
    renderApprovals();
  }
});
document.querySelector("#auditRefreshButton").addEventListener("click", () => {
  loadData().then(() => renderAuditPanel());
});

/* 설정 탭 전환 */
document.querySelector("#settingsTabBar").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-stg-tab]");
  if (!tab || tab.hidden) return;
  switchSettingsTab(tab.dataset.stgTab);
});

/* 감사 로그 서브탭 */
document.querySelector("#auditSubTabBar").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-audit-tab]");
  if (!tab) return;
  state.auditTab = tab.dataset.auditTab;
  renderAuditPanel();
});

document.querySelector("#settingsCards").addEventListener("click", (event) => {
  const card = event.target.closest("[data-setting-key]");
  if (!card) return;
  state.selectedSettingKey = card.dataset.settingKey;
  state.settingsStatus = "";
  renderSettingsPanel();
});
document.querySelector("#settingsKeySelect").addEventListener("change", (event) => {
  state.selectedSettingKey = event.target.value;
  state.settingsStatus = "";
  renderSettingsPanel();
});
document.querySelector("#settingsSaveButton").addEventListener("click", saveSelectedSetting);
document.querySelector("#importHistoryList").addEventListener("click", (event) => {
  const deleteBtn = event.target.closest("[data-import-job-delete]");
  if (deleteBtn) { deleteImportJob(deleteBtn.dataset.importJobDelete); return; }
  const button = event.target.closest("[data-import-job-id]");
  if (!button) return;
  loadImportJob(button.dataset.importJobId);
});
document.querySelector("#templateSelect").addEventListener("change", () => {
  state.userSelectedTemplate = true;
});
document.querySelector("#syncProjectSelect").addEventListener("change", () => {
  state.userSelectedSyncProject = true;
  state.syncDetail = null;
  loadSyncRuns(selectedSyncProjectId());
});
document.querySelector("#excelFileInput").addEventListener("change", uploadTemplateExcel);

/* 포트폴리오 필터 */
document.querySelector("#portfolioFilter").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-filter]");
  if (!btn) return;
  state.portfolioFilter = btn.dataset.filter;
  renderProjects();
});
