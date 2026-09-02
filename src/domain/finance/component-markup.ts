import Decimal from "decimal.js";

export interface ComponentMarkupInput {
  freightCost: string;
  freightMarkupRate: string;
  otherCost: string;
  otherMarkupRate: string;
  productCost: string;
  productMarkupRate: string;
}

export interface ResolvedMarkup {
  rate: string;
  source: "ORDER_OVERRIDE" | "PROJECT_DEFAULT";
}

function nonNegative(value: string, label: string): Decimal {
  const decimal = new Decimal(value);
  if (decimal.isNegative())
    throw new RangeError(`${label} cannot be negative.`);
  return decimal;
}

export function sellingFromMarkup(cost: string, rate: string): Decimal {
  return nonNegative(cost, "Cost").times(
    new Decimal(1).plus(nonNegative(rate, "Markup rate")),
  );
}

export function markupFromSelling(
  cost: string,
  selling: string,
): Decimal | null {
  const costAmount = nonNegative(cost, "Cost");
  const sellingAmount = nonNegative(selling, "Selling amount");
  if (costAmount.isZero())
    return sellingAmount.isZero() ? new Decimal(0) : null;
  return sellingAmount.minus(costAmount).dividedBy(costAmount);
}

export function resolveMarkup(
  projectDefault: string,
  orderOverride?: string | null,
): ResolvedMarkup {
  return orderOverride === null || orderOverride === undefined
    ? {
        rate: new Decimal(projectDefault).toFixed(6),
        source: "PROJECT_DEFAULT",
      }
    : { rate: new Decimal(orderOverride).toFixed(6), source: "ORDER_OVERRIDE" };
}

export function calculateComponentMarkup(input: ComponentMarkupInput) {
  const productCost = nonNegative(input.productCost, "Product cost");
  const freightCost = nonNegative(input.freightCost, "Freight cost");
  const otherCost = nonNegative(input.otherCost, "Other cost");
  const productSell = sellingFromMarkup(
    input.productCost,
    input.productMarkupRate,
  );
  const freightSell = sellingFromMarkup(
    input.freightCost,
    input.freightMarkupRate,
  );
  const otherSell = sellingFromMarkup(input.otherCost, input.otherMarkupRate);
  const totalCost = productCost.plus(freightCost).plus(otherCost);
  const totalSell = productSell.plus(freightSell).plus(otherSell);
  const grossProfit = totalSell.minus(totalCost);
  return {
    effectiveMarkupRate: totalCost.isZero()
      ? null
      : grossProfit.dividedBy(totalCost).toFixed(6),
    freightSell: freightSell.toFixed(4),
    grossProfit: grossProfit.toFixed(4),
    otherSell: otherSell.toFixed(4),
    productSell: productSell.toFixed(4),
    totalCost: totalCost.toFixed(4),
    totalSell: totalSell.toFixed(4),
  };
}
