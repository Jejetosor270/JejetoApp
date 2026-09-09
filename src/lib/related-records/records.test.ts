import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  db: {
    project: { findUnique: vi.fn() },
    procurementOrder: { findMany: vi.fn(), findUnique: vi.fn() },
    clientBillingDocument: { findMany: vi.fn(), findUnique: vi.fn() },
    paymentInstallment: { findMany: vi.fn() },
    clientPaymentInstallment: { findMany: vi.fn() },
    paymentSettlement: { findMany: vi.fn() },
    clientReceipt: { findMany: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => mock.db }));
vi.mock("@/lib/auth/current-user", () => ({ requireUser: mock.user }));
import {
  getProjectRelations,
  getOrderRelations,
  getBillingRelations,
} from "./records";

const id = "11111111-1111-4111-8111-111111111111";
const project = {
  id,
  name: "Project A",
  code: "PA",
  status: "ACTIVE",
  reportingCurrencyCode: "EUR",
};
const party = { id, displayName: "Party", isActive: true };
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ id, role: "USER" });
  for (const model of Object.values(mock.db))
    if ("findMany" in model) model.findMany.mockResolvedValue([]);
});

it("scopes Project tables to its Orders, Billing, installments and actual cash with no aggregation", async () => {
  mock.db.project.findUnique.mockResolvedValue({ client: party });
  const tables = await getProjectRelations(id);
  expect(tables.map((t) => t.id)).toEqual([
    "clients",
    "orders",
    "billing",
    "payments",
    "receipts",
    "supplier-installments",
    "client-installments",
  ]);
  expect(mock.db.procurementOrder.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { projectId: id } }),
  );
  expect(mock.db.paymentSettlement.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        installment: {
          direction: "SUPPLIER_PAYMENT",
          order: { projectId: id },
        },
      },
    }),
  );
  expect(mock.db.clientReceipt.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { billingDocument: { projectId: id } } }),
  );
  expect(mock.user).toHaveBeenCalled();
});

it("never places linked Billing receipts or Client installments on Orders", async () => {
  mock.db.procurementOrder.findUnique.mockResolvedValue({
    project,
    supplier: party,
    buildings: [],
    clientBillingAllocations: [],
  });
  const tables = await getOrderRelations(id);
  expect(tables.map((t) => t.id)).toEqual([
    "projects",
    "suppliers",
    "buildings",
    "payments",
    "supplier-installments",
    "billing",
  ]);
  expect(tables[0]?.rows[0]?.href).toBe(`/projects/${id}?tab=related`);
  expect(mock.db.clientReceipt.findMany).not.toHaveBeenCalled();
  expect(mock.db.clientPaymentInstallment.findMany).not.toHaveBeenCalled();
});

it("includes a matched Quote installment and its receipts through one deduplicating database query", async () => {
  const matchedId = "22222222-2222-4222-8222-222222222222";
  mock.db.clientBillingDocument.findUnique.mockResolvedValue({
    project,
    client: party,
    matchedInstallmentId: matchedId,
    supersedesDocument: null,
    revisions: [],
  });
  await getBillingRelations(id);
  expect(mock.db.clientPaymentInstallment.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { OR: [{ billingDocumentId: id }, { id: matchedId }] },
    }),
  );
  expect(mock.db.clientReceipt.findMany).toHaveBeenCalledTimes(1);
  expect(mock.db.clientReceipt.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { OR: [{ billingDocumentId: id }, { installmentId: matchedId }] },
    }),
  );
});

it("rejects unauthenticated reads before accessing business records", async () => {
  mock.user.mockRejectedValue(new Error("Sign in required"));
  await expect(getProjectRelations(id)).rejects.toThrow("Sign in required");
  expect(mock.db.project.findUnique).not.toHaveBeenCalled();
});

it("rejects malformed IDs before querying relations", async () => {
  await expect(getOrderRelations("not-an-id")).rejects.toThrow();
  expect(mock.db.procurementOrder.findUnique).not.toHaveBeenCalled();
});
