/* AX WBS 포털 — 자원 배분·감사 내보내기·인증/SMTP/테넌트 설정·백업
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ══════════════════════════════════════════════════════════════════
   P3-05: 자원 배분 패널
   ══════════════════════════════════════════════════════════════════ */

async function renderResourcePanel() {
  const body = document.querySelector("#resourceBody");
  if (!body) return;
  renderResourceTabs();
  if (!state.resourceData) {
    body.innerHTML = `
      <div class="resource-context">
        <strong>조회 전</strong>
        <span>기간을 선택한 뒤 조회하면 세 관점의 자원 현황을 탭으로 나누어 확인할 수 있습니다.</span>
      </div>
      <p class="empty-state">날짜를 선택하고 조회하세요.</p>`;
    return;
  }
  const { from_date, to_date } = state.resourceData;
  const viewHtml = state.resourceView === "accounts"
    ? renderResourceAccounts(state.resourceData)
    : state.resourceView === "capacity"
      ? renderResourceCapacity(state.resourceData)
      : renderResourceWorkload(state.resourceData);
  body.innerHTML = `
    <div class="resource-summary">
      <strong>${from_date} ~ ${to_date}</strong>
      <span>${escapeHtml(state.resourceView === "workload" ? "WBS 담당자 기준" : state.resourceView === "accounts" ? "사용자 계정 기준" : "PMO 가동율 기준")} · ${state.resourceData.data_source === "internal_wbs" ? "내부 WBS 데이터" : "데이터 출처 확인 필요"}</span>
    </div>
    ${viewHtml}`;
}

// 자원 배분 조회 버튼
(function initResourcePanel() {
  // 기본 날짜 세팅
  // toISOString 은 UTC 기준이라 KST 에서 월초가 전월 말일로 밀림 → 로컬 날짜로 포맷
  const today = new Date();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const firstDay = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  const todayStr = ymd(today);
  const fromEl = document.querySelector("#resourceFrom");
  const toEl   = document.querySelector("#resourceTo");
  if (fromEl) fromEl.value = firstDay;
  if (toEl)   toEl.value   = todayStr;

  document.querySelector("#resourceTabBar")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-resource-view]");
    if (!btn) return;
    state.resourceView = btn.dataset.resourceView;
    renderResourcePanel();
  });

  document.querySelector("#resourceRefreshBtn")?.addEventListener("click", async () => {
    const from = fromEl?.value || firstDay;
    const to   = toEl?.value || todayStr;
    const btn = document.querySelector("#resourceRefreshBtn");
    btn.disabled = true;
    const body = document.querySelector("#resourceBody");
    if (body) body.innerHTML = `<div class="skeleton-stack"><div class="skeleton-line medium"></div><div class="skeleton-card"></div></div>`;
    try {
      state.resourceData = await request(`/api/reports/resource-load?from_date=${from}&to_date=${to}`);
      renderResourcePanel();
    } catch { document.querySelector("#resourceBody").innerHTML = `<p class="empty-state">데이터를 불러올 수 없습니다.</p>`; }
    finally { btn.disabled = false; }
  });
})();

/* ══════════════════════════════════════════════════════════════════
   P3-06: 감사 로그 CSV 내보내기
   ══════════════════════════════════════════════════════════════════ */

(function initAuditExport() {
  document.addEventListener("click", (e) => {
    if (!e.target.matches("#auditExportCsvBtn")) return;
    const token = state.authToken;
    if (!token) return;
    downloadFile("/api/audit-events/export.csv", `audit-${new Date().toISOString().substring(0, 10)}.csv`)
      .catch(() => alert("CSV 내보내기에 실패했습니다."));
  });
})();

/* ══════════════════════════════════════════════════════════════════
   P3-08: 설정 탭 — 인증(LDAP) · SMTP · 테넌트
   ══════════════════════════════════════════════════════════════════ */

async function renderAuthSettingsTab() {
  if (!state.authSettings) {
    try { state.authSettings = await request("/api/settings/auth"); } catch { return; }
  }
  const d = state.authSettings;
  const setVal = (id, val) => { const el = document.querySelector(`#${id}`); if (el) el.value = val || ""; };
  document.querySelector("#authBackendLabel") && (document.querySelector("#authBackendLabel").textContent = d.auth_backend);
  setVal("ldapServer",     d.ldap_server);
  setVal("ldapPort",       d.ldap_port);
  setVal("ldapBindDN",     d.ldap_bind_dn);
  setVal("ldapBaseDN",     d.ldap_base_dn);
  setVal("ldapUserFilter", d.ldap_user_filter);
  setVal("ldapAttrEmail",  d.ldap_attr_email);
  setVal("ldapAttrName",   d.ldap_attr_name);
  const sslEl = document.querySelector("#ldapUseSSL");
  if (sslEl) sslEl.value = d.ldap_use_ssl ? "true" : "false";
}

document.querySelector("#ldapTestBtn")?.addEventListener("click", async () => {
  const email = document.querySelector("#ldapTestEmail")?.value.trim();
  const pwd   = document.querySelector("#ldapTestPassword")?.value;
  const status = document.querySelector("#ldapTestStatus");
  if (!email || !pwd) { if (status) status.textContent = "이메일과 비밀번호를 입력하세요."; return; }
  if (status) status.textContent = "테스트 중…";
  try {
    const res = await request("/api/settings/auth/test-ldap", { method: "POST", body: JSON.stringify({ email, password: pwd }) });
    if (status) status.textContent = res.message;
    if (status) status.style.color = res.success ? "var(--green)" : "var(--red)";
  } catch { if (status) status.textContent = "테스트 실패"; }
});

function renderSmtpTab() {
  // SMTP는 서버 환경변수 기반 — 현재 설정을 platform settings에서 읽어 표시
  const s = state.settings || {};
  const setTxt = (id, val) => { const el = document.querySelector(`#${id}`); if (el) el.textContent = val || "미설정"; };
  setTxt("smtpHostVal", s.smtp_host);
  setTxt("smtpPortVal", s.smtp_port);
  setTxt("smtpUserVal", s.smtp_user);
  setTxt("smtpFromVal", s.notify_from_email);
}

async function renderTenantsTab() {
  if (!state.tenants.length) {
    try { state.tenants = await request("/api/tenants"); } catch { state.tenants = []; }
    renderTenantSwitcher();
  }
  const tbody = document.querySelector("#tenantTableBody");
  if (!tbody) return;
  if (!state.tenants.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">테넌트가 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.tenants.map(t => `<tr>
    <td><code>${t.id}</code></td>
    <td>${t.name}</td>
    <td><span class="ri-status-pill st-${t.status === 'Active' ? 'open' : 'closed'}">${t.status}</span></td>
    <td>${Number(t.project_count || 0)}개 / ${Number(t.wbs_item_count || 0)}행</td>
    <td>${(t.created_at||'').substring(0,10)}</td>
    <td>
      ${t.id !== 'default' ? `<button class="secondary-button btn-sm" data-tenant-suspend="${t.id}" data-tenant-status="${t.status}">
        ${t.status === 'Active' ? '중지' : '활성화'}
      </button>` : '—'}
    </td>
  </tr>`).join("");
}

// 테넌트 상태 변경
document.querySelector("#tenantTableBody")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-tenant-suspend]");
  if (!btn) return;
  const id = btn.dataset.tenantSuspend;
  const newStatus = btn.dataset.tenantStatus === "Active" ? "Suspended" : "Active";
  try {
    await request(`/api/tenants/${id}?status=${newStatus}`, { method: "PATCH" });
    state.tenants = [];
    renderTenantsTab();
  } catch { alert("상태 변경에 실패했습니다."); }
});

// 테넌트 추가 다이얼로그
(function initTenantDialog() {
  const dialog = document.querySelector("#tenantDialog");
  const form   = document.querySelector("#tenantForm");
  if (!dialog || !form) return;
  document.querySelector("#addTenantBtn")?.addEventListener("click", () => dialog.showModal());
  document.querySelector("#tenantDialogCancel")?.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.querySelector("#tenantFormStatus");
    const btn = document.querySelector("#tenantDialogSubmit");
    btn.disabled = true;
    try {
      await request("/api/tenants", { method: "POST", body: JSON.stringify({
        id: document.querySelector("#tenantId").value.trim(),
        name: document.querySelector("#tenantName").value.trim(),
      })});
      state.tenants = [];
      dialog.close();
      renderTenantsTab();
    } catch(err) {
      if (status) status.textContent = `오류: ${err.message || "추가 실패"}`;
    } finally { btn.disabled = false; }
  });
})();

// 포트폴리오 카드에서 상세 페이지로 이동 연결
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open-project]");
  if (!btn) return;
  openProjectDetail(btn.dataset.openProject);
});

/* ══════════════════════════════════════════════════════════════════
   P3-07: 백업 / 복원 UI
   ══════════════════════════════════════════════════════════════════ */

async function loadBackupList() {
  const tbody = document.querySelector("#backupTableBody");
  if (!tbody) return;
  try {
    const list = await request("/api/operations/backups");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">백업 파일이 없습니다.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(b => `<tr>
      <td style="font-family:monospace;font-size:12px">${b.filename}</td>
      <td>${b.size_human}</td>
      <td>${(b.created_at||'').replace('T',' ').substring(0,19)} UTC</td>
      <td style="white-space:nowrap;display:flex;gap:6px">
        <button class="secondary-button btn-sm" data-backup-download="${b.filename}">다운로드</button>
        <button class="secondary-button btn-sm" style="color:var(--red)" data-backup-delete="${b.filename}">삭제</button>
      </td>
    </tr>`).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">목록을 불러올 수 없습니다.</td></tr>`;
  }
}

(function initBackupUI() {
  // 백업 트리거
  document.querySelector("#backupTriggerBtn")?.addEventListener("click", async () => {
    const btn = document.querySelector("#backupTriggerBtn");
    const status = document.querySelector("#backupStatus");
    btn.disabled = true;
    if (status) { status.textContent = "백업 실행 중…"; status.style.color = "var(--secondary-text)"; }
    try {
      const res = await request("/api/operations/backup", { method: "POST" });
      if (status) { status.textContent = `✓ ${res.filename} (${res.size_human})`; status.style.color = "var(--green)"; }
      await loadBackupList();
    } catch (e) {
      if (status) { status.textContent = `✗ 백업 실패: ${e.message || "오류"}`; status.style.color = "var(--red)"; }
    } finally { btn.disabled = false; }
  });

  // 목록 새로고침
  document.querySelector("#backupRefreshBtn")?.addEventListener("click", loadBackupList);

  // 다운로드 / 삭제 (이벤트 위임)
  document.querySelector("#backupTableBody")?.addEventListener("click", async (e) => {
    const dlBtn  = e.target.closest("[data-backup-download]");
    const delBtn = e.target.closest("[data-backup-delete]");

    if (dlBtn) {
      const filename = dlBtn.dataset.backupDownload;
      downloadFile(`/api/operations/backups/${encodeURIComponent(filename)}`, filename)
        .catch(() => alert("다운로드에 실패했습니다."));
    }

    if (delBtn) {
      const filename = delBtn.dataset.backupDelete;
      if (!confirm(`백업 파일 "${filename}"을 삭제하시겠습니까?`)) return;
      try {
        await request(`/api/operations/backups/${encodeURIComponent(filename)}`, { method: "DELETE" });
        await loadBackupList();
      } catch { alert("삭제에 실패했습니다."); }
    }
  });
})();

// 운영 점검 탭 전환 시 백업 목록 자동 로드
const _origRenderOperationsPanel = typeof renderOperationsPanel === "function" ? renderOperationsPanel : null;
if (_origRenderOperationsPanel) {
  window._p3OperationsPanelPatched = true;
}
// switchSettingsTab에서 operations 탭 전환 시 loadBackupList() 호출
document.querySelector("#settingsTabBar")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".stg-tab[data-stg-tab='operations']");
  if (btn) setTimeout(loadBackupList, 100);
});

/* ── origin/main 이식: renderResourcePanel 의존 헬퍼 ── */
function resourceNumber(value, fractionDigits = 0) {
  const n = Number(value || 0);
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
function renderResourceTabs() {
  document.querySelectorAll("[data-resource-view]").forEach((btn) => {
    const active = btn.dataset.resourceView === state.resourceView;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}
function renderResourceKpis(items) {
  return `
    <div class="resource-kpi-grid">
      ${items.map((item) => `
        <div class="resource-kpi-card">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
        </div>
      `).join("")}
    </div>`;
}
function renderResourceProjectList(projects = []) {
  if (!projects.length) return `<span class="resource-muted">프로젝트 없음</span>`;
  return `
    <div class="res-project-list">
      ${projects.slice(0, 4).map((p) => `
        <div class="res-project-row">
          <span title="${escapeHtml(p.project_name || "")}">${escapeHtml(p.project_name || "-")}</span>
          <span>${resourceNumber(p.task_count)}건 · ${resourceNumber(p.avg_progress, 1)}%</span>
        </div>
      `).join("")}
      ${projects.length > 4 ? `<div class="res-project-more">외 ${projects.length - 4}개 프로젝트</div>` : ""}
    </div>`;
}
function renderResourceTaskList(tasks = []) {
  if (!tasks.length) return `<span class="resource-muted">할당 작업 없음</span>`;
  return `
    <div class="resource-task-list">
      ${tasks.slice(0, 4).map((task) => `
        <div class="resource-task-item">
          <strong>${escapeHtml(task.code || "-")} · ${escapeHtml(task.name || "-")}</strong>
          <span>${escapeHtml(task.project_name || "-")} · ${escapeHtml(task.finish_date || "기한 없음")}</span>
        </div>
      `).join("")}
      ${tasks.length > 4 ? `<div class="res-project-more">외 ${tasks.length - 4}건</div>` : ""}
    </div>`;
}
function resourceProgressCell(value, stateClass = "") {
  const pct = Math.max(0, Math.min(Number(value || 0), 100));
  return `
    <div class="resource-progress-cell">
      <div class="kpi-progress-bar">
        <div class="kpi-progress-fill ${stateClass}" style="width:${pct}%"></div>
      </div>
      <span>${resourceNumber(value, 1)}%</span>
    </div>`;
}
function renderResourceWorkload(data) {
  const summary = data.summary || {};
  const rows = data.assignees || [];
  const kpis = renderResourceKpis([
    { label: "담당자", value: `${resourceNumber(summary.total_assignees)}명`, note: "WBS owner 기준" },
    { label: "배정 작업", value: `${resourceNumber(summary.total_tasks)}건`, note: `${resourceNumber(summary.open_tasks)}건 미완료` },
    { label: "가중치 합계", value: resourceNumber(summary.total_weight, 1), note: "WBS weight 합산" },
    { label: "추정 공수", value: `${resourceNumber(summary.estimated_effort_hours, 1)}h`, note: "미입력 작업은 8h 추정" },
  ]);
  const table = rows.length
    ? `
      <table class="ri-table resource-table">
        <thead>
          <tr>
            <th>담당자</th><th>계정 연결</th><th>전체</th><th>미완료</th><th>가중치</th><th>추정 공수</th><th>평균 진척</th><th>프로젝트별</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((a) => `
            <tr>
              <td class="res-assignee">${escapeHtml(a.assignee || "-")}</td>
              <td>${a.matched_user ? `<span class="resource-match-badge">${escapeHtml(a.matched_user.display_name || a.matched_user.email || "-")}</span>` : `<span class="resource-unmatched">미연결</span>`}</td>
              <td>${resourceNumber(a.total_tasks)}</td>
              <td>${resourceNumber(a.open_tasks)}</td>
              <td>${resourceNumber(a.total_weight, 1)}</td>
              <td>${resourceNumber(a.estimated_effort_hours, 1)}h</td>
              <td>${resourceProgressCell(a.avg_progress)}</td>
              <td>${renderResourceProjectList(a.projects)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : `<p class="empty-state">해당 기간에 배정된 WBS 작업이 없습니다.</p>`;
  return `
    <div class="resource-context">
      <strong>WBS 작업 부하</strong>
      <span>WBS 항목의 담당자(owner) 텍스트를 기준으로 기간과 겹치는 작업을 집계합니다.</span>
    </div>
    ${kpis}
    ${table}`;
}
function renderResourceAccounts(data) {
  const summary = data.summary || {};
  const rows = data.account_tasks || [];
  const unmapped = data.unmapped_assignments || [];
  const activeRows = rows.filter((row) => row.status === "Active");
  const kpis = renderResourceKpis([
    { label: "활성 계정", value: `${resourceNumber(activeRows.length)}명`, note: "현재 테넌트 기준" },
    { label: "할당 계정", value: `${resourceNumber(summary.mapped_accounts)}명`, note: "WBS 담당자와 매핑됨" },
    { label: "미연결 담당자", value: `${resourceNumber(summary.unmapped_assignees)}명`, note: "계정 매핑 필요" },
    { label: "미완료 작업", value: `${resourceNumber(summary.open_tasks)}건`, note: "계정 매핑 포함" },
  ]);
  const table = rows.length
    ? `
      <table class="ri-table resource-table">
        <thead>
          <tr>
            <th>사용자 계정</th><th>역할</th><th>매핑 담당명</th><th>할당</th><th>미완료</th><th>실제 공수</th><th>추정 공수</th><th>주요 작업</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((user) => `
            <tr>
              <td>
                <strong>${escapeHtml(user.display_name || "-")}</strong>
                <span class="resource-account-email">${escapeHtml(user.email || "")}</span>
              </td>
              <td><span class="resource-role-badge">${escapeHtml(user.role || "-")}</span></td>
              <td>${user.matched_owners?.length ? user.matched_owners.map((owner) => `<span class="resource-match-badge">${escapeHtml(owner)}</span>`).join(" ") : `<span class="resource-muted">없음</span>`}</td>
              <td>${resourceNumber(user.total_tasks)}</td>
              <td>${resourceNumber(user.open_tasks)}</td>
              <td>${resourceNumber(user.total_effort_hours, 1)}h</td>
              <td>${resourceNumber(user.estimated_effort_hours, 1)}h</td>
              <td>${renderResourceTaskList(user.tasks)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : `<p class="empty-state">조회 가능한 사용자 계정이 없습니다.</p>`;
  const unmappedHtml = unmapped.length
    ? `
      <div class="resource-alert">
        <strong>계정과 연결되지 않은 담당자</strong>
        <span>${unmapped.map((item) => `${item.assignee} ${item.total_tasks}건`).join(" · ")}</span>
      </div>`
    : "";
  return `
    <div class="resource-context">
      <strong>계정별 할당 모니터링</strong>
      <span>WBS 담당자명을 사용자 표시명, 이메일, 이메일 ID와 매칭해 계정별 작업을 보여줍니다.</span>
    </div>
    ${kpis}
    ${unmappedHtml}
    ${table}`;
}
function renderResourceCapacity(data) {
  const summary = data.summary || {};
  const rows = data.pmo_capacity || [];
  const basis = data.capacity_basis || {};
  const avgUtil = rows.length
    ? rows.reduce((sum, item) => sum + Number(item.utilization_pct || 0), 0) / rows.length
    : 0;
  const kpis = renderResourceKpis([
    { label: "PMO 인원", value: `${resourceNumber(summary.pmo_members)}명`, note: "admin/pmo 역할" },
    { label: "가용 공수", value: `${resourceNumber(summary.pmo_capacity_hours, 1)}h`, note: `${resourceNumber(summary.workdays)}영업일 × ${resourceNumber(basis.daily_hours || 8)}h` },
    { label: "계획 공수", value: `${resourceNumber(summary.pmo_planned_hours, 1)}h`, note: "할당 작업 기준" },
    { label: "평균 가동율", value: `${resourceNumber(avgUtil, 1)}%`, note: "계획 공수 / 가용 공수" },
  ]);
  const table = rows.length
    ? `
      <table class="ri-table resource-table">
        <thead>
          <tr>
            <th>PMO 계정</th><th>역할</th><th>가용 공수</th><th>계획 공수</th><th>가동율</th><th>할당</th><th>미완료</th><th>계산 기준</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>
                <strong>${escapeHtml(item.display_name || "-")}</strong>
                <span class="resource-account-email">${escapeHtml(item.email || "")}</span>
              </td>
              <td><span class="resource-role-badge">${escapeHtml(item.role || "-")}</span></td>
              <td>${resourceNumber(item.capacity_hours, 1)}h</td>
              <td>${resourceNumber(item.planned_hours, 1)}h</td>
              <td>${resourceProgressCell(item.utilization_pct, `resource-util-${item.state || "low"}`)}</td>
              <td>${resourceNumber(item.task_count)}건</td>
              <td>${resourceNumber(item.open_tasks)}건</td>
              <td>${item.inferred_effort_tasks ? `<span class="resource-muted">${resourceNumber(item.inferred_effort_tasks)}건 8h 추정 포함</span>` : `<span class="resource-match-badge">공수 입력 기준</span>`}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : `<p class="empty-state">PMO/admin 계정이 없습니다.</p>`;
  return `
    <div class="resource-context">
      <strong>PMO 인원 가동율</strong>
      <span>admin/pmo 계정의 할당 작업을 기준으로 기간 내 가용 공수 대비 계획 공수를 산정합니다.</span>
    </div>
    ${kpis}
    <p class="resource-note">${escapeHtml(basis.fallback || "공수 미입력 작업은 기본 추정값으로 계산됩니다.")}</p>
    ${table}`;
}