/* AX WBS 포털 — 공지사항
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ── 공지사항 ────────────────────────────────────────────────────── */

(function initAnnouncements() {
  const panel = document.getElementById("announcements");
  if (!panel) return;

  const createBtn   = document.getElementById("createAnnouncementBtn");
  const filterSel   = document.getElementById("announceFilter");
  const listEl      = document.getElementById("announceList");
  const dialog      = document.getElementById("announceDialog");
  const form        = document.getElementById("announceForm");
  const closeBtn    = document.getElementById("announceDialogClose");
  const cancelBtn   = document.getElementById("announceDialogCancel");
  const submitBtn   = document.getElementById("announceDialogSubmit");
  const statusEl    = document.getElementById("announceFormStatus");
  const scopeSel    = document.getElementById("announceScope");
  const tenantCheck = document.getElementById("announceTenantWide");
  const pinnedCheck = document.getElementById("announcePinned");
  const titleInput  = document.getElementById("announceTitle");
  const bodyInput   = document.getElementById("announceBody");

  const detailDialog = document.getElementById("announceDetailDialog");
  const detailTitle  = document.getElementById("announceDetailTitle");
  const detailClose  = document.getElementById("announceDetailClose");
  const detailCancel = document.getElementById("announceDetailCancel");
  const detailScope  = document.getElementById("announceDetailScope");
  const detailInfo   = document.getElementById("announceDetailInfo");
  const detailBody   = document.getElementById("announceDetailBody");
  const detailEdit   = document.getElementById("announceDetailEdit");
  const detailDelete = document.getElementById("announceDetailDelete");
  const detailPinWrap   = document.getElementById("announceDetailPinWrap");
  const detailPinnedChk = document.getElementById("announceDetailPinned");

  let editingId = null;
  let viewingItem = null;
  let allProjects = [];

  async function loadProjects() {
    try {
      const data = await request("/api/projects");
      allProjects = Array.isArray(data) ? data : (data.items || []);
    } catch { allProjects = []; }
  }

  function populateScopeSelect() {
    scopeSel.innerHTML = '<option value="">-- 프로젝트 선택 (선택 안 하면 전사 공지) --</option>' +
      allProjects.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  async function loadList() {
    listEl.innerHTML = '<p class="resource-lead" style="padding:16px">불러오는 중…</p>';
    const filter = filterSel?.value || "all";
    let url = "/api/announcements";
    if (filter === "project") url += "?scope=project";
    else if (filter === "tenant") url += "?scope=tenant";
    try {
      const items = await request(url);
      if (!items.length) {
        listEl.innerHTML = '<p class="resource-lead" style="padding:16px;color:var(--text-muted)">등록된 공지가 없습니다.</p>';
        return;
      }
      listEl.innerHTML = items.map(it => {
        const scopeLabel = it.project_name ? `📁 ${it.project_name}` : "🏢 전사";
        const pinBadge   = it.pinned ? '<span class="ann-pin-badge">📌 고정</span>' : "";
        const date = it.created_at ? new Date(it.created_at).toLocaleDateString("ko-KR") : "";
        return `<div class="announce-card" data-id="${it.id}" tabindex="0" role="button">
          <div class="announce-card-header">
            <span class="announce-scope-badge">${scopeLabel}</span>
            ${pinBadge}
            <span class="announce-card-title">${esc(it.title)}</span>
          </div>
          <div class="announce-card-meta">${esc(it.author_name || "")} · ${date}</div>
        </div>`;
      }).join("");
      listEl.querySelectorAll(".announce-card").forEach(card => {
        card.addEventListener("click", () => openDetail(items.find(i => String(i.id) === card.dataset.id)));
        card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") card.click(); });
      });
    } catch {
      listEl.innerHTML = '<p class="resource-lead" style="padding:16px;color:var(--red)">목록을 불러오지 못했습니다.</p>';
    }
  }

  function openDetail(item) {
    if (!item) return;
    viewingItem = item;
    detailTitle.textContent = item.title;
    detailScope.textContent = item.project_name ? `📁 ${item.project_name}` : "🏢 전사";
    const date = item.created_at ? new Date(item.created_at).toLocaleDateString("ko-KR") : "";
    detailInfo.textContent = `${item.author_name || ""} · ${date}`;
    detailBody.textContent = item.body || "";

    const canEdit = canMutateWork();
    if (detailEdit)   detailEdit.style.display   = canEdit ? "" : "none";
    if (detailDelete) detailDelete.style.display  = canEdit ? "" : "none";
    if (detailPinWrap) {
      detailPinWrap.style.display = canEdit ? "" : "none";
      if (detailPinnedChk) detailPinnedChk.checked = !!item.pinned;
    }
    detailDialog.showModal();
  }

  function openCreate() {
    editingId = null;
    form.reset();
    if (statusEl) statusEl.textContent = "";
    document.getElementById("announceDialogTitle").textContent = "새 공지 작성";
    populateScopeSelect();
    dialog.showModal();
  }

  function openEdit() {
    if (!viewingItem) return;
    editingId = viewingItem.id;
    populateScopeSelect();
    titleInput.value = viewingItem.title || "";
    bodyInput.value  = viewingItem.body  || "";
    pinnedCheck.checked = !!viewingItem.pinned;
    scopeSel.value = viewingItem.project_id || "";
    tenantCheck.checked = !viewingItem.project_id;
    if (statusEl) statusEl.textContent = "";
    document.getElementById("announceDialogTitle").textContent = "공지 수정";
    detailDialog.close();
    dialog.showModal();
  }

  async function submitForm(e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) { if (statusEl) statusEl.textContent = "제목을 입력하세요."; return; }
    const projectId = tenantCheck.checked ? null : (scopeSel.value || null);
    const payload = { title, body: bodyInput.value.trim(), pinned: pinnedCheck.checked, project_id: projectId };
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "저장 중…"; }
    try {
      if (editingId) {
        await request(`/api/announcements/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await request("/api/announcements", { method: "POST", body: JSON.stringify(payload) });
      }
      dialog.close();
      loadList();
    } catch (err) {
      if (statusEl) statusEl.textContent = err?.message || "저장 실패";
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "등록"; }
    }
  }

  async function deleteItem() {
    if (!viewingItem || !confirm(`"${viewingItem.title}" 공지를 삭제하시겠습니까?`)) return;
    try {
      await request(`/api/announcements/${viewingItem.id}`, { method: "DELETE" });
      detailDialog.close();
      loadList();
    } catch { alert("삭제 실패"); }
  }

  function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  // 이벤트 연결
  createBtn?.addEventListener("click", openCreate);
  filterSel?.addEventListener("change", loadList);
  closeBtn?.addEventListener("click", () => dialog.close());
  cancelBtn?.addEventListener("click", () => dialog.close());
  form?.addEventListener("submit", submitForm);
  detailClose?.addEventListener("click", () => detailDialog.close());
  detailCancel?.addEventListener("click", () => detailDialog.close());
  detailEdit?.addEventListener("click", openEdit);
  detailDelete?.addEventListener("click", deleteItem);

  // 권한에 따라 새 글 버튼 표시 (admin/pmo)
  function applyPermission() {
    if (createBtn) createBtn.style.display = canMutateWork() ? "" : "none";
  }

  // 공개 초기화 함수
  window._initAnnouncementsPanel = async function () {
    applyPermission();
    await loadProjects();
    await loadList();
  };
})();

function renderAnnouncementsPanel() {
  if (window._initAnnouncementsPanel) window._initAnnouncementsPanel();
}
