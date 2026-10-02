/* AX WBS 포털 — 리치텍스트·업무부하·승인 타임라인·출력·멘션·편집 잠금
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ══════════════════════════════════════════════════════
   Phase 1 잔여 기능 구현
══════════════════════════════════════════════════════ */

/* ── 3. Depth 설정 ──────────────────────────────── */


/* ── 4. Rich Text 편집기 헬퍼 ───────────────────── */
function createRichTextEditor(id, initialHtml, { placeholder = "내용을 입력하세요…" } = {}) {
  return `
    <div class="rt-toolbar" id="${id}Toolbar">
      <button class="rt-btn" type="button" data-rt-cmd="bold"        title="굵게 (Ctrl+B)"><b>B</b></button>
      <button class="rt-btn" type="button" data-rt-cmd="italic"      title="기울임 (Ctrl+I)"><i>I</i></button>
      <button class="rt-btn" type="button" data-rt-cmd="underline"   title="밑줄 (Ctrl+U)"><u>U</u></button>
      <button class="rt-btn" type="button" data-rt-cmd="insertUnorderedList" title="목록">• —</button>
      <button class="rt-btn" type="button" data-rt-cmd="insertOrderedList"   title="번호 목록">1.</button>
      <button class="rt-btn" type="button" data-rt-cmd="formatBlock:h3"      title="제목">H</button>
    </div>
    <div class="rt-editor" id="${id}" contenteditable="true" data-placeholder="${escapeHtml(placeholder)}">${initialHtml||""}</div>`;
}

function bindRichTextEditor(toolbarId) {
  const toolbar = document.querySelector(`#${toolbarId}`);
  if (!toolbar) return;
  toolbar.querySelectorAll("[data-rt-cmd]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const [cmd, val] = btn.dataset.rtCmd.split(":");
      document.execCommand(cmd, false, val || undefined);
      btn.classList.toggle("active", document.queryCommandState(cmd));
    });
  });
  const editor = toolbar.nextElementSibling;
  if (editor) {
    editor.addEventListener("keyup", () => {
      toolbar.querySelectorAll("[data-rt-cmd]").forEach((btn) => {
        const [cmd] = btn.dataset.rtCmd.split(":");
        btn.classList.toggle("active", document.queryCommandState(cmd));
      });
    });
  }
}

/* ── 5. CR 승인 워크플로우 ──────────────────────── */
function approveCrItem(code, crId, action) {
  const row = state.wbsPlanRows.find((r) => r.code === code);
  if (!row) return;
  const meta   = row.metadata || {};
  const crList = Array.isArray(meta.cr_list) ? [...meta.cr_list] : [];
  const idx    = crList.findIndex((c) => c.id === crId);
  if (idx < 0) return;

  let comment = "";
  if (action === "reject") {
    comment = window.prompt("CR 반려 사유를 입력하세요 (필수):", "");
    if (!comment?.trim()) { alert("반려 사유는 필수입니다."); return; }
  }

  crList[idx].status     = action === "approve" ? "승인" : "반려";
  crList[idx].decidedBy  = state.currentUser?.display_name || "PMO";
  crList[idx].decidedAt  = new Date().toLocaleDateString("ko-KR");
  if (comment) crList[idx].rejectComment = comment;

  // 승인 시 버전 자동 증가 (패치)
  if (action === "approve") {
    const curVer = meta.wbs_version || 1;
    meta.wbs_version = Math.round((curVer + 0.1) * 10) / 10;
    showAutoSyncToast(`CR 승인 완료 — 버전 v${meta.wbs_version}로 갱신`, "success");
  }

  meta.cr_list = crList;
  row.metadata = meta;
  state.wbsPlanDirty = true;

  if (state.wbsSelectedCode === code) {
    state.wbsDictTab = "cr";
    renderWbsDictPanel(row, meta, canMutateWork());
  }
  renderWbsPlanTable();
}

/* ── 6. 업무 부하 가시화 ─────────────────────────── */
function renderWorkloadPanel(containerEl) {
  if (!containerEl) return;
  const rows    = state.wbsPlanRows;
  const persons = {};

  rows.forEach((r) => {
    const owner = r.owner || "미배정";
    if (!persons[owner]) persons[owner] = { tasks: 0, weight: 0, hours: 0 };
    persons[owner].tasks++;
    persons[owner].weight += r.weight ?? 0;
    const effortStr = (r.metadata?.effort || "").replace(/h|시간/gi, "");
    const effort    = parseFloat(effortStr) || 0;
    persons[owner].hours += effort;
  });

  const maxWeight = Math.max(...Object.values(persons).map((p) => p.weight), 1);

  const html = Object.entries(persons)
    .sort((a, b) => b[1].weight - a[1].weight)
    .map(([name, data]) => {
      const pct    = (data.weight / maxWeight * 100).toFixed(1);
      const cls    = data.weight > 50 ? "over" : data.weight > 30 ? "warn" : "ok";
      return `
        <div class="workload-row">
          <span class="workload-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <div class="workload-bar-wrap">
            <div class="workload-bar-fill ${cls}" style="width:${pct}%"></div>
          </div>
          <span class="workload-tasks">${data.tasks}건</span>
          <span class="workload-hours">${data.hours > 0 ? data.hours+"h" : "-"}</span>
        </div>`;
    }).join("") || `<p class="u-text-muted-80">담당자 배정 없음</p>`;

  containerEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-bottom:6px">
      <span>담당자</span><span>바 = 가중치 합 / 건수 / 공수</span>
    </div>
    <div class="workload-section">${html}</div>`;
}

/* ── 8. 승인 이력 타임라인 ──────────────────────── */
function renderApprovalTimeline(container) {
  if (!container) return;
  const approvals = state.approvals;

  if (!approvals.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.84rem;padding:8px">승인 이력 없음</p>`;
    return;
  }

  const statusMap = {
    "Pending":  { cls: "pending",  icon: "⏳", label: "검토 대기" },
    "Approved": { cls: "approved", icon: "✓",  label: "승인 완료" },
    "Rejected": { cls: "rejected", icon: "✗",  label: "반려" },
  };

  const items = approvals.slice().reverse().map((a) => {
    const s   = statusMap[a.status] || { cls: "draft", icon: "◦", label: a.status };
    const dt  = a.decided_at ? formatTimestamp(a.decided_at) : (a.created_at ? formatTimestamp(a.created_at) : "-");
    return `
      <div class="approval-timeline-item">
        <div class="approval-tl-dot ${s.cls}" title="${s.label}">${s.icon}</div>
        <div class="approval-tl-content">
          <div class="approval-tl-title">${escapeHtml(a.project_name||"-")} — ${escapeHtml(a.title||"-")}</div>
          <div class="approval-tl-meta">${s.label} · ${escapeHtml(a.requester||"-")} → ${escapeHtml(a.reviewer||"-")} · ${escapeHtml(dt)}</div>
          ${a.decision_comment ? `<div class="approval-tl-comment">"${escapeHtml(a.decision_comment)}"</div>` : ""}
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="approval-timeline-wrap">
      <div class="approval-timeline-line"></div>
      ${items}
    </div>`;
}

/* ── 9. 멀티레벨 승인 (PM → PMO) ─────────────────── */
const APPROVAL_LEVELS = { 1: "PMO 단일 승인", 2: "PM → PMO 2단계 승인" };


/* ── 10. PDF 보고서 (CSS 인쇄) ────────────────────── */
function printWbsReport() {
  const project = state.projects.find((p) => p.id === state.wbsPlanProjectId);
  const name    = project?.name || "WBS 보고서";
  const origTitle = document.title;
  document.title  = name;
  window.print();
  document.title  = origTitle;
}

/* ── 11. Word(.docx) 출력 ─────────────────────────── */
async function exportWbsDocx() {
  if (!state.wbsPlanProjectId) { alert("프로젝트를 먼저 선택하세요."); return; }
  const statusEl = document.querySelector("#wbsPlanStatus");
  if (statusEl) statusEl.textContent = "Word 문서 생성 중…";
  try {
    const project = state.projects.find((p) => p.id === state.wbsPlanProjectId);
    await downloadFile(
      `/api/projects/${encodeURIComponent(state.wbsPlanProjectId)}/wbs-docx`,
      `${project?.name || "WBS"}_사전.docx`,
    );
    if (statusEl) statusEl.textContent = "Word 문서 다운로드 완료";
  } catch (e) {
    if (statusEl) statusEl.textContent = `Word 출력 실패: ${e.message}`;
  }
}

/* ── 12. @멘션 시스템 ────────────────────────────── */
let mentionPopupState = { active: false, query: "", start: 0, textareaEl: null };

function setupMentionSystem(textareaEl) {
  if (!textareaEl) return;
  textareaEl.addEventListener("input", (e) => {
    const val    = textareaEl.value;
    const cursor = textareaEl.selectionStart;
    const atPos  = val.lastIndexOf("@", cursor - 1);
    if (atPos >= 0 && cursor - atPos <= 20) {
      const query = val.slice(atPos + 1, cursor).toLowerCase();
      mentionPopupState = { active: true, query, start: atPos, textareaEl };
      showMentionPopup(textareaEl, query);
    } else {
      hideMentionPopup();
    }
  });
  textareaEl.addEventListener("keydown", (e) => {
    if (!mentionPopupState.active) return;
    const popup = document.querySelector(".mention-popup");
    if (!popup) return;
    const items = popup.querySelectorAll(".mention-item");
    let activeIdx = [...items].findIndex((el) => el.classList.contains("active"));
    if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(activeIdx + 1, items.length - 1)]?.classList.add("active"); items[activeIdx]?.classList.remove("active"); }
    if (e.key === "ArrowUp")   { e.preventDefault(); items[Math.max(activeIdx - 1, 0)]?.classList.add("active"); items[activeIdx]?.classList.remove("active"); }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); const active = popup.querySelector(".mention-item.active") || popup.querySelector(".mention-item"); if (active) active.click(); }
    if (e.key === "Escape") hideMentionPopup();
  });
}

function showMentionPopup(anchor, query) {
  hideMentionPopup();
  const users = state.users.filter((u) =>
    u.display_name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query)
  ).slice(0, 8);
  if (!users.length) return;

  const popup = document.createElement("div");
  popup.className = "mention-popup";
  const rect = anchor.getBoundingClientRect();
  popup.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;

  users.forEach((u, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `mention-item${i === 0 ? " active" : ""}`;
    item.innerHTML = `<span class="owner-avatar">${(u.display_name[0]||"?").toUpperCase()}</span>${escapeHtml(u.display_name)} <span style="color:var(--text-muted);font-size:0.68rem">${escapeHtml(u.email||"")}</span>`;
    item.addEventListener("click", () => insertMention(u.display_name));
    popup.appendChild(item);
  });

  document.body.appendChild(popup);
  mentionPopupState.active = true;
  setTimeout(() => document.addEventListener("click", hideMentionPopup, { once: true }), 0);
}

function hideMentionPopup() {
  document.querySelector(".mention-popup")?.remove();
  mentionPopupState.active = false;
}

function insertMention(name) {
  const el  = mentionPopupState.textareaEl;
  if (!el) return;
  const val  = el.value;
  const atPos = mentionPopupState.start;
  const after = val.indexOf(" ", atPos) > -1 ? val.indexOf(" ", atPos) : val.length;
  el.value   = val.slice(0, atPos) + `@${name} ` + val.slice(after);
  el.focus();
  hideMentionPopup();
}

/* ── 13. 편집 잠금(Lock) ─────────────────────────── */
const editLocks = {};  // code → {user, since}

function acquireEditLock(code) {
  const user = state.currentUser?.display_name || "PMO";
  if (editLocks[code] && editLocks[code].user !== user) {
    const since = editLocks[code].since;
    const elapsed = Math.floor((Date.now() - since) / 1000);
    if (elapsed < 300) {  // 5분 미만이면 잠금 유지
      return { locked: true, lockedBy: editLocks[code].user, elapsed };
    }
  }
  editLocks[code] = { user, since: Date.now() };
  return { locked: false };
}

function releaseEditLock(code) {
  const user = state.currentUser?.display_name || "PMO";
  if (editLocks[code]?.user === user) delete editLocks[code];
}
