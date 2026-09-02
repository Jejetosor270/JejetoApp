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
    "prisma/migrations/20260904000000_phase11_2_order_pricing_vat_base/migration.sql",
  ),
  "utf8",
);

describe("Phase 11.2 Order pricing migration", () => {
  it("adds the three explicit Order methods and AUTO-by-null VAT override", () => {
    expect(migration).toContain("'PROJECT_MARKUP'");
    expect(migration).toContain("'ORDER_MARKUP'");
    expect(migration).toContain("'DIRECT_SELLING_PRICE'");
    expect(migration).toContain('"outputVatTaxableBaseOverride"');
    expect(migration).toContain("SET DEFAULT 'PROJECT_MARKUP'");
    expect(migration).toContain(
      '"procurement_orders_explicit_pricing_method_check"',
    );
  });

  it("preserves legacy VAT bases and freezes explicit component pricing", () => {
    expect(migration).toContain('vat."taxableBaseAmount"');
    expect(migration).toContain('projects."defaultProductMarkupRate"');
    expect(migration).not.toMatch(/DROP (?:TABLE|COLUMN|TYPE)/);
  });

  it("maps old package and target modes without deleting target history", () => {
    expect(migration).toContain("IN ('SELLING_PRICE', 'TARGET_MARGIN')");
    expect(migration).not.toMatch(/SET\s+"targetMarginRate"\s*=\s*NULL/i);
  });
});
