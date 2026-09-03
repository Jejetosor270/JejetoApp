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

describe("Project freight reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.project.findUnique.mockResolvedValue({
      defaultFreightMarkupRate: "0.10",
      estimatedPurchaseCostHt: "591700",
      freightEstimateRate: "0.10",
      reportingCurrencyCode: "EUR",
    });
    database.projectFreightExpense.findMany.mockResolvedValue([]);
  });

  it("uses Project expected purchase for planning and actual costs for recovery", async () => {
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
      actualComplete: true,
      actualCostHt: "435.0000",
      complete: true,
      expectedFreightAllowanceHt: "59170.0000",
      expectedProductPurchaseCostHt: "591700.0000",
      freightGrossProfitHt: "43.5000",
      headroomHt: "58691.5000",
      planningComplete: true,
      recoveryTargetHt: "478.5000",
    });
  });
});
