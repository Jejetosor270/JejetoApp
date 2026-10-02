import { billingIsIssued } from "@/domain/billing/status";
import "server-only";
import Decimal from "decimal.js";
import type { ProjectFinancialRow } from "@/domain/projects/financial-drilldown";
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
import {
  isPlannedProjectBilling,
  projectOverview,
} from "@/domain/finance/project-overview";
import { getDatabase } from "@/lib/db";
import { activeCreditsInclude } from "@/lib/credits/select";
import { listCreditRefundCash } from "./credit-refunds";
import { capSupplierTermsForCredits } from "./reports";
import { recognizedReceiptWhere } from "@/lib/billing/receipt-eligibility";
import { listProjectOrders } from "@/lib/procurement/orders";
import { listProjectSupplierInstallments } from "@/lib/payments/payments";
import {
  freightExpenseEconomicCost,
  getProjectFreightReconciliation,
} from "@/lib/freight/expenses";
import { getProjectClientBillingSummary } from "@/lib/billing/reporting";
import { reportingAmount } from "@/domain/finance/calculations";
import { billingCashContexts } from "@/domain/billing/cash-expectations";
import { getClientCreditPosition } from "@/domain/billing/credits";
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
  cashWindowEnd,
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
    refunds,
  ] = await Promise.all([
    db.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        billingDocuments: {
          where: { isCancelled: false },
          include: {
            credits: activeCreditsInclude,
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
    listProjectSupplierInstallments(projectId),
    getProjectFreightReconciliation(projectId),
    getProjectClientBillingSummary(projectId),
    db.clientReceipt.findMany({
      where: { billingDocument: { projectId }, AND: [recognizedReceiptWhere] },
      include: {
        billingDocument: {
          select: {
            reference: true,
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
    listCreditRefundCash([projectId]),
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
  const supplierRefundsReceived = sumKnown(
    refunds.filter((row) => !row.isOutflow).map((row) => row.reportingAmount),
  );
  const clientRefundsPaid = sumKnown(
    refunds.filter((row) => row.isOutflow).map((row) => row.reportingAmount),
  );
  const billedTtc = sumKnown(
    invoices.flatMap((doc) => [
      convert(
        doc.totalTtc.toString(),
        doc.currencyCode,
        doc.fxRateToReporting?.toString() ?? null,
      ),
      ...(doc.credits ?? [])
        .filter((credit) => !credit.isCancelled)
        .map((credit) =>
          credit.reportingCurrencyCode !== currency
            ? null
            : difference(
                "0",
                convert(
                  new Decimal(credit.totalHt.toString())
                    .plus(credit.vatAmount.toString())
                    .toString(),
                  credit.currencyCode,
                  credit.fxRateToReporting?.toString() ?? null,
                ),
              ),
        ),
    ]),
  );
  const clientFreightPaidHt = sumKnown([
    ...actualReceipts.map((receipt) => {
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
    ...refunds
      .filter((row) => row.isOutflow)
      .map((row) => {
        const freight = freightReceiptHt(
          row.amount,
          row.creditTotalTtc,
          row.creditFreightHt,
        );
        return freight === null
          ? null
          : difference("0", convert(freight, row.currencyCode, row.fxRate));
      }),
  ]);
  const categoryRevenue = (
    category: RecoveryCategory,
    allocated: boolean,
    quoted = false,
    planned = false,
  ) =>
    sumKnown(
      (planned
        ? project.billingDocuments.filter(isPlannedProjectBilling)
        : quoted
          ? project.billingDocuments.filter(
              (doc) => doc.documentType === "QUOTE",
            )
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
        const original = rows.map((row) =>
          convert(
            row[category],
            doc.currencyCode,
            doc.fxRateToReporting?.toString() ?? null,
          ),
        );
        if (quoted) return original;
        return [
          ...original,
          ...(doc.credits ?? [])
            .filter((credit) => !credit.isCancelled)
            .flatMap((credit) => {
              const portions = allocated
                ? credit.allocations
                    .filter((allocation) =>
                      doc.allocations.some(
                        (source) =>
                          source.orderId === allocation.orderId &&
                          source.order.status !== "CANCELLED",
                      ),
                    )
                    .map((allocation) =>
                      revenueParts(
                        allocation.amountHt.toString(),
                        allocation.freightCoverageHt.toString(),
                        allocation.otherCoverageHt.toString(),
                      ),
                    )
                : [
                    revenueParts(
                      credit.totalHt.toString(),
                      credit.freightCoverageHt.toString(),
                      credit.otherCoverageHt.toString(),
                    ),
                  ];
              return portions.map((part) =>
                credit.reportingCurrencyCode !== currency
                  ? null
                  : difference(
                      "0",
                      convert(
                        part[category],
                        credit.currencyCode,
                        credit.fxRateToReporting?.toString() ?? null,
                      ),
                    ),
              );
            }),
        ];
      }),
    );
  const purchases = activeOrders.map((order) =>
    difference(
      convert(
        order.costs.purchaseCost,
        order.orderCurrencyCode,
        order.costs.purchaseFxRate,
      ),
      order.credits?.reportingPurchaseHt ?? (order.credits ? null : "0"),
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
  const cappedInstallments = capSupplierTermsForCredits(installments, orders);
  const commitments = cappedInstallments
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
  const horizonEnd = cashWindowEnd(businessToday(), 30);
  const actualCashIn = sumKnown([received, supplierRefundsReceived]);
  const actualCashOut = sumKnown([
    supplierPaid,
    freightPaid,
    clientRefundsPaid,
  ]);
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
    source: {
      label: order.orderNumber,
      href: `/orders/${order.id}?tab=related`,
    },
    kind: "payment",
    currency: order.orderCurrencyCode,
    total: order.supplierPayment.totalPayable,
    paid: order.supplierPayment.netPaid ?? order.supplierPayment.paid,
    creditAdjusted: (order.credits?.count ?? 0) > 0,
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
  for (const order of activeOrders) {
    if (!order.credits?.count) continue;
    const refundDue = order.supplierPayment.refundDue ?? "0";
    if (new Decimal(refundDue).greaterThan(0))
      outlookDocuments.push({
        source: {
          label: `Supplier refund · ${order.orderNumber}`,
          href: `/orders/${order.id}?tab=related#credits`,
        },
        kind: "issued",
        currency: order.orderCurrencyCode,
        total: refundDue,
        paid: "0",
        fx: null,
        terms: [],
      });
  }
  for (const context of billingCashContexts(project.billingDocuments)) {
    const { document: doc, terms } = context;
    outlookDocuments.push({
      source: { label: doc.reference, href: `/billing/${doc.id}?tab=related` },
      kind: context.kind,
      reviewReason: context.reviewReason,
      currency: doc.currencyCode,
      total: context.total,
      paid: context.paid,
      creditAdjusted: (doc.credits?.length ?? 0) > 0,
      fx: doc.fxRateToReporting?.toString() ?? null,
      terms: terms.map((term) => ({
        amount: term.scheduledAmount.toString(),
        paid: totalPaid(term.receipts),
        due: dateToDateOnly(term.dueDate ?? doc.dueDate),
        fx: term.expectedFxRateToReporting?.toString() ?? null,
        cancelled: term.isCancelled,
      })),
    });
    if (
      context.kind === "issued" &&
      !context.reviewReason &&
      doc.credits.length > 0
    ) {
      const refundDue = getClientCreditPosition(doc).refundDue;
      if (new Decimal(refundDue).greaterThan(0))
        outlookDocuments.push({
          source: {
            label: `Client refund · ${doc.reference}`,
            href: `/billing/${doc.id}?tab=related#credits`,
          },
          kind: "payment",
          currency: doc.currencyCode,
          total: refundDue,
          paid: "0",
          fx: null,
          terms: [],
        });
    }
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
      source: {
        label: expense.description,
        href: `/projects/${projectId}?tab=freight`,
      },
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
  const cashOutlook = projectCashOutlook(
    outlookDocuments,
    currency,
    businessToday(),
    difference(actualCashIn, actualCashOut),
  );
  const drilldowns: ProjectFinancialRow[] = [
    ...invoices.map((doc) => ({
      kind: "billed" as const,
      label: doc.reference,
      href: `/billing/${doc.id}`,
      due: null,
      amount: sumKnown([
        convert(
          doc.totalHt.toString(),
          doc.currencyCode,
          doc.fxRateToReporting?.toString() ?? null,
        ),
        ...(doc.credits ?? [])
          .filter((credit) => !credit.isCancelled)
          .map((credit) =>
            credit.reportingCurrencyCode !== currency
              ? null
              : difference(
                  "0",
                  convert(
                    credit.totalHt.toString(),
                    credit.currencyCode,
                    credit.fxRateToReporting?.toString() ?? null,
                  ),
                ),
          ),
      ]),
    })),
    ...activeOrders.map((order) => ({
      kind: "cost" as const,
      label: order.orderNumber,
      href: `/orders/${order.id}`,
      due: null,
      amount: order.costs.reportingEconomicLandedCost,
    })),
    ...project.freightExpenses.map((expense) => ({
      kind: "cost" as const,
      label: expense.description,
      href: `/projects/${projectId}?tab=freight`,
      due: null,
      amount: convert(
        freightExpenseEconomicCost(expense).toString(),
        expense.currencyCode,
        expense.fxRateToReporting?.toString() ?? null,
      ),
    })),
    ...actualReceipts.map((receipt) => ({
      kind: "received" as const,
      label: receipt.billingDocument.reference,
      href: `/billing/${receipt.billingDocumentId}?tab=related`,
      due: dateToDateOnly(receipt.receivedAt),
      amount: convert(
        receipt.amount.toString(),
        receipt.billingDocument.currencyCode,
        receipt.fxRateToReporting?.toString() ?? null,
      ),
    })),
    ...installments.flatMap((term) =>
      term.settlements.map((payment) => ({
        kind: "paid" as const,
        label: `${term.orderNumber} · ${term.label}`,
        href: `/orders/${term.orderId}?tab=related`,
        due: payment.settledAt,
        amount: convert(payment.amount, term.currencyCode, payment.fxRate),
      })),
    ),
    ...project.freightExpenses.flatMap((expense) =>
      expense.payments.map((payment) => ({
        kind: "paid" as const,
        label: expense.description,
        href: `/projects/${projectId}?tab=freight`,
        due: dateToDateOnly(payment.paidAt),
        amount: convert(
          payment.amount.toString(),
          expense.currencyCode,
          payment.fxRateToReporting?.toString() ?? null,
        ),
      })),
    ),
    ...refunds.map((refund) => ({
      kind: refund.isOutflow ? ("paid" as const) : ("received" as const),
      label: refund.label,
      href: refund.href,
      due: refund.receivedAt,
      amount: refund.reportingAmount,
    })),
    ...cashOutlook.entries.flatMap((entry) =>
      entry.source
        ? [
            {
              kind: entry.kind,
              ...entry.source,
              amount: entry.amount,
              due: entry.due,
            },
          ]
        : [],
    ),
  ];
  return {
    overview: projectOverview({
      issuedHt: sumKnown(categories.map((category) => category.billed)),
      orderCostHt: orderHtCost,
      orderEconomicCost: totalOrderEconomicCost,
      orderSellHt: sumKnown(
        activeOrders.map((order) => order.costs.reportingSellingRevenue),
      ),
      freightCostHt: sumKnown(
        project.freightExpenses.map((expense) =>
          convert(
            expense.costAmountHt.toString(),
            expense.currencyCode,
            expense.fxRateToReporting?.toString() ?? null,
          ),
        ),
      ),
      freightEconomicCost: freight?.projectExpenseEconomicCost.complete
        ? freight.projectExpenseEconomicCost.value
        : null,
      clientReceivedTtc: received,
      clientRefundedTtc: clientRefundsPaid,
      supplierPaidTtc: supplierPaid,
      freightPaidTtc: freightPaid,
      supplierRefundedTtc: supplierRefundsReceived,
      recordedPayableTtc: sumKnown([
        ...activeOrders.map((order) =>
          convert(
            order.supplierPayment.totalPayable,
            order.orderCurrencyCode,
            order.costs.purchaseFxRate,
          ),
        ),
        ...project.freightExpenses.map((expense) =>
          convert(
            freightPayable(
              expense.costAmountHt.toString(),
              expense.vatAmount?.toString() ?? null,
              expense.vatTreatment,
            ),
            expense.currencyCode,
            expense.fxRateToReporting?.toString() ?? null,
          ),
        ),
      ]),
      plannedCategories: recoveryCategories.map((category) => ({
        billedHt: categoryRevenue(category, false, false, true),
        markupRate: markups[category],
      })),
    }),
    cashOutlook,
    drilldowns,
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
    supplierRefundsReceived,
    clientRefundsPaid,
    actualCashIn,
    actualCashOut,
    outstandingTtc: billing?.complete ? billing.outstandingTtc : null,
    cash: cashFunding({
      received: actualCashIn,
      supplierPaid: sumKnown([supplierPaid, clientRefundsPaid]),
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
