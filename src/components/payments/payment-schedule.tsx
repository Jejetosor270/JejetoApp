import { TermStatusAction } from "./term-status-action";
import { RelatedRecordTable } from "@/components/layout/related-records";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { paymentTermState } from "@/domain/payments/terms";
import type { DirectionScheduleSummary } from "@/lib/payments/payments";
import type { RelatedTableData } from "@/lib/related-records/types";
import {
  InstallmentForm,
  PresetForm,
  SettlementForm,
  SettlementCorrection,
} from "./payment-forms";
import { TermPaymentActions } from "./term-payment-actions";

export function PaymentSchedule({
  canEdit,
  currencies,
  direction,
  orderId,
  reportingCurrencyCode,
  summary,
  today,
}: {
  canEdit: boolean;
  currencies: readonly { code: string }[];
  direction: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT";
  orderId: string;
  reportingCurrencyCode: string;
  summary: DirectionScheduleSummary;
  today: string;
}) {
  const supplier = direction === "SUPPLIER_PAYMENT";
  const table: RelatedTableData = {
    id: "supplier-installments",
    title: supplier ? "Supplier payment terms" : "Legacy Client planning terms",
    description: supplier
      ? "Edit terms here. Record full or partial payments against each term."
      : "Historical planning only.",
    ...(canEdit
      ? ({
          editKind: "supplier-installment",
          editParentId: orderId,
          removal: {
            kind: "assignment",
            relation: "supplier-installment-order",
            parentId: orderId,
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
    rows: summary.installments.map((term) => {
      const state = paymentTermState({
        amount: term.scheduledAmount,
        payments: term.settlements,
        dueDate: term.dueDate,
        cancelled: term.isCancelled,
        today,
      });
      return {
        id: term.id,
        editValue: term.label,
        cells: [
          term.percentageRate
            ? term.label + " · " + formatRate(term.percentageRate)
            : term.label,
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
            value: term.scheduledAmount,
            currency: term.currencyCode,
          },
        ],
      };
    }),
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Payable: {formatMoney(summary.baseAmount, summary.baseCurrencyCode)} ·
        Paid: {formatMoney(summary.paid, summary.baseCurrencyCode)} · Remaining:{" "}
        {formatMoney(summary.remainingTotal, summary.baseCurrencyCode)}
      </p>
      {summary.unscheduled !== "0" && (
        <p className="text-sm">
          Without payment terms:{" "}
          {formatMoney(summary.unscheduled, summary.baseCurrencyCode)}
        </p>
      )}
      {summary.overallocated !== "0" && (
        <p className="text-destructive text-sm" role="alert">
          Payment terms exceed the payable by{" "}
          {formatMoney(summary.overallocated, summary.baseCurrencyCode)}. Review
          the amounts.
        </p>
      )}
      {!summary.reconciliationComplete && (
        <p role="alert">
          Currency reconciliation is incomplete. Review the individual terms.
        </p>
      )}
      <RelatedRecordTable
        table={table}
        actions={
          canEdit && (
            <div className="flex gap-2">
              <EditorDrawer title="Add payment term">
                <InstallmentForm
                  baseAmount={summary.baseAmount}
                  currencies={currencies}
                  defaultCurrencyCode={summary.baseCurrencyCode}
                  direction={direction}
                  orderId={orderId}
                  reportingCurrencyCode={reportingCurrencyCode}
                />
              </EditorDrawer>
              {!summary.installments.some((term) => !term.isCancelled) && (
                <EditorDrawer title="Use payment terms preset">
                  <PresetForm direction={direction} orderId={orderId} />
                </EditorDrawer>
              )}
            </div>
          )
        }
        rowActions={Object.fromEntries(
          summary.installments.map((term) => [
            term.id,
            <div key={term.id} className="space-y-2">
              {canEdit &&
                !term.isCancelled &&
                term.outstandingAmount !== "0" && (
                  <TermPaymentActions supplier={term} />
                )}
              {canEdit && (
                <EditorDrawer title="Term details">
                  <InstallmentForm
                    baseAmount={summary.baseAmount}
                    currencies={currencies}
                    defaultCurrencyCode={term.currencyCode}
                    direction={direction}
                    orderId={orderId}
                    reportingCurrencyCode={reportingCurrencyCode}
                    installment={term}
                  />
                </EditorDrawer>
              )}
              {canEdit && (
                <TermStatusAction
                  id={term.id}
                  kind="supplier"
                  cancelled={term.isCancelled}
                />
              )}
              <details>
                <summary className="cursor-pointer text-xs">
                  Payment history ({term.settlements.length})
                </summary>
                {term.settlements.map((payment) => (
                  <div
                    className="my-2 space-y-2 rounded border p-2"
                    key={payment.id}
                  >
                    <p>
                      {formatDateOnly(payment.settledAt)} ·{" "}
                      {formatMoney(payment.amount, term.currencyCode)} ·{" "}
                      {payment.reference}
                    </p>
                    {canEdit && (
                      <>
                        <EditorDrawer title="Correct payment">
                          <SettlementForm
                            installment={term}
                            settlement={payment}
                            today={today}
                          />
                        </EditorDrawer>
                        <SettlementCorrection settlement={payment} />
                      </>
                    )}
                  </div>
                ))}
              </details>
            </div>,
          ]),
        )}
      />
    </div>
  );
}
