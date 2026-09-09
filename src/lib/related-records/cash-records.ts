import { retainedCurrency } from "@/lib/related-records/context";
import { present } from "./context";
import { editableRelatedTables } from "./editing";
import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import {
  businessToday,
  dateToDateOnly,
  formatDateOnly,
} from "@/domain/payments/dates";
import {
  derivePaymentStatus,
  installmentOutstanding,
} from "@/domain/payments/calculations";
import {
  formatFxRate,
  formatMoney,
  formatRate,
} from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import {
  billingSelect,
  orderSelect,
  partySelect,
  projectSelect,
  paymentSelect,
  receiptSelect,
  clientInstallmentSelect,
  projectsTable,
  partiesTable,
  ordersTable,
  billingsTable,
  paymentsTable,
  receiptsTable,
  supplierInstallmentsTable,
  clientInstallmentsTable,
} from "./projections";
import { type CashRecordKind, type RelatedTableData } from "./types";

export interface CashRecordView {
  title: string;
  type: string;
  status: string;
  description: string;
  manageHref: string;
  fields: { label: string; value: string }[];
  tables: RelatedTableData[];
}

const orderContext = {
  select: {
    ...orderSelect,
    detachedReportingCurrencyCode: true,
    project: { select: projectSelect },
  },
} as const;
const billingContext = {
  select: {
    ...billingSelect,
    detachedReportingCurrencyCode: true,
    project: { select: projectSelect },
    client: { select: partySelect },
  },
} as const;
const date = (value: Date) => formatDateOnly(dateToDateOnly(value));
function fx(
  value: { toString(): string } | null,
  currency: string,
  reporting: string,
) {
  return currency === reporting
    ? "1 · same currency"
    : value
      ? formatFxRate(value.toString())
      : "Missing · reporting incomplete";
}

async function paymentRecord(id: string): Promise<CashRecordView | null> {
  const record = await getDatabase().paymentSettlement.findUnique({
    where: { id },
    include: { installment: { include: { order: orderContext } } },
  });
  if (!record) return null;
  const { installment } = record;
  const { order } = installment;
  const legacy = installment.direction !== "SUPPLIER_PAYMENT";
  return {
    title: record.reference || `Payment · ${date(record.settledAt)}`,
    type: legacy ? "Historical Client settlement" : "Supplier payment",
    status: "RECORDED",
    description: legacy
      ? "Historical Order planning settlement, not authoritative Client cash."
      : "Actual Supplier cash out, recorded against an installment.",
    manageHref: order ? `/orders/${order.id}?tab=payments` : "/installments",
    fields: [
      {
        label: "Amount",
        value: formatMoney(record.amount.toString(), installment.currencyCode),
      },
      { label: "Paid date", value: date(record.settledAt) },
      { label: "Reference", value: record.reference ?? "—" },
      {
        label: "Actual FX to reporting",
        value: fx(
          record.fxRateToReporting,
          installment.currencyCode,
          retainedCurrency(
            order?.project?.reportingCurrencyCode,
            order?.detachedReportingCurrencyCode ??
              installment.detachedReportingCurrencyCode,
          ),
        ),
      },
      { label: "Notes", value: record.notes ?? "—" },
    ],
    tables: [
      projectsTable([order?.project]),
      ordersTable([order]),
      partiesTable("suppliers", [order?.supplier]),
      {
        ...supplierInstallmentsTable([installment]),
        ...(legacy
          ? {
              title: "Historical Client installments",
              description:
                "Legacy Order planning only, not authoritative Client cash.",
            }
          : {}),
      },
    ],
  };
}

async function receiptRecord(id: string): Promise<CashRecordView | null> {
  const record = await getDatabase().clientReceipt.findUnique({
    where: { id },
    include: {
      billingDocument: billingContext,
      installment: {
        select: {
          ...clientInstallmentSelect,
          matchedInvoices: { select: billingSelect, orderBy: { id: "asc" } },
        },
      },
    },
  });
  if (!record) return null;
  const billing = record.billingDocument;
  const documents = [
    ...new Map(
      [
        billing,
        ...(record.installment
          ? [
              record.installment.billingDocument,
              ...record.installment.matchedInvoices,
            ]
          : []),
      ]
        .filter(present)
        .map((row) => [row.id, row]),
    ).values(),
  ];
  return {
    title: record.reference || `Receipt · ${date(record.receivedAt)}`,
    type: "Client receipt",
    status: "RECORDED",
    description:
      "Actual Client cash in. Billing allocations do not split this receipt among Orders.",
    manageHref: billing
      ? `/billing/${billing.id}?tab=schedule`
      : "/installments",
    fields: [
      {
        label: "Amount",
        value: formatMoney(record.amount.toString(), billing.currencyCode),
      },
      { label: "Received date", value: date(record.receivedAt) },
      { label: "Reference", value: record.reference ?? "—" },
      {
        label: "Actual FX to reporting",
        value: fx(
          record.fxRateToReporting,
          billing.currencyCode,
          retainedCurrency(
            billing?.project?.reportingCurrencyCode,
            billing?.detachedReportingCurrencyCode ??
              ("detachedReportingCurrencyCode" in record &&
              typeof record.detachedReportingCurrencyCode === "string"
                ? record.detachedReportingCurrencyCode
                : null),
          ),
        ),
      },
      { label: "Notes", value: record.notes ?? "—" },
    ],
    tables: [
      projectsTable([billing?.project]),
      partiesTable("clients", [billing?.client]),
      billingsTable(documents),
      clientInstallmentsTable(record.installment ? [record.installment] : []),
    ],
  };
}

function installmentFields(
  record: {
    scheduledAmount: { toString(): string };
    currencyCode: string;
    dueDate: Date;
    basis: string;
    percentageRate: { toString(): string } | null;
    expectedFxRateToReporting: { toString(): string } | null;
    notes: string | null;
  },
  paid: Decimal,
  reportingCurrency: string,
) {
  return [
    {
      label: "Scheduled TTC",
      value: formatMoney(
        record.scheduledAmount.toString(),
        record.currencyCode,
      ),
    },
    {
      label: "Settled",
      value: formatMoney(paid.toString(), record.currencyCode),
    },
    {
      label: "Outstanding",
      value: formatMoney(
        installmentOutstanding(
          record.scheduledAmount.toString(),
          paid,
        ).toString(),
        record.currencyCode,
      ),
    },
    { label: "Due date", value: date(record.dueDate) },
    { label: "Basis", value: formatEnumLabel(record.basis) },
    {
      label: "Percentage",
      value: formatRate(record.percentageRate?.toString() ?? null),
    },
    {
      label: "Expected FX to reporting",
      value: fx(
        record.expectedFxRateToReporting,
        record.currencyCode,
        reportingCurrency,
      ),
    },
    { label: "Notes", value: record.notes ?? "—" },
  ];
}

async function supplierInstallmentRecord(
  id: string,
): Promise<CashRecordView | null> {
  const record = await getDatabase().paymentInstallment.findUnique({
    where: { id },
    include: {
      order: orderContext,
      settlements: {
        select: paymentSelect,
        orderBy: [{ settledAt: "desc" }, { id: "asc" }],
      },
    },
  });
  if (!record) return null;
  const paid = record.settlements.reduce(
    (sum, row) => sum.plus(row.amount.toString()),
    new Decimal(0),
  );
  const legacy = record.direction !== "SUPPLIER_PAYMENT";
  return {
    title: record.label,
    type: legacy ? "Historical Client installment" : "Supplier installment",
    status: derivePaymentStatus({
      dueDate: dateToDateOnly(record.dueDate),
      isCancelled: record.isCancelled,
      paidAmount: paid,
      scheduledAmount: record.scheduledAmount.toString(),
      today: businessToday(),
    }),
    description: legacy
      ? "Historical Order planning only, not authoritative Client cash."
      : "Scheduled Supplier cash out. Actual payments are listed in Related.",
    manageHref: record.order
      ? `/orders/${record.order.id}?tab=payments`
      : "/installments",
    fields: installmentFields(
      record,
      paid,
      retainedCurrency(
        record.order?.project?.reportingCurrencyCode,
        record.order?.detachedReportingCurrencyCode ??
          record.detachedReportingCurrencyCode,
      ),
    ),
    tables: [
      projectsTable([record.order?.project]),
      ordersTable([record.order]),
      partiesTable("suppliers", [record.order?.supplier]),
      {
        ...paymentsTable(record.settlements),
        ...(legacy
          ? {
              title: "Historical settlements",
              description:
                "Legacy Order planning, not authoritative Client receipts.",
            }
          : {}),
      },
    ],
  };
}

async function clientInstallmentRecord(
  id: string,
): Promise<CashRecordView | null> {
  const record = await getDatabase().clientPaymentInstallment.findUnique({
    where: { id },
    include: {
      billingDocument: billingContext,
      matchedInvoices: { select: billingSelect, orderBy: { id: "asc" } },
      receipts: {
        select: receiptSelect,
        orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
      },
    },
  });
  if (!record) return null;
  const paid = record.receipts.reduce(
    (sum, row) => sum.plus(row.amount.toString()),
    new Decimal(0),
  );
  const billing = record.billingDocument;
  return {
    title: record.label,
    type: "Client installment",
    status: derivePaymentStatus({
      dueDate: dateToDateOnly(record.dueDate),
      isCancelled: record.isCancelled,
      paidAmount: paid,
      scheduledAmount: record.scheduledAmount.toString(),
      today: businessToday(),
    }),
    description:
      "Scheduled Client cash in. Related lists the owning Billing document, matching Invoices and actual receipts.",
    manageHref: billing
      ? `/billing/${billing.id}?tab=schedule`
      : "/installments",
    fields: installmentFields(
      record,
      paid,
      retainedCurrency(
        billing?.project?.reportingCurrencyCode,
        billing?.detachedReportingCurrencyCode ??
          ("detachedReportingCurrencyCode" in record
            ? record.detachedReportingCurrencyCode
            : null),
      ),
    ),
    tables: [
      projectsTable([billing?.project]),
      partiesTable("clients", [billing?.client]),
      billingsTable([billing, ...record.matchedInvoices]),
      receiptsTable(record.receipts),
    ],
  };
}

async function getCashRecordInternal(
  kind: CashRecordKind,
  id: string,
): Promise<CashRecordView | null> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return null;
  switch (kind) {
    case "payment":
      return (
        (await paymentRecord(id)) ??
        unassignedCashRecord(id, "SUPPLIER_PAYMENT")
      );
    case "receipt":
      return (
        (await receiptRecord(id)) ?? unassignedCashRecord(id, "CLIENT_RECEIPT")
      );
    case "supplier-installment":
      return supplierInstallmentRecord(id);
    case "client-installment":
      return clientInstallmentRecord(id);
  }
}

export async function getCashRecord(
  ...args: Parameters<typeof getCashRecordInternal>
) {
  const user = await requireUser();
  const result = await getCashRecordInternal(...args);
  if (!user || !canEditMasterData(user.role)) return result;
  if (!result) return result;
  const tables = result.tables;
  editableRelatedTables(tables);
  const [kind, id] = args;
  for (const table of tables) {
    if (kind === "payment" || kind === "receipt") {
      table.removal = {
        kind: "cash-relationship",
        cashKind: kind,
        recordId: id,
        tableId: table.id,
      };
    } else if (
      kind === "supplier-installment" &&
      (table.id === "orders" ||
        table.id === "projects" ||
        table.id === "suppliers")
    ) {
      table.removal = {
        kind: "assignment",
        relation:
          table.id === "suppliers"
            ? "supplier-installment-supplier"
            : table.id === "orders"
              ? "supplier-installment-order"
              : "supplier-installment-project",
        parentId: id,
        ownerId: id,
      };
    } else if (
      kind === "client-installment" &&
      (table.id === "billing" ||
        table.id === "projects" ||
        table.id === "clients")
    ) {
      table.removal = {
        kind: "assignment",
        relation:
          table.id === "clients"
            ? "client-installment-client"
            : table.id === "billing"
              ? "client-installment-billing"
              : "client-installment-project",
        parentId: id,
        ownerId: id,
      };
    }
  }
  return result;
}

async function unassignedCashRecord(
  id: string,
  direction: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT",
): Promise<CashRecordView | null> {
  const row = await getDatabase().unassignedCashRecord.findFirst({
    where: { id, direction },
  });
  if (!row) return null;
  return {
    title: row.reference || "Unassigned cash",
    type: "Unassigned cash record",
    status: "UNASSIGNED",
    description:
      "This cash record has no document assignment. It is retained in Unassigned cash records.",
    manageHref: "/unassigned-cash",
    tables: [],
    fields: [
      {
        label: "Amount",
        value: formatMoney(row.amount.toString(), row.currencyCode),
      },
      { label: "Date", value: date(row.cashDate) },
      {
        label: "Original FX",
        value: fx(
          row.fxRateToReporting,
          row.currencyCode,
          row.reportingCurrencyCode,
        ),
      },
      { label: "Notes", value: row.notes || "—" },
    ],
  };
}
