import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  audit: vi.fn(),
  refresh: vi.fn(),
  tx: {
    paymentInstallment: { findUnique: vi.fn() },
    paymentSettlement: { create: vi.fn() },
    clientBillingDocument: { findUnique: vi.fn() },
    clientPaymentInstallment: { findUnique: vi.fn() },
    clientReceipt: { create: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mocks.auth,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    $transaction: async (callback: (tx: typeof mocks.tx) => Promise<unknown>) =>
      callback(mocks.tx),
  }),
}));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/reporting/revalidation", () => ({
  revalidateProjectFinancialViews: vi.fn(),
}));
vi.mock("@/lib/payments/receipt-entry", () => ({
  receiptEntryOptions: vi.fn(),
}));
import {
  recordReceiptEntryAction,
  loadReceiptEntryOptions,
} from "./receipt-actions";
import { recordSettlementAction } from "./actions";
import { recordClientReceiptAction } from "@/app/(app)/billing/actions";

const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const orderId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";
const billingDocumentId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";
const installmentId = "d12b6b9b-10e9-4e42-b93f-38796de4f65a";
const otherId = "e12b6b9b-10e9-4e42-b93f-38796de4f65a";
const initial = { status: "idle" as const, message: "" };
function form(type = "SUPPLIER", overrides: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    type,
    projectId,
    orderId,
    billingDocumentId,
    installmentId,
    amount: "20",
    settledAt: "2026-09-06",
    receivedAt: "2026-09-06",
    reference: "Bank transfer",
    notes: "Partial",
    ...overrides,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: "actor", role: "MANAGER" });
  mocks.tx.paymentInstallment.findUnique.mockResolvedValue({
    id: installmentId,
    orderId,
    direction: "SUPPLIER_PAYMENT",
    order: { projectId, project: { reportingCurrencyCode: "EUR" } },
    currencyCode: "EUR",
    label: "Deposit",
    isCancelled: false,
    scheduledAmount: "100",
    settlements: [{ amount: "40" }],
  });
  mocks.tx.clientBillingDocument.findUnique.mockResolvedValue({
    documentType: "INVOICE",
    id: billingDocumentId,
    projectId,
    reference: "INV-1",
    project: { reportingCurrencyCode: "EUR" },
    currencyCode: "EUR",
    totalTtc: "100",
    receipts: [{ amount: "40" }],
    matchedInstallment: null,
  });
  mocks.tx.clientPaymentInstallment.findUnique.mockResolvedValue({
    currencyCode: "EUR",
    id: installmentId,
    billingDocumentId,
    scheduledAmount: "100",
    receipts: [{ amount: "40" }],
  });
  mocks.tx.paymentSettlement.create.mockResolvedValue({ id: "settlement" });
  mocks.tx.clientReceipt.create.mockResolvedValue({ id: "receipt" });
});

describe("central receipt entry uses existing authorities", () => {
  it("records Supplier cash out through settlement persistence and audit", async () => {
    expect((await recordReceiptEntryAction(initial, form())).status).toBe(
      "success",
    );
    expect(mocks.tx.paymentSettlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installmentId,
        amount: "20.0000",
        createdById: "actor",
      }),
    });
    expect(mocks.tx.clientReceipt.create).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      mocks.tx,
      "actor",
      expect.objectContaining({ entityType: "SETTLEMENT" }),
    );
    expect(mocks.refresh).toHaveBeenCalledWith("/payments");
  });
  it.each([installmentId, ""])(
    "records Client cash in, including optional installment %s",
    async (id) => {
      expect(
        (
          await recordReceiptEntryAction(
            initial,
            form("CLIENT", { installmentId: id }),
          )
        ).status,
      ).toBe("success");
      expect(mocks.tx.clientReceipt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          billingDocumentId,
          installmentId: id || null,
          amount: "20.0000",
          createdById: "actor",
        }),
      });
      expect(mocks.tx.paymentSettlement.create).not.toHaveBeenCalled();
      expect(mocks.audit).toHaveBeenCalledWith(
        mocks.tx,
        "actor",
        expect.objectContaining({ entityType: "CLIENT_RECEIPT" }),
      );
    },
  );
  it.each(["SUPPLIER", "CLIENT"])(
    "rejects cross-Project %s records",
    async (type) => {
      expect(
        (
          await recordReceiptEntryAction(
            initial,
            form(type, { projectId: otherId }),
          )
        ).status,
      ).toBe("error");
      expect(mocks.tx.paymentSettlement.create).not.toHaveBeenCalled();
      expect(mocks.tx.clientReceipt.create).not.toHaveBeenCalled();
    },
  );
  it("rejects an installment of another Order and legacy Client direction", async () => {
    expect(
      (
        await recordReceiptEntryAction(
          initial,
          form("SUPPLIER", { orderId: otherId }),
        )
      ).status,
    ).toBe("error");
    mocks.tx.paymentInstallment.findUnique.mockResolvedValueOnce({
      orderId,
      direction: "CLIENT_RECEIPT",
      order: { projectId },
    });
    expect((await recordReceiptEntryAction(initial, form())).status).toBe(
      "error",
    );
    expect(mocks.tx.paymentSettlement.create).not.toHaveBeenCalled();
  });
  it("rejects an installment of another Billing", async () => {
    mocks.tx.clientPaymentInstallment.findUnique.mockResolvedValueOnce({
      billingDocumentId: otherId,
    });
    expect(
      (await recordReceiptEntryAction(initial, form("CLIENT"))).status,
    ).toBe("error");
    expect(mocks.tx.clientReceipt.create).not.toHaveBeenCalled();
  });
  it.each(["SUPPLIER", "CLIENT"])(
    "retains %s overpayment safeguards",
    async (type) => {
      const result = await recordReceiptEntryAction(
        initial,
        form(type, { amount: "61" }),
      );
      expect(result.status).toBe("error");
      expect(result.message).toContain("exceed");
      expect(mocks.tx.paymentSettlement.create).not.toHaveBeenCalled();
      expect(mocks.tx.clientReceipt.create).not.toHaveBeenCalled();
    },
  );
  it("checks permissions before loading context or writing", async () => {
    mocks.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(recordReceiptEntryAction(initial, form())).rejects.toThrow(
      "Forbidden",
    );
    await expect(loadReceiptEntryOptions(projectId)).rejects.toThrow(
      "Forbidden",
    );
    expect(mocks.tx.paymentInstallment.findUnique).not.toHaveBeenCalled();
  });
  it("keeps contextual Order and Billing creation paths working", async () => {
    expect((await recordSettlementAction(initial, form())).status).toBe(
      "success",
    );
    expect(
      (await recordClientReceiptAction(initial, form("CLIENT"))).status,
    ).toBe("success");
    expect(mocks.tx.paymentSettlement.create).toHaveBeenCalledOnce();
    expect(mocks.tx.clientReceipt.create).toHaveBeenCalledOnce();
  });
});
