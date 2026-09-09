import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { orderInclude, summarizeOrder } from "@/lib/procurement/orders";
import { writeAuditEvent } from "@/lib/audit/events";
import { retainedCurrency } from "./context";
import type { AssignmentRelation } from "./types";
import { unassignCashInTransaction } from "@/lib/payments/unassigned-cash";
import type { AuditEntityType } from "@/domain/audit/constants";

export class AssignmentError extends Error {}
type Context = {
  relation: AssignmentRelation;
  parentId: string;
  ownerId?: string | undefined;
};

function linked(actual: string | null | undefined, expected: string) {
  if (actual !== expected)
    throw new AssignmentError(
      "A selected relationship changed. Refresh and try again.",
    );
}

/** Clear assignments atomically, retaining normalized business records and monetary context. */
export async function removeAssignments(
  actorId: string,
  context: Context,
  selected: string[],
) {
  return getDatabase().$transaction(
    async (tx) => {
      if (context.ownerId && selected.length !== 1)
        throw new AssignmentError("Select the existing parent relationship.");
      for (const selectedId of [...new Set(selected)]) {
        const id = context.ownerId ?? selectedId;
        const parent = context.ownerId ? selectedId : context.parentId;
        const where = { id };
        const updatedById = actorId;
        switch (context.relation) {
          case "project-client": {
            const row = await tx.project.findUniqueOrThrow({ where });
            linked(row.clientId, parent);
            await tx.project.update({
              where,
              data: { clientId: null, updatedById },
            });
            break;
          }
          case "order-project": {
            const row = await tx.procurementOrder.findUniqueOrThrow({
              where,
              include: orderInclude,
            });
            linked(row.projectId, parent);
            const view = summarizeOrder(row);
            await tx.procurementOrderBuilding.deleteMany({
              where: { orderId: id },
            });
            await tx.clientBillingAllocation.deleteMany({
              where: { orderId: id },
            });
            await tx.item.updateMany({
              where: { procurementOrderId: id },
              data: { procurementOrderId: null, updatedById },
            });
            await tx.procurementOrder.update({
              where,
              data: {
                projectId: null,
                packageId: null,
                updatedById,
                detachedReportingCurrencyCode:
                  view.project.reportingCurrencyCode,
                productMarkupOverrideRate:
                  view.componentPricing.productMarkupRate,
                freightMarkupOverrideRate:
                  view.componentPricing.freightMarkupRate,
                otherCostMarkupOverrideRate:
                  view.componentPricing.otherMarkupRate,
                freightAllowanceOverrideAmount: view.freightAllowance.amount,
                pricingMode:
                  row.pricingMode === "PROJECT_MARKUP"
                    ? "ORDER_MARKUP"
                    : row.pricingMode,
              },
            });
            break;
          }
          case "order-supplier": {
            const row = await tx.procurementOrder.findUniqueOrThrow({ where });
            linked(row.supplierId, parent);
            await tx.procurementOrder.update({
              where,
              data: { supplierId: null, updatedById },
            });
            break;
          }
          case "billing-client":
          case "billing-project": {
            const row = await tx.clientBillingDocument.findUniqueOrThrow({
              where,
              include: { project: true },
            });
            linked(
              context.relation === "billing-client"
                ? row.clientId
                : row.projectId,
              parent,
            );
            // Clearing the Client also clears its Project assignment to avoid an indirect Client link.
            await tx.clientBillingAllocation.deleteMany({
              where: { billingDocumentId: id },
            });
            await tx.clientBillingDocument.updateMany({
              where: { matchedInstallment: { billingDocumentId: id } },
              data: { matchedInstallmentId: null, updatedById },
            });
            await tx.clientBillingDocument.update({
              where,
              data: {
                projectId: null,
                ...(context.relation === "billing-client"
                  ? { clientId: null }
                  : {}),
                detachedReportingCurrencyCode: retainedCurrency(
                  row.project?.reportingCurrencyCode,
                  row.detachedReportingCurrencyCode,
                ),
                matchedInstallmentId: null,
                updatedById,
              },
            });
            break;
          }
          case "supplier-installment-order":
          case "supplier-installment-supplier":
          case "supplier-installment-project": {
            const row = await tx.paymentInstallment.findUniqueOrThrow({
              where,
              include: { order: { include: { project: true } } },
            });
            linked(
              context.relation === "supplier-installment-supplier"
                ? row.order?.supplierId
                : context.relation === "supplier-installment-order"
                  ? row.orderId
                  : row.order?.projectId,
              parent,
            );
            const payments = await tx.paymentSettlement.findMany({
              where: { installmentId: id },
              select: { id: true },
            });
            await unassignCashInTransaction(
              tx,
              actorId,
              "payment",
              payments.map((payment) => payment.id),
            );
            await tx.paymentInstallment.update({
              where,
              data: {
                orderId: null,
                updatedById,
                detachedReportingCurrencyCode: retainedCurrency(
                  row.order?.project?.reportingCurrencyCode,
                  row.order?.detachedReportingCurrencyCode ??
                    row.detachedReportingCurrencyCode,
                ),
              },
            });
            break;
          }
          case "client-installment-billing":
          case "client-installment-client":
          case "client-installment-project": {
            const row = await tx.clientPaymentInstallment.findUniqueOrThrow({
              where,
              include: {
                billingDocument: { include: { project: true } },
                matchedInvoices: true,
              },
            });
            if (
              context.relation === "client-installment-billing" &&
              row.billingDocumentId !== parent
            ) {
              if (!row.matchedInvoices.some((invoice) => invoice.id === parent))
                throw new AssignmentError(
                  "The installment is no longer linked.",
                );
              await tx.clientBillingDocument.update({
                where: { id: parent },
                data: { matchedInstallmentId: null, updatedById },
              });
            } else {
              linked(
                context.relation === "client-installment-client"
                  ? row.billingDocument?.clientId
                  : context.relation === "client-installment-billing"
                    ? row.billingDocumentId
                    : row.billingDocument?.projectId,
                parent,
              );
              await tx.clientBillingDocument.updateMany({
                where: { matchedInstallmentId: id },
                data: { matchedInstallmentId: null, updatedById },
              });
              const receipts = await tx.clientReceipt.findMany({
                where: { installmentId: id },
                select: { id: true },
              });
              await unassignCashInTransaction(
                tx,
                actorId,
                "receipt",
                receipts.map((receipt) => receipt.id),
              );
              await tx.clientPaymentInstallment.update({
                where,
                data: {
                  billingDocumentId: null,
                  updatedById,
                  detachedReportingCurrencyCode: retainedCurrency(
                    row.billingDocument?.project?.reportingCurrencyCode,
                    row.billingDocument?.detachedReportingCurrencyCode ??
                      row.detachedReportingCurrencyCode,
                  ),
                },
              });
            }
            break;
          }
          case "building-project": {
            const row = await tx.building.findUniqueOrThrow({ where });
            linked(row.projectId, parent);
            await tx.procurementOrderBuilding.deleteMany({
              where: { buildingId: id },
            });
            await tx.item.updateMany({
              where: { buildingId: id },
              data: { buildingId: null, roomId: null, updatedById },
            });
            await tx.building.update({
              where,
              data: { projectId: null, updatedById },
            });
            break;
          }
          case "room-project":
          case "room-building": {
            const row = await tx.room.findUniqueOrThrow({
              where,
              include: { building: true },
            });
            linked(
              context.relation === "room-building"
                ? row.buildingId
                : row.building?.projectId,
              parent,
            );
            await tx.item.updateMany({
              where: { roomId: id },
              data: { roomId: null, updatedById },
            });
            await tx.room.update({
              where,
              data: { buildingId: null, updatedById },
            });
            break;
          }
          case "item-project": {
            const row = await tx.item.findUniqueOrThrow({
              where,
              include: { project: true },
            });
            linked(row.projectId, parent);
            await tx.item.update({
              where,
              data: {
                projectId: null,
                buildingId: null,
                roomId: null,
                procurementOrderId: null,
                detachedReportingCurrencyCode: retainedCurrency(
                  row.project?.reportingCurrencyCode,
                  row.detachedReportingCurrencyCode,
                ),
                updatedById,
              },
            });
            break;
          }
          case "item-building":
          case "item-room":
          case "item-order":
          case "item-supplier": {
            const row = await tx.item.findUniqueOrThrow({ where });
            const field = {
              "item-building": "buildingId",
              "item-room": "roomId",
              "item-order": "procurementOrderId",
              "item-supplier": "supplierId",
            } as const;
            linked(row[field[context.relation]], parent);
            await tx.item.update({
              where,
              data: {
                [field[context.relation]]: null,
                ...(context.relation === "item-building"
                  ? { roomId: null }
                  : {}),
                updatedById,
              },
            });
            break;
          }
          case "package-project": {
            const row = await tx.orderPackage.findUniqueOrThrow({ where });
            linked(row.projectId, parent);
            await tx.procurementOrder.updateMany({
              where: { packageId: id },
              data: { packageId: null, updatedById },
            });
            await tx.orderPackage.update({
              where,
              data: { projectId: null, updatedById },
            });
            break;
          }
          case "billing-revision": {
            const row = await tx.clientBillingDocument.findUniqueOrThrow({
              where,
            });
            if (row.supersedesDocumentId === parent) {
              await tx.clientBillingDocument.update({
                where,
                data: { supersedesDocumentId: null, updatedById },
              });
            } else {
              const owner = await tx.clientBillingDocument.findUniqueOrThrow({
                where: { id: parent },
              });
              linked(owner.supersedesDocumentId, id);
              await tx.clientBillingDocument.update({
                where: { id: parent },
                data: { supersedesDocumentId: null, updatedById },
              });
            }
            break;
          }
        }
        const entityTypes: Record<AssignmentRelation, AuditEntityType> = {
          "project-client": "PROJECT",
          "supplier-installment-supplier": "INSTALLMENT",
          "client-installment-client": "INSTALLMENT",
          "item-building": "ITEM",
          "item-room": "ITEM",
          "item-order": "ITEM",
          "item-supplier": "ITEM",
          "order-project": "ORDER",
          "order-supplier": "ORDER",
          "billing-project": "BILLING_DOCUMENT",
          "billing-client": "BILLING_DOCUMENT",
          "billing-revision": "BILLING_DOCUMENT",
          "building-project": "BUILDING",
          "room-building": "ROOM",
          "room-project": "ROOM",
          "item-project": "ITEM",
          "package-project": "ORDER_PACKAGE",
          "supplier-installment-order": "INSTALLMENT",
          "supplier-installment-project": "INSTALLMENT",
          "client-installment-billing": "INSTALLMENT",
          "client-installment-project": "INSTALLMENT",
        };
        await writeAuditEvent(tx, actorId, {
          action: "UPDATED",
          entityId: id,
          entityType: entityTypes[context.relation],
          entityReference: "Related assignment",
          summary:
            "Removed relationship; retained original business record and monetary context.",
          metadata: { relation: context.relation, previousParentId: parent },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
