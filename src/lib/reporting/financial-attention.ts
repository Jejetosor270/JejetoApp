import "server-only";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { getDatabase } from "@/lib/db";
import { listOrders } from "@/lib/procurement/orders";
import { listPaymentInstallments } from "@/lib/payments/payments";
import { freightExpenseEconomicCost } from "@/lib/freight/expenses";
import { freightPaymentBalance } from "@/domain/finance/project-control";
import { reportingAmount } from "@/domain/finance/calculations";
import {
  calculateProjectTargets,
  calculateProjectActualProfitability,
  sumComparableFinancialAmounts,
} from "@/domain/projects/targets";
import { projectFreightBudget } from "@/domain/freight/calculations";
import { billingIsIssued } from "@/domain/billing/status";
import { businessToday, dateToDateOnly } from "@/domain/payments/dates";
import {
  buildFinancialAttention,
  type AttentionDocument,
  type AttentionHorizon,
  type AttentionIssue,
} from "@/domain/finance/attention";

export function attentionFingerprint(issue: AttentionIssue) {
  return createHash("sha256").update(JSON.stringify(issue)).digest("hex");
}
const paidTotal = (rows: readonly { amount: { toString(): string } }[]) =>
  rows
    .reduce((sum, row) => sum.plus(row.amount.toString()), new Decimal(0))
    .toFixed(4);
const missingFx = (currency: string, reporting: string, fx: unknown) =>
  currency !== reporting && fx == null;
const receiptSelect = {
  id: true,
  amount: true,
  fxRateToReporting: true,
} as const;
const termInclude = { receipts: { select: receiptSelect } } as const;

/** Batched reads only; no per-Project or per-document detail queries. */
export async function getFinancialAttention(
  horizon: AttentionHorizon,
  today = businessToday(),
) {
  const db = getDatabase();
  const projects = await db.project.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const projectIds = projects.map((project) => project.id);
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const [orders, terms, bills, freight] = projectIds.length
    ? await Promise.all([
        listOrders({ projectIds, query: "" }),
        listPaymentInstallments({ projectIds, direction: "SUPPLIER_PAYMENT" }),
        db.clientBillingDocument.findMany({
          where: {
            projectId: { in: projectIds },
            documentType: "INVOICE",
            isCancelled: false,
            workflowStatus: { not: "CANCELLED" },
          },
          include: {
            receipts: { select: receiptSelect },
            paymentInstallments: {
              include: termInclude,
              orderBy: [{ sequence: "asc" }, { id: "asc" }],
            },
            matchedInstallment: { include: termInclude },
          },
        }),
        db.projectFreightExpense.findMany({
          where: { projectId: { in: projectIds } },
          include: { payments: true },
        }),
      ])
    : [[], [], [], []];
  const documents: AttentionDocument[] = [];
  const orderTerms = new Map<string, typeof terms>();
  for (const term of terms) {
    const group = orderTerms.get(term.orderId) ?? [];
    group.push(term);
    orderTerms.set(term.orderId, group);
  }
  for (const order of orders) {
    if (order.status === "CANCELLED") continue;
    documents.push({
      id: order.id,
      side: "supplier",
      projectId: order.project.id,
      projectName: order.project.name,
      reportingCurrency: order.project.reportingCurrencyCode,
      reference: order.orderNumber,
      partyId: order.supplier.id,
      href: `/orders/${order.id}?tab=related`,
      date: order.invoiceDate,
      dueDate: null,
      currency: order.orderCurrencyCode,
      totalHt: order.costs.purchaseCost,
      totalTtc: order.supplierPayment.totalPayable,
      paid: order.supplierPayment.paid,
      issued: true,
      toInvoice: false,
      fxMissing: order.costs.missingFx.length > 0,
      actualFxMissing: false,
      terms: (orderTerms.get(order.id) ?? []).map((term) => ({
        id: term.id,
        dueDate: term.dueDate,
        currency: term.currencyCode,
        scheduled: term.scheduledAmount,
        paid: term.paidAmount,
        fx: term.expectedFxRate,
        cancelled: term.isCancelled,
        href: `/installments/supplier/${term.id}`,
        actualFxMissing: term.settlements.some((payment) =>
          missingFx(
            term.currencyCode,
            order.project.reportingCurrencyCode,
            payment.fxRate,
          ),
        ),
      })),
    });
  }
  for (const bill of bills) {
    const project = bill.projectId ? projectMap.get(bill.projectId) : undefined;
    if (!project) continue;
    const receipts = [
      ...new Map(
        [...bill.receipts, ...(bill.matchedInstallment?.receipts ?? [])].map(
          (row) => [row.id, row],
        ),
      ).values(),
    ];
    documents.push({
      id: bill.id,
      side: "client",
      projectId: project.id,
      projectName: project.name,
      reportingCurrency: project.reportingCurrencyCode,
      reference: bill.reference,
      partyId: bill.clientId ?? "",
      href: `/billing/${bill.id}?tab=related`,
      date: dateToDateOnly(bill.documentDate),
      dueDate: dateToDateOnly(bill.dueDate),
      currency: bill.currencyCode,
      totalHt: bill.totalHt.toString(),
      totalTtc: bill.totalTtc.toString(),
      paid: paidTotal(receipts),
      issued: billingIsIssued(bill),
      toInvoice: bill.workflowStatus === "TO_BE_INVOICED",
      fxMissing: missingFx(
        bill.currencyCode,
        project.reportingCurrencyCode,
        bill.fxRateToReporting,
      ),
      actualFxMissing: receipts.some((receipt) =>
        missingFx(
          bill.currencyCode,
          project.reportingCurrencyCode,
          receipt.fxRateToReporting,
        ),
      ),
      terms: (bill.matchedInstallment
        ? [bill.matchedInstallment]
        : bill.paymentInstallments
      ).map((term) => ({
        id: term.id,
        dueDate: dateToDateOnly(term.dueDate),
        currency: term.currencyCode,
        scheduled: term.scheduledAmount.toString(),
        paid: paidTotal(term.receipts),
        fx: term.expectedFxRateToReporting?.toString() ?? null,
        cancelled: term.isCancelled,
        href: `/installments/client/${term.id}`,
        actualFxMissing: term.receipts.some((receipt) =>
          missingFx(
            term.currencyCode,
            project.reportingCurrencyCode,
            receipt.fxRateToReporting,
          ),
        ),
      })),
    });
  }
  for (const expense of freight) {
    const project = expense.projectId
      ? projectMap.get(expense.projectId)
      : undefined;
    if (!project) continue;
    const balance = freightPaymentBalance(
      expense.costAmountHt.toString(),
      expense.vatAmount?.toString() ?? null,
      expense.vatTreatment,
      expense.payments.map((payment) => payment.amount.toString()),
    );
    const href = `/projects/${project.id}?tab=related#freight`;
    documents.push({
      id: expense.id,
      side: "freight",
      projectId: project.id,
      projectName: project.name,
      reportingCurrency: project.reportingCurrencyCode,
      reference: expense.reference ?? expense.description,
      partyId: expense.supplierId ?? "",
      href,
      date: dateToDateOnly(expense.expenseDate),
      dueDate: dateToDateOnly(expense.dueDate),
      currency: expense.currencyCode,
      totalHt: expense.costAmountHt.toString(),
      totalTtc: balance.payable,
      paid: balance.paid,
      issued: true,
      toInvoice: false,
      fxMissing: missingFx(
        expense.currencyCode,
        project.reportingCurrencyCode,
        expense.fxRateToReporting,
      ),
      actualFxMissing: expense.payments.some((payment) =>
        missingFx(
          expense.currencyCode,
          project.reportingCurrencyCode,
          payment.fxRateToReporting,
        ),
      ),
      terms: [
        {
          id: expense.id,
          href,
          dueDate: dateToDateOnly(expense.dueDate),
          currency: expense.currencyCode,
          scheduled: balance.payable,
          paid: balance.paid,
          fx: expense.fxRateToReporting?.toString() ?? null,
          cancelled: false,
          actualFxMissing: false,
        },
      ],
    });
  }
  const metrics = projects.map((project) => {
    const convert = (
      amount: string,
      currency: string,
      fx: { toString(): string } | null,
    ) =>
      reportingAmount({
        originalAmount: amount,
        originalCurrencyCode: currency,
        reportingCurrencyCode: project.reportingCurrencyCode,
        fxRateToReporting: fx?.toString() ?? null,
      })?.toFixed(4) ?? null;
    const costs = sumComparableFinancialAmounts(
      ...[
        ...orders
          .filter(
            (order) =>
              order.project.id === project.id && order.status !== "CANCELLED",
          )
          .map((order) => order.costs.reportingEconomicLandedCost),
        ...freight
          .filter((expense) => expense.projectId === project.id)
          .map((expense) =>
            convert(
              freightExpenseEconomicCost(expense),
              expense.currencyCode,
              expense.fxRateToReporting,
            ),
          ),
      ],
    );
    const revenue = sumComparableFinancialAmounts(
      ...bills
        .filter(
          (bill) => bill.projectId === project.id && billingIsIssued(bill),
        )
        .map((bill) =>
          convert(
            bill.totalHt.toString(),
            bill.currencyCode,
            bill.fxRateToReporting,
          ),
        ),
    );
    const target = calculateProjectTargets({
      targetMode: project.targetMode,
      targetMarkupRate: project.targetMarkupRate?.toString() ?? null,
      estimatedPurchaseCostHt:
        project.estimatedPurchaseCostHt?.toString() ?? null,
      estimatedFreightCostHt: projectFreightBudget(
        project.estimatedPurchaseCostHt?.toString(),
        project.freightEstimateRate?.toString(),
      ),
      estimatedOtherCostHt: project.estimatedOtherCostHt?.toString() ?? null,
      expectedSellHt: project.expectedSellHt?.toString() ?? null,
      defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
      defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
      defaultOtherCostMarkupRate: project.defaultOtherCostMarkupRate.toString(),
    });
    return {
      id: project.id,
      name: project.name,
      currency: project.reportingCurrencyCode,
      actualMarkup: calculateProjectActualProfitability(costs, revenue)
        .markupRate,
      targetMarkup: target.effectiveMarkupRate,
    };
  });
  return {
    projects: projects.map(({ id, name, code, status }) => ({
      id,
      name,
      code,
      status,
    })),
    issues: buildFinancialAttention(documents, metrics, today, horizon).map(
      (issue) => ({ ...issue, fingerprint: attentionFingerprint(issue) }),
    ),
  };
}
