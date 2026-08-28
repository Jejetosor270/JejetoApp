import "server-only";

import Decimal from "decimal.js";

import { vatAmount as calculateVatAmount } from "@/domain/finance/calculations";
import {
  FreightTreatment,
  ItemCommercialStatus,
  ItemSourceType,
  InstallmentBasis,
  PaymentDirection,
  PricingMode,
  Prisma,
  ProcurementOrderStatus,
  SupplierQuoteImportAction,
} from "@/generated/prisma/client";
import { supplierPayableBase } from "@/domain/payments/calculations";
import { scheduledAmountFromPercentage } from "@/domain/payments/calculations";
import { dateOnlyToDate } from "@/domain/payments/dates";
import type { QuoteConfirmationInput } from "@/domain/quote-intake/confirmation";
import type { CreateOrderInput } from "@/domain/procurement/validation";
import { createOrderInputSchema } from "@/domain/procurement/validation";
import { QUOTE_EXTRACTION_PROVIDER } from "@/config/quote-extraction";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { getQuoteExtractionModel } from "@/lib/env/quote-extraction";
import {
  createOrderInTransaction,
  getOrderInTransaction,
  type OrderSummary,
  updateOrderInTransaction,
} from "@/lib/procurement/orders";

export class QuoteConfirmationError extends Error {}

function percent(rate: string | null): string | undefined {
  return rate === null ? undefined : new Decimal(rate).times(100).toString();
}

function currentOrderValues(order: OrderSummary): CreateOrderInput {
  const input = createOrderInputSchema.safeParse({
    actualDeliveryDate: order.actualDeliveryDate ?? undefined,
    buildingIds: order.buildingIds,
    category: order.category ?? undefined,
    customsDuties: order.costs.customsDuties ?? undefined,
    description: order.description ?? undefined,
    expectedDeliveryDate: order.expectedDeliveryDate ?? undefined,
    expectedReadyDate: order.expectedReadyDate ?? undefined,
    freight: order.costs.freight ?? undefined,
    freightResaleAmount: order.freightResaleAmount ?? undefined,
    freightTreatment: order.freightTreatment,
    inputVatAmount: order.costs.inputVat?.amountIsManual
      ? order.costs.inputVat.amount
      : undefined,
    inputVatCountryCode: order.costs.inputVat?.countryCode ?? undefined,
    inputVatCustomTreatmentNote:
      order.costs.inputVat?.customTreatmentNote ?? undefined,
    inputVatRate: percent(order.costs.inputVat?.rate ?? null),
    inputVatRecoverability: order.costs.inputVat?.recoverability ?? undefined,
    inputVatTaxableBase: order.costs.inputVat?.taxableBase ?? undefined,
    inputVatTreatment: order.costs.inputVat?.treatment ?? undefined,
    leadTimeWeeks: order.leadTimeWeeks ?? undefined,
    miscellaneous: order.costs.miscellaneous ?? undefined,
    notes: order.notes ?? undefined,
    orderCurrencyCode: order.orderCurrencyCode,
    orderDate: order.orderDate ?? undefined,
    orderNumber: order.orderNumber,
    outputVatAmount: order.costs.outputVat?.amountIsManual
      ? order.costs.outputVat.amount
      : undefined,
    outputVatCountryCode: order.costs.outputVat?.countryCode ?? undefined,
    outputVatCustomTreatmentNote:
      order.costs.outputVat?.customTreatmentNote ?? undefined,
    outputVatRate: percent(order.costs.outputVat?.rate ?? null),
    outputVatTaxableBase: order.costs.outputVat?.taxableBase ?? undefined,
    outputVatTreatment: order.costs.outputVat?.treatment ?? undefined,
    packageName: order.packageName,
    pricingMode: order.pricingMode,
    projectId: order.project.id,
    purchaseCost: order.costs.purchaseCost ?? undefined,
    purchaseFxRate: order.costs.purchaseFxRate ?? undefined,
    quoteDate: order.quoteDate ?? undefined,
    sellingCurrencyCode: order.sellingCurrencyCode,
    sellingFxRate: order.costs.sellingFxRate ?? undefined,
    sellingPriceAmount:
      order.pricingMode === PricingMode.SELLING_PRICE
        ? (order.packageSellingPrice ?? undefined)
        : undefined,
    status: order.status,
    supplierId: order.supplier.id,
    supplierOrderConfirmationReference:
      order.supplierOrderConfirmationReference ?? undefined,
    supplierQuoteReference: order.supplierQuoteReference ?? undefined,
    targetMarginRate: percent(order.targetMarginRate),
  });
  if (!input.success) {
    throw new QuoteConfirmationError(
      "The existing Order could not be prepared safely for a quote update.",
    );
  }
  return input.data;
}

function reviewedOrderValues(
  input: QuoteConfirmationInput,
  projectReportingCurrency: string,
  existing: OrderSummary | null,
): CreateOrderInput {
  const current = existing ? currentOrderValues(existing) : null;
  if (input.action === "CREATE" && (!input.orderNumber || !input.packageName)) {
    throw new QuoteConfirmationError(
      "An internal reference and package title are required.",
    );
  }
  const orderCurrencyCode = input.applyCurrency
    ? input.orderCurrencyCode
    : current?.orderCurrencyCode;
  if (!orderCurrencyCode) {
    throw new QuoteConfirmationError("Confirm the quote currency.");
  }
  if (
    current &&
    input.applyCurrency &&
    orderCurrencyCode !== current.orderCurrencyCode
  ) {
    throw new QuoteConfirmationError(
      "Quote import cannot change an existing Order's purchase currency. Use the full Order editor for that deliberate financial change.",
    );
  }
  const candidate = {
    actualDeliveryDate: current?.actualDeliveryDate,
    buildingIds:
      existing && !input.applyBuildings
        ? existing.buildingIds
        : input.buildingIds,
    category: current?.category,
    customsDuties: current?.customsDuties,
    description: current?.description,
    expectedDeliveryDate: input.applyExpectedDeliveryDate
      ? input.expectedDeliveryDate
      : current?.expectedDeliveryDate,
    expectedReadyDate: input.applyLeadTime
      ? undefined
      : current?.expectedReadyDate,
    freight: input.applyFreight ? input.freight : current?.freight,
    freightResaleAmount: input.applyFreight
      ? input.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
        ? input.freightResaleAmount
        : undefined
      : current?.freightResaleAmount,
    freightTreatment: input.applyFreight
      ? input.freightTreatment
      : (current?.freightTreatment ?? FreightTreatment.NOT_APPLICABLE),
    inputVatAmount: input.applyInputVat
      ? input.inputVatAmount
      : current?.inputVatAmount,
    inputVatCountryCode: input.applyInputVat
      ? input.inputVatCountryCode
      : current?.inputVatCountryCode,
    inputVatCustomTreatmentNote: input.applyInputVat
      ? input.inputVatCustomTreatmentNote
      : current?.inputVatCustomTreatmentNote,
    inputVatRate: input.applyInputVat
      ? input.inputVatRate
        ? new Decimal(input.inputVatRate).times(100).toString()
        : undefined
      : current?.inputVatRate
        ? new Decimal(current.inputVatRate).times(100).toString()
        : undefined,
    inputVatRecoverability: input.applyInputVat
      ? input.inputVatRecoverability
      : current?.inputVatRecoverability,
    inputVatTaxableBase: input.applyInputVat
      ? input.inputVatTaxableBase
      : current?.inputVatTaxableBase,
    inputVatTreatment: input.applyInputVat
      ? input.inputVatTreatment
      : current?.inputVatTreatment,
    leadTimeWeeks: input.applyLeadTime
      ? input.leadTimeWeeks
      : current?.leadTimeWeeks,
    miscellaneous: input.applyMiscellaneous
      ? input.miscellaneous
      : current?.miscellaneous,
    notes: current?.notes,
    orderCurrencyCode,
    orderDate: current?.orderDate,
    orderNumber: current?.orderNumber ?? input.orderNumber,
    outputVatAmount: current?.outputVatAmount,
    outputVatCountryCode: current?.outputVatCountryCode,
    outputVatCustomTreatmentNote: current?.outputVatCustomTreatmentNote,
    outputVatRate: current?.outputVatRate
      ? new Decimal(current.outputVatRate).times(100).toString()
      : undefined,
    outputVatTaxableBase: current?.outputVatTaxableBase,
    outputVatTreatment: current?.outputVatTreatment,
    packageName: current?.packageName ?? input.packageName,
    pricingMode: current?.pricingMode ?? PricingMode.SELLING_PRICE,
    projectId: input.projectId,
    purchaseCost: input.applyPurchaseCost
      ? input.purchaseCost
      : current?.purchaseCost,
    purchaseFxRate: input.applyCurrency
      ? input.purchaseFxRate
      : current?.purchaseFxRate,
    quoteDate: input.applyQuoteDate ? input.quoteDate : current?.quoteDate,
    sellingCurrencyCode:
      current?.sellingCurrencyCode ?? projectReportingCurrency,
    sellingFxRate: current?.sellingFxRate,
    sellingPriceAmount: current?.sellingPriceAmount,
    status: current?.status ?? ProcurementOrderStatus.DRAFT,
    supplierId: input.supplierId,
    supplierOrderConfirmationReference:
      current?.supplierOrderConfirmationReference,
    supplierQuoteReference: input.applyQuoteReference
      ? input.supplierQuoteReference
      : current?.supplierQuoteReference,
    targetMarginRate: current?.targetMarginRate
      ? new Decimal(current.targetMarginRate).times(100).toString()
      : undefined,
  };
  const parsed = createOrderInputSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new QuoteConfirmationError(
      parsed.error.issues[0]?.message ??
        "The reviewed quote values are not valid for an Order.",
    );
  }
  return parsed.data;
}

async function createApprovedSchedule(
  transaction: Prisma.TransactionClient,
  actorId: string,
  orderId: string,
  order: CreateOrderInput,
  reportingCurrencyCode: string,
  input: QuoteConfirmationInput,
): Promise<void> {
  if (!input.approveSchedule) return;
  const calculatedInputVat =
    order.inputVatAmount ??
    (order.inputVatTaxableBase && order.inputVatRate
      ? calculateVatAmount(
          order.inputVatTaxableBase,
          order.inputVatRate,
        ).toFixed(4)
      : undefined);
  const baseAmount = supplierPayableBase({
    inputVatAmount: calculatedInputVat,
    inputVatTreatment: order.inputVatTreatment,
    supplierPurchase: order.purchaseCost ?? "0",
  });
  const latest = await transaction.paymentInstallment.findFirst({
    where: { direction: PaymentDirection.SUPPLIER_PAYMENT, orderId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const firstSequence = (latest?.sequence ?? 0) + 1;
  const rows = input.payments.map((payment, index) => {
    if (!payment.dueDate) {
      throw new QuoteConfirmationError(
        "Every approved installment requires a due date.",
      );
    }
    const scheduledAmount =
      payment.basis === InstallmentBasis.PERCENTAGE
        ? payment.percentageRate
          ? scheduledAmountFromPercentage(baseAmount, payment.percentageRate)
          : null
        : payment.fixedAmount
          ? new Decimal(payment.fixedAmount)
          : null;
    if (!scheduledAmount) {
      throw new QuoteConfirmationError(
        "Every approved installment requires a valid amount or percentage.",
      );
    }
    if (payment.basis === InstallmentBasis.PERCENTAGE && baseAmount.isZero()) {
      throw new QuoteConfirmationError(
        "Percentage installments require a non-zero supplier payable.",
      );
    }
    return {
      basis: payment.basis,
      createdById: actorId,
      currencyCode: order.orderCurrencyCode,
      direction: PaymentDirection.SUPPLIER_PAYMENT,
      dueDate: dateOnlyToDate(payment.dueDate),
      expectedFxRateToReporting:
        order.orderCurrencyCode === reportingCurrencyCode
          ? null
          : (order.purchaseFxRate ?? null),
      label: payment.label,
      notes: payment.timingDescription ?? null,
      orderId,
      percentageRate:
        payment.basis === InstallmentBasis.PERCENTAGE
          ? (payment.percentageRate ?? null)
          : null,
      scheduledAmount: scheduledAmount.toFixed(4),
      sequence: firstSequence + index,
      updatedById: actorId,
    };
  });
  if (rows.length) {
    await transaction.paymentInstallment.createMany({ data: rows });
  }
}

async function persistApprovedItems(
  transaction: Prisma.TransactionClient,
  actorId: string,
  orderId: string,
  order: CreateOrderInput,
  input: QuoteConfirmationInput,
): Promise<void> {
  if (!input.approveItems) return;
  const rows = input.items.filter((item) => item.include);
  const [buildings, rooms, existing] = await Promise.all([
    transaction.building.findMany({
      where: {
        id: {
          in: rows.flatMap((row) => (row.buildingId ? [row.buildingId] : [])),
        },
        projectId: input.projectId,
      },
      select: { id: true },
    }),
    transaction.room.findMany({
      where: {
        id: { in: rows.flatMap((row) => (row.roomId ? [row.roomId] : [])) },
      },
      select: { buildingId: true, id: true },
    }),
    transaction.item.findMany({
      where: {
        id: {
          in: rows.flatMap((row) =>
            row.existingItemId ? [row.existingItemId] : [],
          ),
        },
        projectId: input.projectId,
        supplierId: input.supplierId,
      },
      select: { id: true },
    }),
  ]);
  const buildingIds = new Set(buildings.map((building) => building.id));
  const existingIds = new Set(existing.map((item) => item.id));
  for (const row of rows) {
    if (row.buildingId && !buildingIds.has(row.buildingId))
      throw new QuoteConfirmationError(
        "Every reviewed Item Building must belong to the selected Project.",
      );
    if (
      row.roomId &&
      !rooms.some(
        (room) => room.id === row.roomId && room.buildingId === row.buildingId,
      )
    )
      throw new QuoteConfirmationError(
        "Every reviewed Item Room must belong to its Building.",
      );
    if (
      row.action === "UPDATE" &&
      (!row.existingItemId || !existingIds.has(row.existingItemId))
    )
      throw new QuoteConfirmationError(
        "A matched Item changed or belongs to another Supplier. Reprocess the quote.",
      );
  }
  const importRecord = await transaction.itemImport.create({
    data: {
      createdCount: rows.filter((row) => row.action === "CREATE").length,
      extractionModel: input.itemExtractionModel ?? null,
      extractionProvider: input.itemExtractionProvider ?? null,
      importedById: actorId,
      originalFilename: input.originalFilename,
      procurementOrderId: orderId,
      projectId: input.projectId,
      rowCount: input.items.length,
      skippedCount: input.items.length - rows.length,
      sourceType: ItemSourceType.SUPPLIER_QUOTE_PDF,
      supplierId: input.supplierId,
      updatedCount: rows.filter((row) => row.action === "UPDATE").length,
      warningCount: rows.reduce((sum, row) => sum + row.warnings.length, 0),
    },
  });
  for (const row of rows) {
    const common = {
      ...(row.brand !== null ? { brand: row.brand } : {}),
      ...(row.buildingId !== null ? { buildingId: row.buildingId } : {}),
      ...(row.category !== null ? { category: row.category } : {}),
      ...(row.description !== null ? { description: row.description } : {}),
      ...(row.finishColor !== null ? { finishColor: row.finishColor } : {}),
      ...(row.itemReference !== null
        ? { itemReference: row.itemReference }
        : {}),
      ...(row.notes !== null ? { notes: row.notes } : {}),
      ...(row.quantity !== null ? { quantity: row.quantity } : {}),
      ...(row.roomId !== null ? { roomId: row.roomId } : {}),
      ...(row.supplierSku !== null ? { supplierSku: row.supplierSku } : {}),
      ...(row.totalPriceHt !== null
        ? { totalPurchasePriceHt: row.totalPriceHt }
        : {}),
      ...(row.unitOfMeasure !== null
        ? { unitOfMeasure: row.unitOfMeasure.toUpperCase() }
        : {}),
      ...(row.unitPriceHt !== null
        ? { unitPurchasePriceHt: row.unitPriceHt }
        : {}),
      ...(row.vatRate !== null ? { vatRate: row.vatRate } : {}),
      ...(row.totalPriceHt !== null && row.vatRate !== null
        ? {
            vatAmount: new Decimal(row.totalPriceHt)
              .times(row.vatRate)
              .toFixed(4),
          }
        : {}),
      ...(row.volumeEach !== null ? { volumeEach: row.volumeEach } : {}),
      ...(row.weightEach !== null ? { weightEach: row.weightEach } : {}),
      commercialStatus: ItemCommercialStatus.QUOTED,
      importId: importRecord.id,
      name: row.name,
      procurementOrderId: orderId,
      projectId: input.projectId,
      purchaseCurrencyCode: order.orderCurrencyCode,
      sourceType: ItemSourceType.SUPPLIER_QUOTE_PDF,
      supplierId: input.supplierId,
      updatedById: actorId,
    };
    if (row.action === "UPDATE" && row.existingItemId)
      await transaction.item.update({
        where: { id: row.existingItemId },
        data: common,
      });
    else
      await transaction.item.create({
        data: {
          ...common,
          createdById: actorId,
          pricingMode: PricingMode.SELLING_PRICE,
          quantity: row.quantity ?? "1.0000",
          unitOfMeasure: row.unitOfMeasure?.toUpperCase() ?? "EA",
        },
      });
  }
  await writeAuditEvent(transaction, actorId, {
    action: "IMPORTED",
    entityId: importRecord.id,
    entityReference: input.originalFilename,
    entityType: "ITEM_IMPORT",
    metadata: {
      created: importRecord.createdCount,
      orderId,
      updated: importRecord.updatedCount,
    },
    summary: "Imported employee-approved supplier quote Item lines.",
  });
}

export async function confirmSupplierQuote(
  actorId: string,
  input: QuoteConfirmationInput,
): Promise<string> {
  return getDatabase().$transaction(
    async (transaction) => {
      const [project, supplier] = await Promise.all([
        transaction.project.findUnique({
          where: { id: input.projectId },
          select: { reportingCurrencyCode: true },
        }),
        transaction.supplier.findFirst({
          where: { id: input.supplierId, isActive: true },
          select: { id: true },
        }),
      ]);
      if (!project)
        throw new QuoteConfirmationError("The Project no longer exists.");
      if (!supplier) {
        throw new QuoteConfirmationError("Choose an active existing Supplier.");
      }
      const existing = input.orderId
        ? await getOrderInTransaction(transaction, input.orderId)
        : null;
      if (input.action === "UPDATE") {
        if (!existing) {
          throw new QuoteConfirmationError(
            "The selected Order no longer exists.",
          );
        }
        if (existing.project.id !== input.projectId) {
          throw new QuoteConfirmationError(
            "The selected Order must belong to the locked Project.",
          );
        }
      }
      const values = reviewedOrderValues(
        input,
        project.reportingCurrencyCode,
        existing,
      );
      let orderId: string;
      if (input.action === "UPDATE" && input.orderId) {
        await updateOrderInTransaction(transaction, actorId, {
          ...values,
          id: input.orderId,
        });
        orderId = input.orderId;
      } else {
        orderId = await createOrderInTransaction(transaction, actorId, values);
      }
      await createApprovedSchedule(
        transaction,
        actorId,
        orderId,
        values,
        project.reportingCurrencyCode,
        input,
      );
      await persistApprovedItems(transaction, actorId, orderId, values, input);
      await transaction.supplierQuoteImport.create({
        data: {
          action:
            input.action === "CREATE"
              ? SupplierQuoteImportAction.CREATED_ORDER
              : SupplierQuoteImportAction.UPDATED_ORDER,
          extractionModel: getQuoteExtractionModel(),
          extractionProvider: QUOTE_EXTRACTION_PROVIDER,
          leadTimeRaw: input.leadTimeRaw ?? null,
          orderId,
          originalFilename: input.originalFilename,
          paymentTermsRaw: input.paymentTermsRaw ?? null,
          processedById: actorId,
          projectId: input.projectId,
          quoteDate: values.quoteDate ? dateOnlyToDate(values.quoteDate) : null,
          supplierId: input.supplierId,
          supplierQuoteReference: values.supplierQuoteReference ?? null,
        },
      });
      await writeAuditEvent(transaction, actorId, {
        action: "IMPORTED",
        entityId: orderId,
        entityReference: values.orderNumber,
        entityType: "QUOTE_IMPORT",
        metadata: {
          action: input.action,
          paymentScheduleApproved: input.approveSchedule,
          provider: QUOTE_EXTRACTION_PROVIDER,
        },
        summary:
          input.action === "CREATE"
            ? "Created an Order from an employee-approved quote extraction."
            : "Updated an Order from an employee-approved quote extraction.",
      });
      return orderId;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
