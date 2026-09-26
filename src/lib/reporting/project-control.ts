import { billingIsIssued } from "@/domain/billing/status";
import "server-only";
import Decimal from "decimal.js";
import {
  projectCashOutlook,
  type CashOutlookDocument,
} from "@/domain/finance/project-cash-outlook";
import { calculateProjectTargets } from "@/domain/projects/targets";
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
            receipts: { select: { id: true, amount: true } },
            paymentInstallments: {
              include: { receipts: { select: { id: true, amount: true } } },
            },
            matchedInstallment: {
              include: { receipts: { select: { id: true, amount: true } } },
            },
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
            workflowStatus: true,
            totalTtc: true,
            freightCoverageHt: true,
          },
        },
        installment: {
          select: {
            matchedInvoices: {
              where: {
                documentType: "INVOICE",
                isCancelled: false,
                workflowStatus: {
                  notIn: ["DRAFT", "TO_BE_INVOICED", "CANCELLED"],
                },
                projectId,
              },
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
    (doc) => doc.documentType === "INVOICE" && billingIsIssued(doc),
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
        owner.documentType === "INVOICE" && billingIsIssued(owner)
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
  const freightHt = sumKnown([
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
  ]);
  const recordedCosts = {
    merchandise: sumKnown(purchases),
    freight: freightHt,
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
    other: project.estimatedOtherCostHt?.toString() ?? null,
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
    freight: sumKnown([
      ...activeOrders.map((order) =>
        requiredRecovery(
          convert(
            order.costs.freight ?? "0",
            order.orderCurrencyCode,
            order.costs.purchaseFxRate,
          ),
          order.componentPricing.freightMarkupRate,
        ),
      ),
      ...project.freightExpenses.map((expense) =>
        requiredRecovery(
          convert(
            expense.costAmountHt.toString(),
            expense.currencyCode,
            expense.fxRateToReporting?.toString() ?? null,
          ),
          expense.freightMarkupOverrideRate?.toString() ??
            project.defaultFreightMarkupRate.toString(),
        ),
      ),
    ]),
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
  const approvedTarget = calculateProjectTargets({
    estimatedPurchaseCostHt: budgets.merchandise,
    estimatedFreightCostHt: budgets.freight,
    estimatedOtherCostHt: budgets.other,
    defaultProductMarkupRate: markups.merchandise,
    defaultFreightMarkupRate: markups.freight,
    defaultOtherCostMarkupRate: markups.other,
    expectedSellHt: project.expectedSellHt?.toString() ?? null,
    targetMode: project.targetMode,
  });
  if (project.targetMode === "EXPECTED_SELL") {
    // A direct Project target has no employee-approved category allocation.
    for (const category of categories) category.budgetTarget = null;
  }
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
  const totalPaid = (
    rows: readonly { id: string; amount: { toString(): string } }[],
  ) =>
    [...new Map(rows.map((row) => [row.id, row])).values()]
      .reduce((sum, row) => sum.plus(row.amount.toString()), new Decimal(0))
      .toFixed(4);
  const outlookDocuments: CashOutlookDocument[] = activeOrders.map((order) => ({
    kind: "payment",
    currency: order.orderCurrencyCode,
    total: order.supplierPayment.totalPayable,
    paid: order.supplierPayment.paid,
    fx: order.costs.purchaseFxRate,
    terms: installments
      .filter((term) => term.orderId === order.id)
      .map((term) => ({
        amount: term.scheduledAmount,
        paid: term.paidAmount,
        due: term.dueDate,
        fx: term.expectedFxRate,
        cancelled: term.isCancelled,
      })),
  }));
  const outlookBills = project.billingDocuments.filter(
    (doc) =>
      doc.workflowStatus !== "CANCELLED" && doc.workflowStatus !== "DRAFT",
  );
  const matchedTerms = new Set(
    outlookBills
      .filter((doc) => doc.documentType === "INVOICE")
      .flatMap((doc) =>
        doc.matchedInstallmentId ? [doc.matchedInstallmentId] : [],
      ),
  );
  for (const doc of outlookBills) {
    const quote = doc.documentType === "QUOTE";
    const allTerms = doc.matchedInstallment
      ? [doc.matchedInstallment]
      : doc.paymentInstallments;
    const terms = quote
      ? allTerms.filter((term) => !matchedTerms.has(term.id))
      : allTerms;
    const partlyMatchedQuote = quote && terms.length !== allTerms.length;
    const transferredTerms = partlyMatchedQuote
      ? allTerms.filter((term) => matchedTerms.has(term.id))
      : [];
    const transferredReceipts = new Set(
      transferredTerms.flatMap((term) =>
        term.receipts.map((receipt) => receipt.id),
      ),
    );
    // Once an Invoice owns a Quote term, that term is no longer planned revenue.
    const receipts = partlyMatchedQuote
      ? doc.receipts.filter((receipt) => !transferredReceipts.has(receipt.id))
      : [...doc.receipts, ...(doc.matchedInstallment?.receipts ?? [])];
    outlookDocuments.push({
      kind: !quote && billingIsIssued(doc) ? "issued" : "planned",
      currency: doc.currencyCode,
      total: partlyMatchedQuote
        ? Decimal.max(
            0,
            new Decimal(doc.totalTtc.toString()).minus(
              transferredTerms.reduce(
                (sum, term) => sum.plus(term.scheduledAmount),
                new Decimal(0),
              ),
            ),
          ).toFixed(4)
        : doc.totalTtc.toString(),
      paid: totalPaid(receipts),
      fx: doc.fxRateToReporting?.toString() ?? null,
      terms: terms.map((term) => ({
        amount: term.scheduledAmount.toString(),
        paid: totalPaid(term.receipts),
        due: dateToDateOnly(term.dueDate ?? doc.dueDate),
        fx: term.expectedFxRateToReporting?.toString() ?? null,
        cancelled: term.isCancelled,
      })),
    });
  }
  for (const expense of project.freightExpenses) {
    const total = freightPayable(
      expense.costAmountHt.toString(),
      expense.vatAmount?.toString() ?? null,
      expense.vatTreatment,
    );
    const paid = totalPaid(expense.payments);
    const fx = expense.fxRateToReporting?.toString() ?? null;
    outlookDocuments.push({
      kind: "payment",
      currency: expense.currencyCode,
      total,
      paid,
      fx,
      terms: [
        {
          amount: total,
          paid,
          fx,
          due: dateToDateOnly(expense.dueDate),
          cancelled: false,
        },
      ],
    });
  }
  return {
    cashOutlook: projectCashOutlook(
      outlookDocuments,
      currency,
      businessToday(),
      difference(received, sumKnown([supplierPaid, freightPaid])),
    ),
    currency,
    categories,
    directTarget: project.targetMode === "EXPECTED_SELL",
    totals: {
      ...financialCategoryTotals(categories),
      budgetTarget: approvedTarget.expectedSellHt,
    },
    economicReconciliation: {
      recordedHt: sumKnown(Object.values(recordedCosts)),
      orderNonDeductibleVat: difference(totalOrderEconomicCost, orderHtCost),
      freightNonDeductibleVat: freight?.projectExpenseNonDeductibleInputVat
        .complete
        ? freight.projectExpenseNonDeductibleInputVat.value
        : null,
      economicCost: sumKnown([
        totalOrderEconomicCost,
        freight?.projectExpenseEconomicCost.complete
          ? freight.projectExpenseEconomicCost.value
          : null,
      ]),
    },
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
