import "server-only";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { activeCreditsInclude } from "@/lib/credits/select";
import type { OrderSummary } from "@/lib/procurement/orders";
import type { PaymentInstallmentView } from "@/lib/payments/payments";
import type { CreditRefundCash } from "./credit-refunds";
import type { ProjectCashOutlook } from "@/domain/finance/project-cash-outlook";
import {
  projectDashboard,
  type ProjectDashboardAlert,
  type ProjectMetricRow,
} from "@/domain/finance/project-dashboard";
import { difference, sumKnown } from "@/domain/finance/project-control";
import { reportingAmount } from "@/domain/finance/calculations";
import { projectFreightBudget } from "@/domain/freight/calculations";
import { calculateInputVatRecovery } from "@/domain/vat/recoverability";
import { freightExpenseEconomicCost } from "@/lib/freight/expenses";
import { billingIsIssued } from "@/domain/billing/status";
import { isPlannedProjectBilling } from "@/domain/finance/project-overview";
import { billingCashContexts } from "@/domain/billing/cash-expectations";
import { getClientCreditPosition } from "@/domain/billing/credits";
import { calculateProjectTargets } from "@/domain/projects/targets";
import { invoiceCoverageContributions } from "@/lib/billing/reporting";

export const projectDashboardInclude = {
  billingDocuments: {
    where: { isCancelled: false },
    include: {
      credits: activeCreditsInclude,
      allocations: { include: { order: { select: { status: true } } } },
      receipts: true,
      paymentInstallments: { include: { receipts: true } },
      matchedInstallment: { include: { receipts: true } },
    },
  },
  freightExpenses: { include: { payments: true } },
} satisfies Prisma.ProjectInclude;

type DashboardProject = Prisma.ProjectGetPayload<{
  include: typeof projectDashboardInclude;
}>;
export interface DashboardReceipt {
  id: string;
  billingDocumentId: string | null;
  amount: { toString(): string };
  fxRateToReporting: { toString(): string } | null;
  billingDocument: { reference: string; currencyCode: string };
}

export function buildProjectDashboard(input: {
  project: DashboardProject;
  orders: OrderSummary[];
  installments: PaymentInstallmentView[];
  receipts: DashboardReceipt[];
  refunds: CreditRefundCash[];
  cashOutlook: ProjectCashOutlook;
  freightReceived: ProjectMetricRow[];
  excludedReceipts: { id: string; billingDocument: { reference: string } }[];
}) {
  const { project, cashOutlook } = input;
  const currency = project.reportingCurrencyCode;
  const convert = (
    amount: string | null,
    originalCurrencyCode: string,
    fx: { toString(): string } | null,
  ) =>
    amount === null
      ? null
      : new Decimal(amount).isZero()
        ? "0"
        : (reportingAmount({
            originalAmount: amount,
            originalCurrencyCode,
            reportingCurrencyCode: currency,
            fxRateToReporting: fx?.toString() ?? null,
          })?.toString() ?? null);
  const orders = input.orders.filter((order) => order.status !== "CANCELLED");
  const invoices = project.billingDocuments.filter(
    (doc) => doc.documentType === "INVOICE" && billingIsIssued(doc),
  );
  const pending = project.billingDocuments.filter(
    (doc) => isPlannedProjectBilling(doc) && !billingIsIssued(doc),
  );
  const billingRows = (
    documents: typeof invoices,
    field: "totalHt" | "freightCoverageHt" | "vatAmount",
  ): ProjectMetricRow[] =>
    documents.flatMap((doc) => [
      {
        label: doc.reference,
        href: `/billing/${doc.id}`,
        amount: convert(
          doc[field].toString(),
          doc.currencyCode,
          doc.fxRateToReporting,
        ),
        note:
          field === "vatAmount"
            ? "Issued Invoice output VAT."
            : field === "freightCoverageHt"
              ? "Invoice freight HT portion."
              : billingIsIssued(doc)
                ? "Issued Invoice HT."
                : "To be invoiced HT.",
      },
      ...(doc.credits ?? [])
        .filter((credit) => !credit.isCancelled)
        .map((credit) => ({
          label: `${doc.reference} · ${credit.reference}`,
          href: `/billing/${doc.id}?tab=related#credits`,
          amount:
            credit.reportingCurrencyCode !== currency
              ? null
              : difference(
                  "0",
                  convert(
                    credit[field].toString(),
                    credit.currencyCode,
                    credit.fxRateToReporting,
                  ),
                ),
          note: "Active Client credit reduction, using the credit's preserved commercial FX.",
        })),
    ]);
  const expenseHref = (id: string) =>
    `/projects/${project.id}?section=freight#freight-${id}`;
  const orderRows = (
    value: (order: OrderSummary) => string | null,
    note: string,
  ): ProjectMetricRow[] =>
    orders.map((order) => ({
      label: order.orderNumber,
      href: `/orders/${order.id}`,
      amount: value(order),
      note,
    }));
  const freightExpenses = project.freightExpenses;
  const cost = [
    ...orderRows(
      (order) => order.costs.reportingEconomicLandedCost,
      "Order economic cost after Supplier credits, including non-deductible VAT.",
    ),
    ...freightExpenses.map((expense) => ({
      label: expense.description,
      href: expenseHref(expense.id),
      amount: convert(
        freightExpenseEconomicCost(expense),
        expense.currencyCode,
        expense.fxRateToReporting,
      ),
      note: "Separate Project freight economic cost, including non-deductible VAT.",
    })),
  ];
  const freightCost = [
    ...orderRows(
      (order) =>
        convert(
          order.costs.freight ?? "0",
          order.orderCurrencyCode,
          order.costs.purchaseFxRate,
        ),
      "Order freight HT; already included in Order cost.",
    ),
    ...freightExpenses.map((expense) => ({
      label: expense.description,
      href: expenseHref(expense.id),
      amount: convert(
        expense.costAmountHt.toString(),
        expense.currencyCode,
        expense.fxRateToReporting,
      ),
      note: "Separate Project freight HT.",
    })),
  ];
  const nonDeductibleVat = [
    ...orderRows((order) => {
      const vat = order.costs.inputVat;
      const amount = vat
        ? calculateInputVatRecovery({
            vatAmount: vat.amount,
            recoverability: vat.recoverability,
            recoverableRate: vat.recoverableRate,
          }).nonDeductibleVat.toString()
        : "0";
      const credits = order.credits;
      const creditReduction =
        !credits ||
        difference(credits.economic, credits.purchaseHt) === "0.0000"
          ? "0"
          : difference(credits.reportingEconomic, credits.reportingPurchaseHt);
      return difference(
        convert(amount, order.orderCurrencyCode, order.costs.purchaseFxRate),
        creditReduction,
      );
    }, "Known Order non-deductible input VAT after Supplier credits."),
    ...freightExpenses.map((expense) => ({
      label: expense.description,
      href: expenseHref(expense.id),
      amount: convert(
        difference(
          freightExpenseEconomicCost(expense),
          expense.costAmountHt.toString(),
        ),
        expense.currencyCode,
        expense.fxRateToReporting,
      ),
      note: "Known Project freight non-deductible input VAT.",
    })),
  ];
  const vatInput = [
    ...orderRows((order) => {
      const vat = order.costs.inputVat;
      const deductible = vat
        ? calculateInputVatRecovery({
            vatAmount: vat.amount,
            recoverability: vat.recoverability,
            recoverableRate: vat.recoverableRate,
          }).deductibleVat.toString()
        : "0";
      return difference(
        convert(
          deductible,
          order.orderCurrencyCode,
          order.costs.purchaseFxRate,
        ),
        order.credits?.reportingDeductibleVat ?? (order.credits ? null : "0"),
      );
    }, "Deductible Order input VAT after Supplier credit reductions."),
    ...freightExpenses.map((expense) => ({
      label: expense.description,
      href: expenseHref(expense.id),
      amount: convert(
        calculateInputVatRecovery({
          vatAmount: expense.vatAmount?.toString() ?? "0",
          recoverability: expense.recoverability,
          recoverableRate: expense.recoverableRate?.toString() ?? null,
        }).deductibleVat.toString(),
        expense.currencyCode,
        expense.fxRateToReporting,
      ),
      note: "Deductible Project freight input VAT.",
    })),
  ];
  const cashRows = cashOutlook.entries
    .filter((entry) => entry.source)
    .map((entry) => ({
      label: entry.source?.label ?? "Financial record",
      href: entry.source?.href ?? `/projects/${project.id}`,
      amount: entry.amount,
      note:
        entry.reviewReason ??
        (entry.due
          ? `Remaining TTC due ${entry.due}; expected FX.`
          : "Undated or unscheduled remaining TTC; review timing and expected FX."),
      kind: entry.kind,
    }));
  const budgetHref = `/projects/${project.id}`;
  const budget: ProjectMetricRow[] = [
    {
      label: "Merchandise budget",
      href: budgetHref,
      amount: project.estimatedPurchaseCostHt?.toString() ?? null,
      note: "Approved full-Project purchase HT budget; missing is not zero.",
    },
    {
      label: "Freight budget",
      href: budgetHref,
      amount: projectFreightBudget(
        project.estimatedPurchaseCostHt?.toString(),
        project.freightEstimateRate?.toString(),
      ),
      note: "Approved purchase HT budget multiplied by the Project freight estimate rate.",
    },
    {
      label: "Other/services budget",
      href: budgetHref,
      amount: project.estimatedOtherCostHt?.toString() ?? null,
      note: "Approved full-Project Other/services HT budget; enter zero explicitly when applicable.",
    },
  ];
  const alerts: ProjectDashboardAlert[] = [
    ...invoices.flatMap((invoice) => {
      const invoiced = sumKnown(
        billingRows([invoice], "totalHt").map((row) => row.amount),
      );
      const allocatedOrApproved = sumKnown(
        invoiceCoverageContributions(invoice, currency).map(
          (row) => row.amount,
        ),
      );
      if (
        invoiced === null ||
        allocatedOrApproved === null ||
        !new Decimal(invoiced).greaterThan(allocatedOrApproved)
      )
        return [];
      return [
        {
          label: "Review allocations",
          href: `/billing/${invoice.id}?tab=related#allocations`,
          note: `${invoice.reference}: some issued HT is not allocated to active Orders or approved at Project level. This does not reduce Order coverage.`,
        },
      ];
    }),
    ...input.excludedReceipts.map((receipt) => ({
      label: "Excluded receipt",
      href: `/receipts/${receipt.id}`,
      note: `${receipt.billingDocument.reference}: unmatched or ineligible Client cash is retained for review and excluded from recognized Project cash.`,
    })),
    ...cashOutlook.entries
      .filter(
        (entry) =>
          entry.source &&
          (entry.reviewReason ||
            entry.amount === null ||
            entry.due === null ||
            (entry.due < cashOutlook.today && entry.kind !== "planned")),
      )
      .map((entry) => ({
        label: entry.reviewReason
          ? "Cash review needed"
          : entry.amount === null
            ? "Missing FX"
            : entry.due === null
              ? "Date needed"
              : "Overdue balance",
        href: entry.source?.href ?? budgetHref,
        note: `${entry.source?.label}: ${entry.reviewReason ?? (entry.amount === null ? "A required expected cash FX rate is missing." : entry.due === null ? "An outstanding balance has no due date or complete schedule." : `Outstanding TTC was due ${entry.due}.`)}`,
      })),
    ...orders
      .filter((order) =>
        [
          order.costs.freight,
          order.costs.customsDuties,
          order.costs.miscellaneous,
        ].some((amount) => amount !== null && !new Decimal(amount).isZero()),
      )
      .map((order) => ({
        label: "Cost payable review",
        href: `/orders/${order.id}`,
        note: `${order.orderNumber}: freight, customs or other cost lines are economic costs outside the Supplier payable base. Review their payment coverage; no extra liability is inferred.`,
      })),
  ];
  const refundRows = (outflow: boolean): ProjectMetricRow[] =>
    input.refunds
      .filter((refund) => refund.isOutflow === outflow)
      .map((refund) => ({
        label: refund.label,
        href: refund.href,
        amount: refund.reportingAmount,
        note: "Actual dated refund; independent actual FX.",
      }));
  const dashboard = projectDashboard({
    cost,
    sell: orderRows(
      (order) => order.costs.reportingSellingRevenue,
      "Agreed active Order selling HT.",
    ),
    invoiced: billingRows(invoices, "totalHt"),
    toInvoice: billingRows(pending, "totalHt"),
    receipts: input.receipts.map((receipt) => ({
      label: receipt.billingDocument.reference,
      href: `/receipts/${receipt.id}`,
      amount: convert(
        receipt.amount.toString(),
        receipt.billingDocument.currencyCode,
        receipt.fxRateToReporting,
      ),
      note: "Recognized actual Client receipt; independent actual FX.",
    })),
    supplierPayments: input.installments.flatMap((term) =>
      term.settlements.map((payment) => ({
        label: `${term.orderNumber} · ${term.label}`,
        href: `/payments/${payment.id}`,
        amount: convert(payment.amount, term.currencyCode, payment.fxRate),
        note: "Actual Supplier settlement; independent actual FX.",
      })),
    ),
    freightPayments: freightExpenses.flatMap((expense) =>
      expense.payments.map((payment) => ({
        label: expense.description,
        href: expenseHref(expense.id),
        amount: convert(
          payment.amount.toString(),
          expense.currencyCode,
          payment.fxRateToReporting,
        ),
        note: "Actual Project freight payment; independent actual FX.",
      })),
    ),
    clientRefunds: refundRows(true),
    supplierRefunds: refundRows(false),
    toCollect: billingCashContexts(project.billingDocuments)
      .filter((context) => context.kind === "issued")
      .map(({ document, reviewReason }) => ({
        label: document.reference,
        href: `/billing/${document.id}?tab=related`,
        amount: reviewReason
          ? null
          : convert(
              getClientCreditPosition(document).outstanding,
              document.currencyCode,
              document.fxRateToReporting,
            ),
        note:
          reviewReason ??
          "Authoritative issued Invoice outstanding TTC, using the Invoice commercial FX. Cash forecast timing and term FX remain separate.",
      })),
    toPay: cashRows.filter((row) => row.kind === "payment"),
    budget,
    nonDeductibleVat,
    freightCost,
    freightMarkupRate: project.defaultFreightMarkupRate.toString(),
    freightInvoiced: billingRows(invoices, "freightCoverageHt"),
    freightReceived: input.freightReceived,
    vatOutput: billingRows(invoices, "vatAmount"),
    vatInput,
    alerts,
  });
  const budgetCost = dashboard.metrics.expectedCost.value;
  const recordedCost = dashboard.metrics.cost.value;
  if (
    budgetCost !== null &&
    recordedCost !== null &&
    new Decimal(recordedCost).greaterThan(budgetCost)
  )
    dashboard.alerts.push({
      label: "Budget exceeded",
      href: budgetHref,
      note: "Recorded economic costs exceed the complete approved Project budget plus known non-deductible VAT. Review the budget; the estimate has not been silently increased.",
    });
  const approvedSell = calculateProjectTargets({
    estimatedPurchaseCostHt: budget[0]?.amount ?? null,
    estimatedFreightCostHt: budget[1]?.amount ?? null,
    estimatedOtherCostHt: budget[2]?.amount ?? null,
    targetMode: project.targetMode,
    expectedSellHt: project.expectedSellHt?.toString() ?? null,
    defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
    defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
    defaultOtherCostMarkupRate: project.defaultOtherCostMarkupRate.toString(),
  }).expectedSellHt;
  if (
    approvedSell !== null &&
    dashboard.metrics.planned.value !== null &&
    new Decimal(dashboard.metrics.planned.value).lessThan(approvedSell)
  )
    dashboard.alerts.push({
      label: "Billing below target",
      href: budgetHref,
      note: "Issued and To be invoiced Billing HT is below the approved Project selling target. The target remains a separate approved plan.",
    });
  return dashboard;
}
