import Decimal from "decimal.js";
import { creditCashPosition } from "@/domain/credits/calculations";

type Money = { toString(): string };
export interface BillingCredit {
  totalHt: Money;
  vatAmount: Money;
  freightCoverageHt: Money;
  otherCoverageHt: Money;
  isCancelled?: boolean;
  allocations?: readonly {
    orderId: string;
    amountHt: Money;
    freightCoverageHt: Money;
    otherCoverageHt: Money;
  }[];
  refunds?: readonly { amount: Money; isCancelled?: boolean }[];
}
export interface BillingCreditSource {
  totalTtc: Money;
  credits?: readonly BillingCredit[];
  receipts?: readonly { id: string; amount: Money }[];
  matchedInstallment?: {
    receipts: readonly { id: string; amount: Money }[];
  } | null;
}

export function activeBillingCredits(record: {
  credits?: readonly BillingCredit[];
}) {
  return (record.credits ?? []).filter((credit) => !credit.isCancelled);
}

export function billingCreditTotals(record: {
  credits?: readonly BillingCredit[];
}) {
  const credits = activeBillingCredits(record);
  const total = (
    field: "totalHt" | "vatAmount" | "freightCoverageHt" | "otherCoverageHt",
  ) =>
    credits.reduce(
      (sum, credit) => sum.plus(credit[field].toString()),
      new Decimal(0),
    );
  const ht = total("totalHt");
  const vat = total("vatAmount");
  return {
    creditedHt: ht.toFixed(4),
    creditedVat: vat.toFixed(4),
    creditedTtc: ht.plus(vat).toFixed(4),
    creditedFreightHt: total("freightCoverageHt").toFixed(4),
    creditedOtherHt: total("otherCoverageHt").toFixed(4),
    refundedTtc: credits
      .flatMap((credit) => credit.refunds ?? [])
      .filter((refund) => !refund.isCancelled)
      .reduce(
        (sum, refund) => sum.plus(refund.amount.toString()),
        new Decimal(0),
      )
      .toFixed(4),
  };
}

/** Original receipt records and invoice totals remain untouched. */
export function getClientCreditPosition(
  record: BillingCreditSource,
  paidAmounts?: readonly string[],
) {
  const totals = billingCreditTotals(record);
  const paid =
    paidAmounts ??
    [
      ...new Map(
        [
          ...(record.receipts ?? []),
          ...(record.matchedInstallment?.receipts ?? []),
        ].map((receipt) => [receipt.id, receipt]),
      ).values(),
    ].map((receipt) => receipt.amount.toString());
  const paidTtc = paid
    .reduce((sum, amount) => sum.plus(amount), new Decimal(0))
    .toFixed(4);
  return {
    ...totals,
    paidTtc,
    ...creditCashPosition({
      originalTtc: record.totalTtc.toString(),
      creditedTtc: totals.creditedTtc,
      paidTtc,
      refundedTtc: totals.refundedTtc,
    }),
  };
}

export function netBillingAllocation(
  record: { credits?: readonly BillingCredit[] },
  allocation: {
    orderId: string;
    allocatedAmount: Money;
    freightCoverageHt?: Money;
    otherCoverageHt?: Money;
  },
) {
  const reductions = activeBillingCredits(record)
    .flatMap((credit) => credit.allocations ?? [])
    .filter((row) => row.orderId === allocation.orderId);
  const reduced = (
    amount: Money | undefined,
    field: "amountHt" | "freightCoverageHt" | "otherCoverageHt",
  ) =>
    new Decimal(amount?.toString() ?? "0")
      .minus(
        reductions.reduce(
          (sum, row) => sum.plus(row[field].toString()),
          new Decimal(0),
        ),
      )
      .toFixed(4);
  return {
    allocatedAmount: reduced(allocation.allocatedAmount, "amountHt"),
    freightCoverageHt: reduced(
      allocation.freightCoverageHt,
      "freightCoverageHt",
    ),
    otherCoverageHt: reduced(allocation.otherCoverageHt, "otherCoverageHt"),
  };
}
