import { RecordSectionHeading } from "@/components/layout/record-presentation";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import type { DirectionScheduleSummary } from "@/lib/payments/payments";

import {
  InstallmentActions,
  InstallmentForm,
  PresetForm,
  SettlementCorrection,
  SettlementForm,
} from "./payment-forms";

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "OVERDUE"
      ? "destructive"
      : status === "PAID"
        ? "default"
        : status === "PARTIALLY_PAID" || status === "DUE"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{formatEnumLabel(status)}</Badge>;
}

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
  const supplierSide = direction === "SUPPLIER_PAYMENT";
  const noun = supplierSide ? "Supplier Payments" : "Legacy Client schedule";
  const settledLabel = supplierSide ? "Paid" : "Legacy settlements";
  return (
    <section className={`bg-card rounded-lg border p-4`}>
      <RecordSectionHeading
        title={noun}
        description={
          supplierSide
            ? "Supplier cash out · planned installments and actual payments."
            : "Historical planning only."
        }
        actions={
          summary.foreignCurrencyInstallmentCount > 0 ? (
            <Badge variant="destructive">
              {summary.foreignCurrencyInstallmentCount} foreign-currency item(s)
            </Badge>
          ) : null
        }
      />
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {(
          [
            [
              supplierSide ? "Supplier payable" : "Client receivable",
              summary.baseAmount,
            ],
            [settledLabel, summary.paid],
            ["Total remaining", summary.remainingTotal],
          ] as const
        ).map(([label, amount]) => (
          <div className="border-b py-2" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {formatMoney(amount, summary.baseCurrencyCode)}
            </dd>
          </div>
        ))}
      </dl>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Schedule breakdown
        </summary>
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          {[
            ["Scheduled", summary.scheduled],
            ["Scheduled outstanding", summary.scheduledOutstanding],
            ["Unscheduled", summary.unscheduled],
          ].map(([label, amount]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="financial-figure">
                {formatMoney(amount ?? null, summary.baseCurrencyCode)}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      {summary.unscheduled !== "0" ? (
        <p className="mt-3 text-sm" role="status">
          {formatMoney(summary.unscheduled, summary.baseCurrencyCode)} still
          needs scheduling.
        </p>
      ) : null}
      {summary.overallocated !== "0" ? (
        <p className="text-destructive mt-3 text-xs">
          Over-allocated by{" "}
          {formatMoney(summary.overallocated, summary.baseCurrencyCode)}.
        </p>
      ) : null}
      {!summary.reconciliationComplete ? (
        <p className="text-destructive mt-3 text-xs">
          Reconciliation excludes installments in currencies other than{" "}
          {summary.baseCurrencyCode}; each remains visible below.
        </p>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-right">Scheduled</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2 text-right">{settledLabel}</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actual date</th>
              {canEdit ? <th className="px-3 py-2">Manage</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {summary.installments.map((installment) => (
              <tr key={installment.id}>
                <td className="px-3 py-2 font-medium">{installment.label}</td>
                <td className="financial-figure px-3 py-2 text-right">
                  {formatRate(
                    installment.percentageRate ??
                      installment.impliedPercentageRate,
                  )}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {formatMoney(
                    installment.scheduledAmount,
                    installment.currencyCode,
                  )}
                </td>
                <td className="px-3 py-2">
                  {formatDateOnly(installment.dueDate)}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {formatMoney(
                    installment.paidAmount,
                    installment.currencyCode,
                  )}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {formatMoney(
                    installment.outstandingAmount,
                    installment.currencyCode,
                  )}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={installment.status} />
                </td>
                <td className="px-3 py-2">
                  {formatDateOnly(installment.actualDate)}
                </td>
                {canEdit ? (
                  <td className="px-3 py-2">
                    <EditorDrawer title="Manage">
                      <div className="mt-3 space-y-3">
                        <InstallmentActions installment={installment} />
                        <InstallmentForm
                          baseAmount={summary.baseAmount}
                          currencies={currencies}
                          defaultCurrencyCode={summary.baseCurrencyCode}
                          direction={direction}
                          installment={installment}
                          orderId={orderId}
                          reportingCurrencyCode={reportingCurrencyCode}
                        />
                        {!installment.isCancelled &&
                        installment.outstandingAmount !== "0" ? (
                          <SettlementForm
                            installment={installment}
                            today={today}
                          />
                        ) : null}
                        {installment.settlements.length > 0 ? (
                          <div className="space-y-2 rounded-lg border p-3">
                            <p className="text-xs font-semibold">
                              Recorded settlements
                            </p>
                            {installment.settlements.map((settlement) => (
                              <div
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                                key={settlement.id}
                              >
                                <span>
                                  {formatDateOnly(settlement.settledAt)} ·{" "}
                                  {formatMoney(
                                    settlement.amount,
                                    installment.currencyCode,
                                  )}
                                  {settlement.reference
                                    ? ` · ${settlement.reference}`
                                    : ""}
                                </span>
                                <SettlementCorrection settlement={settlement} />
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </EditorDrawer>
                  </td>
                ) : null}
              </tr>
            ))}
            {summary.installments.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground px-3 py-8 text-center"
                  colSpan={canEdit ? 9 : 8}
                >
                  No {supplierSide ? "supplier payments" : "client receipts"}{" "}
                  scheduled.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <EditorDrawer title="Add installment">
            <div className="mt-3">
              <InstallmentForm
                baseAmount={summary.baseAmount}
                currencies={currencies}
                defaultCurrencyCode={summary.baseCurrencyCode}
                direction={direction}
                orderId={orderId}
                reportingCurrencyCode={reportingCurrencyCode}
              />
            </div>
          </EditorDrawer>
          <EditorDrawer title="Use schedule preset">
            <div className="mt-3">
              <PresetForm direction={direction} orderId={orderId} />
            </div>
          </EditorDrawer>
        </div>
      ) : null}
    </section>
  );
}
