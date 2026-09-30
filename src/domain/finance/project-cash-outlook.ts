import Decimal from "decimal.js";
import { convertPaymentAmount } from "@/domain/payments/calculations";
import { cappedCashTerms } from "@/domain/payments/cash-expectations";
import { cashWindowEnd } from "@/domain/payments/dates";
import { sumKnown, difference } from "./project-control";

export interface CashOutlookDocument {
  reviewReason?: string | null;
  source?: { label: string; href: string };
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
    reviewReason?: string;
    kind: CashOutlookDocument["kind"];
    due: string | null;
    amount: string | null;
    source?: { label: string; href: string };
  }[] = [];
  let unscheduledCount = 0;
  let plannedUnscheduledCount = 0;
  for (const document of documents) {
    if (document.reviewReason) {
      const activeTerms = document.terms.filter((term) => !term.cancelled);
      for (const term of activeTerms.length ? activeTerms : [{ due: null }]) {
        entries.push({
          kind: document.kind,
          due: term.due,
          amount: null,
          reviewReason: document.reviewReason,
          ...(document.source ? { source: document.source } : {}),
        });
      }
      continue;
    }
    if (document.total === null) {
      entries.push({
        kind: document.kind,
        due: null,
        amount: null,
        ...(document.source ? { source: document.source } : {}),
      });
      continue;
    }
    const schedule = cappedCashTerms(
      document.total,
      document.paid,
      document.terms,
    );
    const convert = (amount: Decimal, fx: string | null) =>
      convertPaymentAmount({
        amount,
        currencyCode: document.currency,
        reportingCurrencyCode: currency,
        fxRateToReporting: fx,
      })?.toFixed(4) ?? null;
    for (const { term, amount } of schedule.terms) {
      if (amount.isZero()) continue;
      entries.push({
        ...(document.source ? { source: document.source } : {}),
        kind: document.kind,
        due: term.due,
        amount: convert(amount, term.fx),
      });
    }
    const remaining = schedule.unscheduled;
    if (remaining.greaterThan(0)) {
      if (document.kind === "planned") plannedUnscheduledCount++;
      else unscheduledCount++;
      entries.push({
        ...(document.source ? { source: document.source } : {}),
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
    (entry) =>
      entry.kind !== "planned" && entry.amount === null && !entry.reviewReason,
  ).length;
  const reviewCount = entries.filter(
    (entry) => entry.kind !== "planned" && entry.reviewReason,
  ).length;
  const plannedReviewCount = entries.filter(
    (entry) => entry.kind === "planned" && entry.reviewReason,
  ).length;
  const overdueCount = entries.filter(
    (entry) =>
      entry.kind !== "planned" && entry.due !== null && entry.due < today,
  ).length;
  return {
    entries,
    today,
    outstandingIn: sum("issued", () => true),
    outstandingOut: sum("payment", () => true),
    plannedTotal: sum("planned", () => true),
    overdueIn,
    overdueOut,
    undatedIn,
    undatedOut,
    overdueCount,
    undatedCount,
    missingFxCount,
    reviewCount,
    plannedReviewCount,
    unscheduledCount,
    plannedUnscheduledCount,
    plannedUndated: sum("planned", (due) => due === null),
    plannedOverdue: sum("planned", (due) => due !== null && due < today),
    windows: ([7, 30, 90] as const).map((days) => {
      const end = cashWindowEnd(today, days);
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
          overdueCount || undatedCount || missingFxCount || reviewCount
            ? null
            : sumKnown([currentCash, difference(expectedIn, expectedOut)]),
      };
    }),
  };
}

export type ProjectCashOutlook = ReturnType<typeof projectCashOutlook>;
