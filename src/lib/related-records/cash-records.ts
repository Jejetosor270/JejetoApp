import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
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
  supplierInstallmentSelect,
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
  select: { ...orderSelect, project: { select: projectSelect } },
} as const;
const billingContext = {
  select: {
    ...billingSelect,
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
    manageHref: `/orders/${order.id}?tab=payments`,
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
          order.project.reportingCurrencyCode,
        ),
      },
      { label: "Notes", value: record.notes ?? "—" },
    ],
    tables: [
      projectsTable([order.project]),
      ordersTable([order]),
      partiesTable("suppliers", [order.supplier]),
      supplierInstallmentsTable([installment]),
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
      ].map((row) => [row.id, row]),
    ).values(),
  ];
  return {
    title: record.reference || `Receipt · ${date(record.receivedAt)}`,
    type: "Client receipt",
    status: "RECORDED",
    description:
      "Actual Client cash in. Billing allocations do not split this receipt among Orders.",
    manageHref: `/billing/${billing.id}?tab=schedule`,
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
          billing.project.reportingCurrencyCode,
        ),
      },
      { label: "Notes", value: record.notes ?? "—" },
    ],
    tables: [
      projectsTable([billing.project]),
      partiesTable("clients", [billing.client]),
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
    manageHref: `/orders/${record.order.id}?tab=payments`,
    fields: installmentFields(
      record,
      paid,
      record.order.project.reportingCurrencyCode,
    ),
    tables: [
      projectsTable([record.order.project]),
      ordersTable([record.order]),
      partiesTable("suppliers", [record.order.supplier]),
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
    manageHref: `/billing/${billing.id}?tab=schedule`,
    fields: installmentFields(
      record,
      paid,
      billing.project.reportingCurrencyCode,
    ),
    tables: [
      projectsTable([billing.project]),
      partiesTable("clients", [billing.client]),
      billingsTable([billing, ...record.matchedInvoices]),
      receiptsTable(record.receipts),
    ],
  };
}

export async function getCashRecord(
  kind: CashRecordKind,
  id: string,
): Promise<CashRecordView | null> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return null;
  switch (kind) {
    case "payment":
      return paymentRecord(id);
    case "receipt":
      return receiptRecord(id);
    case "supplier-installment":
      return supplierInstallmentRecord(id);
    case "client-installment":
      return clientInstallmentRecord(id);
  }
}
