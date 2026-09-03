import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  clientFreightAllowance,
  reconcileProjectFreight,
  resolveOrderFreightAllowance,
} from "@/domain/freight/calculations";

describe("freight commercial allowance", () => {
  it("derives the allowance from Product Purchase Cost HT", () => {
    expect(clientFreightAllowance("50000", "0.10").toFixed(4)).toBe(
      "5000.0000",
    );
  });

  it("ignores Product Sell and applies the estimate only to Product Purchase Cost", () => {
    const clientBudgetHt = new Decimal("1000000");
    const productSellHt = new Decimal("68144.13");
    const allowance = clientFreightAllowance("50000", "0.10");

    expect(allowance.toFixed(4)).toBe("5000.0000");
    expect(allowance.equals(productSellHt.times("0.10"))).toBe(false);
    expect(allowance.equals(clientBudgetHt.times("0.10"))).toBe(false);
  });

  it("updates AUTO with purchase cost and keeps a manual Order allowance stable", () => {
    const initial = resolveOrderFreightAllowance({
      productPurchaseCostHt: "40000",
      projectFreightEstimateRate: "0.10",
    });
    const updated = resolveOrderFreightAllowance({
      productPurchaseCostHt: "50000",
      projectFreightEstimateRate: "0.10",
    });
    const manual = resolveOrderFreightAllowance({
      allowanceOverrideHt: "4500",
      productPurchaseCostHt: "60000",
      projectFreightEstimateRate: "0.10",
    });

    expect(initial).toMatchObject({ source: "PROJECT_ESTIMATE" });
    expect(initial.amount.toFixed(4)).toBe("4000.0000");
    expect(updated.amount.toFixed(4)).toBe("5000.0000");
    expect(manual).toMatchObject({ source: "MANUAL" });
    expect(manual.amount.toFixed(4)).toBe("4500.0000");
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
            productPurchaseCostHt: "500000",
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
      productPurchaseCostHt: "500000.0000",
      recoveryTargetHt: "69000.0000",
    });
  });

  it("updates AUTO allowance when another Order increases Product Purchase Cost", () => {
    const initial = reconcileProjectFreight({
      expenses: [],
      orders: [
        {
          freightCostHt: "0",
          freightMarkupRate: "0.15",
          productPurchaseCostHt: "500000",
        },
      ],
      projectFreightEstimateRate: "0.15",
    });
    const updated = reconcileProjectFreight({
      expenses: [],
      orders: [
        {
          freightCostHt: "0",
          freightMarkupRate: "0.15",
          productPurchaseCostHt: "500000",
        },
        {
          freightCostHt: "0",
          freightMarkupRate: "0.15",
          productPurchaseCostHt: "100000",
        },
      ],
      projectFreightEstimateRate: "0.15",
    });

    expect(initial.allowanceHt).toBe("75000.0000");
    expect(updated.productPurchaseCostHt).toBe("600000.0000");
    expect(updated.allowanceHt).toBe("90000.0000");
  });

  it("keeps Freight Estimate and Freight Markup separate when deriving headroom", () => {
    expect(
      reconcileProjectFreight({
        expenses: [],
        orders: [
          {
            freightCostHt: "435",
            freightMarkupRate: "0.10",
            productPurchaseCostHt: "50000",
          },
        ],
        projectFreightEstimateRate: "0.10",
      }),
    ).toMatchObject({
      actualCostHt: "435.0000",
      allowanceHt: "5000.0000",
      freightGrossProfitHt: "43.5000",
      headroomHt: "4521.5000",
      recoveryTargetHt: "478.5000",
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
