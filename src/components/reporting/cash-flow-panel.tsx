import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cashFlowHorizons, type CashFlowHorizon } from "@/config/reporting";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { SerializedCashFlow } from "@/lib/reporting/reports";

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function horizonHref(baseHref: string, horizon: CashFlowHorizon): string {
  const [pathname, queryString] = baseHref.split("?");
  const query = new URLSearchParams(queryString);
  query.set("horizon", horizon);
  return `${pathname}?${query}`;
}

export function CashFlowPanel({
  baseHref,
  cashFlow,
  currencyCode,
  horizon,
  showHorizonControls = true,
  supplierScoped = false,
}: {
  baseHref: string;
  cashFlow: SerializedCashFlow;
  currencyCode: string;
  horizon: CashFlowHorizon;
  showHorizonControls?: boolean;
  supplierScoped?: boolean;
}) {
  const hasActivity = cashFlow.rows.some(
    (row) =>
      row.expectedIn !== "0" ||
      row.expectedOut !== "0" ||
      row.actualIn !== "0" ||
      row.actualOut !== "0" ||
      !row.expectedComplete ||
      !row.actualComplete,
  );
  return (
    <section className="bg-card rounded-lg border p-4" id="cash-flow">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Cash-flow forecast</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {supplierScoped
              ? "Supplier payments and refunds only; no Client cash is attributed to this Supplier."
              : "Expected receipts include issued Invoices only, capped by their unpaid balances; actual cash uses recorded settlement dates."}{" "}
            {formatDateOnly(cashFlow.start)}–{formatDateOnly(cashFlow.end)}.
          </p>
        </div>
        {showHorizonControls ? (
          <nav aria-label="Cash-flow horizon" className="flex flex-wrap gap-1">
            {cashFlowHorizons.map((option) => (
              <Link
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${option.value === horizon ? "bg-primary text-primary-foreground" : "border-input"}`}
                href={horizonHref(baseHref, option.value)}
                key={option.value}
              >
                {option.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <dl className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {(
          [
            [
              "Expected in",
              cashFlow.totals.expectedIn,
              cashFlow.totals.expectedComplete,
            ],
            [
              "Expected out",
              cashFlow.totals.expectedOut,
              cashFlow.totals.expectedComplete,
            ],
            [
              "Expected net",
              cashFlow.totals.expectedNet,
              cashFlow.totals.expectedComplete,
            ],
            [
              "Actual in",
              cashFlow.totals.actualIn,
              cashFlow.totals.actualComplete,
            ],
            [
              "Actual out",
              cashFlow.totals.actualOut,
              cashFlow.totals.actualComplete,
            ],
            [
              "Actual net",
              cashFlow.totals.actualNet,
              cashFlow.totals.actualComplete,
            ],
          ] as const
        ).map(([label, value, complete]) => (
          <div className="bg-muted/25 rounded-md border p-3" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {complete ? formatMoney(value, currencyCode) : "Incomplete"}
            </dd>
          </div>
        ))}
      </dl>
      {!cashFlow.totals.expectedComplete || !cashFlow.totals.actualComplete ? (
        <p className="text-destructive mt-3 text-xs">
          Forecast review: {cashFlow.totals.missingExpectedCount} expected cash
          issue(s); {cashFlow.totals.missingActualCount} actual cash amount(s)
          need FX. Overdue and undated balances are not moved into this period.
          Dated rows below remain available; incomplete amounts are never zero.
        </p>
      ) : null}
      {cashFlow.outlook &&
      (cashFlow.totals.missingExpectedCount > 0 ||
        (cashFlow.planned?.missingCount ?? 0) > 0) ? (
        <details className="mt-3 rounded-md border p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            Forecast gaps
          </summary>
          <p className="text-muted-foreground mt-2">
            {cashFlow.outlook.overdueCount} overdue ·{" "}
            {cashFlow.outlook.undatedCount} undated ·{" "}
            {cashFlow.outlook.unscheduledCount} unscheduled ·{" "}
            {cashFlow.outlook.missingFxCount} missing amounts/FX ·{" "}
            {cashFlow.outlook.reviewCount} source reviews. Unscheduled balances
            are included in undated amounts, not added twice.
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["Overdue in", cashFlow.outlook.overdueIn],
                ["Overdue out", cashFlow.outlook.overdueOut],
                ["Undated in", cashFlow.outlook.undatedIn],
                ["Undated out", cashFlow.outlook.undatedOut],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="financial-figure">
                  {value === null
                    ? "Incomplete"
                    : formatMoney(value, currencyCode)}
                </dd>
              </div>
            ))}
          </dl>
          <ul className="mt-3 space-y-2">
            {cashFlow.outlook.entries
              .filter(
                (entry) =>
                  !entry.due ||
                  entry.due < (cashFlow.outlook?.today ?? "") ||
                  entry.amount === null ||
                  entry.reviewReason,
              )
              .map((entry, index) => (
                <li key={`${entry.source?.href}-${index}`}>
                  {entry.source ? (
                    <Link
                      className="font-medium hover:underline"
                      href={entry.source.href}
                    >
                      {entry.source.label}
                    </Link>
                  ) : (
                    "Source record"
                  )}
                  {" · "}
                  {entry.kind === "planned" ? "Planned · " : ""}
                  {entry.reviewReason ??
                    (entry.amount === null
                      ? "Missing amount/FX"
                      : !entry.due
                        ? "Date/schedule needed"
                        : "Overdue")}
                  {" · "}
                  {entry.amount === null
                    ? "Incomplete"
                    : formatMoney(entry.amount, currencyCode)}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
      {cashFlow.planned ? (
        <details className="mt-3 rounded-md border p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            Planned Client receipts · excluded from expected net
            <span className="financial-figure ml-2">
              {cashFlow.planned.complete
                ? formatMoney(cashFlow.planned.amount, currencyCode)
                : "Incomplete — review source data"}
            </span>
          </summary>
          <p className="text-muted-foreground mt-2">
            Quote and To be invoiced payment terms due in this period. Matched
            Quote terms count once under their Invoice; plans are not issued
            receivables.
          </p>
          <dl className="mt-2 space-y-1">
            {cashFlow.planned.rows.map((row) => (
              <div className="flex justify-between gap-3" key={row.month}>
                <dt>{monthLabel(row.month)}</dt>
                <dd className="financial-figure">
                  {row.complete
                    ? formatMoney(row.amount, currencyCode)
                    : "Incomplete — review source data"}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      {hasActivity ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(34rem,1.2fr)]">
          <div
            aria-label="Expected monthly cash-flow chart"
            className="space-y-4"
          >
            <div className="flex flex-wrap gap-3 text-[0.6875rem]">
              <span className="flex items-center gap-1.5">
                <span className="bg-positive size-2.5 rounded-sm" /> Cash in
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-destructive size-2.5 rounded-sm" /> Cash out
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-primary size-2.5 rounded-sm" /> Net
              </span>
            </div>
            {cashFlow.chart.map((row) => (
              <div
                className="grid grid-cols-[4.75rem_1fr] gap-2"
                key={row.month}
              >
                <span className="text-muted-foreground text-xs">
                  {monthLabel(row.month)}
                </span>
                {cashFlow.rows.find((month) => month.month === row.month)
                  ?.expectedComplete === false ? (
                  <span className="text-destructive text-xs">
                    Incomplete — review source data
                  </span>
                ) : (
                  <div className="space-y-1.5">
                    <div className="bg-muted h-2 overflow-hidden rounded-sm">
                      <div
                        className="bg-positive h-full rounded-sm"
                        style={{ width: row.cashInWidth }}
                      />
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-sm">
                      <div
                        className="bg-destructive h-full rounded-sm"
                        style={{ width: row.cashOutWidth }}
                      />
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-sm">
                      <div
                        className={
                          row.netNegative
                            ? "bg-destructive h-full rounded-sm"
                            : "bg-primary h-full rounded-sm"
                        }
                        style={{ width: row.netWidth }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Expected in</th>
                  <th className="px-3 py-2 text-right">Expected out</th>
                  <th className="px-3 py-2 text-right">Expected net</th>
                  <th className="px-3 py-2 text-right">Actual in</th>
                  <th className="px-3 py-2 text-right">Actual out</th>
                  <th className="px-3 py-2 text-right">Actual net</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cashFlow.rows.map((row) => (
                  <tr key={row.month}>
                    <td className="px-3 py-2 font-medium">
                      {monthLabel(row.month)}
                      {!row.expectedComplete || !row.actualComplete ? (
                        <Badge className="ml-2" variant="destructive">
                          Incomplete
                        </Badge>
                      ) : null}
                    </td>
                    {[
                      row.expectedIn,
                      row.expectedOut,
                      row.expectedNet,
                      row.actualIn,
                      row.actualOut,
                      row.actualNet,
                    ].map((value, index) => (
                      <td
                        className="financial-figure px-3 py-2 text-right"
                        key={`${row.month}-${index}`}
                      >
                        {(index < 3 ? row.expectedComplete : row.actualComplete)
                          ? formatMoney(value, currencyCode)
                          : "Incomplete"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground mt-5 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          No expected or actual cash movement falls within this period.
        </p>
      )}
    </section>
  );
}
