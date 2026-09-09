import "server-only";
import Decimal from "decimal.js";
import { PricingMode } from "@/generated/prisma/client";
import {
  createOrderInputSchema,
  type CreateOrderInput,
} from "@/domain/procurement/validation";
import type { OrderSummary } from "./orders";

function percent(rate: string | null): string | undefined {
  return rate === null ? undefined : new Decimal(rate).times(100).toString();
}

export function currentOrderValues(
  order: OrderSummary,
  changes: Record<string, unknown> = {},
): CreateOrderInput {
  const input = createOrderInputSchema.safeParse({
    actualDeliveryDate: order.actualDeliveryDate ?? undefined,
    buildingIds: order.buildingIds,
    category: order.category ?? undefined,
    customsDuties: order.costs.customsDuties ?? undefined,
    description: order.description ?? undefined,
    expectedDeliveryDate: order.expectedDeliveryDate ?? undefined,
    expectedReadyDate: order.expectedReadyDate ?? undefined,
    freight: order.costs.freight ?? undefined,
    freightMarkupOverrideRate: percent(order.freightMarkupOverrideRate),
    freightResaleAmount:
      order.pricingMode === PricingMode.DIRECT_SELLING_PRICE
        ? (order.freightResaleAmount ?? undefined)
        : undefined,
    freightTreatment: order.freightTreatment,
    inputVatAmount: order.costs.inputVat?.amountIsManual
      ? order.costs.inputVat.amount
      : undefined,
    inputVatCountryCode: order.costs.inputVat?.countryCode ?? undefined,
    inputVatCustomTreatmentNote:
      order.costs.inputVat?.customTreatmentNote ?? undefined,
    inputVatRate: percent(order.costs.inputVat?.rate ?? null),
    inputVatRecoverableRate: percent(
      order.costs.inputVat?.recoverableRate ?? null,
    ),
    inputVatRecoverability: order.costs.inputVat?.recoverability ?? undefined,
    inputVatTaxableBase: order.costs.inputVat?.taxableBase ?? undefined,
    inputVatTreatment: order.costs.inputVat?.treatment ?? undefined,
    leadTimeWeeks: order.leadTimeWeeks ?? undefined,
    miscellaneous: order.costs.miscellaneous ?? undefined,
    otherCostMarkupOverrideRate: percent(order.otherCostMarkupOverrideRate),
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
    outputVatTaxableBaseOverride:
      order.outputVatTaxableBaseOverride ?? undefined,
    outputVatTreatment: order.costs.outputVat?.treatment ?? undefined,
    packageName: order.packageName,
    pricingMode: order.pricingMode,
    projectId: order.project.id,
    purchaseCost: order.costs.purchaseCost ?? undefined,
    productMarkupOverrideRate: percent(order.productMarkupOverrideRate),
    purchaseFxRate: order.costs.purchaseFxRate ?? undefined,
    quoteDate: order.quoteDate ?? undefined,
    sellingCurrencyCode: order.sellingCurrencyCode,
    sellingFxRate: order.costs.sellingFxRate ?? undefined,
    sellingPriceAmount:
      order.pricingMode === PricingMode.DIRECT_SELLING_PRICE
        ? (order.packageSellingPrice ?? undefined)
        : undefined,
    status: order.status,
    supplierId: order.supplier.id,
    supplierOrderConfirmationReference:
      order.supplierOrderConfirmationReference ?? undefined,
    supplierQuoteReference: order.supplierQuoteReference ?? undefined,
    targetMarginRate: undefined,
    carrierCode: order.carrierCode,
    carrierOtherName: order.carrierOtherName,
    trackingReference: order.trackingReference,
    budgetPurchaseAmountHt: order.budgetPurchaseAmountHt,
    packageId: order.packageId,
    invoiceDate: order.invoiceDate,
    ...changes,
  });
  if (!input.success) {
    throw new Error(
      "Open the full Order editor to review its financial fields before changing this value.",
    );
  }
  return {
    ...input.data,
    freightAllowanceOverrideAmount:
      order.freightAllowanceOverrideAmount ?? undefined,
  };
}
