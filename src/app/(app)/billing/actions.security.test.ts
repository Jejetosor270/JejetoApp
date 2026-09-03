import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireMasterDataEditor: vi.fn() }));
const billing = vi.hoisted(() => ({
  confirmClientBillingDocument: vi.fn(),
  createClientBillingInstallment: vi.fn(),
  deleteClientBillingInstallment: vi.fn(),
  deleteClientReceipt: vi.fn(),
  recordClientReceipt: vi.fn(),
  updateClientBillingAllocations: vi.fn(),
  updateClientBillingDocument: vi.fn(),
  updateClientBillingInstallment: vi.fn(),
  updateClientBillingInline: vi.fn(),
  updateClientReceipt: vi.fn(),
  updateOrderBillingLink: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/billing/billing", () => ({
  ...billing,
  ClientBillingNotFoundError: class extends Error {},
  ClientBillingValidationError: class extends Error {},
}));

import {
  confirmClientDocumentAction,
  createClientBillingInstallmentAction,
  deleteClientBillingInstallmentAction,
  deleteClientReceiptAction,
  recordClientReceiptAction,
  updateClientBillingAllocationsAction,
  updateClientBillingDocumentAction,
  updateClientBillingInstallmentAction,
  updateClientReceiptAction,
  updateOrderBillingLinkAction,
} from "./actions";

describe("Client billing authorization", () => {
  it.each([
    [
      "Billing installment creation",
      () =>
        createClientBillingInstallmentAction(
          { message: "", status: "idle" },
          new FormData(),
        ),
    ],
    [
      "Billing installment removal",
      () => deleteClientBillingInstallmentAction(new FormData()),
    ],
    [
      "confirmation",
      () =>
        confirmClientDocumentAction(
          { message: "", status: "idle" },
          new FormData(),
        ),
    ],
    [
      "receipt",
      () =>
        recordClientReceiptAction(
          { message: "", status: "idle" },
          new FormData(),
        ),
    ],
    [
      "receipt edit",
      () =>
        updateClientReceiptAction(
          { message: "", status: "idle" },
          new FormData(),
        ),
    ],
    ["receipt removal", () => deleteClientReceiptAction(new FormData())],
    [
      "Billing edit",
      () =>
        updateClientBillingDocumentAction(
          { message: "", status: "idle" },
          new FormData(),
        ),
    ],
    [
      "Billing installment edit",
      () =>
        updateClientBillingInstallmentAction(
          { message: "", status: "idle" },
          new FormData(),
        ),
    ],
    [
      "Billing allocations",
      () =>
        updateClientBillingAllocationsAction(
          { message: "", status: "idle" },
          new FormData(),
        ),
    ],
    [
      "Order-side Billing link",
      () =>
        updateOrderBillingLinkAction(
          { message: "", status: "idle" },
          new FormData(),
        ),
    ],
  ])("rejects unauthorized %s before persistence", async (_label, invoke) => {
    auth.requireMasterDataEditor.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(invoke()).rejects.toThrow("Forbidden");
    expect(billing.confirmClientBillingDocument).not.toHaveBeenCalled();
    expect(billing.createClientBillingInstallment).not.toHaveBeenCalled();
    expect(billing.deleteClientBillingInstallment).not.toHaveBeenCalled();
    expect(billing.deleteClientReceipt).not.toHaveBeenCalled();
    expect(billing.recordClientReceipt).not.toHaveBeenCalled();
    expect(billing.updateClientBillingDocument).not.toHaveBeenCalled();
    expect(billing.updateClientBillingInstallment).not.toHaveBeenCalled();
    expect(billing.updateClientReceipt).not.toHaveBeenCalled();
    expect(billing.updateClientBillingAllocations).not.toHaveBeenCalled();
    expect(billing.updateOrderBillingLink).not.toHaveBeenCalled();
  });
});
