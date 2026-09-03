import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(
  "src/components/reporting/project-financial-dashboard.tsx",
  "utf8",
);

describe("Project Client collection presentation", () => {
  it("uses authoritative Billing collection fields for the operational card", () => {
    expect(dashboard).toContain("Client collection");
    expect(dashboard).toContain("Client invoiced TTC");
    expect(dashboard).toContain("Client received TTC");
    expect(dashboard).toContain("Upcoming scheduled TTC");
    expect(dashboard).toContain("billing?.nextDueDate");
  });

  it("does not present legacy Order schedules as actual receivables", () => {
    expect(dashboard).not.toContain("Order client schedules");
    expect(dashboard).not.toContain("Received on Order schedules");
    expect(dashboard).not.toContain("report.payments.client");
    expect(dashboard).toContain("Legacy Supplier Order plan remaining");
  });
});
