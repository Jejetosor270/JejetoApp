import "server-only";
import { nextUnpaidTerm } from "@/domain/payments/terms";
import { z } from "zod";
import { Prisma, ProcurementOrderStatus } from "@/generated/prisma/client";
import { carriers } from "@/config/carriers";
import {
  dateOnlyToDate,
  dateToDateOnly,
  isDateOnly,
} from "@/domain/payments/dates";
import { CellEditError, type CellEditInput } from "@/domain/listing/cell-edit";
import { writeAuditEvent } from "@/lib/audit/events";
import { getOrderInTransaction, updateOrderInTransaction } from "./orders";
import { currentOrderValues } from "./edit-values";

type OrderCellInput = Extract<CellEditInput, { kind: "order" }>;
type StoredField = Exclude<OrderCellInput["field"], "dueDate">;
type DirectField = Exclude<StoredField, "purchaseCost" | "projectId">;
type EditableOrder = Awaited<ReturnType<typeof loadEditableOrder>>;

async function loadEditableOrder(tx: Prisma.TransactionClient, id: string) {
  return tx.procurementOrder.findUniqueOrThrow({
    where: { id },
    include: {
      costLines: true,
      _count: {
        select: {
          buildings: true,
          items: true,
          clientBillingAllocations: true,
          paymentInstallments: true,
        },
      },
    },
  });
}

function storedCellValue(order: EditableOrder, field: StoredField) {
  return field === "purchaseCost"
    ? (order.costLines
        .find((line) => line.category === "SUPPLIER_PURCHASE")
        ?.originalAmount.toString() ?? "")
    : field === "invoiceDate" ||
        field === "expectedReadyDate" ||
        field === "expectedDeliveryDate"
      ? (dateToDateOnly(order[field]) ?? "")
      : (order[field] ?? "");
}

async function rescheduleNextTerm(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: OrderCellInput,
  order: EditableOrder,
) {
  const terms = await tx.paymentInstallment.findMany({
    where: { orderId: input.id, direction: "SUPPLIER_PAYMENT" },
    include: { settlements: true },
  });
  const term = nextUnpaidTerm(
    terms.map((t) => ({
      id: t.id,
      dueDate: dateToDateOnly(t.dueDate),
      isCancelled: t.isCancelled,
      scheduledAmount: t.scheduledAmount.toString(),
      payments: t.settlements.map((r) => ({ amount: r.amount.toString() })),
    })),
  );
  if (!term)
    throw new CellEditError("There is no unpaid payment term to reschedule.");
  if ((term.dueDate ?? "") !== input.previous)
    throw new CellEditError(
      "The next unpaid term changed. Reload before saving; your draft is retained.",
    );
  if (input.value && !isDateOnly(input.value))
    throw new CellEditError("Enter a valid date.");
  await tx.paymentInstallment.update({
    where: { id: term.id },
    data: {
      dueDate: input.value ? dateOnlyToDate(input.value) : null,
      updatedById: actorId,
    },
  });
  await writeAuditEvent(tx, actorId, {
    action: "UPDATED",
    entityType: "ORDER",
    entityId: input.id,
    entityReference: order.orderNumber,
    summary: "Rescheduled the next unpaid Supplier term.",
    metadata: {
      installmentId: term.id,
      previous: input.previous,
      value: input.value,
    },
  });
}

async function updateFinancialCell(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: OrderCellInput,
  field: "purchaseCost" | "projectId",
  value: string,
) {
  const summary = await getOrderInTransaction(tx, input.id);
  if (!summary) throw new CellEditError("Order not found.");
  const values = currentOrderValues(summary, { [field]: value });
  await updateOrderInTransaction(tx, actorId, { ...values, id: input.id });
}

async function validateSupplier(
  tx: Prisma.TransactionClient,
  order: EditableOrder,
  value: string,
) {
  z.uuid().parse(value);
  if (!(await tx.supplier.findFirst({ where: { id: value, isActive: true } })))
    throw new CellEditError("Select an active Supplier.");
  if (
    value !== order.supplierId &&
    (order._count.items || order._count.paymentInstallments)
  )
    throw new CellEditError(
      "Reconcile linked Items and payment terms before changing Supplier.",
    );
}

async function validatePackage(
  tx: Prisma.TransactionClient,
  order: EditableOrder,
  value: string,
) {
  if (
    value &&
    !(await tx.orderPackage.findFirst({
      where: {
        id: z.uuid().parse(value),
        projectId: order.projectId,
        isActive: true,
      },
    }))
  )
    throw new CellEditError("Select an active Package in this Project.");
}

async function validateProject(
  tx: Prisma.TransactionClient,
  order: EditableOrder,
  value: string,
) {
  const project = await tx.project.findFirst({
    where: { id: z.uuid().parse(value), status: { not: "ARCHIVED" } },
  });
  if (!project) throw new CellEditError("Select an active Project.");
  const oldProject = order.projectId
    ? await tx.project.findUnique({ where: { id: order.projectId } })
    : null;
  if (
    value !== order.projectId &&
    (order.packageId || Object.values(order._count).some((count) => count > 0))
  )
    throw new CellEditError(
      "Reconcile this Order's Package, Buildings, Items, Billing and payment terms before changing Project.",
    );
  if (
    (oldProject?.reportingCurrencyCode ??
      order.detachedReportingCurrencyCode) !== project.reportingCurrencyCode
  )
    throw new CellEditError(
      "Use the full Order editor to review manual FX when changing reporting currency.",
    );
}

function carrierUpdate(
  order: EditableOrder,
  value: string,
): Prisma.ProcurementOrderUncheckedUpdateInput {
  const data: Prisma.ProcurementOrderUncheckedUpdateInput = {};
  if (
    value &&
    value !== "OTHER" &&
    !carriers.some((carrier) => carrier.code === value)
  )
    throw new CellEditError("Select a valid carrier.");
  if (value === "OTHER" && !order.carrierOtherName)
    throw new CellEditError(
      "Use the Delivery editor to enter an Other carrier name.",
    );
  data.carrierCode = value || null;
  if (value !== "OTHER") data.carrierOtherName = null;

  return data;
}

function deliveryTextValue(
  order: EditableOrder,
  field: "trackingReference" | "carrierOtherName",
  rawValue: string,
) {
  const value =
    z
      .string()
      .max(field === "trackingReference" ? 200 : 120)
      .parse(rawValue) || null;
  if (field === "carrierOtherName" && order.carrierCode !== "OTHER")
    throw new CellEditError("Select Other as the carrier first.");
  if (field === "carrierOtherName" && !value)
    throw new CellEditError("Enter the carrier name.");
  return value;
}

async function directCellUpdate(
  tx: Prisma.TransactionClient,
  actorId: string,
  order: EditableOrder,
  field: DirectField,
  rawValue: string,
) {
  let value: string | null = rawValue;
  const data: Prisma.ProcurementOrderUncheckedUpdateInput = {
    updatedById: actorId,
  };
  switch (field) {
    case "shortDescription":
      data.shortDescription = z.string().max(240).parse(value) || null;
      break;
    case "orderNumber":
      data.orderNumber = z.string().min(2).max(50).parse(value);
      break;
    case "status": {
      const status = z.enum(ProcurementOrderStatus).parse(value);
      if (status === "CANCELLED")
        throw new CellEditError("Use Cancel Order in Details.");
      data.status = status;
      break;
    }
    case "invoiceDate":
    case "expectedReadyDate":
    case "expectedDeliveryDate": {
      if (value && !isDateOnly(value))
        throw new CellEditError("Enter a valid date.");
      data[field] = value ? dateOnlyToDate(value) : null;
      break;
    }
    case "trackingReference":
    case "carrierOtherName": {
      value = deliveryTextValue(order, field, value);
      data[field] = value;
      break;
    }
    case "carrierCode": {
      Object.assign(data, carrierUpdate(order, value));
      break;
    }
    case "supplierId": {
      await validateSupplier(tx, order, value);
      data.supplierId = value;
      break;
    }
    case "packageId": {
      await validatePackage(tx, order, value);
      data.packageId = value || null;
    }
  }
  return { data, value };
}

export async function editOrderCell(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: OrderCellInput,
) {
  const order = await loadEditableOrder(tx, input.id);
  if (order.status === "CANCELLED")
    throw new CellEditError("This Order is cancelled. Review it in Details.");
  const { field } = input;
  if (field === "dueDate") return rescheduleNextTerm(tx, actorId, input, order);
  const previous = storedCellValue(order, field);
  if (previous !== input.previous)
    throw new CellEditError(
      "This value changed since you opened the table. Reload before saving; your draft is retained.",
    );
  const trimmedValue = input.value.trim();
  if (field === "projectId") await validateProject(tx, order, trimmedValue);
  if (field === "purchaseCost" || field === "projectId")
    return updateFinancialCell(tx, actorId, input, field, trimmedValue);
  const { data, value } = await directCellUpdate(
    tx,
    actorId,
    order,
    field,
    trimmedValue,
  );
  await tx.procurementOrder.update({ where: { id: input.id }, data });
  await writeAuditEvent(tx, actorId, {
    action: "UPDATED",
    entityType: "ORDER",
    entityId: input.id,
    entityReference: order.orderNumber,
    summary: "Edited an Order table cell.",
    metadata: { field, previous, value },
  });
}
