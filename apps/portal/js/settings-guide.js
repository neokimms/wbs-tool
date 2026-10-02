/* AX WBS 포털 — 설정 탭·사용자 가이드 렌더링
   (app.js 에서 분리. 클래식 스크립트로 전역 스코프를 공유하므로 index.html 의 로드 순서를 지킬 것) */

/* ── 설정 탭 전환 ──────────────────────────────── */
const STG_TABS = ["platform", "approvals", "operations", "users", "audit", "openproject", "auth", "smtp", "tenants"];

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
  document.querySelector("#settingsEngineRuntime").textContent = engine.enabled ? "실제 동기화 허용" : "모의 실행 보호";
  document.querySelector("#settingsJsonInput").value = setting ? JSON.stringify(setting.value || {}, null, 2) : "{}";
  document.querySelector("#settingsJsonInput").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsSaveButton").disabled = !setting || !canManageUsers();
  document.querySelector("#settingsStatus").textContent = state.settingsStatus;
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
    return `<button class="guide-menu-btn ${isActive ? "active" : ""}" type="button" data-guide-view="${escapeHtml(menu.id)}">${escapeHtml(menu.label)}</button>`;
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
