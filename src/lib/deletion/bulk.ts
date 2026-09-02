import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { writeAuditEvent } from "@/lib/audit/events";
import { getDatabase } from "@/lib/db";

export class BulkDeletionError extends Error {}

function missingSelection(expected: number, actual: number): void {
  if (actual !== expected) {
    throw new BulkDeletionError(
      "One or more selected records no longer exist. Nothing was deleted; refresh and try again.",
    );
  }
}

async function deleteOrderHierarchy(
  transaction: Prisma.TransactionClient,
  orderIds: string[],
): Promise<void> {
  if (orderIds.length === 0) return;

  const orderWhere = { orderId: { in: orderIds } };
  await transaction.clientBillingAllocation.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await transaction.supplierQuoteImport.deleteMany({ where: orderWhere });
  await transaction.paymentSettlement.deleteMany({
    where: { installment: { orderId: { in: orderIds } } },
  });
  await transaction.paymentInstallment.deleteMany({ where: orderWhere });
  await transaction.procurementOrderBuilding.deleteMany({ where: orderWhere });
  await transaction.procurementOrderCostLine.deleteMany({ where: orderWhere });
  await transaction.procurementOrderVatEntry.deleteMany({ where: orderWhere });
  const deleted = await transaction.procurementOrder.deleteMany({
    where: { id: { in: orderIds } },
  });
  missingSelection(orderIds.length, deleted.count);
}

async function deleteClientBillingHierarchy(
  transaction: Prisma.TransactionClient,
  projectIds: string[],
): Promise<void> {
  if (projectIds.length === 0) return;
  const documents = await transaction.clientBillingDocument.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const documentIds = documents.map((document) => document.id);
  if (!documentIds.length) return;
  const installments = await transaction.clientPaymentInstallment.findMany({
    where: { billingDocumentId: { in: documentIds } },
    select: { id: true },
  });
  await transaction.clientBillingDocument.updateMany({
    where: {
      matchedInstallmentId: { in: installments.map((item) => item.id) },
    },
    data: { matchedInstallmentId: null },
  });
  await transaction.clientReceipt.deleteMany({
    where: { installmentId: { in: installments.map((item) => item.id) } },
  });
  await transaction.clientDocumentImport.deleteMany({
    where: { billingDocumentId: { in: documentIds } },
  });
  await transaction.clientBillingAllocation.deleteMany({
    where: { billingDocumentId: { in: documentIds } },
  });
  await transaction.clientPaymentInstallment.deleteMany({
    where: { billingDocumentId: { in: documentIds } },
  });
  await transaction.clientBillingDocument.updateMany({
    where: { supersedesDocumentId: { in: documentIds } },
    data: { supersedesDocumentId: null },
  });
  await transaction.clientBillingDocument.deleteMany({
    where: { id: { in: documentIds } },
  });
}

async function destructiveTransaction(
  operation: (transaction: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await getDatabase().$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2034")
    ) {
      throw new BulkDeletionError(
        "The selected records changed while deletion was running. Nothing was deleted; refresh and try again.",
      );
    }
    throw error;
  }
}

export async function deleteOrders(
  actorId: string,
  ids: string[],
): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.procurementOrder.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderNumber: true },
    });
    missingSelection(ids.length, records.length);
    for (const record of records) {
      await writeAuditEvent(transaction, actorId, {
        action: "DELETED",
        entityId: record.id,
        entityReference: record.orderNumber,
        entityType: "ORDER",
        summary: "Permanently deleted the Order and its dependent records.",
      });
    }
    await deleteOrderHierarchy(transaction, ids);
  });
}

export async function deleteInstallments(
  actorId: string,
  ids: string[],
): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.paymentInstallment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        label: true,
        order: { select: { orderNumber: true } },
      },
    });
    missingSelection(ids.length, records.length);
    for (const record of records) {
      await writeAuditEvent(transaction, actorId, {
        action: "DELETED",
        entityId: record.id,
        entityReference: `${record.order.orderNumber} · ${record.label}`,
        entityType: "INSTALLMENT",
        summary: "Permanently deleted the installment and its settlements.",
      });
    }
    await transaction.paymentSettlement.deleteMany({
      where: { installmentId: { in: ids } },
    });
    const deleted = await transaction.paymentInstallment.deleteMany({
      where: { id: { in: ids } },
    });
    missingSelection(ids.length, deleted.count);
  });
}

export async function deleteSuppliers(
  actorId: string,
  ids: string[],
): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.supplier.findMany({
      where: { id: { in: ids } },
      select: { displayName: true, id: true },
    });
    missingSelection(ids.length, records.length);
    const orders = await transaction.procurementOrder.findMany({
      where: { supplierId: { in: ids } },
      select: { id: true },
    });
    for (const record of records) {
      await writeAuditEvent(transaction, actorId, {
        action: "DELETED",
        entityId: record.id,
        entityReference: record.displayName,
        entityType: "SUPPLIER",
        metadata: { deletedOrderCount: orders.length },
        summary: "Permanently deleted the Supplier and its Order hierarchy.",
      });
    }
    await transaction.supplierQuoteImport.deleteMany({
      where: { supplierId: { in: ids } },
    });
    await transaction.projectFreightExpense.updateMany({
      where: { supplierId: { in: ids } },
      data: { supplierId: null },
    });
    await deleteOrderHierarchy(
      transaction,
      orders.map((order) => order.id),
    );
    const deleted = await transaction.supplier.deleteMany({
      where: { id: { in: ids } },
    });
    missingSelection(ids.length, deleted.count);
  });
}

export async function deleteProjects(
  actorId: string,
  ids: string[],
): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.project.findMany({
      where: { id: { in: ids } },
      select: { code: true, id: true },
    });
    missingSelection(ids.length, records.length);
    const orders = await transaction.procurementOrder.findMany({
      where: { projectId: { in: ids } },
      select: { id: true },
    });
    for (const record of records) {
      await writeAuditEvent(transaction, actorId, {
        action: "DELETED",
        entityId: record.id,
        entityReference: record.code,
        entityType: "PROJECT",
        summary: "Permanently deleted the Project and its complete hierarchy.",
      });
    }
    await transaction.supplierQuoteImport.deleteMany({
      where: { projectId: { in: ids } },
    });
    await deleteClientBillingHierarchy(transaction, ids);
    await deleteOrderHierarchy(
      transaction,
      orders.map((order) => order.id),
    );
    await transaction.item.deleteMany({ where: { projectId: { in: ids } } });
    await transaction.itemImport.deleteMany({
      where: { projectId: { in: ids } },
    });
    await transaction.projectFreightExpense.deleteMany({
      where: { projectId: { in: ids } },
    });
    await transaction.room.deleteMany({
      where: { building: { projectId: { in: ids } } },
    });
    await transaction.building.deleteMany({
      where: { projectId: { in: ids } },
    });
    const deleted = await transaction.project.deleteMany({
      where: { id: { in: ids } },
    });
    missingSelection(ids.length, deleted.count);
  });
}

export async function deleteClients(
  actorId: string,
  ids: string[],
): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.client.findMany({
      where: { id: { in: ids } },
      select: { displayName: true, id: true },
    });
    missingSelection(ids.length, records.length);
    const projects = await transaction.project.findMany({
      where: { clientId: { in: ids } },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    const orders = await transaction.procurementOrder.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    for (const record of records) {
      await writeAuditEvent(transaction, actorId, {
        action: "DELETED",
        entityId: record.id,
        entityReference: record.displayName,
        entityType: "CLIENT",
        summary:
          "Permanently deleted the Client and its complete Project hierarchy.",
      });
    }
    await transaction.supplierQuoteImport.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await deleteClientBillingHierarchy(transaction, projectIds);
    await deleteOrderHierarchy(
      transaction,
      orders.map((order) => order.id),
    );
    await transaction.item.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await transaction.itemImport.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await transaction.projectFreightExpense.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await transaction.room.deleteMany({
      where: { building: { projectId: { in: projectIds } } },
    });
    await transaction.building.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await transaction.project.deleteMany({
      where: { id: { in: projectIds } },
    });
    const deleted = await transaction.client.deleteMany({
      where: { id: { in: ids } },
    });
    missingSelection(ids.length, deleted.count);
  });
}
