import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("financial percentage presentation boundaries", () => {
  it.each([
    [
      "Project financial overview",
      "src/components/reporting/project-financial-dashboard.tsx",
      "formatRate(report.financial.markupRate)",
    ],
    [
      "Order detail",
      "src/app/(app)/orders/[orderId]/page.tsx",
      "formatRate(cost.markupRate)",
    ],
    [
      "Billing",
      "src/components/billing/billing-detail.tsx",
      "formatRate(financial?.actualMarkupRate ?? null)",
    ],
    [
      "Payment schedules",
      "src/components/payments/payment-schedule.tsx",
      "formatRate(",
    ],
    [
      "Portfolio dashboard",
      "src/components/reporting/portfolio-report.tsx",
      "formatRate(report.financial.markupRate)",
    ],
  ])("keeps %s on the shared rate formatter", (_label, path, marker) => {
    expect(
      source(path)
        .replace(/,\s*\)/g, ")")
        .replace(/\s+/g, ""),
    ).toContain(marker.replace(/\s+/g, ""));
  });

  it("keeps freight coverage markup on the shared rate formatter", () => {
    const coverage = source("src/components/reporting/project-coverage.tsx");
    expect(coverage).toContain("formatRate(freight.projectMarkup)");
    expect(coverage).toContain("Client Freight paid HT (proportional)");
  });
});
