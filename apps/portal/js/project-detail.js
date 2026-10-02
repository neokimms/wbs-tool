/* AX WBS 포털 — 프로젝트 상세
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ══════════════════════════════════════════════════════════════════
   P3-01: 프로젝트 상세 페이지
   ══════════════════════════════════════════════════════════════════ */

async function openProjectDetail(projectId) {
  state.pdTab = "overview";
  state.projectDetail = null;
  state.pdCrList = [];
  state.pdDiffData = null;
  applyPortalView("#projectDetail", { updateHistory: true });
  document.querySelector("#pdTitle").textContent = "로딩 중…";
  try {
    const detail = await request(`/api/projects/${projectId}`);
    state.projectDetail = detail;
    document.querySelector("#pdTitle").textContent = detail.project.name;
    renderProjectDetailBody();
  } catch (e) {
    document.querySelector("#pdBody").innerHTML = `<p class="empty-state">프로젝트를 불러올 수 없습니다.</p>`;
  }
}

function renderProjectDetailBody() {
  const d = state.projectDetail;
  if (!d) return;
  const body = document.querySelector("#pdBody");
  if (!body) return;

  // 탭 활성화
  document.querySelectorAll(".pd-tab").forEach(btn => {
    const active = btn.dataset.pdTab === state.pdTab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (state.pdTab === "overview") {
    const p = d.project;
    const s = d.wbs_summary;
    const meta = p.metadata || {};
    body.innerHTML = `
      <div class="pd-overview-grid">
        <div class="pd-kpi-row">
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">전체 진행률 <span class="kpi-sub" title="${escapeHtml(s.formula || "")}">계획 ${s.planned_pct ?? 0}%</span></span>
            <span class="pd-kpi-value">${s.progress_pct}%</span>
            <div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width:${Math.min(s.progress_pct,100)}%"></div></div>
          </div>
          <div class="pd-kpi-card">
            <span class="pd-kpi-label" title="SPI = 실적(EV) ÷ 계획(PV), 계획 일정 기준">SPI</span>
            <span class="pd-kpi-value ${s.spi != null ? (s.spi >= 1 ? 'kpi-green' : s.spi >= 0.8 ? 'kpi-warn' : 'kpi-red') : ''}">${s.spi != null ? s.spi.toFixed(2) : '—'}</span>
          </div>
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">완료 작업 <span class="kpi-sub">지연 ${s.delayed_items ?? 0}</span></span>
            <span class="pd-kpi-value">${s.done_items}/${s.leaf_items ?? s.total_items}</span>
          </div>
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">미결 리스크</span>
            <span class="pd-kpi-value ${d.risks.filter(r=>r.status!=='Closed').length > 0 ? 'kpi-red' : 'kpi-green'}">${d.risks.filter(r=>r.status!=='Closed').length}</span>
          </div>
          <div class="pd-kpi-card">
            <span class="pd-kpi-label">미결 이슈</span>
            <span class="pd-kpi-value ${d.issues.filter(i=>i.status!=='Closed').length > 0 ? 'kpi-red' : 'kpi-green'}">${d.issues.filter(i=>i.status!=='Closed').length}</span>
          </div>
        </div>
        <dl class="definition-list" style="margin-top:20px">
          <dt>상태</dt><dd>${p.status}</dd>
          <dt>PM</dt><dd>${meta.project_manager || p.owner || '—'}</dd>
          <dt>시작일</dt><dd>${p.start_date || '—'}</dd>
          <dt>종료일</dt><dd>${meta.end_date || '—'}</dd>
          <dt>고객사</dt><dd>${meta.client_name || '—'}</dd>
          <dt>예산</dt><dd>${meta.budget ? Number(meta.budget).toLocaleString() + ' 원' : '—'}</dd>
          <dt>설명</dt><dd>${meta.description || '—'}</dd>
          ${d.last_sync ? `<dt>최근 동기화</dt><dd>${d.last_sync.status} (${(d.last_sync.finished_at||'').substring(0,16)})</dd>` : ''}
        </dl>
      </div>`;
  } else if (state.pdTab === "risks") {
    const rows = d.risks.length === 0
      ? `<tr><td colspan="5" class="empty-state">등록된 리스크가 없습니다.</td></tr>`
      : d.risks.map(r => `<tr>
          <td>${r.wbs_code || '—'}</td>
          <td>${r.title}</td>
          <td><span class="ri-status-pill sev-${r.severity === '높음' ? 'high' : r.severity === '보통' ? 'med' : 'low'}">${r.severity}</span></td>
          <td><span class="ri-status-pill st-${r.status === 'Closed' ? 'closed' : 'open'}">${r.status}</span></td>
          <td>${r.owner}</td>
        </tr>`).join("");
    body.innerHTML = `<table class="ri-table"><thead><tr><th>코드</th><th>제목</th><th>심각도</th><th>상태</th><th>담당</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else if (state.pdTab === "issues") {
    const rows = d.issues.length === 0
      ? `<tr><td colspan="5" class="empty-state">등록된 이슈가 없습니다.</td></tr>`
      : d.issues.map(i => `<tr>
          <td>${i.wbs_code || '—'}</td>
          <td>${i.title}</td>
          <td><span class="ri-status-pill sev-${i.priority === '높음' ? 'high' : i.priority === '보통' ? 'med' : 'low'}">${i.priority}</span></td>
          <td><span class="ri-status-pill st-${i.status === 'Closed' ? 'closed' : 'open'}">${i.status}</span></td>
          <td>${i.assignee || '—'}</td>
        </tr>`).join("");
    body.innerHTML = `<table class="ri-table"><thead><tr><th>코드</th><th>제목</th><th>우선순위</th><th>상태</th><th>담당</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else if (state.pdTab === "approvals") {
    const rows = d.approvals.length === 0
      ? `<tr><td colspan="4" class="empty-state">승인 이력이 없습니다.</td></tr>`
      : d.approvals.map(a => `<tr>
          <td>${a.version || '—'}</td>
          <td>${a.status}</td>
          <td>${a.reviewer_name || '—'}</td>
          <td>${(a.created_at||'').substring(0,10)}</td>
        </tr>`).join("");
    body.innerHTML = `<table class="ri-table"><thead><tr><th>버전</th><th>상태</th><th>검토자</th><th>요청일</th></tr></thead><tbody>${rows}</tbody></table>`;
  } else if (state.pdTab === "meetings") {
    if (typeof renderPdMeetingsTab === "function") renderPdMeetingsTab(body, d);
  } else if (state.pdTab === "members") {
    if (typeof renderPdMembersTab === "function") renderPdMembersTab(body, d);
  } else if (state.pdTab === "cr") {
    renderPdCrTab();
  } else if (state.pdTab === "diff") {
    renderPdDiffTab();
  } else if (state.pdTab === "wbs") {
    body.innerHTML = `<p class="empty-state" style="padding:40px">WBS 상세는 <a href="#wbs-plan" style="color:var(--blue)">WBS 관리</a> 탭에서 확인하세요.</p>`;
  }
}

async function renderPdCrTab() {
  const body = document.querySelector("#pdBody");
  if (!state.projectDetail) return;
  const pid = state.projectDetail.project.id;
  if (!state.pdCrList.length) {
    try { state.pdCrList = await request(`/api/projects/${pid}/change-requests`); } catch { state.pdCrList = []; }
  }
  const rows = state.pdCrList.length === 0
    ? `<tr><td colspan="6" class="empty-state">등록된 변경요청이 없습니다.</td></tr>`
    : state.pdCrList.map(cr => `<tr>
        <td>${cr.version}</td>
        <td>${cr.title}</td>
        <td><span class="ri-status-pill sev-${cr.priority === '높음' ? 'high' : cr.priority === '보통' ? 'med' : 'low'}">${cr.priority}</span></td>
        <td><span class="ri-status-pill st-${cr.status === 'Approved' ? 'closed' : cr.status === 'Rejected' ? 'closed' : 'open'}">${cr.status}</span></td>
        <td>${cr.requested_by || '—'}</td>
        <td>${(cr.created_at||'').substring(0,10)}</td>
      </tr>`).join("");
  body.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="primary-button btn-sm" id="addCrBtn">+ 변경요청 등록</button>
    </div>
    <table class="ri-table"><thead><tr><th>번호</th><th>제목</th><th>우선순위</th><th>상태</th><th>요청자</th><th>등록일</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  document.querySelector("#addCrBtn")?.addEventListener("click", () => {
    document.querySelector("#crDialog")?.showModal();
  });
}

async function renderPdDiffTab() {
  const body = document.querySelector("#pdBody");
  if (!state.projectDetail) return;
  const pid = state.projectDetail.project.id;
  body.innerHTML = `<p class="empty-state">베이스라인과 비교 중…</p>`;
  try {
    const diff = await request(`/api/projects/${pid}/wbs-diff`);
    state.pdDiffData = diff;
    const { summary, added, removed, changed } = diff;
    if (diff.has_baseline === false) {
      body.innerHTML = `<p class="empty-state">아직 베이스라인이 없습니다. WBS 승인 시 기준선이 생성되면 비교할 수 있습니다. (현재 항목 ${summary.added}개)</p>`;
      return;
    }
    if (summary.added + summary.removed + summary.changed === 0) {
      body.innerHTML = `<p class="empty-state">베이스라인과 차이가 없습니다.</p>`;
      return;
    }
    const addedRows = added.map(r => `<tr class="diff-added"><td>+</td><td>${r.code}</td><td>${r.name}</td><td colspan="2">신규 추가</td></tr>`).join("");
    const removedRows = removed.map(r => `<tr class="diff-removed"><td>-</td><td>${r.code}</td><td>${r.name}</td><td colspan="2">삭제됨</td></tr>`).join("");
    const changedRows = changed.map(r => {
      const fieldStr = Object.entries(r.changes).map(([k,v]) => `${k}: ${v.before} → ${v.after}`).join(", ");
      return `<tr class="diff-changed"><td>~</td><td>${r.code}</td><td>${r.name}</td><td colspan="2">${fieldStr}</td></tr>`;
    }).join("");
    body.innerHTML = `
      <div class="diff-summary-bar">
        <span class="diff-badge added">+${summary.added} 추가</span>
        <span class="diff-badge removed">-${summary.removed} 삭제</span>
        <span class="diff-badge changed">~${summary.changed} 변경</span>
        <span class="diff-badge unchanged">${summary.unchanged} 동일</span>
      </div>
      <table class="ri-table diff-table">
        <thead><tr><th>구분</th><th>코드</th><th>항목명</th><th colspan="2">변경 내용</th></tr></thead>
        <tbody>${addedRows}${removedRows}${changedRows}</tbody>
      </table>`;
  } catch {
    body.innerHTML = `<p class="empty-state">베이스라인이 없거나 비교에 실패했습니다.</p>`;
  }
}

// 프로젝트 상세 탭 클릭 이벤트
(function initProjectDetailTabs() {
  const tabBar = document.querySelector("#pdTabBar");
  if (!tabBar) return;
  tabBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".pd-tab[data-pd-tab]");
    if (!btn) return;
    state.pdTab = btn.dataset.pdTab;
    state.pdCrList = [];
    state.pdDiffData = null;
    renderProjectDetailBody();
  });
  document.querySelector("#pdBackBtn")?.addEventListener("click", () => {
    applyPortalView("#portfolio", { behavior: "smooth" });
  });
})();

// CR 다이얼로그 제출
(function initCrDialog() {
  const dialog = document.querySelector("#crDialog");
  const form   = document.querySelector("#crForm");
  if (!dialog || !form) return;
  document.querySelector("#crDialogCancel")?.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.querySelector("#crFormStatus");
    const btn = document.querySelector("#crDialogSubmit");
    const pid = state.projectDetail?.project?.id;
    if (!pid) return;
    btn.disabled = true;
    try {
      const payload = {
        title: document.querySelector("#crTitle").value.trim(),
        priority: document.querySelector("#crPriority").value,
        requested_by: document.querySelector("#crRequestedBy").value.trim(),
        wbs_code: document.querySelector("#crWbsCode").value.trim() || null,
        impact_schedule_days: parseInt(document.querySelector("#crScheduleDays").value)||null,
        impact_cost: parseFloat(document.querySelector("#crCost").value)||null,
        impact_scope: document.querySelector("#crImpactScope").value.trim(),
        description: document.querySelector("#crDescription").value.trim(),
      };
      const cr = await request(`/api/projects/${pid}/change-requests`, { method: "POST", body: JSON.stringify(payload) });
      state.pdCrList.unshift(cr);
      status.textContent = `${cr.version} 등록 완료`;
      setTimeout(() => { dialog.close(); renderPdCrTab(); }, 800);
    } catch(err) {
      status.textContent = `오류: ${err.message || "등록 실패"}`;
    } finally { btn.disabled = false; }
  });
})();
