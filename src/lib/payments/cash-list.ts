import "server-only";
import Decimal from "decimal.js";
import { getDatabase } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import {
  dateOnlyToDate,
  dateToDateOnly,
  businessToday,
} from "@/domain/payments/dates";
import { derivePaymentStatus } from "@/domain/payments/calculations";
import type { CashRecordKind } from "@/lib/related-records/types";
import { relatedHref } from "@/lib/related-records/types";

export interface CashListRow {
  id: string;
  href: string;
  reference: string;
  editReference?: string;
  project: string;
  counterparty: string;
  document: string;
  date: string;
  amount: string;
  currency: string;
  status: string;
}
export const installmentStatuses = [
  "OVERDUE",
  "DUE",
  "PARTIALLY_PAID",
  "UPCOMING",
  "PAID",
  "CANCELLED",
] as const;
export interface CashListFilters {
  status?: (typeof installmentStatuses)[number] | undefined;
  kind: CashRecordKind;
  query: string;
  orderId?: string | undefined;
  billingId?: string | undefined;
  projectId?: string | undefined;
  counterpartyId?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
}
export async function listCashRecords(
  filters: CashListFilters,
): Promise<{ items: CashListRow[]; total: number }> {
  await requireUser();
  const db = getDatabase();
  const { kind, query, projectId, counterpartyId, direction, page, pageSize } =
    filters;
  const dates = {
    ...(filters.dateFrom ? { gte: dateOnlyToDate(filters.dateFrom) } : {}),
    ...(filters.dateTo ? { lte: dateOnlyToDate(filters.dateTo) } : {}),
  };
  const contains = { contains: query, mode: "insensitive" as const };
  const orderScope = {
    ...(filters.orderId ? { id: filters.orderId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(counterpartyId ? { supplierId: counterpartyId } : {}),
  };
  const billingScope = {
    ...(filters.billingId ? { id: filters.billingId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(counterpartyId ? { clientId: counterpartyId } : {}),
  };
  const order = {
    include: {
      project: { select: { name: true } },
      supplier: { select: { displayName: true } },
    },
  } as const;
  const billing = {
    include: {
      project: { select: { name: true } },
      client: { select: { displayName: true } },
    },
  } as const;
  const paging = { skip: (page - 1) * pageSize, take: pageSize };
  const href = (id: string) =>
    relatedHref(kind, id).replace("?tab=related", "");
  if (kind === "payment") {
    const where = {
      settledAt: dates,
      installment: {
        direction: "SUPPLIER_PAYMENT" as const,
        ...(Object.keys(orderScope).length ? { order: orderScope } : {}),
      },
      ...(query
        ? {
            OR: [
              { reference: contains },
              { installment: { label: contains } },
              { installment: { order: { orderNumber: contains } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      db.paymentSettlement.findMany({
        where,
        ...paging,
        orderBy: [{ settledAt: direction }, { id: "asc" }],
        include: { installment: { include: { order } } },
      }),
      db.paymentSettlement.count({ where }),
    ]);
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        href: href(r.id),
        reference: r.reference || r.installment.label,
        editReference: r.reference ?? "",
        project: r.installment.order?.project?.name ?? "Unassigned",
        counterparty:
          r.installment.order?.supplier?.displayName ?? "Unassigned",
        document: r.installment.order?.orderNumber ?? "Unassigned",
        date: dateToDateOnly(r.settledAt),
        amount: r.amount.toString(),
        currency: r.installment.currencyCode,
        status: "RECORDED",
      })),
    };
  }
  if (kind === "receipt") {
    const where = {
      receivedAt: dates,
      ...(Object.keys(billingScope).length
        ? { billingDocument: billingScope }
        : {}),
      ...(query
        ? {
            OR: [
              { reference: contains },
              { billingDocument: { reference: contains } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      db.clientReceipt.findMany({
        where,
        ...paging,
        orderBy: [{ receivedAt: direction }, { id: "asc" }],
        include: { billingDocument: billing },
      }),
      db.clientReceipt.count({ where }),
    ]);
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        href: href(r.id),
        reference: r.reference || "Receipt",
        editReference: r.reference ?? "",
        project: r.billingDocument?.project?.name ?? "Unassigned",
        counterparty: r.billingDocument?.client?.displayName ?? "Unassigned",
        document: r.billingDocument?.reference ?? "Unassigned",
        date: dateToDateOnly(r.receivedAt),
        amount: r.amount.toString(),
        currency: r.billingDocument.currencyCode,
        status: "RECORDED",
      })),
    };
  }
  const status = (
    r: {
      dueDate: Date;
      isCancelled: boolean;
      scheduledAmount: { toString(): string };
    },
    amounts: { amount: { toString(): string } }[],
  ) =>
    derivePaymentStatus({
      dueDate: dateToDateOnly(r.dueDate),
      isCancelled: r.isCancelled,
      scheduledAmount: r.scheduledAmount.toString(),
      paidAmount: amounts.reduce(
        (sum, row) => sum.plus(row.amount.toString()),
        new Decimal(0),
      ),
      today: businessToday(),
    });
  if (kind === "supplier-installment") {
    const where = {
      direction: "SUPPLIER_PAYMENT" as const,
      dueDate: dates,
      ...(Object.keys(orderScope).length ? { order: orderScope } : {}),
      ...(query
        ? { OR: [{ label: contains }, { order: { orderNumber: contains } }] }
        : {}),
    };
    const candidates = filters.status
      ? await db.paymentInstallment.findMany({
          where,
          select: {
            id: true,
            dueDate: true,
            isCancelled: true,
            scheduledAmount: true,
            settlements: { select: { amount: true } },
          },
        })
      : [];
    const filteredWhere = filters.status
      ? {
          ...where,
          id: {
            in: candidates
              .filter((row) => status(row, row.settlements) === filters.status)
              .map((row) => row.id),
          },
        }
      : where;
    const [rows, total] = await Promise.all([
      db.paymentInstallment.findMany({
        where: filteredWhere,
        ...paging,
        orderBy: [{ dueDate: direction }, { id: "asc" }],
        include: { order, settlements: { select: { amount: true } } },
      }),
      db.paymentInstallment.count({ where: filteredWhere }),
    ]);
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        href: href(r.id),
        reference: r.label,
        project: r.order?.project?.name ?? "Unassigned",
        counterparty: r.order?.supplier?.displayName ?? "Unassigned",
        document: r.order?.orderNumber ?? "Unassigned",
        date: dateToDateOnly(r.dueDate),
        amount: r.scheduledAmount.toString(),
        currency: r.currencyCode,
        status: status(r, r.settlements),
      })),
    };
  }
  const where = {
    dueDate: dates,
    ...(Object.keys(billingScope).length
      ? { billingDocument: billingScope }
      : {}),
    ...(query
      ? {
          OR: [
            { label: contains },
            { billingDocument: { reference: contains } },
          ],
        }
      : {}),
  };
  const candidates = filters.status
    ? await db.clientPaymentInstallment.findMany({
        where,
        select: {
          id: true,
          dueDate: true,
          isCancelled: true,
          scheduledAmount: true,
          receipts: { select: { amount: true } },
        },
      })
    : [];
  const filteredWhere = filters.status
    ? {
        ...where,
        id: {
          in: candidates
            .filter((row) => status(row, row.receipts) === filters.status)
            .map((row) => row.id),
        },
      }
    : where;
  const [rows, total] = await Promise.all([
    db.clientPaymentInstallment.findMany({
      where: filteredWhere,
      ...paging,
      orderBy: [{ dueDate: direction }, { id: "asc" }],
      include: {
        billingDocument: billing,
        receipts: { select: { amount: true } },
      },
    }),
    db.clientPaymentInstallment.count({ where: filteredWhere }),
  ]);
  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      href: href(r.id),
      reference: r.label,
      project: r.billingDocument?.project?.name ?? "Unassigned",
      counterparty: r.billingDocument?.client?.displayName ?? "Unassigned",
      document: r.billingDocument?.reference ?? "Unassigned",
      date: dateToDateOnly(r.dueDate),
      amount: r.scheduledAmount.toString(),
      currency: r.currencyCode,
      status: status(r, r.receipts),
    })),
  };
}
