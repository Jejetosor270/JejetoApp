import { ViewShortcuts } from "@/components/listing/view-shortcuts";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  formatMoney,
  formatRate,
  formatSignedMoney,
} from "@/domain/procurement/presentation";
import type { PortfolioReportingSnapshot } from "@/lib/reporting/reports";
import { formatEnumLabel } from "@/domain/presentation/labels";

export function CompanyFinancialSummary({
  report,
}: {
  report: PortfolioReportingSnapshot;
}) {
  const currency = report.companyCurrencyCode;
  const fundingStatusLabel =
    report.fundingCoverage.status === "EXCESS_BILLING_COVERAGE"
      ? "Excess Billing Coverage"
      : report.fundingCoverage.status === "FUNDING_GAP"
        ? "Funding Gap"
        : report.fundingCoverage.status === "FULLY_COVERED"
          ? "Fully Covered"
          : "Incomplete";
  const kpis = [
    [
      "Active Projects",
      report.activeProjectCount.toString(),
      false,
      "/projects?status=ACTIVE",
    ],
    [
      "Order Planned Sell HT",
      formatMoney(report.financial.totals.salesRevenue.value, currency),
      !report.financial.totals.salesRevenue.complete,
      "/orders",
    ],
    [
      "Economic Landed Cost HT",
      formatMoney(report.financial.totals.economicLandedCost.value, currency),
      !report.financial.totals.economicLandedCost.complete,
      "/orders",
    ],
    [
      "Order Planned Gross Profit HT",
      formatMoney(report.financial.grossProfit, currency),
      !report.financial.complete,
      "/orders",
    ],
    [
      "Markup",
      formatRate(report.financial.markupRate),
      false,
      "/orders?view=financial",
    ],
    [
      "Gross margin",
      formatRate(report.financial.grossMarginRate),
      false,
      "/orders",
    ],
    [
      "Supplier outstanding",
      formatMoney(report.payments.supplier.totalRemaining, currency),
      report.payments.supplier.totalRemaining === null,
      "/payments?direction=SUPPLIER_PAYMENT",
    ],
    [
      "Client outstanding TTC",
      formatMoney(report.clientBilling.outstandingTtc, currency),
      !report.clientBilling.complete,
      "/billing",
    ],
    [
      "Supplier overdue",
      formatMoney(report.payments.supplier.overdue.value, currency),
      !report.payments.supplier.overdue.complete,
      "/payments?direction=SUPPLIER_PAYMENT&status=OVERDUE",
    ],
    [
      "Client overdue TTC",
      formatMoney(report.clientBilling.overdueTtc, currency),
      !report.clientBilling.complete,
      "/billing",
    ],
    [
      "Total Funding Coverage",
      formatSignedMoney(report.fundingCoverage.fundingCoverageHt, currency),
      !report.fundingCoverage.complete,
      "/projects",
    ],
    [
      "Projects with Funding Gap",
      report.fundingCoverage.gapProjectCount.toString(),
      false,
      "/projects",
    ],
  ] as const;

  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Portfolio commercial plan</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Order planned selling and economic costs. Comparable totals include{" "}
            {currency}-reporting Projects only.
          </p>
        </div>
        <Badge variant={report.financial.complete ? "outline" : "destructive"}>
          {report.financial.complete ? "Complete" : "Incomplete"}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
        {kpis.slice(1, 4).map(([label, value, incomplete, href]) => (
          <div
            className="border-l pl-4 first:border-l-0 first:pl-0"
            key={label}
          >
            <dt className="text-muted-foreground text-xs">
              <Link className="hover:underline" href={href}>
                {label}
              </Link>
            </dt>
            <dd className="financial-figure mt-1 text-sm font-semibold">
              <Link className="hover:underline" href={href}>
                {value}
              </Link>
            </dd>
            {incomplete ? (
              <span className="text-destructive mt-0.5 block text-[0.6875rem]">
                Incomplete
              </span>
            ) : null}
          </div>
        ))}
      </dl>
      <details className="mt-4 border-t pt-3">
        <summary className="text-sm font-medium">
          Commercial ratios, exposure & funding
        </summary>{" "}
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {kpis
            .filter((_, index) => index < 1 || index > 3)
            .map(([label, value, incomplete, href]) => (
              <div className="bg-muted/25 rounded-md border p-3" key={label}>
                <dt className="text-muted-foreground text-xs">
                  <Link className="hover:underline" href={href}>
                    {label}
                  </Link>
                </dt>
                <dd className="financial-figure mt-1 text-sm font-semibold">
                  <Link className="hover:underline" href={href}>
                    {value}
                  </Link>
                </dd>
                {incomplete ? (
                  <span className="text-destructive mt-0.5 block text-[0.6875rem]">
                    Incomplete
                  </span>
                ) : null}
              </div>
            ))}
        </dl>
      </details>
      <p className="text-muted-foreground mt-3 text-xs">
        Funding Coverage status:{" "}
        <span className="text-foreground font-medium">
          {fundingStatusLabel}
        </span>
      </p>
      {report.excludedCurrencyProjects.length ? (
        <div className="border-warning/30 bg-warning-muted mt-3 rounded-md border px-3 py-2 text-xs">
          <p className="font-medium">
            {report.excludedCurrencyProjects.length} Project(s) are excluded
            from company monetary totals because no Project-to-{currency} FX
            mechanism exists.
          </p>
          <p className="text-muted-foreground mt-1">
            {report.excludedCurrencyProjects.map((project, index) => (
              <span key={project.id}>
                {index ? ", " : ""}
                <Link
                  className="hover:underline"
                  href={`/projects/${project.id}`}
                >
                  {project.name} ({project.reportingCurrencyCode})
                </Link>
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function ProjectPortfolioTable({
  report,
  view = "commercial",
  queryString = "view=projects",
}: {
  report: PortfolioReportingSnapshot;
  view?: "commercial" | "funding" | "cash";
  queryString?: string;
}) {
  const labels =
    view === "commercial"
      ? [
          "Order Sell HT",
          "Economic Landed Cost HT",
          "Planned Gross Profit HT",
          "Planned Markup",
          "Planned Margin",
        ]
      : view === "funding"
        ? ["Funding Coverage HT"]
        : [
            "Supplier Outstanding TTC",
            "Client Outstanding TTC",
            "Cash Position",
          ];
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <header className="space-y-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Project portfolio</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Each row remains in its Project reporting currency. Commercial
            figures describe the Order plan; Funding Coverage is commercial
            coverage, separate from cash.
          </p>
        </div>
        <ViewShortcuts
          pathname="/reports"
          queryString={queryString}
          field="portfolioView"
          options={[
            { label: "Commercial", value: "commercial" },
            { label: "Funding", value: "funding" },
            { label: "Cash", value: "cash" },
          ]}
          defaultValue="commercial"
        />
      </header>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label="Project portfolio table"
        tabIndex={0}
      >
        <table className="w-full min-w-[48rem] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Currency</th>
              {labels.map((label) => (
                <th key={label} className="px-3 py-2 text-right">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.projects.map((project) => (
              <tr key={project.id}>
                <td className="px-3 py-3">
                  <Link
                    className="font-medium hover:underline"
                    href={`/projects/${project.id}`}
                  >
                    {project.name}
                  </Link>
                  <span className="text-muted-foreground mt-1 block">
                    {project.code} · {project.clientName} ·{" "}
                    {formatEnumLabel(project.status)}
                  </span>
                  {!project.financialComplete ? (
                    <span className="text-warning-foreground block">
                      Financial reporting incomplete
                    </span>
                  ) : null}
                  {!project.clientBillingComplete ? (
                    <span className="text-warning-foreground block">
                      Billing FX incomplete
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono">
                  {project.reportingCurrencyCode}
                </td>
                {view === "commercial" ? (
                  <>
                    {[
                      project.salesRevenue,
                      project.economicLandedCost,
                      project.grossProfit,
                    ].map((value, index) => (
                      <td
                        className="financial-figure px-3 py-2 text-right"
                        key={index}
                      >
                        {formatMoney(value, project.reportingCurrencyCode)}
                      </td>
                    ))}
                    <td className="financial-figure px-3 py-2 text-right">
                      {formatRate(project.markupRate)}
                    </td>
                    <td className="financial-figure px-3 py-2 text-right">
                      {formatRate(project.grossMarginRate)}
                    </td>
                  </>
                ) : view === "funding" ? (
                  <td className="financial-figure px-3 py-2 text-right">
                    {project.fundingCoverage.complete ? (
                      formatSignedMoney(
                        project.fundingCoverage.fundingCoverageHt,
                        project.reportingCurrencyCode,
                      )
                    ) : (
                      <span className="text-warning-foreground">
                        Incomplete
                      </span>
                    )}
                  </td>
                ) : (
                  [
                    project.supplierOutstanding,
                    project.clientOutstanding,
                    project.cashPosition,
                  ].map((value, index) => (
                    <td
                      className="financial-figure px-3 py-2 text-right"
                      key={index}
                    >
                      {formatMoney(value, project.reportingCurrencyCode)}
                    </td>
                  ))
                )}
              </tr>
            ))}
            {report.projects.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground px-3 py-12 text-center text-sm"
                  colSpan={labels.length + 2}
                >
                  No Projects match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
