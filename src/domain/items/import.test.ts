import { describe, expect, it } from "vitest";

import {
  budgetReviewVisibleColumns,
  parseBudgetArea,
  rowWarnings,
} from "@/domain/items/import";

describe("budget Item import review", () => {
  it("parses numeric Area prefixes as Room code and readable name", () => {
    expect(parseBudgetArea("1201 - MASTER BEDROOM")).toEqual({
      code: "1201",
      name: "Master Bedroom",
    });
    expect(parseBudgetArea("1300 - HERS OFFICE")).toEqual({
      code: "1300",
      name: "Hers Office",
    });
    expect(parseBudgetArea("Library")).toEqual({
      code: null,
      name: "Library",
    });
  });

  it("keeps the default review representation to sixteen operational columns", () => {
    expect(budgetReviewVisibleColumns).toEqual([
      "Include",
      "Action / Match",
      "Item #",
      "Description",
      "Supplier",
      "Building",
      "Room",
      "Qty",
      "Unit",
      "Purchase Unit HT",
      "Purchase Total HT",
      "Selling Unit HT",
      "Selling Total HT",
      "Markup %",
      "VAT %",
      "Warnings",
    ]);
    expect(budgetReviewVisibleColumns).not.toContain("Weight Each");
    expect(budgetReviewVisibleColumns).not.toContain("VAT amount");
  });

  it("reports actionable financial conflicts without optional-field noise", () => {
    expect(
      rowWarnings({
        markupRate: "0.150000",
        purchaseCurrencyCode: "EUR",
        quantity: "2.0000",
        supplierId: null,
        supplierName: null,
        totalPurchasePriceHt: "210.0000",
        totalSellingPriceHt: "260.0000",
        unitPurchasePriceHt: "100.0000",
        unitSellingPriceHt: "115.0000",
      }),
    ).toEqual([
      "Purchase total does not match quantity × purchase unit HT.",
      "Selling total does not match quantity × selling unit HT.",
      "Markup does not reconcile purchase and selling totals.",
    ]);
  });
});
