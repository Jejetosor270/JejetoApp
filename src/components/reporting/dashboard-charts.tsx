import Link from "next/link";
import {
  formatMoney,
  formatSignedMoney,
} from "@/domain/procurement/presentation";
import type {
  cashChart,
  signedComparison,
} from "@/domain/finance/reports-dashboard";

export const dashboardLink =
  "text-primary rounded-sm text-xs font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4";

export function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function CashBars({
  chart,
  currency,
  title,
  href,
  partial,
}: {
  chart: ReturnType<typeof cashChart>;
  currency: string;
  title: string;
  href: string;
  partial: string;
}) {
  return (
    <>
      <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary size-2.5" aria-hidden="true" />
          In TTC
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-muted-foreground size-2.5" aria-hidden="true" />
          Out TTC
        </span>
        <span className="ml-auto">
          {currency} · {partial}
        </span>
      </div>
      {chart.hasActivity ? (
        <div
          className="mt-3 overflow-x-auto"
          role="region"
          aria-label={`${title} chart`}
          tabIndex={0}
        >
          <div className="relative min-w-[26rem]">
            <div className="text-muted-foreground mb-1 text-[0.625rem] tabular-nums">
              Scale: {formatMoney(chart.maximum, currency)}
            </div>
            <div
              className="border-border pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed"
              aria-hidden="true"
            />
            <div className="flex gap-2 border-b">
              {chart.rows.map((row) => (
                <Link
                  href={href}
                  key={row.month}
                  aria-label={`${monthLabel(row.month)}: in ${row.incoming === null ? "Incomplete" : formatMoney(row.incoming, currency)}, out ${row.outgoing === null ? "Incomplete" : formatMoney(row.outgoing, currency)}. Open details.`}
                  className="hover:bg-muted/30 relative flex min-w-0 flex-1 items-end justify-center gap-1 rounded-t-sm pt-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <div
                    className="flex h-36 w-full items-end justify-center gap-1 sm:h-44"
                    aria-hidden="true"
                  >
                    {row.incomingHeight === null ||
                    row.outgoingHeight === null ? (
                      <span className="text-warning-foreground self-center text-xs">
                        Review
                      </span>
                    ) : (
                      <>
                        <span
                          className="bg-primary w-[28%] max-w-9 rounded-t-sm"
                          style={{ height: row.incomingHeight }}
                        />
                        <span
                          className="bg-muted-foreground w-[28%] max-w-9 rounded-t-sm"
                          style={{ height: row.outgoingHeight }}
                        />
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-muted-foreground mt-2 flex gap-2 text-center text-[0.625rem]">
              {chart.rows.map((row) => (
                <span className="min-w-0 flex-1" key={row.month}>
                  {monthLabel(row.month)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground mt-4 rounded-md border border-dashed px-4 py-10 text-center text-sm">
          No cash movement in this period.
        </p>
      )}
      <details className="mt-4 border-t pt-3">
        <summary className="cursor-pointer text-xs font-medium">
          Monthly figures
        </summary>
        <div
          className="mt-3 overflow-x-auto"
          role="region"
          aria-label={`${title} figures`}
          tabIndex={0}
        >
          <table className="w-full text-right text-xs">
            <caption className="sr-only">
              {title} · {currency} TTC
            </caption>
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 text-left">
                  Month
                </th>
                <th scope="col">In TTC</th>
                <th scope="col">Out TTC</th>
                <th scope="col">Net TTC</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {chart.rows.map((row) => (
                <tr key={row.month}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {monthLabel(row.month)}
                  </th>
                  {[row.incoming, row.outgoing, row.net].map((value, i) => (
                    <td
                      key={i}
                      className="financial-figure pl-3 whitespace-nowrap"
                    >
                      {value === null
                        ? "Incomplete"
                        : formatMoney(value, currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

type ComparisonRow = {
  id: string;
  name: string;
  amount: string | null;
  note: string;
};
export function ProjectBars({
  rows,
  currency,
}: {
  rows: ReturnType<typeof signedComparison<ComparisonRow>>;
  currency: string;
}) {
  return (
    <div className="mt-4 space-y-4">
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">
          No comparable Projects in this scope.
        </p>
      ) : (
        rows.slice(0, 6).map((row) => (
          <div key={row.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
              <Link
                className="min-w-0 font-medium break-words underline-offset-4 hover:underline focus-visible:outline-2"
                href={`/projects/${row.id}`}
              >
                {row.name}
              </Link>
              <span
                className={`financial-figure ${row.negative ? "text-destructive" : ""}`}
              >
                {row.amount === null
                  ? "Incomplete"
                  : formatSignedMoney(row.amount, currency)}
              </span>
            </div>
            <div className="mt-2 flex h-2" aria-hidden="true">
              <div className="bg-muted/50 flex w-1/2 justify-end border-r">
                <span
                  className="bg-destructive"
                  style={{ width: row.negative ? (row.width ?? "0%") : "0%" }}
                />
              </div>
              <div className="bg-muted/50 w-1/2">
                <div
                  className="bg-primary h-full"
                  style={{ width: row.negative ? "0%" : (row.width ?? "0%") }}
                />
              </div>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{row.note}</p>
          </div>
        ))
      )}
      {rows.length > 6 ? (
        <p className="text-muted-foreground text-xs">
          Showing 6 of {rows.length} Projects; review gaps and lowest values
          first.
        </p>
      ) : null}
    </div>
  );
}
