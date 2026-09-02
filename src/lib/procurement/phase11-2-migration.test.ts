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
    expect(migration).toContain('"procurement_orders_pricing_mode_check"');
    expect(migration).toContain(
      `("pricingMode" = 'SELLING_PRICE' AND "targetMarginRate" IS NULL)`,
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

  it("replaces the legacy constraint before backfill and tightens it afterward", () => {
    const transition = migration.indexOf(
      'ADD CONSTRAINT "procurement_orders_pricing_mode_transition_check"',
    );
    const firstBackfill = migration.indexOf('UPDATE "procurement_orders"');
    const directBackfill = migration.indexOf(
      "WHERE \"pricingMode\" IN ('SELLING_PRICE', 'TARGET_MARGIN')",
    );
    const finalConstraint = migration.indexOf(
      'ADD CONSTRAINT "procurement_orders_pricing_mode_check"',
    );
    expect(transition).toBeGreaterThan(-1);
    expect(transition).toBeLessThan(firstBackfill);
    expect(finalConstraint).toBeGreaterThan(directBackfill);
  });

  it("is safe to retry after a failed partial execution", () => {
    expect(migration).toMatch(/ADD VALUE IF NOT EXISTS 'PROJECT_MARKUP'/);
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS "outputVatTaxableBaseOverride"/,
    );
    expect(migration).toContain(
      'DROP CONSTRAINT IF EXISTS "procurement_orders_pricing_mode_check"',
    );
  });
});
