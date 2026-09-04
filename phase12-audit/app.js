const STORAGE_KEY = "mb-phase12-audit-decisions-v1";
const DECISIONS = ["ACCEPT", "KEEP", "MODIFY", "DEFER"];
const FILTERS = [
  ["severity", "Severity"],
  ["category", "Category"],
  ["module", "Module / page"],
  ["recommendedAction", "Action"],
  ["effort", "Effort"],
  ["risk", "Risk"],
  ["decision", "Decision"],
];

const BATCHES = [
  {
    name: "Batch A — Financial authority & legacy",
    description:
      "Resolve competing or easily confused commercial authorities before visual cleanup.",
    ids: ["P12-001", "P12-002", "P12-020", "P12-021", "P12-025", "P12-041"],
  },
  {
    name: "Batch B — Terminology & duplicate metrics",
    description:
      "Approve canonical vocabulary and remove repeated dashboard/report presentation.",
    ids: [
      "P12-003",
      "P12-004",
      "P12-005",
      "P12-006",
      "P12-007",
      "P12-014",
      "P12-022",
      "P12-023",
      "P12-024",
      "P12-026",
    ],
  },
  {
    name: "Batch C — Tables & detail consistency",
    description:
      "Align list, filter, pagination, detail and edit conventions after terminology is settled.",
    ids: [
      "P12-012",
      "P12-013",
      "P12-015",
      "P12-016",
      "P12-017",
      "P12-027",
      "P12-028",
      "P12-034",
      "P12-037",
    ],
  },
  {
    name: "Batch D — Forms & workflow",
    description:
      "Standardize review stages, draft behavior and validation feedback without changing financial rules.",
    ids: [
      "P12-018",
      "P12-019",
      "P12-029",
      "P12-030",
      "P12-031",
      "P12-039",
      "P12-043",
    ],
  },
  {
    name: "Batch E — Technical consolidation",
    description:
      "Reduce query, DTO and presentation duplication with regression coverage around financial boundaries.",
    ids: [
      "P12-032",
      "P12-033",
      "P12-035",
      "P12-036",
      "P12-038",
      "P12-041",
      "P12-042",
      "P12-044",
    ],
  },
  {
    name: "Batch F — Low-risk polish",
    description:
      "Small navigation, wording and capitalization improvements after structural decisions.",
    ids: ["P12-008", "P12-009", "P12-010", "P12-011", "P12-014", "P12-018"],
  },
];

const state = {
  issues: [],
  terminology: [],
  authorities: [],
  coverage: [],
  decisions: { issues: {}, terminology: {} },
  filters: {},
  search: "",
  view: "top",
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const unique = (values) =>
  [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));

function loadDecisions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      state.decisions.issues = saved.issues || {};
      state.decisions.terminology = saved.terminology || {};
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveDecisions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.decisions));
  renderProgress();
}

function issueDecision(id) {
  return (
    state.decisions.issues[id] || {
      decision: "",
      note: "",
      replacementText: "",
      customChange: "",
    }
  );
}

function renderProgress() {
  const values = Object.values(state.decisions.issues).filter(
    (entry) => entry.decision,
  );
  const reviewed = values.length;
  byId("reviewed-count").textContent =
    `${reviewed} / ${state.issues.length} reviewed`;
  byId("remaining-count").textContent =
    `${state.issues.length - reviewed} remaining`;
  byId("progress-bar").style.width =
    `${state.issues.length ? (reviewed / state.issues.length) * 100 : 0}%`;
  const counts = Object.fromEntries(
    DECISIONS.map((decision) => [
      decision,
      values.filter((item) => item.decision === decision).length,
    ]),
  );
  byId("decision-counts").innerHTML = DECISIONS.map(
    (decision) =>
      `<span class="count-pill">${decision[0] + decision.slice(1).toLowerCase()} ${counts[decision]}</span>`,
  ).join("");
}

function renderFilters() {
  const container = byId("filters");
  container.innerHTML = FILTERS.map(([key, label]) => {
    let values;
    if (key === "decision") values = ["UNREVIEWED", ...DECISIONS];
    else if (key === "module")
      values = unique(
        state.issues.flatMap((issue) => [issue.module, issue.page]),
      );
    else values = unique(state.issues.map((issue) => issue[key]));
    return `<label><span>${escapeHtml(label)}</span><select data-filter="${key}"><option value="">All</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}</select></label>`;
  }).join("");
  container.querySelectorAll("select").forEach((select) =>
    select.addEventListener("change", () => {
      state.filters[select.dataset.filter] = select.value;
      renderCurrentView();
    }),
  );
}

function matchingIssues() {
  const needle = state.search.trim().toLowerCase();
  return state.issues.filter((issue) => {
    const decision = issueDecision(issue.id).decision || "UNREVIEWED";
    if (state.filters.decision && state.filters.decision !== decision)
      return false;
    for (const [key] of FILTERS.filter(([name]) => name !== "decision")) {
      const requested = state.filters[key];
      if (!requested) continue;
      if (key === "module") {
        if (issue.module !== requested && issue.page !== requested)
          return false;
      } else if (issue[key] !== requested) return false;
    }
    if (!needle) return true;
    return [
      issue.id,
      issue.title,
      issue.finding,
      issue.evidence,
      issue.recommendation,
      issue.module,
      issue.page,
      issue.sourceA,
      issue.sourceB,
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function severityRank(severity) {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[severity] ?? 4;
}

function issueCard(issue) {
  const review = issueDecision(issue.id);
  return `<article class="issue-card" data-severity="${issue.severity}">
    <div class="issue-topline">
      <div class="badges"><span class="badge severity">${issue.severity}</span><span class="badge">${escapeHtml(issue.category)}</span><span class="badge">${escapeHtml(issue.recommendedAction)}</span>${review.decision ? `<span class="badge reviewed">${review.decision}</span>` : ""}</div>
      <span class="issue-meta">${issue.id}</span>
    </div>
    <h3>${escapeHtml(issue.title)}</h3>
    <p>${escapeHtml(issue.finding)}</p>
    <div class="issue-meta">${escapeHtml(issue.module)} · ${escapeHtml(issue.page)} · ${issue.effort} effort · ${issue.risk} risk · ${issue.runtimeVerified ? "runtime + code" : "code reviewed"}</div>
    <div class="issue-actions">
      <button class="detail-button" data-open="${issue.id}">Review detail →</button>
      <select class="quick-decision" data-quick="${issue.id}" aria-label="Decision for ${issue.id}">
        <option value="">Unreviewed</option>${DECISIONS.map((decision) => `<option value="${decision}"${review.decision === decision ? " selected" : ""}>${decision[0] + decision.slice(1).toLowerCase()}</option>`).join("")}
      </select>
    </div>
  </article>`;
}

function bindIssueCards() {
  document
    .querySelectorAll("[data-open]")
    .forEach((button) =>
      button.addEventListener("click", () => openIssue(button.dataset.open)),
    );
  document.querySelectorAll("[data-quick]").forEach((select) =>
    select.addEventListener("change", () => {
      const current = issueDecision(select.dataset.quick);
      state.decisions.issues[select.dataset.quick] = {
        ...current,
        decision: select.value,
      };
      saveDecisions();
      renderCurrentView();
    }),
  );
}

function renderIssueList(issues, top = false) {
  const content = byId("content");
  if (!issues.length) {
    content.innerHTML = `<div class="empty">No findings match the current filters.</div>`;
    return;
  }
  const grouped = top
    ? [["Highest-impact review queue", issues]]
    : unique(issues.map((issue) => issue.module)).map((module) => [
        module,
        issues.filter((issue) => issue.module === module),
      ]);
  content.innerHTML = grouped
    .map(
      ([label, group]) => `<section>
    <div class="section-heading"><div><h2>${escapeHtml(label)}</h2><p>${group.length} finding${group.length === 1 ? "" : "s"}</p></div></div>
    <div class="issue-grid">${group.map(issueCard).join("")}</div>
  </section>`,
    )
    .join("");
  bindIssueCards();
}

function renderSummary(issues = state.issues) {
  const counts = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((severity) => [
    severity,
    issues.filter((issue) => issue.severity === severity).length,
  ]);
  byId("summary").innerHTML =
    `<div class="summary-card"><span>Visible findings</span><strong>${issues.length}</strong></div>${counts.map(([severity, count]) => `<div class="summary-card"><span>${severity}</span><strong>${count}</strong></div>`).join("")}`;
}

function openIssue(id) {
  const issue = state.issues.find((entry) => entry.id === id);
  if (!issue) return;
  const dialog = byId("issue-dialog");
  const review = issueDecision(id);
  byId("dialog-content").innerHTML =
    `<header class="dialog-title"><div class="badges"><span class="badge severity">${issue.severity}</span><span class="badge">${escapeHtml(issue.category)}</span><span class="badge">${escapeHtml(issue.recommendedAction)}</span></div><h2>${escapeHtml(issue.title)}</h2><p>${issue.id} · ${escapeHtml(issue.module)} · ${escapeHtml(issue.page)} · ${escapeHtml(issue.state)}</p></header>
    <div class="detail-grid">
      <section class="detail-block"><h3>Finding</h3><p>${escapeHtml(issue.finding)}</p></section>
      <section class="detail-block"><h3>Why it matters</h3><p>${escapeHtml(issue.whyItMatters)}</p></section>
      <section class="detail-block full"><h3>Evidence</h3><p>${escapeHtml(issue.evidence)}</p></section>
      <section class="detail-block"><h3>Source A</h3><p class="source">${escapeHtml(issue.sourceA)}</p></section>
      <section class="detail-block"><h3>Source B</h3><p class="source">${escapeHtml(issue.sourceB)}</p></section>
      <section class="detail-block full"><h3>Recommendation</h3><p>${escapeHtml(issue.recommendation)}</p><p class="issue-meta" style="margin-top:8px">${issue.recommendedAction} · ${issue.effort} effort · ${issue.risk} implementation risk</p></section>
      <section class="detail-block"><h3>Affected pages</h3><p>${issue.affectedPages.map(escapeHtml).join(" · ")}</p></section>
      <section class="detail-block"><h3>Related issues</h3><div class="related-links">${issue.relatedIssueIds.length ? issue.relatedIssueIds.map((related) => `<button data-related="${related}">${related}</button>`).join("") : "None"}</div></section>
    </div>`;
  const reviewBox =
    byId("decision-template").content.firstElementChild.cloneNode(true);
  reviewBox.querySelectorAll("input[type=radio]").forEach((radio) => {
    radio.name = `decision-${id}`;
    radio.checked = review.decision === radio.value;
    radio.addEventListener("change", () =>
      updateIssueDecision(id, "decision", radio.value),
    );
  });
  reviewBox.querySelectorAll("[data-field]").forEach((field) => {
    field.value = review[field.dataset.field] || "";
    field.addEventListener("input", () =>
      updateIssueDecision(id, field.dataset.field, field.value),
    );
  });
  byId("dialog-content").appendChild(reviewBox);
  dialog
    .querySelectorAll("[data-related]")
    .forEach((button) =>
      button.addEventListener("click", () => openIssue(button.dataset.related)),
    );
  if (!dialog.open) dialog.showModal();
}

function updateIssueDecision(id, field, value) {
  state.decisions.issues[id] = { ...issueDecision(id), [field]: value };
  saveDecisions();
}

function renderTerminology() {
  byId("summary").innerHTML =
    `<div class="summary-card"><span>Vocabulary proposals</span><strong>${state.terminology.length}</strong></div><div class="summary-card"><span>Reviewed</span><strong>${Object.values(state.decisions.terminology).filter(Boolean).length}</strong></div>`;
  byId("content").innerHTML =
    `<div class="section-heading"><div><h2>Canonical ERP vocabulary</h2><p>Approve terminology separately from product findings.</p></div></div><div class="table-wrap"><table class="audit-table"><thead><tr><th>Current term</th><th>Recommended term</th><th>Reason</th><th>Locations</th><th>Audit action</th><th>Your decision</th></tr></thead><tbody>${state.terminology.map((term) => `<tr><td>${escapeHtml(term.currentTerm)}</td><td><strong>${escapeHtml(term.recommendedTerm)}</strong></td><td>${escapeHtml(term.reason)}</td><td>${term.locations.map(escapeHtml).join(" · ")}</td><td class="term-action">${term.action}</td><td><select class="term-decision" data-term="${term.id}" aria-label="Decision for ${term.id}"><option value="">Unreviewed</option>${DECISIONS.map((decision) => `<option value="${decision}"${state.decisions.terminology[term.id] === decision ? " selected" : ""}>${decision}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>`;
  document.querySelectorAll("[data-term]").forEach((select) =>
    select.addEventListener("change", () => {
      state.decisions.terminology[select.dataset.term] = select.value;
      saveDecisions();
    }),
  );
}

function renderCoverage() {
  const runtime = state.coverage.filter((row) => row.runtimeVerified).length;
  byId("summary").innerHTML =
    `<div class="summary-card"><span>Coverage entries</span><strong>${state.coverage.length}</strong></div><div class="summary-card"><span>Runtime verified</span><strong>${runtime}</strong></div><div class="summary-card"><span>Code reviewed only</span><strong>${state.coverage.length - runtime}</strong></div>`;
  byId("content").innerHTML =
    `<div class="section-heading"><div><h2>Desktop coverage matrix</h2><p>Runtime checks were read-only; unsafe mutations and unavailable samples were code-reviewed.</p></div></div><div class="table-wrap"><table class="audit-table"><thead><tr><th>Route / state</th><th>Module</th><th>View inspected</th><th>Edit state</th><th>Runtime</th><th>Notes</th></tr></thead><tbody>${state.coverage.map((row) => `<tr><td><strong>${escapeHtml(row.route)}</strong></td><td>${escapeHtml(row.module)}</td><td>${escapeHtml(row.viewState)}</td><td>${escapeHtml(row.editState)}</td><td class="${row.runtimeVerified ? "coverage-yes" : "coverage-no"}">${row.runtimeVerified ? "Yes" : "No — code"}</td><td>${escapeHtml(row.notes)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderAuthorities() {
  const needsReview = state.authorities.filter(
    (row) => row.status !== "CLEAR",
  ).length;
  byId("summary").innerHTML =
    `<div class="summary-card"><span>Financial concepts</span><strong>${state.authorities.length}</strong></div><div class="summary-card"><span>Clear authority</span><strong>${state.authorities.length - needsReview}</strong></div><div class="summary-card"><span>Presentation conflict</span><strong>${needsReview}</strong></div>`;
  byId("content").innerHTML =
    `<div class="section-heading"><div><h2>Financial single-source-of-truth map</h2><p>Authority and formula were traced independently from current visible values.</p></div></div><div class="table-wrap"><table class="audit-table"><thead><tr><th>Concept</th><th>Authoritative source</th><th>Calculation</th><th>Status</th><th>Notes</th></tr></thead><tbody>${state.authorities.map((row) => `<tr><td><strong>${escapeHtml(row.concept)}</strong></td><td>${escapeHtml(row.authority)}</td><td>${escapeHtml(row.calculation)}</td><td class="${row.status === "CLEAR" ? "coverage-yes" : "coverage-no"}">${escapeHtml(row.status.replaceAll("_", " "))}</td><td>${escapeHtml(row.notes)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderBatches() {
  byId("summary").innerHTML =
    `<div class="summary-card"><span>Suggested batches</span><strong>${BATCHES.length}</strong></div><div class="summary-card"><span>Implementation now</span><strong>0</strong></div>`;
  byId("content").innerHTML =
    `<div class="section-heading"><div><h2>Suggested implementation sequence</h2><p>Planning only. Review decisions should determine the actual scope.</p></div></div><div class="batch-grid">${BATCHES.map(
      (batch) =>
        `<article class="batch"><h3>${escapeHtml(batch.name)}</h3><p>${escapeHtml(batch.description)}</p><ul>${batch.ids
          .map((id) => {
            const issue = state.issues.find((entry) => entry.id === id);
            return `<li><button class="detail-button" data-open="${id}">${id}</button> — ${escapeHtml(issue?.title || "")}</li>`;
          })
          .join("")}</ul></article>`,
    ).join("")}</div>`;
  bindIssueCards();
}

function renderCurrentView() {
  const findingView = state.view === "top" || state.view === "findings";
  byId("findings-tools").hidden = !findingView;
  if (state.view === "terminology") return renderTerminology();
  if (state.view === "authorities") return renderAuthorities();
  if (state.view === "coverage") return renderCoverage();
  if (state.view === "batches") return renderBatches();
  let issues = matchingIssues().sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.id.localeCompare(b.id),
  );
  if (state.view === "top")
    issues = issues
      .filter(
        (issue) => issue.severity === "CRITICAL" || issue.severity === "HIGH",
      )
      .slice(0, 12);
  renderSummary(issues);
  renderIssueList(issues, state.view === "top");
}

function exportPayload() {
  return {
    audit: "MB Procurement ERP Phase 12",
    exportedAt: new Date().toISOString(),
    summary: {
      issueCount: state.issues.length,
      reviewedCount: Object.values(state.decisions.issues).filter(
        (item) => item.decision,
      ).length,
      terminologyCount: state.terminology.length,
    },
    issues: state.issues.map((issue) => ({
      issueId: issue.id,
      page: issue.page,
      module: issue.module,
      category: issue.category,
      severity: issue.severity,
      finding: issue.finding,
      recommendation: issue.recommendation,
      recommendedAction: issue.recommendedAction,
      decision: issueDecision(issue.id).decision || "UNREVIEWED",
      note: issueDecision(issue.id).note,
      proposedReplacementText: issueDecision(issue.id).replacementText,
      customRequestedChange: issueDecision(issue.id).customChange,
    })),
    terminology: state.terminology.map((term) => ({
      ...term,
      decision: state.decisions.terminology[term.id] || "UNREVIEWED",
    })),
  };
}

function download(name, type, content) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function markdownExport(payload) {
  const lines = [
    "# Phase 12 implementation decisions",
    "",
    `Exported: ${payload.exportedAt}`,
    "",
    `Reviewed: ${payload.summary.reviewedCount} / ${payload.summary.issueCount}`,
    "",
    "## Findings",
    "",
  ];
  for (const issue of payload.issues) {
    lines.push(
      `### ${issue.issueId} — ${issue.severity} — ${issue.module}`,
      "",
      `- Page: ${issue.page}`,
      `- Category: ${issue.category}`,
      `- Recommended action: ${issue.recommendedAction}`,
      `- User decision: ${issue.decision}`,
      "",
      `Finding: ${issue.finding}`,
      "",
      `Recommendation: ${issue.recommendation}`,
      "",
      `Reviewer note: ${issue.note || "—"}`,
      "",
      `Proposed replacement text: ${issue.proposedReplacementText || "—"}`,
      "",
      `Custom requested change: ${issue.customRequestedChange || "—"}`,
      "",
    );
  }
  lines.push("## Terminology decisions", "");
  for (const term of payload.terminology)
    lines.push(
      `- ${term.id}: “${term.currentTerm}” → “${term.recommendedTerm}” — ${term.decision}`,
    );
  return lines.join("\n");
}

async function init() {
  try {
    [state.issues, state.terminology, state.coverage, state.authorities] =
      await Promise.all(
        [
          "issues.json",
          "terminology.json",
          "coverage.json",
          "authorities.json",
        ].map(async (url) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`${url}: ${response.status}`);
          return response.json();
        }),
      );
    loadDecisions();
    renderFilters();
    renderProgress();
    renderCurrentView();
  } catch (error) {
    byId("content").innerHTML =
      `<div class="empty"><strong>Audit data could not load.</strong><br />Run the local server command from README.md instead of opening index.html directly.<br /><small>${escapeHtml(error.message)}</small></div>`;
  }
}

document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((item) => item.classList.toggle("active", item === tab));
    state.view = tab.dataset.view;
    renderCurrentView();
  }),
);
byId("search").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderCurrentView();
});
byId("clear-filters").addEventListener("click", () => {
  state.filters = {};
  state.search = "";
  byId("search").value = "";
  document.querySelectorAll("[data-filter]").forEach((select) => {
    select.value = "";
  });
  renderCurrentView();
});
byId("issue-dialog")
  .querySelector(".dialog-close")
  .addEventListener("click", () => byId("issue-dialog").close());
byId("issue-dialog").addEventListener("click", (event) => {
  if (event.target === byId("issue-dialog")) byId("issue-dialog").close();
});
byId("export-json").addEventListener("click", () =>
  download(
    "phase12-decisions.json",
    "application/json",
    JSON.stringify(exportPayload(), null, 2),
  ),
);
byId("export-md").addEventListener("click", () =>
  download(
    "phase12-decisions.md",
    "text/markdown",
    markdownExport(exportPayload()),
  ),
);

init();
