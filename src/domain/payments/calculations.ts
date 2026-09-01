import Decimal from "decimal.js";

import type { FinancialDecimal } from "@/domain/finance/calculations";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

export type DerivedPaymentStatus =
  "UPCOMING" | "DUE" | "OVERDUE" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export type VendorPaymentStatus =
  "NOT_PAID" | "DEPOSIT_PAID" | "PARTIALLY_PAID" | "PAID_IN_FULL";

export interface ReconciliationSummary {
  overallocated: Decimal;
  paid: Decimal;
  remainingTotal: Decimal;
  scheduled: Decimal;
  scheduledOutstanding: Decimal;
  unscheduled: Decimal;
}

export interface ReportingCashSummary {
  incompleteAmountCount: number;
  outstanding: Decimal;
  paid: Decimal;
  scheduled: Decimal;
}

function nonNegative(value: FinancialDecimal, label: string): Decimal {
  const amount = new Decimal(value);
  if (amount.isNegative()) throw new RangeError(`${label} cannot be negative.`);
  return amount;
}

export function scheduledAmountFromPercentage(
  baseAmount: FinancialDecimal,
  percentageRate: FinancialDecimal,
): Decimal {
  const base = nonNegative(baseAmount, "Payment base");
  const rate = new Decimal(percentageRate);
  if (rate.lessThanOrEqualTo(ZERO) || rate.greaterThan(ONE)) {
    throw new RangeError(
      "Installment percentage must be above 0 and at most 1.",
    );
  }
  return base.times(rate).toDecimalPlaces(4);
}

export function impliedPercentage(
  scheduledAmount: FinancialDecimal,
  baseAmount: FinancialDecimal,
): Decimal | null {
  const scheduled = nonNegative(scheduledAmount, "Scheduled amount");
  const base = nonNegative(baseAmount, "Payment base");
  return base.isZero() ? null : scheduled.dividedBy(base);
}

export function installmentOutstanding(
  scheduledAmount: FinancialDecimal,
  paidAmount: FinancialDecimal,
): Decimal {
  const scheduled = nonNegative(scheduledAmount, "Scheduled amount");
  const paid = nonNegative(paidAmount, "Paid amount");
  if (paid.greaterThan(scheduled)) {
    throw new RangeError("Paid amount cannot exceed the scheduled amount.");
  }
  return scheduled.minus(paid);
}

export function derivePaymentStatus(input: {
  dueDate: string;
  isCancelled: boolean;
  paidAmount: FinancialDecimal;
  scheduledAmount: FinancialDecimal;
  today: string;
}): DerivedPaymentStatus {
  if (input.isCancelled) return "CANCELLED";
  const paid = nonNegative(input.paidAmount, "Paid amount");
  const scheduled = nonNegative(input.scheduledAmount, "Scheduled amount");
  if (paid.greaterThanOrEqualTo(scheduled)) return "PAID";
  if (input.dueDate < input.today) return "OVERDUE";
  if (paid.greaterThan(ZERO)) return "PARTIALLY_PAID";
  return input.dueDate === input.today ? "DUE" : "UPCOMING";
}

export function deriveVendorPaymentStatus(
  installments: readonly {
    isCancelled: boolean;
    scheduledAmount: FinancialDecimal;
    sequence: number;
    settlements: readonly { amount: FinancialDecimal }[];
  }[],
): VendorPaymentStatus {
  const active = installments
    .filter((installment) => !installment.isCancelled)
    .toSorted((first, second) => first.sequence - second.sequence);
  const scheduled = active.reduce(
    (sum, installment) =>
      sum.plus(nonNegative(installment.scheduledAmount, "Scheduled amount")),
    ZERO,
  );
  const paidByInstallment = active.map((installment) =>
    installment.settlements.reduce(
      (sum, settlement) =>
        sum.plus(nonNegative(settlement.amount, "Settlement amount")),
      ZERO,
    ),
  );
  const paid = paidByInstallment.reduce(
    (sum, amount) => sum.plus(amount),
    ZERO,
  );
  if (paid.isZero() || scheduled.isZero()) return "NOT_PAID";
  if (paid.greaterThanOrEqualTo(scheduled)) return "PAID_IN_FULL";
  const first = active[0];
  if (
    first &&
    paidByInstallment[0]?.greaterThanOrEqualTo(first.scheduledAmount)
  )
    return "DEPOSIT_PAID";
  return "PARTIALLY_PAID";
}

export function reconcileSchedule(
  baseAmount: FinancialDecimal,
  installments: readonly {
    paidAmount: FinancialDecimal;
    scheduledAmount: FinancialDecimal;
  }[],
): ReconciliationSummary {
  const base = nonNegative(baseAmount, "Payment base");
  const scheduled = installments.reduce(
    (total, item) =>
      total.plus(nonNegative(item.scheduledAmount, "Scheduled amount")),
    ZERO,
  );
  const paid = installments.reduce(
    (total, item) => total.plus(nonNegative(item.paidAmount, "Paid amount")),
    ZERO,
  );
  if (paid.greaterThan(scheduled)) {
    throw new RangeError("Paid total cannot exceed the scheduled total.");
  }
  return {
    overallocated: Decimal.max(scheduled.minus(base), ZERO),
    paid,
    remainingTotal: Decimal.max(base.minus(paid), ZERO),
    scheduled,
    scheduledOutstanding: scheduled.minus(paid),
    unscheduled: Decimal.max(base.minus(scheduled), ZERO),
  };
}

const SUPPLIER_PAYABLE_VAT_TREATMENTS = new Set(["DOMESTIC", "CUSTOM"]);

export function supplierPayableBase(input: {
  inputVatAmount?: FinancialDecimal | null | undefined;
  inputVatTreatment?: string | null | undefined;
  supplierPurchase: FinancialDecimal;
}): Decimal {
  const purchase = nonNegative(input.supplierPurchase, "Supplier purchase");
  const payableVat =
    input.inputVatAmount &&
    input.inputVatTreatment &&
    SUPPLIER_PAYABLE_VAT_TREATMENTS.has(input.inputVatTreatment)
      ? nonNegative(input.inputVatAmount, "Supplier invoice VAT")
      : ZERO;
  return purchase.plus(payableVat);
}

export function clientReceivableBase(input: {
  outputVatAmount?: FinancialDecimal | null | undefined;
  sellingRevenue: FinancialDecimal;
}): Decimal {
  return nonNegative(input.sellingRevenue, "Selling revenue").plus(
    input.outputVatAmount
      ? nonNegative(input.outputVatAmount, "Output VAT")
      : ZERO,
  );
}

export function convertPaymentAmount(input: {
  amount: FinancialDecimal;
  currencyCode: string;
  fxRateToReporting?: FinancialDecimal | null | undefined;
  reportingCurrencyCode: string;
}): Decimal | null {
  const amount = nonNegative(input.amount, "Payment amount");
  if (amount.isZero()) return ZERO;
  if (input.currencyCode === input.reportingCurrencyCode) return amount;
  if (input.fxRateToReporting === null || input.fxRateToReporting === undefined)
    return null;
  const rate = new Decimal(input.fxRateToReporting);
  if (rate.lessThanOrEqualTo(ZERO))
    throw new RangeError("FX rate must be positive.");
  return amount.times(rate);
}

export function aggregateReportingCash(input: {
  installments: readonly {
    currencyCode: string;
    expectedFxRate?: FinancialDecimal | null | undefined;
    isCancelled: boolean;
    outstandingAmount: FinancialDecimal;
    scheduledAmount: FinancialDecimal;
    settlements: readonly {
      amount: FinancialDecimal;
      actualFxRate?: FinancialDecimal | null | undefined;
    }[];
  }[];
  reportingCurrencyCode: string;
}): ReportingCashSummary {
  let scheduled = new Decimal(0);
  let paid = new Decimal(0);
  let outstanding = new Decimal(0);
  let incompleteAmountCount = 0;
  for (const installment of input.installments) {
    if (!installment.isCancelled) {
      const convertedScheduled = convertPaymentAmount({
        amount: installment.scheduledAmount,
        currencyCode: installment.currencyCode,
        fxRateToReporting: installment.expectedFxRate,
        reportingCurrencyCode: input.reportingCurrencyCode,
      });
      const convertedOutstanding = convertPaymentAmount({
        amount: installment.outstandingAmount,
        currencyCode: installment.currencyCode,
        fxRateToReporting: installment.expectedFxRate,
        reportingCurrencyCode: input.reportingCurrencyCode,
      });
      if (convertedScheduled === null || convertedOutstanding === null) {
        incompleteAmountCount += 1;
      } else {
        scheduled = scheduled.plus(convertedScheduled);
        outstanding = outstanding.plus(convertedOutstanding);
      }
    }
    for (const settlement of installment.settlements) {
      const convertedPaid = convertPaymentAmount({
        amount: settlement.amount,
        currencyCode: installment.currencyCode,
        fxRateToReporting: settlement.actualFxRate,
        reportingCurrencyCode: input.reportingCurrencyCode,
      });
      if (convertedPaid === null) incompleteAmountCount += 1;
      else paid = paid.plus(convertedPaid);
    }
  }
  return { incompleteAmountCount, outstanding, paid, scheduled };
}
