import { describe, expect, it, vi } from "vitest";

import type { QuoteExtractionProvider } from "@/lib/quote-intake/provider";
import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

const database = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  supplier: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { processSupplierQuote } from "@/lib/quote-intake/process";

describe("supplier quote processing lifecycle", () => {
  it("does no authoritative write and clears temporary bytes after one provider call", async () => {
    database.project.findUnique.mockResolvedValue({
      id: "project-1",
      orders: [],
    });
    database.supplier.findMany.mockResolvedValue([
      {
        displayName: "Maison Exemple",
        id: "supplier-1",
        legalName: "Maison Exemple SAS",
        vatNumber: "FR12345678901",
      },
    ]);
    let providerBytes: Uint8Array | null = null;
    const provider: QuoteExtractionProvider = {
      extract: vi.fn(async (file) => {
        providerBytes = file.bytes;
        return {
          extraction: quoteExtractionFixture(),
          model: "mock-model",
          provider: "mock-provider",
        };
      }),
    };
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])],
      "supplier-quote.pdf",
      { type: "application/pdf" },
    );

    const result = await processSupplierQuote(
      "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      file,
      provider,
    );
    expect(provider.extract).toHaveBeenCalledTimes(1);
    expect(providerBytes ? [...providerBytes] : null).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(JSON.stringify(result)).not.toContain("base64");
    expect(result.supplierMatch.suggestedSupplierId).toBe("supplier-1");
    expect(Object.keys(database.project)).toEqual(["findUnique"]);
    expect(Object.keys(database.supplier)).toEqual(["findMany"]);
  });
});
