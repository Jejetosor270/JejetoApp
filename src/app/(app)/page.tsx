import type { Metadata } from "next";
import Link from "next/link";

import { OverdueItems } from "@/components/reporting/overdue-items";
import {
  CompanyFinancialSummary,
  ProjectPortfolioTable,
} from "@/components/reporting/portfolio-report";
import { formatMoney } from "@/domain/procurement/presentation";
import { ProjectStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { getPortfolioReportingSnapshot } from "@/lib/reporting/reports";

export const metadata: Metadata = { title: "Dashboard" };

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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
            Portfolio
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Financial dashboard
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Profitability, payment exposure, and upcoming cash across active
            Projects.
          </p>
        </div>
        <Link
          className="border-input rounded-md border px-3 py-2 text-sm font-medium"
          href="/reports"
        >
          Open reports
        </Link>
      </header>

      <CompanyFinancialSummary report={report} />

      <section className="bg-card rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Client Billing</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Actual Client Invoices and receipts across active {currency}
              -reporting Projects.
            </p>
          </div>
          <Link
            className="text-primary text-xs hover:underline"
            href="/billing"
          >
            Open Client Billing
          </Link>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["Client invoiced HT", billing.invoicedHt],
              ["Client paid TTC", billing.paidTtc],
              ["Client outstanding TTC", billing.outstandingTtc],
              ["Client overdue TTC", billing.overdueTtc],
            ] as const
          ).map(([label, value]) => (
            <div className="bg-muted/25 rounded-md border p-3" key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="financial-figure mt-1 font-semibold">
                {formatMoney(value, currency)}
              </dd>
            </div>
          ))}
        </dl>
        {!billing.complete ? (
          <p className="text-destructive mt-3 text-xs">
            Billing totals are incomplete because required FX is missing.
          </p>
        ) : null}
      </section>

      <section className="bg-card rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Upcoming cash requirements
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
            <div className="bg-muted/25 rounded-md border p-3" key={label}>
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

      <OverdueItems items={report.overdueItems} />
      <ProjectPortfolioTable report={report} />
    </div>
  );
}
