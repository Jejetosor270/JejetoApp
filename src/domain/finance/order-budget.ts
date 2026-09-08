import Decimal from "decimal.js";
import { reportingAmount } from "./calculations";
export function orderBudgetComparison(input: {
  budget: string | null;
  purchase: string | null;
  purchaseCurrency: string;
  reportingCurrency: string;
  purchaseFx: string | null;
  agreedMarkup: string;
  actualMarkup: string | null;
}) {
  const actualPurchase =
    input.purchase === null
      ? null
      : reportingAmount({
          originalAmount: input.purchase,
          originalCurrencyCode: input.purchaseCurrency,
          reportingCurrencyCode: input.reportingCurrency,
          fxRateToReporting: input.purchaseFx,
        });
  return {
    actualPurchase: actualPurchase?.toFixed(4) ?? null,
    variance:
      actualPurchase === null || input.budget === null
        ? null
        : actualPurchase.minus(input.budget).toFixed(4),
    markupDifferencePoints:
      input.actualMarkup === null
        ? null
        : new Decimal(input.actualMarkup)
            .minus(input.agreedMarkup)
            .times(100)
            .toFixed(2),
  };
}
export function projectPurchaseBudget(
  target: string | null,
  budgets: (string | null)[],
) {
  const allocated = budgets.reduce<Decimal>(
    (sum, value) => sum.plus(value ?? 0),
    new Decimal(0),
  );
  return {
    target,
    allocated: allocated.toFixed(4),
    remaining:
      target === null ? null : new Decimal(target).minus(allocated).toFixed(4),
    unbudgetedCount: budgets.filter((value) => value === null).length,
  };
}
