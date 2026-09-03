import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260906000000_phase11_11a_vat_recoverability/migration.sql",
  "utf8",
);

describe("Phase 11.11A VAT recoverability migration", () => {
  it("is atomic so failed deployments do not leave partial DDL", () => {
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(migration).toContain(
      `"recoverability"::text = 'PARTIALLY_RECOVERABLE'`,
    );
  });

  it("adds the partial status before adding constrained recoverable rates", () => {
    const enumChange = migration.indexOf("'PARTIALLY_RECOVERABLE'");
    const rateColumn = migration.indexOf('ADD COLUMN "recoverableRate"');
    const constraints = migration.indexOf(
      'ADD CONSTRAINT "order_vat_entries_recoverable_rate_check"',
    );
    expect(enumChange).toBeGreaterThan(-1);
    expect(rateColumn).toBeGreaterThan(enumChange);
    expect(constraints).toBeGreaterThan(rateColumn);
  });

  it("backfills legacy input VAT without changing VAT amounts", () => {
    expect(migration).toContain("WHEN 'RECOVERABLE' THEN 1.000000");
    expect(migration).toContain("WHEN 'NON_RECOVERABLE' THEN 0.000000");
    expect(migration).toContain(`WHERE "direction" = 'INPUT'`);
    expect(migration).not.toMatch(/UPDATE[\s\S]+"vatAmount"\s*=/);
  });

  it("adds nullable freight VAT fields and keeps historical freight VAT empty", () => {
    expect(migration).toContain('ADD COLUMN "vatTreatment"');
    expect(migration).toContain('ADD COLUMN "vatAmount"');
    expect(migration).toContain('ADD COLUMN "recoverability"');
    expect(migration).not.toContain('UPDATE "project_freight_expenses"');
  });
});
