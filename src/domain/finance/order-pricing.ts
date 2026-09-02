import Decimal from "decimal.js";

import { calculateComponentMarkup } from "./component-markup";

export const orderPricingMethods = [
  "PROJECT_MARKUP",
  "ORDER_MARKUP",
  "DIRECT_SELLING_PRICE",
] as const;
export type OrderPricingMethod = (typeof orderPricingMethods)[number];

export interface OrderPricingDraftInput {
  directPackageSell: string;
  freightCost: string;
  freightMarkupRate: string;
  freightResale: string;
  freightTreatment: string;
  method: OrderPricingMethod;
  otherCost: string;
  otherMarkupRate: string;
  productCost: string;
  productMarkupRate: string;
  purchaseCurrencyCode: string;
  purchaseFxRate?: string | null | undefined;
  reportingCurrencyCode: string;
  sellingCurrencyCode: string;
  sellingFxRate?: string | null | undefined;
}

function nonNegative(value: string): Decimal {
  const amount = new Decimal(value || "0");
  if (amount.isNegative()) throw new RangeError("Amounts cannot be negative.");
  return amount;
}

function currencyRate(
  currency: string,
  reportingCurrency: string,
  rate?: string | null,
): Decimal | null {
  if (currency === reportingCurrency) return new Decimal(1);
  if (!rate) return null;
  const decimal = new Decimal(rate);
  return decimal.isPositive() ? decimal : null;
}

export function calculateOrderPricingDraft(input: OrderPricingDraftInput) {
  const purchaseRate = currencyRate(
    input.purchaseCurrencyCode,
    input.reportingCurrencyCode,
    input.purchaseFxRate,
  );
  const sellingRate = currencyRate(
    input.sellingCurrencyCode,
    input.reportingCurrencyCode,
    input.sellingFxRate,
  );
  const productCost = nonNegative(input.productCost);
  const freightCost = nonNegative(input.freightCost);
  const otherCost = nonNegative(input.otherCost);
  const totalCostReporting = purchaseRate
    ? productCost.plus(freightCost).plus(otherCost).times(purchaseRate)
    : null;

  if (input.method === "DIRECT_SELLING_PRICE") {
    const packageSell = nonNegative(input.directPackageSell);
    const freightSell =
      input.freightTreatment === "RECHARGED_SEPARATELY"
        ? nonNegative(input.freightResale)
        : new Decimal(0);
    const totalSell = packageSell.plus(freightSell);
    const totalSellReporting = sellingRate
      ? totalSell.times(sellingRate)
      : null;
    const grossProfit =
      totalCostReporting && totalSellReporting
        ? totalSellReporting.minus(totalCostReporting)
        : null;
    const effectiveMarkupRate =
      totalCostReporting && grossProfit && !totalCostReporting.isZero()
        ? grossProfit.dividedBy(totalCostReporting).toFixed(6)
        : null;
    return {
      complete: Boolean(totalCostReporting && totalSellReporting),
      effectiveMarkupRate,
      freightSell: freightSell.toFixed(4),
      grossProfitReporting: grossProfit?.toFixed(4) ?? null,
      otherSell: null,
      productSell: packageSell.toFixed(4),
      productMarkupRate: effectiveMarkupRate,
      totalCostReporting: totalCostReporting?.toFixed(4) ?? null,
      totalSell: totalSell.toFixed(4),
      totalSellReporting: totalSellReporting?.toFixed(4) ?? null,
    };
  }

  if (!purchaseRate || !sellingRate)
    return {
      complete: false,
      effectiveMarkupRate: null,
      freightSell: null,
      grossProfitReporting: null,
      otherSell: null,
      productMarkupRate: null,
      productSell: null,
      totalCostReporting: totalCostReporting?.toFixed(4) ?? null,
      totalSell: null,
      totalSellReporting: null,
    };
  const calculated = calculateComponentMarkup({
    freightCost: freightCost.times(purchaseRate).toString(),
    freightMarkupRate: input.freightMarkupRate,
    otherCost: otherCost.times(purchaseRate).toString(),
    otherMarkupRate: input.otherMarkupRate,
    productCost: productCost.times(purchaseRate).toString(),
    productMarkupRate: input.productMarkupRate,
  });
  const toSelling = (amount: string) =>
    new Decimal(amount).dividedBy(sellingRate).toFixed(4);
  return {
    complete: true,
    effectiveMarkupRate: calculated.effectiveMarkupRate,
    freightSell: toSelling(calculated.freightSell),
    grossProfitReporting: calculated.grossProfit,
    otherSell: toSelling(calculated.otherSell),
    productMarkupRate: input.productMarkupRate,
    productSell: toSelling(calculated.productSell),
    totalCostReporting: calculated.totalCost,
    totalSell: toSelling(calculated.totalSell),
    totalSellReporting: calculated.totalSell,
  };
}

export function effectiveVatBase(
  totalSell: string | null,
  manualOverride?: string | null,
): string | null {
  if (manualOverride !== null && manualOverride !== undefined)
    return nonNegative(manualOverride).toFixed(4);
  return totalSell === null ? null : nonNegative(totalSell).toFixed(4);
}

export function initializePricingMethod(
  target: OrderPricingMethod,
  current: {
    effectiveFreightMarkupRate: string;
    effectiveOtherMarkupRate: string;
    effectiveProductMarkupRate: string;
    freightSell: string | null;
    freightTreatment: string;
    totalSell: string | null;
  },
) {
  if (target === "ORDER_MARKUP")
    return {
      freightMarkupPercent: new Decimal(current.effectiveFreightMarkupRate)
        .times(100)
        .toString(),
      otherMarkupPercent: new Decimal(current.effectiveOtherMarkupRate)
        .times(100)
        .toString(),
      productMarkupPercent: new Decimal(current.effectiveProductMarkupRate)
        .times(100)
        .toString(),
    };
  if (target === "DIRECT_SELLING_PRICE" && current.totalSell !== null) {
    const freight =
      current.freightTreatment === "RECHARGED_SEPARATELY"
        ? new Decimal(current.freightSell ?? "0")
        : new Decimal(0);
    return {
      directPackageSell: new Decimal(current.totalSell)
        .minus(freight)
        .toFixed(4),
      freightResale: freight.toFixed(4),
    };
  }
  return {};
}
