import "server-only";
import Decimal from "decimal.js";
import { projectFreightBudget } from "@/domain/freight/calculations";
import {
  financialCategoryTotals,
  freightReceiptHt,
  projectFreightCoverage,
} from "@/domain/finance/project-coverage";
import { addDays } from "date-fns";
import { getDatabase } from "@/lib/db";
import { recognizedReceiptWhere } from "@/lib/billing/receipt-eligibility";
import { listProjectOrders } from "@/lib/procurement/orders";
import { listPaymentInstallments } from "@/lib/payments/payments";
import { getProjectFreightReconciliation } from "@/lib/freight/expenses";
import { getProjectClientBillingSummary } from "@/lib/billing/reporting";
import { reportingAmount } from "@/domain/finance/calculations";
import {
  cashFunding,
  categoryPosition,
  difference,
  freightPayable,
  recoveryCategories,
  requiredRecovery,
  revenueParts,
  sumKnown,
  type RecoveryCategory,
} from "@/domain/finance/project-control";
import {
  businessToday,
  dateToDateOnly,
  dateOnlyToDate,
} from "@/domain/payments/dates";

export async function getProjectControl(projectId: string) {
  const db = getDatabase();
  const [
    project,
    orders,
    installments,
    freight,
    billing,
    actualReceipts,
    excludedReceiptCount,
  ] = await Promise.all([
    db.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        billingDocuments: {
          where: { isCancelled: false },
          include: {
            allocations: { include: { order: { select: { status: true } } } },
          },
        },
        freightExpenses: { include: { payments: true } },
      },
    }),
    listProjectOrders(projectId),
    listPaymentInstallments({ direction: "SUPPLIER_PAYMENT", projectId }),
    getProjectFreightReconciliation(projectId),
    getProjectClientBillingSummary(projectId),
    db.clientReceipt.findMany({
      where: { billingDocument: { projectId }, AND: [recognizedReceiptWhere] },
      include: {
        billingDocument: {
          select: {
            currencyCode: true,
            documentType: true,
            isCancelled: true,
            totalTtc: true,
            freightCoverageHt: true,
          },
        },
        installment: {
          select: {
            matchedInvoices: {
              where: { documentType: "INVOICE", isCancelled: false, projectId },
              select: {
                currencyCode: true,
                totalTtc: true,
                freightCoverageHt: true,
              },
            },
          },
        },
      },
    }),
    db.clientReceipt.count({
      where: { billingDocument: { projectId }, NOT: recognizedReceiptWhere },
    }),
  ]);
  const currency = project.reportingCurrencyCode;
  const convert = (
    amount: string | null,
    originalCurrencyCode: string,
    fxRate: string | null,
  ) =>
    amount === null
      ? null
      : new Decimal(amount).isZero()
        ? "0.0000"
        : (reportingAmount({
            originalAmount: amount,
            originalCurrencyCode,
            reportingCurrencyCode: currency,
            fxRateToReporting: fxRate,
          })?.toFixed(4) ?? null);
  const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
  const invoices = project.billingDocuments.filter(
    (doc) => doc.documentType === "INVOICE",
  );
  const received = sumKnown(
    actualReceipts.map((row) =>
      convert(
        row.amount.toString(),
        row.billingDocument.currencyCode,
        row.fxRateToReporting?.toString() ?? null,
      ),
    ),
  );
  const billedTtc = sumKnown(
    invoices.map((doc) =>
      convert(
        doc.totalTtc.toString(),
        doc.currencyCode,
        doc.fxRateToReporting?.toString() ?? null,
      ),
    ),
  );
  const clientFreightPaidHt = sumKnown(
    actualReceipts.map((receipt) => {
      const owner = receipt.billingDocument;
      const matches = receipt.installment?.matchedInvoices ?? [];
      // Prefer the owning active Invoice; a matched Quote receipt is counted once.
      const invoice =
        owner.documentType === "INVOICE" && !owner.isCancelled
          ? owner
          : matches.length === 1
            ? matches[0]
            : undefined;
      if (!invoice || invoice.currencyCode !== owner.currencyCode) return null;
      return convert(
        freightReceiptHt(
          receipt.amount.toString(),
          invoice.totalTtc.toString(),
          invoice.freightCoverageHt.toString(),
        ),
        owner.currencyCode,
        receipt.fxRateToReporting?.toString() ?? null,
      );
    }),
  );
  const categoryRevenue = (
    category: RecoveryCategory,
    allocated: boolean,
    quoted = false,
  ) =>
    sumKnown(
      (quoted
        ? project.billingDocuments.filter((doc) => doc.documentType === "QUOTE")
        : invoices
      ).flatMap((doc) => {
        const rows = allocated
          ? doc.allocations
              .filter((row) => row.order.status !== "CANCELLED")
              .map((row) =>
                revenueParts(
                  row.allocatedAmount.toString(),
                  row.freightCoverageHt.toString(),
                  row.otherCoverageHt.toString(),
                ),
              )
          : [
              revenueParts(
                doc.totalHt.toString(),
                doc.freightCoverageHt.toString(),
                doc.otherCoverageHt.toString(),
              ),
            ];
        return rows.map((row) =>
          convert(
            row[category],
            doc.currencyCode,
            doc.fxRateToReporting?.toString() ?? null,
          ),
        );
      }),
    );
  const purchases = activeOrders.map((order) =>
    convert(
      order.costs.purchaseCost,
      order.orderCurrencyCode,
      order.costs.purchaseFxRate,
    ),
  );
  const otherCosts = activeOrders.map((order) =>
    sumKnown([
      convert(
        order.costs.customsDuties ?? "0",
        order.orderCurrencyCode,
        order.costs.purchaseFxRate,
      ),
      convert(
        order.costs.miscellaneous ?? "0",
        order.orderCurrencyCode,
        order.costs.purchaseFxRate,
      ),
    ]),
  );
  const recordedCosts = {
    merchandise: sumKnown(purchases),
    freight: freight?.actualCostHt ?? null,
    other: sumKnown(otherCosts),
  };
  const markups = {
    merchandise: project.defaultProductMarkupRate.toString(),
    freight: project.defaultFreightMarkupRate.toString(),
    other: project.defaultOtherCostMarkupRate.toString(),
  };
  const budgets = {
    merchandise: project.estimatedPurchaseCostHt?.toString() ?? null,
    freight: projectFreightBudget(
      project.estimatedPurchaseCostHt?.toString(),
      project.freightEstimateRate?.toString(),
    ),
    other: null,
  };
  const targets = {
    merchandise: sumKnown(
      activeOrders.map((order, index) =>
        requiredRecovery(
          purchases[index] ?? null,
          order.componentPricing.productMarkupRate,
        ),
      ),
    ),
    freight: freight?.recoveryTargetHt ?? null,
    other: sumKnown(
      activeOrders.map((order, index) =>
        requiredRecovery(
          otherCosts[index] ?? null,
          order.componentPricing.otherMarkupRate,
        ),
      ),
    ),
  };
  const categories = recoveryCategories.map((category) => ({
    category,
    quoted: categoryRevenue(category, false, true),
    ...categoryPosition({
      billed: categoryRevenue(category, false),
      allocated: categoryRevenue(category, true),
      budget: budgets[category],
      recordedCost: recordedCosts[category],
      markup: markups[category],
      recordedTarget: targets[category],
    }),
  }));
  const supplierPaid = sumKnown(
    installments.flatMap((row) =>
      row.settlements.map((payment) =>
        convert(payment.amount, row.currencyCode, payment.fxRate),
      ),
    ),
  );
  const freightPaid = sumKnown(
    project.freightExpenses.flatMap((expense) =>
      expense.payments.map((payment) =>
        convert(
          payment.amount.toString(),
          expense.currencyCode,
          payment.fxRateToReporting?.toString() ?? null,
        ),
      ),
    ),
  );
  const commitments = installments
    .filter((row) => !row.isCancelled)
    .map((row) => ({
      dueDate: row.dueDate,
      amount: convert(
        row.outstandingAmount,
        row.currencyCode,
        row.expectedFxRate,
      ),
    }));
  for (const expense of project.freightExpenses) {
    const remaining = new Decimal(
      freightPayable(
        expense.costAmountHt.toString(),
        expense.vatAmount?.toString() ?? null,
        expense.vatTreatment,
      ),
    )
      .minus(
        expense.payments.reduce(
          (sum, row) => sum.plus(row.amount),
          new Decimal(0),
        ),
      )
      .toFixed(4);
    commitments.push({
      dueDate: expense.dueDate ? dateToDateOnly(expense.dueDate) : "",
      amount: convert(
        remaining,
        expense.currencyCode,
        expense.fxRateToReporting?.toString() ?? null,
      ),
    });
  }
  const horizonEnd = dateToDateOnly(
    addDays(dateOnlyToDate(businessToday()), 30),
  );
  const totalOrderEconomicCost = sumKnown(
    activeOrders.map((order) => order.costs.reportingEconomicLandedCost),
  );
  const orderHtCost = sumKnown(
    activeOrders.map((order) => order.costs.reportingLandedCost),
  );
  return {
    currency,
    categories,
    totals: financialCategoryTotals(categories),
    freightCoverage: projectFreightCoverage({
      supplierHt: sumKnown([
        ...activeOrders.map((order) =>
          convert(
            order.costs.freight ?? "0",
            order.orderCurrencyCode,
            order.costs.purchaseFxRate,
          ),
        ),
        ...project.freightExpenses.map((expense) =>
          convert(
            expense.costAmountHt.toString(),
            expense.currencyCode,
            expense.fxRateToReporting?.toString() ?? null,
          ),
        ),
      ]),
      projectMarkup: project.defaultFreightMarkupRate.toString(),
      clientInvoicedHt: categoryRevenue("freight", false),
      clientPaidHt: clientFreightPaidHt,
    }),
    supplierPaid,
    freightPaid,
    horizonEnd,
    orderNonDeductibleVat: difference(totalOrderEconomicCost, orderHtCost),
    freightAllowance: freight?.expectedFreightAllowanceHt ?? null,
    excludedReceiptCount,
    billedTtc,
    received,
    outstandingTtc: billing?.complete ? billing.outstandingTtc : null,
    cash: cashFunding({
      received,
      supplierPaid,
      freightPaid,
      commitments: commitments.map((row) => ({
        ...row,
        dueDate: row.dueDate || null,
      })),
      horizonEnd,
    }),
  };
}
export type ProjectControl = Awaited<ReturnType<typeof getProjectControl>>;
