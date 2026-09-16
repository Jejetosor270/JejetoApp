import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projects = readFileSync(
  "src/app/(app)/projects/project-management.tsx",
  "utf8",
);
const dashboard = readFileSync(
  "src/components/reporting/project-financial-dashboard.tsx",
  "utf8",
);
const portfolio = readFileSync(
  "src/components/reporting/portfolio-report.tsx",
  "utf8",
);

describe("Billing less Order sell presentation", () => {
  it("replaces the Project list freight percentage with markup and coverage", () => {
    expect(projects).toContain(">Target Markup<");
    expect(projects).toMatch(/>\s*Billing less Order sell\s*</);
    expect(projects).not.toContain(">Expected freight allowance %<");
    expect(projects).toContain("defaultProductMarkupRate");
    expect(projects).toContain("formatSignedMoney");
  });

  it("shows one signed Project detail metric with its interpretation", () => {
    expect(dashboard).toContain("FundingCoverageSummary");
    expect(dashboard).toContain("Billing surplus over Order sell");
    expect(dashboard).toContain("Billing shortfall against Order sell");
    expect(dashboard).toContain("Order sell covered");
    expect(dashboard).toContain("Cash and VAT are separate");
  });

  it("adds the global total, gap count, and Project reporting column", () => {
    expect(portfolio).toContain("Total Billing less Order sell");
    expect(portfolio).toContain(
      "Projects with Billing shortfall against Order sell",
    );
    expect(portfolio).toContain("Billing surplus over Order sell");
    expect(portfolio).toContain("Billing shortfall against Order sell");
    expect(portfolio).toContain('"Billing less Order sell HT"');
    expect(portfolio).toContain('view === "funding"');
    expect(portfolio).toContain("project.fundingCoverage.fundingCoverageHt");
    expect(portfolio).toContain("formatSignedMoney");
  });
});
