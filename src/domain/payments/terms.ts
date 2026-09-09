import Decimal from "decimal.js";
import { derivePaymentStatus, installmentOutstanding } from "./calculations";

export function overdueTermAmount(input: {
  terms: readonly {
    dueDate: string | null;
    isCancelled: boolean;
    scheduledAmount: string;
    payments: readonly { amount: string }[];
  }[];
  outstanding: string;
  fallbackDate: string | null;
  today: string;
}): string {
  if (!input.terms.length)
    return input.fallbackDate && input.fallbackDate < input.today
      ? input.outstanding
      : "0";
  const overdue = input.terms
    .filter(
      (term) => !term.isCancelled && term.dueDate && term.dueDate < input.today,
    )
    .reduce(
      (sum, term) =>
        sum.plus(
          installmentOutstanding(
            term.scheduledAmount,
            term.payments.reduce(
              (paid, row) => paid.plus(row.amount),
              new Decimal(0),
            ),
          ),
        ),
      new Decimal(0),
    );
  return Decimal.min(overdue, input.outstanding).toString();
}

export function earliestUnpaidTermDate(
  terms: readonly {
    dueDate: string | null;
    isCancelled: boolean;
    scheduledAmount: string;
    payments: readonly { amount: string }[];
  }[],
  fallback: string | null,
): string | null {
  if (!terms.length) return fallback;
  const dates = terms
    .filter(
      (term) =>
        !term.isCancelled &&
        new Decimal(term.scheduledAmount).greaterThan(
          term.payments.reduce(
            (sum, payment) => sum.plus(payment.amount),
            new Decimal(0),
          ),
        ),
    )
    .flatMap((term) => (term.dueDate ? [term.dueDate] : []))
    .sort();
  return dates[0] ?? null;
}

export function paymentTermState(input: {
  amount: string;
  payments: readonly { amount: string }[];
  dueDate: string | null;
  cancelled: boolean;
  today: string;
}) {
  const paid = input.payments.reduce(
    (sum, row) => sum.plus(row.amount),
    new Decimal(0),
  );
  const remaining = input.cancelled
    ? new Decimal(0)
    : installmentOutstanding(input.amount, paid);
  const status = derivePaymentStatus({
    dueDate: input.dueDate,
    isCancelled: input.cancelled,
    paidAmount: paid,
    scheduledAmount: input.amount,
    today: input.today,
  });
  const partial = paid.greaterThan(0) && remaining.greaterThan(0);
  const label =
    status === "DATE_NEEDED"
      ? "Date needed"
      : status === "UPCOMING"
        ? "Unpaid"
        : status === "DUE"
          ? "Due today"
          : status === "PARTIALLY_PAID"
            ? "Partially paid"
            : status === "OVERDUE"
              ? "Overdue"
              : status === "PAID"
                ? "Paid"
                : "Cancelled";
  return {
    paid: paid.toString(),
    remaining: remaining.toString(),
    status,
    label:
      partial && (status === "OVERDUE" || status === "DATE_NEEDED")
        ? `${label} · Partially paid`
        : label,
  };
}

export function paymentAmountToRecord(
  termRemaining: string,
  documentRemaining: string,
): string {
  return Decimal.max(
    0,
    Decimal.min(termRemaining, documentRemaining),
  ).toString();
}
