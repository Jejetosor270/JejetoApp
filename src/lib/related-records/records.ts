import "server-only";
import { dateToDateOnly, formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import {
  projectSelect,
  partySelect,
  orderSelect,
  billingSelect,
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
  table,
} from "./projections";
import { relatedHref, type RelatedTableData } from "./types";

export async function getProjectRelations(
  projectId: string,
): Promise<RelatedTableData[]> {
  await requireUser();
  z.uuid().parse(projectId);
  const db = getDatabase();
  const [
    project,
    orders,
    billing,
    installments,
    clientInstallments,
    payments,
    receipts,
  ] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { client: { select: partySelect } },
    }),
    db.procurementOrder.findMany({
      where: { projectId },
      select: orderSelect,
      orderBy: [{ orderNumber: "asc" }, { id: "asc" }],
    }),
    db.clientBillingDocument.findMany({
      where: { projectId },
      select: billingSelect,
      orderBy: [{ documentDate: "desc" }, { id: "asc" }],
    }),
    db.paymentInstallment.findMany({
      where: { order: { projectId }, direction: "SUPPLIER_PAYMENT" },
      select: supplierInstallmentSelect,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
    db.clientPaymentInstallment.findMany({
      where: { billingDocument: { projectId } },
      select: clientInstallmentSelect,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
    db.paymentSettlement.findMany({
      where: {
        installment: { direction: "SUPPLIER_PAYMENT", order: { projectId } },
      },
      select: paymentSelect,
      orderBy: [{ settledAt: "desc" }, { id: "asc" }],
    }),
    db.clientReceipt.findMany({
      where: { billingDocument: { projectId } },
      select: receiptSelect,
      orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
    }),
  ]);
  return [
    partiesTable("clients", project ? [project.client] : []),
    ordersTable(orders),
    billingsTable(billing),
    paymentsTable(payments),
    receiptsTable(receipts),
    supplierInstallmentsTable(installments),
    clientInstallmentsTable(clientInstallments),
  ];
}

export async function getOrderRelations(
  orderId: string,
): Promise<RelatedTableData[]> {
  await requireUser();
  z.uuid().parse(orderId);
  const db = getDatabase();
  const [order, installments, payments] = await Promise.all([
    db.procurementOrder.findUnique({
      where: { id: orderId },
      select: {
        project: { select: projectSelect },
        supplier: { select: partySelect },
        clientBillingAllocations: {
          select: {
            allocatedAmount: true,
            freightCoverageHt: true,
            billingDocument: { select: billingSelect },
          },
          orderBy: { billingDocumentId: "asc" },
        },
        buildings: {
          select: {
            building: {
              select: { id: true, name: true, shortCode: true, isActive: true },
            },
          },
          orderBy: { buildingId: "asc" },
        },
      },
    }),
    db.paymentInstallment.findMany({
      where: { orderId, direction: "SUPPLIER_PAYMENT" },
      select: supplierInstallmentSelect,
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
    }),
    db.paymentSettlement.findMany({
      where: { installment: { orderId, direction: "SUPPLIER_PAYMENT" } },
      select: paymentSelect,
      orderBy: [{ settledAt: "desc" }, { id: "asc" }],
    }),
  ]);
  // Client cash is deliberately reached through linked Billing, never projected onto an Order.
  return [
    projectsTable(order ? [order.project] : []),
    partiesTable("suppliers", order ? [order.supplier] : []),
    table(
      "buildings",
      "Buildings",
      ["Building", "Code", "Status"],
      order?.buildings.map(({ building }) => ({
        id: building.id,
        href: `/projects/${order.project.id}?tab=buildings`,
        cells: [
          building.name,
          building.shortCode,
          building.isActive ? "Active" : "Archived",
        ],
      })) ?? [],
    ),
    paymentsTable(payments),
    supplierInstallmentsTable(installments),
    {
      ...billingsTable(
        order?.clientBillingAllocations.map((row) => row.billingDocument) ?? [],
      ),
      columns: [
        "Billing",
        "Type",
        "Date",
        "Allocated HT",
        "Of which freight HT",
        "Record status",
      ],
      rows:
        order?.clientBillingAllocations.map((row) => ({
          id: row.billingDocument.id,
          href: relatedHref("billing", row.billingDocument.id),
          cells: [
            row.billingDocument.reference,
            row.billingDocument.documentType,
            formatDateOnly(dateToDateOnly(row.billingDocument.documentDate)),
            formatMoney(
              row.allocatedAmount.toString(),
              row.billingDocument.currencyCode,
            ),
            formatMoney(
              row.freightCoverageHt.toString(),
              row.billingDocument.currencyCode,
            ),
            row.billingDocument.isCancelled ? "Cancelled" : "Active",
          ],
        })) ?? [],
    },
  ];
}

export async function getBillingRelations(
  billingId: string,
): Promise<RelatedTableData[]> {
  await requireUser();
  z.uuid().parse(billingId);
  const db = getDatabase();
  const document = await db.clientBillingDocument.findUnique({
    where: { id: billingId },
    select: {
      project: { select: projectSelect },
      client: { select: partySelect },
      matchedInstallmentId: true,
      supersedesDocument: { select: billingSelect },
      revisions: {
        select: billingSelect,
        orderBy: [{ documentDate: "desc" }, { id: "asc" }],
      },
    },
  });
  if (!document) return [];
  const installmentWhere = {
    OR: [
      { billingDocumentId: billingId },
      ...(document.matchedInstallmentId
        ? [{ id: document.matchedInstallmentId }]
        : []),
    ],
  };
  const [installments, receipts] = await Promise.all([
    db.clientPaymentInstallment.findMany({
      where: installmentWhere,
      select: clientInstallmentSelect,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
    db.clientReceipt.findMany({
      where: {
        OR: [
          { billingDocumentId: billingId },
          ...(document.matchedInstallmentId
            ? [{ installmentId: document.matchedInstallmentId }]
            : []),
        ],
      },
      select: receiptSelect,
      orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
    }),
  ]);
  const revisions = [
    ...(document.supersedesDocument ? [document.supersedesDocument] : []),
    ...document.revisions,
  ];
  return [
    projectsTable([document.project]),
    partiesTable("clients", [document.client]),
    clientInstallmentsTable(installments),
    receiptsTable(receipts),
    ...(revisions.length
      ? [
          {
            ...billingsTable(revisions),
            id: "revisions",
            title: "Billing revisions",
          },
        ]
      : []),
  ];
}
