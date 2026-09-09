import Decimal from "decimal.js";

export const recoveryCategories = ["merchandise", "freight", "other"] as const;
export type RecoveryCategory = (typeof recoveryCategories)[number];
export function revenueParts(total: string, freight: string, other: string) {
  return {
    merchandise: new Decimal(total).minus(freight).minus(other).toFixed(4),
    freight,
    other,
  };
}
export function difference(left: string | null, right: string | null) {
  return left === null || right === null
    ? null
    : new Decimal(left).minus(right).toFixed(4);
}
export function sumKnown(values: readonly (string | null)[]) {
  return values.some((value) => value === null)
    ? null
    : values
        .reduce<Decimal>((sum, value) => sum.plus(value ?? "0"), new Decimal(0))
        .toFixed(4);
}
export function requiredRecovery(cost: string | null, markup: string) {
  return cost === null
    ? null
    : new Decimal(cost).times(new Decimal(1).plus(markup)).toFixed(4);
}
export function categoryPosition(input: {
  billed: string | null;
  allocated: string | null;
  budget: string | null;
  recordedCost: string | null;
  markup: string;
  recordedTarget: string | null;
}) {
  const budgetTarget = requiredRecovery(input.budget, input.markup);
  return {
    ...input,
    budgetTarget,
    projectRemainder: difference(input.billed, input.allocated),
    budgetCostSurplus: difference(input.billed, input.budget),
    recordedCostSurplus: difference(input.billed, input.recordedCost),
    budgetTargetSurplus: difference(input.billed, budgetTarget),
    recordedTargetSurplus: difference(input.billed, input.recordedTarget),
  };
}
/** VAT payable to a freight supplier follows the existing Order payable treatments. */
export function freightPayable(
  cost: string,
  vat: string | null,
  treatment: string | null,
) {
  return new Decimal(cost)
    .plus(
      treatment === "DOMESTIC" || treatment === "CUSTOM" ? (vat ?? "0") : "0",
    )
    .toFixed(4);
}

export function freightPaymentBalance(
  cost: string,
  vat: string | null,
  treatment: string | null,
  payments: readonly string[],
) {
  const payable = freightPayable(cost, vat, treatment);
  const paid = sumKnown(payments) ?? "0.0000";
  return { payable, paid, outstanding: difference(payable, paid) };
}
export function cashFunding(input: {
  received: string | null;
  supplierPaid: string | null;
  freightPaid: string | null;
  commitments: readonly { amount: string | null; dueDate: string | null }[];
  horizonEnd: string;
}) {
  const paid = sumKnown([input.supplierPaid, input.freightPaid]);
  const net = difference(input.received, paid);
  const allRemaining = sumKnown(input.commitments.map((row) => row.amount));
  const nearTerm = sumKnown(
    input.commitments
      .filter((row) => row.dueDate !== null && row.dueDate <= input.horizonEnd)
      .map((row) => row.amount),
  );
  return {
    paid,
    net,
    allRemaining,
    nearTerm,
    afterNearTerm: difference(net, nearTerm),
    afterAll: difference(net, allRemaining),
    undatedCount: input.commitments.filter(
      (row) =>
        row.dueDate === null &&
        (row.amount === null || !new Decimal(row.amount).isZero()),
    ).length,
  };
}
