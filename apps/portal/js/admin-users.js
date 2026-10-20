/* 설정 > 사용자 탭 — 소속 그룹·필터·정렬 (origin/main 6/11 이식) */

function activeUserGroups() {
  return (state.userGroups || []).filter((group) => group.status === "Active");
}

function userGroupOptions(selectedGroupId = "", { includeInactive = false, placeholder = "소속 그룹 선택" } = {}) {
  const selected = String(selectedGroupId || "");
  const groups = (state.userGroups || [])
    .filter((group) => includeInactive || group.status === "Active" || String(group.id) === selected)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true }));
  return [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...groups.map((group) => {
      const suffix = group.status === "Suspended" ? " (중지)" : "";
      return `<option value="${escapeHtml(group.id)}" ${String(group.id) === selected ? "selected" : ""}>${escapeHtml(group.name || "미지정")}${suffix}</option>`;
    }),
  ].join("");
}

function renderUserGroupControls() {
  const createSelect = document.querySelector("#userGroupInput");
  const filterSelect = document.querySelector("#userGroupFilter");
  const groupList = document.querySelector("#userGroupList");
  const activeGroups = activeUserGroups();

  if (createSelect) {
    const current = activeGroups.some((group) => String(group.id) === createSelect.value)
      ? createSelect.value
      : activeGroups[0]?.id || "";
    createSelect.innerHTML = userGroupOptions(current);
    createSelect.value = current;
    createSelect.disabled = !activeGroups.length;
  }

  if (filterSelect) {
    const groups = state.userGroups || [];
    const current = groups.some((group) => String(group.id) === state.userGroupFilter) ? state.userGroupFilter : "";
    state.userGroupFilter = current;
    filterSelect.innerHTML = userGroupOptions(current, { includeInactive: true, placeholder: "그룹 전체" });
    filterSelect.value = current;
  }

  if (groupList) {
    groupList.innerHTML = (state.userGroups || []).length
      ? state.userGroups.map((group) => `
          <span class="user-group-chip ${group.status === "Suspended" ? "is-suspended" : ""}" title="${escapeHtml(group.description || group.name || "")}">
            ${escapeHtml(group.name || "미지정")}
            <small>${Number(group.user_count || 0)}명</small>
          </span>
        `).join("")
      : `<span class="user-group-empty">등록된 소속 그룹 없음</span>`;
  }
}

function renderUserTableControls() {
  const roleSelect = document.querySelector("#userRoleFilter");
  const statusSelect = document.querySelector("#userStatusFilter");
  renderUserGroupControls();
  if (roleSelect) {
    const roles = [...new Set(state.users.map((user) => user.role).filter(Boolean))].sort();
    const current = roles.includes(state.userRoleFilter) ? state.userRoleFilter : "";
    state.userRoleFilter = current;
    roleSelect.innerHTML = [
      `<option value="">역할 전체</option>`,
      ...roles.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(roleLabel(role))}</option>`),
    ].join("");
    roleSelect.value = current;
  }
  if (statusSelect) {
    const statuses = [...new Set(state.users.map((user) => user.status).filter(Boolean))].sort();
    const current = statuses.includes(state.userStatusFilter) ? state.userStatusFilter : "";
    state.userStatusFilter = current;
    statusSelect.innerHTML = [
      `<option value="">상태 전체</option>`,
      ...statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(userStatusLabel(status))}</option>`),
    ].join("");
    statusSelect.value = current;
  }
  updateSortButtons("[data-user-sort]", state.userSortKey, state.userSortDir);
}

function renderUsersPanel() {
  if (!document.querySelector("#userRows")) return;
  renderUserTableControls();
  const rows = state.users
    .filter((user) => !state.userRoleFilter || user.role === state.userRoleFilter)
    .filter((user) => !state.userStatusFilter || user.status === state.userStatusFilter)
    .filter((user) => !state.userGroupFilter || user.group_id === state.userGroupFilter)
    .sort((a, b) => compareTableValues(a[state.userSortKey], b[state.userSortKey], state.userSortDir));
  document.querySelector("#userCount").textContent = rows.length;
  document.querySelector("#userRows").innerHTML = rows.length
    ? rows
        .map(
          (user) => `
            <tr data-user-id="${escapeHtml(user.id)}">
              <td>
                <strong>${escapeHtml(user.display_name)}</strong>
                <small>${escapeHtml(user.email)}</small>
                <small>${user.must_change_password ? "비밀번호 변경 필요" : "비밀번호 정상"}</small>
              </td>
              <td>
                <select data-user-field="group_id" aria-label="${escapeHtml(user.email)} 소속 그룹">
                  ${userGroupOptions(user.group_id, { includeInactive: true })}
                </select>
                <small>${escapeHtml(user.group_name || "미지정")}${user.group_status === "Suspended" ? " · 중지" : ""}</small>
              </td>
              <td>
                <select data-user-field="role" aria-label="${escapeHtml(user.email)} 역할">
                  ${roleOptions(user.role)}
                </select>
              </td>
              <td>
                <select data-user-field="status" aria-label="${escapeHtml(user.email)} 상태">
                  ${statusOptions(user.status)}
                </select>
              </td>
              <td>${escapeHtml(user.last_login_at ? formatTimestamp(user.last_login_at) : "-")}</td>
              <td>${escapeHtml(user.active_sessions ?? 0)}</td>
              <td>
                <div class="table-actions">
                  <input data-user-field="password" type="password" minlength="8" placeholder="새 비밀번호" aria-label="${escapeHtml(user.email)} 새 비밀번호" />
                  <button class="table-action" type="button" data-user-action="save">저장</button>
                  <button class="table-action" type="button" data-user-action="revoke">세션 종료</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `
      <tr class="empty-row">
        <td colspan="7">조건에 맞는 사용자 없음</td>
      </tr>
    `;
}

async function createUserGroup() {
  if (!canManageUsers()) return;
  const input = document.querySelector("#userGroupNameInput");
  const status = document.querySelector("#userFormStatus");
  const button = document.querySelector("#userGroupCreateButton");
  const name = input?.value.trim() || "";
  status.textContent = "";
  if (!name) {
    status.textContent = "추가할 소속 그룹명을 입력하세요.";
    return;
  }

  button.disabled = true;
  try {
    await request("/api/user-groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    input.value = "";
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

document.querySelector("#userGroupCreateButton").addEventListener("click", createUserGroup);
document.querySelector("#stgTabUsers").addEventListener("click", (event) => {
  const sortBtn = event.target.closest("[data-user-sort]");
  if (!sortBtn) return;
  const key = sortBtn.dataset.userSort;
  if (state.userSortKey === key) {
    state.userSortDir = state.userSortDir === "asc" ? "desc" : "asc";
  } else {
    state.userSortKey = key;
    state.userSortDir = "asc";
  }
  renderUsersPanel();
});
document.querySelector("#stgTabUsers").addEventListener("change", (event) => {
  const filterKey = { userRoleFilter: "userRoleFilter", userStatusFilter: "userStatusFilter", userGroupFilter: "userGroupFilter" }[event.target.id];
  if (!filterKey) return;
  state[filterKey] = event.target.value;
  renderUsersPanel();
});
