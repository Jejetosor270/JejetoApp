import { retainedCurrency } from "@/lib/related-records/context";
import "server-only";

import Decimal from "decimal.js";
import { getDatabase } from "@/lib/db";
import { listProjectOrders } from "@/lib/procurement/orders";
import { listPaymentInstallments } from "@/lib/payments/payments";
import { installmentOutstanding } from "@/domain/payments/calculations";
import { dateToDateOnly } from "@/domain/payments/dates";

/** Project-scoped selector data; all settlement writes use the existing services. */
export async function receiptEntryOptions(projectId: string) {
  const [orders, payments, billing] = await Promise.all([
    listProjectOrders(projectId),
    listPaymentInstallments({ projectId, direction: "SUPPLIER_PAYMENT" }),
    getDatabase().clientBillingDocument.findMany({
      where: { projectId, isCancelled: false },
      orderBy: [{ documentDate: "desc" }, { id: "asc" }],
      select: {
        id: true,
        reference: true,
        documentType: true,
        detachedReportingCurrencyCode: true,
        currencyCode: true,
        client: { select: { displayName: true } },
        project: { select: { reportingCurrencyCode: true } },
        paymentInstallments: {
          where: { isCancelled: false },
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          select: {
            id: true,
            label: true,
            dueDate: true,
            scheduledAmount: true,
            receipts: { select: { amount: true } },
          },
        },
      },
    }),
  ]);
  return {
    orders: orders
      .filter((order) => order.status !== "CANCELLED")
      .map((order) => ({
        id: order.id,
        label: `${order.orderNumber} · ${order.packageName} · ${order.supplier?.displayName ?? "Unassigned"}${order.orderPackage ? ` · Package: ${order.orderPackage.name}` : ""}`,
        currencyCode: order.orderCurrencyCode,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
        payable: order.supplierPayment.totalPayable,
        installments: payments
          .filter((item) => item.orderId === order.id && !item.isCancelled)
          .map((item) => ({
            id: item.id,
            label: item.label,
            currencyCode: item.currencyCode,
            dueDate: item.dueDate,
            scheduledAmount: item.scheduledAmount,
            paidAmount: item.paidAmount,
            outstandingAmount: item.outstandingAmount,
          })),
      })),
    billing: billing.map((document) => ({
      id: document.id,
      label: `${document.reference} · ${document.documentType} · ${document.client?.displayName ?? "Unassigned"}`,
      currencyCode: document.currencyCode,
      reportingCurrencyCode: retainedCurrency(
        document.project?.reportingCurrencyCode,
        document.detachedReportingCurrencyCode,
      ),
      installments: document.paymentInstallments.map((item) => {
        const paid = item.receipts.reduce(
          (sum, receipt) => sum.plus(receipt.amount),
          new Decimal(0),
        );
        return {
          id: item.id,
          label: item.label,
          currencyCode: document.currencyCode,
          dueDate: dateToDateOnly(item.dueDate),
          scheduledAmount: item.scheduledAmount.toString(),
          paidAmount: paid.toString(),
          outstandingAmount: installmentOutstanding(
            item.scheduledAmount,
            paid,
          ).toString(),
        };
      }),
    })),
  };
}

export type ReceiptEntryOptions = Awaited<
  ReturnType<typeof receiptEntryOptions>
>;
