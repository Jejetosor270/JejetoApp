import "server-only";
import Decimal from "decimal.js";
import {
  billingCashContexts,
  uniqueReceiptTotal,
} from "@/domain/billing/cash-expectations";
import {
  getClientCreditPosition,
  type BillingCredit,
} from "@/domain/billing/credits";
import type { CashOutlookDocument } from "@/domain/finance/project-cash-outlook";
import { freightPayable } from "@/domain/finance/project-control";
import { dateToDateOnly } from "@/domain/payments/dates";
import type { PaymentInstallmentView } from "@/lib/payments/payments";
import type { OrderSummary } from "@/lib/procurement/orders";

type Money = { toString(): string };
type BillingCashDocument = Parameters<typeof billingCashContexts>[0][number];

export interface CashOutlookSources {
  projectId: string;
  orders: readonly (Pick<
    OrderSummary,
    "id" | "orderNumber" | "orderCurrencyCode" | "status"
  > & {
    costs: Pick<OrderSummary["costs"], "purchaseFxRate">;
    supplierPayment: Pick<
      OrderSummary["supplierPayment"],
      "totalPayable" | "netPaid" | "paid" | "refundDue"
    >;
    credits?: Pick<NonNullable<OrderSummary["credits"]>, "count">;
  })[];
  installments: readonly Pick<
    PaymentInstallmentView,
    | "id"
    | "orderId"
    | "currencyCode"
    | "scheduledAmount"
    | "paidAmount"
    | "dueDate"
    | "expectedFxRate"
    | "isCancelled"
  >[];
  billingDocuments: readonly (BillingCashDocument & {
    reference: string;
    dueDate: Date | null;
    fxRateToReporting: Money | null;
    credits: readonly BillingCredit[];
  })[];
  freightExpenses: readonly {
    description: string;
    costAmountHt: Money;
    vatAmount: Money | null;
    vatTreatment: Parameters<typeof freightPayable>[2];
    currencyCode: string;
    fxRateToReporting: Money | null;
    dueDate: Date | null;
    payments: readonly { id: string; amount: Money }[];
  }[];
}

/** Shared Project/Reports cash expectations, with all financial rules in domain helpers. */
export function buildCashOutlookDocuments({
  projectId,
  orders,
  installments,
  billingDocuments,
  freightExpenses,
}: CashOutlookSources): CashOutlookDocument[] {
  const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
  const supplierContexts = activeOrders.map((order) => {
    const terms = installments
      .filter((term) => term.orderId === order.id)
      .toSorted(
        (a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
          a.id.localeCompare(b.id),
      );
    const reviewReason = terms.some(
      (term) =>
        term.currencyCode !== order.orderCurrencyCode &&
        (!term.isCancelled || new Decimal(term.paidAmount).greaterThan(0)),
    )
      ? "Payment term currency differs from its Order. Review the payment terms."
      : null;
    return { order, terms, reviewReason };
  });
  const documents: CashOutlookDocument[] = supplierContexts.map(
    ({ order, terms, reviewReason }) => ({
      source: {
        label: order.orderNumber,
        href: `/orders/${order.id}?tab=related`,
      },
      kind: "payment",
      reviewReason,
      currency: order.orderCurrencyCode,
      total: order.supplierPayment.totalPayable,
      paid: order.supplierPayment.netPaid ?? order.supplierPayment.paid,
      creditAdjusted: (order.credits?.count ?? 0) > 0,
      fx: order.costs.purchaseFxRate,
      terms: terms.map((term) => ({
        amount: term.scheduledAmount,
        paid: term.paidAmount,
        due: term.dueDate,
        fx: term.expectedFxRate,
        cancelled: term.isCancelled,
      })),
    }),
  );
  for (const { order, reviewReason } of supplierContexts) {
    if (!order.credits?.count || reviewReason) continue;
    const refundDue = order.supplierPayment.refundDue ?? "0";
    if (new Decimal(refundDue).greaterThan(0))
      documents.push({
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
  for (const context of billingCashContexts(billingDocuments)) {
    const { document: doc, terms } = context;
    documents.push({
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
        paid: uniqueReceiptTotal(term.receipts),
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
        documents.push({
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
  for (const expense of freightExpenses) {
    const total = freightPayable(
      expense.costAmountHt.toString(),
      expense.vatAmount?.toString() ?? null,
      expense.vatTreatment,
    );
    const paid = uniqueReceiptTotal(expense.payments);
    const fx = expense.fxRateToReporting?.toString() ?? null;
    documents.push({
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
  return documents;
}
