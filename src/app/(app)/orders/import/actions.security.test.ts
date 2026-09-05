import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireMasterDataEditor: vi.fn() }));
const confirmation = vi.hoisted(() => ({ confirmSupplierQuote: vi.fn() }));
const lifecycle = vi.hoisted(() => ({
  logSupplierOrderImportLifecycle: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/quote-intake/lifecycle", () => lifecycle);
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

  it("returns friendly field errors and logs confirmation validation failure", async () => {
    auth.requireMasterDataEditor.mockResolvedValueOnce({ id: "actor-1" });
    const formData = new FormData();
    formData.set("importRequestId", "d12b6b9b-10e9-4e42-b93f-38796de4f65a");

    const result = await confirmSupplierQuoteAction({}, formData);

    expect(result.status).toBe("error");
    expect(result.message).toBeTruthy();
    expect(result.fieldErrors).toBeTruthy();
    expect(lifecycle.logSupplierOrderImportLifecycle).toHaveBeenCalledWith(
      "supplier_order_import.validation_failed",
      expect.objectContaining({
        errorClassification: "confirmation_validation",
        requestId: "d12b6b9b-10e9-4e42-b93f-38796de4f65a",
      }),
    );
  });

  it("logs completed confirmation after creating the Supplier Order", async () => {
    auth.requireMasterDataEditor.mockResolvedValueOnce({ id: "actor-1" });
    confirmation.confirmSupplierQuote.mockResolvedValueOnce("order-1");
    const formData = new FormData();
    formData.set("action", "CREATE");
    formData.set("applyCurrency", "on");
    formData.set("freightTreatment", "NOT_APPLICABLE");
    formData.set("importRequestId", "e12b6b9b-10e9-4e42-b93f-38796de4f65a");
    formData.set("orderCurrencyCode", "EUR");
    formData.set("orderNumber", "PO-TEST");
    formData.set("originalFilename", "supplier-invoice.pdf");
    formData.set("paymentCount", "0");
    formData.set("projectId", "a12b6b9b-10e9-4e42-b93f-38796de4f65a");
    formData.set("supplierId", "b12b6b9b-10e9-4e42-b93f-38796de4f65a");

    const result = await confirmSupplierQuoteAction({}, formData);

    expect(result).toMatchObject({ orderId: "order-1", status: "success" });
    expect(lifecycle.logSupplierOrderImportLifecycle).toHaveBeenCalledWith(
      "supplier_order_import.confirmation_completed",
      expect.objectContaining({
        requestId: "e12b6b9b-10e9-4e42-b93f-38796de4f65a",
      }),
    );
  });
});
