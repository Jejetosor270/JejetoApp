import "server-only";

import { Prisma } from "@/generated/prisma/client";
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

export async function deleteOrders(ids: string[]): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.procurementOrder.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    missingSelection(ids.length, records.length);
    await deleteOrderHierarchy(transaction, ids);
  });
}

export async function deleteInstallments(ids: string[]): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.paymentInstallment.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    missingSelection(ids.length, records.length);
    await transaction.paymentSettlement.deleteMany({
      where: { installmentId: { in: ids } },
    });
    const deleted = await transaction.paymentInstallment.deleteMany({
      where: { id: { in: ids } },
    });
    missingSelection(ids.length, deleted.count);
  });
}

export async function deleteSuppliers(ids: string[]): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.supplier.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    missingSelection(ids.length, records.length);
    const orders = await transaction.procurementOrder.findMany({
      where: { supplierId: { in: ids } },
      select: { id: true },
    });
    await transaction.supplierQuoteImport.deleteMany({
      where: { supplierId: { in: ids } },
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

export async function deleteProjects(ids: string[]): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.project.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    missingSelection(ids.length, records.length);
    const orders = await transaction.procurementOrder.findMany({
      where: { projectId: { in: ids } },
      select: { id: true },
    });
    await transaction.supplierQuoteImport.deleteMany({
      where: { projectId: { in: ids } },
    });
    await deleteOrderHierarchy(
      transaction,
      orders.map((order) => order.id),
    );
    await transaction.building.deleteMany({
      where: { projectId: { in: ids } },
    });
    const deleted = await transaction.project.deleteMany({
      where: { id: { in: ids } },
    });
    missingSelection(ids.length, deleted.count);
  });
}

export async function deleteClients(ids: string[]): Promise<void> {
  await destructiveTransaction(async (transaction) => {
    const records = await transaction.client.findMany({
      where: { id: { in: ids } },
      select: { id: true },
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
    await transaction.supplierQuoteImport.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await deleteOrderHierarchy(
      transaction,
      orders.map((order) => order.id),
    );
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
