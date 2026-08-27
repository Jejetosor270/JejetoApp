import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => ({
  building: { deleteMany: vi.fn() },
  item: { deleteMany: vi.fn() },
  itemImport: { deleteMany: vi.fn() },
  room: { deleteMany: vi.fn() },
  client: { deleteMany: vi.fn(), findMany: vi.fn() },
  paymentInstallment: { deleteMany: vi.fn(), findMany: vi.fn() },
  paymentSettlement: { deleteMany: vi.fn() },
  procurementOrder: { deleteMany: vi.fn(), findMany: vi.fn() },
  procurementOrderBuilding: { deleteMany: vi.fn() },
  procurementOrderCostLine: { deleteMany: vi.fn() },
  procurementOrderVatEntry: { deleteMany: vi.fn() },
  project: { deleteMany: vi.fn(), findMany: vi.fn() },
  supplier: { deleteMany: vi.fn(), findMany: vi.fn() },
  supplierQuoteImport: { deleteMany: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: vi.fn() }));

import {
  deleteClients,
  deleteInstallments,
  deleteOrders,
  deleteProjects,
  deleteSuppliers,
} from "@/lib/deletion/bulk";

const firstId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const secondId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";
const orderId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";
const secondOrderId = "d12b6b9b-10e9-4e42-b93f-38796de4f65a";

function expectOrderHierarchyDeleted(ids: string[]): void {
  expect(transaction.supplierQuoteImport.deleteMany).toHaveBeenCalledWith({
    where: { orderId: { in: ids } },
  });
  expect(transaction.paymentSettlement.deleteMany).toHaveBeenCalledWith({
    where: { installment: { orderId: { in: ids } } },
  });
  expect(transaction.paymentInstallment.deleteMany).toHaveBeenCalledWith({
    where: { orderId: { in: ids } },
  });
  expect(transaction.procurementOrderBuilding.deleteMany).toHaveBeenCalledWith({
    where: { orderId: { in: ids } },
  });
  expect(transaction.procurementOrderCostLine.deleteMany).toHaveBeenCalledWith({
    where: { orderId: { in: ids } },
  });
  expect(transaction.procurementOrderVatEntry.deleteMany).toHaveBeenCalledWith({
    where: { orderId: { in: ids } },
  });
  expect(transaction.procurementOrder.deleteMany).toHaveBeenCalledWith({
    where: { id: { in: ids } },
  });
}

describe("transactional populated-hierarchy deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of Object.values(transaction)) {
      if ("deleteMany" in model)
        model.deleteMany.mockResolvedValue({ count: 1 });
    }
  });

  it("deletes a populated Order and all Order-owned records", async () => {
    transaction.procurementOrder.findMany.mockResolvedValue([
      { id: firstId, orderNumber: "PO-1" },
    ]);

    await deleteOrders("actor-1", [firstId]);

    expectOrderHierarchyDeleted([firstId]);
    expect(transaction.supplier.deleteMany).not.toHaveBeenCalled();
    expect(transaction.project.deleteMany).not.toHaveBeenCalled();
    expect(transaction.client.deleteMany).not.toHaveBeenCalled();
    expect(transaction.building.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes settlements before deleting selected installments", async () => {
    transaction.paymentInstallment.findMany.mockResolvedValue([
      { id: firstId, label: "Deposit", order: { orderNumber: "PO-1" } },
      { id: secondId, label: "Balance", order: { orderNumber: "PO-1" } },
    ]);
    transaction.paymentInstallment.deleteMany.mockResolvedValue({ count: 2 });

    await deleteInstallments("actor-1", [firstId, secondId]);

    expect(transaction.paymentSettlement.deleteMany).toHaveBeenCalledWith({
      where: { installmentId: { in: [firstId, secondId] } },
    });
    expect(transaction.paymentInstallment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [firstId, secondId] } },
    });
  });

  it("deletes a Supplier's multiple Orders and preserves Projects and Clients", async () => {
    transaction.supplier.findMany.mockResolvedValue([
      { displayName: "Supplier", id: firstId },
    ]);
    transaction.procurementOrder.findMany.mockResolvedValue([
      { id: orderId },
      { id: secondOrderId },
    ]);
    transaction.procurementOrder.deleteMany.mockResolvedValue({ count: 2 });

    await deleteSuppliers("actor-1", [firstId]);

    expect(transaction.supplierQuoteImport.deleteMany).toHaveBeenCalledWith({
      where: { supplierId: { in: [firstId] } },
    });
    expectOrderHierarchyDeleted([orderId, secondOrderId]);
    expect(transaction.supplier.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [firstId] } },
    });
    expect(transaction.project.deleteMany).not.toHaveBeenCalled();
    expect(transaction.client.deleteMany).not.toHaveBeenCalled();
    expect(transaction.building.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes a Project's Buildings and Order hierarchy but preserves Client and Suppliers", async () => {
    transaction.project.findMany.mockResolvedValue([
      { code: "PRJ", id: firstId },
    ]);
    transaction.procurementOrder.findMany.mockResolvedValue([{ id: orderId }]);

    await deleteProjects("actor-1", [firstId]);

    expect(transaction.supplierQuoteImport.deleteMany).toHaveBeenCalledWith({
      where: { projectId: { in: [firstId] } },
    });
    expectOrderHierarchyDeleted([orderId]);
    expect(transaction.building.deleteMany).toHaveBeenCalledWith({
      where: { projectId: { in: [firstId] } },
    });
    expect(transaction.project.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [firstId] } },
    });
    expect(transaction.client.deleteMany).not.toHaveBeenCalled();
    expect(transaction.supplier.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes a Client's complete Project hierarchy but preserves Suppliers", async () => {
    transaction.client.findMany.mockResolvedValue([
      { displayName: "Client", id: firstId },
    ]);
    transaction.project.findMany.mockResolvedValue([
      { id: firstId },
      { id: secondId },
    ]);
    transaction.procurementOrder.findMany.mockResolvedValue([{ id: orderId }]);
    transaction.project.deleteMany.mockResolvedValue({ count: 2 });

    await deleteClients("actor-1", [firstId]);

    expect(transaction.supplierQuoteImport.deleteMany).toHaveBeenCalledWith({
      where: { projectId: { in: [firstId, secondId] } },
    });
    expectOrderHierarchyDeleted([orderId]);
    expect(transaction.building.deleteMany).toHaveBeenCalledWith({
      where: { projectId: { in: [firstId, secondId] } },
    });
    expect(transaction.project.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [firstId, secondId] } },
    });
    expect(transaction.client.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [firstId] } },
    });
    expect(transaction.supplier.deleteMany).not.toHaveBeenCalled();
  });

  it("runs bulk deletion in one serializable transaction", async () => {
    transaction.procurementOrder.findMany.mockResolvedValue([
      { id: firstId, orderNumber: "PO-1" },
      { id: secondId, orderNumber: "PO-2" },
    ]);
    transaction.procurementOrder.deleteMany.mockResolvedValue({ count: 2 });

    await deleteOrders("actor-1", [firstId, secondId]);

    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expectOrderHierarchyDeleted([firstId, secondId]);
  });

  it("stops before parent deletion when a child deletion fails so the transaction can roll back", async () => {
    transaction.procurementOrder.findMany.mockResolvedValue([
      { id: firstId, orderNumber: "PO-1" },
    ]);
    transaction.paymentSettlement.deleteMany.mockRejectedValue(
      new Error("database failure"),
    );

    await expect(deleteOrders("actor-1", [firstId])).rejects.toThrow(
      "database failure",
    );
    expect(transaction.paymentInstallment.deleteMany).not.toHaveBeenCalled();
    expect(transaction.procurementOrder.deleteMany).not.toHaveBeenCalled();
  });

  it("fails safely when any selected record no longer exists", async () => {
    transaction.client.findMany.mockResolvedValue([
      { displayName: "Client", id: firstId },
    ]);

    await expect(deleteClients("actor-1", [firstId, secondId])).rejects.toThrow(
      "no longer exist",
    );
    expect(transaction.project.findMany).not.toHaveBeenCalled();
    expect(transaction.client.deleteMany).not.toHaveBeenCalled();
  });
});
