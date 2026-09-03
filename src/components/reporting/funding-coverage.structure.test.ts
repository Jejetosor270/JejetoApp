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

describe("Funding Coverage presentation", () => {
  it("replaces the Project list freight percentage with markup and coverage", () => {
    expect(projects).toContain(">Target Markup<");
    expect(projects).toContain(">Funding Coverage<");
    expect(projects).not.toContain(">Expected freight allowance %<");
    expect(projects).toContain("defaultProductMarkupRate");
    expect(projects).toContain("formatSignedMoney");
  });

  it("shows one signed Project detail metric with its interpretation", () => {
    expect(dashboard).toContain("FundingCoverageSummary");
    expect(dashboard).toContain("Excess Billing Coverage");
    expect(dashboard).toContain("Funding Gap");
    expect(dashboard).toContain("Fully Covered");
    expect(dashboard).toContain("Cash and VAT are separate");
  });

  it("adds the global total, gap count, and Project reporting column", () => {
    expect(portfolio).toContain("Total Funding Coverage");
    expect(portfolio).toContain("Projects with Funding Gap");
    expect(portfolio).toContain("Excess Billing Coverage");
    expect(portfolio).toContain("Funding Gap");
    expect(portfolio).toContain(">Funding Coverage<");
  });
});
