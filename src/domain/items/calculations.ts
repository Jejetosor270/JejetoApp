import Decimal from "decimal.js";

import {
  financialMetrics,
  sellingPriceFromTargetMargin,
  vatAmount,
} from "@/domain/finance/calculations";

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
  eligibleBudgetPurchaseTotal: string,
  freightEstimateRate: string | null,
): string | null {
  return freightEstimateRate === null
    ? null
    : new Decimal(eligibleBudgetPurchaseTotal)
        .times(freightEstimateRate)
        .toFixed(4);
}
