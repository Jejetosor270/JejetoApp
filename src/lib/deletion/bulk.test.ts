import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => ({
  client: { findMany: vi.fn(), updateMany: vi.fn() },
  paymentInstallment: { deleteMany: vi.fn(), findMany: vi.fn() },
  procurementOrder: { deleteMany: vi.fn(), findMany: vi.fn() },
  procurementOrderBuilding: { deleteMany: vi.fn() },
  procurementOrderCostLine: { deleteMany: vi.fn() },
  procurementOrderVatEntry: { deleteMany: vi.fn() },
  project: { findMany: vi.fn(), updateMany: vi.fn() },
  supplier: { findMany: vi.fn(), updateMany: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import {
  archiveClients,
  archiveProjects,
  archiveSuppliers,
  deleteDraftOrders,
  deleteUnpaidInstallments,
} from "@/lib/deletion/bulk";

const firstId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const secondId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";

describe("transactional bulk deletion policies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives Client, Supplier, and Project master data instead of deleting it", async () => {
    transaction.client.findMany.mockResolvedValue([{ id: firstId }]);
    transaction.supplier.findMany.mockResolvedValue([{ id: firstId }]);
    transaction.project.findMany.mockResolvedValue([{ id: firstId }]);

    await archiveClients("actor-1", [firstId]);
    await archiveSuppliers("actor-1", [firstId]);
    await archiveProjects("actor-1", [firstId]);

    expect(transaction.client.updateMany).toHaveBeenCalledWith({
      data: { isActive: false, updatedById: "actor-1" },
      where: { id: { in: [firstId] } },
    });
    expect(transaction.supplier.updateMany).toHaveBeenCalledWith({
      data: { isActive: false, updatedById: "actor-1" },
      where: { id: { in: [firstId] } },
    });
    expect(transaction.project.updateMany).toHaveBeenCalledWith({
      data: { status: "ARCHIVED", updatedById: "actor-1" },
      where: { id: { in: [firstId] } },
    });
  });

  it("deletes only pristine Draft Orders and their owned configuration", async () => {
    transaction.procurementOrder.findMany.mockResolvedValue([
      {
        _count: { paymentInstallments: 0, quoteImports: 0 },
        id: firstId,
        orderNumber: "PO-DRAFT",
        status: "DRAFT",
      },
    ]);

    await deleteDraftOrders([firstId]);

    expect(transaction.procurementOrderBuilding.deleteMany).toHaveBeenCalled();
    expect(transaction.procurementOrderCostLine.deleteMany).toHaveBeenCalled();
    expect(transaction.procurementOrderVatEntry.deleteMany).toHaveBeenCalled();
    expect(transaction.procurementOrder.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [firstId] }, status: "DRAFT" },
    });
  });

  it("blocks the entire Order selection when any Order has protected history", async () => {
    transaction.procurementOrder.findMany.mockResolvedValue([
      {
        _count: { paymentInstallments: 0, quoteImports: 0 },
        id: firstId,
        orderNumber: "PO-DRAFT",
        status: "DRAFT",
      },
      {
        _count: { paymentInstallments: 1, quoteImports: 0 },
        id: secondId,
        orderNumber: "PO-HISTORY",
        status: "DRAFT",
      },
    ]);

    await expect(deleteDraftOrders([firstId, secondId])).rejects.toThrow(
      "PO-HISTORY",
    );
    expect(transaction.procurementOrder.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes unpaid installments and blocks any selection containing a settlement", async () => {
    transaction.paymentInstallment.findMany.mockResolvedValue([
      { _count: { settlements: 0 }, id: firstId, label: "Deposit" },
    ]);
    await deleteUnpaidInstallments([firstId]);
    expect(transaction.paymentInstallment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [firstId] }, settlements: { none: {} } },
    });

    vi.clearAllMocks();
    transaction.paymentInstallment.findMany.mockResolvedValue([
      { _count: { settlements: 0 }, id: firstId, label: "Deposit" },
      { _count: { settlements: 1 }, id: secondId, label: "Paid balance" },
    ]);
    await expect(deleteUnpaidInstallments([firstId, secondId])).rejects.toThrow(
      "Paid balance",
    );
    expect(transaction.paymentInstallment.deleteMany).not.toHaveBeenCalled();
  });

  it("fails safely when any selected record no longer exists", async () => {
    transaction.client.findMany.mockResolvedValue([{ id: firstId }]);
    await expect(
      archiveClients("actor-1", [firstId, secondId]),
    ).rejects.toThrow("no longer exist");
    expect(transaction.client.updateMany).not.toHaveBeenCalled();
  });
});
