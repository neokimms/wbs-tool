/* AX WBS 포털 — 자원 배분·감사 내보내기·인증/SMTP/테넌트 설정·백업
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ══════════════════════════════════════════════════════════════════
   P3-05: 자원 배분 패널
   ══════════════════════════════════════════════════════════════════ */

async function renderResourcePanel() {
  const body = document.querySelector("#resourceBody");
  if (!body) return;
  if (!state.resourceData) {
    body.innerHTML = `<p class="empty-state">날짜를 선택하고 조회하세요.</p>`;
    return;
  }
  const { from_date, to_date, assignees } = state.resourceData;
  if (!assignees.length) {
    body.innerHTML = `<p class="empty-state">해당 기간에 배정된 작업이 없습니다.</p>`;
    return;
  }
  const rows = assignees.map(a => {
    const pct = a.total_tasks ? Math.round(a.done_tasks / a.total_tasks * 100) : 0;
    const projects = a.projects.map(p =>
      `<div class="res-project-row"><span>${p.project_name}</span><span>${p.task_count}건 (${p.avg_progress}%)</span></div>`
    ).join("");
    return `<tr>
      <td class="res-assignee">${a.assignee}</td>
      <td>${a.total_tasks}</td>
      <td>${a.done_tasks}</td>
      <td>
        <div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width:${pct}%"></div></div>
        <span style="font-size:11px;color:var(--secondary-text)">${pct}%</span>
      </td>
      <td><div class="res-project-list">${projects}</div></td>
    </tr>`;
  }).join("");
  body.innerHTML = `
    <p class="stg-desc u-mb-12">${from_date} ~ ${to_date} 기간 작업 배분 현황</p>
    <table class="ri-table resource-table">
      <thead><tr><th>담당자</th><th>전체</th><th>완료</th><th>진행률</th><th>프로젝트별</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// 자원 배분 조회 버튼
(function initResourcePanel() {
  // 기본 날짜 세팅
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().substring(0,10);
  const todayStr = today.toISOString().substring(0,10);
  const fromEl = document.querySelector("#resourceFrom");
  const toEl   = document.querySelector("#resourceTo");
  if (fromEl) fromEl.value = firstDay;
  if (toEl)   toEl.value   = todayStr;

  document.querySelector("#resourceRefreshBtn")?.addEventListener("click", async () => {
    const from = fromEl?.value || firstDay;
    const to   = toEl?.value || todayStr;
    const btn = document.querySelector("#resourceRefreshBtn");
    btn.disabled = true;
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
