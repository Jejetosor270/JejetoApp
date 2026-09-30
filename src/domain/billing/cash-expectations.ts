import Decimal from "decimal.js";
import { billingIsIssued } from "./status";

type Money = { toString(): string };
interface Receipt {
  id: string;
  amount: Money;
}
interface Term {
  id: string;
  currencyCode: string;
  dueDate: Date | null;
  expectedFxRateToReporting: Money | null;
  isCancelled: boolean;
  label: string;
  scheduledAmount: Money;
  receipts: readonly Receipt[];
}
interface BillingCashDocument {
  id: string;
  currencyCode: string;
  documentType: string;
  workflowStatus?: string;
  isCancelled: boolean;
  totalTtc: Money;
  receipts: readonly Receipt[];
  paymentInstallments: readonly Term[];
  matchedInstallment: Term | null;
}

export function uniqueReceiptTotal(receipts: readonly Receipt[]) {
  return [...new Map(receipts.map((receipt) => [receipt.id, receipt])).values()]
    .reduce(
      (sum, receipt) => sum.plus(receipt.amount.toString()),
      new Decimal(0),
    )
    .toFixed(4);
}

/** One expectation owner per matched Quote term, including pre-issue Invoice plans. */
export function billingCashContexts<T extends BillingCashDocument>(
  documents: readonly T[],
) {
  const eligible = documents.filter(
    (document) =>
      !document.isCancelled &&
      !["DRAFT", "CANCELLED"].includes(document.workflowStatus ?? "INVOICED"),
  );
  const matchedOwners = new Map<string, number>();
  for (const document of eligible) {
    if (document.documentType !== "INVOICE" || !document.matchedInstallment)
      continue;
    const id = document.matchedInstallment.id;
    matchedOwners.set(id, (matchedOwners.get(id) ?? 0) + 1);
  }
  return eligible.map((document) => {
    const quote = document.documentType === "QUOTE";
    const originalTerms = document.matchedInstallment
      ? [document.matchedInstallment]
      : document.paymentInstallments;
    const transferred = quote
      ? originalTerms.filter((term) => matchedOwners.has(term.id))
      : [];
    const currencyMismatch = originalTerms.some(
      (term) => term.currencyCode !== document.currencyCode,
    );
    const ambiguousMatch = originalTerms.some(
      (term) => (matchedOwners.get(term.id) ?? 0) > 1,
    );
    const reviewReason = currencyMismatch
      ? "Payment term currency differs from its Billing document. Review the match."
      : ambiguousMatch
        ? "Several active Invoices match the same payment term. Review the matches."
        : null;
    const transferredIds = new Set(transferred.map((term) => term.id));
    const transferredReceiptIds = new Set(
      transferred.flatMap((term) => term.receipts.map((receipt) => receipt.id)),
    );
    const receipts = quote
      ? document.receipts.filter(
          (receipt) => !transferredReceiptIds.has(receipt.id),
        )
      : [
          ...document.receipts,
          ...(!reviewReason
            ? (document.matchedInstallment?.receipts ?? [])
            : []),
        ];
    return {
      document,
      reviewReason,
      kind:
        !quote && billingIsIssued(document)
          ? ("issued" as const)
          : ("planned" as const),
      total: Decimal.max(
        0,
        new Decimal(document.totalTtc.toString()).minus(
          (reviewReason ? [] : transferred).reduce(
            (sum, term) => sum.plus(term.scheduledAmount.toString()),
            new Decimal(0),
          ),
        ),
      ).toFixed(4),
      paid: uniqueReceiptTotal(receipts),
      terms: reviewReason
        ? originalTerms
        : originalTerms.filter((term) => !transferredIds.has(term.id)),
    };
  });
}
