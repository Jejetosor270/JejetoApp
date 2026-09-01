import Link from "next/link";

import { CashFlowPanel } from "@/components/reporting/cash-flow-panel";
import { OverdueItems } from "@/components/reporting/overdue-items";
import { Badge } from "@/components/ui/badge";
import type { CashFlowHorizon } from "@/config/reporting";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import type {
  ProjectReportingSnapshot,
  SerializedAggregateAmount,
  SerializedDirectionPaymentSummary,
} from "@/lib/reporting/reports";
import type { ProjectTargetSummary } from "@/domain/projects/targets";

interface Phase11BillingSummary {
  complete: boolean;
  invoicedHt: string;
  outstandingTtc: string;
  overdueTtc: string;
  paidTtc: string;
  quotedHt: string;
}

interface ActualProfitability {
  grossProfit: string | null;
  marginRate: string | null;
  markupRate: string | null;
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

function PaymentDirectionSummary({
  currencyCode,
  direction,
  summary,
}: {
  currencyCode: string;
  direction: "supplier" | "client";
  summary: SerializedDirectionPaymentSummary;
}) {
  const supplier = direction === "supplier";
  return (
    <article className="overflow-hidden rounded-lg border">
      <header className="bg-muted/25 border-b px-3 py-2.5">
        <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
          {supplier ? "Cash out" : "Cash in"}
        </p>
        <h3 className="mt-0.5 text-sm font-semibold">
          {supplier ? "Supplier payments" : "Client receipts"}
        </h3>
      </header>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 p-3 text-xs xl:grid-cols-4">
        {(
          [
            [supplier ? "Supplier payable" : "Client receivable", summary.base],
            ["Scheduled", summary.scheduled],
            [supplier ? "Paid" : "Received", summary.paid],
            ["Scheduled outstanding", summary.scheduledOutstanding],
            ["Unscheduled", summary.unscheduled],
            ["Total remaining", summary.totalRemaining],
            ["Overdue", summary.overdue],
          ] as const
        ).map(([label, value]) => (
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

export function ProjectFinancialDashboard({
  actualProfitability,
  billing,
  clientBudgetTargetHt,
  horizon,
  phase11CashPosition,
  projectId,
  report,
  targets,
  variances,
}: {
  actualProfitability: ActualProfitability;
  billing: Phase11BillingSummary | null;
  clientBudgetTargetHt: string | null;
  horizon: CashFlowHorizon;
  phase11CashPosition: string | null;
  projectId: string;
  report: ProjectReportingSnapshot;
  targets: ProjectTargetSummary;
  variances: {
    cost: string | null;
    markup: string | null;
    sell: string | null;
  };
}) {
  const currency = report.reportingCurrencyCode;
  const missingOrders = report.orderRows.filter((order) =>
    report.financial.missingOrderIds.includes(order.id),
  );
  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Budget / Target</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Planning values in {currency}; Client Budget remains independent
            from markup-derived expected sell.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            {(
              [
                ["Client Budget Target HT", clientBudgetTargetHt, "money"],
                [
                  "Estimated economic cost HT",
                  targets.estimatedCostHt,
                  "money",
                ],
                ["Target markup", targets.targetMarkupRate, "rate"],
                ["Expected sell HT", targets.expectedSellHt, "money"],
                ["Expected gross profit", targets.expectedGrossProfit, "money"],
                ["Expected margin", targets.expectedMarginRate, "rate"],
              ] as const
            ).map(([label, value, kind]) => (
              <div className="contents" key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="financial-figure text-right font-semibold">
                  {kind === "rate"
                    ? formatRate(value)
                    : formatMoney(value, currency)}
                </dd>
              </div>
            ))}
          </dl>
        </article>
        <article className="bg-card rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                Client Billing & actual profitability
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Billing is authoritative for actual Client sell; Order selling
                values remain the procurement plan.
              </p>
            </div>
            <Link
              className="border-input rounded-md border px-2.5 py-1.5 text-xs font-medium"
              href={`/billing?projectId=${projectId}`}
            >
              Open Billing
            </Link>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            {(
              [
                ["Client quoted HT", billing?.quotedHt ?? null],
                ["Client invoiced HT", billing?.invoicedHt ?? null],
                ["Client paid TTC", billing?.paidTtc ?? null],
                ["Client outstanding TTC", billing?.outstandingTtc ?? null],
                ["Client overdue TTC", billing?.overdueTtc ?? null],
                ["Actual gross profit HT", actualProfitability.grossProfit],
              ] as const
            ).map(([label, value]) => (
              <div className="contents" key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="financial-figure text-right font-semibold">
                  {formatMoney(value, currency)}
                </dd>
              </div>
            ))}
            <dt className="text-muted-foreground">Actual markup / margin</dt>
            <dd className="financial-figure text-right font-semibold">
              {formatRate(actualProfitability.markupRate)} /{" "}
              {formatRate(actualProfitability.marginRate)}
            </dd>
            <dt className="text-muted-foreground">
              Sell / cost / markup variance
            </dt>
            <dd className="financial-figure text-right font-semibold">
              {formatMoney(variances.sell, currency)} /{" "}
              {formatMoney(variances.cost, currency)} /{" "}
              {formatRate(variances.markup)}
            </dd>
          </dl>
          {!billing?.complete ? (
            <p className="text-destructive mt-3 text-xs">
              Client billing totals are incomplete because a required FX rate is
              missing.
            </p>
          ) : null}
        </article>
      </section>
      <section className="bg-card rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Financial overview</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Commercial profitability in {currency}; VAT is shown separately
              and cash timing is reported below.
            </p>
          </div>
          <Badge
            variant={report.financial.complete ? "outline" : "destructive"}
          >
            {report.financial.complete ? "Complete" : "Incomplete"}
          </Badge>
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <div className="bg-muted/25 rounded-md border p-3">
            <dt className="text-muted-foreground text-xs">Sales HT</dt>
            <dd className="mt-1 text-sm font-semibold">
              <AggregateMoney
                aggregate={report.financial.totals.salesRevenue}
                currencyCode={currency}
              />
            </dd>
          </div>
          <div className="bg-muted/25 rounded-md border p-3">
            <dt className="text-muted-foreground text-xs">
              Economic landed cost
            </dt>
            <dd className="mt-1 text-sm font-semibold">
              <AggregateMoney
                aggregate={report.financial.totals.economicLandedCost}
                currencyCode={currency}
              />
            </dd>
          </div>
          <div className="bg-muted/25 rounded-md border p-3">
            <dt className="text-muted-foreground text-xs">Gross profit</dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {formatMoney(report.financial.grossProfit, currency)}
            </dd>
          </div>
          <div className="bg-muted/25 rounded-md border p-3">
            <dt className="text-muted-foreground text-xs">Gross margin</dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {formatRate(report.financial.grossMarginRate)}
            </dd>
          </div>
          <div className="bg-muted/25 rounded-md border p-3">
            <dt className="text-muted-foreground text-xs">
              Supplier outstanding
            </dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {formatMoney(report.payments.supplier.totalRemaining, currency)}
            </dd>
          </div>
          <div className="bg-muted/25 rounded-md border p-3">
            <dt className="text-muted-foreground text-xs">
              Client outstanding
            </dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              {formatMoney(report.payments.client.totalRemaining, currency)}
            </dd>
          </div>
        </dl>
        {missingOrders.length ? (
          <div className="border-destructive/30 bg-destructive/5 mt-3 rounded-md border px-3 py-2 text-xs">
            <p className="text-destructive font-medium">
              Project profitability is incomplete because required financial or
              FX data is missing.
            </p>
            <p className="text-muted-foreground mt-1">
              Affected Orders:{" "}
              {missingOrders.map((order, index) => (
                <span key={order.id}>
                  {index ? ", " : ""}
                  <Link
                    className="text-primary hover:underline"
                    href={`/orders/${order.id}`}
                  >
                    {order.orderNumber}
                  </Link>
                </span>
              ))}
              .
            </p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Procurement & sales</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              ["Purchase cost HT", report.financial.totals.purchaseCost],
              ["Freight", report.financial.totals.freight],
              ["Customs / duties", report.financial.totals.customsDuties],
              ["Miscellaneous", report.financial.totals.miscellaneous],
              ["Landed cost HT", report.financial.totals.landedCost],
              [
                "Economic landed cost",
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
              ["Total sales HT", report.financial.totals.salesRevenue],
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
            <dt className="border-t pt-2 font-medium">Gross profit</dt>
            <dd className="financial-figure border-t pt-2 text-right font-semibold">
              {formatMoney(report.financial.grossProfit, currency)}
            </dd>
            <dt>Gross margin / Markup</dt>
            <dd className="financial-figure text-right font-semibold">
              {formatRate(report.financial.grossMarginRate)} /{" "}
              {formatRate(report.financial.markupRate)}
            </dd>
          </dl>
        </article>
        <article className="bg-card rounded-lg border p-4">
          <h2 className="text-sm font-semibold">VAT overview</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            VAT remains separate from revenue and profit; only non-recoverable
            input VAT is included in economic cost.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            {[
              ["Input VAT", report.financial.totals.inputVat],
              [
                "Recoverable input VAT",
                report.financial.totals.recoverableInputVat,
              ],
              [
                "Non-recoverable input VAT",
                report.financial.totals.nonRecoverableInputVat,
              ],
              ["Output VAT", report.financial.totals.outputVat],
            ].map(([label, aggregate]) => (
              <div className="contents" key={label as string}>
                <dt className="text-muted-foreground">{label as string}</dt>
                <dd className="text-right font-medium">
                  <AggregateMoney
                    aggregate={aggregate as SerializedAggregateAmount}
                    currencyCode={currency}
                  />
                </dd>
              </div>
            ))}
          </dl>
          <div className="bg-muted/25 mt-5 rounded-md border p-3">
            <p className="text-muted-foreground text-xs">
              Project cash position
            </p>
            <p className="financial-figure mt-1 text-lg font-semibold">
              {formatMoney(phase11CashPosition, currency)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Phase 11 Client Billing receipts minus Supplier cash paid. A
              negative value means the company has financed more Supplier cash
              than it has received from the Client. This is not profit.
            </p>
          </div>
        </article>
      </section>

      <section className="bg-card rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Payment position</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              TTC payable/receivable bases remain distinct from HT margin.
            </p>
          </div>
          <Link
            className="border-input rounded-md border px-2.5 py-1.5 text-xs font-medium"
            href={`/payments?projectId=${projectId}`}
          >
            View installments
          </Link>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <PaymentDirectionSummary
            currencyCode={currency}
            direction="supplier"
            summary={report.payments.supplier}
          />
          <PaymentDirectionSummary
            currencyCode={currency}
            direction="client"
            summary={report.payments.client}
          />
        </div>
      </section>

      <section className="bg-card overflow-hidden rounded-lg border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Order financial breakdown</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Comparable values are shown in {currency}; margin percentages are
            calculated per Order, never averaged for the Project total.
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
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2 text-right">Markup</th>
                <th className="px-3 py-2 text-right">Supplier outstanding</th>
                <th className="px-3 py-2 text-right">Client outstanding</th>
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
                    {formatRate(order.grossMarginRate)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatRate(order.markupRate)}
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
