import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";

import { createOrderInputSchema } from "@/domain/procurement/validation";
import {
  FreightTreatment,
  PricingMode,
  ProcurementCostCategory,
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
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: vi.fn() }));
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
    clientBillingAllocations: [],
    category: null,
    costLines: [],
    createdAt: timestamp,
    createdById: null,
    description: null,
    estimatedDispatchAt: null,
    expectedDeliveryDate: null,
    expectedReadyDate: null,
    freightResaleAmount: new Decimal("5000"),
    freightMarkupOverrideRate: null,
    freightTreatment: FreightTreatment.RECHARGED_SEPARATELY,
    id: "e12b6b9b-10e9-4e42-b93f-38796de4f65a",
    leadTimeWeeks: null,
    notes: null,
    otherCostMarkupOverrideRate: null,
    orderCurrencyCode: "EUR",
    orderDate: null,
    orderNumber: "PO-001",
    packageName: "Example",
    paymentInstallments: [],
    pricingMode: PricingMode.SELLING_PRICE,
    productMarkupOverrideRate: null,
    project: {
      defaultFreightMarkupRate: new Decimal(0),
      defaultOtherCostMarkupRate: new Decimal(0),
      defaultProductMarkupRate: new Decimal(0),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("derives Product and Freight selling independently from inherited markups", () => {
    const order = sellingOrder("0", VatTreatment.OUT_OF_SCOPE);
    const summary = summarizeOrder({
      ...order,
      freightResaleAmount: null,
      freightTreatment: FreightTreatment.INCLUDED_IN_PACKAGE_PRICE,
      pricingMode: PricingMode.COMPONENT_MARKUP,
      project: {
        ...order.project,
        defaultFreightMarkupRate: new Decimal("0.15"),
        defaultProductMarkupRate: new Decimal("0.30"),
      },
      sellingPriceAmount: null,
      costLines: [
        {
          category: ProcurementCostCategory.SUPPLIER_PURCHASE,
          createdAt: timestamp,
          createdById: null,
          description: null,
          id: "c12b6b9b-10e9-4e42-b93f-38796de4f65a",
          originalAmount: new Decimal("100"),
          orderId: order.id,
          updatedAt: timestamp,
          updatedById: null,
        },
        {
          category: ProcurementCostCategory.FREIGHT,
          createdAt: timestamp,
          createdById: null,
          description: null,
          id: "d12b6b9b-10e9-4e42-b93f-38796de4f65a",
          originalAmount: new Decimal("10"),
          orderId: order.id,
          updatedAt: timestamp,
          updatedById: null,
        },
      ],
    });
    expect(summary.componentPricing).toMatchObject({
      effectiveMarkupRate: "0.286364",
      freightMarkupSource: "PROJECT_DEFAULT",
      freightSellReporting: "11.5000",
      productMarkupSource: "PROJECT_DEFAULT",
      productSellReporting: "130.0000",
      totalSellReporting: "141.5000",
    });
    expect(summary.totalSellingRevenue).toBe("141.5");
    expect(summary.costs.grossProfit).toBe("31.5");
  });

  it("derives Order profitability from comparable Invoice allocations", () => {
    const order = sellingOrder("18000", VatTreatment.DOMESTIC);
    const summary = summarizeOrder({
      ...order,
      clientBillingAllocations: [
        {
          allocatedAmount: new Decimal("100000"),
          basis: "FIXED_AMOUNT",
          billingDocument: {
            currencyCode: "EUR",
            documentType: "INVOICE",
            fxRateToReporting: null,
          },
          billingDocumentId: "a22b6b9b-10e9-4e42-b93f-38796de4f65a",
          createdAt: timestamp,
          createdById: null,
          id: "b22b6b9b-10e9-4e42-b93f-38796de4f65a",
          orderId: order.id,
          percentageRate: null,
          updatedAt: timestamp,
          updatedById: null,
        },
      ],
      costLines: [
        {
          category: ProcurementCostCategory.SUPPLIER_PURCHASE,
          createdAt: timestamp,
          createdById: null,
          description: null,
          id: "c22b6b9b-10e9-4e42-b93f-38796de4f65a",
          originalAmount: new Decimal("70000"),
          orderId: order.id,
          updatedAt: timestamp,
          updatedById: null,
        },
      ],
    });

    expect(summary.billing).toMatchObject({
      actualGrossProfit: "30000",
      actualMarginRate: "0.3",
      actualMarkupRate: expect.stringMatching(/^0\.428571/),
      conversionComplete: true,
      invoicedAllocated: "100000",
    });
  });

  it("marks allocated billing incomplete instead of treating missing FX as zero", () => {
    const order = sellingOrder("18000", VatTreatment.DOMESTIC);
    const summary = summarizeOrder({
      ...order,
      clientBillingAllocations: [
        {
          allocatedAmount: new Decimal("100000"),
          basis: "FIXED_AMOUNT",
          billingDocument: {
            currencyCode: "USD",
            documentType: "INVOICE",
            fxRateToReporting: null,
          },
          billingDocumentId: "a22b6b9b-10e9-4e42-b93f-38796de4f65a",
          createdAt: timestamp,
          createdById: null,
          id: "b22b6b9b-10e9-4e42-b93f-38796de4f65a",
          orderId: order.id,
          percentageRate: null,
          updatedAt: timestamp,
          updatedById: null,
        },
      ],
    });

    expect(summary.billing).toMatchObject({
      actualGrossProfit: null,
      conversionComplete: false,
      invoicedAllocated: null,
    });
  });

  it("rejects a reviewed Building that is not part of the selected Project", async () => {
    database.project.findUnique.mockResolvedValue({
      reportingCurrencyCode: "EUR",
    });
    database.supplier.findUnique.mockResolvedValue({ id: "supplier" });
    database.currency.findFirst.mockResolvedValue({ code: "EUR" });
    database.building.findMany.mockResolvedValue([]);
    const input = createOrderInputSchema.parse({
      buildingIds: ["d12b6b9b-10e9-4e42-b93f-38796de4f65a"],
      freightTreatment: "NOT_APPLICABLE",
      orderCurrencyCode: "EUR",
      orderNumber: "PO-BUILDING-CHECK",
      packageName: "Building validation",
      pricingMode: "SELLING_PRICE",
      projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      sellingCurrencyCode: "EUR",
      status: "DRAFT",
      supplierId: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });

    await expect(createOrder("actor-1", input)).rejects.toThrow(
      "Every selected building",
    );
    expect(transaction.procurementOrder.create).not.toHaveBeenCalled();
  });
});
