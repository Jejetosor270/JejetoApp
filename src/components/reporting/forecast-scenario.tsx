import type { CashFlowHorizon } from "@/config/reporting";
import type { ProjectCashOutlook } from "@/domain/finance/project-cash-outlook";
import {
  cashDelayScenario,
  type CashDelay,
} from "@/domain/reporting/forecast-scenario";
import { formatMoney } from "@/domain/procurement/presentation";
import { CashBars } from "./dashboard-charts";

export function ForecastScenario({
  outlook,
  currency,
  horizon,
  delay,
  href,
}: {
  outlook: ProjectCashOutlook;
  currency: string;
  horizon: CashFlowHorizon;
  delay: CashDelay;
  href: string;
}) {
  const result = cashDelayScenario(outlook, currency, horizon, delay);
  return (
    <details
      className="bg-card rounded-lg border p-4 sm:p-5"
      open={delay !== "0"}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Cash scenario
      </summary>
      <p className="text-muted-foreground mt-2 text-xs">
        What if future cash-in arrives{" "}
        {delay === "0" ? "on time" : `${delay} days late`}? Payments stay on
        schedule. Plans, overdue and undated balances are not moved. No records
        change; this is not a bank balance.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          ["Scheduled net", result.baseline.net],
          ["Scenario net", result.scenario.net],
          ["Impact", result.impact],
        ].map(([label, amount]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label} TTC</dt>
            <dd className="financial-figure mt-1 text-lg font-semibold">
              {formatMoney(amount ?? null, currency, "Incomplete")}
            </dd>
          </div>
        ))}
      </dl>
      {result.scenario.net === null ? (
        <p className="text-warning-foreground mt-3 text-xs">
          Resolve the forecast gaps before relying on this scenario. Dated
          amounts below are only part of the position.
        </p>
      ) : null}
      <CashBars
        chart={result.scenario.chart}
        currency={currency}
        title="Cash scenario"
        href={href}
        partial="Hypothetical timing · TTC"
      />
    </details>
  );
}
