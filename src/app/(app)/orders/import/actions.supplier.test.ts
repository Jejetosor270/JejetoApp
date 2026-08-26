import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireMasterDataEditor: vi.fn() }));
const supplierService = vi.hoisted(() => ({ createSupplier: vi.fn() }));
const duplicates = vi.hoisted(() => ({
  findQuoteSupplierDuplicates: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/master-data/suppliers", () => supplierService);
vi.mock("@/lib/quote-intake/supplier-creation", () => duplicates);

import { createQuoteSupplierAction } from "@/app/(app)/orders/import/actions";

function supplierForm(): FormData {
  const formData = new FormData();
  formData.set("defaultCurrencyCode", "EUR");
  formData.set("displayName", "Reviewed display name");
  formData.set("legalName", "Reviewed Legal Name SAS");
  formData.set("vatNumber", "FR 12 345 678 901");
  return formData;
}

describe("Supplier creation from quote review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireMasterDataEditor.mockResolvedValue({ id: "actor-1" });
    duplicates.findQuoteSupplierDuplicates.mockResolvedValue([]);
  });

  it("returns duplicate candidates and preserves the employee's reviewed values", async () => {
    duplicates.findQuoteSupplierDuplicates.mockResolvedValue([
      {
        basis: "VAT_NUMBER",
        displayName: "Existing Supplier",
        id: "supplier-existing",
      },
    ]);

    const result = await createQuoteSupplierAction({}, supplierForm());

    expect(result.status).toBe("duplicate");
    expect(result.values?.legalName).toBe("Reviewed Legal Name SAS");
    expect(result.duplicateCandidates?.[0]?.basis).toBe("VAT_NUMBER");
    expect(supplierService.createSupplier).not.toHaveBeenCalled();
  });

  it("creates the employee-reviewed Supplier and returns it for selection", async () => {
    supplierService.createSupplier.mockResolvedValue({
      displayName: "Reviewed display name",
      id: "supplier-new",
    });

    const result = await createQuoteSupplierAction({}, supplierForm());

    expect(supplierService.createSupplier).toHaveBeenCalledWith(
      "actor-1",
      expect.objectContaining({
        displayName: "Reviewed display name",
        legalName: "Reviewed Legal Name SAS",
        vatNumber: "FR 12 345 678 901",
      }),
    );
    expect(result).toMatchObject({
      status: "success",
      supplier: {
        displayName: "Reviewed display name",
        id: "supplier-new",
      },
    });
  });
});
