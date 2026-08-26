import "server-only";

import {
  Prisma,
  ProcurementOrderStatus,
  ProjectStatus,
} from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

export class BulkDeletionError extends Error {}

function missingSelection(expected: number, actual: number): void {
  if (actual !== expected) {
    throw new BulkDeletionError(
      "One or more selected records no longer exist. Refresh and try again.",
    );
  }
}

function blockedNames(names: string[]): string {
  const visible = names.slice(0, 4).join(", ");
  return names.length > 4
    ? `${visible}, and ${names.length - 4} more`
    : visible;
}

export async function archiveClients(
  actorId: string,
  ids: string[],
): Promise<void> {
  await getDatabase().$transaction(async (transaction) => {
    const records = await transaction.client.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    missingSelection(ids.length, records.length);
    await transaction.client.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false, updatedById: actorId },
    });
  });
}

export async function archiveSuppliers(
  actorId: string,
  ids: string[],
): Promise<void> {
  await getDatabase().$transaction(async (transaction) => {
    const records = await transaction.supplier.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    missingSelection(ids.length, records.length);
    await transaction.supplier.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false, updatedById: actorId },
    });
  });
}

export async function archiveProjects(
  actorId: string,
  ids: string[],
): Promise<void> {
  await getDatabase().$transaction(async (transaction) => {
    const records = await transaction.project.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    missingSelection(ids.length, records.length);
    await transaction.project.updateMany({
      where: { id: { in: ids } },
      data: { status: ProjectStatus.ARCHIVED, updatedById: actorId },
    });
  });
}

export async function deleteUnpaidInstallments(ids: string[]): Promise<void> {
  try {
    await getDatabase().$transaction(
      async (transaction) => {
        const records = await transaction.paymentInstallment.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            label: true,
            _count: { select: { settlements: true } },
          },
        });
        missingSelection(ids.length, records.length);
        const blocked = records.filter(
          (record) => record._count.settlements > 0,
        );
        if (blocked.length) {
          throw new BulkDeletionError(
            `Cannot delete installments with recorded payments or receipts: ${blockedNames(blocked.map((record) => record.label))}. Cancel or correct the settlement instead.`,
          );
        }
        await transaction.paymentInstallment.deleteMany({
          where: { id: { in: ids }, settlements: { none: {} } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2034")
    ) {
      throw new BulkDeletionError(
        "A selected installment gained a settlement while deletion was running. Nothing was deleted; refresh and try again.",
      );
    }
    throw error;
  }
}

export async function deleteDraftOrders(ids: string[]): Promise<void> {
  try {
    await getDatabase().$transaction(
      async (transaction) => {
        const records = await transaction.procurementOrder.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            _count: {
              select: { paymentInstallments: true, quoteImports: true },
            },
          },
        });
        missingSelection(ids.length, records.length);
        const blocked = records.filter(
          (record) =>
            record.status !== ProcurementOrderStatus.DRAFT ||
            record._count.paymentInstallments > 0 ||
            record._count.quoteImports > 0,
        );
        if (blocked.length) {
          throw new BulkDeletionError(
            `Only pristine Draft Orders without payments or quote-import history can be deleted. Blocked: ${blockedNames(blocked.map((record) => record.orderNumber))}.`,
          );
        }
        const where = { orderId: { in: ids } };
        await transaction.procurementOrderBuilding.deleteMany({ where });
        await transaction.procurementOrderCostLine.deleteMany({ where });
        await transaction.procurementOrderVatEntry.deleteMany({ where });
        await transaction.procurementOrder.deleteMany({
          where: { id: { in: ids }, status: ProcurementOrderStatus.DRAFT },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2034")
    ) {
      throw new BulkDeletionError(
        "A selected Order gained protected financial or history records while deletion was running. Nothing was deleted; refresh and try again.",
      );
    }
    throw error;
  }
}
