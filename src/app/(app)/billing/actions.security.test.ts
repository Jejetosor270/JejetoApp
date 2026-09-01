import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireMasterDataEditor: vi.fn() }));
const billing = vi.hoisted(() => ({
  confirmClientBillingDocument: vi.fn(),
  recordClientReceipt: vi.fn(),
  updateClientBillingInline: vi.fn(),
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
  recordClientReceiptAction,
} from "./actions";

describe("Client billing authorization", () => {
  it.each([
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
  ])("rejects unauthorized %s before persistence", async (_label, invoke) => {
    auth.requireMasterDataEditor.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(invoke()).rejects.toThrow("Forbidden");
    expect(billing.confirmClientBillingDocument).not.toHaveBeenCalled();
    expect(billing.recordClientReceipt).not.toHaveBeenCalled();
  });
});
