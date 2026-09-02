import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import type { PortfolioReportingSnapshot } from "@/lib/reporting/reports";

export function CompanyFinancialSummary({
  report,
}: {
  report: PortfolioReportingSnapshot;
}) {
  const currency = report.companyCurrencyCode;
  const kpis = [
    [
      "Active Projects",
      report.activeProjectCount.toString(),
      false,
      "/projects?status=ACTIVE",
    ],
    [
      "Sales HT",
      formatMoney(report.financial.totals.salesRevenue.value, currency),
      !report.financial.totals.salesRevenue.complete,
      "/orders",
    ],
    [
      "Economic landed cost",
      formatMoney(report.financial.totals.economicLandedCost.value, currency),
      !report.financial.totals.economicLandedCost.complete,
      "/orders",
    ],
    [
      "Gross profit",
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
      "Client outstanding",
      formatMoney(report.payments.client.totalRemaining, currency),
      report.payments.client.totalRemaining === null,
      "/payments?direction=CLIENT_RECEIPT",
    ],
    [
      "Supplier overdue",
      formatMoney(report.payments.supplier.overdue.value, currency),
      !report.payments.supplier.overdue.complete,
      "/payments?direction=SUPPLIER_PAYMENT&status=OVERDUE",
    ],
    [
      "Client overdue",
      formatMoney(report.payments.client.overdue.value, currency),
      !report.payments.client.overdue.complete,
      "/payments?direction=CLIENT_RECEIPT&status=OVERDUE",
    ],
  ] as const;

  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Company financial overview</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Comparable totals include {currency}-reporting Projects only.
          </p>
        </div>
        <Badge variant={report.financial.complete ? "outline" : "destructive"}>
          {report.financial.complete ? "Complete" : "Incomplete"}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
        {kpis.map(([label, value, incomplete, href]) => (
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
}: {
  report: PortfolioReportingSnapshot;
}) {
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Project portfolio</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Each row remains in its own Project reporting currency.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[82rem] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2 text-right">Sales HT</th>
              <th className="px-3 py-2 text-right">Economic cost</th>
              <th className="px-3 py-2 text-right">Gross profit</th>
              <th className="px-3 py-2 text-right">Markup</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">Supplier outstanding</th>
              <th className="px-3 py-2 text-right">Client outstanding</th>
              <th className="px-3 py-2 text-right">Cash position</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.projects.map((project) => (
              <tr key={project.id}>
                <td className="px-3 py-2">
                  <Link
                    className="font-medium hover:underline"
                    href={`/projects/${project.id}`}
                  >
                    {project.name}
                  </Link>
                  <span className="text-muted-foreground block font-mono">
                    {project.code}
                  </span>
                </td>
                <td className="px-3 py-2">{project.clientName}</td>
                <td className="px-3 py-2">
                  {project.status.replaceAll("_", " ")}
                  {!project.financialComplete ? (
                    <span className="text-destructive block">Incomplete</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono">
                  {project.reportingCurrencyCode}
                </td>
                {[
                  project.salesRevenue,
                  project.economicLandedCost,
                  project.grossProfit,
                ].map((value, index) => (
                  <td
                    className="financial-figure px-3 py-2 text-right"
                    key={`${project.id}-financial-${index}`}
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
                {[
                  project.supplierOutstanding,
                  project.clientOutstanding,
                  project.cashPosition,
                ].map((value, index) => (
                  <td
                    className="financial-figure px-3 py-2 text-right"
                    key={`${project.id}-cash-${index}`}
                  >
                    {formatMoney(value, project.reportingCurrencyCode)}
                  </td>
                ))}
              </tr>
            ))}
            {report.projects.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground px-3 py-12 text-center text-sm"
                  colSpan={11}
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
