"use client";
import { financialLabels } from "@/domain/presentation/labels";
import { TermStatusAction } from "@/components/payments/term-status-action";
import { RelatedRecordTable } from "@/components/layout/related-records";
import { RelatedCashCreate } from "@/components/payments/related-cash-create";
import { TermPaymentActions } from "@/components/payments/term-payment-actions";
import { BillingReceiptEditor } from "./billing-receipt-editor";
import { BillingTermForm } from "./billing-term-form";
import { ReceiptTermAssignment } from "./receipt-term-assignment";
import { billingTermPresentation } from "@/domain/billing/term-presentation";
import { businessToday, formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { paymentAmountToRecord } from "@/domain/payments/terms";
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
    ...(editable
      ? ({
          removal: {
            kind: "assignment",
            relation: "client-installment-billing",
            parentId: document.id,
          },
        } as const)
      : {}),
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
        editValue: term.label,
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
        editFields: [
          { column: 1, name: "date", type: "date", value: term.dueDate ?? "" },
          {
            column: 2,
            name: "amount",
            type: "money",
            currency: term.currencyCode,
            value: term.scheduledAmount,
          },
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
            const remaining = paymentAmountToRecord(
              state.remaining ?? "0",
              document.outstanding,
            );
            return [
              term.id,
              <div key={term.id} className="payment-term-actions">
                {canEdit && (
                  <TermPaymentActions
                    document={document}
                    termId={term.id}
                    remaining={remaining}
                    editor={
                      <BillingTermForm document={document} installment={term} />
                    }
                    canPay={
                      !document.isCancelled &&
                      !term.isCancelled &&
                      remaining !== "0" &&
                      document.documentType === "INVOICE" &&
                      !["DRAFT", "TO_BE_INVOICED", "CANCELLED"].includes(
                        document.status,
                      )
                    }
                  >
                    {!document.isCancelled &&
                      (term.isCancelled || remaining !== "0") && (
                        <TermStatusAction
                          id={term.id}
                          kind="client"
                          cancelled={term.isCancelled}
                        />
                      )}
                  </TermPaymentActions>
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
