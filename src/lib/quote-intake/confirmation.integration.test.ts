import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FreightTreatment,
  PricingMode,
  ProcurementOrderStatus,
} from "@/generated/prisma/client";
import { parseQuoteConfirmation } from "@/domain/quote-intake/confirmation";
import type { OrderSummary } from "@/lib/procurement/orders";

const transaction = vi.hoisted(() => ({
  building: { findMany: vi.fn() },
  item: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  itemImport: { create: vi.fn() },
  paymentInstallment: { createMany: vi.fn(), findFirst: vi.fn() },
  project: { findUnique: vi.fn() },
  room: { findMany: vi.fn() },
  supplier: { findFirst: vi.fn() },
  supplierQuoteImport: { create: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
}));
const orderMocks = vi.hoisted(() => ({
  createOrderInTransaction: vi.fn(),
  getOrderInTransaction: vi.fn(),
  updateOrderInTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: vi.fn() }));
vi.mock("@/lib/procurement/orders", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/procurement/orders")>();
  return { ...original, ...orderMocks };
});

import { confirmSupplierQuote } from "@/lib/quote-intake/confirmation";

const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const supplierId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";
const orderId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";
const buildingId = "d12b6b9b-10e9-4e42-b93f-38796de4f65a";

function existingOrder(): OrderSummary {
  return {
    actualDeliveryDate: null,
    billing: {
      actualGrossProfit: null,
      actualMarginRate: null,
      actualMarkupRate: null,
      conversionComplete: true,
      invoicedAllocated: "0",
      quotedAllocated: "0",
    },
    buildingIds: [buildingId],
    buildings: ["A"],
    category: null,
    componentPricing: {
      effectiveMarkupRate: null,
      freightMarkupRate: "0.000000",
      freightMarkupSource: "PROJECT_DEFAULT",
      freightSellReporting: null,
      otherMarkupRate: "0.000000",
      otherMarkupSource: "PROJECT_DEFAULT",
      otherSellReporting: null,
      productMarkupRate: "0.000000",
      productMarkupSource: "PROJECT_DEFAULT",
      productSellReporting: null,
      totalSellReporting: null,
    },
    costs: {
      conversionComplete: true,
      customsDuties: null,
      economicLandedCost: "90000",
      freight: "10000",
      grossMarginRate: null,
      grossProfit: null,
      inputVat: null,
      landedCost: "90000",
      markupRate: null,
      miscellaneous: null,
      missingFx: [],
      outputVat: null,
      purchaseCost: "80000",
      purchaseFxRate: null,
      reportingEconomicLandedCost: "90000",
      reportingLandedCost: "90000",
      reportingSellingRevenue: null,
      sellingFxRate: null,
    },
    description: null,
    expectedDeliveryDate: null,
    expectedReadyDate: null,
    freightResaleAmount: null,
    freightAllowance: { amount: null, source: "PROJECT_ESTIMATE" },
    freightAllowanceOverrideAmount: null,
    freightMarkupOverrideRate: null,
    freightTreatment: FreightTreatment.INCLUDED_IN_PACKAGE_PRICE,
    id: orderId,
    leadTimeWeeks: 12,
    notes: "Keep existing notes",
    otherCostMarkupOverrideRate: null,
    outputVatTaxableBaseOverride: null,
    orderCurrencyCode: "EUR",
    orderNumber: "PO-EXISTING",
    orderDate: null,
    packageName: "Existing package",
    packageSellingPrice: null,
    pricingMode: PricingMode.PROJECT_MARKUP,
    productMarkupOverrideRate: null,
    project: {
      defaultFreightMarkupRate: "0.000000",
      defaultOtherCostMarkupRate: "0.000000",
      defaultProductMarkupRate: "0.000000",
      freightEstimateRate: null,
      id: projectId,
      name: "Project",
      reportingCurrencyCode: "EUR",
    },
    quoteDate: "2026-01-10",
    sellingCurrencyCode: "EUR",
    status: ProcurementOrderStatus.DRAFT,
    supplier: {
      defaultCurrencyCode: "EUR",
      defaultLeadTimeWeeks: null,
      displayName: "Supplier",
      id: supplierId,
    },
    supplierOrderConfirmationReference: null,
    supplierQuoteReference: "OLD-QUOTE",
    supplierPayment: {
      nextDueDate: null,
      outstanding: null,
      paid: "0",
      scheduled: "0",
      status: "NOT_SCHEDULED",
      totalPayable: null,
    },
    targetMarginRate: null,
    totalSellingAmountIncludingVat: null,
    totalSellingRevenue: null,
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

function commonForm(action: "CREATE" | "UPDATE"): FormData {
  const form = new FormData();
  form.set("action", action);
  form.set("freightTreatment", "NOT_APPLICABLE");
  form.set("originalFilename", "supplier-quote.pdf");
  form.set("paymentCount", "0");
  form.set("projectId", projectId);
  form.set("supplierId", supplierId);
  return form;
}

function parsed(form: FormData) {
  const result = parseQuoteConfirmation(form);
  if (!result.success) throw new Error(result.error.issues[0]?.message);
  return result.data;
}

describe("reviewed quote confirmation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.project.findUnique.mockResolvedValue({
      reportingCurrencyCode: "EUR",
    });
    transaction.supplier.findFirst.mockResolvedValue({ id: supplierId });
    transaction.paymentInstallment.findFirst.mockResolvedValue(null);
    transaction.building.findMany.mockResolvedValue([]);
    transaction.room.findMany.mockResolvedValue([]);
    transaction.item.findMany.mockResolvedValue([]);
    transaction.itemImport.create.mockResolvedValue({
      createdCount: 0,
      id: "import-1",
      skippedCount: 0,
      updatedCount: 0,
    });
  });

  it("preserves existing financial and Building values when AI fields are not applied", async () => {
    const form = commonForm("UPDATE");
    form.set("orderId", orderId);
    form.set("supplierQuoteReference", "MISSING-AI-SHOULD-NOT-APPLY");
    orderMocks.getOrderInTransaction.mockResolvedValue(existingOrder());

    await confirmSupplierQuote("actor-1", parsed(form));

    expect(orderMocks.updateOrderInTransaction).toHaveBeenCalledWith(
      transaction,
      "actor-1",
      expect.objectContaining({
        buildingIds: [buildingId],
        freight: "10000.0000",
        id: orderId,
        purchaseCost: "80000.0000",
        supplierQuoteReference: "OLD-QUOTE",
      }),
    );
    expect(transaction.supplierQuoteImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATED_ORDER",
        orderId,
        originalFilename: "supplier-quote.pdf",
      }),
    });
    expect(transaction.paymentInstallment.createMany).not.toHaveBeenCalled();
  });

  it("updates only the fields explicitly confirmed by the employee", async () => {
    const form = commonForm("UPDATE");
    form.set("orderId", orderId);
    form.set("applyPurchaseCost", "on");
    form.set("purchaseCost", "85000");
    form.set("applyQuoteReference", "on");
    form.set("supplierQuoteReference", "REVISED-QUOTE");
    form.set("applyQuoteDate", "on");
    form.set("quoteDate", "20/08/2026");
    form.set("applyLeadTime", "on");
    form.set("leadTimeWeeks", "9");
    orderMocks.getOrderInTransaction.mockResolvedValue(existingOrder());

    await confirmSupplierQuote("actor-1", parsed(form));

    expect(orderMocks.updateOrderInTransaction).toHaveBeenCalledWith(
      transaction,
      "actor-1",
      expect.objectContaining({
        freight: "10000.0000",
        leadTimeWeeks: 9,
        purchaseCost: "85000.0000",
        quoteDate: "2026-08-20",
        supplierQuoteReference: "REVISED-QUOTE",
      }),
    );
  });

  it("creates the Order, approved supplier schedule, and import history atomically", async () => {
    const form = commonForm("CREATE");
    form.set("applyBuildings", "on");
    form.append("buildingIds", buildingId);
    form.set("applyCurrency", "on");
    form.set("orderCurrencyCode", "EUR");
    form.set("applyPurchaseCost", "on");
    form.set("purchaseCost", "100000");
    form.set("applyFreight", "on");
    form.set("freight", "5000");
    form.set("freightTreatment", "INCLUDED_IN_PACKAGE_PRICE");
    form.set("applyMiscellaneous", "on");
    form.set("miscellaneous", "250");
    form.set("applyLeadTime", "on");
    form.set("leadTimeWeeks", "9");
    form.set("applyExpectedDeliveryDate", "on");
    form.set("expectedDeliveryDate", "15/12/2026");
    form.set("applyQuoteReference", "on");
    form.set("supplierQuoteReference", "Q-NEW");
    form.set("applyQuoteDate", "on");
    form.set("quoteDate", "25/08/2026");
    form.set("applyInputVat", "on");
    form.set("inputVatAmount", "20000");
    form.set("inputVatRate", "20");
    form.set("inputVatRecoverability", "RECOVERABLE");
    form.set("inputVatTaxableBase", "100000");
    form.set("inputVatTreatment", "DOMESTIC");
    form.set("orderNumber", "PO-QUOTE-NEW");
    form.set("approveSchedule", "on");
    form.set("paymentCount", "1");
    form.set("payment.0.basis", "PERCENTAGE");
    form.set("payment.0.dueDate", "30/09/2026");
    form.set("payment.0.label", "Deposit");
    form.set("payment.0.percentageRate", "30");
    orderMocks.getOrderInTransaction.mockResolvedValue(null);
    orderMocks.createOrderInTransaction.mockResolvedValue(orderId);

    const createdId = await confirmSupplierQuote("actor-1", parsed(form));

    expect(createdId).toBe(orderId);
    expect(orderMocks.createOrderInTransaction).toHaveBeenCalledWith(
      transaction,
      "actor-1",
      expect.objectContaining({
        buildingIds: [buildingId],
        expectedDeliveryDate: "2026-12-15",
        freight: "5000.0000",
        inputVatRate: "0.200000",
        leadTimeWeeks: 9,
        miscellaneous: "250.0000",
        orderCurrencyCode: "EUR",
        packageName: "PO-QUOTE-NEW",
        projectId,
        purchaseCost: "100000.0000",
        quoteDate: "2026-08-25",
        supplierQuoteReference: "Q-NEW",
      }),
    );
    expect(transaction.paymentInstallment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          currencyCode: "EUR",
          direction: "SUPPLIER_PAYMENT",
          percentageRate: "0.300000",
          scheduledAmount: "36000.0000",
        }),
      ],
    });
    expect(transaction.supplierQuoteImport.create).toHaveBeenCalledTimes(1);
    expect(database.$transaction).toHaveBeenCalledTimes(1);
  });

  it("persists an explicitly approved fixed-amount installment without recalculation", async () => {
    const form = commonForm("CREATE");
    form.set("applyCurrency", "on");
    form.set("orderCurrencyCode", "EUR");
    form.set("applyPurchaseCost", "on");
    form.set("purchaseCost", "100000");
    form.set("orderNumber", "PO-FIXED-PAYMENT");
    form.set("packageName", "Fixed schedule package");
    form.set("approveSchedule", "on");
    form.set("paymentCount", "1");
    form.set("payment.0.basis", "FIXED_AMOUNT");
    form.set("payment.0.dueDate", "2026-10-15");
    form.set("payment.0.fixedAmount", "25000.50");
    form.set("payment.0.label", "Fixed deposit");
    orderMocks.createOrderInTransaction.mockResolvedValue(orderId);

    await confirmSupplierQuote("actor-1", parsed(form));

    expect(transaction.paymentInstallment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          basis: "FIXED_AMOUNT",
          percentageRate: null,
          scheduledAmount: "25000.5000",
        }),
      ],
    });
  });

  it("creates and explicitly updates reviewed quote Items without deleting missing lines", async () => {
    const form = commonForm("CREATE");
    form.set("applyCurrency", "on");
    form.set("orderCurrencyCode", "EUR");
    form.set("orderNumber", "PO-ITEMS");
    form.set("packageName", "Items package");
    form.set("approveItems", "on");
    form.set("itemExtractionModel", "mock-item-model");
    form.set("itemExtractionProvider", "mock");
    const existingItemId = "e12b6b9b-10e9-4e42-b93f-38796de4f65a";
    form.set(
      "quoteItems",
      JSON.stringify([
        {
          action: "UPDATE",
          brand: null,
          buildingId: null,
          category: "Furniture",
          description: null,
          existingItemId,
          finishColor: "Dark Oak",
          include: true,
          itemReference: "I-1",
          name: "Employee-edited Chair",
          notes: "Corrected during onboarding",
          quantity: "3",
          roomId: null,
          supplierSku: "SKU-1",
          totalPriceHt: "2430",
          unitOfMeasure: "EA",
          unitPriceHt: "810",
          vatRate: "0.055",
          volumeEach: null,
          warnings: [],
          weightEach: null,
        },
        {
          action: "CREATE",
          brand: null,
          buildingId: null,
          category: "Lighting",
          description: null,
          existingItemId: null,
          finishColor: null,
          include: true,
          itemReference: "I-2",
          name: "Lamp",
          notes: null,
          quantity: "1",
          roomId: null,
          supplierSku: null,
          totalPriceHt: "500",
          unitOfMeasure: "EA",
          unitPriceHt: "500",
          vatRate: null,
          volumeEach: null,
          warnings: [],
          weightEach: null,
        },
      ]),
    );
    orderMocks.createOrderInTransaction.mockResolvedValue(orderId);
    transaction.item.findMany.mockResolvedValue([{ id: existingItemId }]);
    transaction.itemImport.create.mockResolvedValue({
      createdCount: 1,
      id: "import-1",
      skippedCount: 0,
      updatedCount: 1,
    });
    await confirmSupplierQuote("actor-1", parsed(form));
    expect(transaction.item.update).toHaveBeenCalledWith({
      where: { id: existingItemId },
      data: expect.objectContaining({
        finishColor: "Dark Oak",
        category: "Furniture",
        name: "Employee-edited Chair",
        notes: "Corrected during onboarding",
        procurementOrderId: orderId,
        quantity: "3",
        totalPurchasePriceHt: "2430",
        unitPurchasePriceHt: "810",
        vatAmount: "133.6500",
        vatRate: "0.055",
      }),
    });
    expect(transaction.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Lamp",
        category: "Lighting",
        procurementOrderId: orderId,
        sourceType: "SUPPLIER_QUOTE_PDF",
      }),
    });
    expect(transaction.itemImport.create).toHaveBeenCalledTimes(1);
    expect("deleteMany" in transaction.item).toBe(false);
  });
});
