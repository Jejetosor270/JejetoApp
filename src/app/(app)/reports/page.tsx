import type { Metadata } from "next";
import Link from "next/link";

import { CashFlowPanel } from "@/components/reporting/cash-flow-panel";
import {
  ActualCashReport,
  GlobalFreightReport,
  GlobalVatReport,
} from "@/components/reporting/global-report-tables";
import { OverdueItems } from "@/components/reporting/overdue-items";
import {
  CompanyFinancialSummary,
  ProjectPortfolioTable,
} from "@/components/reporting/portfolio-report";
import { isCashFlowHorizon, type CashFlowHorizon } from "@/config/reporting";
import { isDateOnly } from "@/domain/payments/dates";
import { PaymentDirection, ProjectStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import {
  getPortfolioReportingSnapshot,
  listReportingOptions,
} from "@/lib/reporting/reports";
import {
  getActualCashReport,
  getGlobalFreightReport,
  getGlobalVatReport,
} from "@/lib/reporting/global-reports";

export const metadata: Metadata = { title: "Reports" };

const views = [
  { label: "Project financial summary", value: "projects" },
  { label: "Cash flow", value: "cash-flow" },
  { label: "Payments / Receipts", value: "payments" },
  { label: "VAT", value: "vat" },
  { label: "Freight", value: "freight" },
] as const;
type ReportView = (typeof views)[number]["value"];

function first(
  params: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = params[name];
  return typeof value === "string" ? value : undefined;
}

function selected<T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | undefined {
  return values.find((item) => item === value);
}

function viewHref(
  view: ReportView,
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  query.set("view", view);
  for (const key of ["projectId", "clientId", "supplierId", "projectStatus"]) {
    const value = first(params, key);
    if (value) query.set(key, value);
  }
  return `/reports?${query.toString()}`;
}

function cashFlowHref(
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  query.set("view", "cash-flow");
  for (const key of ["projectId", "clientId", "supplierId", "projectStatus"]) {
    const value = first(params, key);
    if (value) query.set(key, value);
  }
  return `/reports?${query.toString()}`;
}

function ReportingFilters({
  options,
  params,
  view,
}: {
  options: Awaited<ReturnType<typeof listReportingOptions>>;
  params: Record<string, string | string[] | undefined>;
  view: ReportView;
}) {
  return (
    <form className="bg-card grid gap-2 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-6">
      <input name="view" type="hidden" value={view} />
      <select
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        defaultValue={first(params, "projectId") ?? ""}
        name="projectId"
      >
        <option value="">All Projects</option>
        {options.projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <select
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        defaultValue={first(params, "clientId") ?? ""}
        name="clientId"
      >
        <option value="">All Clients</option>
        {options.clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.displayName}
          </option>
        ))}
      </select>
      <select
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        defaultValue={first(params, "supplierId") ?? ""}
        name="supplierId"
      >
        <option value="">All Suppliers</option>
        {options.suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.displayName}
          </option>
        ))}
      </select>
      <select
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        defaultValue={first(params, "projectStatus") ?? ""}
        name="projectStatus"
      >
        <option value="">All Project statuses</option>
        {options.projectStatuses.map((status) => (
          <option key={status} value={status}>
            {status.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      {view === "payments" ? (
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          defaultValue={first(params, "direction") ?? ""}
          name="direction"
        >
          <option value="">Both cash directions</option>
          <option value="SUPPLIER_PAYMENT">Supplier payments</option>
          <option value="CLIENT_RECEIPT">Client receipts</option>
        </select>
      ) : view === "cash-flow" ? (
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          defaultValue={first(params, "horizon") ?? "12m"}
          name="horizon"
        >
          <option value="30d">Next 30 days</option>
          <option value="90d">Next 90 days</option>
          <option value="6m">Next 6 months</option>
          <option value="12m">Next 12 months</option>
        </select>
      ) : null}
      {view === "payments" || view === "cash-flow" ? (
        <div className="flex gap-2 xl:col-span-2">
          <input
            aria-label={
              view === "payments" ? "Actual date from" : "Cash-flow start"
            }
            className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-3 text-sm"
            defaultValue={first(params, "dateFrom") ?? ""}
            name="dateFrom"
            type="date"
          />
          <input
            aria-label={
              view === "payments" ? "Actual date to" : "Cash-flow end"
            }
            className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-3 text-sm"
            defaultValue={first(params, "dateTo") ?? ""}
            name="dateTo"
            type="date"
          />
        </div>
      ) : null}
      <button
        className="bg-primary text-primary-foreground h-9 rounded-md px-3 text-sm font-medium"
        type="submit"
      >
        Apply filters
      </button>
      <Link
        className="border-input flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium"
        href={`/reports?view=${view}`}
      >
        Clear
      </Link>
    </form>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view =
    selected(
      views.map((item) => item.value),
      first(params, "view"),
    ) ?? "projects";
  const requestedHorizon = first(params, "horizon") ?? "";
  const horizon: CashFlowHorizon = isCashFlowHorizon(requestedHorizon)
    ? requestedHorizon
    : "12m";
  const dateFrom = first(params, "dateFrom");
  const dateTo = first(params, "dateTo");
  const projectStatus = selected(
    Object.values(ProjectStatus),
    first(params, "projectStatus"),
  );
  const direction = selected(
    Object.values(PaymentDirection),
    first(params, "direction"),
  );
  const reportingFilters = {
    clientId: first(params, "clientId"),
    projectId: first(params, "projectId"),
    projectStatus,
    supplierId: first(params, "supplierId"),
  };
  const reportPromise =
    view === "projects" || view === "cash-flow"
      ? getPortfolioReportingSnapshot(reportingFilters, {
          end: dateTo && isDateOnly(dateTo) ? dateTo : undefined,
          horizon,
          start: dateFrom && isDateOnly(dateFrom) ? dateFrom : undefined,
        })
      : Promise.resolve(null);
  const [, options, report, actualCash, vat, freight] = await Promise.all([
    requireUser(),
    listReportingOptions(),
    reportPromise,
    view === "payments"
      ? getActualCashReport({
          ...reportingFilters,
          dateFrom: dateFrom && isDateOnly(dateFrom) ? dateFrom : undefined,
          dateTo: dateTo && isDateOnly(dateTo) ? dateTo : undefined,
          direction,
        })
      : Promise.resolve(null),
    view === "vat"
      ? getGlobalVatReport(reportingFilters)
      : Promise.resolve(null),
    view === "freight"
      ? getGlobalFreightReport(reportingFilters)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Management information
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Read-only Project financial, cash-flow, and payment reporting derived
          from current operational records.
        </p>
      </header>

      <nav aria-label="Report view" className="flex flex-wrap gap-2">
        {views.map((item) => (
          <Link
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              item.value === view
                ? "bg-primary text-primary-foreground border-primary"
                : "border-input"
            }`}
            href={viewHref(item.value, params)}
            key={item.value}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <ReportingFilters options={options} params={params} view={view} />

      {view === "projects" && report ? (
        <>
          <CompanyFinancialSummary report={report} />
          <ProjectPortfolioTable report={report} />
        </>
      ) : null}
      {view === "cash-flow" && report ? (
        <>
          {report.excludedCurrencyProjects.length ? (
            <div className="border-warning/30 bg-warning-muted rounded-lg border px-4 py-3 text-xs">
              <p className="font-medium">
                Company cash flow includes {report.companyCurrencyCode}
                -reporting Projects only.
              </p>
              <p className="text-muted-foreground mt-1">
                {report.excludedCurrencyProjects.length} Project(s) in other
                reporting currencies are excluded because no company FX rate is
                available.
              </p>
            </div>
          ) : null}
          <CashFlowPanel
            baseHref={cashFlowHref(params)}
            cashFlow={report.cashFlow}
            currencyCode={report.companyCurrencyCode}
            horizon={horizon}
          />
          <OverdueItems items={report.overdueItems} />
        </>
      ) : null}
      {view === "payments" && actualCash ? (
        <ActualCashReport report={actualCash} />
      ) : null}
      {view === "vat" && vat ? <GlobalVatReport report={vat} /> : null}
      {view === "freight" && freight ? (
        <GlobalFreightReport report={freight} />
      ) : null}
    </div>
  );
}
