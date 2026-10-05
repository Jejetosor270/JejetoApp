"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CircleAlert,
} from "lucide-react";
import { EditProjectBudgetButton } from "@/components/projects/project-budget-context";
import {
  formatMoney,
  formatRate,
  formatSignedMoney,
} from "@/domain/procurement/presentation";
import {
  amountTone,
  billingProgress,
  comparisonWidths,
} from "@/domain/finance/project-visuals";
import type {
  ProjectDashboard,
  ProjectMetricKey,
} from "@/domain/finance/project-dashboard";
import type { ProjectControl } from "@/lib/reporting/project-control";
import { ProjectMetricDrawer } from "./project-metric-drawer";

export const projectMetricLabels: Record<ProjectMetricKey, string> = {
  cost: "Recorded cost",
  sell: "Order sell HT",
  profit: "Pricing profit",
  planned: "Billing plan HT",
  invoiced: "Invoiced HT",
  toInvoice: "To invoice HT",
  coverage: "Order coverage HT",
  received: "Client received TTC",
  paid: "Supplier paid TTC",
  cash: "Net cash TTC",
  toCollect: "To collect TTC",
  toPay: "To pay TTC",
  expectedCost: "Budgeted cost",
  expectedProfit: "Expected profit",
  freightCost: "Freight cost HT",
  freightTarget: "Freight target HT",
  freightInvoiced: "Freight invoiced HT",
  freightReceived: "Freight received HT",
  freightInvoicedGap: "Invoiced coverage HT",
  freightPaidGap: "Paid coverage HT",
  vatOutput: "Output VAT",
  vatInput: "Deductible VAT",
  vatBalance: "VAT balance",
};
const signedMetrics = new Set<ProjectMetricKey>([
  "profit",
  "cash",
  "coverage",
  "expectedProfit",
  "freightInvoicedGap",
  "freightPaidGap",
]);
const resultColors = {
  positive: "text-positive",
  negative: "text-destructive",
  neutral: "text-foreground",
  unknown: "text-warning",
};

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="record-surface flex min-w-0 flex-col">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      {children}
    </section>
  );
}

export function ProjectFinancialOverview({
  data,
  projectId,
}: {
  data: Pick<ProjectControl, "currency" | "dashboard">;
  projectId: string;
}) {
  const { dashboard, currency } = data;
  const { metrics } = dashboard;
  const [selected, setSelected] = useState<ProjectMetricKey | null>(null);
  const progress = billingProgress(
    metrics.invoiced.value,
    metrics.planned.value,
  );
  const related = (section: string) =>
    `/projects/${projectId}?tab=related&section=${section}`;
  function money(key: ProjectMetricKey) {
    const value = metrics[key].value;
    if (value === null)
      return key === "expectedCost" || key === "expectedProfit"
        ? "Estimate needed"
        : "Needs review";
    return signedMetrics.has(key)
      ? formatSignedMoney(value, currency)
      : formatMoney(value, currency);
  }
  function metric(
    key: ProjectMetricKey,
    prominent = false,
    label = projectMetricLabels[key],
  ) {
    return (
      <button
        type="button"
        onClick={() => setSelected(key)}
        aria-label={`View ${label}`}
        className="group min-w-0 text-left"
      >
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          {label}
          <ChevronRight
            aria-hidden="true"
            className="size-3 shrink-0 opacity-50 group-hover:opacity-100"
          />
        </span>
        <span
          className={`financial-figure mt-1 block font-semibold tracking-tight break-words ${prominent ? "text-2xl" : "text-base"} ${signedMetrics.has(key) ? resultColors[amountTone(metrics[key].value)] : ""}`}
        >
          {money(key)}
        </span>
      </button>
    );
  }
  function bars(keys: readonly [ProjectMetricKey, ProjectMetricKey]) {
    const widths = comparisonWidths(keys.map((key) => metrics[key].value));
    return (
      <div className="mt-5 space-y-4">
        {keys.map((key, index) => (
          <div key={key}>
            <button
              type="button"
              onClick={() => setSelected(key)}
              aria-label={`View ${projectMetricLabels[key]}`}
              className="group flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-left"
            >
              <span className="text-muted-foreground text-xs">
                {projectMetricLabels[key]}
              </span>
              <span className="financial-figure text-sm font-medium group-hover:underline">
                {money(key)}
              </span>
            </button>
            <div
              className="bg-muted mt-2 h-2 overflow-hidden rounded-sm"
              aria-hidden="true"
            >
              {widths[index] !== null && (
                <div
                  className={`h-full rounded-sm ${amountTone(metrics[key].value) === "negative" ? "bg-destructive" : index === 0 ? "bg-foreground/35" : "bg-primary"}`}
                  style={{ width: `${widths[index]}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  const vatLabel =
    amountTone(metrics.vatBalance.value) === "negative"
      ? "VAT credit"
      : "VAT balance";
  return (
    <div className="space-y-4">
      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <Panel
          title="Costs & profit"
          description="Recorded pricing · not final profit"
        >
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            {metric("profit", true)}
            <div className="text-right">
              <span className="text-muted-foreground text-xs">Markup</span>
              <p className="financial-figure text-lg font-semibold">
                {dashboard.markupRate === null
                  ? "Not available"
                  : formatRate(dashboard.markupRate)}
              </p>
            </div>
          </div>
          {bars(["cost", "sell"])}
          <p className="text-muted-foreground mt-3 text-xs">
            Freight, other costs and non-deductible VAT included.
          </p>
          <details className="group mt-5 border-t pt-4">
            <summary className="flex list-none items-center justify-between gap-3 text-sm font-medium">
              Budget estimate
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 group-open:rotate-180"
              />
            </summary>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {metric("expectedCost")}
              {metric("expectedProfit")}
              <div>
                <span className="text-muted-foreground text-xs">
                  Expected markup
                </span>
                <p className="financial-figure mt-1 text-base font-semibold">
                  {dashboard.expectedMarkupRate === null
                    ? "Estimate needed"
                    : formatRate(dashboard.expectedMarkupRate)}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Full Billing plan less full approved budget, not costs entered so
              far. This is an estimate.
            </p>
            <div className="mt-3">
              <EditProjectBudgetButton />
            </div>
          </details>
          <Link
            href={related("orders")}
            className="text-primary mt-auto flex items-center gap-1 pt-5 text-xs font-medium"
          >
            Open Purchasing
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Panel>
        <Panel title="Client Billing" description="Issued and planned · HT">
          <div className="mt-5">{metric("toInvoice", true)}</div>
          <div
            className="bg-muted mt-5 flex h-3 overflow-hidden rounded-sm"
            aria-hidden="true"
          >
            {progress !== null && (
              <div
                className="bg-primary h-full"
                style={{ width: `${progress}%` }}
              />
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {metric("invoiced")}
            {metric("planned")}
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            {progress !== null
              ? "Blue is issued. The remainder is not yet invoiced."
              : metrics.planned.value === null
                ? "Review missing Billing amounts or FX."
                : "No positive Billing plan recorded."}
          </p>
          <div className="mt-5 border-t pt-4">{metric("coverage")}</div>
          <p className="text-muted-foreground mt-2 text-xs">
            Eligible issued allocations and approved remainder, less Order
            selling prices.
          </p>
          <Link
            href={related("work")}
            className="text-primary mt-auto flex items-center gap-1 pt-5 text-xs font-medium"
          >
            Open Billing
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Panel>
        <Panel title="Cash" description="Recorded payments · TTC">
          <div className="mt-5">{metric("cash", true)}</div>
          {bars(["received", "paid"])}
          <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4">
            {metric("toCollect")}
            {metric("toPay")}
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            Net of actual refunds. Tracked cash, not a bank balance.
          </p>
          <Link
            href={related("payment-terms")}
            className="text-primary mt-auto flex items-center gap-1 pt-5 text-xs font-medium"
          >
            Open payment terms
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <details className="record-surface group min-w-0" id="finance">
          <summary className="flex list-none flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              VAT
              <ChevronDown
                aria-hidden="true"
                className="size-4 group-open:rotate-180"
              />
            </span>
            <span className="financial-figure text-sm font-semibold">
              {vatLabel} · {money("vatBalance")}
            </span>
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {metric("vatOutput")}
            {metric("vatInput")}
            {metric("vatBalance", false, vatLabel)}
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            Issued output VAT less deductible input VAT. Management view, not a
            tax return.
          </p>
        </details>
        <details className="record-surface group min-w-0">
          <summary className="flex list-none flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              Freight
              <ChevronDown
                aria-hidden="true"
                className="size-4 group-open:rotate-180"
              />
            </span>
            <span
              className={`financial-figure text-sm font-semibold ${resultColors[amountTone(metrics.freightInvoicedGap.value)]}`}
            >
              Invoiced coverage · {money("freightInvoicedGap")}
            </span>
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                "freightCost",
                "freightTarget",
                "freightInvoiced",
                "freightReceived",
                "freightInvoicedGap",
                "freightPaidGap",
              ] as const
            ).map((key) => (
              <div key={key}>{metric(key)}</div>
            ))}
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            Received freight is a proportional share of actual receipts, after
            credits and refunds.
          </p>
        </details>
      </div>
      <ProjectReviewAlerts dashboard={dashboard} />
      {selected && (
        <ProjectMetricDrawer
          title={projectMetricLabels[selected]}
          metric={metrics[selected]}
          currency={currency}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ProjectReviewAlerts({ dashboard }: { dashboard: ProjectDashboard }) {
  if (dashboard.alerts.length === 0) return null;
  const row = (alert: ProjectDashboard["alerts"][number], index: number) => (
    <li key={`${alert.href}:${index}`} className="flex items-start gap-2 py-2">
      <CircleAlert
        aria-hidden="true"
        className="text-warning mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0">
        <Link
          href={alert.href}
          className="text-sm font-medium underline underline-offset-4"
        >
          {alert.label}
        </Link>
        <p className="text-muted-foreground mt-1 text-xs">{alert.note}</p>
      </div>
    </li>
  );
  return (
    <section aria-label="Needs attention" className="record-surface">
      <h2 className="text-sm font-semibold">Needs attention</h2>
      <ul className="mt-2 divide-y">{dashboard.alerts.slice(0, 3).map(row)}</ul>
      {dashboard.alerts.length > 3 && (
        <details className="mt-2 border-t pt-3">
          <summary className="text-xs font-medium">
            More checks ({dashboard.alerts.length - 3})
          </summary>
          <ul className="mt-2 divide-y">
            {dashboard.alerts.slice(3).map(row)}
          </ul>
        </details>
      )}
    </section>
  );
}
