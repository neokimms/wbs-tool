/* AX WBS 포털 — 승인·가져오기·동기화·운영·사용자·감사 패널
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ── 승인 프로세스 단계 정의 ─────────────────────── */
/* 승인 파이프라인 3단계 (동기화는 별도 배지) */
const PIPE_STEPS = [
  { label: "초안", statuses: ["Draft"] },
  { label: "검토", statuses: ["Review"] },
  { label: "승인", statuses: ["Approved", "Synced", "Closed"] },
];

function pipeActiveIndex(status) {
  if (status === "Rejected") return 1;   // 검토 단계에서 반려
  for (let i = 0; i < PIPE_STEPS.length; i++) {
    if (PIPE_STEPS[i].statuses.includes(status)) return i;
  }
  return 0;
}

function renderApprovalPipelineCard(project, approval) {
  const canMutate   = canMutateWork();
  const activeIdx   = pipeActiveIndex(project.status);
  const isRejected  = project.status === "Rejected";
  const isPending   = approval?.status === "Pending";
  const isApproved  = project.status === "Approved" || project.status === "Synced" || project.status === "Closed";

  /* D-day */
  let ddayHtml = "";
  if (isPending && approval.due_date) {
    const days = Math.ceil((new Date(approval.due_date) - new Date()) / 86400000);
    const label = days >= 0 ? `D-${days}` : `D+${Math.abs(days)} 초과`;
    ddayHtml = `<span class="pipe-dday ${days < 0 ? "overdue" : ""}">${escapeHtml(label)}</span>`;
  }

  /* 파이프라인 스텝 HTML */
  const stepsHtml = PIPE_STEPS.map((step, idx) => {
    let dotClass = "empty";
    if (isRejected && idx === 1) dotClass = "rejected";          // 검토 단계에서 반려
    else if (idx < activeIdx)    dotClass = "done";
    else if (idx === activeIdx)  dotClass = isPending ? "pending" : "active";

    const connClass = idx < activeIdx ? "done" : "";
    const symbol    = dotClass === "done" ? "✓" : dotClass === "rejected" ? "✗" : String(idx + 1);

    return `
      <div class="pipe-step">
        <div class="pipe-dot ${dotClass}">${symbol}</div>
        <span class="pipe-step-label">${escapeHtml(step.label)}</span>
      </div>
      ${idx < PIPE_STEPS.length - 1 ? `<div class="pipe-connector ${connClass}"></div>` : ""}`;
  }).join("");

  /* 푸터 */
  let footerHtml = "";
  if (isPending && canMutate) {
    footerHtml = `
      <div class="pipe-footer-meta">
        <span class="pipe-requester">요청자: ${escapeHtml(approval.requester || "-")}</span>
        ${ddayHtml}
      </div>
      <div class="pipe-actions">
        <button class="pipe-reject-btn"  type="button"
          data-approval-action="reject"  data-approval-id="${escapeHtml(approval.id)}">반려</button>
        <button class="pipe-approve-btn" type="button"
          data-approval-action="approve" data-approval-id="${escapeHtml(approval.id)}">승인</button>
      </div>`;
  } else if (isPending && !canMutate) {
    footerHtml = `<div class="pipe-footer-meta"><span class="pipe-requester">요청자: ${escapeHtml(approval.requester || "-")}</span>${ddayHtml}<span>PMO 승인 대기 중</span></div>`;
  } else if (isApproved && approval) {
    footerHtml = `<div class="pipe-footer-meta">
      <span>${approval.decided_at ? formatTimestamp(approval.decided_at) : ""} 승인 완료</span>
      ${approval.reviewer ? `<span>· ${escapeHtml(approval.reviewer)}</span>` : ""}
    </div>`;
  } else if (isRejected && approval) {
    footerHtml = `
      <div class="pipe-footer-meta pipe-footer-rejected">
        <span>반려 · ${escapeHtml(approval.decision_comment || "WBS 수정 필요")}</span>
      </div>
      ${(canMutate && project.id) ? `
        <div class="pipe-actions">
          <button class="pipe-approve-btn" type="button" style="background:#e8f0fd;border-color:#bfdbfe;color:var(--blue)"
            data-project-action="plan" data-project-id="${escapeHtml(project.id)}">WBS 수정</button>
          <button class="pipe-approve-btn" type="button"
            data-approval-action-project="reapply" data-project-id="${escapeHtml(project.id)}">재승인 요청</button>
        </div>` : ""}`;
  } else if (!approval && project.id && ["Draft"].includes(project.status)) {
    footerHtml = `<div class="pipe-footer-meta"><span>WBS 등록 후 승인 요청 가능</span></div>`;
  }

  /* 동기화 배지 (OpenProject 연동 상태) */
  const isSynced  = project.status === "Synced" || project.status === "Closed";
  const hasSyncId = Boolean(project.openproject_project_id);
  const syncBadge = (isSynced || hasSyncId)
    ? `<span class="pipe-sync-badge ${isSynced ? "synced" : "linked"}">🔗 ${isSynced ? "OpenProject 동기화 완료" : "OpenProject 연결됨"}</span>`
    : "";

  return `
    <div class="approval-pipe-card ${isPending ? "pending" : ""} ${isRejected ? "rejected" : ""}">
      <div class="pipe-header">
        <div class="pipe-project-info">
          <span class="pipe-project-name">${escapeHtml(project.name)}</span>
          <span class="status-pill ${statusClass(project.status)}" style="font-size:0.7rem">${statusLabel(project.status)}</span>
          ${syncBadge}
        </div>
        <span class="pipe-type">${escapeHtml(projectTypeLabel(project.template_key))}</span>
      </div>
      <div class="pipe-steps">${stepsHtml}</div>
      ${footerHtml ? `<div class="pipe-footer">${footerHtml}</div>` : ""}
    </div>`;
}

/* ── 승인 이력 공통 렌더 (뷰에 따라 파이프라인 / 테이블 분기) ── */
function renderApprovals() {
  const approvalStatus = document.querySelector("#approvalStatus");
  const pendingCount   = state.approvals.filter((a) => a.status === "Pending").length;
  approvalStatus.textContent = pendingCount ? `승인 대기 ${pendingCount}건` : "정상";
  approvalStatus.className   = `status-pill ${pendingCount ? "attention" : "stable"}`;

  const container = document.querySelector("#approvalPipelineList");
  if (!container) return;

  const viewId = document.body.dataset.portalView || "";

  if (viewId === "approvals") {
    /* ── 승인 이력 메뉴: 테이블 리스트 ── */
    renderApprovalTable(container);
  } else {
    /* ── 대시보드: 파이프라인 카드 ── */
    renderApprovalPipeline(container);
  }
}

function renderApprovalPipeline(container) {
  const projects = state.apiConnected ? state.projects : fallbackProjects;
  if (!projects.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.84rem;padding:8px">등록된 프로젝트가 없습니다.</p>`;
    return;
  }

  /* 프로젝트별 최신 승인 맵 */
  const latestApproval = {};
  state.approvals.forEach((a) => {
    const existing = latestApproval[a.project_id];
    if (!existing || new Date(a.created_at) > new Date(existing.created_at)) {
      latestApproval[a.project_id] = a;
    }
  });

  /* 정렬: 대기 먼저 → 최근 생성순 */
  const sorted = [...projects].sort((a, b) => {
    const aP = latestApproval[a.id]?.status === "Pending" ? 1 : 0;
    const bP = latestApproval[b.id]?.status === "Pending" ? 1 : 0;
    if (aP !== bP) return bP - aP;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  container.innerHTML = sorted.map((p) => renderApprovalPipelineCard(p, latestApproval[p.id])).join("");
}

function renderApprovalTable(container) {
  /* 승인 이력 메뉴: 기존 테이블 형태 */
  const rows = state.approvals.length ? state.approvals : fallbackApprovals;
  const canMutate = canMutateWork();

  container.innerHTML = `
    <div class="table-wrap">
      <table class="approval-table">
        <thead>
          <tr>
            <th>제목</th>
            <th>프로젝트</th>
            <th>상태</th>
            <th>요청자</th>
            <th>요청일</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((approval) => {
            const isPending = canMutate && approval.status === "Pending" && approval.id;
            const reqDate   = approval.created_at ? formatTimestamp(approval.created_at) : (approval.due_date || "-");
            return `
              <tr>
                <td>
                  <strong style="font-size:0.86rem;display:block">${escapeHtml(approval.title || "-")}</strong>
                  <small style="color:var(--text-muted);font-size:0.74rem">${escapeHtml(approval.request_type || "-")}</small>
                </td>
                <td>${escapeHtml(approval.project_name || "-")}</td>
                <td><span class="status-pill ${statusClass(approval.status)}">${statusLabel(approval.status)}</span></td>
                <td>${escapeHtml(approval.requester || "-")}</td>
                <td>${escapeHtml(reqDate)}</td>
                <td>
                  <div class="pipe-actions">
                    <button class="pipe-reject-btn"  type="button"
                      data-approval-action="reject"  data-approval-id="${approval.id || ""}"
                      ${isPending ? "" : "disabled"}>반려</button>
                    <button class="pipe-approve-btn" type="button"
                      data-approval-action="approve" data-approval-id="${approval.id || ""}"
                      ${isPending ? "" : "disabled"}>승인</button>
                  </div>
                </td>
              </tr>`;
          }).join("") || `<tr class="empty-row"><td colspan="6">승인 이력 없음</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function renderImportPreview() {
  const rows = state.importPreview.slice(0, 8);
  document.querySelector("#importPreviewRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.code || "")}</td>
              <td>${escapeHtml(row.parent_code || "")}</td>
              <td>${escapeHtml(row.name || "")}</td>
              <td>${escapeHtml(row.weight ?? "")}</td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr>
        <td colspan="4">업로드 대기</td>
      </tr>
    `;
}

function renderImportDiff() {
  const rows = state.importDiffRows.slice(0, 8);
  document.querySelector("#importDiffRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td><span class="status-pill ${statusClass(row.change)}">${escapeHtml(changeLabel(row.change))}</span></td>
              <td>${escapeHtml(row.code || "")}</td>
              <td>${escapeHtml(row.name || "")}</td>
              <td>${escapeHtml((row.fields || []).map((field) => fieldLabel(field.field)).join(", ") || "-")}</td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr>
        <td colspan="4">변경 diff 없음</td>
      </tr>
    `;
}

function renderApplyButton() {
  const applyButton = document.querySelector("#applyImportButton");
  const hasPending  = Boolean(state.pendingImportJobId);
  const canMutate   = canMutateWork();

  if (state.importType === "custom") {
    const projectId = document.querySelector("#importProjectSelect")?.value;
    applyButton.disabled = !canMutate || !hasPending || !projectId;
    applyButton.textContent = "프로젝트에 반영";
  } else {
    applyButton.disabled = !canMutate || !hasPending;
    applyButton.textContent = "반영";
  }
}

function setImportType(type) {
  state.importType = type;
  const panel = document.querySelector("#tplTabImport");
  if (panel) panel.dataset.importType = type;

  // 토글 버튼 상태
  document.querySelectorAll(".type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.importType === type);
  });

  // 안내 문구 토글
  const stdNotice = document.querySelector("#importStdNotice");
  const cstNotice = document.querySelector("#importCstNotice");
  if (stdNotice) stdNotice.hidden = type !== "standard";
  if (cstNotice) cstNotice.hidden = type !== "custom";

  renderApplyButton();
}

function renderImportProjectSelect() {
  const sel = document.querySelector("#importProjectSelect");
  if (!sel) return;
  const projects = (state.apiConnected ? state.projects : fallbackProjects)
    .filter((p) => p.id && ["Draft","Review","Rejected"].includes(p.status));
  sel.innerHTML = [
    `<option value="">프로젝트 선택…</option>`,
    ...projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} [${statusLabel(p.status)}]</option>`),
  ].join("");
}

function upsertImportJob(job) {
  if (!job?.id) return;
  state.importJobs = [
    job,
    ...state.importJobs.filter((item) => item.id !== job.id),
  ].slice(0, 8);
}

function importJobSubline(job) {
  const template = job.template_name || job.template_key || "검증";
  const createdAt = formatTimestamp(job.applied_at || job.created_at);
  return `${template} · ${createdAt}`;
}

function renderImportHistory() {
  document.querySelector("#importHistoryCount").textContent = state.importJobs.length;
  document.querySelector("#importHistoryList").innerHTML = state.importJobs.length
    ? state.importJobs
        .map((job) => {
          const selected = job.id === state.selectedImportJobId;
          const rowCount = job.preview_count ?? job.total_rows ?? 0;
          const canDelete = job.status !== "Applied";
          return `
            <div class="import-job-row ${selected ? "selected-import-job" : ""}">
              <button
                class="import-job"
                type="button"
                data-import-job-id="${escapeHtml(job.id)}"
              >
                <span>
                  <strong>${escapeHtml(job.source_file || "Excel 업로드")}</strong>
                  <small>${escapeHtml(importJobSubline(job))}</small>
                </span>
                <span class="import-job-meta">
                  <span class="status-pill ${statusClass(job.status)}">${escapeHtml(statusLabel(job.status))}</span>
                  <small>${escapeHtml(job.accepted_rows ?? 0)}/${escapeHtml(rowCount)}행</small>
                </span>
              </button>
              ${canDelete ? `<button class="import-job-delete-btn" type="button" title="이력 삭제" data-import-job-delete="${escapeHtml(job.id)}">✕</button>` : ""}
            </div>
          `;
        })
        .join("")
    : `
      <article class="import-job empty-import-job">
        <span>
          <strong>업로드 없음</strong>
          <small>업로드 이력 없음</small>
        </span>
      </article>
    `;
}

async function deleteImportJob(jobId) {
  if (!window.confirm("이 업로드 이력을 삭제하시겠습니까?")) return;
  try {
    await request(`/api/imports/${encodeURIComponent(jobId)}`, { method: "DELETE" });
    state.importJobs = state.importJobs.filter((j) => j.id !== jobId);
    if (state.selectedImportJobId === jobId) {
      state.selectedImportJobId = null;
      state.pendingImportJobId  = null;
      renderApplyButton();
      document.querySelector("#importStatus").textContent = "대기";
      document.querySelector("#importStatus").className = "status-pill attention";
    }
    renderImportHistory();
  } catch (error) {
    alert(error.message);
  }
}

function renderTemplateVersions() {
  document.querySelector("#templateVersionCount").textContent = state.templateVersions.length;
  document.querySelector("#templateVersionList").innerHTML = state.templateVersions.length
    ? state.templateVersions
        .map(
          (version) => `
            <article class="sync-run">
              <div>
                <strong>v${escapeHtml(version.version)} · ${escapeHtml(version.template_name)}</strong>
                <small>${escapeHtml(formatTimestamp(version.created_at))} · ${escapeHtml(version.item_count)}행</small>
              </div>
              <span class="status-pill stable">${escapeHtml(projectTypeLabel(version.project_type))}</span>
            </article>
          `,
        )
        .join("")
    : `
      <article class="sync-run empty-run">
        <div>
          <strong>버전 없음</strong>
          <small>버전 이력 없음</small>
        </div>
      </article>
    `;
}

function renderProjectTemplateSelect(preserveSelection = true) {
  const selector = document.querySelector("#projectTemplateSelect");
  const selectedValue = preserveSelection && selector.value ? selector.value : defaultTemplateKey();
  selector.innerHTML = state.templates
    .map((template) => `<option value="${template.key}">${escapeHtml(template.name)}</option>`)
    .join("");
  selector.value = state.templates.some((template) => template.key === selectedValue)
    ? selectedValue
    : defaultTemplateKey();
}

function renderSyncProjectSelect() {
  const selector = document.querySelector("#syncProjectSelect");
  const projects = state.projects.filter((project) => project.id);
  const selectedValue = state.userSelectedSyncProject && selector.value ? selector.value : projects[0]?.id || "";

  selector.innerHTML = projects.length
    ? projects
        .map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`)
        .join("")
    : '<option value="">프로젝트 없음</option>';
  selector.value = projects.some((project) => project.id === selectedValue) ? selectedValue : projects[0]?.id || "";
  selector.disabled = !projects.length;

  const hasProject  = Boolean(selector.value);
  const canMutate   = canMutateWork();
  const canSyncAction = hasProject && canMutate;

  // 프로젝트 상태 확인 — Approved만 실 동기화 허용
  const selectedProject = state.projects.find((p) => p.id === selector.value);
  const projectStatus   = selectedProject?.status || "";
  const isApproved      = projectStatus === "Approved";
  const isSynced        = projectStatus === "Synced" || projectStatus === "Closed";

  const canActualSync = canSyncAction
    && Boolean(state.pmPreflight?.ready_for_actual_sync)
    && isApproved;

  document.querySelector("#syncPreflightButton").disabled = !canSyncAction;
  document.querySelector("#syncDryRunButton").disabled    = !canSyncAction;
  document.querySelector("#syncRunButton").disabled       = !canActualSync;

  // 동기화 버튼 tooltip — 상태에 따라 안내 메시지 변경
  let syncTitle = "OpenProject 작업 패키지를 생성합니다";
  if (!state.pmPreflight?.ready_for_actual_sync) {
    syncTitle = "점검 버튼을 클릭해 연계 상태를 확인하세요";
  } else if (isSynced) {
    syncTitle = `프로젝트 상태가 '${statusLabel(projectStatus)}'입니다. 동기화가 이미 완료된 프로젝트입니다.`;
  } else if (!isApproved && hasProject) {
    syncTitle = `프로젝트 상태가 '${statusLabel(projectStatus)}'입니다. 승인(Approved) 상태에서만 동기화 가능합니다.`;
  }
  document.querySelector("#syncRunButton").title = syncTitle;
}

function selectedSyncProjectId() {
  return document.querySelector("#syncProjectSelect").value;
}

function renderSyncPanel() {
  const preflight = state.pmPreflight || fallbackPreflight;
  const stateValue = preflight.state || "dry_run_only";
  const status = document.querySelector("#syncEngineStatus");
  status.textContent = syncStateLabel(stateValue);
  status.className = `status-pill ${syncStateClass(stateValue)}`;

  const engine = preflight.engine || {};
  document.querySelector("#syncMode").textContent = `${engineModeLabel(engine.adapter || "openproject")} · ${
    engine.enabled ? "실행 허용" : "비활성"
  }`;
  const selProj   = state.projects.find((p) => p.id === selectedSyncProjectId());
  const projState = selProj ? ` · 프로젝트: ${statusLabel(selProj.status)}` : "";
  document.querySelector("#syncState").textContent =
    (preflight.ready_for_actual_sync ? "실제 동기화 준비" : "모의 실행 모드") + projState;

  const summary = state.syncDetail?.summary;
  const rowSummary = summary?.pending_work_packages !== undefined
    ? `${summary.pending_work_packages}/${summary.total_rows ?? 0} 대기`
    : summary?.created_work_packages !== undefined
      ? `${summary.created_work_packages}개 생성 / ${summary.total_rows ?? 0}`
      : "-";
  document.querySelector("#syncPendingRows").textContent = rowSummary;

  const checks = preflight.checks?.length ? preflight.checks : fallbackPreflight.checks;
  document.querySelector("#syncChecks").innerHTML = state.syncDetail?.error
    ? `
      <article class="sync-check">
        <div>
          <strong>동기화 요청</strong>
          <small>${escapeHtml(preflightMessageLabel(state.syncDetail.error))}</small>
        </div>
        <span class="status-pill critical">오류</span>
      </article>
    `
    : checks
        .slice(0, 4)
        .map((check) => {
          const checkClass = check.status === "pass" ? "stable" : check.status === "fail" ? "critical" : "attention";
          return `
            <article class="sync-check">
              <div>
                <strong>${escapeHtml(syncCheckLabel(check.name))}</strong>
                <small>${escapeHtml(preflightMessageLabel(check.message || check.path || check.status))}</small>
              </div>
              <span class="status-pill ${checkClass}">${operationStatusLabel(check.status || "watch")}</span>
            </article>
          `;
        })
        .join("");

  const payload = state.syncDetail?.payload_sample?.payload;
  const preview = payload
    ? JSON.stringify(payload, null, 2)
    : state.syncDetail?.status
      ? `${statusLabel(state.syncDetail.status)}: 계획 행 ${summary?.total_rows ?? 0}개`
      : "샘플 payload 대기";
  document.querySelector("#syncPayloadPreview").textContent = preview;

  // 역방향·양방향 연계 섹션 업데이트
  renderSyncPullSection();
  renderAutoSyncStatus();
  // 온프레미스 인스턴스 섹션 업데이트
  renderOpInstanceSection();
}

function renderSyncPullSection() {
  const projectId = selectedSyncProjectId();
  const pullBtn   = document.querySelector("#syncPullButton");
  const statusEl  = document.querySelector("#syncPullStatus");
  const webhookEl = document.querySelector("#syncWebhookUrl");

  // Webhook URL 표시
  const webhookUrl = `${API_BASE}/api/webhooks/openproject`;
  if (webhookEl) webhookEl.textContent = webhookUrl;

  if (!projectId) {
    if (pullBtn) pullBtn.disabled = true;
    if (statusEl) statusEl.textContent = "동기화된 프로젝트를 선택하면 상태 가져오기가 활성화됩니다.";
    return;
  }

  const project    = state.projects.find((p) => p.id === projectId);
  const meta       = project?.metadata || {};
  const engineMeta = meta.pm_engine || {};
  const wps        = engineMeta.work_packages || {};
  const wpCount    = Object.keys(wps).length;
  const hasSynced  = wpCount > 0;
  const isAutoSynced = Boolean(engineMeta.auto_synced_on_approval);

  if (pullBtn) pullBtn.disabled = !hasSynced || !canMutateWork();

  if (statusEl) {
    if (!hasSynced) {
      statusEl.textContent = "아직 동기화된 작업 패키지가 없습니다. 승인 시 자동 동기화되거나 수동 동기화를 실행하세요.";
    } else {
      const lastPull  = engineMeta.last_pull_at;
      const lastSync  = engineMeta.last_sync_at;
      const autoNote  = isAutoSynced ? " (승인 시 자동 동기화)" : "";
      const pullNote  = lastPull ? ` · Pull: ${formatTimestamp(lastPull)}` : "";
      const syncNote  = lastSync ? ` · Push: ${formatTimestamp(lastSync)}` : "";
      statusEl.textContent = `${wpCount}개 항목 매핑됨${autoNote}${syncNote}${pullNote}`;
    }
  }
}

/* 자동 동기화 상태 배지 업데이트 */
function renderAutoSyncStatus() {
  const badgeEl = document.querySelector("#autoSyncStatus");
  if (!badgeEl) return;

  const preflight = state.pmPreflight || fallbackPreflight;
  const engine    = preflight.engine || {};
  const ready     = preflight.ready_for_actual_sync;
  const adapter   = engine.adapter || "";
  const isMock    = adapter === "mock";

  if (isMock) {
    badgeEl.textContent = "모의 엔진";
    badgeEl.style.cssText = "background:#fef3c7;color:#92400e;border-color:#fde68a";
  } else if (ready) {
    badgeEl.textContent = "✓ 활성화";
    badgeEl.style.cssText = "background:#dcfce7;color:#15803d;border-color:#bbf7d0";
  } else {
    badgeEl.textContent = "설정 필요";
    badgeEl.style.cssText = "background:#fff1f2;color:#dc2626;border-color:#fecdd3";
  }
}

function renderOpInstanceSection() {
  const preflight  = state.pmPreflight || fallbackPreflight;
  const engine     = preflight.engine || preflight.runtime || {};
  const baseUrl    = engine.base_url || "http://localhost:8080";

  // URL 표시
  const urlEl = document.querySelector("#opInstanceUrl");
  if (urlEl) urlEl.textContent = baseUrl;

  // 열기 버튼 href 업데이트
  const openBtn = document.querySelector("#opInstanceOpenBtn");
  if (openBtn) {
    openBtn.href = baseUrl;
    openBtn.hidden = false;
  }

  // 연결 상태 배지 (preflight checks 기반)
  const statusEl = document.querySelector("#opInstanceStatus");
  if (statusEl) {
    const apiCheck = (preflight.checks || []).find((c) => c.name === "api_root");
    if (apiCheck) {
      if (apiCheck.ok || apiCheck.status === "pass") {
        statusEl.textContent = "● 연결됨";
        statusEl.className   = "op-instance-status online";
      } else if (apiCheck.status === "fail") {
        statusEl.textContent = "● 오프라인";
        statusEl.className   = "op-instance-status offline";
      } else {
        statusEl.textContent = "● 확인 필요";
        statusEl.className   = "op-instance-status checking";
      }
    } else {
      statusEl.textContent = "미확인";
      statusEl.className   = "op-instance-status checking";
    }
  }

  // 메타 정보
  const metaEl = document.querySelector("#opInstanceMeta");
  if (metaEl) {
    const authMode   = engine.auth_mode || "bearer";
    const hasToken   = engine.token_configured ?? Boolean(engine.api_token);
    const syncEnabled = engine.enabled ?? false;
    const adapter    = engine.adapter || "openproject";

    metaEl.innerHTML = [
      `<span class="op-meta-item">어댑터 <strong>${escapeHtml(engineModeLabel(adapter))}</strong></span>`,
      `<span class="op-meta-item">인증 <strong>${escapeHtml(authMode.toUpperCase())}</strong></span>`,
      `<span class="op-meta-item">토큰 <strong>${hasToken ? "✓ 설정됨" : "✗ 미설정"}</strong></span>`,
      `<span class="op-meta-item">실 동기화 <strong>${syncEnabled ? "✓ 허용" : "✗ 비활성"}</strong></span>`,
    ].join("");
  }
}

async function checkOpInstanceConnection() {
  const statusEl  = document.querySelector("#opInstanceStatus");
  const checkBtn  = document.querySelector("#opInstanceCheckBtn");
  if (statusEl) { statusEl.textContent = "● 확인 중…"; statusEl.className = "op-instance-status checking"; }
  if (checkBtn) checkBtn.disabled = true;

  try {
    await refreshEnginePreflight();  // preflight 재실행
    renderOpInstanceSection();
  } catch {
    if (statusEl) { statusEl.textContent = "● 오류"; statusEl.className = "op-instance-status offline"; }
  } finally {
    if (checkBtn) checkBtn.disabled = false;
  }
}

/* 동기화 완료 프로젝트 목록 + OP 뷰 링크 */
function renderSyncedProjectsList() {
  const container   = document.querySelector("#opSyncedProjectList");
  const countEl     = document.querySelector("#syncedProjectCount");
  if (!container) return;

  const engine      = state.pmPreflight?.engine || state.pmPreflight?.runtime || {};
  const baseUrl     = engine.base_url || "http://localhost:8080";
  const syncedProjects = state.projects.filter((p) =>
    (p.status === "Synced" || p.status === "Closed") && p.openproject_project_id
  );

  if (countEl) countEl.textContent = syncedProjects.length;

  if (!syncedProjects.length) {
    container.innerHTML = `<p class="sync-pull-status">동기화 완료된 프로젝트가 없습니다. 승인된 프로젝트를 동기화하면 여기에 표시됩니다.</p>`;
    return;
  }

  container.innerHTML = syncedProjects.map((p) => {
    const meta       = p.metadata || {};
    const engineMeta = meta.pm_engine || {};
    const opProjId   = p.openproject_project_id || engineMeta.project_id || "";
    const opIdentifier = engineMeta.project_identifier || opProjId;

    const wpUrl    = opIdentifier ? `${baseUrl}/projects/${opIdentifier}/work_packages` : "#";
    const ganttUrl = opIdentifier ? `${baseUrl}/projects/${opIdentifier}/work_packages/gantt` : "#";
    const boardUrl = opIdentifier ? `${baseUrl}/projects/${opIdentifier}/work_packages/board` : "#";

    return `
      <div class="op-project-card">
        <div class="op-project-info">
          <strong>${escapeHtml(p.name)}</strong>
          <small>OP ID: ${escapeHtml(opProjId)} · ${escapeHtml(projectTypeLabel(p.template_key))}</small>
        </div>
        <div class="op-project-links">
          <a class="op-link-btn" href="${wpUrl}" target="_blank" rel="noopener" title="작업패키지 목록">
            📋 작업패키지
          </a>
          <a class="op-link-btn" href="${ganttUrl}" target="_blank" rel="noopener" title="간트 차트">
            📊 간트 차트
          </a>
          <a class="op-link-btn secondary" href="${boardUrl}" target="_blank" rel="noopener" title="칸반 보드">
            🗂 보드
          </a>
          <a class="op-link-btn secondary" href="${baseUrl}/projects/${opIdentifier}" target="_blank" rel="noopener" title="OpenProject 프로젝트 홈">
            ↗ OP 홈
          </a>
        </div>
      </div>`;
  }).join("");
}

function renderSyncRuns() {
  document.querySelector("#syncRunCount").textContent = state.syncRuns.length;
  document.querySelector("#syncRunList").innerHTML = state.syncRuns.length
    ? state.syncRuns
        .map((run) => {
          const countText = run.status === "Synced"
            ? `${run.created_work_packages || 0}개 생성`
            : `${run.pending_work_packages || 0}/${run.total_rows || 0} 대기`;
          return `
            <article class="sync-run">
              <div>
                <strong>${escapeHtml(statusLabel(run.status))}</strong>
                <small>${escapeHtml(syncModeLabel(run.mode))} · ${formatTimestamp(run.completed_at || run.started_at)}</small>
              </div>
              <span class="status-pill ${statusClass(run.status)}">${escapeHtml(countText)}</span>
            </article>
          `;
        })
        .join("")
    : `
      <article class="sync-run empty-run">
        <div>
          <strong>실행 없음</strong>
          <small>실행 이력 없음</small>
        </div>
      </article>
    `;
}

function renderOperationsPanel() {
  const health = state.operationsHealth || fallbackOperationsHealth;
  const status = document.querySelector("#operationsStatus");
  if (!status) return;
  status.textContent = operationStatusLabel(health.status);
  status.className = `status-pill ${operationStatusClass(health.status)}`;

  const checks = health.checks?.length ? health.checks : fallbackOperationsHealth.checks;
  document.querySelector("#operationsChecks").innerHTML = checks
    .map(
      (check) => `
        <article class="operation-check">
          <label>
            <input type="checkbox" disabled ${check.status === "pass" ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(operationCheckLabel(check.label))}</strong>
              <small>${escapeHtml(operationCheckMessage(check.message))}</small>
            </span>
          </label>
          <span class="status-pill ${operationStatusClass(check.status)}">${operationStatusLabel(check.status)}</span>
        </article>
      `,
    )
    .join("");
}

function roleOptions(selectedRole) {
  return ["admin", "pmo", "viewer"]
    .map((role) => `<option value="${role}" ${role === selectedRole ? "selected" : ""}>${roleLabel(role)}</option>`)
    .join("");
}

function statusOptions(selectedStatus) {
  return ["Active", "Suspended"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${userStatusLabel(status)}</option>`)
    .join("");
}


/* 감사 로그 이벤트 분류 */
const AUDIT_TAB_TYPES = {
  all:      null,
  auth:     ["auth.login", "auth.logout", "auth.login_failed", "auth.login_locked",
             "auth.password_changed", "auth.password_change_failed"],
  project:  ["project.created", "project.status_changed",
             "import.previewed", "import.created", "import.applied",
             "project_wbs.import_applied", "template.resequenced"],
  approval: ["approval.created", "approval.approved", "approval.rejected"],
  system:   ["user.created", "user.updated", "user.sessions_revoked",
             "setting.updated", "pm_engine.sync_recorded"],
};

function renderAuditPanel() {
  const auditCount = document.querySelector("#auditCount");
  const auditList  = document.querySelector("#auditList");
  if (!auditList) return;

  /* 서브탭 활성화 */
  document.querySelectorAll(".audit-sub-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.auditTab === state.auditTab);
  });

  const allowedTypes = AUDIT_TAB_TYPES[state.auditTab];
  const filtered = allowedTypes
    ? state.auditEvents.filter((e) => allowedTypes.includes(e.event_type))
    : state.auditEvents;

  if (auditCount) auditCount.textContent = filtered.length;

  auditList.innerHTML = filtered.length
    ? filtered.map((event) => `
        <article class="audit-event">
          <div>
            <strong>${escapeHtml(auditSummaryLabel(event.summary))}</strong>
            <small>${escapeHtml(eventTypeLabel(event.event_type))} · ${escapeHtml(event.actor_email || "시스템")}</small>
          </div>
          <span>${escapeHtml(formatTimestamp(event.created_at))}</span>
        </article>`).join("")
    : `<article class="audit-event empty-run"><div><strong>이벤트 없음</strong><small>해당 분류의 감사 이력이 없습니다.</small></div></article>`;
}
