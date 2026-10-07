import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportsDashboard, type DashboardReport } from "./reports-dashboard";
import {
  dashboardFixture,
  dashboardFixtureLinks,
} from "./reports-dashboard.fixture";

function render(overrides: Partial<DashboardReport> = {}) {
  return renderToStaticMarkup(
    <ReportsDashboard
      report={{ ...dashboardFixture, ...overrides }}
      links={dashboardFixtureLinks}
      horizon="90d"
    />,
  );
}

describe("Reports dashboard", () => {
  it("separates historical TTC cash, future obligations and current pricing", () => {
    const html = render();
    for (const heading of [
      "Cash trend",
      "Upcoming cash",
      "Project pricing",
      "Invoice coverage",
      "Cash to review",
    ])
      expect(html).toContain(heading);
    expect(html).toContain("75 000.00 EUR");
    expect(html).toContain("61 000.00 EUR");
    expect(html).toContain("14 000.00 EUR");
    expect(html).toContain("24 000.00 EUR");
    expect(html).toContain("Not earned or final profit");
    expect(html).toContain("Not a bank balance");
    expect(html).toContain("Planned receipts: 15 000.00 EUR");
    expect(html).toContain("excluded from the chart and net");
    expect(html).toContain("Incomplete — review gaps");
    expect(html).toContain('href="/billing/demo?tab=related"');
  });
  it("provides accessible charts, exact monthly tables and scoped drill-down links", () => {
    const html = render();
    expect(html).toContain('aria-label="Cash trend chart"');
    expect(html).toContain('aria-label="Upcoming cash figures"');
    expect(html).toContain("Monthly figures");
    expect(html).toContain("01/05/2026–07/10/2026");
    expect(html).toContain("Current month to date");
    expect(html).toContain(
      'href="/reports?view=payments&amp;projectId=example"',
    );
    expect(html).toContain("-20 000.00 EUR");
    expect(html).toContain("Below Order sell");
  });
  it("does not attribute Client invoices to Supplier scope", () => {
    const html = render({ supplierScoped: true });
    expect(html).toContain("Refunds received");
    expect(html).toContain("Not applicable to Supplier scope");
    expect(html).not.toContain("Planned receipts:");
    expect(html).not.toContain("View coverage");
    expect(html).not.toContain("-20 000.00 EUR");
  });
  it("excludes unlike-currency Projects from comparisons but keeps a source link", () => {
    const html = render({
      excludedCurrencyProjects: [
        {
          id: "foreign",
          name: "Foreign Project",
          reportingCurrencyCode: "USD",
        },
      ],
      projects: dashboardFixture.projects.map((project) => ({
        ...project,
        reportingCurrencyCode: "USD",
      })),
    });
    expect(html).toContain("Foreign Project (USD)");
    expect(html).toContain("No comparable Projects");
    expect(html).not.toContain("-20 000.00 EUR");
  });
  it("never turns unknown money into a zero bar or a complete KPI", () => {
    const html = render({
      cashFlow: {
        ...dashboardFixture.cashFlow,
        totals: { ...dashboardFixture.cashFlow.totals, actualComplete: false },
        rows: dashboardFixture.cashFlow.rows.map((row) => ({
          ...row,
          actualComplete: false,
        })),
      },
    });
    expect(html).toContain("Missing actual FX");
    expect(html).toContain("Incomplete");
    expect(html).not.toContain("75 000.00 EUR");
    expect(html).not.toContain("61 000.00 EUR");
    expect(html).not.toContain("14 000.00 EUR");
  });
  it("provides a filtered empty state", () => {
    expect(render({ projects: [] })).toContain(
      "No Projects match these filters",
    );
  });
});
