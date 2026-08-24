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
  const separator = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${separator}horizon=${horizon}`;
}

export function CashFlowPanel({
  baseHref,
  cashFlow,
  currencyCode,
  horizon,
  showHorizonControls = true,
}: {
  baseHref: string;
  cashFlow: SerializedCashFlow;
  currencyCode: string;
  horizon: CashFlowHorizon;
  showHorizonControls?: boolean;
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
            Expected cash uses outstanding due-date balances; actual cash uses
            recorded settlement dates. {formatDateOnly(cashFlow.start)}–
            {formatDateOnly(cashFlow.end)}.
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
            ["Expected in", cashFlow.totals.expectedIn],
            ["Expected out", cashFlow.totals.expectedOut],
            ["Expected net", cashFlow.totals.expectedNet],
            ["Actual in", cashFlow.totals.actualIn],
            ["Actual out", cashFlow.totals.actualOut],
            ["Actual net", cashFlow.totals.actualNet],
          ] as const
        ).map(([label, value]) => (
          <div className="bg-muted/25 rounded-md border p-3" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {formatMoney(value, currencyCode)}
            </dd>
          </div>
        ))}
      </dl>
      {!cashFlow.totals.expectedComplete || !cashFlow.totals.actualComplete ? (
        <p className="text-destructive mt-3 text-xs">
          Incomplete FX: {cashFlow.totals.missingExpectedCount} expected and{" "}
          {cashFlow.totals.missingActualCount} actual cash amount(s) are not
          included in converted totals.
        </p>
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
                        {formatMoney(value, currencyCode)}
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
