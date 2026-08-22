import { describe, expect, it, vi } from "vitest";

import { createOrderInputSchema } from "@/domain/procurement/validation";

const transactionMocks = vi.hoisted(() => ({
  procurementOrder: { create: vi.fn() },
  procurementOrderCostLine: { createMany: vi.fn(), deleteMany: vi.fn() },
  procurementOrderFinancials: { findUnique: vi.fn(), upsert: vi.fn() },
  procurementOrderVatEntry: { createMany: vi.fn(), deleteMany: vi.fn() },
}));

const databaseMocks = vi.hoisted(() => ({
  building: { findMany: vi.fn() },
  currency: { findFirst: vi.fn() },
  project: { findUnique: vi.fn() },
  supplier: { findUnique: vi.fn() },
  $transaction: vi.fn(
    async (
      callback: (transaction: typeof transactionMocks) => Promise<unknown>,
    ) => callback(transactionMocks),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => databaseMocks }));

import { createOrder } from "@/lib/procurement/orders";

const actorId = "d1ba89a0-c7d0-4657-a922-80cdf9f9b94e";
const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const supplierId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";
const buildingId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";
const orderId = "e12b6b9b-10e9-4e42-b93f-38796de4f65a";

function orderInput() {
  return createOrderInputSchema.parse({
    buildingIds: [buildingId],
    financialStates: [
      { freight: "5000", state: "BUDGET", supplierPurchase: "65000" },
      { state: "COMMITTED" },
      { state: "ACTUAL" },
    ],
    freightTreatment: "INCLUDED_IN_PACKAGE_PRICE",
    orderCurrencyCode: "EUR",
    orderNumber: "PRJ-001-PO-001",
    packageName: "Example Package",
    pricingMode: "SELLING_PRICE",
    pricingSourceState: "BUDGET",
    projectId,
    sellingPriceAmount: "100000",
    sellingCurrencyCode: "EUR",
    status: "DRAFT",
    supplierId,
  });
}

describe("procurement order writes", () => {
  it("checks relationships and writes audit attribution transactionally", async () => {
    databaseMocks.project.findUnique.mockResolvedValue({
      id: projectId,
      reportingCurrencyCode: "EUR",
    });
    databaseMocks.supplier.findUnique.mockResolvedValue({ id: supplierId });
    databaseMocks.currency.findFirst.mockResolvedValue({ code: "EUR" });
    databaseMocks.building.findMany.mockResolvedValue([{ id: buildingId }]);
    transactionMocks.procurementOrder.create.mockResolvedValue({ id: orderId });
    transactionMocks.procurementOrderFinancials.findUnique.mockResolvedValue(
      null,
    );
    transactionMocks.procurementOrderFinancials.upsert.mockResolvedValue({
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });

    await expect(createOrder(actorId, orderInput())).resolves.toBe(orderId);

    expect(databaseMocks.building.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [buildingId] }, projectId },
      }),
    );
    expect(transactionMocks.procurementOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildings: { create: [{ buildingId, createdById: actorId }] },
          createdById: actorId,
          updatedById: actorId,
        }),
      }),
    );
    expect(
      transactionMocks.procurementOrderCostLine.createMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            createdById: actorId,
            originalAmount: "65000.0000",
            updatedById: actorId,
          }),
        ]),
      }),
    );
  });

  it("rejects a building from another project before opening a transaction", async () => {
    databaseMocks.project.findUnique.mockResolvedValue({
      id: projectId,
      reportingCurrencyCode: "EUR",
    });
    databaseMocks.supplier.findUnique.mockResolvedValue({ id: supplierId });
    databaseMocks.currency.findFirst.mockResolvedValue({ code: "EUR" });
    databaseMocks.building.findMany.mockResolvedValue([]);

    await expect(createOrder(actorId, orderInput())).rejects.toThrow(
      "Every selected building",
    );
  });

  it("preserves original values and writes converted FX and VAT values", async () => {
    databaseMocks.project.findUnique.mockResolvedValue({
      id: projectId,
      reportingCurrencyCode: "EUR",
    });
    databaseMocks.supplier.findUnique.mockResolvedValue({ id: supplierId });
    databaseMocks.currency.findFirst.mockResolvedValue({ code: "active" });
    databaseMocks.building.findMany.mockResolvedValue([{ id: buildingId }]);
    transactionMocks.procurementOrder.create.mockResolvedValue({ id: orderId });
    transactionMocks.procurementOrderFinancials.findUnique.mockResolvedValue(
      null,
    );
    transactionMocks.procurementOrderFinancials.upsert.mockResolvedValue({
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });
    const input = createOrderInputSchema.parse({
      ...orderInput(),
      financialStates: [
        {
          inputVatRate: "20",
          inputVatRecoverability: "NON_RECOVERABLE",
          inputVatTaxableBase: "65000",
          inputVatTreatment: "IMPORT",
          purchaseFxRate: "0.8575",
          sellingFxRate: "1.17",
          state: "BUDGET",
          supplierPurchase: "65000",
        },
        { state: "COMMITTED" },
        { state: "ACTUAL" },
      ],
      orderCurrencyCode: "USD",
      sellingCurrencyCode: "GBP",
    });

    await createOrder(actorId, input);

    expect(
      transactionMocks.procurementOrderCostLine.createMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            fxRateToReporting: "0.8575000000",
            originalAmount: "65000.0000",
            originalCurrencyCode: "USD",
            reportingAmount: "55737.5000",
            reportingCurrencyCode: "EUR",
          }),
        ]),
      }),
    );
    expect(
      transactionMocks.procurementOrderVatEntry.createMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            direction: "INPUT",
            recoverability: "NON_RECOVERABLE",
            reportingVatAmount: "11147.5000",
            vatAmount: "13000.0000",
          }),
        ]),
      }),
    );
  });
});
