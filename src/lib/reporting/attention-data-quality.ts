import "server-only";
import Decimal from "decimal.js";
import { getDatabase } from "@/lib/db";
import { getFinancialAttention } from "./financial-attention";
import type { AttentionIssue } from "@/domain/finance/attention";
import { dateToDateOnly } from "@/domain/payments/dates";
import { installmentOutstanding } from "@/domain/payments/calculations";
import { uniqueReceiptTotal } from "@/domain/billing/cash-expectations";

type UnassignedInput = {
  kind: string;
  id: string;
  title: string;
  detail: string;
  reference: string;
  currency: string;
  amount?: string | null;
  date?: string | null;
  href: string;
  project?: { id: string; name: string } | null;
  basis?: AttentionIssue["basis"];
};
function unassignedIssue(input: UnassignedInput): AttentionIssue {
  return {
    key: `unassigned-${input.kind}:${input.id}`,
    priority: "Review",
    title: input.title,
    detail: input.detail,
    reference: input.reference,
    href: input.href,
    projectId: input.project?.id ?? "",
    projectName: input.project?.name ?? "Unassigned",
    amount: input.amount ?? null,
    currency: input.currency,
    basis: input.basis ?? null,
    date: input.date ?? null,
  };
}
function termRemaining(
  scheduled: string,
  cash: { id: string; amount: { toString(): string } }[],
): string | null {
  const paid = uniqueReceiptTotal(cash);
  return new Decimal(paid).greaterThan(scheduled)
    ? null
    : installmentOutstanding(scheduled, paid).toFixed(4);
}

/** Derived review queue only: no reassignment, cash creation, or reporting aggregation. */
export async function getAttentionDataQuality(
  today: string,
): Promise<AttentionIssue[]> {
  const db = getDatabase();
  const [
    archived,
    cash,
    orders,
    invoices,
    supplierTerms,
    clientTerms,
    freight,
  ] = await Promise.all([
    getFinancialAttention(30, today, undefined, "archived"),
    db.unassignedCashRecord.findMany({
      select: {
        id: true,
        direction: true,
        amount: true,
        currencyCode: true,
        reference: true,
        cashDate: true,
      },
      orderBy: { id: "asc" },
    }),
    db.procurementOrder.findMany({
      where: {
        status: { not: "CANCELLED" },
        OR: [{ projectId: null }, { supplierId: null }],
        costLines: { some: { originalAmount: { gt: 0 } } },
      },
      select: {
        id: true,
        orderNumber: true,
        orderCurrencyCode: true,
        invoiceDate: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.clientBillingDocument.findMany({
      where: {
        documentType: "INVOICE",
        isCancelled: false,
        workflowStatus: { notIn: ["DRAFT", "CANCELLED"] },
        OR: [{ projectId: null }, { clientId: null }],
        totalTtc: { gt: 0 },
      },
      select: {
        id: true,
        reference: true,
        currencyCode: true,
        totalTtc: true,
        documentDate: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.paymentInstallment.findMany({
      where: {
        orderId: null,
        direction: "SUPPLIER_PAYMENT",
        isCancelled: false,
      },
      select: {
        id: true,
        label: true,
        scheduledAmount: true,
        currencyCode: true,
        dueDate: true,
        settlements: { select: { id: true, amount: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.clientPaymentInstallment.findMany({
      where: { billingDocumentId: null, isCancelled: false },
      select: {
        id: true,
        label: true,
        scheduledAmount: true,
        currencyCode: true,
        dueDate: true,
        receipts: { select: { id: true, amount: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.projectFreightExpense.findMany({
      where: { projectId: null },
      select: {
        id: true,
        reference: true,
        description: true,
        currencyCode: true,
        expenseDate: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const issues: AttentionIssue[] = [...archived.issues];
  for (const row of cash)
    issues.push(
      unassignedIssue({
        kind: "cash",
        id: row.id,
        title: "Actual cash has no record assignment",
        detail:
          "Retained actual cash is excluded from Project balances. Review its original assignment; do not record the same payment again.",
        reference:
          row.reference ??
          (row.direction === "CLIENT_RECEIPT"
            ? "Client cash received"
            : "Supplier cash paid"),
        currency: row.currencyCode,
        amount: row.amount.toString(),
        basis: "TTC",
        date: dateToDateOnly(row.cashDate),
        href: "/unassigned-cash",
      }),
    );
  for (const row of orders)
    issues.push(
      unassignedIssue({
        kind: "order",
        id: row.id,
        title: "Order financial records need an assignment",
        detail:
          "Review this Order's Project and Supplier assignment. Its recorded costs remain retained, not a new financial total.",
        reference: row.orderNumber,
        currency: row.orderCurrencyCode,
        date: dateToDateOnly(row.invoiceDate),
        project: row.project,
        href: "/unassigned#orders",
      }),
    );
  for (const row of invoices)
    issues.push(
      unassignedIssue({
        kind: "invoice",
        id: row.id,
        title: "Invoice needs a Client or Project assignment",
        detail:
          "Review the missing assignment. The amount is original document TTC, not its remaining balance or new revenue.",
        reference: row.reference,
        currency: row.currencyCode,
        amount: row.totalTtc.toString(),
        basis: "TTC",
        date: dateToDateOnly(row.documentDate),
        project: row.project,
        href: "/unassigned#billing",
      }),
    );
  for (const row of supplierTerms) {
    const remaining = termRemaining(
      row.scheduledAmount.toString(),
      row.settlements,
    );
    if (remaining === "0.0000" && !row.settlements.length) continue;
    issues.push(
      unassignedIssue({
        kind: "supplier-term",
        id: row.id,
        title: "Supplier payment term has no Order",
        detail:
          "Review this retained term and its actual payment history. Do not duplicate the cash.",
        reference: row.label,
        currency: row.currencyCode,
        amount: remaining,
        basis: "TTC",
        date: dateToDateOnly(row.dueDate),
        href: `/installments/supplier/${row.id}`,
      }),
    );
  }
  for (const row of clientTerms) {
    const remaining = termRemaining(
      row.scheduledAmount.toString(),
      row.receipts,
    );
    if (remaining === "0.0000" && !row.receipts.length) continue;
    issues.push(
      unassignedIssue({
        kind: "client-term",
        id: row.id,
        title: "Client payment term has no Billing document",
        detail:
          "Review this retained planning term and any receipt history. It is not issued-Invoice cash income.",
        reference: row.label,
        currency: row.currencyCode,
        amount: remaining,
        basis: "TTC",
        date: dateToDateOnly(row.dueDate),
        href: `/installments/client/${row.id}`,
      }),
    );
  }
  for (const row of freight)
    issues.push(
      unassignedIssue({
        kind: "freight",
        id: row.id,
        title: "Freight expense has no Project",
        detail:
          "Review this retained freight expense and its payment history before considering Project costs complete.",
        reference: row.reference ?? row.description,
        currency: row.currencyCode,
        date: dateToDateOnly(row.expenseDate),
        href: "/unassigned#freight",
      }),
    );
  return issues;
}
