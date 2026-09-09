import "server-only";
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

export async function editOrderCell(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: Extract<CellEditInput, { kind: "order" }>,
) {
  const order = await tx.procurementOrder.findUniqueOrThrow({
    where: { id: input.id },
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
  if (order.status === "CANCELLED")
    throw new CellEditError("This Order is cancelled. Review it in Details.");
  const { field } = input;
  const previous =
    field === "purchaseCost"
      ? (order.costLines
          .find((line) => line.category === "SUPPLIER_PURCHASE")
          ?.originalAmount.toString() ?? "")
      : field === "invoiceDate" ||
          field === "expectedReadyDate" ||
          field === "expectedDeliveryDate"
        ? (dateToDateOnly(order[field]) ?? "")
        : (order[field] ?? "");
  if (previous !== input.previous)
    throw new CellEditError(
      "This value changed since you opened the table. Reload before saving; your draft is retained.",
    );
  let value: string | null = input.value.trim();
  if (field === "purchaseCost") {
    const summary = await getOrderInTransaction(tx, input.id);
    if (!summary) throw new CellEditError("Order not found.");
    const values = currentOrderValues(summary, { purchaseCost: value });
    await updateOrderInTransaction(tx, actorId, { ...values, id: input.id });
    return;
  }
  const data: Prisma.ProcurementOrderUncheckedUpdateInput = {
    updatedById: actorId,
  };
  if (field === "orderNumber")
    data.orderNumber = z.string().min(2).max(50).parse(value);
  else if (field === "status") {
    const status = z.enum(ProcurementOrderStatus).parse(value);
    if (status === "CANCELLED")
      throw new CellEditError("Use Cancel Order in Details.");
    data.status = status;
  } else if (
    field === "invoiceDate" ||
    field === "expectedReadyDate" ||
    field === "expectedDeliveryDate"
  ) {
    if (value && !isDateOnly(value))
      throw new CellEditError("Enter a valid date.");
    data[field] = value ? dateOnlyToDate(value) : null;
  } else if (field === "trackingReference" || field === "carrierOtherName") {
    value =
      z
        .string()
        .max(field === "trackingReference" ? 200 : 120)
        .parse(value) || null;
    if (field === "carrierOtherName" && order.carrierCode !== "OTHER")
      throw new CellEditError("Select Other as the carrier first.");
    if (field === "carrierOtherName" && !value)
      throw new CellEditError("Enter the carrier name.");
    data[field] = value;
  } else if (field === "carrierCode") {
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
  } else if (field === "supplierId") {
    z.uuid().parse(value);
    if (
      !(await tx.supplier.findFirst({ where: { id: value, isActive: true } }))
    )
      throw new CellEditError("Select an active Supplier.");
    if (
      value !== order.supplierId &&
      (order._count.items || order._count.paymentInstallments)
    )
      throw new CellEditError(
        "Reconcile linked Items and payment terms before changing Supplier.",
      );
    data.supplierId = value;
  } else if (field === "packageId") {
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
    data.packageId = value || null;
  } else if (field === "projectId") {
    const project = await tx.project.findFirst({
      where: { id: z.uuid().parse(value), status: { not: "ARCHIVED" } },
    });
    if (!project) throw new CellEditError("Select an active Project.");
    const oldProject = order.projectId
      ? await tx.project.findUnique({ where: { id: order.projectId } })
      : null;
    if (
      value !== order.projectId &&
      (order.packageId ||
        Object.values(order._count).some((count) => count > 0))
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
    const summary = await getOrderInTransaction(tx, input.id);
    if (!summary) throw new CellEditError("Order not found.");
    await updateOrderInTransaction(tx, actorId, {
      ...currentOrderValues(summary, { projectId: value }),
      id: input.id,
    });
    return;
  }
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
