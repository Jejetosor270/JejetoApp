import { installmentOutstanding } from "@/domain/payments/calculations";
import Decimal from "decimal.js";
import {
  refundDueIssue,
  type AttentionDocument,
  type AttentionIssue,
} from "./attention";

/** Original-currency balances only. Archived obligations never join active cash forecasts. */
export function archivedBalanceIssues(
  documents: readonly AttentionDocument[],
): AttentionIssue[] {
  return documents.flatMap((document) => {
    if (!document.issued) return [];
    const refund = refundDueIssue(document);
    if (refund)
      return [
        {
          ...refund,
          key: `archived-${refund.key}`,
          detail: `${refund.detail} This Project is archived and excluded from active forecasts.`,
        },
      ];
    const activeTerms = document.terms.filter((term) => !term.cancelled);
    const inconsistentTerms = activeTerms.some(
      (term) =>
        term.currency !== document.currency ||
        new Decimal(term.paid).greaterThan(term.scheduled),
    );
    const uncertain =
      Boolean(document.reviewReason) ||
      inconsistentTerms ||
      document.totalTtc === null ||
      (!document.creditAdjusted &&
        new Decimal(document.paid).greaterThan(document.totalTtc));
    const remaining =
      uncertain || document.totalTtc === null
        ? null
        : installmentOutstanding(document.totalTtc, document.paid);
    // Direct receipts can settle a document without being assigned to its terms.
    // The authoritative document balance, not the uncapped schedule, decides closure.
    if (!uncertain && !remaining?.greaterThan(0)) return [];
    const incomplete =
      uncertain ||
      document.fxMissing ||
      document.actualFxMissing ||
      activeTerms.some((term) => term.actualFxMissing);
    return [
      {
        key: `archived-${document.side}:${document.id}`,
        priority: incomplete ? ("Incomplete" as const) : ("Review" as const),
        title: "Archived Project has outstanding financial records",
        detail:
          document.reviewReason ??
          (inconsistentTerms
            ? "Payment terms have inconsistent currencies or settlement amounts. Review the source records before treating this Project as financially closed."
            : incomplete
              ? "Review this archived Project's open balance and missing FX. It is not included in active-Project forecasts."
              : "Review the remaining balance before considering this Project financially closed. Excluded from active-Project forecasts."),
        projectId: document.projectId,
        projectName: document.projectName,
        reference: document.reference,
        href: document.href,
        amount: remaining?.toFixed(4) ?? null,
        currency: document.currency,
        basis: "TTC" as const,
        date: document.dueDate,
      },
    ];
  });
}
