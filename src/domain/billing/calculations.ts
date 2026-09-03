import Decimal from "decimal.js";

import { derivePaymentStatus } from "@/domain/payments/calculations";
import { normalizeDecimalInput } from "@/domain/validation/numeric";
import { humanPercentageToFraction } from "@/domain/validation/percentage";

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
  const normalized = humanPercentageToFraction(humanPercentage, {
    maximumPercent: "100",
  });
  const base = normalizeDecimalInput(baseAmount, {
    allowNegative: false,
    maximumDecimalPlaces: 4,
  });
  if (!normalized || !base) return null;
  try {
    return new Decimal(base)
      .times(normalized)
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
    const normalizedBase = normalizeDecimalInput(baseAmount, {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    });
    const normalizedAmount = normalizeDecimalInput(amount, {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    });
    if (!normalizedBase || normalizedAmount === null || normalizedAmount === "")
      return null;
    const base = new Decimal(normalizedBase);
    if (base.isZero()) return null;
    const value = new Decimal(normalizedAmount);
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

export function fractionFromAmount(
  baseAmount: string,
  amount: string,
): string | null {
  try {
    const base = new Decimal(baseAmount);
    const value = new Decimal(amount);
    if (!base.isFinite() || !value.isFinite() || base.isZero()) return null;
    return value.dividedBy(base).toString();
  } catch {
    return null;
  }
}

export function orderSellingBasisInBillingCurrency(input: {
  billingCurrencyCode: string;
  billingFxRateToReporting: string | null;
  orderSellingReporting: string | null;
  reportingCurrencyCode: string;
}): string | null {
  if (input.orderSellingReporting === null) return null;
  const selling = new Decimal(input.orderSellingReporting);
  if (input.billingCurrencyCode === input.reportingCurrencyCode)
    return selling.toFixed(4);
  if (input.billingFxRateToReporting === null) return null;
  const rate = new Decimal(input.billingFxRateToReporting);
  if (!rate.isPositive()) return null;
  return selling
    .dividedBy(rate)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
    .toFixed(4);
}

export function orderBillingCoverage(
  orderSellingHt: string | null,
  allocatedHt: string | null,
) {
  if (orderSellingHt === null || allocatedHt === null) return null;
  const selling = new Decimal(orderSellingHt);
  const allocated = new Decimal(allocatedHt);
  const remaining = Decimal.max(selling.minus(allocated), 0);
  const overallocated = Decimal.max(allocated.minus(selling), 0);
  return {
    allocated: allocated.toFixed(4),
    coverageRate: selling.isZero()
      ? null
      : allocated.dividedBy(selling).toString(),
    overallocated: overallocated.toFixed(4),
    remaining: remaining.toFixed(4),
    remainingRate: selling.isZero()
      ? null
      : remaining.dividedBy(selling).toString(),
  };
}

export function addAllocationAmount(amount: string, additional: string) {
  try {
    const first = normalizeDecimalInput(amount, {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    });
    const second = normalizeDecimalInput(additional, {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    });
    if (first === null || second === null) return amount;
    return new Decimal(first || 0).plus(second || 0).toFixed(4);
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
