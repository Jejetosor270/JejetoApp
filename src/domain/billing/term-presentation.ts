import Decimal from "decimal.js";
import { paymentTermState } from "@/domain/payments/terms";

/** A reporting cap never invents a receipt against an individual term. */
export function billingTermPresentation(
  input: Parameters<typeof paymentTermState>[0] & {
    cappedRemaining?: string | undefined;
    balanceReviewRequired?: boolean | undefined;
    hasCredits: boolean;
  },
) {
  const actual = paymentTermState(input);
  if (input.balanceReviewRequired && !input.cancelled)
    return {
      ...actual,
      remaining: null,
      invoiceCoverage: null,
      partialInvoiceCoverage: false,
      needsDueDate: false,
      label: "Review balance",
    };
  const remaining = input.cancelled
    ? "0"
    : (input.cappedRemaining ?? actual.remaining);
  const coveredElsewhere =
    !input.cancelled &&
    new Decimal(remaining).isZero() &&
    new Decimal(actual.remaining).greaterThan(0);
  const invoiceCoverage = input.cancelled
    ? new Decimal(0)
    : Decimal.max(0, new Decimal(actual.remaining).minus(remaining));
  return {
    ...actual,
    remaining,
    invoiceCoverage: invoiceCoverage.toString(),
    partialInvoiceCoverage:
      invoiceCoverage.gt(0) && new Decimal(remaining).gt(0),
    needsDueDate:
      !input.dueDate && !input.cancelled && new Decimal(remaining).gt(0),
    label: coveredElsewhere
      ? input.hasCredits
        ? "No balance due"
        : "Covered at invoice level"
      : actual.label,
  };
}

/** Choices only; the mutation rechecks capacity and ownership transactionally. */
export function receiptTermChoices<
  T extends {
    id: string;
    isCancelled: boolean;
    currencyCode: string;
    scheduledAmount: string;
    balanceReviewRequired?: boolean;
    receipts: readonly { id: string; amount: string }[];
  },
>(
  receipt: { id: string; amount: string },
  currency: string,
  terms: readonly T[],
) {
  return terms
    .filter(
      (term) =>
        !term.isCancelled &&
        !term.balanceReviewRequired &&
        term.currencyCode === currency,
    )
    .map((term) => {
      const paid = term.receipts.reduce(
        (sum, row) => (row.id === receipt.id ? sum : sum.plus(row.amount)),
        new Decimal(0),
      );
      const available = Decimal.max(
        0,
        new Decimal(term.scheduledAmount).minus(paid),
      );
      return {
        term,
        available: available.toString(),
        fits: available.greaterThanOrEqualTo(receipt.amount),
      };
    });
}
