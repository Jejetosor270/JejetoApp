import Decimal from "decimal.js";

export interface FreightReconciliationInput {
  expenses: readonly {
    costHt: string | null;
    markupRate: string;
  }[];
  orders: readonly {
    freightCostHt: string | null;
    freightMarkupRate: string;
  }[];
  projectExpectedProductPurchaseCostHt: string | null;
  projectFreightEstimateRate: string | null;
}

export interface FreightReconciliation {
  actualComplete: boolean;
  actualCostHt: string | null;
  complete: boolean;
  expectedFreightAllowanceHt: string | null;
  expectedProductPurchaseCostHt: string | null;
  freightGrossProfitHt: string | null;
  headroomHt: string | null;
  planningComplete: boolean;
  recoveryTargetHt: string | null;
}

function nonNegative(value: string, label: string): Decimal {
  const amount = new Decimal(value);
  if (amount.isNegative()) throw new RangeError(`${label} cannot be negative.`);
  return amount;
}

export function freightAllowanceFromPurchaseCost(
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
    amount: freightAllowanceFromPurchaseCost(
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
  const planningComplete =
    input.projectExpectedProductPurchaseCostHt !== null &&
    input.projectFreightEstimateRate !== null;
  const expectedProductPurchaseCost = planningComplete
    ? nonNegative(
        input.projectExpectedProductPurchaseCostHt ?? "0",
        "Expected product purchase cost",
      )
    : null;
  const expectedFreightAllowance =
    expectedProductPurchaseCost !== null &&
    input.projectFreightEstimateRate !== null
      ? freightAllowanceFromPurchaseCost(
          expectedProductPurchaseCost.toString(),
          input.projectFreightEstimateRate,
        )
      : null;
  const actualComplete =
    input.orders.every((order) => order.freightCostHt !== null) &&
    input.expenses.every((expense) => expense.costHt !== null);

  if (!actualComplete) {
    return {
      actualComplete: false,
      actualCostHt: null,
      complete: false,
      expectedFreightAllowanceHt: expectedFreightAllowance?.toFixed(4) ?? null,
      expectedProductPurchaseCostHt:
        expectedProductPurchaseCost?.toFixed(4) ?? null,
      freightGrossProfitHt: null,
      headroomHt: null,
      planningComplete,
      recoveryTargetHt: null,
    };
  }

  let actualCost = new Decimal(0);
  let recovery = new Decimal(0);
  for (const order of input.orders) {
    if (order.freightCostHt === null) continue;
    const orderCost = nonNegative(order.freightCostHt, "Freight cost");
    actualCost = actualCost.plus(orderCost);
    recovery = recovery.plus(
      freightRecoveryTarget(orderCost.toString(), order.freightMarkupRate),
    );
  }
  for (const expense of input.expenses) {
    if (expense.costHt === null) continue;
    const expenseCost = nonNegative(expense.costHt, "Freight expense");
    actualCost = actualCost.plus(expenseCost);
    recovery = recovery.plus(
      freightRecoveryTarget(expenseCost.toString(), expense.markupRate),
    );
  }
  return {
    actualComplete: true,
    actualCostHt: actualCost.toFixed(4),
    complete: planningComplete,
    expectedFreightAllowanceHt: expectedFreightAllowance?.toFixed(4) ?? null,
    expectedProductPurchaseCostHt:
      expectedProductPurchaseCost?.toFixed(4) ?? null,
    freightGrossProfitHt: recovery.minus(actualCost).toFixed(4),
    headroomHt: expectedFreightAllowance?.minus(recovery).toFixed(4) ?? null,
    planningComplete,
    recoveryTargetHt: recovery.toFixed(4),
  };
}
