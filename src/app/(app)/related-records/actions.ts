"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import type { BulkActionState } from "@/domain/deletion/action-state";
import type { AuditEntityType } from "@/domain/audit/constants";
import type { RelatedEditKind } from "@/lib/related-records/types";
import type { RelatedTableData } from "@/lib/related-records/types";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import { Prisma } from "@/generated/prisma/client";
import { removeAssignments } from "@/lib/related-records/unassign";
import { unassignCashInTransaction } from "@/lib/payments/unassigned-cash";

export async function removeOptionalLinksAction(
  context: NonNullable<RelatedTableData["removal"]>,
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  if (context.kind === "cash-relationship") {
    const input = z
      .object({
        cashKind: z.enum(["payment", "receipt"]),
        recordId: z.uuid(),
        tableId: z.enum([
          "projects",
          "orders",
          "suppliers",
          "clients",
          "billing",
          "supplier-installments",
          "client-installments",
        ]),
      })
      .safeParse(context);
    const selection = selectedIdsSchema.safeParse(selectedIds(formData));
    if (!input.success || !selection.success)
      return { status: "error", message: "Select valid links." };
    try {
      await getDatabase().$transaction(
        async (tx) => {
          const { cashKind, recordId, tableId } = input.data;
          const payment =
            cashKind === "payment"
              ? await tx.paymentSettlement.findUnique({
                  where: { id: recordId },
                  include: { installment: { include: { order: true } } },
                })
              : null;
          const receipt =
            cashKind === "receipt"
              ? await tx.clientReceipt.findUnique({
                  where: { id: recordId },
                  include: { billingDocument: true },
                })
              : null;
          const parents: Record<string, string | null | undefined> = payment
            ? {
                projects: payment.installment.order?.projectId,
                orders: payment.installment.orderId,
                suppliers: payment.installment.order?.supplierId,
                "supplier-installments": payment.installmentId,
              }
            : {
                projects: receipt?.billingDocument.projectId,
                clients: receipt?.billingDocument.clientId,
                billing: receipt?.billingDocumentId,
                "client-installments": receipt?.installmentId,
              };
          if (
            selection.data.length !== 1 ||
            parents[tableId] !== selection.data[0]
          )
            throw new Error("Relationship changed.");
          await unassignCashInTransaction(tx, actor.id, cashKind, [recordId]);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      revalidatePath("/", "layout");
      return {
        status: "success",
        message: "Original cash retained in Unassigned cash records.",
      };
    } catch {
      return {
        status: "error",
        message:
          "The relationship changed. Nothing was removed. Refresh and try again.",
      };
    }
  }
  if (context.kind === "assignment") {
    const assignment = z
      .object({
        kind: z.literal("assignment"),
        parentId: z.uuid(),
        ownerId: z.uuid().optional(),
        relation: z.enum([
          "supplier-installment-supplier",
          "client-installment-client",
          "item-building",
          "item-room",
          "item-order",
          "item-supplier",
          "project-client",
          "order-project",
          "order-supplier",
          "billing-project",
          "billing-client",
          "building-project",
          "room-building",
          "room-project",
          "item-project",
          "package-project",
          "supplier-installment-order",
          "supplier-installment-project",
          "client-installment-billing",
          "client-installment-project",
          "billing-revision",
        ]),
      })
      .safeParse(context);
    const selection = selectedIdsSchema.safeParse(selectedIds(formData));
    if (!assignment.success || !selection.success)
      return { status: "error", message: "Select valid relationships." };
    try {
      await removeAssignments(actor.id, assignment.data, selection.data);
      revalidatePath("/", "layout");
      return {
        status: "success",
        message: "Relationships removed. Original records retained.",
      };
    } catch {
      return {
        status: "error",
        message:
          "The relationships changed or could not be removed. Nothing was changed. Refresh and try again.",
      };
    }
  }
  const input = z
    .object({
      kind: z.enum([
        "order-buildings",
        "order-items",
        "billing-orders",
        "order-billing",
      ]),
      parentId: z.uuid(),
    })
    .safeParse(context);
  const selected = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!input.success || !selected.success)
    return { status: "error", message: "Select valid links." };
  const { kind, parentId } = input.data;
  const ids = [...new Set(selected.data)];
  try {
    await getDatabase().$transaction(
      async (tx) => {
        let changed: number;
        if (kind === "order-buildings") {
          await tx.procurementOrder.findUniqueOrThrow({
            where: { id: parentId },
          });
          changed = (
            await tx.procurementOrderBuilding.deleteMany({
              where: { orderId: parentId, buildingId: { in: ids } },
            })
          ).count;
        } else if (kind === "order-items") {
          await tx.procurementOrder.findUniqueOrThrow({
            where: { id: parentId },
          });
          changed = (
            await tx.item.updateMany({
              where: { procurementOrderId: parentId, id: { in: ids } },
              data: { procurementOrderId: null, updatedById: actor.id },
            })
          ).count;
        } else {
          const where =
            kind === "billing-orders"
              ? { billingDocumentId: parentId, orderId: { in: ids } }
              : { orderId: parentId, billingDocumentId: { in: ids } };
          const links = await tx.clientBillingAllocation.findMany({
            where,
            select: { billingDocumentId: true },
          });
          changed = (await tx.clientBillingAllocation.deleteMany({ where }))
            .count;
          await tx.clientBillingDocument.updateMany({
            where: { id: { in: links.map((link) => link.billingDocumentId) } },
            data: { updatedById: actor.id },
          });
        }
        if (changed !== ids.length)
          throw new Error("A selected link changed. Nothing was removed.");
        await writeAuditEvent(tx, actor.id, {
          action: "UPDATED",
          entityType: kind === "billing-orders" ? "BILLING_DOCUMENT" : "ORDER",
          entityId: parentId,
          entityReference: "Related records",
          summary:
            "Removed optional relationships; original business records retained.",
          metadata: { kind, recordIds: ids },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    revalidatePath("/", "layout");
    return {
      status: "success",
      message: "Links removed. The records remain available.",
    };
  } catch {
    return {
      status: "error",
      message:
        "The links changed or could not be removed. Nothing was removed; refresh and try again.",
    };
  }
}

const kindSchema = z.enum([
  "project",
  "client",
  "supplier",
  "order",
  "billing",
  "payment",
  "receipt",
  "supplier-installment",
  "client-installment",
  "building",
  "room",
  "item",
  "package",
]);
const limits: Record<RelatedEditKind, number> = {
  allocation: 200,
  "allocation-order": 200,
  project: 200,
  client: 160,
  supplier: 160,
  order: 50,
  billing: 120,
  payment: 120,
  receipt: 120,
  "supplier-installment": 200,
  "client-installment": 200,
  building: 160,
  room: 160,
  item: 240,
  package: 160,
};
/** Names/references only: no financial or relationship fields are accepted. */
export async function editRelatedNameAction(
  kind: RelatedEditKind,
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const parsedKind = kindSchema.safeParse(kind);
  if (!parsedKind.success)
    return { status: "error", message: "Choose a valid record type." };
  const input = z
    .object({
      id: z.uuid(),
      value: z
        .string()
        .trim()
        .min(1, "Enter a name or reference.")
        .max(limits[parsedKind.data]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!input.success)
    return {
      status: "error",
      message: input.error.issues[0]?.message ?? "Check the row.",
    };
  try {
    await getDatabase().$transaction(async (tx) => {
      const { id, value } = input.data;
      const where = { id };
      const updatedById = actor.id;
      let entityType: AuditEntityType;
      switch (parsedKind.data) {
        case "project":
          await tx.project.update({
            where,
            data: { name: value, updatedById },
          });
          entityType = "PROJECT";
          break;
        case "client":
          await tx.client.update({
            where,
            data: { displayName: value, updatedById },
          });
          entityType = "CLIENT";
          break;
        case "supplier":
          await tx.supplier.update({
            where,
            data: { displayName: value, updatedById },
          });
          entityType = "SUPPLIER";
          break;
        case "order":
          await tx.procurementOrder.update({
            where,
            data: { orderNumber: value, updatedById },
          });
          entityType = "ORDER";
          break;
        case "billing":
          await tx.clientBillingDocument.update({
            where,
            data: { reference: value, updatedById },
          });
          entityType = "BILLING_DOCUMENT";
          break;
        case "payment":
          await tx.paymentSettlement.update({
            where,
            data: { reference: value, updatedById },
          });
          entityType = "SETTLEMENT";
          break;
        case "receipt":
          await tx.clientReceipt.update({
            where,
            data: { reference: value, updatedById },
          });
          entityType = "CLIENT_RECEIPT";
          break;
        case "supplier-installment":
          await tx.paymentInstallment.update({
            where,
            data: { label: value, updatedById },
          });
          entityType = "INSTALLMENT";
          break;
        case "client-installment":
          await tx.clientPaymentInstallment.update({
            where,
            data: { label: value, updatedById },
          });
          entityType = "INSTALLMENT";
          break;
        case "building":
          await tx.building.update({
            where,
            data: { name: value, updatedById },
          });
          entityType = "BUILDING";
          break;
        case "room":
          await tx.room.update({ where, data: { name: value, updatedById } });
          entityType = "ROOM";
          break;
        case "item":
          await tx.item.update({ where, data: { name: value, updatedById } });
          entityType = "ITEM";
          break;
        case "package": {
          const row = await tx.orderPackage.findUniqueOrThrow({ where });
          if (
            await tx.orderPackage.count({
              where: {
                projectId: row.projectId,
                id: { not: id },
                name: { equals: value, mode: "insensitive" },
              },
            })
          )
            throw new Error("Duplicate package name.");
          await tx.orderPackage.update({
            where,
            data: { name: value, updatedById },
          });
          entityType = "ORDER_PACKAGE";
          break;
        }
      }
      await writeAuditEvent(tx, actor.id, {
        action: "UPDATED",
        entityType,
        entityId: id,
        entityReference: value,
        summary: "Updated the record name or reference inline.",
      });
    });
    revalidatePath("/", "layout");
    return { status: "success", message: "Row updated." };
  } catch {
    return {
      status: "error",
      message:
        "The row could not be saved. Check for a duplicate name or reference, or refresh if the record changed.",
    };
  }
}
