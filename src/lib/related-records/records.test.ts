import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  projectOrders: vi.fn(),
  projectBilling: vi.fn(),
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
vi.mock("@/lib/procurement/orders", () => ({
  listProjectOrders: mock.projectOrders,
}));
vi.mock("@/lib/billing/billing", () => ({
  listProjectBillingDocuments: mock.projectBilling,
}));
vi.mock("@/lib/auth/current-user", () => ({
  canEditMasterData: (role: string) => role === "ADMIN" || role === "MANAGER",
  requireUser: mock.user,
}));
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
  mock.projectOrders.mockResolvedValue([]);
  mock.projectBilling.mockResolvedValue([]);
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
  expect(mock.projectOrders).toHaveBeenCalledWith(id);
  expect(mock.projectBilling).toHaveBeenCalledWith(id);
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

it("loads only the Project workspace tables and preserves edit/unassign controls without redundant cash queries", async () => {
  mock.user.mockResolvedValue({ id, role: "MANAGER" });
  mock.db.project.findUnique.mockResolvedValue({ client: party });
  const tables = await getProjectRelations(id, { includeCash: false });
  expect(tables.map((table) => table.id)).toEqual([
    "clients",
    "orders",
    "billing",
  ]);
  expect(tables.find((table) => table.id === "billing")).toMatchObject({
    editKind: "billing",
    removal: { kind: "assignment", relation: "billing-project", parentId: id },
  });
  for (const model of [
    mock.db.paymentInstallment,
    mock.db.clientPaymentInstallment,
    mock.db.paymentSettlement,
    mock.db.clientReceipt,
  ])
    expect(model.findMany).not.toHaveBeenCalled();
  expect(mock.projectOrders).toHaveBeenCalledTimes(1);
  expect(mock.projectBilling).toHaveBeenCalledTimes(1);
});

it("uses authoritative landed cost, sell and Supplier balances in Project Purchasing", async () => {
  mock.user.mockResolvedValue({ id, role: "MANAGER" });
  mock.projectOrders.mockResolvedValue([
    {
      id,
      orderNumber: "PO-1",
      packageName: "Old package",
      orderPackage: { name: "Reviewed package" },
      shortDescription: "Lighting package",
      supplier: party,
      status: "CONFIRMED",
      orderCurrencyCode: "USD",
      sellingCurrencyCode: "EUR",
      costs: { purchaseCost: "100", landedCost: "140" },
      totalSellingRevenue: "180",
      supplierPayment: { outstanding: "65", status: "PARTIALLY_PAID" },
    },
  ]);
  const result = (await getProjectRelations(id, { includeCash: false })).find(
    (table) => table.id === "orders",
  );
  expect(result).toMatchObject({
    editKind: "order",
    removal: { relation: "order-project", parentId: id },
    numericColumns: [3, 4, 5],
  });
  expect(result?.rows[0]).toMatchObject({
    href: `/orders/${id}?tab=related`,
    secondaryText: "Lighting package",
    cells: [
      "PO-1",
      "Reviewed package",
      "Party",
      "140.00 USD",
      "180.00 EUR",
      "65.00 USD",
      "Partially Paid",
    ],
  });
});

it("keeps Project Billing descriptions, explicit missing dates and plans outside collectible balances", async () => {
  const invoice = {
    id,
    reference: "INV-1",
    shortDescription: "Furniture deposit",
    documentType: "INVOICE",
    documentDate: "2026-10-01",
    dueDate: null,
    currencyCode: "EUR",
    totalHt: "100",
    totalTtc: "120",
    paid: "20",
    outstanding: "100",
    workflowStatus: "INVOICED",
    status: "PARTIALLY_PAID",
    isCancelled: false,
  };
  mock.projectBilling.mockResolvedValue([
    invoice,
    { ...invoice, id: "draft", workflowStatus: "DRAFT", status: "DRAFT" },
    {
      ...invoice,
      id: "quote",
      documentType: "QUOTE",
      status: "TO_BE_INVOICED",
    },
  ]);
  const result = (await getProjectRelations(id, { includeCash: false })).find(
    (table) => table.id === "billing",
  );
  expect(result?.rows[0]).toMatchObject({
    secondaryText: "Furniture deposit",
    cells: [
      "INV-1",
      "Invoice",
      "01/10/2026",
      "Date needed",
      "100.00 EUR",
      "20.00 EUR",
      "100.00 EUR",
      "Partially Paid",
    ],
  });
  for (const row of result?.rows.slice(1) ?? []) {
    expect(row.cells.slice(4, 7)).toEqual([
      "Not invoiced",
      "Not collectible",
      "Not collectible",
    ]);
  }
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
