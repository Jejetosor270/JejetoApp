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
    "prisma/migrations/20260901000000_phase10_2_item_budget_baseline/migration.sql",
  ),
  "utf8",
);

describe("Phase 10.2 Item budget baseline migration", () => {
  it("adds only the preserved purchase baseline and variance explanation", () => {
    expect(migration).toContain('ADD COLUMN "budgetPurchaseUnitPriceHt"');
    expect(migration).toContain('ADD COLUMN "budgetPurchaseTotalPriceHt"');
    expect(migration).toContain('ADD COLUMN "budgetVarianceComment"');
    expect(migration).not.toMatch(/DROP (?:TABLE|COLUMN|TYPE)/);
  });
});
