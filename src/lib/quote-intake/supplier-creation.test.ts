import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  supplier: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { findQuoteSupplierDuplicates } from "@/lib/quote-intake/supplier-creation";

describe("quote Supplier duplicate protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.supplier.findMany.mockResolvedValue([
      {
        displayName: "Maison Exemple",
        id: "supplier-1",
        legalName: "Maison Exemple SAS",
        vatNumber: "FR12345678901",
      },
    ]);
  });

  it("rechecks normalized VAT before creating a Supplier", async () => {
    await expect(
      findQuoteSupplierDuplicates({
        displayName: "Different",
        legalName: "Different legal name",
        vatNumber: "FR 12 345 678 901",
      }),
    ).resolves.toEqual([
      {
        basis: "VAT_NUMBER",
        displayName: "Maison Exemple",
        id: "supplier-1",
      },
    ]);
  });
});
