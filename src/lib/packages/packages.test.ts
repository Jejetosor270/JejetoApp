import { beforeEach, expect, it, vi } from "vitest";
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  project: { findUnique: vi.fn() },
  orderPackage: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  procurementOrder: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    $transaction: (fn: (arg: typeof tx) => unknown) => fn(tx),
  }),
}));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: vi.fn() }));
import { writeAuditEvent } from "@/lib/audit/events";
import { assignPackage, savePackage } from "./packages";
beforeEach(() => vi.resetAllMocks());
it("creates a Package with server actor attribution and transactional audit", async () => {
  tx.project.findUnique.mockResolvedValue({ id: "project" });
  tx.orderPackage.create.mockResolvedValue({
    id: "package",
    name: "RH Bled",
    isActive: true,
  });
  await savePackage("actor", {
    projectId: "project",
    name: "RH Bled",
    operation: "save",
  });
  expect(tx.orderPackage.create).toHaveBeenCalledWith({
    data: {
      projectId: "project",
      name: "RH Bled",
      createdById: "actor",
      updatedById: "actor",
    },
  });
  expect(writeAuditEvent).toHaveBeenCalledWith(
    tx,
    "actor",
    expect.objectContaining({ entityType: "ORDER_PACKAGE", action: "CREATED" }),
  );
});
it("archives without changing Order assignments", async () => {
  tx.project.findUnique.mockResolvedValue({ id: "project" });
  tx.orderPackage.findFirst.mockResolvedValue({
    id: "package",
    name: "RH Bled",
  });
  tx.orderPackage.update.mockResolvedValue({
    id: "package",
    name: "RH Bled",
    isActive: false,
  });
  await savePackage("actor", {
    id: "package",
    projectId: "project",
    name: "RH Bled",
    operation: "archive",
  });
  expect(tx.procurementOrder.update).not.toHaveBeenCalled();
  expect(writeAuditEvent).toHaveBeenCalledWith(
    tx,
    "actor",
    expect.objectContaining({ action: "ARCHIVED" }),
  );
});
it("rejects foreign or archived Packages", async () => {
  tx.procurementOrder.findFirst.mockResolvedValue({
    id: "order",
    orderNumber: "RH",
    packageId: null,
  });
  tx.orderPackage.findFirst.mockResolvedValue(null);
  await expect(
    assignPackage("actor", {
      orderId: "order",
      projectId: "project",
      packageId: "foreign",
    }),
  ).rejects.toThrow("active Package");
  expect(tx.procurementOrder.update).not.toHaveBeenCalled();
});
it("audits reassignment and unassignment", async () => {
  tx.procurementOrder.findFirst.mockResolvedValue({
    id: "order",
    orderNumber: "RH",
    packageId: "old",
  });
  tx.orderPackage.findFirst.mockResolvedValue({ id: "new", name: "New" });
  await assignPackage("actor", {
    orderId: "order",
    projectId: "project",
    packageId: "new",
  });
  await assignPackage("actor", {
    orderId: "order",
    projectId: "project",
    packageId: null,
  });
  expect(tx.procurementOrder.update).toHaveBeenLastCalledWith({
    where: { id: "order" },
    data: { packageId: null, updatedById: "actor" },
  });
  expect(writeAuditEvent).toHaveBeenCalledTimes(2);
});
