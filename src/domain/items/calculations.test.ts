import { describe, expect, it } from "vitest";

import {
  calculateItemFinancials,
  projectFreightEstimate,
  quantityTimesUnitMatchesTotal,
} from "@/domain/items/calculations";

describe("Item Decimal-safe financials", () => {
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
});
