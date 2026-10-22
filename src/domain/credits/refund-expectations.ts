import Decimal from "decimal.js";

type Money = { toString(): string };
export interface RefundExpectationCredit {
  id?: string;
  reference?: string;
  creditDate?: Date | string;
  totalHt: Money;
  vatAmount: Money;
  isCancelled?: boolean;
  expectedRefundDate?: Date | string | null;
  expectedRefundFxRateToReporting?: Money | null;
  reportingCurrencyCode?: string;
  refunds?: readonly { amount: Money; isCancelled?: boolean }[];
}

export interface RefundExpectation {
  id: string;
  reference: string | null;
  amount: string;
  dueDate: string | null;
  expectedFxRate: string | null;
  reportingCurrencyCode: string | null;
}

const date = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? null);

/**
 * Read-only attribution of the source's actual refundable balance, oldest credit
 * first. Never forecasts every credit's full value when cash paid was lower.
 * Actual refunds keep their own credit links; no settlements are reassigned.
 */
export function refundExpectations(
  credits: readonly RefundExpectationCredit[],
  refundDue: string,
): RefundExpectation[] {
  let remaining = new Decimal(refundDue);
  const result: RefundExpectation[] = [];
  for (const credit of credits
    .filter((row) => !row.isCancelled)
    .toSorted(
      (a, b) =>
        (date(a.creditDate) ?? "").localeCompare(date(b.creditDate) ?? "") ||
        (a.id ?? "").localeCompare(b.id ?? ""),
    )) {
    if (!remaining.gt(0)) break;
    const refunded = (credit.refunds ?? [])
      .filter((row) => !row.isCancelled)
      .reduce((sum, row) => sum.plus(row.amount.toString()), new Decimal(0));
    const available = Decimal.max(
      new Decimal(credit.totalHt.toString())
        .plus(credit.vatAmount.toString())
        .minus(refunded),
      0,
    );
    const amount = Decimal.min(remaining, available);
    if (!amount.gt(0)) continue;
    result.push({
      id: credit.id ?? "legacy",
      reference: credit.reference ?? null,
      amount: amount.toFixed(4),
      dueDate: date(credit.expectedRefundDate),
      expectedFxRate:
        credit.expectedRefundFxRateToReporting?.toString() ?? null,
      reportingCurrencyCode: credit.reportingCurrencyCode ?? null,
    });
    remaining = remaining.minus(amount);
  }
  // A legacy/incomplete projection must not silently lose refundable cash.
  if (remaining.gt(0))
    result.push({
      id: "unplanned",
      reference: null,
      amount: remaining.toFixed(4),
      dueDate: null,
      expectedFxRate: null,
      reportingCurrencyCode: null,
    });
  return result;
}
