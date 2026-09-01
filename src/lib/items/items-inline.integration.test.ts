import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  findUnique: vi.fn(),
  locationCount: vi.fn(),
  update: vi.fn(),
}));

const transaction = {
  item: { findUnique: mocks.findUnique, update: mocks.update },
  logisticsLocation: { count: mocks.locationCount },
};

vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    $transaction: (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
  }),
}));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: mocks.audit }));

import {
  updateItemFinancialInline,
  updateItemStatusInline,
} from "@/lib/items/items";

describe("inline Item persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ itemReference: "I-1", name: "Chair" });
    mocks.update.mockResolvedValue({ id: "item-1" });
  });

  it("persists the exact reconciled markup draft and variance comment", async () => {
    const result = await updateItemFinancialInline("actor-1", {
      basis: "MARKUP",
      budgetTotal: null,
      budgetUnit: null,
      budgetVarianceComment: "Supplier price increase",
      id: "item-1",
      markupRate: "0.300000",
      quantity: "2.0000",
      totalPurchase: "200.0000",
      unitPurchase: "100.0000",
    });

    expect(result).toMatchObject({
      budgetTotal: "260.0000",
      budgetUnit: "130.0000",
      markupRate: "0.300000",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        budgetVarianceComment: "Supplier price increase",
        totalPurchasePriceHt: "200.0000",
        totalSellingPriceHt: "260.0000",
        unitSellingPriceHt: "130.0000",
        updatedById: "actor-1",
      }),
      where: { id: "item-1" },
    });
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("persists commercial and logistics status without a payment override", async () => {
    await updateItemStatusInline("actor-1", {
      commercialStatus: "ORDERED",
      id: "item-1",
      logisticsStatus: "IN_PRODUCTION",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commercialStatus: "ORDERED",
        logisticsStatus: "IN_PRODUCTION",
      }),
      where: { id: "item-1" },
    });
    expect(mocks.update.mock.calls[0]?.[0].data).not.toHaveProperty(
      "vendorPaymentStatus",
    );
  });
});
