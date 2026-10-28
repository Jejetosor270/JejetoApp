"use client";
import { financialLabels } from "@/domain/presentation/labels";
import { RelatedRecordTable } from "@/components/layout/related-records";
import { RelatedCashCreate } from "@/components/payments/related-cash-create";
import { BillingReceiptEditor } from "./billing-receipt-editor";
import { BillingTermActions } from "./billing-term-actions";
import { ReceiptTermAssignment } from "./receipt-term-assignment";
import { billingTermPresentation } from "@/domain/billing/term-presentation";
import { businessToday, formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import type { ClientBillingView } from "@/lib/billing/billing";
import type { RelatedTableData } from "@/lib/related-records/types";

export function BillingScheduleManager({
  canEdit,
  document,
}: {
  canEdit: boolean;
  document: ClientBillingView;
}) {
  const today = businessToday();
  const editable = canEdit && !document.matchedInstallmentId;
  const table: RelatedTableData = {
    id: "client-installments",
    title: "Client payment terms",
    description:
      document.documentType === "QUOTE"
        ? "Planned collections. Confirm an Invoice before recording actual payments."
        : "Record full or partial payments directly against each term.",
    columns: [
      "Payment term",
      "Payment due",
      "Amount TTC",
      financialLabels.clientReceived,
      financialLabels.remaining,
      "Status",
      "Basis",
    ],
    numericColumns: [2, 3, 4],
    rows: document.paymentInstallments.map((term) => {
      const state = billingTermPresentation({
        amount: term.scheduledAmount,
        payments: term.receipts,
        dueDate: term.dueDate,
        cancelled: term.isCancelled || document.isCancelled,
        today,
        cappedRemaining: term.creditOutstandingAmount,
        balanceReviewRequired: term.balanceReviewRequired,
        hasCredits: Boolean(document.creditPosition),
      });
      return {
        id: term.id,
        ...(state.partialInvoiceCoverage && state.invoiceCoverage
          ? {
              secondaryText: `${formatMoney(state.invoiceCoverage, term.currencyCode)} ${document.creditPosition ? "Invoice/credit adjustment" : "covered at Invoice level"}`,
            }
          : {}),
        cells: [
          term.label,
          term.dueDate
            ? formatDateOnly(term.dueDate)
            : state.needsDueDate
              ? "Date needed"
              : "Not set",
          formatMoney(term.scheduledAmount, term.currencyCode),
          formatMoney(state.paid, term.currencyCode),
          state.remaining === null
            ? "Review balance"
            : formatMoney(state.remaining, term.currencyCode),
          state.label,
          term.percentageRate
            ? formatRate(term.percentageRate)
            : "Fixed amount",
        ],
      };
    }),
  };
  const history = (receipts: ClientBillingView["receipts"]) => (
    <details>
      <summary className="cursor-pointer text-xs">
        Payment history ({receipts.length})
      </summary>
      {receipts.map((receipt) => (
        <div key={receipt.id} className="mt-2 space-y-2">
          <BillingReceiptEditor
            canEdit={canEdit}
            billingDocumentId={receipt.billingDocumentId ?? document.id}
            currencyCode={document.currencyCode}
            reportingCurrencyCode={document.project.reportingCurrencyCode}
            installments={document.paymentInstallments}
            receipt={receipt}
          />
          {canEdit &&
            !receipt.installmentId &&
            !document.isCancelled &&
            document.documentType === "INVOICE" &&
            !["DRAFT", "TO_BE_INVOICED", "CANCELLED"].includes(
              document.status,
            ) && (
              <ReceiptTermAssignment
                receipt={receipt}
                terms={document.paymentInstallments}
                currencyCode={document.currencyCode}
              />
            )}
        </div>
      ))}
    </details>
  );
  return (
    <div className="space-y-3">
      <p className="bg-muted/60 rounded-md border px-4 py-3 text-sm tabular-nums">
        Total: {formatMoney(document.totalTtc, document.currencyCode)} · Paid:{" "}
        {formatMoney(document.paid, document.currencyCode)} · Remaining:{" "}
        {formatMoney(document.outstanding, document.currencyCode)}
      </p>
      <RelatedRecordTable
        table={table}
        actions={
          editable && (
            <RelatedCashCreate
              scope={{ kind: "billing", id: document.id }}
              kind="client-installment"
            />
          )
        }
        rowActions={Object.fromEntries(
          document.paymentInstallments.map((term) => {
            return [
              term.id,
              <div key={term.id} className="payment-term-actions">
                {canEdit && (
                  <BillingTermActions document={document} term={term} />
                )}
                {history(term.receipts)}
              </div>,
            ];
          }),
        )}
      />
      {document.receipts.some((row) => !row.installmentId) && (
        <div className="rounded border p-3">
          <p className="mb-2 text-sm">Invoice-level receipts</p>
          {history(document.receipts.filter((row) => !row.installmentId))}
        </div>
      )}
    </div>
  );
}
