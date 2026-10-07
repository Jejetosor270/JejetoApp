import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportExport } from "./report-export";
import { ForecastScenario } from "./forecast-scenario";
import { dashboardFixture } from "./reports-dashboard.fixture";
import { clearFiltersHref } from "@/components/listing/filter-navigation";
describe("dashboard export and scenario controls", () => {
  it("exports the applied scope, not pagination or stale transaction dates on dashboard", () => {
    const html = renderToStaticMarkup(
      <ReportExport
        view="dashboard"
        params={{
          projectId: "project",
          supplierId: "supplier",
          cashDelay: "30",
          dateFrom: "2020-01-01",
          page: "3",
        }}
      />,
    );
    expect(html).toContain('action="/reports/export"');
    expect(html).toContain('name="projectId" value="project"');
    expect(html).toContain('name="cashDelay" value="30"');
    expect(html).not.toContain('name="page"');
    expect(html).not.toContain('name="dateFrom"');
    expect(html).toContain('value="summary" selected=""');
    expect(html.match(/<option/g)).toHaveLength(8);
  });
  it("preserves transaction dates and direction", () => {
    const html = renderToStaticMarkup(
      <ReportExport
        view="payments"
        params={{ dateFrom: "2026-01-01", direction: "SUPPLIER_PAYMENT" }}
      />,
    );
    expect(html).toContain('name="dateFrom" value="2026-01-01"');
    expect(html).toContain('name="direction" value="SUPPLIER_PAYMENT"');
    expect(html).toContain('value="transactions" selected=""');
  });
  it("labels the scenario as hypothetical and shows incomplete gaps, never a bank balance", () => {
    const outlook = dashboardFixture.cashFlow.outlook;
    if (!outlook) throw new Error("Missing fixture outlook");
    const html = renderToStaticMarkup(
      <ForecastScenario
        outlook={outlook}
        currency="EUR"
        horizon="90d"
        delay="30"
        href="/reports?view=cash-flow"
      />,
    );
    expect(html).toContain("30 days late");
    expect(html).toContain("No records change");
    expect(html).toContain("not a bank balance");
    expect(html).toContain("Incomplete");
    expect(html).toContain('aria-label="Cash scenario figures"');
    expect(html).toContain('open=""');
  });
  it("keeps the chosen scenario when clearing business filters", () => {
    expect(
      clearFiltersHref(
        "/reports",
        new URLSearchParams("projectId=p&view=dashboard&cashDelay=30"),
      ),
    ).toBe("/reports?view=dashboard&cashDelay=30");
  });
});
