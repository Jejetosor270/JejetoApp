import { describe, expect, it, vi } from "vitest";

import { createOrderInputSchema } from "@/domain/procurement/validation";

const transaction = vi.hoisted(() => ({
  procurementOrder: { create: vi.fn() },
  procurementOrderCostLine: { createMany: vi.fn(), deleteMany: vi.fn() },
  procurementOrderVatEntry: { createMany: vi.fn(), deleteMany: vi.fn() },
}));
const database = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  supplier: { findUnique: vi.fn() },
  currency: { findFirst: vi.fn() },
  building: { findMany: vi.fn() },
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
import { createOrder } from "@/lib/procurement/orders";

describe("single order cost write", () => {
  it("writes one normalized order cost and VAT set", async () => {
    database.project.findUnique.mockResolvedValue({
      reportingCurrencyCode: "EUR",
    });
    database.supplier.findUnique.mockResolvedValue({
      id: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });
    database.currency.findFirst.mockResolvedValue({ code: "active" });
    database.building.findMany.mockResolvedValue([]);
    transaction.procurementOrder.create.mockResolvedValue({
      id: "e12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });
    const input = createOrderInputSchema.parse({
      buildingIds: [],
      freightTreatment: "NOT_APPLICABLE",
      inputVatRecoverability: "NON_RECOVERABLE",
      inputVatRate: "20",
      inputVatTaxableBase: "65000",
      inputVatTreatment: "IMPORT",
      orderCurrencyCode: "USD",
      orderNumber: "PO-001",
      packageName: "Example",
      pricingMode: "SELLING_PRICE",
      projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      purchaseCost: "65000",
      purchaseFxRate: "0.8575",
      sellingCurrencyCode: "EUR",
      sellingPriceAmount: "100000",
      status: "DRAFT",
      supplierId: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });
    await createOrder("d1ba89a0-c7d0-4657-a922-80cdf9f9b94e", input);
    expect(
      transaction.procurementOrderCostLine.createMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            category: "SUPPLIER_PURCHASE",
            originalAmount: "65000.0000",
          }),
        ],
      }),
    );
    expect(
      transaction.procurementOrderVatEntry.createMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            recoverability: "NON_RECOVERABLE",
            vatAmount: "13000.0000",
          }),
        ]),
      }),
    );
  });
});
