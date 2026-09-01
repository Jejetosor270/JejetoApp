import Decimal from "decimal.js";

import type { ProjectTargetMode } from "@/generated/prisma/client";

export interface ProjectTargetInput {
  estimatedFreightCostHt?: string | null;
  estimatedPurchaseCostHt?: string | null;
  expectedSellHt?: string | null;
  targetMarkupRate?: string | null;
  targetMode: ProjectTargetMode;
}

export interface ProjectTargetSummary {
  estimatedCostHt: string | null;
  expectedGrossProfit: string | null;
  expectedMarginRate: string | null;
  expectedSellHt: string | null;
  targetMarkupRate: string | null;
}

const value = (input?: string | null) =>
  input === null || input === undefined ? null : new Decimal(input);

export function calculateProjectTargets(
  input: ProjectTargetInput,
): ProjectTargetSummary {
  const purchase = value(input.estimatedPurchaseCostHt);
  const freight = value(input.estimatedFreightCostHt);
  const cost =
    purchase === null && freight === null
      ? null
      : (purchase ?? new Decimal(0)).plus(freight ?? 0);
  const enteredMarkup = value(input.targetMarkupRate);
  const enteredSell = value(input.expectedSellHt);
  const sell =
    input.targetMode === "MARKUP"
      ? cost !== null && enteredMarkup !== null
        ? cost.times(new Decimal(1).plus(enteredMarkup))
        : null
      : enteredSell;
  const profit = cost !== null && sell !== null ? sell.minus(cost) : null;
  const markup =
    profit !== null && cost !== null && !cost.isZero()
      ? profit.dividedBy(cost)
      : input.targetMode === "MARKUP"
        ? enteredMarkup
        : null;
  const margin =
    profit !== null && sell !== null && !sell.isZero()
      ? profit.dividedBy(sell)
      : null;
  return {
    estimatedCostHt: cost?.toFixed(4) ?? null,
    expectedGrossProfit: profit?.toFixed(4) ?? null,
    expectedMarginRate: margin?.toFixed(6) ?? null,
    expectedSellHt: sell?.toFixed(4) ?? null,
    targetMarkupRate: markup?.toFixed(6) ?? null,
  };
}

export function financialVariance(
  actual: string | null,
  target: string | null,
): string | null {
  return actual === null || target === null
    ? null
    : new Decimal(actual).minus(target).toFixed(4);
}

export function calculateProjectActualProfitability(
  economicCostHt: string | null,
  invoicedSellHt: string | null,
) {
  if (economicCostHt === null || invoicedSellHt === null) {
    return {
      grossProfit: null,
      marginRate: null,
      markupRate: null,
    };
  }
  const cost = new Decimal(economicCostHt);
  const sell = new Decimal(invoicedSellHt);
  const profit = sell.minus(cost);
  return {
    grossProfit: profit.toFixed(4),
    marginRate: sell.isZero() ? null : profit.dividedBy(sell).toFixed(6),
    markupRate: cost.isZero() ? null : profit.dividedBy(cost).toFixed(6),
  };
}

export function calculateNetCashPosition(
  clientPaid: string | null,
  supplierPaid: string | null,
): string | null {
  return clientPaid === null || supplierPaid === null
    ? null
    : new Decimal(clientPaid).minus(supplierPaid).toFixed(4);
}
