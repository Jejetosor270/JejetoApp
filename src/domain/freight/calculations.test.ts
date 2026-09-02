import { describe, expect, it } from "vitest";

import {
  clientFreightAllowance,
  reconcileProjectFreight,
  resolveOrderFreightAllowance,
} from "@/domain/freight/calculations";

describe("freight commercial allowance", () => {
  it("derives the allowance from Product Sell HT", () => {
    expect(clientFreightAllowance("100000", "0.15").toFixed(4)).toBe(
      "15000.0000",
    );
  });

  it("keeps manual Order allowances stable while AUTO follows the Project rate", () => {
    expect(
      resolveOrderFreightAllowance({
        productSellHt: "100000",
        projectFreightEstimateRate: "0.15",
      }),
    ).toMatchObject({ source: "PROJECT_ESTIMATE" });
    expect(
      resolveOrderFreightAllowance({
        allowanceOverrideHt: "12000",
        productSellHt: "200000",
        projectFreightEstimateRate: "0.20",
      }).amount.toFixed(4),
    ).toBe("12000.0000");
  });
});

describe("freight reconciliation", () => {
  it("aggregates Order and Project freight before deriving recovery", () => {
    expect(
      reconcileProjectFreight({
        expenses: [{ costHt: "20000", markupRate: "0.15" }],
        orders: [
          {
            freightCostHt: "40000",
            freightMarkupRate: "0.15",
            productSellHt: "500000",
          },
        ],
        projectFreightEstimateRate: "0.15",
      }),
    ).toEqual({
      actualCostHt: "60000.0000",
      allowanceHt: "75000.0000",
      complete: true,
      freightGrossProfitHt: "9000.0000",
      headroomHt: "6000.0000",
      productSellHt: "500000.0000",
      recoveryTargetHt: "69000.0000",
    });
  });

  it("marks reconciliation incomplete instead of dropping missing FX values", () => {
    expect(
      reconcileProjectFreight({
        expenses: [{ costHt: null, markupRate: "0.15" }],
        orders: [],
        projectFreightEstimateRate: "0.15",
      }).complete,
    ).toBe(false);
  });
});
