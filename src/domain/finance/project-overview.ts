import Decimal from "decimal.js";

import { billingIsIssued } from "@/domain/billing/status";
import { calculateProjectActualProfitability } from "@/domain/projects/targets";
import { difference, sumKnown } from "./project-control";

/** Commercial plan only; this does not make a planned Invoice cash or revenue. */
export function isPlannedProjectBilling(document: {
  documentType: string;
  workflowStatus?: string;
  isCancelled: boolean;
}) {
  return (
    document.documentType === "INVOICE" &&
    !document.isCancelled &&
    (billingIsIssued(document) || document.workflowStatus === "TO_BE_INVOICED")
  );
}

type Amount = string | null;

interface ProjectOverviewInput {
  issuedHt: Amount;
  orderCostHt: Amount;
  orderEconomicCost: Amount;
  orderSellHt: Amount;
  freightCostHt: Amount;
  freightEconomicCost: Amount;
  clientReceivedTtc: Amount;
  clientRefundedTtc: Amount;
  supplierPaidTtc: Amount;
  freightPaidTtc: Amount;
  supplierRefundedTtc: Amount;
  recordedPayableTtc: Amount;
  plannedCategories: readonly { billedHt: Amount; markupRate: string }[];
}

function plannedTarget(categories: ProjectOverviewInput["plannedCategories"]) {
  if (categories.some((category) => category.billedHt === null)) {
    return { profit: null, margin: null, markup: null };
  }
  let revenue = new Decimal(0);
  let cost = new Decimal(0);
  for (const category of categories) {
    const billed = new Decimal(category.billedHt ?? "0");
    const multiplier = new Decimal(1).plus(category.markupRate);
    if (multiplier.lessThanOrEqualTo(0)) {
      return { profit: null, margin: null, markup: null };
    }
    revenue = revenue.plus(billed);
    cost = cost.plus(billed.dividedBy(multiplier));
  }
  const profit = revenue.minus(cost);
  return {
    profit: profit.toFixed(4),
    margin: revenue.isZero() ? null : profit.dividedBy(revenue).toFixed(6),
    markup: cost.isZero() ? null : profit.dividedBy(cost).toFixed(6),
  };
}

export function projectOverview(input: ProjectOverviewInput) {
  const costHt = sumKnown([input.orderCostHt, input.freightCostHt]);
  const economicCost = sumKnown([
    input.orderEconomicCost,
    input.freightEconomicCost,
  ]);
  const receivedTtc = difference(
    input.clientReceivedTtc,
    input.clientRefundedTtc,
  );
  const paidTtc = difference(
    sumKnown([input.supplierPaidTtc, input.freightPaidTtc]),
    input.supplierRefundedTtc,
  );
  const orderProfit = calculateProjectActualProfitability(
    input.orderEconomicCost,
    input.orderSellHt,
  );
  const billingHt = sumKnown(
    input.plannedCategories.map((row) => row.billedHt),
  );
  const provisional = calculateProjectActualProfitability(
    economicCost,
    billingHt,
  );
  const target = plannedTarget(input.plannedCategories);
  return {
    invoiced: {
      clientHt: input.issuedHt,
      costHt,
      balanceHt: difference(input.issuedHt, costHt),
    },
    cash: {
      receivedTtc,
      paidTtc,
      balanceTtc: difference(receivedTtc, paidTtc),
    },
    funding: {
      receivedTtc,
      recordedPayableTtc: input.recordedPayableTtc,
      balanceTtc: difference(receivedTtc, input.recordedPayableTtc),
    },
    orders: {
      costHt: input.orderCostHt,
      sellHt: input.orderSellHt,
      profitHt: orderProfit.grossProfit,
      markupRate: orderProfit.markupRate,
      nonDeductibleVat: difference(input.orderEconomicCost, input.orderCostHt),
    },
    planned: {
      billingHt,
      targetProfitHt: target.profit,
      targetMarginRate: target.margin,
      targetMarkupRate: target.markup,
      orderSellHt: input.orderSellHt,
      coverageHt: difference(billingHt, input.orderSellHt),
      profitHt: provisional.grossProfit,
      markupRate: provisional.markupRate,
      nonDeductibleVat: difference(economicCost, costHt),
    },
  };
}

export type ProjectOverview = ReturnType<typeof projectOverview>;
