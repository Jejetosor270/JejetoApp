import Decimal from "decimal.js";

export type FinancialDecimal = Decimal | string;

interface PricingInput {
  landedCost: FinancialDecimal;
  sellingPrice: FinancialDecimal;
}

interface LandedCostInput {
  supplierPurchase: FinancialDecimal;
  supplierDiscount?: FinancialDecimal;
  freight?: FinancialDecimal;
  customsDuties?: FinancialDecimal;
  miscellaneous?: FinancialDecimal;
}

export type FreightTreatmentValue =
  "INCLUDED_IN_PACKAGE_PRICE" | "RECHARGED_SEPARATELY" | "NOT_APPLICABLE";

export interface FinancialMetrics {
  grossMarginRate: Decimal | null;
  grossProfit: Decimal;
  markupRate: Decimal | null;
}

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

function decimal(value: FinancialDecimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

function nonNegative(value: FinancialDecimal, fieldName: string): Decimal {
  const amount = decimal(value);

  if (amount.isNegative()) {
    throw new RangeError(`${fieldName} cannot be negative.`);
  }

  return amount;
}

/** Selling price HT minus landed cost HT. */
export function grossProfit({
  landedCost,
  sellingPrice,
}: PricingInput): Decimal {
  return decimal(sellingPrice).minus(decimal(landedCost));
}

/** Gross profit divided by selling price. Returns a rate such as 0.30, not 30. */
export function grossMarginRate(input: PricingInput): Decimal {
  const sellingPrice = decimal(input.sellingPrice);

  if (sellingPrice.isZero()) {
    throw new RangeError("Selling price must be non-zero to calculate margin.");
  }

  return grossProfit(input).dividedBy(sellingPrice);
}

/** Gross profit divided by landed cost. Returns a rate such as 0.30, not 30. */
export function markupRate(input: PricingInput): Decimal {
  const landedCost = decimal(input.landedCost);

  if (landedCost.isZero()) {
    throw new RangeError("Landed cost must be non-zero to calculate markup.");
  }

  return grossProfit(input).dividedBy(landedCost);
}

/** Landed cost divided by one minus the target margin rate. */
export function sellingPriceFromTargetMargin(
  landedCost: FinancialDecimal,
  targetMarginRate: FinancialDecimal,
): Decimal {
  const cost = nonNegative(landedCost, "Landed cost");
  const margin = decimal(targetMarginRate);

  if (margin.isNegative() || margin.greaterThanOrEqualTo(ONE)) {
    throw new RangeError(
      "Target margin rate must be at least 0 and less than 1.",
    );
  }

  return cost.dividedBy(ONE.minus(margin));
}

/**
 * Supplier purchase minus discount, plus freight, duties, and miscellaneous costs.
 * All components are HT and discounts are supplied as positive amounts.
 */
export function landedCost({
  supplierPurchase,
  supplierDiscount = ZERO,
  freight = ZERO,
  customsDuties = ZERO,
  miscellaneous = ZERO,
}: LandedCostInput): Decimal {
  const purchase = nonNegative(supplierPurchase, "Supplier purchase");
  const discount = nonNegative(supplierDiscount, "Supplier discount");

  if (discount.greaterThan(purchase)) {
    throw new RangeError(
      "Supplier discount cannot exceed the supplier purchase amount.",
    );
  }

  return purchase
    .minus(discount)
    .plus(nonNegative(freight, "Freight"))
    .plus(nonNegative(customsDuties, "Customs duties"))
    .plus(nonNegative(miscellaneous, "Miscellaneous cost"));
}

/** Package selling price plus freight only when freight is recharged separately. */
export function totalSellingRevenue(
  packageSellingPrice: FinancialDecimal,
  freightTreatment: FreightTreatmentValue,
  freightResale: FinancialDecimal = ZERO,
): Decimal {
  const packageRevenue = nonNegative(
    packageSellingPrice,
    "Package selling price",
  );
  const recharge = nonNegative(freightResale, "Freight resale");

  return freightTreatment === "RECHARGED_SEPARATELY"
    ? packageRevenue.plus(recharge)
    : packageRevenue;
}

/**
 * Calculates the package price required to achieve a target margin after any
 * separately recharged freight is included in total selling revenue.
 */
export function packageSellingPriceFromTargetMargin(
  landedCostAmount: FinancialDecimal,
  targetMarginRate: FinancialDecimal,
  freightTreatment: FreightTreatmentValue,
  freightResale: FinancialDecimal = ZERO,
): Decimal {
  const requiredRevenue = sellingPriceFromTargetMargin(
    landedCostAmount,
    targetMarginRate,
  );
  const recharge =
    freightTreatment === "RECHARGED_SEPARATELY"
      ? nonNegative(freightResale, "Freight resale")
      : ZERO;
  const packagePrice = requiredRevenue.minus(recharge);

  if (packagePrice.isNegative()) {
    throw new RangeError(
      "Freight resale cannot exceed the selling revenue required by the target margin.",
    );
  }

  return packagePrice;
}

/** Returns explicit null rates when a zero denominator makes a rate undefined. */
export function financialMetrics(input: PricingInput): FinancialMetrics {
  const landed = nonNegative(input.landedCost, "Landed cost");
  const selling = nonNegative(input.sellingPrice, "Selling price");
  const profit = grossProfit({ landedCost: landed, sellingPrice: selling });

  return {
    grossMarginRate: selling.isZero() ? null : profit.dividedBy(selling),
    grossProfit: profit,
    markupRate: landed.isZero() ? null : profit.dividedBy(landed),
  };
}

/** Converts an amount using a manually entered quote-to-reporting currency FX rate. */
export function convertCurrency(
  originalAmount: FinancialDecimal,
  fxRateToReporting: FinancialDecimal,
): Decimal {
  const rate = decimal(fxRateToReporting);

  if (rate.lessThanOrEqualTo(ZERO)) {
    throw new RangeError("FX rate must be greater than zero.");
  }

  return decimal(originalAmount).times(rate);
}
