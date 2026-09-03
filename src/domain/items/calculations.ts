import Decimal from "decimal.js";

import {
  financialMetrics,
  sellingPriceFromTargetMargin,
  vatAmount,
} from "@/domain/finance/calculations";
import { humanPercentageToFraction } from "@/domain/validation/percentage";
import { normalizeDecimalInput } from "@/domain/validation/numeric";

const MONEY_SCALE = 4;
export const ITEM_TOTAL_TOLERANCE = new Decimal("0.02");

export interface ItemFinancialInput {
  pricingMode: "SELLING_PRICE" | "TARGET_MARGIN";
  quantity: string;
  targetMarginRate?: string | null;
  totalPurchasePriceHt?: string | null;
  totalSellingPriceHt?: string | null;
  unitPurchasePriceHt?: string | null;
  unitSellingPriceHt?: string | null;
  vatRate?: string | null;
  vatAmount?: string | null;
}

export interface ItemFinancialResult {
  grossMarginRate: string | null;
  grossProfit: string | null;
  markupRate: string | null;
  totalPurchasePriceHt: string | null;
  totalSellingPriceHt: string | null;
  unitPurchasePriceHt: string | null;
  unitSellingPriceHt: string | null;
  vatAmount: string | null;
  warnings: string[];
}

export type ItemBudgetVarianceStatus =
  "UNDER_BUDGET" | "ON_BUDGET" | "OVER_BUDGET";

export interface ItemBudgetVariance {
  amount: string;
  status: ItemBudgetVarianceStatus;
}

function editableMoney(value: string | null): string | null {
  if (!value) return null;
  return normalizeDecimalInput(value, {
    allowNegative: false,
    maximumDecimalPlaces: 4,
  });
}

export function quoteItemTotalFromUnit(
  quantity: string | null,
  unitPriceHt: string | null,
): string | null {
  const normalizedQuantity = editableMoney(quantity);
  const normalizedUnitPrice = editableMoney(unitPriceHt);
  if (!normalizedQuantity || !normalizedUnitPrice) return null;
  const quantityValue = new Decimal(normalizedQuantity);
  if (!quantityValue.greaterThan(0)) return null;
  return quantityValue.times(normalizedUnitPrice).toFixed(MONEY_SCALE);
}

export function quoteItemPercentInputToRate(value: string): string | null {
  return humanPercentageToFraction(value, { maximumPercent: "100" });
}

export function quoteItemLineAmounts(input: {
  totalPriceHt: string | null;
  vatRate: string | null;
}): { totalTtc: string | null; vatAmount: string | null } {
  const normalizedTotal = editableMoney(input.totalPriceHt);
  if (
    !normalizedTotal ||
    !input.vatRate ||
    !/^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/.test(input.vatRate)
  )
    return { totalTtc: null, vatAmount: null };
  const total = new Decimal(normalizedTotal);
  const vat = total.times(input.vatRate);
  return {
    totalTtc: total.plus(vat).toFixed(MONEY_SCALE),
    vatAmount: vat.toFixed(MONEY_SCALE),
  };
}

export function quoteItemReviewTotal(
  rows: ReadonlyArray<{ include: boolean; totalPriceHt: string | null }>,
): { complete: boolean; totalHt: string } {
  let complete = true;
  const total = rows.reduce((sum, row) => {
    if (!row.include) return sum;
    const normalized = editableMoney(row.totalPriceHt);
    if (!normalized) {
      complete = false;
      return sum;
    }
    return sum.plus(normalized);
  }, new Decimal(0));
  return { complete, totalHt: total.toFixed(MONEY_SCALE) };
}

export function quoteItemReviewReconciliation(
  itemTotalHt: string,
  orderSubtotalHt: string | null,
): { difference: string; isReconciled: boolean } | null {
  const normalizedItems = editableMoney(itemTotalHt);
  const normalizedOrder = editableMoney(orderSubtotalHt);
  if (!normalizedItems || !normalizedOrder) return null;
  const difference = new Decimal(normalizedItems).minus(normalizedOrder);
  return {
    difference: difference.toFixed(MONEY_SCALE),
    isReconciled: difference.abs().lessThanOrEqualTo(ITEM_TOTAL_TOLERANCE),
  };
}

function optionalDecimal(value: string | null | undefined): Decimal | null {
  return value === null || value === undefined || value === ""
    ? null
    : new Decimal(value);
}

function money(value: Decimal | null): string | null {
  return value?.toFixed(MONEY_SCALE) ?? null;
}

export function quantityTimesUnitMatchesTotal(
  quantity: string,
  unitPrice: string,
  total: string,
): boolean {
  return new Decimal(quantity)
    .times(unitPrice)
    .minus(total)
    .abs()
    .lessThanOrEqualTo(ITEM_TOTAL_TOLERANCE);
}

export function calculateItemFinancials(
  input: ItemFinancialInput,
): ItemFinancialResult {
  const quantity = new Decimal(input.quantity);
  if (!quantity.greaterThan(0))
    throw new RangeError("Quantity must be greater than zero.");

  let unitPurchase = optionalDecimal(input.unitPurchasePriceHt);
  let totalPurchase = optionalDecimal(input.totalPurchasePriceHt);
  let unitSelling = optionalDecimal(input.unitSellingPriceHt);
  let totalSelling = optionalDecimal(input.totalSellingPriceHt);
  const warnings: string[] = [];

  if (unitPurchase && totalPurchase) {
    if (
      !quantityTimesUnitMatchesTotal(
        input.quantity,
        unitPurchase.toString(),
        totalPurchase.toString(),
      )
    ) {
      warnings.push("Quantity × unit price does not match total purchase HT.");
    }
  } else if (unitPurchase) {
    totalPurchase = quantity.times(unitPurchase);
  } else if (totalPurchase) {
    unitPurchase = totalPurchase.dividedBy(quantity);
  }

  if (input.pricingMode === "TARGET_MARGIN" && totalPurchase) {
    if (!input.targetMarginRate)
      throw new RangeError("Target margin is required.");
    totalSelling = sellingPriceFromTargetMargin(
      totalPurchase,
      input.targetMarginRate,
    );
    unitSelling = totalSelling.dividedBy(quantity);
  } else if (unitSelling && totalSelling) {
    if (
      !quantityTimesUnitMatchesTotal(
        input.quantity,
        unitSelling.toString(),
        totalSelling.toString(),
      )
    ) {
      warnings.push("Quantity × unit price does not match total selling HT.");
    }
  } else if (unitSelling) {
    totalSelling = quantity.times(unitSelling);
  } else if (totalSelling) {
    unitSelling = totalSelling.dividedBy(quantity);
  }

  const metrics =
    totalPurchase && totalSelling
      ? financialMetrics({
          landedCost: totalPurchase,
          sellingPrice: totalSelling,
        })
      : null;
  const enteredVat = optionalDecimal(input.vatAmount);
  const rate = optionalDecimal(input.vatRate);
  const calculatedVat =
    enteredVat ??
    (totalPurchase && rate ? vatAmount(totalPurchase, rate) : null);

  return {
    grossMarginRate: metrics?.grossMarginRate?.toFixed(6) ?? null,
    grossProfit: metrics?.grossProfit.toFixed(MONEY_SCALE) ?? null,
    markupRate: metrics?.markupRate?.toFixed(6) ?? null,
    totalPurchasePriceHt: money(totalPurchase),
    totalSellingPriceHt: money(totalSelling),
    unitPurchasePriceHt: money(unitPurchase),
    unitSellingPriceHt: money(unitSelling),
    vatAmount: money(calculatedVat),
    warnings,
  };
}

export function projectFreightEstimate(
  productPurchaseCostHt: string,
  freightEstimateRate: string | null,
): string | null {
  return freightEstimateRate === null
    ? null
    : new Decimal(productPurchaseCostHt).times(freightEstimateRate).toFixed(4);
}

export function budgetPriceFromMarkup(
  purchasePrice: string,
  markupRate: string,
): string {
  return new Decimal(purchasePrice)
    .times(new Decimal(1).plus(markupRate))
    .toFixed(MONEY_SCALE);
}

export function markupRateFromPrices(
  purchasePrice: string | null,
  budgetPrice: string | null,
): string | null {
  if (!purchasePrice || !budgetPrice) return null;
  const purchase = new Decimal(purchasePrice);
  if (purchase.isZero()) return null;
  return new Decimal(budgetPrice)
    .minus(purchase)
    .dividedBy(purchase)
    .toFixed(6);
}

export function itemBudgetVariance(
  budgetPurchaseTotal: string | null,
  actualPurchaseTotal: string | null,
): ItemBudgetVariance | null {
  if (!budgetPurchaseTotal || !actualPurchaseTotal) return null;
  const difference = new Decimal(budgetPurchaseTotal).minus(
    actualPurchaseTotal,
  );
  const status = difference.isZero()
    ? "ON_BUDGET"
    : difference.isPositive()
      ? "UNDER_BUDGET"
      : "OVER_BUDGET";
  return { amount: difference.abs().toFixed(MONEY_SCALE), status };
}

export type ItemFinancialEditBasis =
  | "QUANTITY"
  | "UNIT_PURCHASE"
  | "TOTAL_PURCHASE"
  | "BUDGET_UNIT"
  | "BUDGET_TOTAL"
  | "MARKUP";

export function reconcileItemFinancialDraft(input: {
  basis: ItemFinancialEditBasis;
  budgetTotal: string | null;
  budgetUnit: string | null;
  markupRate: string | null;
  quantity: string;
  totalPurchase: string | null;
  unitPurchase: string | null;
}) {
  const quantity = new Decimal(input.quantity);
  if (!quantity.greaterThan(0))
    throw new RangeError("Quantity must be greater than zero.");
  let unitPurchase = optionalDecimal(input.unitPurchase);
  let totalPurchase = optionalDecimal(input.totalPurchase);
  let budgetUnit = optionalDecimal(input.budgetUnit);
  let budgetTotal = optionalDecimal(input.budgetTotal);
  if (input.basis === "TOTAL_PURCHASE")
    unitPurchase = totalPurchase?.dividedBy(quantity) ?? null;
  else if (input.basis === "UNIT_PURCHASE" || input.basis === "QUANTITY")
    totalPurchase = unitPurchase?.times(quantity) ?? null;

  if (input.basis === "BUDGET_TOTAL")
    budgetUnit = budgetTotal?.dividedBy(quantity) ?? null;
  else if (input.basis === "BUDGET_UNIT" || input.basis === "QUANTITY")
    budgetTotal = budgetUnit?.times(quantity) ?? null;
  else if (input.basis === "MARKUP") {
    const markup = optionalDecimal(input.markupRate);
    budgetUnit =
      unitPurchase && markup
        ? unitPurchase.times(new Decimal(1).plus(markup))
        : null;
    budgetTotal = budgetUnit?.times(quantity) ?? null;
  }
  return {
    budgetTotal: money(budgetTotal),
    budgetUnit: money(budgetUnit),
    markupRate: markupRateFromPrices(money(totalPurchase), money(budgetTotal)),
    quantity: quantity.toFixed(MONEY_SCALE),
    totalPurchase: money(totalPurchase),
    unitPurchase: money(unitPurchase),
  };
}
