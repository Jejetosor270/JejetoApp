import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { PaymentDirection } from "@/generated/prisma/client";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import type {
  getActualCashReport,
  getGlobalFreightReport,
  getGlobalVatReport,
} from "@/lib/reporting/global-reports";

function CompletenessNotice({
  complete,
  excludedProjectCount,
}: {
  complete: boolean;
  excludedProjectCount: number;
}) {
  return complete ? null : (
    <p className="border-warning/30 bg-warning-muted border-b px-4 py-3 text-xs">
      Company totals are incomplete. Missing transaction FX remains explicit;
      {excludedProjectCount > 0
        ? ` ${excludedProjectCount} non-EUR Project(s) are excluded because no company FX model exists.`
        : " complete comparable values are required."}
    </p>
  );
}

export function ActualCashReport({
  report,
}: {
  report: Awaited<ReturnType<typeof getActualCashReport>>;
}) {
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <header className="grid gap-3 border-b p-4 sm:grid-cols-3">
        {[
          ["Total Cash In", report.totals.cashIn],
          ["Total Cash Out", report.totals.cashOut],
          ["Net Cash Flow", report.totals.net],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="financial-figure mt-1 text-lg font-semibold">
              {formatMoney(value ?? null, report.companyCurrencyCode)}
            </p>
          </div>
        ))}
      </header>
      <CompletenessNotice
        complete={report.complete}
        excludedProjectCount={report.excludedProjectCount}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[76rem] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Billing / Supplier Order</th>
              <th className="px-3 py-2">Transaction reference</th>
              <th className="px-3 py-2 text-right">Original amount</th>
              <th className="px-3 py-2 text-right">Project reporting amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((row) => {
              const cashIn = row.direction === PaymentDirection.CLIENT_RECEIPT;
              return (
                <tr key={`${row.direction}-${row.id}`}>
                  <td className="px-3 py-2">
                    <Badge variant={cashIn ? "default" : "destructive"}>
                      {cashIn ? "CASH IN" : "CASH OUT"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{formatDateOnly(row.date)}</td>
                  <td className="px-3 py-2">
                    <Link
                      className="hover:underline"
                      href={`/projects/${row.projectId}`}
                    >
                      {row.projectName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.partyName}</td>
                  <td className="px-3 py-2">
                    <Link
                      className="font-mono hover:underline"
                      href={
                        cashIn
                          ? `/billing/${row.billingOrOrderId}`
                          : `/orders/${row.billingOrOrderId}#payments`
                      }
                    >
                      {row.billingOrOrderReference}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.reference ?? "—"}</td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(row.amount, row.currencyCode)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {row.projectReportingAmount === null
                      ? "Incomplete FX"
                      : formatMoney(
                          row.projectReportingAmount,
                          row.projectReportingCurrencyCode,
                        )}
                  </td>
                </tr>
              );
            })}
            {report.rows.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground px-3 py-12 text-center text-sm"
                  colSpan={8}
                >
                  No actual receipts or supplier settlements match these
                  filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function GlobalVatReport({
  report,
}: {
  report: Awaited<ReturnType<typeof getGlobalVatReport>>;
}) {
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <header className="grid gap-3 border-b p-4 sm:grid-cols-3">
        {[
          ["Confirmed Client Invoice Output VAT", report.position.outputVat],
          ["Deductible Input VAT", report.position.deductibleInputVat],
          [
            report.position.status
              ? `VAT ${report.position.status.toLowerCase()}`
              : "Net VAT",
            report.position.positionAmount,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="financial-figure mt-1 text-lg font-semibold">
              {value === null
                ? "Incomplete"
                : formatMoney(value ?? null, report.companyCurrencyCode)}
            </p>
          </div>
        ))}
      </header>
      <CompletenessNotice
        complete={report.complete}
        excludedProjectCount={report.excludedProjectCount}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2 text-right">
                Client Invoice Output VAT
              </th>
              <th className="px-3 py-2 text-right">Deductible Input VAT</th>
              <th className="px-3 py-2 text-right">Position</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">FX</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <Link
                    className="hover:underline"
                    href={`/projects/${row.id}`}
                  >
                    {row.name}
                  </Link>
                </td>
                {[
                  row.position.outputVat,
                  row.position.deductibleInputVat,
                  row.position.positionAmount,
                ].map((value, index) => (
                  <td
                    className="financial-figure px-3 py-2 text-right"
                    key={index}
                  >
                    {value === null
                      ? "Incomplete"
                      : formatMoney(value, row.reportingCurrencyCode)}
                  </td>
                ))}
                <td className="px-3 py-2">
                  {row.position.status ?? "INCOMPLETE"}
                </td>
                <td className="px-3 py-2">
                  {row.position.complete ? "Complete" : "Incomplete"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function GlobalFreightReport({
  report,
}: {
  report: Awaited<ReturnType<typeof getGlobalFreightReport>>;
}) {
  const columns = [
    ["Expected allowance", "expectedFreightAllowanceHt"],
    ["Actual freight", "actualCostHt"],
    ["Recovery target", "recoveryTargetHt"],
    ["Gross profit", "freightGrossProfitHt"],
    ["Headroom", "headroomHt"],
  ] as const;
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <header className="grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-5">
        {columns.map(([label, key]) => (
          <div key={key}>
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="financial-figure mt-1 font-semibold">
              {formatMoney(report.totals[key], report.companyCurrencyCode)}
            </p>
          </div>
        ))}
      </header>
      <CompletenessNotice
        complete={report.complete}
        excludedProjectCount={report.excludedProjectCount}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[70rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2 text-right">Expected purchase HT</th>
              <th className="px-3 py-2 text-right">Freight estimate %</th>
              {columns.map(([label, key]) => (
                <th className="px-3 py-2 text-right" key={key}>
                  {label}
                </th>
              ))}
              <th className="px-3 py-2">FX</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <Link
                    className="hover:underline"
                    href={`/projects/${row.id}`}
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {row.reconciliation.expectedProductPurchaseCostHt === null
                    ? "Incomplete"
                    : formatMoney(
                        row.reconciliation.expectedProductPurchaseCostHt,
                        row.reportingCurrencyCode,
                      )}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {formatRate(row.reconciliation.freightEstimateRate)}
                </td>
                {columns.map(([, key]) => (
                  <td
                    className="financial-figure px-3 py-2 text-right"
                    key={key}
                  >
                    {row.reconciliation[key] === null
                      ? "Incomplete"
                      : formatMoney(
                          row.reconciliation[key],
                          row.reportingCurrencyCode,
                        )}
                  </td>
                ))}
                <td className="px-3 py-2">
                  {row.reconciliation.complete ? "Complete" : "Incomplete"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
