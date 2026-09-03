import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  projectFreightExpense: { findMany: vi.fn() },
}));
const orders = vi.hoisted(() => ({ listProjectOrders: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/procurement/orders", () => orders);

import { getProjectFreightReconciliation } from "./expenses";

describe("legacy Project freight reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.project.findUnique.mockResolvedValue({
      defaultFreightMarkupRate: "0.10",
      freightEstimateRate: "0.10",
      reportingCurrencyCode: "EUR",
    });
    database.projectFreightExpense.findMany.mockResolvedValue([]);
  });

  it("recalculates an existing Project from authoritative Order purchase costs", async () => {
    orders.listProjectOrders.mockResolvedValue([
      {
        componentPricing: { freightMarkupRate: "0.10" },
        costs: {
          freight: null,
          purchaseCost: "45652.07",
          purchaseFxRate: null,
          sellingFxRate: null,
        },
        freightAllowanceOverrideAmount: null,
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        status: "ORDERED",
      },
      {
        componentPricing: { freightMarkupRate: "0.10" },
        costs: {
          freight: "435",
          purchaseCost: "6766.49",
          purchaseFxRate: null,
          sellingFxRate: null,
        },
        freightAllowanceOverrideAmount: null,
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        status: "ORDERED",
      },
    ]);

    await expect(
      getProjectFreightReconciliation("legacy-project"),
    ).resolves.toMatchObject({
      actualCostHt: "435.0000",
      allowanceHt: "5241.8560",
      complete: true,
      freightGrossProfitHt: "43.5000",
      headroomHt: "4763.3560",
      productPurchaseCostHt: "52418.5600",
      recoveryTargetHt: "478.5000",
    });
  });
});
