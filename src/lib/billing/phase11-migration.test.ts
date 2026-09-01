import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const migration = readFileSync(
  path.join(
    root,
    "prisma/migrations/20260902000000_phase11_client_billing/migration.sql",
  ),
  "utf8",
);

describe("Phase 11 billing migration", () => {
  it("adds Project targets and the reviewed Client billing hierarchy", () => {
    expect(migration).toContain('ADD COLUMN "clientBudgetTargetHt"');
    expect(migration).toContain('CREATE TABLE "client_billing_documents"');
    expect(migration).toContain('CREATE TABLE "client_payment_installments"');
    expect(migration).toContain('CREATE TABLE "client_receipts"');
    expect(migration).toContain('CREATE TABLE "client_billing_allocations"');
    expect(migration).not.toMatch(/DROP (?:TABLE|COLUMN|TYPE)/);
  });

  it("preserves existing Item access while new settings default off", () => {
    expect(migration).toContain(
      'ADD COLUMN "itemManagementEnabled" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(migration).toContain('SET "itemManagementEnabled" = true');
  });

  it("never creates a PDF or binary storage column", () => {
    expect(migration).not.toMatch(/(?:pdf|base64|binary|bytea|blob)/i);
  });
});
