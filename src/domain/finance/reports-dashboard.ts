import Decimal from "decimal.js";
import { addMonthsToDateOnly } from "@/domain/payments/dates";
import {
  buildMonthlyCashFlow,
  cashFlowRange,
} from "@/domain/reporting/calculations";
import type { CashFlowHorizon } from "@/config/reporting";
import type { ProjectCashOutlook } from "./project-cash-outlook";
import { difference, sumKnown } from "./project-control";

export function dashboardHistoryRange(today: string, months: 3 | 6 | 12) {
  return {
    start: addMonthsToDateOnly(`${today.slice(0, 7)}-01`, 1 - months),
    end: today,
  };
}

export interface DashboardCashRow {
  month: string;
  incoming: string | null;
  outgoing: string | null;
  net: string | null;
}

/** Geometry only; financial values remain exact Decimal strings. Unknowns are not bars. */
export function cashChart(rows: readonly DashboardCashRow[]) {
  const maximum = rows.reduce(
    (max, row) => Decimal.max(max, row.incoming ?? "0", row.outgoing ?? "0"),
    new Decimal(0),
  );
  const height = (amount: string | null) =>
    amount === null
      ? null
      : maximum.isZero()
        ? "0%"
        : `${new Decimal(amount).div(maximum).times(100).toFixed(4)}%`;
  return {
    maximum: maximum.toFixed(4),
    hasActivity: rows.some(
      (row) =>
        row.incoming === null ||
        row.outgoing === null ||
        !new Decimal(row.incoming).isZero() ||
        !new Decimal(row.outgoing).isZero(),
    ),
    rows: rows.map((row) => ({
      ...row,
      incomingHeight: height(row.incoming),
      outgoingHeight: height(row.outgoing),
    })),
  };
}

/** Group existing capped obligations; no new schedules, assumed dates, FX or collection probabilities. */
export function dashboardForecast(
  outlook: ProjectCashOutlook,
  currency: string,
  horizon: CashFlowHorizon,
  selectedRange?: { start: string; end: string },
) {
  const range = selectedRange ?? cashFlowRange(outlook.today, horizon);
  const months = buildMonthlyCashFlow({
    ...range,
    installments: [],
    reportingCurrencyCode: currency,
  });
  const dated = outlook.entries.filter(
    (entry) =>
      entry.due !== null && entry.due >= range.start && entry.due <= range.end,
  );
  const rows = months.map(({ month }) => {
    const entries = dated.filter((entry) => entry.due?.startsWith(month));
    const incoming = sumKnown(
      entries
        .filter((entry) => entry.kind === "issued")
        .map((entry) => entry.amount),
    );
    const outgoing = sumKnown(
      entries
        .filter((entry) => entry.kind === "payment")
        .map((entry) => entry.amount),
    );
    return { month, incoming, outgoing, net: difference(incoming, outgoing) };
  });
  const reviewEntries = outlook.entries.filter(
    (entry) =>
      entry.kind !== "planned" &&
      (!entry.due ||
        entry.due < outlook.today ||
        entry.amount === null ||
        entry.reviewReason),
  );
  const incoming = sumKnown(rows.map((row) => row.incoming));
  const outgoing = sumKnown(rows.map((row) => row.outgoing));
  return {
    ...range,
    chart: cashChart(rows),
    incoming,
    outgoing,
    net: reviewEntries.length ? null : difference(incoming, outgoing),
    reviewEntries,
    planned: sumKnown(
      dated
        .filter((entry) => entry.kind === "planned")
        .map((entry) => entry.amount),
    ),
    plannedIssues: outlook.entries.filter(
      (entry) =>
        entry.kind === "planned" &&
        (!entry.due ||
          entry.due < outlook.today ||
          entry.amount === null ||
          entry.reviewReason),
    ).length,
  };
}

/** Common signed scale for Project comparisons; zero stays on the baseline. */
export function signedComparison<
  T extends { id: string; amount: string | null },
>(rows: readonly T[]) {
  const maximum = rows.reduce(
    (max, row) => Decimal.max(max, new Decimal(row.amount ?? "0").abs()),
    new Decimal(0),
  );
  return rows
    .toSorted((a, b) => {
      if (a.amount === null)
        return b.amount === null ? a.id.localeCompare(b.id) : -1;
      if (b.amount === null) return 1;
      return (
        new Decimal(a.amount).comparedTo(b.amount) || a.id.localeCompare(b.id)
      );
    })
    .map((row) => ({
      ...row,
      negative: row.amount !== null && new Decimal(row.amount).isNegative(),
      width:
        row.amount === null
          ? null
          : maximum.isZero()
            ? "0%"
            : `${new Decimal(row.amount).abs().div(maximum).times(100).toFixed(4)}%`,
    }));
}
