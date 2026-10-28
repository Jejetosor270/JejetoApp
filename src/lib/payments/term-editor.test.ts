import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  supplierSource: vi.fn(),
  clientSource: vi.fn(),
  currencies: vi.fn(),
  summary: vi.fn(),
  billing: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mocks.authorize,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    paymentInstallment: { findUnique: mocks.supplierSource },
    clientPaymentInstallment: { findUnique: mocks.clientSource },
    currency: { findMany: mocks.currencies },
  }),
}));
vi.mock("@/lib/payments/payments", () => ({
  getOrderPaymentSummary: mocks.summary,
}));
vi.mock("@/lib/billing/billing", () => ({
  getClientBillingDocument: mocks.billing,
}));

import { loadPaymentTermEditorAction } from "@/app/(app)/payments/term-editor-actions";

const id = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ id: "actor" });
  mocks.currencies.mockResolvedValue([{ code: "EUR" }]);
});

it("authorizes before loading financial editor data", async () => {
  mocks.authorize.mockRejectedValue(new Error("Not authorized"));
  await expect(
    loadPaymentTermEditorAction({ kind: "supplier", id }),
  ).rejects.toThrow("Not authorized");
  expect(mocks.supplierSource).not.toHaveBeenCalled();
  expect(mocks.clientSource).not.toHaveBeenCalled();
});

it("rejects invalid record identifiers without reading records", async () => {
  const result = await loadPaymentTermEditorAction({
    kind: "supplier",
    id: "bad",
  });
  expect(result.data).toBeNull();
  expect(result.error).toContain("valid payment term");
  expect(mocks.supplierSource).not.toHaveBeenCalled();
});

it.each(["ACTIVE", "CANCELLED"])(
  "loads the authoritative Supplier editor and parent payment gate for %s Orders",
  async (status) => {
    mocks.supplierSource.mockResolvedValue({
      orderId: "order",
      order: { status },
    });
    const installment = {
      id,
      direction: "SUPPLIER_PAYMENT",
      editVersion: "version",
    };
    mocks.summary.mockResolvedValue({
      supplier: { baseAmount: "120.0000", installments: [installment] },
      client: { baseAmount: "150.0000", installments: [] },
    });
    const result = await loadPaymentTermEditorAction({ kind: "supplier", id });
    expect(result).toEqual({
      error: null,
      data: {
        kind: "supplier",
        installment,
        baseAmount: "120.0000",
        currencies: [{ code: "EUR" }],
        canPay: status !== "CANCELLED",
      },
    });
    expect(mocks.summary).toHaveBeenCalledWith("order");
  },
);

it("loads the owning Billing document and its exact term", async () => {
  mocks.clientSource.mockResolvedValue({ billingDocumentId: "billing" });
  const term = { id, editVersion: "version" };
  const document = { id: "billing", paymentInstallments: [term] };
  mocks.billing.mockResolvedValue(document);
  expect(await loadPaymentTermEditorAction({ kind: "client", id })).toEqual({
    error: null,
    data: { kind: "client", document, term },
  });
  expect(mocks.billing).toHaveBeenCalledWith("billing");
});

it("reports unavailable or failed reads without exposing database details", async () => {
  mocks.supplierSource.mockResolvedValue({ orderId: null, order: null });
  expect(
    (await loadPaymentTermEditorAction({ kind: "supplier", id })).data,
  ).toBeNull();
  mocks.supplierSource.mockRejectedValue(new Error("private SQL error"));
  const result = await loadPaymentTermEditorAction({ kind: "supplier", id });
  expect(result.data).toBeNull();
  expect(result.error).toBe(
    "The payment term could not be loaded. Please try again.",
  );
});
