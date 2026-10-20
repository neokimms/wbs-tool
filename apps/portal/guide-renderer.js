(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function list(items = [], className = "guide-list") {
    if (!items.length) return "";
    return `
      <ul class="${className}">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    `;
  }

  function renderSteps(steps = []) {
    if (!steps.length) return "";
    return `
      <ol class="guide-steps">
        ${steps
          .map(
            (step) => `
              <li>
                <strong>${escapeHtml(step.title)}</strong>
                <span>${escapeHtml(step.detail)}</span>
              </li>
            `,
          )
          .join("")}
      </ol>
    `;
  }

  function renderTasks(tasks = []) {
    if (!tasks.length) return "";
    return `
      <ul class="guide-tasks">
        ${tasks
          .map(
            (task) => `
              <li>
                <span aria-hidden="true">✓</span>
                <p>${escapeHtml(task)}</p>
              </li>
            `,
          )
          .join("")}
      </ul>
    `;
  }

  function renderReferences(references = []) {
    if (!references.length) return "";
    return `
      <dl class="guide-reference">
        ${references
          .map(
            (item) => `
              <div>
                <dt>${escapeHtml(item.label)}</dt>
                <dd>${escapeHtml(item.description)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
    `;
  }

  function renderIssues(issues = []) {
    if (!issues.length) return "";
    return `
      <div class="guide-issues">
        ${issues
          .map(
            (issue) => `
              <section>
                <strong>${escapeHtml(issue.symptom)}</strong>
                <p><span>원인</span>${escapeHtml(issue.cause)}</p>
                <p><span>조치</span>${escapeHtml(issue.action)}</p>
              </section>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderBody(section) {
    if (section.kind === "procedure") return renderSteps(section.steps);
    if (section.kind === "task-list") return renderTasks(section.tasks);
    if (section.kind === "reference") return renderReferences(section.references);
    if (section.kind === "troubleshooting") return renderIssues(section.issues);
    return list(section.highlights, "guide-list");
  }

  function renderGuide(content) {
    const sections = content.sections || [];
    return `
      <div class="guide-hero">
        <div>
          <p class="eyebrow">사용 가이드</p>
          <h3>${escapeHtml(content.title)}</h3>
          <p>${escapeHtml(content.summary)}</p>
        </div>
        <span class="status-pill stable">업데이트 ${escapeHtml(content.updatedAt)}</span>
      </div>
      <div class="guide-quickstart">
        <div class="compact-label">
          <span>빠른 시작</span>
          <small>PMO 기본 흐름</small>
        </div>
        ${list(content.quickStart, "guide-quick-list")}
      </div>
      <nav class="guide-index" aria-label="가이드 목차">
        ${sections
          .map(
            (section) => `
              <a href="#guide-${escapeHtml(section.id)}" data-guide-anchor="${escapeHtml(section.id)}">
                <span>${escapeHtml(section.menu)}</span>
                <small>${escapeHtml(section.kind)}</small>
              </a>
            `,
          )
          .join("")}
      </nav>
      <div class="guide-sections">
        ${sections
          .map(
            (section) => `
              <section class="guide-section" id="guide-${escapeHtml(section.id)}">
                <div class="guide-section-heading">
                  <div>
                    <p class="eyebrow">${escapeHtml(section.menu)}</p>
                    <h3>${escapeHtml(section.title)}</h3>
                    <p>${escapeHtml(section.summary)}</p>
                  </div>
                  <span class="guide-kind">${escapeHtml(section.kind)}</span>
                </div>
                ${renderBody(section)}
                ${list(section.checkpoints, "guide-checkpoints")}
              </section>
            `,
          )
          .join("")}
      </div>
    `;
  }

  window.WbsGuideRenderer = {
    renderGuide,
  };
})();
