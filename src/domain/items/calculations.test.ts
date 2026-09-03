import { describe, expect, it } from "vitest";

import {
  budgetPriceFromMarkup,
  calculateItemFinancials,
  itemBudgetVariance,
  markupRateFromPrices,
  projectFreightEstimate,
  quoteItemLineAmounts,
  quoteItemPercentInputToRate,
  quoteItemReviewReconciliation,
  quoteItemReviewTotal,
  quoteItemTotalFromUnit,
  quantityTimesUnitMatchesTotal,
  reconcileItemFinancialDraft,
} from "@/domain/items/calculations";

describe("Item Decimal-safe financials", () => {
  it("recalculates quote-review totals and VAT with exact decimals", () => {
    expect(quoteItemTotalFromUnit("3", "19.95")).toBe("59.8500");
    expect(quoteItemPercentInputToRate("5.5")).toBe("0.055000");
    expect(quoteItemTotalFromUnit("3,5", "1 000,50")).toBe("3501.7500");
    expect(quoteItemPercentInputToRate("15,5%")).toBe("0.155000");
    expect(quoteItemPercentInputToRate("100")).toBe("1.000000");
    expect(quoteItemPercentInputToRate("100.0001")).toBeNull();
    expect(
      quoteItemLineAmounts({
        totalPriceHt: "59.8500",
        vatRate: "0.055000",
      }),
    ).toEqual({ totalTtc: "63.1418", vatAmount: "3.2918" });
    expect(
      quoteItemReviewTotal([
        { include: true, totalPriceHt: "59.8500" },
        { include: false, totalPriceHt: "100.0000" },
        { include: true, totalPriceHt: "40.1500" },
      ]),
    ).toEqual({ complete: true, totalHt: "100.0000" });
    expect(quoteItemReviewReconciliation("100.0000", "100.0100")).toEqual({
      difference: "-0.0100",
      isReconciled: true,
    });
  });

  it("derives totals and metrics from Decimal quantities without floating-point truth", () => {
    const result = calculateItemFinancials({
      pricingMode: "SELLING_PRICE",
      quantity: "2.5",
      unitPurchasePriceHt: "12.3456",
      unitSellingPriceHt: "20",
    });
    expect(result.totalPurchasePriceHt).toBe("30.8640");
    expect(result.totalSellingPriceHt).toBe("50.0000");
    expect(result.grossProfit).toBe("19.1360");
    expect(result.grossMarginRate).toBe("0.382720");
    expect(result.markupRate).toBe("0.620010");
  });

  it("preserves disagreeing source totals and warns within a 0.02 tolerance", () => {
    const result = calculateItemFinancials({
      pricingMode: "SELLING_PRICE",
      quantity: "8",
      totalPurchasePriceHt: "10010",
      unitPurchasePriceHt: "1250",
    });
    expect(result.totalPurchasePriceHt).toBe("10010.0000");
    expect(result.warnings).toContain(
      "Quantity × unit price does not match total purchase HT.",
    );
    expect(quantityTimesUnitMatchesTotal("3", "10", "30.02")).toBe(true);
  });

  it("derives target-margin selling price and Project freight separately", () => {
    const result = calculateItemFinancials({
      pricingMode: "TARGET_MARGIN",
      quantity: "2",
      targetMarginRate: "0.30",
      totalPurchasePriceHt: "70",
    });
    expect(result.totalSellingPriceHt).toBe("100.0000");
    expect(projectFreightEstimate("100000", "0.08")).toBe("8000.0000");
  });

  it("uses markup, not margin, to derive and explain Item budget values", () => {
    expect(budgetPriceFromMarkup("100", "0.30")).toBe("130.0000");
    expect(markupRateFromPrices("100", "130")).toBe("0.300000");
    expect(
      reconcileItemFinancialDraft({
        basis: "MARKUP",
        budgetTotal: null,
        budgetUnit: null,
        markupRate: "0.30",
        quantity: "2",
        totalPurchase: "200",
        unitPurchase: "100",
      }),
    ).toMatchObject({
      budgetTotal: "260.0000",
      budgetUnit: "130.0000",
      markupRate: "0.300000",
    });
  });

  it("reports signed budget meaning without exposing floating-point truth", () => {
    expect(itemBudgetVariance("10000", "9200")).toEqual({
      amount: "800.0000",
      status: "UNDER_BUDGET",
    });
    expect(itemBudgetVariance("10000", "10750")).toEqual({
      amount: "750.0000",
      status: "OVER_BUDGET",
    });
    expect(itemBudgetVariance("10000", "10000")).toEqual({
      amount: "0.0000",
      status: "ON_BUDGET",
    });
  });
});
