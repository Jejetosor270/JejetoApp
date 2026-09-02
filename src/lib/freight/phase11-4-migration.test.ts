import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260905000000_phase11_4_freight_reconciliation/migration.sql",
  "utf8",
);

describe("Phase 11.4 freight migration", () => {
  it("adds only the nullable Order override and Project expense structure", () => {
    expect(migration).toContain('ADD COLUMN "freightAllowanceOverrideAmount"');
    expect(migration).toContain('CREATE TABLE "project_freight_expenses"');
    expect(migration).not.toContain('UPDATE "procurement_orders"');
  });
});
