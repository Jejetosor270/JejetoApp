import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";

import { createOrderInputSchema } from "@/domain/procurement/validation";
import {
  FreightTreatment,
  PricingMode,
  ProcurementCostCategory,
  ProcurementOrderStatus,
  VatDirection,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";

const transaction = vi.hoisted(() => ({
  paymentInstallment: { create: vi.fn() },
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
): Parameters<typeof summarizeOrder>[0] & {
  project: NonNullable<Parameters<typeof summarizeOrder>[0]["project"]>;
} {
  return {
    credits: [],
    trashedAt: null,
    shortDescription: null,
    paymentStatusOverride: null,
    detachedReportingCurrencyCode: null,
    carrierCode: null,
    carrierOtherName: null,
    trackingReference: null,
    budgetPurchaseAmountHt: null,
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
    freightAllowanceOverrideAmount: null,
    freightMarkupOverrideRate: null,
    freightTreatment: FreightTreatment.RECHARGED_SEPARATELY,
    id: "e12b6b9b-10e9-4e42-b93f-38796de4f65a",
    leadTimeWeeks: null,
    notes: null,
    otherCostMarkupOverrideRate: null,
    outputVatTaxableBaseOverride: new Decimal("90000"),
    orderCurrencyCode: "EUR",
    orderDate: null,
    invoiceDate: null,
    orderNumber: "PO-001",
    packageId: null,
    orderPackage: null,
    packageName: "Example",
    paymentInstallments: [],
    pricingMode: PricingMode.SELLING_PRICE,
    productMarkupOverrideRate: null,
    project: {
      defaultFreightMarkupRate: new Decimal(0),
      defaultOtherCostMarkupRate: new Decimal(0),
      defaultProductMarkupRate: new Decimal(0),
      freightEstimateRate: null,
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
        recoverableRate: null,
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

it.each([
  PricingMode.PROJECT_MARKUP,
  PricingMode.ORDER_MARKUP,
  PricingMode.DIRECT_SELLING_PRICE,
  PricingMode.TARGET_MARGIN,
])(
  "nets Supplier credits without repricing the %s client sale or replacing editable source values",
  (mode) => {
    const source = sellingOrder("0", VatTreatment.DOMESTIC);
    const vat = source.vatEntries[0];
    if (!vat) throw new Error("Missing test VAT source");
    source.orderCurrencyCode = "USD";
    source.purchaseFxRateToReporting = new Decimal("0.9");
    source.pricingMode = mode;
    source.sellingPriceAmount = new Decimal("200");
    source.targetMarginRate = new Decimal("0.3");
    source.productMarkupOverrideRate = new Decimal("0.5");
    source.freightMarkupOverrideRate = new Decimal("0");
    source.otherCostMarkupOverrideRate = new Decimal("0");
    source.project.defaultProductMarkupRate = new Decimal("0.5");
    source.freightResaleAmount = new Decimal("0");
    source.costLines = [
      {
        category: ProcurementCostCategory.SUPPLIER_PURCHASE,
        originalAmount: new Decimal("100"),
        id: "cost",
        orderId: source.id,
        description: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdById: null,
        updatedById: null,
      },
    ];
    source.vatEntries = [
      {
        ...vat,
        direction: VatDirection.INPUT,
        taxableBaseAmount: new Decimal("100"),
        vatAmount: new Decimal("20"),
        vatRate: new Decimal("0.2"),
        recoverability: VatRecoverability.PARTIALLY_RECOVERABLE,
        recoverableRate: new Decimal("0.5"),
      },
    ];
    const original = summarizeOrder(source);
    source.credits = [
      {
        id: "credit",
        side: "SUPPLIER",
        billingDocumentId: null,
        orderId: source.id,
        supplierVatEntryId: vat.id,
        reference: "CR-1",
        creditDate: timestamp,
        reason: "Price correction",
        totalHt: new Decimal("20"),
        vatAmount: new Decimal("4"),
        freightCoverageHt: new Decimal("0"),
        otherCoverageHt: new Decimal("0"),
        currencyCode: "USD",
        reportingCurrencyCode: "EUR",
        fxRateToReporting: new Decimal("0.8"),
        supplierRecoverableRate: new Decimal("0.5"),
        isCancelled: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdById: null,
        updatedById: null,
        allocations: [],
        refunds: [],
      },
    ];
    const net = summarizeOrder(source);
    expect(net.totalSellingRevenue).toBe(original.totalSellingRevenue);
    expect(net.componentPricing).toEqual(original.componentPricing);
    expect(net.costs.purchaseCost).toBe("100");
    expect(net.costs.inputVat?.amount).toBe("20");
    expect(net.costs.economicLandedCost).toBe("88");
    expect(net.costs.reportingEconomicLandedCost).toBe("81.4");
    expect(net.costs.reportingLandedCost).toBe("74");
    expect(net.supplierPayment.totalPayable).toBe("96");
    expect(net.supplierPayment.outstanding).toBe("96");
    expect(net.supplierPayment.paid).toBe("0");
    expect(net.costs.grossProfit).toBe(
      new Decimal(original.costs.grossProfit ?? "0").plus("17.6").toString(),
    );
    const credit = source.credits[0];
    if (!credit) throw new Error("Missing test credit");
    credit.totalHt = new Decimal("100");
    credit.vatAmount = new Decimal("20");
    const creditedInFull = summarizeOrder(source);
    expect(creditedInFull.supplierPayment.outstanding).toBe("0");
    expect(creditedInFull.supplierPayment.status).not.toBe("PAID");
    expect(creditedInFull.supplierPayment.paidAt).toBeNull();
    credit.fxRateToReporting = null;
    const missing = summarizeOrder(source);
    expect(missing.costs.reportingEconomicLandedCost).toBeNull();
    expect(missing.costs.grossProfit).toBeNull();
    expect(missing.totalSellingRevenue).toBe(original.totalSellingRevenue);
  },
);

describe("single order cost write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes one normalized order cost and VAT set", async () => {
    database.project.findUnique.mockResolvedValue({
      defaultFreightMarkupRate: new Decimal(0),
      defaultOtherCostMarkupRate: new Decimal(0),
      defaultProductMarkupRate: new Decimal(0),
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
      carrierCode: "OTHER",
      carrierOtherName: "Local freight",
      trackingReference: "BOL-123",
      budgetPurchaseAmountHt: "70000",
      buildingIds: [],
      freightTreatment: "NOT_APPLICABLE",
      inputVatRecoverability: "NON_RECOVERABLE",
      inputVatRecoverableRate: "0",
      inputVatRate: "20",
      inputVatTaxableBase: "65000",
      inputVatTreatment: "IMPORT",
      orderCurrencyCode: "USD",
      orderNumber: "PO-001",
      outputVatRate: "20",
      outputVatTreatment: "DOMESTIC",
      packageName: "Example",
      pricingMode: "DIRECT_SELLING_PRICE",
      projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      purchaseCost: "65000",
      purchaseFxRate: "0.8575",
      sellingCurrencyCode: "EUR",
      sellingPriceAmount: "100000",
      status: "DRAFT",
      supplierId: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });
    await createOrder("d1ba89a0-c7d0-4657-a922-80cdf9f9b94e", input);
    expect(transaction.procurementOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          carrierCode: "OTHER",
          carrierOtherName: "Local freight",
          trackingReference: "BOL-123",
          budgetPurchaseAmountHt: "70000.0000",
        }),
      }),
    );
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
            recoverableRate: "0.000000",
            vatAmount: "13000.0000",
          }),
          expect.objectContaining({
            direction: "OUTPUT",
            taxableBaseAmount: "100000.0000",
            vatAmount: "20000.0000",
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
    const order = sellingOrder("0", VatTreatment.REVERSE_CHARGE);
    const outputVat = order.vatEntries[0];
    if (outputVat) outputVat.vatRate = new Decimal(0);
    const summary = summarizeOrder(order);

    expect(summary.totalSellingRevenue).toBe("95000");
    expect(summary.totalSellingAmountIncludingVat).toBe("95000");
  });

  it("adds only non-deductible partial input VAT to economic cost", () => {
    const order = sellingOrder("0", VatTreatment.OUT_OF_SCOPE);
    order.costLines = [
      {
        category: ProcurementCostCategory.SUPPLIER_PURCHASE,
        createdAt: timestamp,
        createdById: null,
        description: null,
        id: "c12b6b9b-10e9-4e42-b93f-38796de4f65a",
        originalAmount: new Decimal("8000"),
        orderId: order.id,
        updatedAt: timestamp,
        updatedById: null,
      },
    ];
    order.vatEntries.unshift({
      countryCode: "FR",
      createdAt: timestamp,
      createdById: null,
      customTreatmentNote: null,
      direction: VatDirection.INPUT,
      id: "a22b6b9b-10e9-4e42-b93f-38796de4f65a",
      isAmountOverride: true,
      orderId: order.id,
      recoverability: VatRecoverability.PARTIALLY_RECOVERABLE,
      recoverableRate: new Decimal("0.60"),
      taxableBaseAmount: new Decimal("50000"),
      treatment: VatTreatment.DOMESTIC,
      updatedAt: timestamp,
      updatedById: null,
      vatAmount: new Decimal("10000"),
      vatRate: new Decimal("0.20"),
    });

    expect(summarizeOrder(order).costs.economicLandedCost).toBe("12000");
  });

  it("derives Product and Freight selling independently from inherited markups", () => {
    const order = sellingOrder("0", VatTreatment.OUT_OF_SCOPE);
    const outputVat = order.vatEntries[0];
    if (outputVat) outputVat.vatRate = new Decimal(0);
    const summary = summarizeOrder({
      ...order,
      freightResaleAmount: null,
      freightTreatment: FreightTreatment.INCLUDED_IN_PACKAGE_PRICE,
      outputVatTaxableBaseOverride: null,
      pricingMode: PricingMode.PROJECT_MARKUP,
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
    expect(summary.costs.outputVat?.taxableBase).toBe("141.5");
    expect(summary.costs.grossProfit).toBe("31.5");
  });

  it("reprices PROJECT_MARKUP dynamically while preserving a manual VAT base", () => {
    const order = sellingOrder("20", VatTreatment.DOMESTIC);
    order.pricingMode = PricingMode.PROJECT_MARKUP;
    order.freightTreatment = FreightTreatment.NOT_APPLICABLE;
    order.freightResaleAmount = null;
    order.costLines = [
      {
        category: ProcurementCostCategory.SUPPLIER_PURCHASE,
        createdAt: timestamp,
        createdById: null,
        description: null,
        id: "a32b6b9b-10e9-4e42-b93f-38796de4f65a",
        originalAmount: new Decimal("100"),
        orderId: order.id,
        updatedAt: timestamp,
        updatedById: null,
      },
    ];
    order.project.defaultProductMarkupRate = new Decimal("0.30");
    order.outputVatTaxableBaseOverride = null;
    const first = summarizeOrder(order);
    order.project.defaultProductMarkupRate = new Decimal("0.40");
    const second = summarizeOrder(order);
    expect(first.totalSellingRevenue).toBe("130");
    expect(first.costs.outputVat?.taxableBase).toBe("130");
    expect(first.costs.outputVat?.amount).toBe("26");
    expect(second.totalSellingRevenue).toBe("140");
    expect(second.costs.outputVat?.taxableBase).toBe("140");
    expect(second.costs.outputVat?.amount).toBe("28");
  });

  it("derives legacy AUTO freight allowance from Product Purchase Cost", () => {
    const order = sellingOrder("0", VatTreatment.DOMESTIC);
    order.pricingMode = PricingMode.PROJECT_MARKUP;
    order.freightTreatment = FreightTreatment.NOT_APPLICABLE;
    order.project.freightEstimateRate = new Decimal("0.10");
    order.project.defaultProductMarkupRate = new Decimal("0.30");
    order.costLines = [
      {
        category: ProcurementCostCategory.SUPPLIER_PURCHASE,
        createdAt: timestamp,
        createdById: null,
        description: null,
        id: "aa2b6b9b-10e9-4e42-b93f-38796de4f65a",
        originalAmount: new Decimal("50000"),
        orderId: order.id,
        updatedAt: timestamp,
        updatedById: null,
      },
    ];

    const automatic = summarizeOrder(order);
    order.freightAllowanceOverrideAmount = new Decimal("4500");
    const productLine = order.costLines[0];
    if (!productLine) throw new Error("Expected a Product purchase cost line.");
    productLine.originalAmount = new Decimal("60000");
    const manual = summarizeOrder(order);

    expect(automatic.componentPricing.productSellReporting).toBe("65000.0000");
    expect(automatic.freightAllowance).toEqual({
      amount: "5000",
      source: "PROJECT_ESTIMATE",
    });
    expect(manual.freightAllowance).toEqual({
      amount: "4500",
      source: "MANUAL",
    });
  });

  it("derives Order profitability from comparable Invoice allocations", () => {
    const order = sellingOrder("18000", VatTreatment.DOMESTIC);
    const summary = summarizeOrder({
      ...order,
      clientBillingAllocations: [
        {
          otherCoverageHt: new Decimal(0),
          freightCoverageHt: new Decimal(0),
          allocatedAmount: new Decimal("30000"),
          basis: "FIXED_AMOUNT",
          billingDocument: {
            credits: [],
            currencyCode: "EUR",
            documentType: "INVOICE",
            workflowStatus: "INVOICED",
            isCancelled: false,
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
        {
          otherCoverageHt: new Decimal(0),
          freightCoverageHt: new Decimal(0),
          allocatedAmount: new Decimal("70000"),
          basis: "FIXED_AMOUNT",
          billingDocument: {
            credits: [],
            currencyCode: "EUR",
            documentType: "INVOICE",
            workflowStatus: "INVOICED",
            isCancelled: false,
            fxRateToReporting: null,
          },
          billingDocumentId: "d22b6b9b-10e9-4e42-b93f-38796de4f65a",
          createdAt: timestamp,
          createdById: null,
          id: "e22b6b9b-10e9-4e42-b93f-38796de4f65a",
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
          otherCoverageHt: new Decimal(0),
          freightCoverageHt: new Decimal(0),
          allocatedAmount: new Decimal("100000"),
          basis: "FIXED_AMOUNT",
          billingDocument: {
            credits: [],
            currencyCode: "USD",
            documentType: "INVOICE",
            workflowStatus: "INVOICED",
            isCancelled: false,
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
      defaultFreightMarkupRate: new Decimal(0),
      defaultOtherCostMarkupRate: new Decimal(0),
      defaultProductMarkupRate: new Decimal(0),
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
      pricingMode: "PROJECT_MARKUP",
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
