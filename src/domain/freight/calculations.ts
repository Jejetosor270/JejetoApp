import Decimal from "decimal.js";

export interface FreightReconciliationInput {
  expenses: readonly {
    costHt: string | null;
    markupRate: string;
  }[];
  orders: readonly {
    allowanceOverrideHt?: string | null;
    freightCostHt: string | null;
    freightMarkupRate: string;
    productPurchaseCostHt: string | null;
  }[];
  projectFreightEstimateRate: string | null;
}

export interface FreightReconciliation {
  actualCostHt: string | null;
  allowanceHt: string | null;
  complete: boolean;
  freightGrossProfitHt: string | null;
  headroomHt: string | null;
  productPurchaseCostHt: string | null;
  recoveryTargetHt: string | null;
}

function nonNegative(value: string, label: string): Decimal {
  const amount = new Decimal(value);
  if (amount.isNegative()) throw new RangeError(`${label} cannot be negative.`);
  return amount;
}

export function clientFreightAllowance(
  productPurchaseCostHt: string,
  freightEstimateRate: string,
): Decimal {
  return nonNegative(productPurchaseCostHt, "Product purchase cost").times(
    nonNegative(freightEstimateRate, "Freight estimate rate"),
  );
}

export function resolveOrderFreightAllowance(input: {
  allowanceOverrideHt?: string | null;
  productPurchaseCostHt: string;
  projectFreightEstimateRate: string;
}): { amount: Decimal; source: "MANUAL" | "PROJECT_ESTIMATE" } {
  if (
    input.allowanceOverrideHt !== null &&
    input.allowanceOverrideHt !== undefined
  ) {
    return {
      amount: nonNegative(input.allowanceOverrideHt, "Freight allowance"),
      source: "MANUAL",
    };
  }
  return {
    amount: clientFreightAllowance(
      input.productPurchaseCostHt,
      input.projectFreightEstimateRate,
    ),
    source: "PROJECT_ESTIMATE",
  };
}

export function freightRecoveryTarget(
  freightCostHt: string,
  freightMarkupRate: string,
): Decimal {
  return nonNegative(freightCostHt, "Freight cost").times(
    new Decimal(1).plus(nonNegative(freightMarkupRate, "Freight markup")),
  );
}

export function reconcileProjectFreight(
  input: FreightReconciliationInput,
): FreightReconciliation {
  const incomplete = (): FreightReconciliation => ({
    actualCostHt: null,
    allowanceHt: null,
    complete: false,
    freightGrossProfitHt: null,
    headroomHt: null,
    productPurchaseCostHt: null,
    recoveryTargetHt: null,
  });
  if (
    (input.projectFreightEstimateRate === null &&
      input.orders.some(
        (order) =>
          order.allowanceOverrideHt === null ||
          order.allowanceOverrideHt === undefined,
      )) ||
    input.orders.some(
      (order) =>
        order.productPurchaseCostHt === null || order.freightCostHt === null,
    ) ||
    input.expenses.some((expense) => expense.costHt === null)
  ) {
    return incomplete();
  }

  let productPurchaseCost = new Decimal(0);
  let allowance = new Decimal(0);
  let actualCost = new Decimal(0);
  let recovery = new Decimal(0);
  for (const order of input.orders) {
    if (order.productPurchaseCostHt === null || order.freightCostHt === null)
      return incomplete();
    const orderProductPurchaseCost = nonNegative(
      order.productPurchaseCostHt,
      "Product purchase cost",
    );
    const orderCost = nonNegative(order.freightCostHt, "Freight cost");
    productPurchaseCost = productPurchaseCost.plus(orderProductPurchaseCost);
    allowance = allowance.plus(
      resolveOrderFreightAllowance({
        ...(order.allowanceOverrideHt === undefined
          ? {}
          : { allowanceOverrideHt: order.allowanceOverrideHt }),
        productPurchaseCostHt: orderProductPurchaseCost.toString(),
        projectFreightEstimateRate: input.projectFreightEstimateRate ?? "0",
      }).amount,
    );
    actualCost = actualCost.plus(orderCost);
    recovery = recovery.plus(
      freightRecoveryTarget(orderCost.toString(), order.freightMarkupRate),
    );
  }
  for (const expense of input.expenses) {
    if (expense.costHt === null) return incomplete();
    const expenseCost = nonNegative(expense.costHt, "Freight expense");
    actualCost = actualCost.plus(expenseCost);
    recovery = recovery.plus(
      freightRecoveryTarget(expenseCost.toString(), expense.markupRate),
    );
  }
  return {
    actualCostHt: actualCost.toFixed(4),
    allowanceHt: allowance.toFixed(4),
    complete: true,
    freightGrossProfitHt: recovery.minus(actualCost).toFixed(4),
    headroomHt: allowance.minus(recovery).toFixed(4),
    productPurchaseCostHt: productPurchaseCost.toFixed(4),
    recoveryTargetHt: recovery.toFixed(4),
  };
}
