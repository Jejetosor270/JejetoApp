import { describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";

import { createOrderInputSchema } from "@/domain/procurement/validation";
import {
  FreightTreatment,
  PricingMode,
  ProcurementOrderStatus,
  VatDirection,
  VatTreatment,
} from "@/generated/prisma/client";

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
import { createOrder, summarizeOrder } from "@/lib/procurement/orders";

const timestamp = new Date("2026-08-25T12:00:00.000Z");

function sellingOrder(
  vatAmount: string,
  treatment: VatTreatment,
): Parameters<typeof summarizeOrder>[0] {
  return {
    acknowledgementDate: null,
    actualDeliveryDate: null,
    actualDispatchAt: null,
    actualProductionAt: null,
    buildings: [],
    category: null,
    costLines: [],
    createdAt: timestamp,
    createdById: null,
    description: null,
    estimatedDispatchAt: null,
    expectedDeliveryDate: null,
    expectedReadyDate: null,
    freightResaleAmount: new Decimal("5000"),
    freightTreatment: FreightTreatment.RECHARGED_SEPARATELY,
    id: "e12b6b9b-10e9-4e42-b93f-38796de4f65a",
    leadTimeWeeks: null,
    notes: null,
    orderCurrencyCode: "EUR",
    orderDate: null,
    orderNumber: "PO-001",
    packageName: "Example",
    pricingMode: PricingMode.SELLING_PRICE,
    project: {
      id: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      name: "Example Project",
      reportingCurrencyCode: "EUR",
    },
    projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
    purchaseFxRateToReporting: null,
    quoteDate: null,
    sellingCurrencyCode: "EUR",
    sellingFxRateToReporting: null,
    sellingPriceAmount: new Decimal("90000"),
    status: ProcurementOrderStatus.DRAFT,
    supplier: {
      defaultCurrencyCode: "EUR",
      defaultLeadTimeWeeks: null,
      displayName: "Example Supplier",
      id: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
    },
    supplierId: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
    supplierOrderConfirmationReference: null,
    supplierQuoteReference: null,
    targetMarginRate: null,
    updatedAt: timestamp,
    updatedById: null,
    vatEntries: [
      {
        countryCode: "FR",
        createdAt: timestamp,
        createdById: null,
        customTreatmentNote: null,
        direction: VatDirection.OUTPUT,
        id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
        isAmountOverride: false,
        orderId: "e12b6b9b-10e9-4e42-b93f-38796de4f65a",
        recoverability: null,
        taxableBaseAmount: new Decimal("90000"),
        treatment,
        updatedAt: timestamp,
        updatedById: null,
        vatAmount: new Decimal(vatAmount),
        vatRate: new Decimal("0.20"),
      },
    ],
  };
}

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

  it("adds output VAT actually charged to total Selling HT", () => {
    const summary = summarizeOrder(
      sellingOrder("18000", VatTreatment.DOMESTIC),
    );

    expect(summary.totalSellingRevenue).toBe("95000");
    expect(summary.costs.outputVat?.taxableBase).toBe("90000");
    expect(summary.totalSellingAmountIncludingVat).toBe("113000");
  });

  it("does not invent VAT for a reverse-charge sale", () => {
    const summary = summarizeOrder(
      sellingOrder("0", VatTreatment.REVERSE_CHARGE),
    );

    expect(summary.totalSellingRevenue).toBe("95000");
    expect(summary.totalSellingAmountIncludingVat).toBe("95000");
  });
});
