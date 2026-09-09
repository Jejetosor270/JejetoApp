import { present } from "./context";
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dateToDateOnly, formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { relatedHref, type RelatedRow, type RelatedTableData } from "./types";

export const projectSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  reportingCurrencyCode: true,
} satisfies Prisma.ProjectSelect;
export const partySelect = {
  id: true,
  displayName: true,
  isActive: true,
} as const;
export const orderSelect = {
  id: true,
  orderNumber: true,
  packageName: true,
  projectId: true,
  status: true,
  orderCurrencyCode: true,
  orderDate: true,
  supplier: { select: partySelect },
} satisfies Prisma.ProcurementOrderSelect;
export const billingSelect = {
  id: true,
  reference: true,
  projectId: true,
  documentType: true,
  documentDate: true,
  currencyCode: true,
  totalHt: true,
  totalTtc: true,
  isCancelled: true,
} satisfies Prisma.ClientBillingDocumentSelect;
export const supplierInstallmentSelect = {
  id: true,
  label: true,
  direction: true,
  dueDate: true,
  scheduledAmount: true,
  currencyCode: true,
  isCancelled: true,
  order: { select: orderSelect },
} satisfies Prisma.PaymentInstallmentSelect;
export const clientInstallmentSelect = {
  id: true,
  label: true,
  dueDate: true,
  scheduledAmount: true,
  currencyCode: true,
  isCancelled: true,
  billingDocument: { select: billingSelect },
} satisfies Prisma.ClientPaymentInstallmentSelect;
export const paymentSelect = {
  id: true,
  amount: true,
  settledAt: true,
  reference: true,
  installment: { select: supplierInstallmentSelect },
} satisfies Prisma.PaymentSettlementSelect;
export const receiptSelect = {
  id: true,
  amount: true,
  receivedAt: true,
  reference: true,
  installmentId: true,
  billingDocument: { select: billingSelect },
} satisfies Prisma.ClientReceiptSelect;

export type Project = Prisma.ProjectGetPayload<{
  select: typeof projectSelect;
}>;
export type Order = Prisma.ProcurementOrderGetPayload<{
  select: typeof orderSelect;
}>;
export type Billing = Prisma.ClientBillingDocumentGetPayload<{
  select: typeof billingSelect;
}>;
export type SupplierInstallment = Prisma.PaymentInstallmentGetPayload<{
  select: typeof supplierInstallmentSelect;
}>;
export type ClientInstallment = Prisma.ClientPaymentInstallmentGetPayload<{
  select: typeof clientInstallmentSelect;
}>;
export type Payment = Prisma.PaymentSettlementGetPayload<{
  select: typeof paymentSelect;
}>;
export type Receipt = Prisma.ClientReceiptGetPayload<{
  select: typeof receiptSelect;
}>;

const date = (value: Date | null) =>
  formatDateOnly(value ? dateToDateOnly(value) : null);
const active = (value: boolean) => (value ? "Active" : "Cancelled");
export function table(
  id: string,
  title: string,
  columns: string[],
  rows: RelatedRow[],
  description = "Select a record to explore its connections.",
  numericColumns: number[] = [],
): RelatedTableData {
  return { id, title, columns, rows, description, numericColumns };
}
export function projectsTable(rows: (Project | null | undefined)[]) {
  return table(
    "projects",
    "Projects",
    ["Project", "Code", "Status", "Reporting currency"],
    rows.filter(present).map((r) => ({
      id: r.id,
      href: relatedHref("project", r.id),
      cells: [
        r.name,
        r.code,
        formatEnumLabel(r.status),
        r.reportingCurrencyCode,
      ],
    })),
  );
}
export function partiesTable(
  kind: "clients" | "suppliers",
  rows: (
    { id: string; displayName: string; isActive: boolean } | null | undefined
  )[],
) {
  return table(
    kind,
    kind === "clients" ? "Clients" : "Suppliers",
    ["Name", "Status"],
    rows.filter(present).map((r) => ({
      id: r.id,
      href: `/${kind}/${r.id}`,
      cells: [r.displayName, r.isActive ? "Active" : "Archived"],
    })),
  );
}
export function ordersTable(rows: (Order | null | undefined)[]) {
  return table(
    "orders",
    "Orders",
    [
      "Order",
      "Package",
      "Supplier",
      "Status",
      "Purchase currency",
      "Order date",
    ],
    rows.filter(present).map((r) => ({
      id: r.id,
      href: relatedHref("order", r.id),
      cells: [
        r.orderNumber,
        r.packageName,
        r.supplier?.displayName ?? "Unassigned",
        formatEnumLabel(r.status),
        r.orderCurrencyCode,
        date(r.orderDate),
      ],
    })),
  );
}
export function billingsTable(rows: (Billing | null | undefined)[]) {
  return table(
    "billing",
    "Billing",
    ["Reference", "Type", "Date", "HT", "TTC", "Record status"],
    rows.filter(present).map((r) => ({
      id: r.id,
      href: relatedHref("billing", r.id),
      cells: [
        r.reference,
        formatEnumLabel(r.documentType),
        date(r.documentDate),
        formatMoney(r.totalHt.toString(), r.currencyCode),
        formatMoney(r.totalTtc.toString(), r.currencyCode),
        active(!r.isCancelled),
      ],
    })),
    "Client commercial documents. Open Billing to see its allocations, installments and receipts.",
    [3, 4],
  );
}
export function supplierInstallmentsTable(rows: SupplierInstallment[]) {
  return table(
    "supplier-installments",
    "Supplier installments",
    ["Installment", "Order", "Due", "Scheduled TTC", "Record status"],
    rows.filter(present).map((r) => ({
      id: r.id,
      href: relatedHref("supplier-installment", r.id),
      editFields: cashEditFields(
        2,
        3,
        r.dueDate,
        r.scheduledAmount.toString(),
        r.currencyCode,
      ),
      cells: [
        r.label,
        r.order?.orderNumber ?? "Unassigned",
        date(r.dueDate),
        formatMoney(r.scheduledAmount.toString(), r.currencyCode),
        active(!r.isCancelled),
      ],
    })),
    "Scheduled Supplier cash out, not actual payments.",
    [3],
  );
}
export function clientInstallmentsTable(rows: ClientInstallment[]) {
  return table(
    "client-installments",
    "Client installments",
    ["Installment", "Billing", "Due", "Scheduled TTC", "Record status"],
    rows.filter(present).map((r) => ({
      id: r.id,
      href: relatedHref("client-installment", r.id),
      editFields: cashEditFields(
        2,
        3,
        r.dueDate,
        r.scheduledAmount.toString(),
        r.currencyCode,
      ),
      cells: [
        r.label,
        r.billingDocument?.reference ?? "Unassigned",
        date(r.dueDate),
        formatMoney(r.scheduledAmount.toString(), r.currencyCode),
        active(!r.isCancelled),
      ],
    })),
    "Scheduled Client cash in, not actual receipts. Shared Quote/Invoice installments appear once.",
    [3],
  );
}
export function paymentsTable(rows: Payment[]) {
  return table(
    "payments",
    "Supplier payments",
    ["Reference", "Order", "Installment", "Paid date", "Amount"],
    rows.filter(present).map((r) => ({
      id: r.id,
      href: relatedHref("payment", r.id),
      editValue: r.reference ?? "",
      editFields: cashEditFields(
        3,
        4,
        r.settledAt,
        r.amount.toString(),
        r.installment.currencyCode,
      ),
      cells: [
        r.reference || `Payment · ${date(r.settledAt)}`,
        r.installment.order?.orderNumber ?? "Unassigned",
        r.installment.label,
        date(r.settledAt),
        formatMoney(r.amount.toString(), r.installment.currencyCode),
      ],
    })),
    "Actual Supplier cash out. Each recorded payment appears once.",
    [4],
  );
}
export function receiptsTable(rows: Receipt[]) {
  return table(
    "receipts",
    "Client receipts",
    ["Reference", "Billing", "Received date", "Amount", "Allocation"],
    rows.filter(present).map((r) => ({
      id: r.id,
      href: relatedHref("receipt", r.id),
      editValue: r.reference ?? "",
      editFields: cashEditFields(
        2,
        3,
        r.receivedAt,
        r.amount.toString(),
        r.billingDocument.currencyCode,
      ),
      cells: [
        r.reference || `Receipt · ${date(r.receivedAt)}`,
        r.billingDocument?.reference ?? "Unassigned",
        date(r.receivedAt),
        formatMoney(r.amount.toString(), r.billingDocument.currencyCode),
        r.installmentId ? "Installment" : "Billing-level",
      ],
    })),
    "Actual Client cash in. Each recorded receipt appears once; it is not an Order allocation.",
    [3],
  );
}

function cashEditFields(
  dateColumn: number,
  amountColumn: number,
  date: Date | null,
  amount: string,
  currency: string,
): NonNullable<RelatedRow["editFields"]> {
  return [
    {
      column: dateColumn,
      name: "date",
      type: "date",
      value: dateToDateOnly(date) ?? "",
    },
    {
      column: amountColumn,
      name: "amount",
      type: "money",
      value: amount,
      currency,
    },
  ];
}
