import { describe, expect, it } from "vitest";

import {
  calculateNetCashPosition,
  calculateProjectActualProfitability,
  calculateProjectTargets,
  financialVariance,
} from "./targets";

describe("project financial targets", () => {
  it("derives expected sell, profit, markup and margin from cost and markup", () => {
    expect(
      calculateProjectTargets({
        estimatedFreightCostHt: "10000",
        estimatedPurchaseCostHt: "90000",
        targetMarkupRate: "0.30",
        targetMode: "MARKUP",
      }),
    ).toEqual({
      estimatedCostHt: "100000.0000",
      expectedGrossProfit: "30000.0000",
      expectedMarginRate: "0.230769",
      expectedSellHt: "130000.0000",
      targetMarkupRate: "0.300000",
    });
  });

  it("derives markup and margin when expected sell is authoritative", () => {
    const result = calculateProjectTargets({
      estimatedPurchaseCostHt: "70000",
      expectedSellHt: "100000",
      targetMode: "EXPECTED_SELL",
    });
    expect(result.expectedGrossProfit).toBe("30000.0000");
    expect(result.targetMarkupRate).toBe("0.428571");
    expect(result.expectedMarginRate).toBe("0.300000");
  });

  it("calculates monetary variance without floating point arithmetic", () => {
    expect(financialVariance("470000", "500000")).toBe("-30000.0000");
  });

  it("aggregates actual profitability after monetary totals and keeps cash separate", () => {
    expect(calculateProjectActualProfitability("70000", "100000")).toEqual({
      grossProfit: "30000.0000",
      marginRate: "0.300000",
      markupRate: "0.428571",
    });
    expect(calculateNetCashPosition("60000", "45000")).toBe("15000.0000");
  });
});
