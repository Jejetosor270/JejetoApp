import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
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
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
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
  const noun = supplierSide ? "Supplier Payments" : "Client Receipts";
  const settledLabel = supplierSide ? "Paid" : "Received";
  return (
    <section
      className={`bg-card rounded-lg border border-l-4 p-4 ${supplierSide ? "border-l-destructive" : "border-l-positive"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {supplierSide ? "Cash out" : "Cash in"}
          </p>
          <h2 className="mt-1 text-base font-semibold">{noun}</h2>
        </div>
        {summary.foreignCurrencyInstallmentCount > 0 ? (
          <Badge variant="destructive">
            {summary.foreignCurrencyInstallmentCount} foreign-currency item(s)
          </Badge>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {(
          [
            [
              supplierSide ? "Supplier payable" : "Client receivable",
              summary.baseAmount,
            ],
            ["Scheduled", summary.scheduled],
            [settledLabel, summary.paid],
            ["Scheduled outstanding", summary.scheduledOutstanding],
            ["Unscheduled", summary.unscheduled],
            ["Total remaining", summary.remainingTotal],
          ] as const
        ).map(([label, amount]) => (
          <div className="bg-muted/30 rounded-md border p-3" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {formatMoney(amount, summary.baseCurrencyCode)}
            </dd>
          </div>
        ))}
      </dl>
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
                    <details>
                      <summary className="text-primary cursor-pointer text-xs font-medium">
                        Manage
                      </summary>
                      <div className="mt-3 w-[min(78vw,58rem)] space-y-3">
                        <InstallmentActions installment={installment} />
                        <InstallmentForm
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
                    </details>
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
          <details>
            <summary className="border-input inline-flex h-8 cursor-pointer list-none items-center rounded-lg border px-2.5 text-sm font-medium">
              Add installment
            </summary>
            <div className="mt-3">
              <InstallmentForm
                currencies={currencies}
                defaultCurrencyCode={summary.baseCurrencyCode}
                direction={direction}
                orderId={orderId}
                reportingCurrencyCode={reportingCurrencyCode}
              />
            </div>
          </details>
          <details>
            <summary className="border-input inline-flex h-8 cursor-pointer list-none items-center rounded-lg border px-2.5 text-sm font-medium">
              Use schedule preset
            </summary>
            <div className="mt-3">
              <PresetForm direction={direction} orderId={orderId} />
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
