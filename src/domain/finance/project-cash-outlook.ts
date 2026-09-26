import Decimal from "decimal.js";
import {
  convertPaymentAmount,
  installmentOutstanding,
} from "@/domain/payments/calculations";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { sumKnown, difference } from "./project-control";

export interface CashOutlookDocument {
  kind: "issued" | "planned" | "payment";
  currency: string;
  total: string | null;
  paid: string;
  fx: string | null;
  terms: readonly {
    amount: string;
    paid: string;
    due: string | null;
    fx: string | null;
    cancelled: boolean;
  }[];
}

/** Cash expectations only: never changes schedules or manufactures settlement dates. */
export function projectCashOutlook(
  documents: readonly CashOutlookDocument[],
  currency: string,
  today: string,
  currentCash: string | null,
) {
  const entries: {
    kind: CashOutlookDocument["kind"];
    due: string | null;
    amount: string | null;
  }[] = [];
  let unscheduledCount = 0;
  let plannedUnscheduledCount = 0;
  for (const document of documents) {
    if (document.total === null) {
      entries.push({ kind: document.kind, due: null, amount: null });
      continue;
    }
    let remaining = installmentOutstanding(document.total, document.paid);
    const convert = (amount: Decimal, fx: string | null) =>
      convertPaymentAmount({
        amount,
        currencyCode: document.currency,
        reportingCurrencyCode: currency,
        fxRateToReporting: fx,
      })?.toFixed(4) ?? null;
    // Cap terms by the document balance, including receipts recorded without a term.
    for (const term of [...document.terms].sort((a, b) =>
      (a.due ?? "9999").localeCompare(b.due ?? "9999"),
    )) {
      if (term.cancelled || remaining.isZero()) continue;
      const amount = Decimal.min(
        remaining,
        installmentOutstanding(term.amount, term.paid),
      );
      if (amount.isZero()) continue;
      entries.push({
        kind: document.kind,
        due: term.due,
        amount: convert(amount, term.fx),
      });
      remaining = remaining.minus(amount);
    }
    if (remaining.greaterThan(0)) {
      if (document.kind === "planned") plannedUnscheduledCount++;
      else unscheduledCount++;
      entries.push({
        kind: document.kind,
        due: null,
        amount: convert(remaining, document.fx),
      });
    }
  }
  const sum = (
    kind: CashOutlookDocument["kind"],
    predicate: (due: string | null) => boolean,
  ) =>
    sumKnown(
      entries
        .filter((entry) => entry.kind === kind && predicate(entry.due))
        .map((entry) => entry.amount),
    );
  const overdueIn = sum("issued", (due) => due !== null && due < today);
  const overdueOut = sum("payment", (due) => due !== null && due < today);
  const undatedIn = sum("issued", (due) => due === null);
  const undatedOut = sum("payment", (due) => due === null);
  const undatedCount = entries.filter(
    (entry) => entry.kind !== "planned" && entry.due === null,
  ).length;
  const missingFxCount = entries.filter(
    (entry) => entry.kind !== "planned" && entry.amount === null,
  ).length;
  const overdueCount = entries.filter(
    (entry) =>
      entry.kind !== "planned" && entry.due !== null && entry.due < today,
  ).length;
  return {
    today,
    overdueIn,
    overdueOut,
    undatedIn,
    undatedOut,
    overdueCount,
    undatedCount,
    missingFxCount,
    unscheduledCount,
    plannedUnscheduledCount,
    plannedUndated: sum("planned", (due) => due === null),
    plannedOverdue: sum("planned", (due) => due !== null && due < today),
    windows: ([7, 30, 90] as const).map((days) => {
      const endDate = dateOnlyToDate(today);
      endDate.setUTCDate(endDate.getUTCDate() + days - 1);
      const end = dateToDateOnly(endDate);
      const inWindow = (due: string | null) =>
        due !== null && due >= today && due <= end;
      const expectedIn = sum("issued", inWindow);
      const expectedOut = sum("payment", inWindow);
      return {
        days,
        end,
        expectedIn,
        expectedOut,
        plannedIn: sum("planned", inWindow),
        // Overdue and undated balances need review before any confident projection.
        projectedCash:
          overdueCount || undatedCount || missingFxCount
            ? null
            : sumKnown([currentCash, difference(expectedIn, expectedOut)]),
      };
    }),
  };
}

export type ProjectCashOutlook = ReturnType<typeof projectCashOutlook>;
