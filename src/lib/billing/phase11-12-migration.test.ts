import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260907000000_phase11_12_client_receipt_ownership/migration.sql",
  ),
  "utf8",
);

describe("Phase 11.12 ClientReceipt migration", () => {
  it("backfills Billing Event ownership before enforcing the constraint", () => {
    const add = migration.indexOf('ADD COLUMN "billingDocumentId" UUID');
    const backfill = migration.indexOf(
      'SET "billingDocumentId" = installment."billingDocumentId"',
    );
    const guard = migration.indexOf("orphan receipt found");
    const required = migration.indexOf(
      'ALTER COLUMN "billingDocumentId" SET NOT NULL',
    );
    expect(add).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(add);
    expect(guard).toBeGreaterThan(backfill);
    expect(required).toBeGreaterThan(guard);
  });

  it("keeps installment attribution but makes it optional", () => {
    expect(migration).toContain('ALTER COLUMN "installmentId" DROP NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "client_receipts_billingDocumentId_fkey"',
    );
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE CASCADE");
  });
});
