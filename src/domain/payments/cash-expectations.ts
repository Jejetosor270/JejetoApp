import Decimal from "decimal.js";
import { installmentOutstanding } from "./calculations";

export interface CashExpectationTerm {
  amount: string;
  paid: string;
  due: string | null;
  cancelled: boolean;
}

/** Reporting-only allocation. Stored terms and receipts are never rewritten. */
export function cappedCashTerms<T extends CashExpectationTerm>(
  total: string,
  paid: string,
  terms: readonly T[],
) {
  let remaining = installmentOutstanding(total, paid);
  const capped = [...terms]
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))
    .map((term) => {
      const amount = term.cancelled
        ? new Decimal(0)
        : Decimal.min(
            remaining,
            installmentOutstanding(term.amount, term.paid),
          );
      remaining = remaining.minus(amount);
      return { term, amount };
    });
  return { terms: capped, unscheduled: remaining };
}
