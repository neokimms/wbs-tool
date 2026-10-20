/* AX WBS 포털 — 설정 탭·사용자 가이드 렌더링
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ── 설정 탭 전환 ──────────────────────────────── */
const STG_TABS = ["platform", "policy", "approvals", "operations", "users", "audit", "openproject", "auth", "smtp", "tenants"];

function switchSettingsTab(tabId) {
  if (!STG_TABS.includes(tabId)) return;
  state.settingsTab = tabId;

  document.querySelectorAll(".stg-tab").forEach((btn) => {
    const active = btn.dataset.stgTab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  STG_TABS.forEach((t) => {
    const el = document.getElementById(`stgTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (el) el.hidden = t !== tabId;
  });

  // 탭 전환 시 콘텐츠 렌더링
  if (tabId === "approvals")    renderSettingsApprovals();
  if (tabId === "policy")       renderProjectPolicyPanel();
  if (tabId === "operations")   renderOperationsPanel();
  if (tabId === "users")        renderUsersPanel();
  if (tabId === "audit")        renderAuditPanel();
  if (tabId === "platform")     renderSettingsPanel();
  if (tabId === "openproject")  { renderSyncPanel(); renderSyncedProjectsList(); }
  if (tabId === "auth")         renderAuthSettingsTab();
  if (tabId === "smtp")         renderSmtpTab();
  if (tabId === "tenants")      renderTenantsTab();
}

function renderSettingsApprovals() {
  const container = document.querySelector("#stgApprovalList");
  if (!container) return;

  // 상단: 승인 파이프라인 + 타임라인 뷰
  const tlWrap = document.createElement("div");
  tlWrap.style.marginBottom = "20px";
  renderApprovalTimeline(tlWrap);

  // 하단: 테이블 형식 이력
  const tableWrap = document.createElement("div");
  renderApprovalTable(tableWrap);

  container.innerHTML = "";
  container.appendChild(tlWrap);
  container.appendChild(tableWrap);
}

function selectedSetting() {
  const settings = state.settings?.settings || [];
  return settings.find((setting) => setting.key === state.selectedSettingKey) || settings[0] || null;
}

function renderSettingsPanel() {
  // 설정 탭이 보이지 않는 경우 DOM 없음 방지
  if (!document.querySelector("#settingsCards")) return;
  const settings = state.settings?.settings || [];
  const selector = document.querySelector("#settingsKeySelect");
  if (!settings.some((setting) => setting.key === state.selectedSettingKey)) {
    state.selectedSettingKey = settings[0]?.key || "pm_engine";
  }
  selector.innerHTML = settings.length
    ? settings.map((setting) => `<option value="${escapeHtml(setting.key)}">${escapeHtml(settingLabel(setting.label))}</option>`).join("")
    : '<option value="">설정 없음</option>';
  selector.value = state.selectedSettingKey;
  selector.disabled = !settings.length;

  const setting = selectedSetting();
  document.querySelector("#settingsCards").innerHTML = settings.length
    ? settings
        .map(
          (item) => `
            <button class="setting-card ${item.key === state.selectedSettingKey ? "selected-setting-card" : ""}" type="button" data-setting-key="${escapeHtml(item.key)}">
              <strong>${escapeHtml(settingLabel(item.label))}</strong>
              <span>${escapeHtml(settingCategoryLabel(item.category))} · ${escapeHtml(item.key)}</span>
              <small>${escapeHtml(item.description)}</small>
            </button>
          `,
        )
        .join("")
    : `
      <article class="setting-card empty-run">
        <strong>설정 없음</strong>
        <span>설정 정보 없음</span>
      </article>
    `;

  const engine = state.settings?.pm_engine || state.pmPreflight?.engine || {};
  document.querySelector("#settingsEngineMode").textContent = `${engine.display_name || engineModeLabel(engine.adapter || "openproject")} · ${engineModeLabel(engine.mode || "adapter")}`;
  document.querySelector("#settingsEngineBoundary").textContent = engine.dependency_boundary || "pm-engine-api";
  document.querySelector("#settingsEngineRuntime").textContent = externalIntegrationEnabled()
    ? (engine.enabled ? "실제 기준선 반영 허용" : "모의 반영 보호")
    : "외부 연동 사용 안 함";
  document.querySelector("#settingsJsonInput").value = setting ? JSON.stringify(setting.value || {}, null, 2) : "{}";
  document.querySelector("#settingsJsonInput").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsSaveButton").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsStatus").textContent = state.settingsStatus;
  const externalToggle = document.querySelector("#externalIntegrationToggle");
  if (externalToggle) {
    externalToggle.checked = externalIntegrationEnabled();
    externalToggle.disabled = !canManageUsers();
  }
}

/* ── 사용자 가이드 렌더링 ───────────────────────────────────────────── */

function guideToneClass(tone) {
  const map = { good: "good", warn: "warn", bad: "bad", info: "info", blocked: "info", neutral: "" };
  return map[tone] || "";
}

function guideNavButton(targetView, label, tone) {
  if (!targetView) return "";
  const cls = `guide-nav-btn ${guideToneClass(tone)}`;
  return `<button class="${cls}" type="button" data-guide-navigate="${escapeHtml(targetView)}">${escapeHtml(label)} →</button>`;
}

function renderGuideHero(hero) {
  const tags = (hero.tags || []).map((t) => `<span class="guide-tag">${escapeHtml(t)}</span>`).join("");
  return `
    <div class="guide-hero">
      <p class="guide-hero-eyebrow">${escapeHtml(hero.eyebrow || "")}</p>
      <h3>${escapeHtml(hero.title)}</h3>
      ${hero.description ? `<p>${escapeHtml(hero.description)}</p>` : ""}
      ${tags ? `<div class="guide-tag-row">${tags}</div>` : ""}
    </div>`;
}

function renderGuideSummary(items) {
  if (!items || !items.length) return "";
  const cards = items.map((item) => `
    <div class="guide-summary-card ${guideToneClass(item.tone)}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">핵심 요약</h4>
      <div class="guide-summary-grid">${cards}</div>
    </div>`;
}

function renderGuideActions(actions) {
  if (!actions || !actions.length) return "";
  const items = actions.map((action) => `
    <div class="guide-action-item">
      <div>
        <strong>${escapeHtml(action.label)}</strong>
        ${action.description ? `<span>${escapeHtml(action.description)}</span>` : ""}
      </div>
      ${guideNavButton(action.targetView, "이동", action.tone)}
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">바로 실행</h4>
      <div class="guide-action-list">${items}</div>
    </div>`;
}

function renderGuideSteps(steps) {
  if (!steps || !steps.length) return "";
  const sorted = [...steps].sort((a, b) => (a.order || 0) - (b.order || 0));
  const items = sorted.map((step) => {
    const checks = (step.checks || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");
    const caution = step.caution ? `<div class="guide-caution">⚠ ${escapeHtml(step.caution)}</div>` : "";
    return `
      <div class="guide-step ${escapeHtml(step.status || "")}">
        <div class="guide-step-num">${escapeHtml(String(step.order || ""))}</div>
        <div class="guide-step-body">
          <strong>${escapeHtml(step.title)}</strong>
          ${step.outcome ? `<p>${escapeHtml(step.outcome)}</p>` : ""}
          ${checks ? `<ul class="guide-check-list">${checks}</ul>` : ""}
          ${caution}
          ${guideNavButton(step.targetView, "관련 화면", "info")}
        </div>
      </div>`;
  }).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">절차</h4>
      <div class="guide-timeline">${items}</div>
    </div>`;
}

function renderGuideTasks(tasks) {
  if (!tasks || !tasks.length) return "";
  const items = tasks.map((task) => {
    const checks = (task.checks || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("");
    const badge = task.required
      ? `<span class="status-pill attention" style="font-size:0.7rem">필수</span>`
      : `<span class="status-pill" style="font-size:0.7rem;background:var(--surface-muted)">선택</span>`;
    return `
      <div class="guide-task ${escapeHtml(task.status || "")}">
        <div class="guide-task-header">
          <strong>${escapeHtml(task.title)}</strong>
          ${badge}
        </div>
        ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ""}
        ${checks ? `<ul class="guide-check-list">${checks}</ul>` : ""}
        ${guideNavButton(task.targetView, "관련 화면", "info")}
      </div>`;
  }).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">작업 목록</h4>
      <div class="guide-task-list">${items}</div>
    </div>`;
}

function renderGuideRunModes(modes) {
  if (!modes || !modes.length) return "";
  const items = modes.map((mode) => {
    const facts = (mode.facts || []).map((f) => `
      <div class="guide-summary-card" style="min-height:auto">
        <span>${escapeHtml(f.label)}</span>
        <strong style="font-size:0.84rem">${escapeHtml(f.value)}</strong>
      </div>`).join("");
    return `
      <div class="guide-task">
        <strong>${escapeHtml(mode.name)}</strong>
        ${mode.trigger ? `<p>${escapeHtml(mode.trigger)}</p>` : ""}
        ${facts ? `<div class="guide-summary-grid">${facts}</div>` : ""}
      </div>`;
  }).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">실행 방식</h4>
      <div class="guide-task-list">${items}</div>
    </div>`;
}

function renderGuideQuestions(questions) {
  if (!questions || !questions.length) return "";
  const items = questions.map((q) => `
    <div class="guide-qa-item">
      <details>
        <summary>${escapeHtml(q.question)}</summary>
        <p class="guide-qa-answer">${escapeHtml(q.answer)}</p>
        ${guideNavButton(q.targetView, "관련 화면", "info")}
      </details>
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">자주 묻는 상황</h4>
      <div class="guide-qa-list">${items}</div>
    </div>`;
}

function renderGuideResources(resources) {
  if (!resources || !resources.length) return "";
  const items = resources.map((r) => `
    <div class="guide-resource-item">
      <div>
        <strong>${escapeHtml(r.title)}</strong>
        ${r.description ? `<p>${escapeHtml(r.description)}</p>` : ""}
        ${r.meta ? `<span>${escapeHtml(r.meta)}</span>` : ""}
      </div>
      ${guideNavButton(r.targetView, "이동", "info")}
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">참고 자료</h4>
      <div class="guide-resource-list">${items}</div>
    </div>`;
}

function renderGuideGuardrails(guardrails) {
  if (!guardrails || !guardrails.length) return "";
  const items = guardrails.map((g) => {
    const text = typeof g === "string" ? g : (g.text || "");
    return `<div class="guide-guardrail-item">${escapeHtml(text)}</div>`;
  }).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">안전 기준</h4>
      <div class="guide-guardrail-list">${items}</div>
    </div>`;
}

function renderGuideDecisions(decisions) {
  if (!decisions || !decisions.length) return "";
  const items = decisions.map((d) => `
    <div class="guide-summary-card" style="border-left: 3px solid var(--blue)">
      <strong>${escapeHtml(d.title)}</strong>
      <p>${escapeHtml(d.description)}</p>
    </div>`).join("");
  return `
    <div class="guide-panel">
      <h4 class="guide-panel-title">확인 순서</h4>
      <div class="guide-summary-grid">${items}</div>
    </div>`;
}

function renderGuidePanel() {
  const viewId = state.guideSelectedView || "dashboard";
  const guide = WBS_GUIDE_CONTENTS[viewId];

  const menuHtml = WBS_GUIDE_MENUS.map((menu) => {
    const isActive = menu.id === viewId;
    return `<button class="guide-menu-btn ${isActive ? "active" : ""}" type="button" role="tab" aria-selected="${isActive ? "true" : "false"}" aria-controls="guideContent" data-guide-view="${escapeHtml(menu.id)}">${escapeHtml(menu.label)}</button>`;
  }).join("");
  document.querySelector("#guideMenu").innerHTML = menuHtml;

  const labelMap = { overview: "개요", "empty-state": "첫 시작", "task-list": "작업 목록", procedure: "절차", troubleshooting: "문제 해결", reference: "참고" };
  document.querySelector("#guideViewLabel").textContent = labelMap[guide?.kind] || "가이드";

  if (!guide) {
    document.querySelector("#guideContent").innerHTML = `<p class="u-text-muted">가이드 콘텐츠가 없습니다.</p>`;
    return;
  }

  const sections = [
    renderGuideHero(guide.hero),
    renderGuideSummary(guide.summary),
    renderGuideActions(guide.actions),
    renderGuideSteps(guide.steps),
    renderGuideTasks(guide.tasks),
    renderGuideRunModes(guide.runModes),
    renderGuideQuestions(guide.questions),
    renderGuideResources(guide.resources),
    renderGuideGuardrails(guide.guardrails),
    renderGuideDecisions(guide.decisions),
  ].filter(Boolean).join("");

  document.querySelector("#guideContent").innerHTML = sections;
}

/* ── origin/main 이식: renderSettingsPanel 의존 헬퍼 ── */
function pmEngineSettingValue() {
  const setting = (state.settings?.settings || []).find((item) => item.key === "pm_engine");
  return setting?.value && typeof setting.value === "object" ? setting.value : {};
}
function externalIntegrationEnabled() {
  const value = pmEngineSettingValue();
  const engine = state.settings?.pm_engine || state.pmPreflight?.engine || {};
  if (value.portal_enabled === false || engine.portal_enabled === false) return false;
  if (["disabled", "none", "internal"].includes(String(value.adapter || engine.adapter || "").toLowerCase())) return false;
  return true;
}

/* ── origin/main 이식: switchSettingsTab 의존 헬퍼 ── */
function storyPointOptions(policy = projectOperationPolicy()) {
  const values = Array.isArray(policy.fibonacci_points) && policy.fibonacci_points.length
    ? policy.fibonacci_points
    : fallbackProjectOperationPolicy.fibonacci_points;
  return values.map((point) => Number(point));
}
function deliveryPolicyLabel(value) {
  return DELIVERY_MODE_LABELS[value] || "Waterfall";
}
function sprintPolicyLabel(value) {
  const labels = {
    custom: "프로젝트별 자유 설정",
    fixed_1w: "1주 고정",
    fixed_2w: "2주 고정",
    fixed_4w: "4주 고정",
  };
  return labels[value] || labels.custom;
}
function renderProjectPolicyPanel() {
  const container = document.querySelector("#projectPolicyPanel");
  if (!container) return;
  const policy = projectOperationPolicy();
  const canEdit = canManageUsers();
  const dodText = (policy.default_dod_items || []).join("\n");
  const fibText = storyPointOptions(policy).join(", ");
  container.innerHTML = `
    <div class="policy-header">
      <div>
        <p class="eyebrow">현재 테넌트</p>
        <h3>${escapeHtml(tenantDisplayName(policy.tenant_id))}</h3>
      </div>
      <div class="policy-summary">
        <span>${escapeHtml(deliveryPolicyLabel(policy.default_delivery_mode))}</span>
        <span>${escapeHtml(policy.story_point_mode === "fibonacci" ? "피보나치 SP" : "숫자 직접 입력")}</span>
        <span>${escapeHtml(sprintPolicyLabel(policy.sprint_length_policy))}</span>
      </div>
    </div>
    <div class="policy-grid">
      <label class="policy-field">
        <span>신규 프로젝트 기본 방법론</span>
        <select id="policyDefaultDeliveryMode" ${canEdit ? "" : "disabled"}>
          <option value="waterfall" ${policy.default_delivery_mode === "waterfall" ? "selected" : ""}>Waterfall - 표준 WBS/간트</option>
          <option value="agile" ${policy.default_delivery_mode === "agile" ? "selected" : ""}>Agile - 백로그/스프린트</option>
          <option value="hybrid" ${policy.default_delivery_mode === "hybrid" ? "selected" : ""}>Hybrid - WBS + Sprint</option>
        </select>
      </label>
      <label class="policy-field">
        <span>Story Point 산정 방식</span>
        <select id="policyStoryPointMode" ${canEdit ? "" : "disabled"}>
          <option value="numeric" ${policy.story_point_mode === "numeric" ? "selected" : ""}>숫자 직접 입력</option>
          <option value="fibonacci" ${policy.story_point_mode === "fibonacci" ? "selected" : ""}>피보나치 값만 허용</option>
        </select>
      </label>
      <label class="policy-field">
        <span>피보나치 허용값</span>
        <input id="policyFibonacciPoints" value="${escapeHtml(fibText)}" ${canEdit ? "" : "disabled"} />
      </label>
      <label class="policy-field">
        <span>Sprint 길이 정책</span>
        <select id="policySprintLength" ${canEdit ? "" : "disabled"}>
          <option value="custom" ${policy.sprint_length_policy === "custom" ? "selected" : ""}>프로젝트별 자유 설정</option>
          <option value="fixed_1w" ${policy.sprint_length_policy === "fixed_1w" ? "selected" : ""}>1주 고정</option>
          <option value="fixed_2w" ${policy.sprint_length_policy === "fixed_2w" ? "selected" : ""}>2주 고정</option>
          <option value="fixed_4w" ${policy.sprint_length_policy === "fixed_4w" ? "selected" : ""}>4주 고정</option>
        </select>
      </label>
      <label class="policy-field">
        <span>DoD 관리 방식</span>
        <select id="policyDodManagement" ${canEdit ? "" : "disabled"}>
          <option value="organization" ${policy.dod_management === "organization" ? "selected" : ""}>전사 공통 기준 우선</option>
          <option value="team" ${policy.dod_management === "team" ? "selected" : ""}>팀별 커스터마이징 허용</option>
        </select>
      </label>
      <label class="policy-field policy-toggle">
        <span>OpenProject Sprint → Version 자동 생성</span>
        <input id="policyOpenProjectVersionSync" type="checkbox" ${policy.openproject_sprint_version_sync ? "checked" : ""} ${canEdit ? "" : "disabled"} />
      </label>
      <label class="policy-field policy-dod-field">
        <span>기본 DoD 항목</span>
        <textarea id="policyDodItems" rows="6" ${canEdit ? "" : "disabled"} placeholder="한 줄에 하나씩 입력">${escapeHtml(dodText)}</textarea>
      </label>
    </div>
    <div class="settings-actions policy-actions">
      <p class="form-status" id="projectPolicyStatus">${escapeHtml(state.projectPolicyStatus || "")}</p>
      <button class="primary-button" id="projectPolicySaveButton" type="button" ${canEdit ? "" : "disabled"}>운영 정책 저장</button>
    </div>
  `;
}

/* ── origin/main 이식: 프로젝트 운영 정책·외부 연동 토글·LDAP 진단·가이드 키보드 ── */
async function saveProjectOperationPolicy() {
  if (!canManageUsers()) return;
  const points = String(document.querySelector("#policyFibonacciPoints")?.value || "")
    .split(/[,\s]+/)
    .map((value) => Number(value.trim()))
    .filter((value, index, list) => Number.isFinite(value) && value > 0 && list.indexOf(value) === index)
    .sort((a, b) => a - b);
  if (!points.length) {
    state.projectPolicyStatus = "피보나치 허용값을 1개 이상 입력하세요";
    renderProjectPolicyPanel();
    return;
  }
  const dodItems = String(document.querySelector("#policyDodItems")?.value || "")
    .split("\n")
    .map((value) => value.trim())
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .slice(0, 20);
  const payload = {
    default_delivery_mode: document.querySelector("#policyDefaultDeliveryMode")?.value || "waterfall",
    story_point_mode: document.querySelector("#policyStoryPointMode")?.value || "numeric",
    fibonacci_points: points,
    sprint_length_policy: document.querySelector("#policySprintLength")?.value || "custom",
    dod_management: document.querySelector("#policyDodManagement")?.value || "team",
    default_dod_items: dodItems,
    openproject_sprint_version_sync: Boolean(document.querySelector("#policyOpenProjectVersionSync")?.checked),
  };
  const button = document.querySelector("#projectPolicySaveButton");
  if (button) button.disabled = true;
  state.projectPolicyStatus = "저장 중";
  renderProjectPolicyPanel();
  try {
    state.projectOperationPolicy = await request("/api/project-operation-policy", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    state.projectPolicyStatus = "저장되었습니다";
  } catch (error) {
    state.projectPolicyStatus = error.message;
  } finally {
    renderProjectPolicyPanel();
  }
}
async function saveExternalIntegrationPreference(enabled) {
  if (!canManageUsers()) return;
  const setting = (state.settings?.settings || []).find((item) => item.key === "pm_engine");
  if (!setting) return;
  const value = {
    ...(setting.value || {}),
    portal_enabled: Boolean(enabled),
  };
  state.settingsStatus = "";
  try {
    const result = await request("/api/settings/pm_engine", {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    state.settings = await request("/api/settings");
    if (result.pm_engine) {
      state.pmPreflight = {
        ...state.pmPreflight,
        engine: result.pm_engine,
        ready_for_actual_sync: Boolean(enabled) && state.pmPreflight.ready_for_actual_sync,
      };
    }
    state.settingsStatus = enabled ? "외부 연동을 사용합니다" : "외부 연동을 사용하지 않습니다";
  } catch (error) {
    state.settingsStatus = error.message;
  } finally {
    renderAll();
  }
}
function renderLdapDiagnostics(diagnostics) {
  const list = document.querySelector("#ldapDiagnosticList");
  if (!list) return;
  const steps = diagnostics?.steps || [];
  list.innerHTML = steps.length
    ? steps.map((step) => `
      <div class="ldap-diagnostic-item">
        <span class="ldap-diagnostic-badge ${escapeHtml(step.status || "warn")}">${escapeHtml(step.status || "warn")}</span>
        <div>
          <strong>${escapeHtml(step.label || step.key || "진단")}</strong>
          <span>${escapeHtml(step.message || "")}</span>
        </div>
      </div>
    `).join("")
    : "";
}
document.querySelector("#projectTemplateSelect").addEventListener("change", syncProjectDeliveryModeWithTemplate);
document.querySelector("#projectPolicyPanel")?.addEventListener("click", (event) => {
  if (event.target.closest("#projectPolicySaveButton")) saveProjectOperationPolicy();
});
document.querySelector("#externalIntegrationToggle")?.addEventListener("change", (event) => {
  saveExternalIntegrationPreference(event.target.checked);
});
document.querySelector("#ldapDiagnosticsBtn")?.addEventListener("click", async () => {
  const email = document.querySelector("#ldapTestEmail")?.value.trim();
  const pwd   = document.querySelector("#ldapTestPassword")?.value;
  const status = document.querySelector("#ldapTestStatus");
  if (status) {
    status.textContent = "실 서버 검증 중…";
    status.style.color = "";
  }
  try {
    const res = await request("/api/settings/auth/ldap-diagnostics", {
      method: "POST",
      body: JSON.stringify({ email: email || null, password: pwd || null }),
    });
    renderLdapDiagnostics(res);
    if (status) {
      status.textContent = res.success ? "LDAP 실 서버 검증 통과" : "LDAP 실 서버 검증 실패";
      status.style.color = res.success ? "var(--green)" : "var(--red)";
    }
  } catch (error) {
    if (status) status.textContent = `검증 실패: ${error.message}`;
  }
});
document.querySelector("#guideMenu").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(document.querySelectorAll("#guideMenu [role='tab']"));
  const currentIndex = tabs.indexOf(document.activeElement);
  if (!tabs.length || currentIndex < 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  const nextTab = tabs[nextIndex];
  state.guideSelectedView = nextTab.dataset.guideView;
  renderGuidePanel();
  document.querySelector(`#guideMenu [data-guide-view="${CSS.escape(state.guideSelectedView)}"]`)?.focus();
});
