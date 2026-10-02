import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { recognizedReceiptWhere } from "@/lib/billing/receipt-eligibility";
import type { CashCandidate, CashKind } from "@/domain/reconciliation/schema";

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface CashQuery {
  ids?: readonly { kind: CashKind; id: string }[];
  currencyCode?: string;
  direction?: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT";
  dateFrom?: string;
  dateTo?: string;
  query?: string;
}

/** Existing actual cash only. This adapter never creates or updates financial records. */
export async function readReconciliationCash(
  db: Prisma.TransactionClient,
  query: CashQuery,
): Promise<CashCandidate[]> {
  const date = {
    ...(query.dateFrom ? { gte: dateOnlyToDate(query.dateFrom) } : {}),
    ...(query.dateTo ? { lte: dateOnlyToDate(query.dateTo) } : {}),
  };
  const ids = (kind: CashKind) =>
    query.ids
      ? {
          id: {
            in: query.ids
              .filter((row) => row.kind === kind)
              .map((row) => row.id),
          },
        }
      : {};
  const reference = query.query
    ? { reference: { contains: query.query, mode: "insensitive" as const } }
    : {};
  const currency = query.currencyCode
    ? { currencyCode: query.currencyCode }
    : {};
  const limit = query.ids ? Math.min(query.ids.length, 100) : 101;
  const [payments, refunds, receipts, freight] = await Promise.all([
    query.direction === "CLIENT_RECEIPT"
      ? []
      : db.paymentSettlement.findMany({
          where: {
            ...ids("SUPPLIER_PAYMENT"),
            trashedAt: null,
            settledAt: date,
            ...reference,
            installment: {
              direction: "SUPPLIER_PAYMENT",
              ...currency,
              trashedAt: null,
            },
          },
          include: { installment: { include: { order: true } } },
          orderBy: [{ settledAt: "desc" }, { id: "asc" }],
          take: limit,
        }),
    db.financialCreditRefund.findMany({
      where: {
        ...ids("CREDIT_REFUND"),
        isCancelled: false,
        refundDate: date,
        ...reference,
        credit: {
          isCancelled: false,
          ...currency,
          ...(query.direction
            ? {
                side:
                  query.direction === "CLIENT_RECEIPT" ? "SUPPLIER" : "CLIENT",
              }
            : {}),
          OR: [
            {
              side: "CLIENT",
              billingDocument: {
                trashedAt: null,
                documentType: "INVOICE",
                isCancelled: false,
                workflowStatus: {
                  notIn: ["DRAFT", "TO_BE_INVOICED", "CANCELLED"],
                },
              },
            },
            {
              side: "SUPPLIER",
              order: { trashedAt: null, status: { not: "CANCELLED" } },
            },
          ],
        },
      },
      include: { credit: { include: { billingDocument: true, order: true } } },
      orderBy: [{ refundDate: "desc" }, { id: "asc" }],
      take: limit,
    }),
    query.direction === "SUPPLIER_PAYMENT"
      ? []
      : db.clientReceipt.findMany({
          where: {
            ...ids("CLIENT_RECEIPT"),
            trashedAt: null,
            receivedAt: date,
            ...reference,
            AND: [
              recognizedReceiptWhere,
              { billingDocument: { ...currency, trashedAt: null } },
            ],
          },
          include: {
            billingDocument: true,
            installment: { include: { matchedInvoices: true } },
          },
          orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
          take: limit,
        }),
    query.direction === "CLIENT_RECEIPT"
      ? []
      : db.freightExpensePayment.findMany({
          where: {
            ...ids("FREIGHT_PAYMENT"),
            trashedAt: null,
            paidAt: date,
            ...reference,
            expense: { ...currency, trashedAt: null },
          },
          include: { expense: true },
          orderBy: [{ paidAt: "desc" }, { id: "asc" }],
          take: limit,
        }),
  ]);
  return [
    ...payments.map((row): CashCandidate => ({
      kind: "SUPPLIER_PAYMENT",
      id: row.id,
      amount: row.amount.toString(),
      currencyCode: row.installment.currencyCode,
      direction: "SUPPLIER_PAYMENT",
      date: dateToDateOnly(row.settledAt),
      reference: row.reference ?? "",
      label: row.installment.order?.orderNumber ?? row.installment.label,
      href: `/payments/${row.id}`,
      fingerprint: fingerprint([
        row.id,
        row.updatedAt,
        row.amount,
        row.settledAt,
        row.fxRateToReporting,
        row.installmentId,
        row.installment.updatedAt,
        row.installment.currencyCode,
        row.installment.orderId,
        row.installment.order?.projectId,
        row.installment.order?.supplierId,
        row.installment.order?.status,
        row.installment.order?.trashedAt,
      ]),
    })),
    ...receipts.map((row): CashCandidate => ({
      kind: "CLIENT_RECEIPT",
      id: row.id,
      amount: row.amount.toString(),
      currencyCode: row.billingDocument.currencyCode,
      direction: "CLIENT_RECEIPT",
      date: dateToDateOnly(row.receivedAt),
      reference: row.reference ?? "",
      label: row.billingDocument.reference,
      href: `/receipts/${row.id}`,
      fingerprint: fingerprint([
        row.id,
        row.updatedAt,
        row.amount,
        row.receivedAt,
        row.fxRateToReporting,
        row.billingDocumentId,
        row.installmentId,
        row.billingDocument.currencyCode,
        row.billingDocument.projectId,
        row.billingDocument.clientId,
        row.billingDocument.workflowStatus,
        row.billingDocument.isCancelled,
        row.installment?.matchedInvoices
          .map((invoice) => [
            invoice.id,
            invoice.currencyCode,
            invoice.isCancelled,
            invoice.workflowStatus,
            invoice.projectId,
            invoice.clientId,
          ])
          .sort(),
      ]),
    })),
    ...freight.map((row): CashCandidate => ({
      kind: "FREIGHT_PAYMENT",
      id: row.id,
      amount: row.amount.toString(),
      currencyCode: row.expense.currencyCode,
      direction: "SUPPLIER_PAYMENT",
      date: dateToDateOnly(row.paidAt),
      reference: row.reference ?? "",
      label: row.expense.reference ?? "Freight payment",
      href: row.expense.projectId
        ? `/projects/${row.expense.projectId}?tab=related&section=freight`
        : "/unassigned#freight",
      fingerprint: fingerprint([
        row.id,
        row.updatedAt,
        row.amount,
        row.paidAt,
        row.fxRateToReporting,
        row.expenseId,
        row.expense.currencyCode,
        row.expense.projectId,
        row.expense.supplierId,
        row.expense.trashedAt,
      ]),
    })),
    ...refunds.map((row): CashCandidate => ({
      kind: "CREDIT_REFUND",
      id: row.id,
      amount: row.amount.toString(),
      currencyCode: row.credit.currencyCode,
      direction:
        row.credit.side === "CLIENT" ? "SUPPLIER_PAYMENT" : "CLIENT_RECEIPT",
      date: dateToDateOnly(row.refundDate),
      reference: row.reference ?? "",
      label: `${row.credit.reference} · ${row.credit.side === "CLIENT" ? "Client refund" : "Supplier refund"}`,
      href: row.credit.billingDocumentId
        ? `/billing/${row.credit.billingDocumentId}?tab=related`
        : `/orders/${row.credit.orderId}?tab=related`,
      fingerprint: fingerprint([
        row.id,
        row.updatedAt,
        row.amount,
        row.refundDate,
        row.fxRateToReporting,
        row.isCancelled,
        row.creditId,
        row.credit.side,
        row.credit.currencyCode,
        row.credit.isCancelled,
        row.credit.billingDocumentId,
        row.credit.orderId,
        row.credit.billingDocument?.projectId,
        row.credit.billingDocument?.clientId,
        row.credit.billingDocument?.workflowStatus,
        row.credit.billingDocument?.isCancelled,
        row.credit.billingDocument?.trashedAt,
        row.credit.order?.projectId,
        row.credit.order?.supplierId,
        row.credit.order?.status,
        row.credit.order?.trashedAt,
      ]),
    })),
  ];
}
