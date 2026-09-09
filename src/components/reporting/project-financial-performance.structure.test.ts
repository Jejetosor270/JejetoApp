import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dashboard = readFileSync(
  "src/components/reporting/project-financial-dashboard.tsx",
  "utf8",
);
const projectPage = readFileSync(
  "src/app/(app)/projects/[projectId]/page.tsx",
  "utf8",
);

describe("Project financial performance presentation", () => {
  it("omits the redundant full-Project target versus actual panel", () => {
    expect(dashboard).not.toContain("FinancialPerformanceTable");
    expect(dashboard).not.toContain("Full-Project target vs actual to date");
    expect(dashboard).not.toContain("Project financial performance");
    expect(dashboard).not.toContain("Budget / Target");
    expect(dashboard).not.toContain("Billing & actual profitability");
  });

  it("uses Invoice output VAT and deductible input VAT for Project VAT", () => {
    expect(dashboard).toContain("Project VAT position");
    expect(dashboard).toContain("VAT payable to State");
    expect(dashboard).toContain("VAT credit / deductible");
    expect(dashboard).not.toContain("report.financial.totals.outputVat");
    expect(projectPage).toContain("billing?.outputVatComplete");
    expect(projectPage).toContain(
      "reporting.financial.totals.recoverableInputVat",
    );
    expect(projectPage).toContain(
      "freight?.projectExpenseDeductibleInputVat.complete",
    );
  });

  it("keeps cash and freight reconciliation separate", () => {
    expect(dashboard).not.toContain("Freight reconciliation");
    expect(projectPage).toContain("<ProjectCoverage data={control}");
    expect(dashboard).toContain("Client collection");
    expect(dashboard).toContain("Cash timing does not change");
  });
});
