import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const migration = readFileSync(
  path.join(
    repositoryRoot,
    "prisma",
    "migrations",
    "20260827000000_phase6_payments_calendar",
    "migration.sql",
  ),
  "utf8",
);
const seed = readFileSync(
  path.join(repositoryRoot, "prisma", "seed.ts"),
  "utf8",
);

describe("Phase 6 payment migration", () => {
  it("converts legacy schedules and settlements before dropping their tables", () => {
    const supplierConversion = migration.indexOf(
      "'SUPPLIER_PAYMENT'::\"PaymentDirection\"",
    );
    const clientConversion = migration.indexOf(
      "'CLIENT_RECEIPT'::\"PaymentDirection\"",
    );
    const settlementConversion = migration.indexOf(
      'INSERT INTO "payment_settlements"',
    );
    const verification = migration.indexOf(
      "Legacy payment conversion count verification failed",
    );
    const firstDrop = migration.indexOf('DROP TABLE "supplier_payments"');

    expect(migration.trimStart().startsWith("-- Keep")).toBe(true);
    expect(migration).toContain("BEGIN;");
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(supplierConversion).toBeGreaterThan(0);
    expect(clientConversion).toBeGreaterThan(supplierConversion);
    expect(settlementConversion).toBeGreaterThan(clientConversion);
    expect(verification).toBeGreaterThan(settlementConversion);
    expect(firstDrop).toBeGreaterThan(verification);
  });

  it("refuses ambiguous project-level client allocations", () => {
    expect(migration).toContain(
      "automatic Phase 6 allocation would be ambiguous",
    );
    expect(migration).toContain(") <> 1");
    expect(migration).toContain(
      'JOIN "procurement_orders" AS orders ON orders."projectId" = installment."projectId"',
    );
  });

  it("seeds only the Phase 6 payment architecture", () => {
    expect(seed).toContain("prisma.paymentInstallment");
    expect(seed).toContain("prisma.paymentSettlement");
    expect(seed).not.toMatch(
      /prisma\.(supplierPaymentInstallment|supplierPayment|clientPaymentInstallment|clientReceipt)\b/,
    );
  });
});
