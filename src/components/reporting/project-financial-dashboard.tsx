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
import type { ProjectFundingCoverage } from "@/domain/billing/funding-coverage";
import type { ClientBillingSummary } from "@/lib/billing/reporting";
import { formatEnumLabel } from "@/domain/presentation/labels";

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
              <th className="px-4 py-2 text-right">Project target</th>
              <th className="px-4 py-2 text-right">Actual invoiced to date</th>
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
          A required Project estimate, Invoice FX rate, Supplier Order FX rate,
          or freight-expense FX rate is missing.
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

function FundingCoverageSummary({
  coverage,
  currencyCode,
}: {
  coverage: ProjectFundingCoverage;
  currencyCode: string;
}) {
  const statusLabel =
    coverage.status === "EXCESS_BILLING_COVERAGE"
      ? "Excess Billing Coverage"
      : coverage.status === "FUNDING_GAP"
        ? "Funding Gap"
        : coverage.status === "FULLY_COVERED"
          ? "Fully Covered"
          : "Incomplete";
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
            Funding Coverage
          </p>
          <h2 className="mt-0.5 text-sm font-semibold">
            Client Billing available for Supplier Orders
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Active Invoice allocations plus approved Project remainder, less
            authoritative Supplier Order Sell HT. Cash and VAT are separate.
          </p>
        </div>
        <Badge
          variant={
            coverage.complete && coverage.status !== "FUNDING_GAP"
              ? "outline"
              : "destructive"
          }
        >
          {statusLabel}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Supplier Orders Sell HT", coverage.supplierOrderSellHt],
            ["Client Billing Coverage HT", coverage.clientBillingCoverageHt],
            ["Funding Coverage", coverage.fundingCoverageHt],
          ] as const
        ).map(([label, value], index) => (
          <div className="bg-muted/25 rounded-md border p-3" key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {index === 2
                ? formatSignedMoney(value, currencyCode)
                : formatMoney(value, currencyCode)}
            </dd>
          </div>
        ))}
      </dl>
      {!coverage.complete ? (
        <p className="text-destructive mt-3 text-xs">
          Funding Coverage is incomplete because a required Invoice or Supplier
          Order FX rate is missing.
        </p>
      ) : null}
    </section>
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
  billing: ClientBillingSummary | null;
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
  fundingCoverage,
  horizon,
  phase11CashPosition,
  projectId,
  report,
  vatPosition,
}: {
  billing: ClientBillingSummary | null;
  financialPerformance: ProjectFinancialPerformance;
  freight: FreightReconciliationView | null;
  fundingCoverage: ProjectFundingCoverage;
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
      <FundingCoverageSummary
        coverage={fundingCoverage}
        currencyCode={currency}
      />
      <details className="bg-card rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Freight reconciliation
        </summary>
        <section className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Freight reconciliation</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Project planning allowance versus recovery required by actual
                Supplier Order and Project-level freight costs.
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
                <dt
                  className="text-muted-foreground text-xs"
                  title={
                    label === "Expected Freight Allowance HT"
                      ? "Project Expected Product Purchase Cost HT × Freight Estimate %. This is a planning allowance, not live Order freight."
                      : undefined
                  }
                >
                  {label}
                </dt>
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
                [
                  "Freight Recovery Target HT",
                  freight?.recoveryTargetHt ?? null,
                ],
                [
                  "Freight Gross Profit HT",
                  freight?.freightGrossProfitHt ?? null,
                ],
                ["Freight Headroom HT", freight?.headroomHt ?? null],
              ] as const
            ).map(([label, value]) => (
              <div className="bg-muted/25 rounded-md border p-3" key={label}>
                <dt
                  className="text-muted-foreground text-xs"
                  title={
                    label === "Actual Freight Cost HT"
                      ? "Actual Supplier Order freight plus Project-level freight expenses."
                      : undefined
                  }
                >
                  {label}
                </dt>
                <dd className="financial-figure mt-1 text-sm font-semibold">
                  {formatMoney(value, currency)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground mt-3 text-xs">
            Positive Freight Headroom means the Project planning allowance
            exceeds the recovery target. Negative headroom signals a shortfall.{" "}
            Default Freight Markup:{" "}
            {formatRate(freight?.defaultFreightMarkupRate ?? null)}. Cash timing
            remains in Supplier Payments.
          </p>
        </section>
      </details>
      <details className="bg-card rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Supplier Order plan, VAT & cash position
        </summary>
        <section className="mt-4 grid gap-4 xl:grid-cols-3">
          <article className="bg-card rounded-lg border p-4">
            <h2 className="text-sm font-semibold">
              Supplier Order commercial plan
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Supplier Order costs and planned selling values; Invoice billing
              remains the actual revenue source above.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {[
                ["Purchase Cost HT", report.financial.totals.purchaseCost],
                ["Freight", report.financial.totals.freight],
                ["Customs / duties", report.financial.totals.customsDuties],
                ["Miscellaneous", report.financial.totals.miscellaneous],
                [
                  "Economic Landed Cost HT",
                  report.financial.totals.economicLandedCost,
                ],
                [
                  "Package Sell HT",
                  report.financial.totals.packageSellingPrice,
                ],
                [
                  "Separately recharged freight",
                  report.financial.totals.rechargedFreight,
                ],
                [
                  "Total Supplier Order Sell HT",
                  report.financial.totals.salesRevenue,
                ],
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
                Supplier Order Planned Gross Profit HT
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
            <details className="mt-4 border-t pt-3 text-xs">
              <summary className="cursor-pointer font-medium">
                Advanced cost detail
              </summary>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Landed Cost HT</dt>
                <dd className="text-right">
                  <AggregateMoney
                    aggregate={report.financial.totals.landedCost}
                    currencyCode={currency}
                  />
                </dd>
              </dl>
            </details>
          </article>
          <article className="bg-card rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
                  Project VAT position
                </p>
                <h2 className="mt-0.5 text-sm font-semibold">
                  Confirmed Client Invoice output VAT vs deductible input VAT
                </h2>
              </div>
              <Badge variant={vatPosition.complete ? "outline" : "destructive"}>
                {vatPosition.status ?? "INCOMPLETE"}
              </Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <dt className="text-muted-foreground">
                Client Invoice Output VAT
              </dt>
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
              <summary className="cursor-pointer font-medium">
                VAT detail
              </summary>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">
                  Supplier Order deductible input VAT
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
                  Supplier Order non-deductible input VAT
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
                VAT position is incomplete because a required Invoice, Supplier
                Order, or freight-expense FX rate is missing.
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
      </details>

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

      <details className="bg-card rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Supplier Order financial breakdown
        </summary>
        <section className="mt-4 overflow-hidden rounded-lg border">
          <header className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">
              Supplier Order financial breakdown
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Comparable values are shown in {currency}; effective markup is
              calculated from monetary totals, never averaged.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[78rem] text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Supplier Order</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2 text-right">Purchase Cost HT</th>
                  <th className="px-3 py-2 text-right">Landed Cost HT</th>
                  <th className="px-3 py-2 text-right">
                    Total Supplier Order Sell HT
                  </th>
                  <th className="px-3 py-2 text-right">
                    Supplier Order Planned Gross Profit HT
                  </th>
                  <th className="px-3 py-2 text-right">Planned Markup</th>
                  <th className="px-3 py-2 text-right">Planned Margin</th>
                  <th className="px-3 py-2 text-right">Supplier outstanding</th>
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
                    <td className="px-3 py-2">
                      {formatEnumLabel(order.status)}
                      {!order.complete ? (
                        <span className="text-destructive block">
                          Incomplete
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.orderRows.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              No Supplier Orders have been added to this Project.
            </p>
          ) : null}
        </section>
      </details>

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
