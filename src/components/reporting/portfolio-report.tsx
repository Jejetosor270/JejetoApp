import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  formatMoney,
  formatRate,
  formatSignedMoney,
} from "@/domain/procurement/presentation";
import type { PortfolioReportingSnapshot } from "@/lib/reporting/reports";
import { formatEnumLabel } from "@/domain/presentation/labels";

const supplierScopeDescription =
  "Supplier Orders, freight, payments and refunds only; Client Billing is not attributed to Suppliers.";

export function CompanyFinancialSummary({
  report,
}: {
  report: PortfolioReportingSnapshot;
}) {
  const currency = report.companyCurrencyCode;
  const pricing = report.pricing;
  const complete = pricing
    ? pricing.profit.value !== null
    : report.financial.complete;
  const toPay = report.cashFlow.outlook
    ? report.cashFlow.outlook.outstandingOut
    : report.payments.supplier.totalRemaining;
  const toCollect = report.cashFlow.outlook
    ? report.cashFlow.outlook.outstandingIn
    : report.clientBilling.complete
      ? report.clientBilling.outstandingTtc
      : null;
  const overdueToCollect = report.cashFlow.outlook
    ? report.cashFlow.outlook.overdueIn
    : report.clientBilling.complete
      ? report.clientBilling.overdueTtc
      : null;
  const overdueToPay = report.cashFlow.outlook
    ? report.cashFlow.outlook.overdueOut
    : report.payments.supplier.overdue.complete
      ? report.payments.supplier.overdue.value
      : null;
  const fundingStatusLabel =
    report.fundingCoverage.status === "EXCESS_BILLING_COVERAGE"
      ? "Billing surplus over Order sell"
      : report.fundingCoverage.status === "FUNDING_GAP"
        ? "Billing shortfall against Order sell"
        : report.fundingCoverage.status === "FULLY_COVERED"
          ? "Order sell covered"
          : "Incomplete";
  const kpis = [
    [
      "Active Projects",
      report.activeProjectCount.toString(),
      false,
      "/projects?status=ACTIVE",
    ],
    [
      pricing ? "Order sell HT" : "Order Planned Sell HT",
      formatMoney(
        pricing
          ? pricing.sell.value
          : report.financial.totals.salesRevenue.value,
        currency,
      ),
      pricing
        ? pricing.sell.value === null
        : !report.financial.totals.salesRevenue.complete,
      "/orders",
    ],
    [
      pricing ? "Economic cost" : "Order economic cost",
      formatMoney(
        pricing
          ? pricing.cost.value
          : report.financial.totals.economicLandedCost.value,
        currency,
      ),
      pricing
        ? pricing.cost.value === null
        : !report.financial.totals.economicLandedCost.complete,
      pricing ? "/projects" : "/orders",
    ],
    [
      pricing ? "Pricing profit" : "Order pricing profit",
      formatMoney(
        pricing ? pricing.profit.value : report.financial.grossProfit,
        currency,
      ),
      !complete,
      pricing ? "/projects" : "/orders",
    ],
    [
      pricing ? "Markup" : "Order pricing markup",
      pricing && !complete
        ? "Incomplete"
        : formatRate(
            pricing ? pricing.markupRate : report.financial.markupRate,
          ),
      false,
      pricing ? "/projects" : "/orders?view=financial",
    ],
    [
      pricing ? "Margin" : "Order pricing margin",
      pricing && !complete
        ? "Incomplete"
        : formatRate(
            pricing ? pricing.marginRate : report.financial.grossMarginRate,
          ),
      false,
      pricing ? "/projects" : "/orders",
    ],
    [
      "To pay TTC",
      formatMoney(toPay, currency),
      toPay === null,
      "/installments?tab=supplier",
    ],
    [
      "To collect TTC",
      formatMoney(toCollect, currency),
      toCollect === null,
      "/billing",
    ],
    [
      "Overdue to pay TTC",
      formatMoney(overdueToPay, currency),
      overdueToPay === null,
      "/installments?tab=supplier&status=OVERDUE",
    ],
    [
      "Overdue to collect TTC",
      formatMoney(overdueToCollect, currency),
      overdueToCollect === null,
      "/billing",
    ],
    [
      "Issued Billing less Order sell",
      formatSignedMoney(report.fundingCoverage.fundingCoverageHt, currency),
      !report.fundingCoverage.complete,
      "/projects",
    ],
    [
      "Projects with Billing shortfall against Order sell",
      report.fundingCoverage.gapProjectCount.toString(),
      false,
      "/projects",
    ],
  ] as const;
  const secondaryKpis = kpis
    .filter((_, index) => index < 1 || index > 3)
    .filter(
      ([label]) =>
        !report.supplierScoped ||
        ![
          "To collect TTC",
          "Overdue to collect TTC",
          "Issued Billing less Order sell",
          "Projects with Billing shortfall against Order sell",
        ].includes(label),
    );

  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {pricing ? "Project pricing" : "Order pricing plan"}
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {pricing
              ? "Agreed Order sell less recorded economic cost, including separate Project freight. This is the recorded pricing position, not actual Project profit."
              : "Order selling prices less Order economic costs, not actual Project profit."}{" "}
            Comparable totals include {currency}-reporting Projects only.
          </p>
          {report.supplierScoped ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {supplierScopeDescription}
            </p>
          ) : null}
        </div>
        <Badge variant={complete ? "outline" : "destructive"}>
          {complete ? "Complete" : "Incomplete"}
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
          {report.supplierScoped
            ? "Pricing ratios & Supplier exposure"
            : pricing
              ? "Pricing ratios, exposure & coverage"
              : "Order pricing ratios, exposure & coverage"}
        </summary>{" "}
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {secondaryKpis.map(([label, value, incomplete, href]) => (
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
      {!report.supplierScoped ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Issued Client Invoice HT after credits less active Order sell HT,
          including unallocated Billing; separate from cash.{" "}
          <span className="text-foreground font-medium">
            {fundingStatusLabel}
          </span>
        </p>
      ) : null}
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
}: {
  report: PortfolioReportingSnapshot;
  view?: "commercial" | "funding" | "cash";
}) {
  const hasPricing = Boolean(
    report.pricing || report.projects.some((project) => project.pricing),
  );
  const labels =
    view === "commercial"
      ? hasPricing
        ? [
            "Order sell HT",
            "Economic cost",
            "Pricing profit",
            "Markup",
            "Margin",
          ]
        : [
            "Order planned sell HT",
            "Order economic cost",
            "Order pricing profit",
            "Order pricing markup",
            "Order pricing margin",
          ]
      : view === "funding"
        ? ["Issued Billing less Order sell HT"]
        : report.supplierScoped
          ? ["To pay TTC", "Supplier net cash"]
          : ["To pay TTC", "To collect TTC", "Cash Position"];
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <header className="space-y-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Project portfolio</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Each row remains in its Project reporting currency.{" "}
            {hasPricing
              ? "Pricing uses agreed Order sell less recorded economic costs, including separate Project freight; it is not actual Project profit."
              : "Commercial figures describe the Order pricing plan, not actual Project profit."}{" "}
            {report.supplierScoped
              ? supplierScopeDescription
              : "Issued Billing less Order sell includes all issued Invoice HT after credits, whether allocated or not; it is separate from cash."}
          </p>
        </div>
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
                  {!(project.pricing
                    ? project.pricing.profit.value !== null
                    : project.financialComplete) ? (
                    <span className="text-warning-foreground block">
                      Financial reporting incomplete
                    </span>
                  ) : null}
                  {!report.supplierScoped &&
                  project.clientOutstanding === null ? (
                    <span className="text-warning-foreground block">
                      To collect incomplete
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono">
                  {project.reportingCurrencyCode}
                </td>
                {view === "commercial" ? (
                  <>
                    {(project.pricing
                      ? [
                          project.pricing.sell.value,
                          project.pricing.cost.value,
                          project.pricing.profit.value,
                        ]
                      : [
                          project.salesRevenue,
                          project.economicLandedCost,
                          project.grossProfit,
                        ]
                    ).map((value, index) => (
                      <td
                        className="financial-figure px-3 py-2 text-right"
                        key={index}
                      >
                        {formatMoney(value, project.reportingCurrencyCode)}
                      </td>
                    ))}
                    <td className="financial-figure px-3 py-2 text-right">
                      {project.pricing && project.pricing.profit.value === null
                        ? "Incomplete"
                        : formatRate(
                            project.pricing
                              ? project.pricing.markupRate
                              : project.markupRate,
                          )}
                    </td>
                    <td className="financial-figure px-3 py-2 text-right">
                      {project.pricing && project.pricing.profit.value === null
                        ? "Incomplete"
                        : formatRate(
                            project.pricing
                              ? project.pricing.marginRate
                              : project.grossMarginRate,
                          )}
                    </td>
                  </>
                ) : view === "funding" ? (
                  <td className="financial-figure px-3 py-2 text-right">
                    {report.supplierScoped ? (
                      "Not applicable"
                    ) : project.fundingCoverage.complete ? (
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
                  (report.supplierScoped
                    ? [project.supplierOutstanding, project.cashPosition]
                    : [
                        project.supplierOutstanding,
                        project.clientOutstanding,
                        project.cashPosition,
                      ]
                  ).map((value, index) => (
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
