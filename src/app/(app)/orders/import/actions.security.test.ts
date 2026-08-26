import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireMasterDataEditor: vi.fn() }));
const confirmation = vi.hoisted(() => ({ confirmSupplierQuote: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/quote-intake/confirmation", () => ({
  ...confirmation,
  QuoteConfirmationError: class QuoteConfirmationError extends Error {},
}));

import { confirmSupplierQuoteAction } from "@/app/(app)/orders/import/actions";
import { createQuoteSupplierAction } from "@/app/(app)/orders/import/actions";

describe("supplier quote action authorization", () => {
  it("rejects an unauthorized update before validation or persistence", async () => {
    auth.requireMasterDataEditor.mockRejectedValueOnce(
      new Error("Unauthorized"),
    );

    await expect(
      confirmSupplierQuoteAction({}, new FormData()),
    ).rejects.toThrow("Unauthorized");
    expect(confirmation.confirmSupplierQuote).not.toHaveBeenCalled();
  });

  it("rejects unauthorized Supplier creation before validation or persistence", async () => {
    auth.requireMasterDataEditor.mockRejectedValueOnce(
      new Error("Unauthorized"),
    );

    await expect(createQuoteSupplierAction({}, new FormData())).rejects.toThrow(
      "Unauthorized",
    );
  });
});
