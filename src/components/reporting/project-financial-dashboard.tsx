import Link from "next/link";

import { CashFlowPanel } from "@/components/reporting/cash-flow-panel";
import { OverdueItems } from "@/components/reporting/overdue-items";
import { Badge } from "@/components/ui/badge";
import type { CashFlowHorizon } from "@/config/reporting";
import { formatDateOnly } from "@/domain/payments/dates";
import {
  formatMoney,
  formatRate,
  formatSignedMoney,
  formatSignedRate,
} from "@/domain/procurement/presentation";
import type {
  ProjectReportingSnapshot,
  SerializedAggregateAmount,
  SerializedDirectionPaymentSummary,
} from "@/lib/reporting/reports";
import type { ProjectFinancialPerformance } from "@/domain/projects/targets";
import type { ProjectVatPosition } from "@/domain/vat/position";

interface Phase11BillingSummary {
  complete: boolean;
  invoicedComplete: boolean;
  invoicedHt: string;
  invoicedTtc: string;
  nextDueDate: string | null;
  outstandingTtc: string;
  overdueTtc: string;
  outputVat: string;
  outputVatComplete: boolean;
  paidTtc: string;
  quotedHt: string;
  scheduleComplete: boolean;
  upcomingScheduledTtc: string | null;
}

interface FreightReconciliationView {
  actualComplete: boolean;
  actualCostHt: string | null;
  complete: boolean;
  defaultFreightMarkupRate: string;
  expectedFreightAllowanceHt: string | null;
  expectedProductPurchaseCostHt: string | null;
  freightEstimateRate: string | null;
  freightGrossProfitHt: string | null;
  headroomHt: string | null;
  planningComplete: boolean;
  projectExpenseDeductibleInputVat: SerializedAggregateAmount;
  projectExpenseEconomicCost: SerializedAggregateAmount;
  recoveryTargetHt: string | null;
}

function FinancialPerformanceTable({
  currencyCode,
  performance,
  projectId,
}: {
  currencyCode: string;
  performance: ProjectFinancialPerformance;
  projectId: string;
}) {
  const rows = [
    [
      "Cost HT",
      "money",
      performance.target.costHt,
      performance.actual.costHt,
      performance.variance.costHt,
    ],
    [
      "Client Sell / Billing HT",
      "money",
      performance.target.sellHt,
      performance.actual.sellHt,
      performance.variance.sellHt,
    ],
    [
      "Gross Profit HT",
      "money",
      performance.target.grossProfitHt,
      performance.actual.grossProfitHt,
      performance.variance.grossProfitHt,
    ],
    [
      "Markup",
      "rate",
      performance.target.markupRate,
      performance.actual.markupRate,
      performance.variance.markupRate,
    ],
    [
      "Margin",
      "rate",
      performance.target.marginRate,
      performance.actual.marginRate,
      performance.variance.marginRate,
    ],
  ] as const;
  const complete =
    performance.target.costHt !== null &&
    performance.target.sellHt !== null &&
    performance.actual.costHt !== null &&
    performance.actual.sellHt !== null;
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
            Project financial performance
          </p>
          <h2 className="mt-0.5 text-sm font-semibold">
            Full-Project target vs actual to date
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            HT commercial performance in {currencyCode}; targets are not
            prorated for Project completion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={complete ? "outline" : "destructive"}>
            {complete ? "Complete" : "Incomplete"}
          </Badge>
          <Link
            className="border-input rounded-md border px-2.5 py-1.5 text-xs font-medium"
            href={`/billing?projectId=${projectId}`}
          >
            Open Billing
          </Link>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Metric</th>
              <th className="px-4 py-2 text-right">Target</th>
              <th className="px-4 py-2 text-right">Actual to date</th>
              <th className="px-4 py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(([label, kind, target, actual, variance]) => (
              <tr key={label}>
                <th className="px-4 py-2.5 font-medium">{label}</th>
                <td className="financial-figure px-4 py-2.5 text-right">
                  {kind === "rate"
                    ? formatRate(target)
                    : formatMoney(target, currencyCode)}
                </td>
                <td className="financial-figure px-4 py-2.5 text-right font-semibold">
                  {kind === "rate"
                    ? formatRate(actual)
                    : formatMoney(actual, currencyCode)}
                </td>
                <td className="financial-figure px-4 py-2.5 text-right">
                  {kind === "rate"
                    ? formatSignedRate(variance)
                    : formatSignedMoney(variance, currencyCode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!complete ? (
        <p className="text-destructive border-t px-4 py-2 text-xs">
          A required Project estimate, Invoice FX rate, Order FX rate, or
          freight-expense FX rate is missing.
        </p>
      ) : null}
    </section>
  );
}

function AggregateMoney({
  aggregate,
  currencyCode,
}: {
  aggregate: SerializedAggregateAmount;
  currencyCode: string;
}) {
  return (
    <>
      <span className="financial-figure">
        {formatMoney(aggregate.value, currencyCode)}
      </span>
      {!aggregate.complete ? (
        <span className="text-destructive mt-0.5 block text-[0.6875rem]">
          Partial · {aggregate.missingIds.length} missing
        </span>
      ) : null}
    </>
  );
}

function SupplierPaymentSummary({
  currencyCode,
  summary,
}: {
  currencyCode: string;
  summary: SerializedDirectionPaymentSummary;
}) {
  const rows = [
    ["Supplier payable", summary.base],
    ["Scheduled", summary.scheduled],
    ["Paid", summary.paid],
    ["Scheduled outstanding", summary.scheduledOutstanding],
    ["Unscheduled", summary.unscheduled],
    ["Total remaining", summary.totalRemaining],
    ["Overdue", summary.overdue],
  ] as const;
  return (
    <article className="overflow-hidden rounded-lg border">
      <header className="bg-muted/25 border-b px-3 py-2.5">
        <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
          Cash out
        </p>
        <h3 className="mt-0.5 text-sm font-semibold">Supplier payments</h3>
      </header>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 p-3 text-xs xl:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-semibold">
              {typeof value === "string" || value === null ? (
                <span className="financial-figure">
                  {formatMoney(value, currencyCode)}
                </span>
              ) : (
                <AggregateMoney aggregate={value} currencyCode={currencyCode} />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function ClientCollectionSummary({
  billing,
  currencyCode,
  projectId,
}: {
  billing: Phase11BillingSummary | null;
  currencyCode: string;
  projectId: string;
}) {
  const rows = [
    ["Client invoiced TTC", billing?.invoicedTtc ?? null],
    ["Client received TTC", billing?.paidTtc ?? null],
    ["Client outstanding TTC", billing?.outstandingTtc ?? null],
    ["Client overdue TTC", billing?.overdueTtc ?? null],
    [
      "Upcoming scheduled TTC",
      billing?.scheduleComplete ? billing.upcomingScheduledTtc : null,
    ],
  ] as const;
  return (
    <article className="overflow-hidden rounded-lg border">
      <header className="bg-muted/25 flex items-start justify-between gap-3 border-b px-3 py-2.5">
        <div>
          <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
            Cash in
          </p>
          <h3 className="mt-0.5 text-sm font-semibold">Client collection</h3>
        </div>
        <Link
          className="text-primary text-xs hover:underline"
          href={`/billing?projectId=${projectId}`}
        >
          Open Billing
        </Link>
      </header>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 p-3 text-xs xl:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="financial-figure mt-1 font-semibold">
              {formatMoney(value, currencyCode)}
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-muted-foreground">Next due</dt>
          <dd className="mt-1 font-semibold">
            {formatDateOnly(billing?.nextDueDate ?? null)}
          </dd>
        </div>
      </dl>
      {!billing?.complete || !billing.scheduleComplete ? (
        <p className="text-destructive border-t px-3 py-2 text-xs">
          Collection totals are incomplete because a required FX rate is
          missing.
        </p>
      ) : null}
    </article>
  );
}

export function ProjectFinancialDashboard({
  billing,
  financialPerformance,
  freight,
  horizon,
  phase11CashPosition,
  projectId,
  report,
  vatPosition,
}: {
  billing: Phase11BillingSummary | null;
  financialPerformance: ProjectFinancialPerformance;
  freight: FreightReconciliationView | null;
  horizon: CashFlowHorizon;
  phase11CashPosition: string | null;
  projectId: string;
  report: ProjectReportingSnapshot;
  vatPosition: ProjectVatPosition;
}) {
  const currency = report.reportingCurrencyCode;
  const vatPositionLabel =
    vatPosition.status === "PAYABLE"
      ? "VAT payable to State"
      : vatPosition.status === "CREDIT"
        ? "VAT credit / deductible"
        : "VAT position";
  return (
    <div className="space-y-5">
      <FinancialPerformanceTable
        currencyCode={currency}
        performance={financialPerformance}
        projectId={projectId}
      />
      <section className="bg-card rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Freight reconciliation</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Project planning allowance versus recovery required by actual
              Order and Project-level freight costs.
            </p>
          </div>
          <Badge variant={freight?.complete ? "outline" : "destructive"}>
            {freight?.complete
              ? "Complete"
              : "Incomplete · check planning / FX"}
          </Badge>
        </div>
        <h3 className="text-muted-foreground mt-4 text-xs font-semibold tracking-wide uppercase">
          Planning
        </h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(
            [
              [
                "Expected Product Purchase Cost HT",
                freight?.expectedProductPurchaseCostHt ?? null,
                "money",
              ],
              [
                "Freight Estimate %",
                freight?.freightEstimateRate ?? null,
                "rate",
              ],
              [
                "Expected Freight Allowance HT",
                freight?.expectedFreightAllowanceHt ?? null,
                "money",
              ],
            ] as const
          ).map(([label, value, kind]) => (
            <div className="bg-muted/25 rounded-md border p-3" key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="financial-figure mt-1 text-sm font-semibold">
                {kind === "rate"
                  ? formatRate(value)
                  : formatMoney(value, currency)}
              </dd>
            </div>
          ))}
        </dl>
        <h3 className="text-muted-foreground mt-4 text-xs font-semibold tracking-wide uppercase">
          Actual
        </h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["Actual Freight Cost HT", freight?.actualCostHt ?? null],
              ["Freight Recovery Target HT", freight?.recoveryTargetHt ?? null],
              [
                "Freight Gross Profit HT",
                freight?.freightGrossProfitHt ?? null,
              ],
              ["Freight Variance / Headroom", freight?.headroomHt ?? null],
            ] as const
          ).map(([label, value]) => (
            <div className="bg-muted/25 rounded-md border p-3" key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="financial-figure mt-1 text-sm font-semibold">
                {formatMoney(value, currency)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-3 text-xs">
          Default Freight Markup:{" "}
          {formatRate(freight?.defaultFreightMarkupRate ?? null)}. Cash timing
          remains in Supplier Payments.
        </p>
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Order commercial plan</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Procurement Order costs and planned selling values; Invoice billing
            remains the actual revenue source above.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              ["Purchase cost HT", report.financial.totals.purchaseCost],
              ["Freight", report.financial.totals.freight],
              ["Customs / duties", report.financial.totals.customsDuties],
              ["Miscellaneous", report.financial.totals.miscellaneous],
              ["Landed cost HT", report.financial.totals.landedCost],
              [
                "Order economic landed cost",
                report.financial.totals.economicLandedCost,
              ],
              [
                "Package selling price HT",
                report.financial.totals.packageSellingPrice,
              ],
              [
                "Separately recharged freight",
                report.financial.totals.rechargedFreight,
              ],
              ["Order planned sales HT", report.financial.totals.salesRevenue],
            ].map(([label, aggregate]) => (
              <div className="contents" key={label as string}>
                <dt className="text-muted-foreground py-1">
                  {label as string}
                </dt>
                <dd className="py-1 text-right font-medium">
                  <AggregateMoney
                    aggregate={aggregate as SerializedAggregateAmount}
                    currencyCode={currency}
                  />
                </dd>
              </div>
            ))}
            <dt className="border-t pt-2 font-medium">
              Order planned gross profit
            </dt>
            <dd className="financial-figure border-t pt-2 text-right font-semibold">
              {formatMoney(report.financial.grossProfit, currency)}
            </dd>
            <dt>Markup / analytical margin</dt>
            <dd className="financial-figure text-right font-semibold">
              {formatRate(report.financial.markupRate)} /{" "}
              {formatRate(report.financial.grossMarginRate)}
            </dd>
          </dl>
        </article>
        <article className="bg-card rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
                Project VAT position
              </p>
              <h2 className="mt-0.5 text-sm font-semibold">
                Invoice output VAT vs deductible input VAT
              </h2>
            </div>
            <Badge variant={vatPosition.complete ? "outline" : "destructive"}>
              {vatPosition.status ?? "INCOMPLETE"}
            </Badge>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <dt className="text-muted-foreground">Output VAT</dt>
            <dd className="financial-figure text-right font-medium">
              {formatMoney(vatPosition.outputVat, currency)}
            </dd>
            <dt className="text-muted-foreground">Deductible input VAT</dt>
            <dd className="financial-figure text-right font-medium">
              {formatMoney(vatPosition.deductibleInputVat, currency)}
            </dd>
            <dt className="border-t pt-3 font-medium">{vatPositionLabel}</dt>
            <dd className="financial-figure border-t pt-3 text-right text-base font-semibold">
              {formatMoney(vatPosition.positionAmount, currency)}
            </dd>
          </dl>
          <details className="mt-4 border-t pt-3 text-xs">
            <summary className="cursor-pointer font-medium">VAT detail</summary>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">
                Order deductible input VAT
              </dt>
              <dd className="text-right">
                <AggregateMoney
                  aggregate={report.financial.totals.recoverableInputVat}
                  currencyCode={currency}
                />
              </dd>
              <dt className="text-muted-foreground">
                Freight-expense deductible VAT
              </dt>
              <dd className="text-right">
                {freight ? (
                  <AggregateMoney
                    aggregate={freight.projectExpenseDeductibleInputVat}
                    currencyCode={currency}
                  />
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">
                Order non-deductible input VAT
              </dt>
              <dd className="text-right">
                <AggregateMoney
                  aggregate={report.financial.totals.nonRecoverableInputVat}
                  currencyCode={currency}
                />
              </dd>
            </dl>
          </details>
          {!vatPosition.complete ? (
            <p className="text-destructive mt-3 text-xs">
              VAT position is incomplete because a required Invoice, Order, or
              freight-expense FX rate is missing.
            </p>
          ) : null}
        </article>
        <article className="bg-card rounded-lg border p-4">
          <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
            Cash position
          </p>
          <h2 className="mt-0.5 text-sm font-semibold">
            Client cash received minus Supplier cash paid
          </h2>
          <p className="financial-figure mt-4 text-lg font-semibold">
            {formatMoney(phase11CashPosition, currency)}
          </p>
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            A negative value means the company has financed more Supplier cash
            than it has received from the Client. Cash timing does not change
            Project VAT or HT profit.
          </p>
        </article>
      </section>

      <section className="bg-card rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Payment & collection position
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Supplier payments and authoritative Client Billing collections;
              TTC cash remains distinct from HT margin.
            </p>
          </div>
          <Link
            className="border-input rounded-md border px-2.5 py-1.5 text-xs font-medium"
            href={`/payments?projectId=${projectId}&direction=SUPPLIER_PAYMENT`}
          >
            Open Supplier Payments
          </Link>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <SupplierPaymentSummary
            currencyCode={currency}
            summary={report.payments.supplier}
          />
          <ClientCollectionSummary
            billing={billing}
            currencyCode={currency}
            projectId={projectId}
          />
        </div>
      </section>

      <section className="bg-card overflow-hidden rounded-lg border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Order financial breakdown</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Comparable values are shown in {currency}; effective markup is
            calculated from monetary totals, never averaged.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[78rem] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2 text-right">Purchase</th>
                <th className="px-3 py-2 text-right">Landed</th>
                <th className="px-3 py-2 text-right">Selling</th>
                <th className="px-3 py-2 text-right">Gross profit</th>
                <th className="px-3 py-2 text-right">Markup</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2 text-right">Supplier outstanding</th>
                <th className="px-3 py-2 text-right">
                  Legacy Order plan remaining
                </th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.orderRows.map((order) => (
                <tr key={order.id}>
                  <td className="px-3 py-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/orders/${order.id}`}
                    >
                      {order.packageName}
                    </Link>
                    <span className="text-muted-foreground block font-mono">
                      {order.orderNumber}
                    </span>
                  </td>
                  <td className="px-3 py-2">{order.supplierName}</td>
                  {[
                    order.purchaseCost,
                    order.landedCost,
                    order.salesRevenue,
                    order.grossProfit,
                  ].map((value, index) => (
                    <td
                      className="financial-figure px-3 py-2 text-right"
                      key={`${order.id}-financial-${index}`}
                    >
                      {formatMoney(value, currency)}
                    </td>
                  ))}
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatRate(order.markupRate)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatRate(order.grossMarginRate)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(order.supplierOutstanding, currency)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(order.clientOutstanding, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {order.status.replaceAll("_", " ")}
                    {!order.complete ? (
                      <span className="text-destructive block">Incomplete</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.orderRows.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            No Procurement Orders have been added to this Project.
          </p>
        ) : null}
      </section>

      <CashFlowPanel
        baseHref={`/projects/${projectId}`}
        cashFlow={report.cashFlow}
        currencyCode={currency}
        horizon={horizon}
      />
      <OverdueItems items={report.overdueItems} />
    </div>
  );
}
