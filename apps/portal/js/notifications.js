/* AX WBS 포털 — 알림 벨·폴링
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ── P2-04: 알림 시스템 ─────────────────────────────────────────────── */

let notifPollTimer = null;

function renderNotifBell() {
  const wrap    = document.querySelector("#notifWrap");
  const badge   = document.querySelector("#notifBadge");
  const list    = document.querySelector("#notifList");
  if (!wrap) return;

  if (!state.currentUser) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const notifs  = state.notifications || [];
  const unread  = notifs.filter((n) => !n.is_read);

  if (badge) {
    badge.hidden = unread.length === 0;
    badge.textContent = unread.length > 9 ? "9+" : String(unread.length);
  }

  if (!list) return;
  list.innerHTML = notifs.length
    ? notifs.slice(0, 20).map((n) => {
        const ago = formatTimeAgo(n.created_at);
        return `
          <div class="notif-item ${n.is_read ? "" : "unread"}" data-notif-id="${escapeHtml(n.id)}">
            <div class="notif-item-title">${escapeHtml(n.title)}</div>
            ${n.body ? `<div class="notif-item-body">${escapeHtml(n.body)}</div>` : ""}
            <div class="notif-item-time">${escapeHtml(ago)}</div>
          </div>`;
      }).join("")
    : `<div class="notif-empty">새 알림이 없습니다.</div>`;
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

async function loadNotifications() {
  try {
    state.notifications = await request("/api/notifications?limit=30");
    renderNotifBell();
  } catch (_) {}
}

function startNotifPolling() {
  if (notifPollTimer) return;
  notifPollTimer = setInterval(() => {
    if (state.currentUser) loadNotifications();
  }, 30000);
}

// 벨 버튼 클릭 — 드롭다운 열기/닫기
document.querySelector("#notifBellBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const dropdown = document.querySelector("#notifDropdown");
  const btn      = document.querySelector("#notifBellBtn");
  if (!dropdown) return;
  const isOpen = !dropdown.hidden;
  dropdown.hidden = isOpen;
  btn.setAttribute("aria-expanded", String(!isOpen));
  if (!isOpen) loadNotifications();
});

// 드롭다운 외부 클릭 시 닫기
document.addEventListener("click", (e) => {
  const wrap = document.querySelector("#notifWrap");
  if (wrap && !wrap.contains(e.target)) {
    const dropdown = document.querySelector("#notifDropdown");
    if (dropdown) dropdown.hidden = true;
  }
});

// 알림 항목 클릭 → 읽음 처리
document.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-notif-id]");
  if (!item) return;
  const nid = item.dataset.notifId;
  try {
    await request(`/api/notifications/${encodeURIComponent(nid)}/read`, { method: "POST" });
    state.notifications = (state.notifications || []).map((n) =>
      n.id === nid ? { ...n, is_read: true } : n
    );
    renderNotifBell();
  } catch (_) {}
});

// 모두 읽음
document.querySelector("#notifReadAll")?.addEventListener("click", async () => {
  try {
    await request("/api/notifications/read-all", { method: "POST" });
    state.notifications = (state.notifications || []).map((n) => ({ ...n, is_read: true }));
    renderNotifBell();
  } catch (_) {}
});

/* 드래그 앤 드롭 초기화 */
