import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  authorize: vi.fn(),
  orders: vi.fn(),
  billing: vi.fn(),
  currencies: vi.fn(),
  order: vi.fn(),
  summary: vi.fn(),
  document: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mock.authorize,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    procurementOrder: { findMany: mock.orders },
    clientBillingDocument: { findMany: mock.billing },
    currency: { findMany: mock.currencies },
  }),
}));
vi.mock("@/lib/procurement/orders", () => ({ getOrder: mock.order }));
vi.mock("@/lib/payments/payments", () => ({
  getOrderPaymentSummary: mock.summary,
}));
vi.mock("@/lib/billing/billing", () => ({
  getClientBillingDocument: mock.document,
}));
import { loadRelatedCreation } from "./create-actions";
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.resetAllMocks();
  mock.orders.mockResolvedValue([
    { id, orderNumber: "O1", packageName: "Furniture" },
  ]);
  mock.billing.mockResolvedValue([
    { id, reference: "INV1", documentType: "INVOICE" },
  ]);
  mock.currencies.mockResolvedValue([{ code: "EUR" }]);
  mock.order.mockResolvedValue({ project: { reportingCurrencyCode: "EUR" } });
  mock.summary.mockResolvedValue({
    supplier: { baseAmount: "1200", installments: [] },
  });
  mock.document.mockResolvedValue({ id });
});
it("authorizes before reading documents", async () => {
  mock.authorize.mockRejectedValue(new Error("Forbidden"));
  await expect(
    loadRelatedCreation({ kind: "project", id }, "payment"),
  ).rejects.toThrow("Forbidden");
  expect(mock.orders).not.toHaveBeenCalled();
});
it("preselects the current Order and its authoritative supplier basis", async () => {
  const result = await loadRelatedCreation(
    { kind: "order", id },
    "supplier-installment",
  );
  expect(mock.orders).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id, status: { not: "CANCELLED" } } }),
  );
  expect(result.data?.form).toMatchObject({
    type: "supplier",
    orderId: id,
    summary: { baseAmount: "1200" },
  });
});
it("requires a choice when a Project has several Orders", async () => {
  mock.orders.mockResolvedValue([
    { id, orderNumber: "O1" },
    { id: otherId, orderNumber: "O2" },
  ]);
  const result = await loadRelatedCreation({ kind: "project", id }, "payment");
  expect(mock.orders).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId: id, status: { not: "CANCELLED" } },
    }),
  );
  expect(result.data?.form).toBeNull();
  expect(mock.summary).not.toHaveBeenCalled();
});
it("rejects a selected document outside the Related scope", async () => {
  const result = await loadRelatedCreation(
    { kind: "project", id },
    "receipt",
    otherId,
  );
  expect(result.data).toBeNull();
  expect(mock.document).not.toHaveBeenCalled();
});
it("limits Order receipts to linked active Invoices", async () => {
  await loadRelatedCreation({ kind: "order", id }, "receipt");
  expect(mock.billing).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        allocations: { some: { orderId: id } },
        isCancelled: false,
        documentType: "INVOICE",
      },
    }),
  );
});
it("does not offer duplicate schedules on matched Invoices", async () => {
  await loadRelatedCreation({ kind: "billing", id }, "client-installment");
  expect(mock.billing).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id, isCancelled: false, matchedInstallmentId: null },
    }),
  );
});
