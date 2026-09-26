"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  formatMoney,
  formatRate,
  formatSignedMoney,
} from "@/domain/procurement/presentation";
import { formatDateOnly } from "@/domain/payments/dates";
import type { ProjectControl } from "@/lib/reporting/project-control";
import type { ProjectFinancialPerformance } from "@/domain/projects/targets";

function Money({
  value,
  currency,
  signed = false,
  missing = "Incomplete",
}: {
  value: string | null;
  currency: string;
  signed?: boolean;
  missing?: string;
}) {
  return (
    <span className="financial-figure">
      {value === null
        ? missing
        : signed
          ? formatSignedMoney(value, currency)
          : formatMoney(value, currency)}
    </span>
  );
}

function Figures({
  currency,
  figures,
}: {
  currency: string;
  figures: readonly {
    label: string;
    value: string | null;
    href: string;
    signed?: boolean;
  }[];
}) {
  return (
    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
      {figures.map((figure) => (
        <div key={figure.label} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{figure.label}</dt>
          <dd className="mt-1 text-lg font-semibold tracking-tight break-words">
            <Link
              className="focus-visible:outline-ring rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
              href={figure.href}
            >
              <Money
                value={figure.value}
                currency={currency}
                signed={figure.signed ?? false}
              />
            </Link>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProjectFinancialOverview({
  data,
  performance,
  projectId,
}: {
  data: Pick<
    ProjectControl,
    "currency" | "received" | "cash" | "cashOutlook" | "excludedReceiptCount"
  >;
  performance: ProjectFinancialPerformance;
  projectId: string;
}) {
  const [days, setDays] = useState(30);
  const outlook = data.cashOutlook;
  const window =
    outlook.windows.find((entry) => entry.days === days) ?? outlook.windows[1];
  const related = `/projects/${projectId}?tab=related`;
  const billing = `/billing?projectId=${projectId}`;
  const purchasing = `/orders?projectId=${projectId}`;
  return (
    <div className="space-y-4">
      <section
        className="record-surface"
        aria-labelledby="project-cash-heading"
      >
        <h2 id="project-cash-heading" className="text-sm font-semibold">
          Cash · actual to date
        </h2>
        <Figures
          currency={data.currency}
          figures={[
            {
              label: "Client payments received TTC",
              value: data.received,
              href: related,
            },
            {
              label: "Supplier & freight payments made TTC",
              value: data.cash.paid,
              href: related,
            },
            {
              label: "Net Project cash TTC",
              value: data.cash.net,
              href: related,
              signed: true,
            },
          ]}
        />
        <p className="text-muted-foreground mt-3 text-xs">
          Recorded receipts less recorded payments. Not a bank balance or
          available funds.
        </p>
        {data.cash.net === null && (
          <p role="status" className="text-warning-foreground mt-2 text-xs">
            Actual cash is incomplete: review payment FX.
          </p>
        )}
        {data.excludedReceiptCount > 0 && (
          <p role="status" className="text-warning-foreground mt-2 text-xs">
            {data.excludedReceiptCount} historical receipts without active
            Invoice context are excluded.{" "}
            <Link
              className="underline"
              href={`/receipts?projectId=${projectId}`}
            >
              Review receipts
            </Link>
          </p>
        )}
      </section>
      <section
        className="record-surface"
        aria-labelledby="project-outlook-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="project-outlook-heading" className="text-sm font-semibold">
            Expected cash
          </h2>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Cash outlook period"
          >
            {outlook.windows.map((entry) => (
              <Button
                key={entry.days}
                type="button"
                size="sm"
                variant={days === entry.days ? "secondary" : "ghost"}
                aria-pressed={days === entry.days}
                onClick={() => setDays(entry.days)}
              >
                Next {entry.days} days
              </Button>
            ))}
          </div>
        </div>
        {window && (
          <>
            <p className="text-muted-foreground mt-1 text-xs">
              {formatDateOnly(outlook.today)}–{formatDateOnly(window.end)} ·
              unpaid issued Invoices and recorded Supplier/freight commitments.
            </p>
            <Figures
              currency={data.currency}
              figures={[
                {
                  label: "Client payments due TTC",
                  value: window.expectedIn,
                  href: related,
                },
                {
                  label: "Supplier & freight payments due TTC",
                  value: window.expectedOut,
                  href: related,
                },
                {
                  label: "Projected net Project cash TTC",
                  value: window.projectedCash,
                  href: related,
                  signed: true,
                },
              ]}
            />
            <p className="text-muted-foreground mt-3 text-xs">
              Current net cash + payments due in − payments due out. Planned
              receipts are excluded.
            </p>
            {(outlook.overdueCount > 0 ||
              outlook.undatedCount > 0 ||
              outlook.missingFxCount > 0) && (
              <div
                role="status"
                className="text-warning-foreground mt-3 space-y-1 border-t pt-3 text-xs"
              >
                <p>
                  Projection incomplete. Review overdue amounts, dates or
                  missing financial/FX information in{" "}
                  <Link href={related} className="underline">
                    Related payment terms
                  </Link>
                  .
                </p>
                {outlook.overdueCount > 0 && (
                  <p>
                    Overdue — client:{" "}
                    <Money value={outlook.overdueIn} currency={data.currency} />
                    ; Supplier/freight:{" "}
                    <Money
                      value={outlook.overdueOut}
                      currency={data.currency}
                    />
                    . Excluded from future dates until rescheduled.
                  </p>
                )}
                {outlook.undatedCount > 0 && (
                  <p>
                    Undated / unscheduled — client:{" "}
                    <Money value={outlook.undatedIn} currency={data.currency} />
                    ; Supplier/freight:{" "}
                    <Money
                      value={outlook.undatedOut}
                      currency={data.currency}
                    />
                    .
                  </p>
                )}
              </div>
            )}
            <details className="mt-3 border-t pt-3 text-xs">
              <summary className="cursor-pointer font-medium">
                Planned receipts · separate from cash forecast
              </summary>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  ["Within selected period", window.plannedIn],
                  ["Past planned dates", outlook.plannedOverdue],
                  ["Undated / unscheduled", outlook.plannedUndated],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-medium">
                      <Money value={value ?? null} currency={data.currency} />
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted-foreground mt-2">
                Quotes and To be invoiced documents, TTC; matched Quote terms
                count once. These are plans, not issued receivables.{" "}
                <Link className="underline" href={billing}>
                  Open Billing
                </Link>
              </p>
            </details>
          </>
        )}
      </section>
      <section
        className="record-surface"
        aria-labelledby="project-profit-heading"
      >
        <h2 id="project-profit-heading" className="text-sm font-semibold">
          Profitability
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Revenue excludes VAT; economic cost includes non-deductible VAT. Cash
          timing does not affect profit.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-3 font-medium">Measure</th>
                <th className="px-3 py-2 text-right font-medium">
                  Current · provisional
                </th>
                <th className="py-2 pl-3 text-right font-medium">
                  Expected · approved budget
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(
                [
                  ["Revenue HT", "sellHt", billing],
                  ["Cost", "costHt", purchasing],
                  ["Gross profit", "grossProfitHt", related],
                ] as const
              ).map(([label, key, href]) => (
                <tr key={key}>
                  <th className="py-3 pr-3 font-medium">
                    <Link className="hover:underline" href={href}>
                      {label}
                    </Link>
                  </th>
                  <td className="px-3 py-3 text-right font-semibold">
                    <Money
                      value={performance.actual[key]}
                      currency={data.currency}
                      signed={key === "grossProfitHt"}
                    />
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <Money
                      value={performance.target[key]}
                      currency={data.currency}
                      signed={key === "grossProfitHt"}
                      missing="Budget incomplete"
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <th className="py-3 pr-3 font-medium">Effective markup</th>
                <td className="financial-figure px-3 py-3 text-right font-semibold">
                  {formatRate(performance.actual.markupRate)}
                </td>
                <td className="financial-figure py-3 pl-3 text-right">
                  {performance.target.costHt === null
                    ? "Budget incomplete"
                    : formatRate(performance.target.markupRate)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Current = issued Invoice revenue less recorded Order and
          Project-freight economic costs. Not final profit: future costs may be
          missing. Expected is the full-Project budget, not a live completion
          forecast.
        </p>
        <details className="mt-3 border-t pt-3 text-xs">
          <summary className="cursor-pointer font-medium">
            Margin & calculation basis
          </summary>
          <p className="text-muted-foreground mt-2">
            Markup = profit ÷ cost. Margin = profit ÷ revenue. Current margin:{" "}
            {formatRate(performance.actual.marginRate)}; budget margin:{" "}
            {formatRate(performance.target.marginRate)}. Rates use aggregated
            monetary values, not averages.
          </p>
        </details>
      </section>
    </div>
  );
}
