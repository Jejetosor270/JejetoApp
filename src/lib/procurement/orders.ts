import "server-only";

import Decimal from "decimal.js";

import {
  FreightTreatment,
  PricingMode,
  Prisma,
  ProcurementCostCategory,
  ProcurementOrderStatus,
  VatDirection,
  VatRecoverability,
  VatTreatment,
  PaymentDirection,
} from "@/generated/prisma/client";
import {
  amountIncludingVat,
  crossCurrencyFinancialMetrics,
  economicLandedCost,
  landedCost,
  reportingAmount,
  sellingPriceFromTargetMargin,
  totalSellingRevenue,
  vatAmount as calculateVatAmount,
} from "@/domain/finance/calculations";
import {
  calculateComponentMarkup,
  resolveMarkup,
} from "@/domain/finance/component-markup";
import {
  calculateOrderPricingDraft,
  effectiveVatBase,
  orderPricingMethods,
} from "@/domain/finance/order-pricing";
import type {
  CreateOrderInput,
  InlineOrderInput,
  UpdateOrderInput,
} from "@/domain/procurement/validation";
import {
  addWeeksToDateOnly,
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from "@/domain/payments/dates";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { paginationSkip, type PageInput } from "@/domain/listing/validation";
import { supplierPayableBase } from "@/domain/payments/calculations";
import {
  inputVatRecoverabilityApplies,
  recoverabilityFromRate,
  resolveRecoverableRate,
  vatEconomicCostContribution,
} from "@/domain/vat/recoverability";

import { ProcurementNotFoundError, ProcurementRelationError } from "./errors";

const orderInclude = {
  buildings: {
    include: {
      building: { select: { id: true, name: true, shortCode: true } },
    },
  },
  costLines: true,
  project: {
    select: {
      defaultFreightMarkupRate: true,
      defaultOtherCostMarkupRate: true,
      defaultProductMarkupRate: true,
      freightEstimateRate: true,
      id: true,
      name: true,
      reportingCurrencyCode: true,
    },
  },
  supplier: {
    select: {
      defaultCurrencyCode: true,
      defaultLeadTimeWeeks: true,
      displayName: true,
      id: true,
    },
  },
  vatEntries: true,
  paymentInstallments: {
    where: { direction: PaymentDirection.SUPPLIER_PAYMENT },
    include: { settlements: true },
    orderBy: { dueDate: "asc" },
  },
  clientBillingAllocations: {
    where: { billingDocument: { isCancelled: false } },
    include: {
      billingDocument: {
        select: {
          currencyCode: true,
          documentType: true,
          fxRateToReporting: true,
        },
      },
    },
  },
} satisfies Prisma.ProcurementOrderInclude;
type OrderRecord = Prisma.ProcurementOrderGetPayload<{
  include: typeof orderInclude;
}>;
type OrderRelationClient = Pick<
  Prisma.TransactionClient,
  "building" | "currency" | "project" | "supplier"
>;

export interface VatSummary {
  amount: string;
  amountIsManual: boolean;
  countryCode: string | null;
  customTreatmentNote: string | null;
  rate: string | null;
  recoverability: VatRecoverability | null;
  recoverableRate: string | null;
  reportingAmount: string | null;
  taxableBase: string;
  taxableBaseIsManual: boolean;
  treatment: VatTreatment;
}
export interface OrderCostSummary {
  conversionComplete: boolean;
  customsDuties: string | null;
  economicLandedCost: string | null;
  freight: string | null;
  grossMarginRate: string | null;
  grossProfit: string | null;
  inputVat: VatSummary | null;
  landedCost: string | null;
  markupRate: string | null;
  miscellaneous: string | null;
  missingFx: string[];
  outputVat: VatSummary | null;
  purchaseCost: string | null;
  purchaseFxRate: string | null;
  reportingEconomicLandedCost: string | null;
  reportingLandedCost: string | null;
  reportingSellingRevenue: string | null;
  sellingFxRate: string | null;
}
export interface OrderSummary {
  billing: {
    actualGrossProfit: string | null;
    actualMarginRate: string | null;
    actualMarkupRate: string | null;
    conversionComplete: boolean;
    invoicedAllocated: string | null;
    quotedAllocated: string | null;
  };
  actualDeliveryDate: string | null;
  buildingIds: string[];
  buildings: string[];
  category: string | null;
  componentPricing: {
    effectiveMarkupRate: string | null;
    freightMarkupRate: string;
    freightMarkupSource: "ORDER_OVERRIDE" | "PROJECT_DEFAULT";
    freightSellReporting: string | null;
    otherMarkupRate: string;
    otherMarkupSource: "ORDER_OVERRIDE" | "PROJECT_DEFAULT";
    otherSellReporting: string | null;
    productMarkupRate: string;
    productMarkupSource: "ORDER_OVERRIDE" | "PROJECT_DEFAULT";
    productSellReporting: string | null;
    totalSellReporting: string | null;
  };
  costs: OrderCostSummary;
  description: string | null;
  expectedDeliveryDate: string | null;
  expectedReadyDate: string | null;
  freightResaleAmount: string | null;
  freightAllowance: {
    amount: string | null;
    source: "MANUAL" | "PROJECT_ESTIMATE";
  };
  freightAllowanceOverrideAmount: string | null;
  freightTreatment: FreightTreatment;
  freightMarkupOverrideRate: string | null;
  id: string;
  leadTimeWeeks: number | null;
  notes: string | null;
  otherCostMarkupOverrideRate: string | null;
  outputVatTaxableBaseOverride: string | null;
  orderCurrencyCode: string;
  orderNumber: string;
  orderDate: string | null;
  packageName: string;
  packageSellingPrice: string | null;
  pricingMode: PricingMode;
  productMarkupOverrideRate: string | null;
  project: {
    defaultFreightMarkupRate: string;
    defaultOtherCostMarkupRate: string;
    defaultProductMarkupRate: string;
    freightEstimateRate: string | null;
    id: string;
    name: string;
    reportingCurrencyCode: string;
  };
  quoteDate: string | null;
  sellingCurrencyCode: string;
  status: ProcurementOrderStatus;
  supplier: {
    defaultCurrencyCode: string;
    defaultLeadTimeWeeks: number | null;
    displayName: string;
    id: string;
  };
  supplierOrderConfirmationReference: string | null;
  supplierQuoteReference: string | null;
  supplierPayment: {
    nextDueDate: string | null;
    outstanding: string | null;
    paid: string;
    scheduled: string;
    status:
      "NOT_SCHEDULED" | "SCHEDULED" | "OVERDUE" | "PARTIALLY_PAID" | "PAID";
    totalPayable: string | null;
  };
  targetMarginRate: string | null;
  totalSellingAmountIncludingVat: string | null;
  totalSellingRevenue: string | null;
  updatedAt: string;
}
export interface ProjectProcurementSummary {
  convertedOrderCount: number;
  incompleteOrderCount: number;
  totalEconomicCost: string;
  totalGrossProfit: string;
  totalSellingRevenue: string;
}

function costAmount(
  order: OrderRecord,
  category: ProcurementCostCategory,
): string | null {
  return (
    order.costLines
      .find((line) => line.category === category)
      ?.originalAmount.toString() ?? null
  );
}
function vatEntry(order: OrderRecord, direction: VatDirection) {
  return order.vatEntries.find((entry) => entry.direction === direction);
}
function fxRate(
  original: string,
  reporting: string,
  rate: Decimal | null,
): string | undefined {
  return original === reporting ? undefined : (rate?.toString() ?? undefined);
}
function vatSummary(
  entry: OrderRecord["vatEntries"][number] | undefined,
  currency: string,
  reportingCurrency: string,
  rate: Decimal | null,
  taxableBaseIsManual = false,
  effectiveTaxableBase?: Decimal | null,
  effectiveVatAmount?: Decimal | null,
): VatSummary | null {
  if (!entry) return null;
  const reporting = reportingAmount({
    fxRateToReporting: fxRate(currency, reportingCurrency, rate),
    originalAmount: (effectiveVatAmount ?? entry.vatAmount).toString(),
    originalCurrencyCode: currency,
    reportingCurrencyCode: reportingCurrency,
  });
  return {
    amount: (effectiveVatAmount ?? entry.vatAmount).toString(),
    amountIsManual: entry.isAmountOverride,
    countryCode: entry.countryCode,
    customTreatmentNote: entry.customTreatmentNote,
    rate: entry.vatRate?.toString() ?? null,
    recoverability: entry.recoverability,
    recoverableRate: entry.recoverableRate?.toString() ?? null,
    reportingAmount: reporting?.toString() ?? null,
    taxableBase: (effectiveTaxableBase ?? entry.taxableBaseAmount).toString(),
    taxableBaseIsManual,
    treatment: entry.treatment,
  };
}
function currentLandedCost(order: OrderRecord): Decimal | null {
  if (order.costLines.length === 0) return null;
  return landedCost({
    customsDuties:
      costAmount(order, ProcurementCostCategory.CUSTOMS_DUTIES) ?? "0",
    freight: costAmount(order, ProcurementCostCategory.FREIGHT) ?? "0",
    miscellaneous:
      costAmount(order, ProcurementCostCategory.MISCELLANEOUS) ?? "0",
    supplierPurchase:
      costAmount(order, ProcurementCostCategory.SUPPLIER_PURCHASE) ?? "0",
  });
}
function targetPackagePrice(
  order: OrderRecord,
  economicCost: Decimal | null,
): Decimal | null {
  if (!economicCost || !order.targetMarginRate) return null;
  const sellingRate = reportingAmount({
    fxRateToReporting: fxRate(
      order.sellingCurrencyCode,
      order.project.reportingCurrencyCode,
      order.sellingFxRateToReporting,
    ),
    originalAmount: "1",
    originalCurrencyCode: order.sellingCurrencyCode,
    reportingCurrencyCode: order.project.reportingCurrencyCode,
  });
  if (!sellingRate) return null;
  const requiredOriginal = sellingPriceFromTargetMargin(
    economicCost,
    order.targetMarginRate.toString(),
  ).dividedBy(sellingRate);
  const freight =
    order.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
      ? new Decimal(order.freightResaleAmount?.toString() ?? "0")
      : new Decimal(0);
  const price = requiredOriginal.minus(freight);
  return price.isNegative() ? null : price;
}

function componentPricing(order: OrderRecord) {
  const projectPricing = order.pricingMode === PricingMode.PROJECT_MARKUP;
  const orderPricing = order.pricingMode === PricingMode.ORDER_MARKUP;
  const productMarkup = resolveMarkup(
    order.project.defaultProductMarkupRate.toString(),
    projectPricing ? null : order.productMarkupOverrideRate?.toString(),
  );
  const freightMarkup = resolveMarkup(
    order.project.defaultFreightMarkupRate.toString(),
    projectPricing ? null : order.freightMarkupOverrideRate?.toString(),
  );
  const otherMarkup = resolveMarkup(
    order.project.defaultOtherCostMarkupRate.toString(),
    projectPricing ? null : order.otherCostMarkupOverrideRate?.toString(),
  );
  const convertCost = (amount: string | null) =>
    reportingAmount({
      fxRateToReporting: fxRate(
        order.orderCurrencyCode,
        order.project.reportingCurrencyCode,
        order.purchaseFxRateToReporting,
      ),
      originalAmount: amount ?? "0",
      originalCurrencyCode: order.orderCurrencyCode,
      reportingCurrencyCode: order.project.reportingCurrencyCode,
    });
  const product = convertCost(
    costAmount(order, ProcurementCostCategory.SUPPLIER_PURCHASE),
  );
  const freight = convertCost(
    costAmount(order, ProcurementCostCategory.FREIGHT),
  );
  const customs = convertCost(
    costAmount(order, ProcurementCostCategory.CUSTOMS_DUTIES),
  );
  const miscellaneous = convertCost(
    costAmount(order, ProcurementCostCategory.MISCELLANEOUS),
  );
  const calculated =
    (projectPricing ||
      orderPricing ||
      order.pricingMode === PricingMode.COMPONENT_MARKUP) &&
    product &&
    freight &&
    customs &&
    miscellaneous
      ? calculateComponentMarkup({
          freightCost: freight.toString(),
          freightMarkupRate: freightMarkup.rate,
          otherCost: customs.plus(miscellaneous).toString(),
          otherMarkupRate: otherMarkup.rate,
          productCost: product.toString(),
          productMarkupRate: productMarkup.rate,
        })
      : null;
  const sellingUnit = reportingAmount({
    fxRateToReporting: fxRate(
      order.sellingCurrencyCode,
      order.project.reportingCurrencyCode,
      order.sellingFxRateToReporting,
    ),
    originalAmount: "1",
    originalCurrencyCode: order.sellingCurrencyCode,
    reportingCurrencyCode: order.project.reportingCurrencyCode,
  });
  const originalSelling = (reportingValue: string | null) =>
    reportingValue !== null && sellingUnit
      ? new Decimal(reportingValue).dividedBy(sellingUnit)
      : null;
  return {
    calculated,
    freightMarkup,
    freightSellOriginal: originalSelling(calculated?.freightSell ?? null),
    otherMarkup,
    productMarkup,
    productPurchaseCostSelling:
      order.orderCurrencyCode === order.sellingCurrencyCode
        ? new Decimal(
            costAmount(order, ProcurementCostCategory.SUPPLIER_PURCHASE) ?? "0",
          )
        : originalSelling(product?.toString() ?? null),
    totalSellOriginal: originalSelling(calculated?.totalSell ?? null),
  };
}

export function summarizeOrder(order: OrderRecord): OrderSummary {
  const landed = currentLandedCost(order);
  const input = vatEntry(order, VatDirection.INPUT);
  const output = vatEntry(order, VatDirection.OUTPUT);
  const nonRecoverableInputVat = input
    ? vatEconomicCostContribution({
        recoverability: input.recoverability,
        recoverableRate: input.recoverableRate,
        vatAmount: input.vatAmount,
      })
    : new Decimal(0);
  const economic = landed
    ? economicLandedCost(landed, nonRecoverableInputVat)
    : null;
  const reportingLanded = landed
    ? reportingAmount({
        fxRateToReporting: fxRate(
          order.orderCurrencyCode,
          order.project.reportingCurrencyCode,
          order.purchaseFxRateToReporting,
        ),
        originalAmount: landed,
        originalCurrencyCode: order.orderCurrencyCode,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
      })
    : null;
  const reportingEconomic = economic
    ? reportingAmount({
        fxRateToReporting: fxRate(
          order.orderCurrencyCode,
          order.project.reportingCurrencyCode,
          order.purchaseFxRateToReporting,
        ),
        originalAmount: economic,
        originalCurrencyCode: order.orderCurrencyCode,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
      })
    : null;
  const component = componentPricing(order);
  const packagePrice =
    order.pricingMode === PricingMode.SELLING_PRICE ||
    order.pricingMode === PricingMode.DIRECT_SELLING_PRICE
      ? order.sellingPriceAmount
        ? new Decimal(order.sellingPriceAmount.toString())
        : order.targetMarginRate
          ? targetPackagePrice(order, reportingEconomic)
          : null
      : order.pricingMode === PricingMode.TARGET_MARGIN
        ? targetPackagePrice(order, reportingEconomic)
        : component.totalSellOriginal
          ? order.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
            ? component.totalSellOriginal.minus(
                component.freightSellOriginal ?? 0,
              )
            : component.totalSellOriginal
          : null;
  const totalRevenue =
    order.pricingMode === PricingMode.COMPONENT_MARKUP ||
    order.pricingMode === PricingMode.PROJECT_MARKUP ||
    order.pricingMode === PricingMode.ORDER_MARKUP
      ? component.totalSellOriginal
      : packagePrice
        ? totalSellingRevenue(
            packagePrice,
            order.freightTreatment,
            order.freightResaleAmount?.toString() ?? "0",
          )
        : null;
  const automaticFreightAllowance =
    component.productPurchaseCostSelling && order.project.freightEstimateRate
      ? component.productPurchaseCostSelling.times(
          order.project.freightEstimateRate,
        )
      : null;
  const freightAllowance =
    order.freightAllowanceOverrideAmount ?? automaticFreightAllowance;
  const effectiveOutputBase = output
    ? (order.outputVatTaxableBaseOverride ?? totalRevenue)
    : null;
  const effectiveOutputVat =
    output && effectiveOutputBase
      ? output.isAmountOverride
        ? output.vatAmount
        : calculateVatAmount(
            effectiveOutputBase,
            output.vatRate?.toString() ?? "0",
          )
      : null;
  const totalSellingAmountIncludingVat = totalRevenue
    ? amountIncludingVat(totalRevenue, effectiveOutputVat?.toString() ?? "0")
    : null;
  const reportingRevenue = totalRevenue
    ? reportingAmount({
        fxRateToReporting: fxRate(
          order.sellingCurrencyCode,
          order.project.reportingCurrencyCode,
          order.sellingFxRateToReporting,
        ),
        originalAmount: totalRevenue,
        originalCurrencyCode: order.sellingCurrencyCode,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
      })
    : null;
  const metrics =
    economic && totalRevenue
      ? crossCurrencyFinancialMetrics({
          economicLandedCost: economic,
          purchaseCurrencyCode: order.orderCurrencyCode,
          purchaseFxRateToReporting: fxRate(
            order.orderCurrencyCode,
            order.project.reportingCurrencyCode,
            order.purchaseFxRateToReporting,
          ),
          reportingCurrencyCode: order.project.reportingCurrencyCode,
          sellingCurrencyCode: order.sellingCurrencyCode,
          sellingFxRateToReporting: fxRate(
            order.sellingCurrencyCode,
            order.project.reportingCurrencyCode,
            order.sellingFxRateToReporting,
          ),
          sellingRevenue: totalRevenue,
        })
      : null;
  const missingFx: string[] = [];
  if (landed && reportingLanded === null) missingFx.push("purchase FX");
  if (totalRevenue && reportingRevenue === null) missingFx.push("selling FX");
  let quotedAllocated = new Decimal(0);
  let invoicedAllocated = new Decimal(0);
  let billingConversionComplete = true;
  for (const allocation of order.clientBillingAllocations) {
    const document = allocation.billingDocument;
    const convertedAllocation = reportingAmount({
      fxRateToReporting: document.fxRateToReporting?.toString() ?? undefined,
      originalAmount: allocation.allocatedAmount.toString(),
      originalCurrencyCode: document.currencyCode,
      reportingCurrencyCode: order.project.reportingCurrencyCode,
    });
    if (convertedAllocation === null) {
      billingConversionComplete = false;
      continue;
    }
    if (document.documentType === "INVOICE")
      invoicedAllocated = invoicedAllocated.plus(convertedAllocation);
    else quotedAllocated = quotedAllocated.plus(convertedAllocation);
  }
  const actualMetrics =
    billingConversionComplete &&
    reportingEconomic &&
    invoicedAllocated.greaterThan(0)
      ? {
          grossProfit: invoicedAllocated.minus(reportingEconomic),
          marginRate: invoicedAllocated
            .minus(reportingEconomic)
            .dividedBy(invoicedAllocated),
          markupRate: reportingEconomic.isZero()
            ? null
            : invoicedAllocated
                .minus(reportingEconomic)
                .dividedBy(reportingEconomic),
        }
      : null;
  const supplierPurchase = costAmount(
    order,
    ProcurementCostCategory.SUPPLIER_PURCHASE,
  );
  const supplierPayable = supplierPurchase
    ? supplierPayableBase({
        inputVatAmount: input?.vatAmount.toString() ?? null,
        inputVatTreatment: input?.treatment ?? null,
        supplierPurchase,
      })
    : null;
  const scheduledSupplier = order.paymentInstallments
    .filter((item) => !item.isCancelled)
    .reduce(
      (sum, installment) => sum.plus(installment.scheduledAmount),
      new Decimal(0),
    );
  const paidSupplier = order.paymentInstallments.reduce(
    (sum, installment) =>
      installment.settlements.reduce(
        (installmentSum, settlement) => installmentSum.plus(settlement.amount),
        sum,
      ),
    new Decimal(0),
  );
  const outstandingSupplier = supplierPayable
    ? Decimal.max(supplierPayable.minus(paidSupplier), 0)
    : null;
  const nextSupplierDue = order.paymentInstallments.find(
    (installment) =>
      !installment.isCancelled &&
      installment.settlements
        .reduce(
          (sum, settlement) => sum.plus(settlement.amount),
          new Decimal(0),
        )
        .lessThan(installment.scheduledAmount),
  );
  const today = businessToday();
  const supplierPaymentStatus =
    supplierPayable && paidSupplier.greaterThanOrEqualTo(supplierPayable)
      ? "PAID"
      : paidSupplier.greaterThan(0)
        ? "PARTIALLY_PAID"
        : nextSupplierDue && dateToDateOnly(nextSupplierDue.dueDate) < today
          ? "OVERDUE"
          : order.paymentInstallments.length
            ? "SCHEDULED"
            : "NOT_SCHEDULED";
  return {
    billing: {
      actualGrossProfit: actualMetrics?.grossProfit.toString() ?? null,
      actualMarginRate: actualMetrics?.marginRate.toString() ?? null,
      actualMarkupRate: actualMetrics?.markupRate?.toString() ?? null,
      conversionComplete: billingConversionComplete,
      invoicedAllocated: billingConversionComplete
        ? invoicedAllocated.toString()
        : null,
      quotedAllocated: billingConversionComplete
        ? quotedAllocated.toString()
        : null,
    },
    actualDeliveryDate: order.actualDeliveryDate
      ? dateToDateOnly(order.actualDeliveryDate)
      : null,
    buildingIds: order.buildings.map(({ buildingId }) => buildingId),
    buildings: order.buildings.map(
      ({ building }) => building.shortCode || building.name,
    ),
    category: order.category,
    componentPricing: {
      effectiveMarkupRate: component.calculated?.effectiveMarkupRate ?? null,
      freightMarkupRate: component.freightMarkup.rate,
      freightMarkupSource: component.freightMarkup.source,
      freightSellReporting: component.calculated?.freightSell ?? null,
      otherMarkupRate: component.otherMarkup.rate,
      otherMarkupSource: component.otherMarkup.source,
      otherSellReporting: component.calculated?.otherSell ?? null,
      productMarkupRate: component.productMarkup.rate,
      productMarkupSource: component.productMarkup.source,
      productSellReporting: component.calculated?.productSell ?? null,
      totalSellReporting: component.calculated?.totalSell ?? null,
    },
    description: order.description,
    expectedDeliveryDate: order.expectedDeliveryDate
      ? dateToDateOnly(order.expectedDeliveryDate)
      : null,
    expectedReadyDate: order.expectedReadyDate
      ? dateToDateOnly(order.expectedReadyDate)
      : null,
    freightResaleAmount:
      (order.pricingMode === PricingMode.COMPONENT_MARKUP ||
        order.pricingMode === PricingMode.PROJECT_MARKUP ||
        order.pricingMode === PricingMode.ORDER_MARKUP) &&
      order.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
        ? (component.freightSellOriginal?.toString() ?? null)
        : (order.freightResaleAmount?.toString() ?? null),
    freightAllowance: {
      amount: freightAllowance?.toString() ?? null,
      source:
        order.freightAllowanceOverrideAmount === null
          ? "PROJECT_ESTIMATE"
          : "MANUAL",
    },
    freightAllowanceOverrideAmount:
      order.freightAllowanceOverrideAmount?.toString() ?? null,
    freightTreatment: order.freightTreatment,
    freightMarkupOverrideRate:
      order.freightMarkupOverrideRate?.toString() ?? null,
    id: order.id,
    leadTimeWeeks: order.leadTimeWeeks,
    notes: order.notes,
    otherCostMarkupOverrideRate:
      order.otherCostMarkupOverrideRate?.toString() ?? null,
    outputVatTaxableBaseOverride:
      order.outputVatTaxableBaseOverride?.toString() ?? null,
    orderCurrencyCode: order.orderCurrencyCode,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate ? dateToDateOnly(order.orderDate) : null,
    packageName: order.packageName,
    packageSellingPrice: packagePrice?.toString() ?? null,
    pricingMode: order.pricingMode,
    productMarkupOverrideRate:
      order.productMarkupOverrideRate?.toString() ?? null,
    project: {
      ...order.project,
      defaultFreightMarkupRate:
        order.project.defaultFreightMarkupRate.toString(),
      defaultOtherCostMarkupRate:
        order.project.defaultOtherCostMarkupRate.toString(),
      defaultProductMarkupRate:
        order.project.defaultProductMarkupRate.toString(),
      freightEstimateRate:
        order.project.freightEstimateRate?.toString() ?? null,
    },
    quoteDate: order.quoteDate ? dateToDateOnly(order.quoteDate) : null,
    sellingCurrencyCode: order.sellingCurrencyCode,
    status: order.status,
    supplier: order.supplier,
    supplierOrderConfirmationReference:
      order.supplierOrderConfirmationReference,
    supplierQuoteReference: order.supplierQuoteReference,
    supplierPayment: {
      nextDueDate: nextSupplierDue
        ? dateToDateOnly(nextSupplierDue.dueDate)
        : null,
      outstanding: outstandingSupplier?.toString() ?? null,
      paid: paidSupplier.toString(),
      scheduled: scheduledSupplier.toString(),
      status: supplierPaymentStatus,
      totalPayable: supplierPayable?.toString() ?? null,
    },
    targetMarginRate: order.targetMarginRate?.toString() ?? null,
    totalSellingAmountIncludingVat:
      totalSellingAmountIncludingVat?.toString() ?? null,
    totalSellingRevenue: totalRevenue?.toString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
    costs: {
      conversionComplete: missingFx.length === 0,
      customsDuties: costAmount(order, ProcurementCostCategory.CUSTOMS_DUTIES),
      economicLandedCost: economic?.toString() ?? null,
      freight: costAmount(order, ProcurementCostCategory.FREIGHT),
      grossMarginRate: metrics?.grossMarginRate?.toString() ?? null,
      grossProfit: metrics?.grossProfit.toString() ?? null,
      inputVat: vatSummary(
        input,
        order.orderCurrencyCode,
        order.project.reportingCurrencyCode,
        order.purchaseFxRateToReporting,
      ),
      landedCost: landed?.toString() ?? null,
      markupRate: metrics?.markupRate?.toString() ?? null,
      miscellaneous: costAmount(order, ProcurementCostCategory.MISCELLANEOUS),
      missingFx,
      outputVat: vatSummary(
        output,
        order.sellingCurrencyCode,
        order.project.reportingCurrencyCode,
        order.sellingFxRateToReporting,
        order.outputVatTaxableBaseOverride !== null,
        effectiveOutputBase,
        effectiveOutputVat,
      ),
      purchaseCost: costAmount(
        order,
        ProcurementCostCategory.SUPPLIER_PURCHASE,
      ),
      purchaseFxRate: order.purchaseFxRateToReporting?.toString() ?? null,
      reportingEconomicLandedCost: reportingEconomic?.toString() ?? null,
      reportingLandedCost: reportingLanded?.toString() ?? null,
      reportingSellingRevenue: reportingRevenue?.toString() ?? null,
      sellingFxRate: order.sellingFxRateToReporting?.toString() ?? null,
    },
  };
}

export function projectProcurementSummary(
  orders: OrderSummary[],
): ProjectProcurementSummary {
  let cost = new Decimal(0);
  let revenue = new Decimal(0);
  let incompleteOrderCount = 0;
  for (const order of orders) {
    if (
      !order.costs.conversionComplete ||
      order.costs.reportingEconomicLandedCost === null ||
      order.costs.reportingSellingRevenue === null
    ) {
      incompleteOrderCount += 1;
      continue;
    }
    cost = cost.plus(order.costs.reportingEconomicLandedCost);
    revenue = revenue.plus(order.costs.reportingSellingRevenue);
  }
  return {
    convertedOrderCount: orders.length - incompleteOrderCount,
    incompleteOrderCount,
    totalEconomicCost: cost.toString(),
    totalGrossProfit: revenue.minus(cost).toString(),
    totalSellingRevenue: revenue.toString(),
  };
}

interface ProjectPricingContext {
  defaultFreightMarkupRate: string;
  defaultOtherCostMarkupRate: string;
  defaultProductMarkupRate: string;
  freightEstimateRate: string | null;
  reportingCurrencyCode: string;
}

function inputPricing(input: CreateOrderInput, project: ProjectPricingContext) {
  const projectMode = input.pricingMode === "PROJECT_MARKUP";
  return calculateOrderPricingDraft({
    directPackageSell: input.sellingPriceAmount ?? "0",
    freightCost: input.freight ?? "0",
    freightMarkupRate: projectMode
      ? project.defaultFreightMarkupRate
      : (input.freightMarkupOverrideRate ?? "0"),
    freightResale: input.freightResaleAmount ?? "0",
    freightTreatment: input.freightTreatment,
    method: input.pricingMode,
    otherCost: new Decimal(input.customsDuties ?? "0")
      .plus(input.miscellaneous ?? "0")
      .toString(),
    otherMarkupRate: projectMode
      ? project.defaultOtherCostMarkupRate
      : (input.otherCostMarkupOverrideRate ?? "0"),
    productCost: input.purchaseCost ?? "0",
    productMarkupRate: projectMode
      ? project.defaultProductMarkupRate
      : (input.productMarkupOverrideRate ?? "0"),
    purchaseCurrencyCode: input.orderCurrencyCode,
    purchaseFxRate: input.purchaseFxRate,
    reportingCurrencyCode: project.reportingCurrencyCode,
    sellingCurrencyCode: input.sellingCurrencyCode,
    sellingFxRate: input.sellingFxRate,
  });
}

async function assertRelations(
  input: CreateOrderInput,
  database: OrderRelationClient = getDatabase(),
): Promise<ProjectPricingContext> {
  const [project, supplier, purchaseCurrency, sellingCurrency, buildings] =
    await Promise.all([
      database.project.findUnique({
        where: { id: input.projectId },
        select: {
          defaultFreightMarkupRate: true,
          defaultOtherCostMarkupRate: true,
          defaultProductMarkupRate: true,
          freightEstimateRate: true,
          reportingCurrencyCode: true,
        },
      }),
      database.supplier.findUnique({
        where: { id: input.supplierId },
        select: { id: true },
      }),
      database.currency.findFirst({
        where: { code: input.orderCurrencyCode, isActive: true },
        select: { code: true },
      }),
      database.currency.findFirst({
        where: { code: input.sellingCurrencyCode, isActive: true },
        select: { code: true },
      }),
      input.buildingIds.length
        ? database.building.findMany({
            where: {
              id: { in: input.buildingIds },
              projectId: input.projectId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
  if (!project || !supplier || !purchaseCurrency || !sellingCurrency)
    throw new ProcurementRelationError(
      "Choose valid active project, supplier, and currencies.",
    );
  if (buildings.length !== input.buildingIds.length)
    throw new ProcurementRelationError(
      "Every selected building must belong to the chosen project.",
    );
  const context = {
    defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
    defaultOtherCostMarkupRate: project.defaultOtherCostMarkupRate.toString(),
    defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
    freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
    reportingCurrencyCode: project.reportingCurrencyCode,
  };
  const pricing = inputPricing(input, context);
  if (input.outputVatTreatment && pricing.totalSell === null)
    throw new ProcurementRelationError(
      "Output VAT requires a complete Selling HT calculation.",
    );
  return context;
}
function orderData(input: CreateOrderInput, project: ProjectPricingContext) {
  const expectedReadyDate =
    input.expectedReadyDate ??
    (input.orderDate !== undefined && input.leadTimeWeeks !== undefined
      ? addWeeksToDateOnly(input.orderDate, input.leadTimeWeeks)
      : undefined);
  return {
    actualDeliveryDate: input.actualDeliveryDate
      ? dateOnlyToDate(input.actualDeliveryDate)
      : null,
    category: input.category ?? null,
    description: input.description ?? null,
    expectedDeliveryDate: input.expectedDeliveryDate
      ? dateOnlyToDate(input.expectedDeliveryDate)
      : null,
    expectedReadyDate: expectedReadyDate
      ? dateOnlyToDate(expectedReadyDate)
      : null,
    freightResaleAmount:
      input.pricingMode === "DIRECT_SELLING_PRICE" &&
      input.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
        ? (input.freightResaleAmount ?? null)
        : null,
    freightMarkupOverrideRate:
      input.pricingMode === "ORDER_MARKUP"
        ? (input.freightMarkupOverrideRate ?? null)
        : null,
    freightAllowanceOverrideAmount:
      input.freightAllowanceOverrideAmount ?? null,
    freightTreatment: input.freightTreatment,
    notes: input.notes ?? null,
    otherCostMarkupOverrideRate:
      input.pricingMode === "ORDER_MARKUP"
        ? (input.otherCostMarkupOverrideRate ?? null)
        : null,
    leadTimeWeeks: input.leadTimeWeeks ?? null,
    orderCurrencyCode: input.orderCurrencyCode,
    orderNumber: input.orderNumber,
    orderDate: input.orderDate ? dateOnlyToDate(input.orderDate) : null,
    packageName: input.packageName,
    outputVatTaxableBaseOverride: input.outputVatTaxableBaseOverride ?? null,
    pricingMode: input.pricingMode,
    productMarkupOverrideRate:
      input.pricingMode === "ORDER_MARKUP"
        ? (input.productMarkupOverrideRate ?? null)
        : null,
    projectId: input.projectId,
    purchaseFxRateToReporting:
      input.orderCurrencyCode === project.reportingCurrencyCode
        ? null
        : (input.purchaseFxRate ?? null),
    quoteDate: input.quoteDate ? dateOnlyToDate(input.quoteDate) : null,
    sellingCurrencyCode: input.sellingCurrencyCode,
    sellingFxRateToReporting:
      input.sellingCurrencyCode === project.reportingCurrencyCode
        ? null
        : (input.sellingFxRate ?? null),
    sellingPriceAmount:
      input.pricingMode === "DIRECT_SELLING_PRICE"
        ? (input.sellingPriceAmount ?? null)
        : null,
    status: input.status,
    supplierId: input.supplierId,
    supplierOrderConfirmationReference:
      input.supplierOrderConfirmationReference ?? null,
    supplierQuoteReference: input.supplierQuoteReference ?? null,
    targetMarginRate: null,
  };
}
function costLines(input: CreateOrderInput) {
  return [
    [ProcurementCostCategory.SUPPLIER_PURCHASE, input.purchaseCost],
    [ProcurementCostCategory.FREIGHT, input.freight],
    [ProcurementCostCategory.CUSTOMS_DUTIES, input.customsDuties],
    [ProcurementCostCategory.MISCELLANEOUS, input.miscellaneous],
  ] as const;
}
function vatEntries(
  input: CreateOrderInput,
  actorId: string,
  project: ProjectPricingContext,
) {
  const outputBase = effectiveVatBase(
    inputPricing(input, project).totalSell,
    input.outputVatTaxableBaseOverride,
  );
  const inputRecoverableRate = inputVatRecoverabilityApplies(
    input.inputVatTreatment,
  )
    ? resolveRecoverableRate({
        recoverability: input.inputVatRecoverability,
        recoverableRate: input.inputVatRecoverableRate,
      })
    : null;
  const values = [
    {
      amount: input.inputVatAmount,
      countryCode: input.inputVatCountryCode,
      customTreatmentNote: input.inputVatCustomTreatmentNote,
      direction: VatDirection.INPUT,
      rate: input.inputVatRate,
      recoverability: inputRecoverableRate
        ? recoverabilityFromRate(inputRecoverableRate)
        : null,
      recoverableRate: inputRecoverableRate?.toFixed(6) ?? null,
      taxableBase: input.inputVatTaxableBase,
      treatment: input.inputVatTreatment,
    },
    {
      amount: input.outputVatAmount,
      countryCode: input.outputVatCountryCode,
      customTreatmentNote: input.outputVatCustomTreatmentNote,
      direction: VatDirection.OUTPUT,
      rate: input.outputVatRate,
      recoverability: null,
      recoverableRate: null,
      taxableBase: outputBase ?? undefined,
      treatment: input.outputVatTreatment,
    },
  ] as const;
  return values.flatMap((entry) =>
    entry.treatment && entry.taxableBase
      ? [
          {
            countryCode: entry.countryCode ?? null,
            customTreatmentNote: entry.customTreatmentNote ?? null,
            direction: entry.direction,
            isAmountOverride: Boolean(entry.amount),
            recoverability: entry.recoverability,
            recoverableRate: entry.recoverableRate,
            taxableBaseAmount: entry.taxableBase,
            treatment: entry.treatment,
            vatAmount:
              entry.amount ??
              calculateVatAmount(entry.taxableBase, entry.rate ?? "0").toFixed(
                4,
              ),
            vatRate: entry.rate ?? null,
            createdById: actorId,
            updatedById: actorId,
          },
        ]
      : [],
  );
}
async function replaceOrderFinancialData(
  transaction: Prisma.TransactionClient,
  orderId: string,
  actorId: string,
  input: CreateOrderInput,
  project: ProjectPricingContext,
): Promise<void> {
  await Promise.all([
    transaction.procurementOrderCostLine.deleteMany({ where: { orderId } }),
    transaction.procurementOrderVatEntry.deleteMany({ where: { orderId } }),
  ]);
  const costs = costLines(input).flatMap(([category, originalAmount]) =>
    originalAmount
      ? [
          {
            category,
            originalAmount,
            createdById: actorId,
            updatedById: actorId,
            orderId,
          },
        ]
      : [],
  );
  const vat = vatEntries(input, actorId, project).map((entry) => ({
    ...entry,
    orderId,
  }));
  await Promise.all([
    costs.length
      ? transaction.procurementOrderCostLine.createMany({ data: costs })
      : Promise.resolve(),
    vat.length
      ? transaction.procurementOrderVatEntry.createMany({ data: vat })
      : Promise.resolve(),
  ]);
}
export async function listOrderOptions() {
  const database = getDatabase();
  const [billingDocuments, projects, suppliers, currencies] = await Promise.all(
    [
      database.clientBillingDocument.findMany({
        where: { isCancelled: false },
        orderBy: [{ documentDate: "desc" }, { reference: "asc" }],
        select: {
          allocations: { select: { allocatedAmount: true } },
          currencyCode: true,
          documentType: true,
          fxRateToReporting: true,
          id: true,
          isProjectRemainderApproved: true,
          projectId: true,
          reference: true,
          totalHt: true,
        },
      }),
      database.project.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          buildings: {
            orderBy: { name: "asc" },
            select: { id: true, isActive: true, name: true, shortCode: true },
          },
          client: { select: { defaultCurrencyCode: true } },
          id: true,
          name: true,
          defaultFreightMarkupRate: true,
          defaultOtherCostMarkupRate: true,
          defaultProductMarkupRate: true,
          freightEstimateRate: true,
          reportingCurrencyCode: true,
        },
      }),
      database.supplier.findMany({
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
        select: {
          defaultCurrencyCode: true,
          defaultLeadTimeWeeks: true,
          displayName: true,
          id: true,
        },
      }),
      database.currency.findMany({
        orderBy: { code: "asc" },
        where: { isActive: true },
        select: { code: true, name: true },
      }),
    ],
  );
  return {
    billingDocuments: billingDocuments.map((document) => ({
      allocatedHt: document.allocations
        .reduce(
          (total, allocation) => total.plus(allocation.allocatedAmount),
          new Decimal(0),
        )
        .toFixed(4),
      currencyCode: document.currencyCode,
      documentType: document.documentType,
      fxRateToReporting: document.fxRateToReporting?.toString() ?? null,
      id: document.id,
      isProjectRemainderApproved: document.isProjectRemainderApproved,
      projectId: document.projectId,
      reference: document.reference,
      totalHt: document.totalHt.toString(),
    })),
    currencies,
    freightTreatments: Object.values(FreightTreatment),
    pricingModes: [...orderPricingMethods],
    projects: projects.map((project) => ({
      ...project,
      defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
      defaultOtherCostMarkupRate: project.defaultOtherCostMarkupRate.toString(),
      defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
      freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
    })),
    statuses: Object.values(ProcurementOrderStatus),
    suppliers,
    vatRecoverabilities: Object.values(VatRecoverability),
    vatTreatments: Object.values(VatTreatment),
  };
}
export interface OrderFilters {
  buildingId?: string | undefined;
  currencyCode?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  projectId?: string | undefined;
  projectIds?: readonly string[] | undefined;
  query: string;
  status?: ProcurementOrderStatus | undefined;
  supplierId?: string | undefined;
  vatTreatment?: VatTreatment | undefined;
}

export interface OrderListFilters extends OrderFilters, PageInput {
  direction: "asc" | "desc";
  sort: "orderDate" | "reference" | "status" | "updated";
}

function orderWhere(filters: OrderFilters): Prisma.ProcurementOrderWhereInput {
  const query = filters.query.trim();
  return {
    ...(filters.buildingId
      ? { buildings: { some: { buildingId: filters.buildingId } } }
      : {}),
    ...(filters.currencyCode
      ? { orderCurrencyCode: filters.currencyCode }
      : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          orderDate: {
            ...(filters.dateFrom
              ? { gte: dateOnlyToDate(filters.dateFrom) }
              : {}),
            ...(filters.dateTo ? { lte: dateOnlyToDate(filters.dateTo) } : {}),
          },
        }
      : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.projectIds
      ? { projectId: { in: [...filters.projectIds] } }
      : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.vatTreatment
      ? { vatEntries: { some: { treatment: filters.vatTreatment } } }
      : {}),
    ...(query
      ? {
          OR: [
            { orderNumber: { contains: query, mode: "insensitive" } },
            { packageName: { contains: query, mode: "insensitive" } },
            {
              supplierQuoteReference: {
                contains: query,
                mode: "insensitive",
              },
            },
            { project: { name: { contains: query, mode: "insensitive" } } },
            {
              supplier: {
                displayName: { contains: query, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };
}

export async function listOrders(
  filters: OrderFilters,
): Promise<OrderSummary[]> {
  const orders = await getDatabase().procurementOrder.findMany({
    include: orderInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    where: orderWhere(filters),
  });
  return orders.map(summarizeOrder);
}

export async function listOrdersPage(filters: OrderListFilters) {
  const where = orderWhere(filters);
  const orderBy: Prisma.ProcurementOrderOrderByWithRelationInput[] =
    filters.sort === "reference"
      ? [{ orderNumber: filters.direction }, { id: "asc" }]
      : filters.sort === "orderDate"
        ? [{ orderDate: filters.direction }, { id: "asc" }]
        : filters.sort === "status"
          ? [{ status: filters.direction }, { orderNumber: "asc" }]
          : [{ updatedAt: filters.direction }, { id: "asc" }];
  const database = getDatabase();
  const [records, total] = await Promise.all([
    database.procurementOrder.findMany({
      include: orderInclude,
      orderBy,
      skip: paginationSkip(filters),
      take: filters.pageSize,
      where,
    }),
    database.procurementOrder.count({ where }),
  ]);
  return { items: records.map(summarizeOrder), total };
}
export async function getOrder(orderId: string): Promise<OrderSummary | null> {
  const order = await getDatabase().procurementOrder.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  return order ? summarizeOrder(order) : null;
}
export async function listProjectOrders(
  projectId: string,
): Promise<OrderSummary[]> {
  return listOrders({ projectId, query: "" });
}
export async function createOrder(
  actorId: string,
  input: CreateOrderInput,
): Promise<string> {
  const project = await assertRelations(input);
  return getDatabase().$transaction((transaction) =>
    createOrderRecord(transaction, actorId, input, project),
  );
}

async function createOrderRecord(
  transaction: Prisma.TransactionClient,
  actorId: string,
  input: CreateOrderInput,
  project: ProjectPricingContext,
): Promise<string> {
  const order = await transaction.procurementOrder.create({
    data: {
      ...orderData(input, project),
      buildings: {
        create: input.buildingIds.map((buildingId) => ({
          buildingId,
          createdById: actorId,
        })),
      },
      createdById: actorId,
      updatedById: actorId,
    },
    select: { id: true },
  });
  await replaceOrderFinancialData(
    transaction,
    order.id,
    actorId,
    input,
    project,
  );
  await writeAuditEvent(transaction, actorId, {
    action: "CREATED",
    entityId: order.id,
    entityReference: input.orderNumber,
    entityType: "ORDER",
    metadata: {
      fields: [
        "supplierId",
        "pricingMode",
        "costLines",
        "productMarkupOverrideRate",
        "freightMarkupOverrideRate",
        "freightAllowanceOverrideAmount",
        "otherCostMarkupOverrideRate",
        "sellingPriceAmount",
        "outputVatTaxableBaseOverride",
        "vatEntries",
      ],
    },
    summary: "Created the Supplier Order.",
  });
  return order.id;
}

export async function createOrderInTransaction(
  transaction: Prisma.TransactionClient,
  actorId: string,
  input: CreateOrderInput,
): Promise<string> {
  const project = await assertRelations(input, transaction);
  return createOrderRecord(transaction, actorId, input, project);
}

export async function updateOrder(
  actorId: string,
  input: UpdateOrderInput,
): Promise<void> {
  const project = await assertRelations(input);
  try {
    await getDatabase().$transaction((transaction) =>
      updateOrderRecord(transaction, actorId, input, project),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      throw new ProcurementNotFoundError();
    throw error;
  }
}

export async function updateOrderInline(
  actorId: string,
  input: InlineOrderInput,
) {
  try {
    return await getDatabase().$transaction(async (transaction) => {
      const order = await transaction.procurementOrder.update({
        where: { id: input.id },
        data: {
          expectedDeliveryDate: input.expectedDeliveryDate
            ? dateOnlyToDate(input.expectedDeliveryDate)
            : null,
          expectedReadyDate: input.expectedReadyDate
            ? dateOnlyToDate(input.expectedReadyDate)
            : null,
          orderNumber: input.orderNumber,
          status: input.status,
          updatedById: actorId,
        },
        select: {
          expectedDeliveryDate: true,
          expectedReadyDate: true,
          id: true,
          orderNumber: true,
          status: true,
        },
      });
      await writeAuditEvent(transaction, actorId, {
        action: "UPDATED",
        entityId: order.id,
        entityReference: order.orderNumber,
        entityType: "ORDER",
        metadata: {
          fields: [
            "orderNumber",
            "status",
            "expectedReadyDate",
            "expectedDeliveryDate",
          ],
        },
        summary:
          "Updated routine Supplier Order fields from the Supplier Orders table.",
      });
      return {
        ...order,
        expectedDeliveryDate: order.expectedDeliveryDate
          ? dateToDateOnly(order.expectedDeliveryDate)
          : null,
        expectedReadyDate: order.expectedReadyDate
          ? dateToDateOnly(order.expectedReadyDate)
          : null,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      throw new ProcurementNotFoundError();
    throw error;
  }
}

async function updateOrderRecord(
  transaction: Prisma.TransactionClient,
  actorId: string,
  input: UpdateOrderInput,
  project: ProjectPricingContext,
): Promise<void> {
  const { id, ...fields } = input;
  const current = await transaction.procurementOrder.findUnique({
    where: { id },
    select: {
      supplierId: true,
      _count: {
        select: { items: true, paymentInstallments: true },
      },
    },
  });
  if (!current) throw new ProcurementNotFoundError();
  if (
    current.supplierId !== input.supplierId &&
    (current._count.items > 0 || current._count.paymentInstallments > 0)
  ) {
    throw new ProcurementRelationError(
      "Supplier cannot be changed after Items or payment schedules are linked. Remove or reassign those records explicitly first.",
    );
  }
  await transaction.procurementOrder.update({
    where: { id },
    data: {
      ...orderData(fields, project),
      updatedById: actorId,
    },
  });
  await transaction.procurementOrderBuilding.deleteMany({
    where: { orderId: id },
  });
  if (input.buildingIds.length) {
    await transaction.procurementOrderBuilding.createMany({
      data: input.buildingIds.map((buildingId) => ({
        buildingId,
        createdById: actorId,
        orderId: id,
      })),
    });
  }
  await replaceOrderFinancialData(transaction, id, actorId, fields, project);
  await writeAuditEvent(transaction, actorId, {
    action: "UPDATED",
    entityId: id,
    entityReference: input.orderNumber,
    entityType: "ORDER",
    metadata: {
      fields: [
        "supplierId",
        "pricingMode",
        "costLines",
        "productMarkupOverrideRate",
        "freightMarkupOverrideRate",
        "freightAllowanceOverrideAmount",
        "otherCostMarkupOverrideRate",
        "sellingPriceAmount",
        "outputVatTaxableBaseOverride",
        "vatEntries",
      ],
    },
    summary:
      "Updated the Supplier Order and authoritative financial structure.",
  });
}

export async function updateOrderInTransaction(
  transaction: Prisma.TransactionClient,
  actorId: string,
  input: UpdateOrderInput,
): Promise<void> {
  const project = await assertRelations(input, transaction);
  try {
    await updateOrderRecord(transaction, actorId, input, project);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new ProcurementNotFoundError();
    }
    throw error;
  }
}

export async function getOrderInTransaction(
  transaction: Prisma.TransactionClient,
  orderId: string,
): Promise<OrderSummary | null> {
  const order = await transaction.procurementOrder.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  return order ? summarizeOrder(order) : null;
}
