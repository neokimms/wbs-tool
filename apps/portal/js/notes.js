/* AX WBS 포털 — 노트·보고서
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

// ─────────────────────────────────────────────────────────────────────────────
// 노트 / 보고서 모듈  (오프라인 동작 – 외부 CDN 의존성 없음)
// ─────────────────────────────────────────────────────────────────────────────

/* ── 유틸 ── */
function noteToday() {
  return new Date().toISOString().slice(0, 10);
}
function noteFmt(dateStr) {
  if (!dateStr) return "";
  return dateStr.slice(0, 10).replace(/-/g, ".");
}

/* ── API 호출 (공통 request() 사용 — 인증·401·오류 메시지 처리 일원화) ── */
async function loadNoteFolders() {
  try {
    state.noteFolders = await request("/api/notes/folders");
  } catch (e) { /* 오프라인 — 기존 목록 유지 */ }
}

async function loadNotes(folderId = null, q = "") {
  try {
    const params = new URLSearchParams();
    if (folderId) params.set("folder_id", folderId);
    if (q)        params.set("q", q);
    state.notes = await request(`/api/notes?${params}`);
  } catch (e) { state.notes = []; }
}

async function loadNoteContent(noteId) {
  return request(`/api/notes/${noteId}`);
}

async function apiCreateFolder(name) {
  return request("/api/notes/folders", { method: "POST", body: JSON.stringify({ name }) });
}

async function apiRenameFolder(id, name) {
  return request(`/api/notes/folders/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

async function apiDeleteFolder(id) {
  await request(`/api/notes/folders/${id}`, { method: "DELETE" }).catch(() => null);
}

async function apiCreateNote(payload) {
  return request("/api/notes", { method: "POST", body: JSON.stringify(payload) });
}

async function apiSaveNote(id, payload) {
  return request(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

async function apiDeleteNote(id) {
  await request(`/api/notes/${id}`, { method: "DELETE" }).catch(() => null);
}

/* ── 보고서 템플릿 ── */
function getNoteTemplate(key) {
  const today = noteToday();
  const [y, m, d] = today.split("-");
  const week = Math.ceil(parseInt(d) / 7);
  const tpls = {
    weekly: {
      title: `${y}년 ${parseInt(m)}월 ${week}주차 주간 보고`,
      content: `<h2>${y}년 ${parseInt(m)}월 ${week}주차 주간 보고</h2>
<p><strong>보고일:</strong> ${today} &nbsp;|&nbsp; <strong>작성자:</strong> &nbsp;</p>
<hr>
<h3>1. 금주 주요 실적</h3>
<ul><li></li><li></li><li></li></ul>
<h3>2. 차주 계획</h3>
<ul><li></li><li></li><li></li></ul>
<h3>3. 리스크 및 이슈</h3>
<table border="1" class="u-table-full"><tbody>
  <tr><th>구분</th><th>내용</th><th>영향도</th><th>조치계획</th></tr>
  <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</tbody></table>
<h3>4. 특이사항</h3>
<p></p>`,
    },
    monthly: {
      title: `${y}년 ${parseInt(m)}월 월간 보고`,
      content: `<h2>${y}년 ${parseInt(m)}월 월간 보고</h2>
<p><strong>보고일:</strong> ${today} &nbsp;|&nbsp; <strong>작성자:</strong> &nbsp;</p>
<hr>
<h3>1. 월간 실적 요약</h3>
<table border="1" class="u-table-full"><tbody>
  <tr><th>프로젝트</th><th>계획 진척률</th><th>실적 진척률</th><th>SPI</th><th>비고</th></tr>
  <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</tbody></table>
<h3>2. 주요 성과</h3>
<ul><li></li><li></li></ul>
<h3>3. 리스크 현황</h3>
<ul><li></li><li></li></ul>
<h3>4. 익월 계획</h3>
<ul><li></li><li></li></ul>
<h3>5. 경영 보고 사항</h3>
<p></p>`,
    },
    meeting: {
      title: `회의록 - ${today}`,
      content: `<h2>회의록</h2>
<table border="1" class="u-table-full"><tbody>
  <tr><th>일시</th><td>${today}</td><th>장소</th><td>&nbsp;</td></tr>
  <tr><th>참석자</th><td colspan="3">&nbsp;</td></tr>
  <tr><th>안건</th><td colspan="3">&nbsp;</td></tr>
</tbody></table>
<hr>
<h3>논의 내용</h3>
<ol><li></li><li></li><li></li></ol>
<h3>결정 사항</h3>
<ul><li>☐ &nbsp;</li><li>☐ &nbsp;</li></ul>
<h3>다음 회의</h3>
<p><strong>일시:</strong> &nbsp;&nbsp;<strong>장소:</strong> </p>`,
    },
    issue: {
      title: `이슈 보고 - ${today}`,
      content: `<h2>이슈 보고서</h2>
<p><strong>보고일:</strong> ${today} &nbsp;|&nbsp; <strong>작성자:</strong> &nbsp;</p>
<hr>
<h3>이슈 개요</h3>
<table border="1" class="u-table-full"><tbody>
  <tr><th>이슈명</th><td colspan="3">&nbsp;</td></tr>
  <tr><th>발생일</th><td>&nbsp;</td><th>심각도</th><td>[ ] 긴급 &nbsp;[ ] 높음 &nbsp;[ ] 중간 &nbsp;[ ] 낮음</td></tr>
  <tr><th>영향 범위</th><td colspan="3">&nbsp;</td></tr>
</tbody></table>
<h3>이슈 상세</h3>
<p></p>
<h3>원인 분석</h3>
<p></p>
<h3>조치 계획</h3>
<ul><li>☐ &nbsp;</li><li>☐ &nbsp;</li></ul>
<h3>완료 기준</h3>
<p></p>`,
    },
  };
  return tpls[key] || null;
}

/* ── 폴더 트리 렌더링 ── */
function renderFolderTree() {
  const el = document.getElementById("folderTree");
  if (!el) return;
  if (!state.noteFolders.length) {
    el.innerHTML = `<p class="folder-tree-empty">폴더가 없습니다</p>`;
    return;
  }
  el.innerHTML = state.noteFolders.map((f) => {
    const active = f.id === state.selectedFolderId;
    return `<div class="folder-item${active ? " active" : ""}" data-folder-id="${f.id}" role="treeitem" tabindex="0">
      <svg viewBox="0 0 24 24" width="15" height="15" class="folder-icon"><path d="M3 7h7l2 2h9v11H3z"/></svg>
      <span class="folder-name">${escapeHtml(f.name)}</span>
      <div class="folder-actions">
        <button class="folder-action-btn" data-folder-rename="${f.id}" title="이름 변경">✏️</button>
        <button class="folder-action-btn" data-folder-delete="${f.id}" title="삭제">🗑</button>
      </div>
    </div>`;
  }).join("");
}

/* ── 노트 목록 렌더링 ── */
function renderNoteList() {
  const el = document.getElementById("noteList");
  if (!el) return;
  if (!state.notes.length) {
    el.innerHTML = `<div class="note-list-empty">노트가 없습니다<br><small>위의 '+ 새 노트'를 클릭하세요</small></div>`;
    return;
  }
  el.innerHTML = state.notes.map((n) => {
    const active = n.id === state.selectedNoteId;
    return `<div class="note-list-item${active ? " active" : ""}" data-note-id="${n.id}" role="listitem" tabindex="0">
      <div class="note-list-title">${escapeHtml(n.title || "제목 없음")}</div>
      <div class="note-list-meta">${noteFmt(n.updated_at)}</div>
    </div>`;
  }).join("");
}

/* ── 에디터 표시/숨김 ── */
function showNoteEditor(visible) {
  const empty  = document.getElementById("noteEditorEmpty");
  const wrap   = document.getElementById("noteEditorWrap");
  const layout = document.querySelector(".notes-layout");
  if (empty) empty.hidden = visible;
  if (wrap)  wrap.hidden  = !visible;
  if (layout) layout.classList.toggle("editor-open", visible);
}

/* ─────────────────────────────────────────────────────────────
   오프라인 리치 텍스트 에디터 (document.execCommand 기반)
   외부 라이브러리 불필요 – 브라우저 내장 편집 엔진 사용
   ───────────────────────────────────────────────────────────── */

function getNoteEditorEl() {
  return document.getElementById("tiptapEditorEl");
}

function initNoteEditor(content = "") {
  const el = getNoteEditorEl();
  if (!el) return false;

  // contenteditable 영역으로 전환
  el.innerHTML = "";
  el.contentEditable = "true";
  el.spellcheck = false;
  if (!el.getAttribute("data-placeholder")) {
    el.setAttribute("data-placeholder", "내용을 입력하세요…");
  }
  el.innerHTML = content || "";
  el.focus();

  // 변경 감지 → 자동 저장
  el.oninput = () => scheduleNoteSave();

  // 툴바 연결
  const toolbar = document.getElementById("tiptapToolbar");
  if (toolbar && !toolbar._bound) {
    toolbar._bound = true;
    toolbar.addEventListener("mousedown", (e) => {
      // mousedown 에서 preventDefault 해야 에디터 포커스가 유지됨
      const btn = e.target.closest("[data-tt]");
      if (!btn) return;
      e.preventDefault();
      execNoteCmd(btn.dataset.tt);
    });
  }

  return true;
}

function execNoteCmd(cmd) {
  const el = getNoteEditorEl();
  if (!el) return;
  el.focus();

  const cmdMap = {
    bold:        () => document.execCommand("bold"),
    italic:      () => document.execCommand("italic"),
    underline:   () => document.execCommand("underline"),
    strike:      () => document.execCommand("strikeThrough"),
    h1:          () => document.execCommand("formatBlock", false, "<h1>"),
    h2:          () => document.execCommand("formatBlock", false, "<h2>"),
    h3:          () => document.execCommand("formatBlock", false, "<h3>"),
    bulletList:  () => document.execCommand("insertUnorderedList"),
    orderedList: () => document.execCommand("insertOrderedList"),
    taskList:    () => insertTaskItem(),
    codeBlock:   () => document.execCommand("formatBlock", false, "<pre>"),
    blockquote:  () => document.execCommand("formatBlock", false, "<blockquote>"),
    hr:          () => document.execCommand("insertHorizontalRule"),
    table:       () => insertTable(),
    undo:        () => document.execCommand("undo"),
    redo:        () => document.execCommand("redo"),
  };
  if (cmdMap[cmd]) cmdMap[cmd]();
  syncToolbarState();
}

function insertTaskItem() {
  const html = `<ul class="task-list"><li><label><input type="checkbox"> </label></li></ul>`;
  document.execCommand("insertHTML", false, html);
}

function insertTable() {
  const rows = 3, cols = 3;
  let html = `<table border="1" class="u-table-full"><thead><tr>`;
  for (let c = 0; c < cols; c++) html += `<th style="padding:6px 10px;background:#f5f5f7">&nbsp;</th>`;
  html += `</tr></thead><tbody>`;
  for (let r = 0; r < rows - 1; r++) {
    html += `<tr>`;
    for (let c = 0; c < cols; c++) html += `<td style="padding:6px 10px">&nbsp;</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table><p></p>`;
  document.execCommand("insertHTML", false, html);
}

/* 툴바 활성 상태 동기화 */
function syncToolbarState() {
  const toolbar = document.getElementById("tiptapToolbar");
  if (!toolbar) return;
  const checks = {
    bold:       () => document.queryCommandState("bold"),
    italic:     () => document.queryCommandState("italic"),
    underline:  () => document.queryCommandState("underline"),
    strike:     () => document.queryCommandState("strikeThrough"),
    bulletList: () => document.queryCommandState("insertUnorderedList"),
    orderedList:() => document.queryCommandState("insertOrderedList"),
  };
  toolbar.querySelectorAll("[data-tt]").forEach((btn) => {
    const fn = checks[btn.dataset.tt];
    btn.classList.toggle("is-active", fn ? fn() : false);
  });
}

function getNoteHTML() {
  const el = getNoteEditorEl();
  return el ? el.innerHTML : "";
}

/* ── 자동 저장 ── */
function scheduleNoteSave() {
  if (!state.selectedNoteId) return;
  const status = document.getElementById("noteSaveStatus");
  if (status) status.textContent = "저장 중…";
  clearTimeout(state.noteSaveTimer);
  state.noteSaveTimer = setTimeout(async () => {
    if (!state.selectedNoteId) return;
    try {
      const title   = (document.getElementById("noteTitleInput")?.value || "").trim() || "제목 없음";
      const content = getNoteHTML();
      await apiSaveNote(state.selectedNoteId, { title, content });
      const idx = state.notes.findIndex((n) => n.id === state.selectedNoteId);
      if (idx >= 0) state.notes[idx].title = title;
      renderNoteList();
      if (status) status.textContent = "저장됨 " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } catch(e) {
      if (status) status.textContent = "저장 실패";
    }
  }, 1200);
}

/* ── 노트 열기 ── */
async function openNote(noteId) {
  state.selectedNoteId = noteId;
  renderNoteList();
  showNoteEditor(true);

  const titleEl = document.getElementById("noteTitleInput");
  if (titleEl) titleEl.value = "불러오는 중…";

  try {
    const note = await loadNoteContent(noteId);
    if (titleEl) titleEl.value = note.title || "";
    initNoteEditor(note.content || "");
  } catch(e) {
    if (titleEl) titleEl.value = "오류: 노트를 불러올 수 없습니다";
  }
}

/* ── 메인 렌더 ── */
async function renderNotes() {
  await loadNoteFolders();
  await loadNotes(state.selectedFolderId);
  renderFolderTree();
  renderNoteList();
  if (!state.selectedNoteId) showNoteEditor(false);
}

/* ── 이벤트 연결 (패널 진입 1회) ── */
let _notesEventsAttached = false;
function attachNoteEvents() {
  if (_notesEventsAttached) return;
  _notesEventsAttached = true;

  /* 폴더 트리 */
  document.getElementById("folderTree")?.addEventListener("click", async (e) => {
    const renameBtn = e.target.closest("[data-folder-rename]");
    const deleteBtn = e.target.closest("[data-folder-delete]");
    const item      = e.target.closest("[data-folder-id]");
    if (renameBtn) {
      e.stopPropagation();
      const id  = renameBtn.dataset.folderRename;
      const cur = state.noteFolders.find((f) => f.id === id)?.name || "";
      const name = prompt("폴더 이름 변경:", cur);
      if (name && name.trim() && name.trim() !== cur) {
        await apiRenameFolder(id, name.trim());
        await loadNoteFolders();
        renderFolderTree();
      }
    } else if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.dataset.folderDelete;
      const f  = state.noteFolders.find((x) => x.id === id);
      if (confirm(`'${f?.name}' 폴더를 삭제할까요? 폴더 안의 노트는 미분류로 이동됩니다.`)) {
        await apiDeleteFolder(id);
        if (state.selectedFolderId === id) state.selectedFolderId = null;
        await renderNotes();
      }
    } else if (item) {
      const fid = item.dataset.folderId;
      state.selectedFolderId = state.selectedFolderId === fid ? null : fid;
      await loadNotes(state.selectedFolderId);
      renderFolderTree();
      renderNoteList();
    }
  });

  /* 새 폴더 */
  document.getElementById("newFolderBtn")?.addEventListener("click", async () => {
    const name = prompt("새 폴더 이름:");
    if (!name || !name.trim()) return;
    await apiCreateFolder(name.trim());
    await loadNoteFolders();
    renderFolderTree();
  });

  /* 노트 목록 */
  document.getElementById("noteList")?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-note-id]");
    if (!item) return;
    openNote(item.dataset.noteId);
  });

  /* 새 노트 */
  document.getElementById("newNoteBtn")?.addEventListener("click", async () => {
    const note = await apiCreateNote({
      folder_id: state.selectedFolderId || null,
      title: `노트 - ${noteToday()}`,
      content: "",
    });
    state.notes.unshift(note);
    renderNoteList();
    openNote(note.id);
  });

  /* 제목 입력 → 자동 저장 */
  document.getElementById("noteTitleInput")?.addEventListener("input", () => scheduleNoteSave());

  /* 에디터 셀렉션 변경 → 툴바 상태 */
  document.getElementById("tiptapEditorEl")?.addEventListener("keyup", syncToolbarState);
  document.getElementById("tiptapEditorEl")?.addEventListener("mouseup", syncToolbarState);

  /* 노트 삭제 */
  document.getElementById("noteDeleteBtn")?.addEventListener("click", async () => {
    if (!state.selectedNoteId) return;
    const note = state.notes.find((n) => n.id === state.selectedNoteId);
    if (!confirm(`'${note?.title || "이 노트"}'를 삭제할까요?`)) return;
    await apiDeleteNote(state.selectedNoteId);
    state.notes = state.notes.filter((n) => n.id !== state.selectedNoteId);
    state.selectedNoteId = null;
    const el = getNoteEditorEl();
    if (el) { el.innerHTML = ""; el.contentEditable = "false"; }
    renderNoteList();
    showNoteEditor(false);
  });

  /* 템플릿 picker 토글 */
  document.getElementById("noteTemplateBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const picker = document.getElementById("templatePicker");
    if (picker) picker.hidden = !picker.hidden;
  });

  /* 템플릿 선택 */
  document.getElementById("templatePicker")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-tpl]");
    if (!btn) return;
    document.getElementById("templatePicker").hidden = true;
    const key = btn.dataset.tpl;
    const tpl = getNoteTemplate(key);
    if (!tpl) return;

    const editorEl = getNoteEditorEl();
    if (editorEl && editorEl.contentEditable === "true") {
      const titleEl = document.getElementById("noteTitleInput");
      if (titleEl && !titleEl.value.trim()) titleEl.value = tpl.title;
      editorEl.innerHTML = tpl.content;
      scheduleNoteSave();
    } else {
      const note = await apiCreateNote({
        folder_id: state.selectedFolderId || null,
        title: tpl.title,
        content: tpl.content,
        template_key: key,
      });
      state.notes.unshift(note);
      renderNoteList();
      openNote(note.id);
    }
  });

  /* 인쇄 */
  document.getElementById("notePrintBtn")?.addEventListener("click", () => {
    const title   = document.getElementById("noteTitleInput")?.value || "노트";
    const content = getNoteHTML();
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #111; }
        h1,h2,h3 { margin-top: 1.5em; }
        table { border-collapse: collapse; width: 100%; }
        td,th { border: 1px solid #ccc; padding: 6px 10px; }
        code, pre { background: #f4f4f4; }
        blockquote { border-left: 3px solid #ccc; margin: 0; padding-left: 16px; color: #555; }
        @media print { body { margin: 0; } }
      </style>
    </head><body><h1>${escapeHtml(title)}</h1>${content}</body></html>`);
    win.document.close();
    win.print();
  });

  /* 문서 클릭 → picker 닫기 */
  document.addEventListener("click", () => {
    const picker = document.getElementById("templatePicker");
    if (picker && !picker.hidden) picker.hidden = true;
  });

  /* 검색 */
  let _noteSearchTimer = null;
  document.getElementById("noteSearch")?.addEventListener("input", (e) => {
    clearTimeout(_noteSearchTimer);
    _noteSearchTimer = setTimeout(async () => {
      await loadNotes(state.selectedFolderId, e.target.value.trim());
      renderNoteList();
    }, 350);
  });
}

/* ── nav 클릭 → 노트 패널 진입 ── */
document.querySelector(".nav-list")?.addEventListener("click", (e) => {
  const link = e.target.closest("a[href='#notes']");
  if (!link) return;
  setTimeout(() => {
    attachNoteEvents();
    renderNotes();
  }, 50);
}, true);
