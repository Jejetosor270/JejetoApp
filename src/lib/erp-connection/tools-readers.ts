import "server-only";

import Decimal from "decimal.js";
import {
  projectMetricKeys,
  type ProjectMetricRow,
} from "@/domain/finance/project-dashboard";
import { billingTermPresentation } from "@/domain/billing/term-presentation";
import { billingIsIssued } from "@/domain/billing/status";
import { businessToday } from "@/domain/payments/dates";
import { getDatabase } from "@/lib/db";
import { getProjectControl } from "@/lib/reporting/project-control";
import { getFinancialAttention } from "@/lib/reporting/financial-attention";
import { getOrderPaymentSummary } from "@/lib/payments/payments";
import { getClientBillingDocument } from "@/lib/billing/billing";
import { ErpReadToolError } from "./tools-errors";

const PAGE_SIZE = 25;
const SOURCE_LIMIT = 10;

function paginate<T>(items: readonly T[], page: number) {
  return {
    items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageSize: PAGE_SIZE,
    total: items.length,
    hasNext: page * PAGE_SIZE < items.length,
    hasPrevious: page > 1,
  };
}

async function requiredProject(id: string) {
  const project = await getDatabase().project.findUnique({
    where: { id },
    select: { id: true, name: true, status: true },
  });
  if (!project)
    throw new ErpReadToolError(
      "NOT_FOUND",
      "This Project is no longer available.",
    );
  return { ...project, href: `/projects/${project.id}` };
}

function evidence(rows: ProjectMetricRow[]) {
  const sources = new Map<
    string,
    { label: string; href: string; note: string | null }
  >();
  for (const row of [
    ...rows.filter((item) => item.amount === null),
    ...rows.filter((item) => item.amount !== null),
  ]) {
    if (!sources.has(row.href))
      sources.set(row.href, {
        label: row.label,
        href: row.href,
        note:
          row.amount === null
            ? `Incomplete amount. ${row.note ?? "Review required amounts and manual FX."}`
            : (row.note ?? null),
      });
  }
  return {
    sources: [...sources.values()].slice(0, SOURCE_LIMIT),
    sourceCount: sources.size,
    sourcesTruncated: sources.size > SOURCE_LIMIT,
  };
}

function rateStatus(
  rate: string | null,
  cost: string | null,
  profit: string | null,
) {
  if (rate !== null) return "complete";
  return cost !== null && profit !== null && new Decimal(cost).isZero()
    ? "not_applicable"
    : "incomplete";
}

export async function readProjectFinancials(projectId: string) {
  const project = await requiredProject(projectId);
  const { currency, dashboard } = await getProjectControl(projectId);
  return {
    project,
    currency,
    metrics: projectMetricKeys.map((key) => ({
      key,
      amount: dashboard.metrics[key].value,
      complete: dashboard.metrics[key].value !== null,
      explanation: dashboard.metrics[key].help,
      href: project.href,
    })),
    markupRate: dashboard.markupRate,
    markupStatus: rateStatus(
      dashboard.markupRate,
      dashboard.metrics.cost.value,
      dashboard.metrics.profit.value,
    ),
    expectedMarkupRate: dashboard.expectedMarkupRate,
    expectedMarkupStatus: rateStatus(
      dashboard.expectedMarkupRate,
      dashboard.metrics.expectedCost.value,
      dashboard.metrics.expectedProfit.value,
    ),
    rateUnit: "fraction",
    ...evidence(
      projectMetricKeys.flatMap((key) => dashboard.metrics[key].rows),
    ),
    alerts: paginate(dashboard.alerts, 1),
  };
}

export async function readProjectCashForecast(args: {
  projectId: string;
  horizonDays: 7 | 30 | 90;
  page: number;
}) {
  const project = await requiredProject(args.projectId);
  const { currency, cashOutlook } = await getProjectControl(args.projectId);
  const window = cashOutlook.windows.find(
    (item) => item.days === args.horizonDays,
  );
  if (!window)
    throw new ErpReadToolError("INVALID", "Choose a 7, 30 or 90-day window.");
  return {
    project,
    currency,
    basis: "TTC",
    today: cashOutlook.today,
    window,
    allRemaining: {
      issuedIn: cashOutlook.outstandingIn,
      paymentsOut: cashOutlook.outstandingOut,
      plannedIn: cashOutlook.plannedTotal,
    },
    gaps: {
      overdueIn: cashOutlook.overdueIn,
      overdueOut: cashOutlook.overdueOut,
      undatedIn: cashOutlook.undatedIn,
      undatedOut: cashOutlook.undatedOut,
      overdueCount: cashOutlook.overdueCount,
      undatedCount: cashOutlook.undatedCount,
      missingFxCount: cashOutlook.missingFxCount,
      reviewCount: cashOutlook.reviewCount,
      unscheduledCount: cashOutlook.unscheduledCount,
      plannedReviewCount: cashOutlook.plannedReviewCount,
      plannedUnscheduledCount: cashOutlook.plannedUnscheduledCount,
      plannedUndated: cashOutlook.plannedUndated,
      plannedOverdue: cashOutlook.plannedOverdue,
    },
    sources: paginate(
      cashOutlook.entries.filter(
        (entry) => entry.due === null || entry.due <= window.end,
      ),
      args.page,
    ),
    scope:
      "Source pages include overdue and undated entries as well as this window. Planned receipts are excluded from projected cash. Null means incomplete; tracked Project cash is not a bank balance.",
  };
}

export async function readProjectAttention(args: {
  projectId: string;
  horizonDays: 7 | 30 | 90;
  page: number;
}) {
  const project = await requiredProject(args.projectId);
  const snapshot = await getFinancialAttention(
    args.horizonDays,
    businessToday(),
    args.projectId,
    project.status === "ARCHIVED" ? "archived" : "active",
  );
  return {
    project,
    horizonDays: args.horizonDays,
    includesSnoozed: true,
    issues: paginate(
      snapshot.issues.map((issue) => ({
        key: issue.key,
        priority: issue.priority,
        title: issue.title,
        detail: issue.detail,
        reference: issue.reference,
        href: issue.href,
        amount: issue.amount,
        currency: issue.currency,
        basis: issue.basis,
        date: issue.date,
      })),
      args.page,
    ),
  };
}

export async function readPaymentTerms(args: {
  kind: "Order" | "Billing";
  id: string;
  page: number;
}) {
  if (args.kind === "Order") {
    const order = await getDatabase().procurementOrder.findUnique({
      where: { id: args.id },
      select: { id: true, orderNumber: true, status: true },
    });
    if (!order)
      throw new ErpReadToolError(
        "NOT_FOUND",
        "This Order is no longer available.",
      );
    const { supplier } = await getOrderPaymentSummary(args.id);
    return {
      kind: args.kind,
      id: order.id,
      reference: order.orderNumber,
      href: `/orders/${order.id}?tab=related`,
      cancelled: order.status === "CANCELLED",
      currency: supplier.baseCurrencyCode,
      direction: "CASH_OUT",
      basis: "TTC",
      reconciliationComplete: supplier.reconciliationComplete,
      schedule: {
        payable: supplier.baseAmount,
        scheduled: supplier.scheduled,
        paid: supplier.paid,
        remaining: supplier.remainingTotal,
        unscheduled: supplier.unscheduled,
        overallocated: supplier.overallocated,
      },
      terms: paginate(
        supplier.installments.map((term) => ({
          id: term.id,
          label: term.label,
          currency: term.currencyCode,
          amount: term.scheduledAmount,
          paid: term.paidAmount,
          remaining: term.outstandingAmount,
          status: term.status,
          cancelled: term.isCancelled,
          dueDate: term.dueDate,
          expectedFxRate: term.expectedFxRate,
          percentageRate: term.percentageRate,
          basis: term.basis,
          cashRecordCount: term.settlements.length,
          href: `/installments/supplier/${term.id}?tab=related`,
        })),
        args.page,
      ),
    };
  }
  const document = await getClientBillingDocument(args.id);
  if (!document)
    throw new ErpReadToolError(
      "NOT_FOUND",
      "This Billing document is no longer available.",
    );
  return {
    kind: args.kind,
    id: document.id,
    reference: document.reference,
    href: `/billing/${document.id}?tab=related`,
    documentType: document.documentType,
    issued: document.documentType === "INVOICE" && billingIsIssued(document),
    cancelled: document.isCancelled,
    currency: document.currencyCode,
    direction: "CASH_IN",
    basis: "TTC",
    paid: document.paid,
    remaining: document.outstanding,
    terms: paginate(
      document.paymentInstallments.map((term) => {
        const state = billingTermPresentation({
          amount: term.scheduledAmount,
          payments: term.receipts,
          dueDate: term.dueDate,
          cancelled: term.isCancelled,
          today: businessToday(),
          cappedRemaining: term.creditOutstandingAmount,
          balanceReviewRequired: term.balanceReviewRequired,
          hasCredits: Boolean(document.creditPosition),
        });
        return {
          id: term.id,
          label: term.label,
          currency: term.currencyCode,
          amount: term.scheduledAmount,
          paid: state.paid,
          remaining: state.remaining,
          status: state.label,
          invoiceCoverage: state.invoiceCoverage,
          balanceReviewRequired: term.balanceReviewRequired,
          cancelled: term.isCancelled,
          dueDate: term.dueDate,
          percentageRate: term.percentageRate,
          basis: term.basis,
          cashRecordCount: term.receipts.length,
          href: `/installments/client/${term.id}?tab=related`,
        };
      }),
      args.page,
    ),
  };
}
