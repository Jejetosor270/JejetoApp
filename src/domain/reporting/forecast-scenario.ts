import type { CashFlowHorizon } from "@/config/reporting";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { dashboardForecast } from "@/domain/finance/reports-dashboard";
import { difference } from "@/domain/finance/project-control";
import type { ProjectCashOutlook } from "@/domain/finance/project-cash-outlook";

export const cashDelayOptions = [
  { value: "0", label: "On time" },
  { value: "15", label: "15 days late" },
  { value: "30", label: "30 days late" },
  { value: "60", label: "60 days late" },
] as const;
export type CashDelay = (typeof cashDelayOptions)[number]["value"];
export function cashDelay(value: string | undefined): CashDelay {
  return (
    cashDelayOptions.find((option) => option.value === value)?.value ?? "0"
  );
}

/** Hypothetical timing only. Never changes source dates, overdue debt, amounts or planned receipts. */
export function cashDelayScenario(
  outlook: ProjectCashOutlook,
  currency: string,
  horizon: CashFlowHorizon,
  delay: CashDelay,
  range?: { start: string; end: string },
) {
  const baseline = dashboardForecast(outlook, currency, horizon, range);
  const entries = outlook.entries.map((entry) => {
    if (
      entry.kind !== "issued" ||
      !entry.due ||
      entry.due < outlook.today ||
      entry.reviewReason
    )
      return { ...entry };
    const date = dateOnlyToDate(entry.due);
    date.setUTCDate(date.getUTCDate() + Number(delay));
    return { ...entry, due: dateToDateOnly(date) };
  });
  const scenario = dashboardForecast(
    { ...outlook, entries },
    currency,
    horizon,
    range,
  );
  return {
    baseline,
    scenario,
    delay,
    impact: difference(scenario.net, baseline.net),
  };
}
