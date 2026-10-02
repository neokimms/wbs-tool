/* AX WBS 포털 — WBS 관리 이벤트·상세 패널·사전·변경요청
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ── WBS 계획 이벤트 ──────────────────────────────── */

/* 프로젝트 셀렉트 변경 */
document.querySelector("#wbsPlanProjectSelect").addEventListener("change", (event) => {
  const projectId = event.target.value;
  if (!projectId) return;
  if (projectId === state.wbsPlanProjectId) return;
  if (state.wbsPlanDirty && !window.confirm("저장하지 않은 변경사항이 있습니다. 프로젝트를 변경하시겠습니까?")) {
    // 되돌리기
    event.target.value = state.wbsPlanProjectId || "";
    return;
  }
  loadWbsPlanProject(projectId);
});

/* WBS 보드 — 수정 / 삭제 / 하위추가 / 펼치기 */
/* ── WBS 테이블 이벤트 ───────────────────────────── */

/* 상세 패널 열기 */


function saveWbsDetailPanel() {
  saveWbsDictPartial();  // 새 함수로 위임
  document.querySelector("#wbsDetailPanel").hidden = true;
  state.wbsSelectedCode = null;
  renderWbsPlanTable();
}

/* 상태 팝업 */
function openStatusPopup(code, anchorEl) {
  document.querySelector(".wbs-status-popup")?.remove();
  const popup = document.createElement("div");
  popup.className = "wbs-status-popup";
  const rect = anchorEl.getBoundingClientRect();
  popup.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;
  WBS_STATUSES.forEach((s) => {
    const sc = STATUS_STYLE[s] || STATUS_STYLE["대기"];
    const btn = document.createElement("button");
    btn.className = "wbs-status-option";
    btn.type = "button";
    btn.textContent = s;
    btn.style.background = sc.bg;
    btn.style.color = sc.color;
    btn.addEventListener("click", () => {
      const row = state.wbsPlanRows.find((r) => r.code === code);
      if (row) {
        const meta = (row.metadata && typeof row.metadata === "object") ? { ...row.metadata } : {};
        meta.status = s;
        row.metadata = meta;
        state.wbsPlanDirty = true;
        renderWbsPlanTable();
      }
      popup.remove();
    });
    popup.appendChild(btn);
  });
  document.body.appendChild(popup);
  setTimeout(() => { document.addEventListener("click", () => popup.remove(), { once: true }); }, 0);
}

/* 인라인 편집 */
function startInlineEdit(el, code, field) {
  if (!canMutateWork()) return;
  const row = state.wbsPlanRows.find((r) => r.code === code);
  if (!row) return;
  const currentVal = field === "name" ? (row.name || "") : (row.owner || "");
  const input = document.createElement("input");
  input.className = "wbs-name-input";
  input.value = currentVal;
  el.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const val = input.value.trim();
    if (field === "name" && val) row.name = val;
    if (field === "owner") row.owner = val;
    state.wbsPlanDirty = true;
    renderWbsPlanTable();
  };
  input.addEventListener("blur",    commit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") renderWbsPlanTable(); });
}

/* CSV 내보내기 */
function exportWbsCsv() {
  const rows = state.wbsPlanRows;
  if (!rows.length) return;
  const header = ["WBS코드","작업명","유형","담당자","상태","진행률","우선순위","시작일","종료일","가중치"];
  const lines  = [header.join(",")];
  rows.forEach((r) => {
    const meta = r.metadata || {};
    lines.push([
      r.code, r.name, r.item_type||"작업", r.owner||"",
      meta.status||"대기", (meta.progress??0)+"%",
      meta.priority||"보통", r.start_date||"", r.finish_date||"", r.weight??""
    ].map((v) => `"${String(v).replace(/"/g,'""')}"`).join(","));
  });
  const blob = new Blob(["﻿"+lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = "wbs_export.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* 상태 칩 클릭 */
document.querySelector("#wbsStatusChips")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-chip]");
  if (!chip) return;
  state.wbsStatusFilter = chip.dataset.chip;
  document.querySelectorAll(".wbs-chip").forEach((c) => c.classList.toggle("active", c.dataset.chip === state.wbsStatusFilter));
  renderWbsPlanTable();
});

/* 접기·펼치기·CSV */
document.querySelector("#wbsCollapseAllBtn")?.addEventListener("click", () => {
  // 자식이 있는 모든 항목을 collapsed 처리
  const childMap = buildChildMap(state.wbsPlanRows);
  state.wbsPlanRows.forEach((r) => {
    if (r.code && (childMap[r.code] || []).length > 0) {
      state.wbsExpanded[r.code] = false;
    }
  });
  renderWbsPlanTable();
});
document.querySelector("#wbsExpandAllBtn")?.addEventListener("click", () => {
  state.wbsExpanded = {}; // 모든 항목 undefined → 기본값 expanded
  renderWbsPlanTable();
});

/* 전체 선택 체크박스 */
document.querySelector("#wbsCheckAll")?.addEventListener("change", (event) => {
  const checked = event.target.checked;
  document.querySelectorAll(".wbs-row-check").forEach((cb) => { cb.checked = checked; });
});
document.querySelector("#wbsExportCsvBtn")?.addEventListener("click", exportWbsCsv);
document.querySelector("#wbsExportExcelBtn")?.addEventListener("click", () => {
  const pid = state.selectedProjectId;
  if (!pid) { alert("프로젝트를 먼저 선택하세요."); return; }
  window.location.href = `/api/projects/${pid}/export-excel`;
});
document.querySelector("#wbsExportDocxBtn")?.addEventListener("click", exportWbsDocx);
document.querySelector("#wbsPrintReportBtn")?.addEventListener("click", printWbsReport);

// P2-03: PMO 주간 보고서 Excel 다운로드
document.querySelector("#wbsWeeklyReportBtn")?.addEventListener("click", () => {
  const today = new Date();
  const from = new Date(today); from.setDate(today.getDate() - 7);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `/api/reports/weekly-excel?from_date=${fmt(from)}&to_date=${fmt(today)}`;
  const a = document.createElement("a");
  a.href = url; a.download = ""; a.click();
});

/* 상세 패널 닫기·저장 */
/* ══════════════════════════════════════════════════════
   PHASE 1 기능 — 드래그앤드롭 + WBS사전 + CR
══════════════════════════════════════════════════════ */

/* ── 드래그 앤 드롭 ──────────────────────────────── */
function initWbsDragDrop() {
  const tbody = document.querySelector("#wbsTableBody");
  if (!tbody) return;

  tbody.addEventListener("dragstart", (e) => {
    const tr = e.target.closest("tr[data-code]");
    if (!tr) return;
    state.wbsDragCode = tr.dataset.code;
    e.dataTransfer.effectAllowed = "move";
    tr.style.opacity = "0.5";
  });

  tbody.addEventListener("dragend", (e) => {
    const tr = e.target.closest("tr[data-code]");
    if (tr) tr.style.opacity = "";
    document.querySelectorAll(".wbs-drag-over").forEach((el) => el.classList.remove("wbs-drag-over"));
    state.wbsDragCode = null;
  });

  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const tr = e.target.closest("tr[data-code]");
    document.querySelectorAll(".wbs-drag-over").forEach((el) => el.classList.remove("wbs-drag-over"));
    if (tr && tr.dataset.code !== state.wbsDragCode) tr.classList.add("wbs-drag-over");
  });

  tbody.addEventListener("drop", (e) => {
    e.preventDefault();
    const targetTr = e.target.closest("tr[data-code]");
    if (!targetTr || !state.wbsDragCode || targetTr.dataset.code === state.wbsDragCode) return;

    const dragCode   = state.wbsDragCode;
    const targetCode = targetTr.dataset.code;

    const rows     = state.wbsPlanRows;
    const fromIdx  = rows.findIndex((r) => r.code === dragCode);
    const toIdx    = rows.findIndex((r) => r.code === targetCode);
    if (fromIdx < 0 || toIdx < 0) return;

    // 배열에서 이동
    const [moved] = rows.splice(fromIdx, 1);
    rows.splice(toIdx, 0, moved);

    // sort_order 재설정
    rows.forEach((r, i) => { r.sort_order = i + 1; });

    state.wbsPlanDirty = true;
    renderWbsPlanTable();
  });
}

/* ── WBS 사전 (Detail Panel 탭 확장) ────────────── */
function openWbsDetailPanel(code) {
  const row = state.wbsPlanRows.find((r) => r.code === code);
  if (!row) return;

  // 편집 잠금 확인
  const lockResult = acquireEditLock(code);
  if (lockResult.locked) {
    const ok = window.confirm(`"${lockResult.lockedBy}"이(가) ${lockResult.elapsed}초 전부터 이 항목을 편집 중입니다. 그래도 열겠습니까?`);
    if (!ok) return;
  }

  state.wbsSelectedCode = code;
  state.wbsDictTab = "basic";

  const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata : {};
  const canMutate = canMutateWork();

  document.querySelector("#wbsDetailCode").textContent  = row.code || "-";
  document.querySelector("#wbsDetailTitle").textContent = row.name || "작업 상세";

  // 편집 잠금 배지 표시/숨김
  let lockBadge = document.querySelector("#wbsDetailLockBadge");
  if (!lockBadge) {
    lockBadge = document.createElement("span");
    lockBadge.id = "wbsDetailLockBadge";
    lockBadge.className = "approval-level-badge";
    lockBadge.style.cssText = "margin-left:8px;font-size:0.7rem";
    document.querySelector("#wbsDetailTitle")?.after(lockBadge);
  }
  if (!canMutate) {
    lockBadge.textContent = "🔒 읽기 전용";
    lockBadge.style.display = "inline-block";
  } else if (lockResult && lockResult.locked) {
    lockBadge.textContent = `⚠️ ${lockResult.lockedBy} 편집 중`;
    lockBadge.style.display = "inline-block";
  } else {
    lockBadge.style.display = "none";
  }

  document.querySelector("#wbsDetailPanel").hidden = false;

  renderWbsDictPanel(row, meta, canMutate);
}

function renderWbsDictPanel(row, meta, canMutate) {
  // 상위 항목은 하위 작업 가중 합산(자동 계산) — 진척률 입력 비활성화
  const _rollNode = computeWbsRollupMap(state.wbsPlanRows).get(row.code);
  const _isParent = !!(_rollNode && !_rollNode.isLeaf);
  const _progVal  = _rollNode ? _rollNode.progress : (meta.progress ?? 0);
  const tab     = state.wbsDictTab;
  const code    = row.code || "";
  const version = meta.wbs_version ? `v${meta.wbs_version}` : "v1.0";
  const crList  = Array.isArray(meta.cr_list) ? meta.cr_list : [];
  const dodItems = Array.isArray(meta.dod_items) ? meta.dod_items : [];

  /* 탭 바 (업무 부하 탭 추가) */
  const tabBar = `
    <div class="wbs-dict-tabs">
      <button class="wbs-dict-tab ${tab==="basic"?"active":""}" data-dict-tab="basic">기본</button>
      <button class="wbs-dict-tab ${tab==="dict"?"active":""}" data-dict-tab="dict">사전 <small>(${dodItems.filter(d=>d.done).length}/${dodItems.length})</small></button>
      <button class="wbs-dict-tab ${tab==="scope"?"active":""}" data-dict-tab="scope">범위</button>
      <button class="wbs-dict-tab ${tab==="cr"?"active":""}" data-dict-tab="cr">CR <small>${crList.length?crList.length:""}</small></button>
      <button class="wbs-dict-tab ${tab==="workload"?"active":""}" data-dict-tab="workload">부하</button>
    </div>`;

  let content = "";

  if (tab === "basic") {
    /* 기존 기본 정보 + R&R */
    const statusOpts = WBS_STATUSES.map((s) => `<option value="${s}" ${(meta.status||"대기")===s?"selected":""}>${s}</option>`).join("");
    const prioOpts   = WBS_PRIORITIES.map((p) => `<option value="${p}" ${(meta.priority||"보통")===p?"selected":""}>${p}</option>`).join("");
    const typeOpts   = ["작업","단계","산출물","마일스톤","리스크","이슈","변경요청"].map((t) => `<option value="${t}" ${(row.item_type||"작업")===t?"selected":""}>${t}</option>`).join("");
    const comments   = Array.isArray(meta.comments) ? meta.comments : [];
    const commentHtml = comments.length
      ? comments.map((c) => `<div class="wbs-comment-item"><div class="wbs-comment-meta"><span class="wbs-comment-author">${escapeHtml(c.author||"익명")}</span><span class="wbs-comment-time">${escapeHtml(c.ts||"")}</span></div><p class="wbs-comment-text">${escapeHtml(c.text||"")}</p></div>`).join("")
      : `<p class="u-text-muted-80">코멘트 없음</p>`;

    content = `
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">작업명</label>
        <input id="detailName" value="${escapeHtml(row.name||"")}" ${canMutate?"":"disabled"} />
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">유형</label><select id="detailType" ${canMutate?"":"disabled"}>${typeOpts}</select></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">버전</label><span class="wbs-version-badge">${escapeHtml(version)}</span></div>
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">담당자 (R)</label><input id="detailOwner" value="${escapeHtml(row.owner||"")}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">검토자 (A)</label><input id="detailReviewer" value="${escapeHtml(meta.reviewer||"")}" ${canMutate?"":"disabled"} /></div>
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">승인자 (C)</label><input id="detailApprover" value="${escapeHtml(meta.approver||"")}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">상태</label><select id="detailStatus" ${canMutate?"":"disabled"}>${statusOpts}</select></div>
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">진행률 (${_progVal}%)${_isParent ? ' · <span class="wbs-rollup-hint">하위 작업 가중 합산 — 자동 계산</span>' : ""}</label>
        <input id="detailProgress" type="range" min="0" max="100" value="${_progVal}" ${canMutate && !_isParent?"":"disabled"} style="width:100%;accent-color:var(--blue)" />
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">시작일</label><input id="detailStart" type="date" value="${escapeHtml(row.start_date||"")}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">종료일</label><input id="detailEnd" type="date" value="${escapeHtml(row.finish_date||"")}" ${canMutate?"":"disabled"} /></div>
      </div>
      <div class="wbs-detail-row2">
        <div class="wbs-detail-field"><label class="wbs-detail-label">가중치 (%)</label><input id="detailWeight" type="number" min="0" max="100" value="${row.weight??""}" ${canMutate?"":"disabled"} /></div>
        <div class="wbs-detail-field"><label class="wbs-detail-label">우선순위</label><select id="detailPriority" ${canMutate?"":"disabled"}>${WBS_PRIORITIES.map((p)=>`<option value="${p}" ${(meta.priority||"보통")===p?"selected":""}>${p}</option>`).join("")}</select></div>
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">조직 / 팀</label>
        <input id="detailTeam" value="${escapeHtml(meta.team||"")}" ${canMutate?"":"disabled"} placeholder="예) PMO팀, 개발1팀" />
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">비고 (메모)</label>
        ${canMutate ? createRichTextEditor("detailNotesToolbar", "detailNotesEditor", escapeHtml(meta.notes||"")) : `<div class="rt-editor rt-editor--readonly">${meta.notes||"<em style='color:var(--text-muted)'>비고 없음</em>"}</div>`}
      </div>
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">코멘트 (${comments.length})</label>
        <div class="wbs-comment-list">${commentHtml}</div>
        ${canMutate ? `<div class="wbs-comment-input-row"><textarea id="detailCommentInput" placeholder="코멘트를 입력하세요… @멘션 가능" rows="2"></textarea><button type="button" id="detailCommentSubmit">등록</button></div>` : ""}
      </div>`;
  }

  if (tab === "dict") {
    /* WBS 사전: DoD 체크리스트 + 산출물 */
    const dodHtml = dodItems.map((item, idx) => `
      <div class="wbs-dod-item ${item.done?"done":""}">
        <input type="checkbox" ${item.done?"checked":""} data-dod-idx="${idx}" ${canMutate?"":"disabled"} />
        <span class="wbs-dod-item-text">${escapeHtml(item.text||"")}</span>
        ${canMutate ? `<button class="wbs-dod-del" type="button" data-dod-del="${idx}" title="삭제">×</button>` : ""}
      </div>`).join("");

    const deliverables = Array.isArray(meta.deliverables) ? meta.deliverables : [];
    const delivHtml = deliverables.map((d, idx) => `
      <div class="wbs-deliverable-item">
        <span>📄 ${escapeHtml(d.name||"")}</span>
        ${canMutate ? `<button class="row-act-btn danger" type="button" data-deliv-del="${idx}" style="width:16px;height:16px;font-size:0.6rem">×</button>` : ""}
      </div>`).join("");

    content = `
      <div class="wbs-detail-field">
        <label class="wbs-detail-label">완료 기준 (DoD) — ${dodItems.filter(d=>d.done).length}/${dodItems.length} 완료</label>
        <div class="wbs-dod-list">${dodHtml || '<p class="u-text-muted-80">DoD 항목 없음</p>'}</div>
        ${canMutate ? `<div style="display:flex;gap:6px">
          <input id="dodNewText" type="text" placeholder="새 DoD 항목 입력…" style="flex:1;min-height:28px;border:1px solid var(--line);border-radius:var(--radius);padding:0 8px;font:inherit;font-size:0.8rem" />
          <button class="wbs-add-row-btn" type="button" id="dodAddBtn" style="width:auto;padding:0 10px">+ 추가</button>
        </div>` : ""}
      </div>
      <div class="wbs-detail-field u-mt-12">
        <label class="wbs-detail-label">산출물 목록</label>
        <div>${delivHtml || '<p class="u-text-muted-80">산출물 없음</p>'}</div>
        ${canMutate ? `<div style="display:flex;gap:6px;margin-top:6px">
          <input id="delivNewName" type="text" placeholder="산출물명 입력…" style="flex:1;min-height:28px;border:1px solid var(--line);border-radius:var(--radius);padding:0 8px;font:inherit;font-size:0.8rem" />
          <button class="wbs-add-row-btn" type="button" id="delivAddBtn" style="width:auto;padding:0 10px">+ 추가</button>
        </div>` : ""}
      </div>`;
  }

  if (tab === "scope") {
    /* 범위 정의 */
    const sc = meta.scope || {};
    content = `
      <p style="font-size:0.76rem;color:var(--text-muted);margin:0 0 10px">작업 패키지의 범위를 포함/제외/가정/제약 4가지로 정의합니다.</p>
      <div class="wbs-scope-grid">
        <div class="wbs-scope-card in">
          <label>✅ 포함 (In Scope)</label>
          <textarea id="scopeIn" ${canMutate?"":"disabled"} placeholder="이 작업에 포함되는 내용...">${escapeHtml(sc.in||"")}</textarea>
        </div>
        <div class="wbs-scope-card out">
          <label>❌ 제외 (Out of Scope)</label>
          <textarea id="scopeOut" ${canMutate?"":"disabled"} placeholder="이 작업에서 제외되는 내용...">${escapeHtml(sc.out||"")}</textarea>
        </div>
        <div class="wbs-scope-card assume">
          <label>💡 가정 (Assumptions)</label>
          <textarea id="scopeAssume" ${canMutate?"":"disabled"} placeholder="작업 수행 시 전제 조건...">${escapeHtml(sc.assumptions||"")}</textarea>
        </div>
        <div class="wbs-scope-card const">
          <label>⚠ 제약 (Constraints)</label>
          <textarea id="scopeConst" ${canMutate?"":"disabled"} placeholder="일정/비용/기술적 제약...">${escapeHtml(sc.constraints||"")}</textarea>
        </div>
      </div>`;
  }

  if (tab === "cr") {
    /* 변경 요청 이력 + CR 승인 워크플로우 */
    const statusLabelMap = { "등록": "등록", "승인": "승인", "반려": "반려", undefined: "등록" };
    const crHtml = crList.length
      ? crList.map((cr, idx) => {
          const st        = cr.status || "등록";
          const stCls     = st === "승인" ? "approved" : st === "반려" ? "rejected" : "pending";
          const canDecide = canMutate && st === "등록";
          return `
            <div class="cr-item">
              <div class="cr-item-header">
                <span class="cr-item-title">${escapeHtml(cr.id||"")} ${escapeHtml(cr.title||"")}</span>
                <div style="display:flex;gap:5px;align-items:center">
                  <span class="cr-type-badge">${escapeHtml(cr.type||"")}</span>
                  <span class="cr-status-${stCls}">${escapeHtml(st)}</span>
                  ${canDecide ? `
                    <button class="rt-btn cr-approve-btn" type="button" data-cr-approve="${escapeHtml(cr.id)}" data-cr-code="${escapeHtml(code)}">승인</button>
                    <button class="rt-btn cr-reject-btn"  type="button" data-cr-reject="${escapeHtml(cr.id)}" data-cr-code="${escapeHtml(code)}">반려</button>` : ""}
                </div>
              </div>
              <p class="cr-item-meta">${escapeHtml(cr.requestedBy||"")} · ${escapeHtml(cr.date||"")} · 영향도: ${escapeHtml(cr.impact||"")}
                ${cr.decidedBy ? ` · ${st}: ${escapeHtml(cr.decidedBy)} (${escapeHtml(cr.decidedAt||"")})` : ""}
              </p>
              <p style="font-size:0.78rem;margin:4px 0 0;color:var(--text-muted)">${escapeHtml(cr.reason||"")}</p>
              ${cr.before||cr.after ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;font-size:0.74rem">
                <div style="background:#fff1f2;padding:4px 6px;border-radius:4px"><strong>변경 전:</strong> ${escapeHtml(cr.before||"-")}</div>
                <div style="background:#f0fdf4;padding:4px 6px;border-radius:4px"><strong>변경 후:</strong> ${escapeHtml(cr.after||"-")}</div>
              </div>` : ""}
            </div>`;
        }).join("")
      : `<p style="color:var(--text-muted);font-size:0.82rem">변경 요청 이력 없음</p>`;

    content = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span class="u-text-muted-78">${crList.length}건 (승인: ${crList.filter(c=>c.status==="승인").length} / 반려: ${crList.filter(c=>c.status==="반려").length})</span>
        ${canMutate ? `<button class="wbs-cr-btn" type="button" data-wbs-cr="${escapeHtml(code)}">+ CR 등록</button>` : ""}
      </div>
      <div class="cr-history-list">${crHtml}</div>`;
  }

  if (tab === "workload") {
    /* 업무 부하 가시화 */
    content = `<div id="workloadContainer"></div>`;
  }

  document.querySelector("#wbsDetailBody").innerHTML = tabBar + content;

  /* 탭 전환 이벤트 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-dict-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      saveWbsDictPartial();  // 현재 탭 데이터 저장
      state.wbsDictTab = btn.dataset.dictTab;
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (r) renderWbsDictPanel(r, r.metadata||{}, canMutateWork());
    });
  });

  /* DoD 체크 토글 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-dod-idx]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {}; const items = [...(m.dod_items||[])];
      items[Number(cb.dataset.dodIdx)].done = cb.checked;
      r.metadata = { ...m, dod_items: items }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  });

  /* DoD 삭제 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-dod-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {}; const items = [...(m.dod_items||[])];
      items.splice(Number(btn.dataset.dodDel), 1);
      r.metadata = { ...m, dod_items: items }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  });

  /* DoD 추가 */
  const dodAddBtn = document.querySelector("#dodAddBtn");
  if (dodAddBtn) {
    dodAddBtn.addEventListener("click", () => {
      const input = document.querySelector("#dodNewText");
      const text  = input?.value.trim();
      if (!text) return;
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {};
      const items = [...(m.dod_items||[]), { text, done: false }];
      r.metadata = { ...m, dod_items: items }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  }

  /* 산출물 추가 */
  const delivAddBtn = document.querySelector("#delivAddBtn");
  if (delivAddBtn) {
    delivAddBtn.addEventListener("click", () => {
      const input = document.querySelector("#delivNewName");
      const name  = input?.value.trim();
      if (!name) return;
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {};
      const deliverables = [...(m.deliverables||[]), { name }];
      r.metadata = { ...m, deliverables }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  }

  /* 산출물 삭제 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-deliv-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {}; const arr = [...(m.deliverables||[])];
      arr.splice(Number(btn.dataset.delivDel), 1);
      r.metadata = { ...m, deliverables: arr }; state.wbsPlanDirty = true;
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  });

  /* CR 등록 버튼 (탭 내부) */
  document.querySelector("#wbsDetailBody").querySelector("[data-wbs-cr]")?.addEventListener("click", (e) => {
    openWbsCrDialog(e.target.closest("[data-wbs-cr]").dataset.wbsCr);
  });

  /* CR 승인/반려 버튼 */
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-cr-approve]").forEach(btn => {
    btn.addEventListener("click", () => approveCrItem(btn.dataset.crCode, btn.dataset.crApprove, "승인"));
  });
  document.querySelector("#wbsDetailBody").querySelectorAll("[data-cr-reject]").forEach(btn => {
    btn.addEventListener("click", () => {
      const reason = window.prompt("반려 사유를 입력하세요:");
      if (reason !== null) approveCrItem(btn.dataset.crCode, btn.dataset.crReject, "반려", reason);
    });
  });

  /* 워크로드 탭: renderWorkloadPanel 호출 */
  if (tab === "workload") {
    const wlContainer = document.querySelector("#workloadContainer");
    if (wlContainer) renderWorkloadPanel(wlContainer);
  }

  /* 리치텍스트 에디터 바인딩 (기본 탭 비고 필드) */
  if (tab === "basic" && document.querySelector("#detailNotesToolbar")) {
    bindRichTextEditor("detailNotesToolbar");
  }

  /* 코멘트 @멘션 시스템 연결 */
  const commentInput = document.querySelector("#detailCommentInput");
  if (commentInput) setupMentionSystem(commentInput);

  /* 진행률 실시간 레이블 */
  const progressEl = document.querySelector("#detailProgress");
  if (progressEl) {
    progressEl.addEventListener("input", () => {
      const prev = progressEl.previousElementSibling;
      if (prev) prev.textContent = `진행률 (${progressEl.value}%)`;
    });
  }

  /* 코멘트 등록 */
  const submitBtn = document.querySelector("#detailCommentSubmit");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const input = document.querySelector("#detailCommentInput");
      const text  = input?.value.trim();
      if (!text) return;
      const r = state.wbsPlanRows.find((x) => x.code === state.wbsSelectedCode);
      if (!r) return;
      const m = r.metadata || {}; const comments = [...(m.comments||[])];
      comments.push({ author: state.currentUser?.display_name||"PMO", text, ts: new Date().toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) });
      r.metadata = { ...m, comments }; state.wbsPlanDirty = true;
      if (input) input.value = "";
      renderWbsDictPanel(r, r.metadata, canMutateWork());
    });
  }
}

/* 탭 전환 전 현재 입력 저장 */
function saveWbsDictPartial() {
  const code = state.wbsSelectedCode;
  const row  = code ? state.wbsPlanRows.find((r) => r.code === code) : null;
  if (!row) return;
  const meta = { ...(row.metadata||{}) };
  const tab  = state.wbsDictTab;

  if (tab === "basic") {
    const n = document.querySelector("#detailName")?.value.trim();
    const o = document.querySelector("#detailOwner")?.value.trim();
    if (n) row.name  = n;
    if (o !== undefined) row.owner = o;
    meta.reviewer = document.querySelector("#detailReviewer")?.value.trim() || meta.reviewer;
    meta.approver = document.querySelector("#detailApprover")?.value.trim() || meta.approver;
    meta.status   = document.querySelector("#detailStatus")?.value   || meta.status;
    meta.priority = document.querySelector("#detailPriority")?.value || meta.priority;
    if (!document.querySelector("#detailProgress")?.disabled || !wbsRowIsParent(row.code)) {
      meta.progress = Number(document.querySelector("#detailProgress")?.value ?? meta.progress ?? 0);
    }
    const start   = document.querySelector("#detailStart")?.value;
    const end     = document.querySelector("#detailEnd")?.value;
    if (start !== undefined) row.start_date  = start || null;
    if (end   !== undefined) row.finish_date = end   || null;
    const weight  = document.querySelector("#detailWeight")?.value;
    if (weight !== "") row.weight = weight !== null && weight !== undefined ? Number(weight) : row.weight;
    const type    = document.querySelector("#detailType")?.value;
    if (type) row.item_type = type;
    const notesEl = document.querySelector("#detailNotesEditor");
    if (notesEl) meta.notes = notesEl.innerHTML;
    const teamEl2 = document.querySelector("#detailTeam");
    if (teamEl2 !== null && teamEl2 !== undefined) meta.team = teamEl2.value.trim();
  }
  if (tab === "scope") {
    meta.scope = {
      in:          document.querySelector("#scopeIn")?.value    || "",
      out:         document.querySelector("#scopeOut")?.value   || "",
      assumptions: document.querySelector("#scopeAssume")?.value || "",
      constraints: document.querySelector("#scopeConst")?.value || "",
    };
  }
  row.metadata = meta;
  state.wbsPlanDirty = true;
}

/* ── 변경 요청 (CR) ──────────────────────────────── */
function openWbsCrDialog(code) {
  state.wbsCrTargetCode = code;
  const row  = state.wbsPlanRows.find((r) => r.code === code);
  const meta = row?.metadata || {};
  document.querySelector("#wbsCrDialogTitle").textContent = `변경 요청 — ${escapeHtml(row?.name||code)}`;
  document.querySelector("#crTitle").value  = "";
  document.querySelector("#crReason").value = "";
  document.querySelector("#crBefore").value = "";
  document.querySelector("#crAfter").value  = "";
  document.querySelector("#crScope").value  = "";
  document.querySelector("#wbsCrStatus").textContent = "";
  document.querySelector("#wbsCrDialog").showModal();
}

function applyWbsCrForm() {
  const code    = state.wbsCrTargetCode;
  const row     = code ? state.wbsPlanRows.find((r) => r.code === code) : null;
  if (!row) return;

  const title  = document.querySelector("#crTitle")?.value.trim();
  const type   = document.querySelector("#crType")?.value;
  const impact = document.querySelector("#crImpact")?.value;
  const reason = document.querySelector("#crReason")?.value.trim();
  const before = document.querySelector("#crBefore")?.value.trim();
  const after  = document.querySelector("#crAfter")?.value.trim();
  const scope  = document.querySelector("#crScope")?.value.trim();

  if (!title || !reason) {
    document.querySelector("#wbsCrStatus").textContent = "제목과 변경 사유는 필수입니다.";
    return;
  }

  const meta    = { ...(row.metadata||{}) };
  const crList  = [...(meta.cr_list||[])];
  const crVer   = crList.length + 1;

  // 버전 자동 증가: v1.0 → v1.1 → v1.2
  const curVer  = meta.wbs_version || 1;
  const newVer  = Math.round((curVer + 0.1) * 10) / 10;

  crList.push({
    id:          `CR-${String(crList.length+1).padStart(3,"0")}`,
    title,
    type,
    impact,
    reason,
    before,
    after,
    scope,
    requestedBy: state.currentUser?.display_name || "PMO",
    date:        new Date().toLocaleDateString("ko-KR"),
    status:      "등록",
  });

  meta.cr_list    = crList;
  meta.wbs_version = newVer;
  row.metadata    = meta;
  state.wbsPlanDirty = true;

  document.querySelector("#wbsCrDialog").close();
  state.wbsCrTargetCode = null;

  // 상세 패널이 열려있으면 CR 탭으로 전환
  if (state.wbsSelectedCode === code) {
    state.wbsDictTab = "cr";
    renderWbsDictPanel(row, meta, canMutateWork());
  }
  renderWbsPlanTable();
  showAutoSyncToast(`CR 등록 완료 — ${escapeHtml(title)} (버전 v${newVer})`, "success");
}

function closeWbsDetailPanel({ save = false } = {}) {
  if (save) saveWbsDictPartial();
  if (state.wbsSelectedCode) releaseEditLock(state.wbsSelectedCode);
  document.querySelector("#wbsDetailPanel").hidden = true;
  state.wbsSelectedCode = null;
}
document.querySelector("#wbsDetailClose").addEventListener("click", () => closeWbsDetailPanel({ save: true }));
document.querySelector("#wbsDetailCancelBtn").addEventListener("click", () => closeWbsDetailPanel());
document.querySelector("#wbsDetailSaveBtn").addEventListener("click", saveWbsDetailPanel);

/* 테이블 본체 이벤트 위임 */
document.querySelector("#wbsTableBody").addEventListener("click", (event) => {
  const deleteBtn   = event.target.closest("[data-wbs-delete]");
  const addChildBtn = event.target.closest("[data-wbs-add-child]");
  const toggleBtn   = event.target.closest("[data-wbs-toggle]");
  const detailBtn   = event.target.closest("[data-wbs-detail]");
  const statusBtn   = event.target.closest("[data-wbs-status]");
  const nameSpan    = event.target.closest("[data-wbs-inline-name]");
  const ownerSpan   = event.target.closest("[data-wbs-inline-owner]");

  if (detailBtn)   { openWbsDetailPanel(detailBtn.dataset.wbsDetail); return; }
  if (statusBtn)   { openStatusPopup(statusBtn.dataset.wbsStatus, statusBtn); return; }
  if (nameSpan)    { startInlineEdit(nameSpan, nameSpan.dataset.wbsInlineName, "name"); return; }
  if (ownerSpan)   { startInlineEdit(ownerSpan, ownerSpan.dataset.wbsInlineOwner, "owner"); return; }
  if (toggleBtn)   { state.wbsExpanded[toggleBtn.dataset.wbsToggle] = !isWbsExpanded(toggleBtn.dataset.wbsToggle); renderWbsPlanTable(); return; }
  if (addChildBtn && !addChildBtn.disabled) { openWbsRowDialog("add", { code:null, parent_code:addChildBtn.dataset.wbsAddChild, item_type:"작업" }); return; }
  if (deleteBtn && !deleteBtn.disabled) { deleteWbsRow(deleteBtn.dataset.wbsDelete); return; }
});

/* 기존 wbsBoardRows 이벤트 (더 이상 없으므로 dummy) */
document.querySelector("#wbsBoardRows")?.addEventListener("click", (event) => {
  const editBtn     = event.target.closest("[data-wbs-edit]");
  const deleteBtn   = event.target.closest("[data-wbs-delete]");
  const addChildBtn = event.target.closest("[data-wbs-add-child]");
  const toggleBtn   = event.target.closest("[data-wbs-toggle]");

  if (editBtn && !editBtn.disabled) {
    const row = state.wbsPlanRows.find((r) => r.code === editBtn.dataset.wbsEdit);
    if (row) openWbsRowDialog("edit", row);
    return;
  }
  if (deleteBtn && !deleteBtn.disabled) {
    deleteWbsRow(deleteBtn.dataset.wbsDelete);
    return;
  }
  if (addChildBtn && !addChildBtn.disabled) {
    // 하위 항목 추가: 부모 코드 자동 설정
    const parentCode = addChildBtn.dataset.wbsAddChild;
    openWbsRowDialog("add", { code: null, parent_code: parentCode, item_type: "작업" });
    return;
  }
  if (toggleBtn) {
    const code = toggleBtn.dataset.wbsToggle;
    state.wbsExpanded[code] = !isWbsExpanded(code);
    renderWbsPlanTable();
    return;
  }
});

/* WBS 계획 Excel 다운로드 */
document.querySelector("#wbsPlanDownloadButton").addEventListener("click", downloadWbsPlanExcel);

/* WBS 계획 Excel 업로드 */
document.querySelector("#wbsPlanExcelInput").addEventListener("change", uploadWbsPlanExcel);

/* WBS 행 추가 버튼 */
document.querySelector("#wbsAddRowButton").addEventListener("click", () => {
  openWbsRowDialog("add");
});

/* WBS 저장 버튼 */
document.querySelector("#wbsSaveButton").addEventListener("click", () => {
  saveWbsPlan();
});

/* WBS 초기화 버튼 */
document.querySelector("#wbsClearButton").addEventListener("click", () => {
  clearWbsPlan();
});

/* WBS 행 다이얼로그 닫기/취소 */
document.querySelector("#wbsRowDialogClose").addEventListener("click",  closeWbsRowDialog);
document.querySelector("#wbsRowCancelButton").addEventListener("click", closeWbsRowDialog);

/* WBS 행 다이얼로그 제출 */
document.querySelector("#wbsRowForm").addEventListener("submit", (event) => {
  event.preventDefault();
  applyWbsRowForm();
});

/* WBS 계획 필터 */
document.querySelector("#wbsPlanSearch").addEventListener("input", (event) => {
  state.wbsPlanSearch = event.target.value;
  renderWbsPlanTable();
});
document.querySelector("#wbsPlanPhaseFilter").addEventListener("change", (event) => {
  state.wbsPlanPhaseFilter = event.target.value;
  renderWbsPlanTable();
});
// #wbsPlanTypeFilter는 새 프로 테이블 UI에서 제거됨

/* ── 표준 WBS 개별 다운로드 (인증 포함) ──────────── */
document.querySelector("#templateList").addEventListener("click", (event) => {
  // 미리보기 버튼
  const previewBtn = event.target.closest("[data-template-preview]");
  if (previewBtn) {
    openTemplateDrawer(previewBtn.dataset.templatePreview);
    return;
  }
  // 다운로드 버튼
  const dlBtn = event.target.closest("[data-template-download]");
  if (dlBtn) {
    const key      = dlBtn.dataset.templateDownload;
    const template = state.templates.find((t) => t.key === key);
    const filename = template ? `${template.name}.xlsx` : `${key}.xlsx`;
    if (key) authenticatedDownload(`${API_BASE}/api/templates/${encodeURIComponent(key)}/excel`, filename);
  }
});

/* ── 템플릿 드로어 이벤트 ───────────────────────── */
document.querySelector("#templateDrawerClose").addEventListener("click", closeTemplateDrawer);
document.querySelector("#templateDrawerBackdrop").addEventListener("click", closeTemplateDrawer);
document.querySelector("#templateDrawerDownload").addEventListener("click", () => {
  const key = document.querySelector("#templateDrawerDownload").dataset.templateKey;
  if (!key) return;
  const template = state.templates.find((t) => t.key === key);
  const filename  = template ? `${template.name}.xlsx` : `${key}.xlsx`;
  authenticatedDownload(`${API_BASE}/api/templates/${encodeURIComponent(key)}/excel`, filename);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#templateDrawer").hidden) {
    closeTemplateDrawer();
  }
});

/* ── 승인 이력 이벤트 (테이블 구조) ─────────────────── */
/* 기존 approvalList 이벤트는 approvalRows로 이동 */

window.addEventListener("popstate", () => applyPortalView(window.location.hash, {
  updateHistory: false,
}));

/* 가이드 메뉴 탭 클릭 */
document.querySelector("#guideMenu").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-guide-view]");
  if (!btn) return;
  state.guideSelectedView = btn.dataset.guideView;
  renderGuidePanel();
});

/* 가이드 내부 '이동' 버튼 클릭 → 해당 포털 뷰로 이동 */
document.querySelector("#guideContent").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-guide-navigate]");
  if (!btn) return;
  const targetView = btn.dataset.guideNavigate;
  if (targetView) {
    applyPortalView(`#${targetView}`, { behavior: "smooth" });
  }
});

/* ── 프로젝트 동기화 뷰 이벤트 ──────────────────── */
document.querySelector("#opViewProjectSelect").addEventListener("change", (event) => {
  const pid = event.target.value;
  if (pid !== state.opViewProjectId) loadOpViewProject(pid || null);
});

document.querySelector("#opViewRefreshBtn").addEventListener("click", () => {
  if (state.opViewProjectId) loadOpViewProject(state.opViewProjectId);
});

document.querySelector("#opViewTabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-op-tab]");
  if (tab) switchOpViewTab(tab.dataset.opTab);
});

document.querySelector("#opWpSearch").addEventListener("input", (event) => {
  state.opViewSearch = event.target.value;
  renderOpWorkPackages();
});

document.querySelector("#opWpTypeFilter").addEventListener("change", (event) => {
  state.opViewTypeFilter = event.target.value;
  renderOpWorkPackages();
});

/* WBS 현황 상태 칩 + 접기/펼치기 */
document.querySelector("#opStatusChips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-op-chip]");
  if (!chip) return;
  state.opViewStatusFilter = chip.dataset.opChip;
  document.querySelectorAll("#opStatusChips .wbs-chip").forEach((c) =>
    c.classList.toggle("active", c.dataset.opChip === state.opViewStatusFilter));
  renderOpWorkPackages();
});

/* WBS 현황 테이블 접기/펼치기 (▾/▸) */
document.querySelector("#opWpList").addEventListener("click", (event) => {
  const toggleBtn = event.target.closest("[data-op-toggle]");
  if (toggleBtn) {
    const code = toggleBtn.dataset.opToggle;
    state.wbsExpanded[code] = !isWbsExpanded(code);
    renderOpWorkPackages();
  }
});

/* ── 표준 WBS 탭 전환 ──────────────────────────── */
/* ── 표준 WBS 패널 탭 전환 + 일반 WBS 버튼 ─────── */
document.querySelector("#templates").addEventListener("click", (event) => {
  // 표준/일반 WBS 목록 서브탭 전환
  const listTab = event.target.closest("[data-wbs-list-tab]");
  if (listTab) {
    const listTabId = listTab.dataset.wbsListTab;
    document.querySelectorAll(".wbs-list-tab").forEach((btn) => {
      const isActive = btn.dataset.wbsListTab === listTabId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.querySelectorAll("[data-wbs-list-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.wbsListPanel !== listTabId;
    });
    return;
  }

  // 탭 전환 (목록 ↔ Excel 업로드)
  const tab = event.target.closest("[data-tpl-tab]");
  if (tab) {
    const tabId = tab.dataset.tplTab;
    document.querySelectorAll(".tpl-tab").forEach((btn) => {
      const isActive = btn.dataset.tplTab === tabId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    document.querySelector("#templates").dataset.activeTab = tabId;
    document.getElementById("tplTabList").hidden   = tabId !== "list";
    document.getElementById("tplTabImport").hidden = tabId !== "import";
    return;
  }

  // 일반 WBS 목록 — 미리보기
  const previewBtn = event.target.closest("[data-custom-wbs-preview]");
  if (previewBtn && !previewBtn.disabled) {
    openProjectWbsPreview(previewBtn.dataset.customWbsPreview);
    return;
  }

  // 일반 WBS 목록 — Excel 업로드 탭 이동
  const uploadBtn = event.target.closest("[data-custom-wbs-upload]");
  if (uploadBtn && !uploadBtn.disabled) {
    openCustomWbsUploadTab(uploadBtn.dataset.customWbsUpload);
    return;
  }

  // Excel 업로드 탭 — WBS 유형 토글
  const typeBtn = event.target.closest("[data-import-type]");
  if (typeBtn) {
    setImportType(typeBtn.dataset.importType);
    return;
  }
});

/* 일반 WBS 탭 — 프로젝트 셀렉트 변경 시 반영 버튼 갱신 */
document.querySelector("#importProjectSelect").addEventListener("change", () => {
  renderApplyButton();
});

/* 반영 버튼 — 유형에 따라 분기 */
document.querySelector("#applyImportButton").addEventListener("click", applyImportPreview);

/* CR 다이얼로그 이벤트 */
document.querySelector("#wbsCrClose").addEventListener("click",    () => document.querySelector("#wbsCrDialog").close());
document.querySelector("#wbsCrCancelBtn").addEventListener("click", () => document.querySelector("#wbsCrDialog").close());
document.querySelector("#wbsCrForm").addEventListener("submit", (e) => { e.preventDefault(); applyWbsCrForm(); });

/* WBS 테이블에서 CR 버튼 클릭 */
document.querySelector("#wbsTableBody").addEventListener("click", (e2) => {
  const crBtn = e2.target.closest("[data-wbs-cr]");
  if (crBtn && !crBtn.disabled) openWbsCrDialog(crBtn.dataset.wbsCr);
}, true);  // capture phase로 등록해 기존 리스너보다 먼저 실행

/* ── 날짜 피커 인라인 편집 이벤트 ── */
document.querySelector("#wbsTableBody").addEventListener("change", (event) => {
  const startInput = event.target.closest("[data-wbs-date-start]");
  const endInput   = event.target.closest("[data-wbs-date-end]");
  if (startInput) {
    const row = state.wbsPlanRows.find((r) => r.code === startInput.dataset.wbsDateStart);
    if (row) { row.start_date = startInput.value || null; state.wbsPlanDirty = true; renderWbsPlanTable(); }
  }
  if (endInput) {
    const row = state.wbsPlanRows.find((r) => r.code === endInput.dataset.wbsDateEnd);
    if (row) { row.finish_date = endInput.value || null; state.wbsPlanDirty = true; renderWbsPlanTable(); }
  }
});
