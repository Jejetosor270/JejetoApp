import Decimal from "decimal.js";

import { derivePaymentStatus } from "@/domain/payments/calculations";

export interface ClientBillingAmounts {
  outstanding: string;
  paid: string;
  status:
    | "PLANNED"
    | "QUOTED"
    | "INVOICED"
    | "PARTIALLY_PAID"
    | "PAID"
    | "OVERDUE"
    | "CANCELLED";
}

export function calculateClientBillingAmounts(input: {
  documentType: "QUOTE" | "INVOICE";
  dueDate: string | null;
  isCancelled: boolean;
  paidAmounts: readonly string[];
  today: string;
  totalTtc: string;
}): ClientBillingAmounts {
  const total = new Decimal(input.totalTtc);
  const paid = input.paidAmounts.reduce(
    (sum, amount) => sum.plus(amount),
    new Decimal(0),
  );
  const outstanding = Decimal.max(total.minus(paid), 0);
  if (input.isCancelled) {
    return {
      outstanding: "0.0000",
      paid: paid.toFixed(4),
      status: "CANCELLED",
    };
  }
  const derived = derivePaymentStatus({
    dueDate: input.dueDate ?? "9999-12-31",
    isCancelled: false,
    paidAmount: paid,
    scheduledAmount: total,
    today: input.today,
  });
  const status =
    derived === "PAID"
      ? "PAID"
      : derived === "PARTIALLY_PAID"
        ? "PARTIALLY_PAID"
        : derived === "OVERDUE"
          ? "OVERDUE"
          : input.documentType === "INVOICE"
            ? "INVOICED"
            : "QUOTED";
  return {
    outstanding: outstanding.toFixed(4),
    paid: paid.toFixed(4),
    status,
  };
}

export function allocationReconciliation(
  totalHt: string,
  allocations: readonly string[],
) {
  const total = new Decimal(totalHt);
  const allocated = allocations.reduce(
    (sum, amount) => sum.plus(amount),
    new Decimal(0),
  );
  return {
    allocated: allocated.toFixed(4),
    overallocated: Decimal.max(allocated.minus(total), 0).toFixed(4),
    remaining: Decimal.max(total.minus(allocated), 0).toFixed(4),
  };
}

export function amountFromPercentage(
  baseAmount: string,
  humanPercentage: string,
): string | null {
  const normalized = humanPercentage.trim().replace(/%$/, "").replace(",", ".");
  if (!normalized) return null;
  try {
    const percentage = new Decimal(normalized);
    if (!percentage.isFinite()) return null;
    return new Decimal(baseAmount)
      .times(percentage.dividedBy(100))
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
      .toFixed(4);
  } catch {
    return null;
  }
}

export function percentageFromAmount(
  baseAmount: string,
  amount: string,
): string | null {
  try {
    const base = new Decimal(baseAmount || 0);
    if (base.isZero()) return null;
    const value = new Decimal(amount || 0);
    if (!value.isFinite()) return null;
    return value
      .dividedBy(base)
      .times(100)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
      .toString();
  } catch {
    return null;
  }
}

export function addAllocationAmount(amount: string, additional: string) {
  try {
    return new Decimal(amount || 0).plus(additional || 0).toFixed(4);
  } catch {
    return amount;
  }
}

export function scheduleReconciliation(
  totalTtc: string,
  scheduledAmounts: readonly string[],
) {
  return allocationReconciliation(totalTtc, scheduledAmounts);
}

export function orderBillingDifference(
  plannedSellHt: string | null,
  invoicedAllocatedHt: string | null,
) {
  if (plannedSellHt === null || invoicedAllocatedHt === null) return null;
  const difference = new Decimal(plannedSellHt).minus(invoicedAllocatedHt);
  return {
    amount: difference.abs().toFixed(4),
    state: difference.isNegative()
      ? ("OVERBILLED" as const)
      : ("UNBILLED" as const),
  };
}
