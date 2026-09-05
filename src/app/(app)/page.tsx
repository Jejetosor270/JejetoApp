import { PageHeader } from "@/components/layout/page-header";
import { OverflowList } from "@/components/layout/overflow-list";
import { formatEnumLabel } from "@/domain/presentation/labels";
import type { Metadata } from "next";
import Link from "next/link";

import { OverdueItems } from "@/components/reporting/overdue-items";
import { formatMoney } from "@/domain/procurement/presentation";
import { ProjectStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { getPortfolioReportingSnapshot } from "@/lib/reporting/reports";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const [, report] = await Promise.all([
    requireUser(),
    getPortfolioReportingSnapshot(
      { projectStatus: ProjectStatus.ACTIVE },
      { horizon: "30d" },
    ),
  ]);
  const billing = report.clientBilling;
  const currency = report.companyCurrencyCode;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Home"
        description="What needs attention across your active Projects."
        actions={
          <Link
            className="rounded-md border px-3 py-2 text-sm font-medium"
            href="/reports"
          >
            Open Reports
          </Link>
        }
      />
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Needs attention</h2>
        <div className="divide-y rounded-lg border">
          <Link
            href="/payments?tab=supplier&status=OVERDUE"
            className="hover:bg-muted flex items-center justify-between gap-4 p-4"
          >
            <span className="text-sm">Overdue Supplier Payments</span>
            <span className="financial-figure text-destructive text-sm font-semibold">
              {formatMoney(
                report.payments.supplier.overdue.complete
                  ? report.payments.supplier.overdue.value
                  : null,
                currency,
              )}
            </span>
          </Link>
          <Link
            href="/billing?status=OVERDUE"
            className="hover:bg-muted flex items-center justify-between gap-4 p-4"
          >
            <span className="text-sm">Overdue Billing</span>
            <span className="financial-figure text-destructive text-sm font-semibold">
              {formatMoney(
                billing.complete ? billing.overdueTtc : null,
                currency,
              )}
            </span>
          </Link>
          <div className="flex items-center justify-between gap-4 p-4 text-sm">
            <span>Projects with a commercial funding gap</span>
            <span className="font-semibold">
              {report.fundingCoverage.gapProjectCount}
            </span>
          </div>
        </div>
        {(!billing.complete ||
          !report.fundingCoverage.complete ||
          !report.payments.supplier.overdue.complete) && (
          <p
            role="status"
            className="bg-warning-muted text-warning rounded-md p-3 text-sm"
          >
            Some balances are incomplete. Review missing manual FX in the
            relevant Project.
          </p>
        )}
        <details>
          <summary className="text-muted-foreground text-sm">
            Overdue Supplier installment detail
          </summary>
          <div className="mt-3">
            <OverdueItems
              items={report.overdueItems}
              showClientReceipts={false}
            />
          </div>
        </details>
      </section>
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            Active Projects{" "}
            <span className="text-muted-foreground text-sm font-normal">
              {report.activeProjectCount}
            </span>
          </h2>
          <Link
            className="text-primary text-sm hover:underline"
            href="/projects?status=ACTIVE"
          >
            View all Projects
          </Link>
        </div>
        <div className="divide-y rounded-lg border">
          <OverflowList limit={6} title="Active Projects">
            {report.projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="hover:bg-muted flex items-center justify-between gap-4 p-4"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {project.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {project.code} · {project.clientName}
                  </span>
                </span>
                <span className="text-muted-foreground text-right text-xs">
                  {project.reportingCurrencyCode}
                  <span className="mt-1 block">
                    {project.fundingCoverage.complete
                      ? formatEnumLabel(project.fundingCoverage.status ?? "")
                      : "Funding coverage incomplete"}
                  </span>
                </span>
              </Link>
            ))}
          </OverflowList>
          {report.projects.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">
              No active Projects. Open Projects to review or create one.
            </p>
          )}
        </div>
      </section>
      <section className="bg-card rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Upcoming cash · next 30 days
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Outstanding scheduled installments due in the next 30 days.
            </p>
          </div>
          <Link
            className="text-primary text-xs hover:underline"
            href="/reports?view=cash-flow&horizon=30d"
          >
            View cash flow
          </Link>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["Expected cash in", report.cashFlow.totals.expectedIn],
              ["Expected cash out", report.cashFlow.totals.expectedOut],
              ["Expected net", report.cashFlow.totals.expectedNet],
            ] as const
          ).map(([label, value]) => (
            <div
              className="border-l pl-4 first:border-l-0 first:pl-0"
              key={label}
            >
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="financial-figure mt-1 text-base font-semibold">
                {formatMoney(value, currency)}
              </dd>
            </div>
          ))}
        </dl>
        {!report.cashFlow.totals.expectedComplete ? (
          <p className="text-destructive mt-3 text-xs">
            Upcoming totals are incomplete because{" "}
            {report.cashFlow.totals.missingExpectedCount} installment(s) lack
            required FX.
          </p>
        ) : null}
      </section>
      {report.excludedCurrencyProjects.length > 0 && (
        <p className="text-warning text-xs">
          Company totals include comparable {currency} values.{" "}
          {report.excludedCurrencyProjects.length} Project(s) in another
          reporting currency are excluded.
        </p>
      )}
    </div>
  );
}
