import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PortfolioReportingSnapshot } from "@/lib/reporting/reports";
import {
  cashChart,
  dashboardForecast,
  signedComparison,
} from "@/domain/finance/reports-dashboard";
import type { CashFlowHorizon } from "@/config/reporting";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { formatDateOnly } from "@/domain/payments/dates";
import { CashBars, dashboardLink, ProjectBars } from "./dashboard-charts";

export interface DashboardLinks {
  transactions: string;
  forecast: string;
  projects: string;
  coverage: string;
  vat: string;
  freight: string;
}

export type DashboardReport = Pick<
  PortfolioReportingSnapshot,
  | "companyCurrencyCode"
  | "cashFlow"
  | "pricing"
  | "supplierScoped"
  | "excludedCurrencyProjects"
> & {
  projects: readonly Pick<
    PortfolioReportingSnapshot["projects"][number],
    "id" | "name" | "reportingCurrencyCode" | "pricing" | "fundingCoverage"
  >[];
};

export function ReportsDashboard({
  report,
  links,
  horizon,
}: {
  report: DashboardReport;
  links: DashboardLinks;
  horizon: CashFlowHorizon;
}) {
  const currency = report.companyCurrencyCode;
  const history = report.cashFlow;
  const actual = history.totals;
  const trend = cashChart(
    history.rows.map((row) => ({
      month: row.month,
      incoming: row.actualComplete ? row.actualIn : null,
      outgoing: row.actualComplete ? row.actualOut : null,
      net: row.actualComplete ? row.actualNet : null,
    })),
  );
  const outlook = history.outlook;
  const forecast = outlook
    ? dashboardForecast(outlook, currency, horizon)
    : null;
  const comparable = report.projects.filter(
    (project) => project.reportingCurrencyCode === currency,
  );
  const profits = signedComparison(
    comparable.map((project) => ({
      id: project.id,
      name: project.name,
      amount: project.pricing?.profit.value ?? null,
      note:
        project.pricing?.profit.value === null || !project.pricing
          ? "Review cost or selling FX"
          : `Markup ${formatRate(project.pricing.markupRate)}`,
    })),
  );
  const coverage = signedComparison(
    comparable.map((project) => ({
      id: project.id,
      name: project.name,
      amount: project.fundingCoverage.complete
        ? project.fundingCoverage.fundingCoverageHt
        : null,
      note:
        project.fundingCoverage.status === "FUNDING_GAP"
          ? "Below Order sell"
          : project.fundingCoverage.status === "EXCESS_BILLING_COVERAGE"
            ? "Above Order sell"
            : project.fundingCoverage.complete
              ? "Order sell covered"
              : "Review Invoice or selling FX",
    })),
  );
  const pricing = report.pricing;
  return (
    <div className="space-y-5">
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <p>
          {report.projects.length} Projects · {currency} reporting
          {report.supplierScoped ? " · Supplier scope" : ""}
        </p>
        <p>
          Cash trend: {formatDateOnly(history.start)}–
          {formatDateOnly(history.end)}
        </p>
      </div>
      {report.supplierScoped ? (
        <p className="bg-muted/30 rounded-md border p-3 text-xs">
          Supplier Orders, freight, payments and refunds only. Client cash and
          Billing coverage are not attributed to a Supplier.
        </p>
      ) : null}
      {report.excludedCurrencyProjects.length > 0 ? (
        <div className="bg-warning-muted border-warning/30 rounded-md border p-3 text-xs">
          Excluded from these {currency} charts:{" "}
          {report.excludedCurrencyProjects.map((project, index) => (
            <span key={project.id}>
              {index ? ", " : ""}
              <Link className="underline" href={`/projects/${project.id}`}>
                {project.name} ({project.reportingCurrencyCode})
              </Link>
            </span>
          ))}
          . Open each Project for its own-currency figures.
        </div>
      ) : null}
      {report.projects.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-lg border p-8 text-center">
          No Projects match these filters. Adjust the filters to see your
          dashboard.
        </p>
      ) : null}
      <dl className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            report.supplierScoped ? "Refunds received" : "Cash received",
            actual.actualComplete ? actual.actualIn : null,
            "Selected period · TTC",
            links.transactions,
          ],
          [
            "Cash paid",
            actual.actualComplete ? actual.actualOut : null,
            "Selected period · TTC",
            links.transactions,
          ],
          [
            "Net movement",
            actual.actualComplete ? actual.actualNet : null,
            "Received less paid · TTC",
            links.transactions,
          ],
          [
            "Pricing profit",
            pricing?.profit.value ?? null,
            "Current Order sell less cost",
            links.projects,
          ],
        ].map(([label, value, note, href]) => (
          <div className="min-w-0" key={label}>
            <dt className="text-muted-foreground text-xs">
              <Link
                href={href ?? "/reports"}
                className="inline-flex items-center gap-1 hover:underline focus-visible:outline-2"
              >
                {label}
                <ArrowUpRight className="size-3" aria-hidden="true" />
              </Link>
            </dt>
            <dd className="financial-figure mt-2 text-xl font-semibold tracking-tight break-words">
              {value === null
                ? "Incomplete"
                : formatMoney(value ?? null, currency)}
            </dd>
            <p className="text-muted-foreground mt-1 text-xs">{note}</p>
          </div>
        ))}
      </dl>
      <div className="grid gap-5 xl:grid-cols-2">
        <section
          className="bg-card min-w-0 rounded-lg border p-4 sm:p-5"
          aria-labelledby="cash-trend-title"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="cash-trend-title" className="text-sm font-semibold">
              Cash trend
            </h2>
            <Link className={dashboardLink} href={links.transactions}>
              View transactions
            </Link>
          </header>
          <p className="text-muted-foreground mt-1 text-xs">
            Actual receipts and payments, including refunds. Not a bank balance.
          </p>
          {!actual.actualComplete ? (
            <p className="text-warning-foreground mt-2 text-xs">
              Missing actual FX: totals and affected months are incomplete.
            </p>
          ) : null}
          <CashBars
            chart={trend}
            title="Cash trend"
            currency={currency}
            href={links.transactions}
            partial="Current month to date"
          />
        </section>
        <section
          className="bg-card min-w-0 rounded-lg border p-4 sm:p-5"
          aria-labelledby="upcoming-cash-title"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="upcoming-cash-title" className="text-sm font-semibold">
              Upcoming cash
            </h2>
            <Link className={dashboardLink} href={links.forecast}>
              View forecast
            </Link>
          </header>
          <p className="text-muted-foreground mt-1 text-xs">
            Unpaid issued invoices and recorded obligations. Schedule-based, not
            guaranteed.
          </p>
          {forecast ? (
            <>
              <CashBars
                chart={forecast.chart}
                title="Upcoming cash"
                currency={currency}
                href={links.forecast}
                partial={`${formatDateOnly(forecast.start)}–${formatDateOnly(forecast.end)}`}
              />
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-xs">
                <span>Expected net TTC</span>
                <strong className="financial-figure">
                  {forecast.net === null
                    ? "Incomplete — review gaps"
                    : formatMoney(forecast.net, currency)}
                </strong>
              </div>
              {!report.supplierScoped ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  Planned receipts:{" "}
                  {forecast.planned === null
                    ? "Incomplete"
                    : formatMoney(forecast.planned, currency)}{" "}
                  TTC in this period. Quotes / To be invoiced are excluded from
                  the chart and net.
                  {forecast.plannedIssues
                    ? ` ${forecast.plannedIssues} planned timing/FX issue(s).`
                    : ""}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-warning-foreground mt-4 text-sm">
              Forecast unavailable — reload to retry.
            </p>
          )}
        </section>
      </div>
      {outlook && forecast ? (
        <section
          className="bg-card rounded-lg border p-4"
          aria-labelledby="cash-review-title"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold" id="cash-review-title">
              Cash to review
            </h2>
            <Link className={dashboardLink} href={links.forecast}>
              Review source records
            </Link>
          </header>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Overdue in", outlook.overdueIn],
              ["Overdue out", outlook.overdueOut],
              ["Undated in", outlook.undatedIn],
              ["Undated out", outlook.undatedOut],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground text-xs">{label} TTC</dt>
                <dd className="financial-figure mt-1 text-sm font-semibold">
                  {value === null
                    ? "Incomplete"
                    : formatMoney(value ?? null, currency)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground mt-3 text-xs">
            {forecast.reviewEntries.length === 0
              ? "No overdue, undated or missing-FX obligations in this scope."
              : `${outlook.overdueCount} overdue · ${outlook.undatedCount} undated (including ${outlook.unscheduledCount} unscheduled) · ${outlook.missingFxCount} missing amounts/FX · ${outlook.reviewCount} source reviews. These gaps prevent a complete forecast; no dates are assumed.`}
          </p>
          {forecast.reviewEntries.length > 0 ? (
            <details className="mt-3 border-t pt-3">
              <summary className="cursor-pointer text-xs font-medium">
                Records to review
              </summary>
              <ul className="mt-3 space-y-2 text-xs">
                {forecast.reviewEntries.slice(0, 8).map((entry, index) => (
                  <li
                    key={`${entry.source?.href}-${index}`}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <Link
                      className={dashboardLink}
                      href={entry.source?.href ?? links.forecast}
                    >
                      {entry.source?.label ?? "Source record"}
                    </Link>
                    <span className="text-muted-foreground">
                      {entry.reviewReason ??
                        (entry.amount === null
                          ? "Missing FX / amount"
                          : entry.due
                            ? `Overdue ${formatDateOnly(entry.due)}`
                            : "Date needed")}
                    </span>
                  </li>
                ))}
              </ul>
              {forecast.reviewEntries.length > 8 ? (
                <Link
                  className={`${dashboardLink} mt-3 inline-block`}
                  href={links.forecast}
                >
                  View all {forecast.reviewEntries.length} gaps
                </Link>
              ) : null}
            </details>
          ) : null}
        </section>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <section
          className="bg-card min-w-0 rounded-lg border p-4 sm:p-5"
          aria-labelledby="project-profit-title"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="project-profit-title" className="text-sm font-semibold">
              Project pricing
            </h2>
            <Link className={dashboardLink} href={links.projects}>
              View all Projects
            </Link>
          </header>
          <p className="text-muted-foreground mt-1 text-xs">
            Agreed Order sell less economic cost, including separate freight.
            Not earned or final profit.
          </p>
          <p className="financial-figure mt-3 text-xs">
            Cost{" "}
            {formatMoney(pricing?.cost.value ?? null, currency, "Incomplete")} ·
            Sell HT{" "}
            {formatMoney(pricing?.sell.value ?? null, currency, "Incomplete")} ·
            Markup{" "}
            {pricing?.profit.value === null || !pricing
              ? "Incomplete"
              : formatRate(pricing.markupRate)}
          </p>
          <ProjectBars rows={profits} currency={currency} />
        </section>
        <section
          className="bg-card min-w-0 rounded-lg border p-4 sm:p-5"
          aria-labelledby="invoice-coverage-title"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="invoice-coverage-title" className="text-sm font-semibold">
              Invoice coverage
            </h2>
            {!report.supplierScoped ? (
              <Link className={dashboardLink} href={links.coverage}>
                View coverage
              </Link>
            ) : null}
          </header>
          {report.supplierScoped ? (
            <p className="text-muted-foreground mt-4 text-sm">
              Not applicable to Supplier scope. Clear the Supplier filter to
              compare Client invoices with Order selling prices.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mt-1 text-xs">
                Issued Client Invoice HT less Order sell HT. Negative means more
                Billing is needed to cover recorded selling prices.
              </p>
              <ProjectBars rows={coverage} currency={currency} />
            </>
          )}
        </section>
      </div>
      <nav
        className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-xs"
        aria-label="Detailed reports"
      >
        <span>Detailed reports</span>
        <Link className={dashboardLink} href={links.vat}>
          VAT position
        </Link>
        <Link className={dashboardLink} href={links.freight}>
          Freight coverage
        </Link>
        <Link className={dashboardLink} href={links.transactions}>
          Cash transactions
        </Link>
      </nav>
    </div>
  );
}
