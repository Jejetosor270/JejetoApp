"use client";
import { TermStatusAction } from "@/components/payments/term-status-action";
import { RelatedRecordTable } from "@/components/layout/related-records";
import { RelatedCashCreate } from "@/components/payments/related-cash-create";
import { TermPaymentActions } from "@/components/payments/term-payment-actions";
import { BillingReceiptEditor } from "./billing-receipt-editor";
import { BillingInstallmentEditor } from "./billing-installment-editor";
import { businessToday, formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import {
  paymentTermState,
  paymentAmountToRecord,
} from "@/domain/payments/terms";
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
          editKind: "client-installment",
          editParentId: document.id,
          removal: {
            kind: "assignment",
            relation: "client-installment-billing",
            parentId: document.id,
          },
        } as const)
      : {}),
    columns: [
      "Payment term",
      "Due date",
      "Amount",
      "Paid",
      "Remaining",
      "Status",
    ],
    numericColumns: [2, 3, 4],
    rows: document.paymentInstallments.map((term) => {
      const state = paymentTermState({
        amount: term.scheduledAmount,
        payments: term.receipts,
        dueDate: term.dueDate,
        cancelled: term.isCancelled || document.isCancelled,
        today,
      });
      return {
        id: term.id,
        editValue: term.label,
        cells: [
          term.label,
          term.dueDate ? formatDateOnly(term.dueDate) : "Date needed",
          formatMoney(term.scheduledAmount, term.currencyCode),
          formatMoney(state.paid, term.currencyCode),
          formatMoney(state.remaining, term.currencyCode),
          state.label,
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
        <BillingReceiptEditor
          key={receipt.id}
          canEdit={canEdit}
          billingDocumentId={receipt.billingDocumentId ?? document.id}
          currencyCode={document.currencyCode}
          reportingCurrencyCode={document.project.reportingCurrencyCode}
          installments={document.paymentInstallments}
          receipt={receipt}
        />
      ))}
    </details>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm">
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
            const state = paymentTermState({
              amount: term.scheduledAmount,
              payments: term.receipts,
              dueDate: term.dueDate,
              cancelled: term.isCancelled,
              today,
            });
            return [
              term.id,
              <div key={term.id} className="space-y-2">
                {canEdit &&
                  !document.isCancelled &&
                  !term.isCancelled &&
                  paymentAmountToRecord(
                    state.remaining,
                    document.outstanding,
                  ) !== "0" &&
                  document.documentType === "INVOICE" &&
                  !["DRAFT", "TO_BE_INVOICED"].includes(document.status) && (
                    <TermPaymentActions
                      document={document}
                      termId={term.id}
                      remaining={paymentAmountToRecord(
                        state.remaining,
                        document.outstanding,
                      )}
                    />
                  )}
                {canEdit && (
                  <BillingInstallmentEditor
                    actionOnly
                    actionLabel="Term details"
                    canEdit
                    billingDocumentId={term.billingDocumentId}
                    installment={term}
                  />
                )}
                {canEdit && (
                  <TermStatusAction
                    id={term.id}
                    kind="client"
                    cancelled={term.isCancelled}
                  />
                )}
                {history(term.receipts)}
              </div>,
            ];
          }),
        )}
      />
      {document.receipts.some((row) => !row.installmentId) && (
        <div className="rounded border p-3">
          <p className="mb-2 text-sm">
            Existing payments recorded against the whole document
          </p>
          {history(document.receipts.filter((row) => !row.installmentId))}
        </div>
      )}
    </div>
  );
}
