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
    "20260830000000_phase10_item_management",
    "migration.sql",
  ),
  "utf8",
);

describe("Phase 10 Item migration", () => {
  it("is additive and creates the required operational models and indexes", () => {
    expect(migration).toContain('CREATE TABLE "rooms"');
    expect(migration).toContain('CREATE TABLE "logistics_locations"');
    expect(migration).toContain('CREATE TABLE "item_imports"');
    expect(migration).toContain('CREATE TABLE "items"');
    expect(migration).toContain(
      'CREATE INDEX "items_projectId_commercialStatus_idx"',
    );
    expect(migration).toContain(
      'ADD COLUMN "freightEstimateRate" DECIMAL(9,6)',
    );
    expect(migration).not.toMatch(/DROP (?:TABLE|COLUMN|TYPE)/);
  });

  it("keeps parent records and financial Orders independent of Item deletion", () => {
    expect(migration).toContain(
      'FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("procurementOrderId") REFERENCES "procurement_orders"("id") ON DELETE SET NULL',
    );
    expect(migration).not.toContain(
      'FOREIGN KEY ("procurementOrderId") REFERENCES "procurement_orders"("id") ON DELETE CASCADE',
    );
  });
});
