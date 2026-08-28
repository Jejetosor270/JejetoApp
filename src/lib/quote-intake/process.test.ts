import { describe, expect, it, vi } from "vitest";

import type { QuoteExtractionProvider } from "@/lib/quote-intake/provider";
import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

const database = vi.hoisted(() => ({
  item: { findMany: vi.fn() },
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

  it("extracts and reconciles multiple quote Items with one mocked Item-provider call", async () => {
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
    database.item.findMany.mockResolvedValue([
      {
        finishColor: "Oak",
        id: "existing-item",
        itemReference: "1",
        name: "Chair",
        procurementOrderId: null,
        quantity: { toString: () => "2" },
        supplierSku: "SKU-1",
        totalPurchasePriceHt: { toString: () => "80" },
        unitPurchasePriceHt: { toString: () => "40" },
      },
    ]);
    const provider: QuoteExtractionProvider = {
      extract: vi.fn(async () => ({
        extraction: quoteExtractionFixture(),
        model: "quote-mock",
        provider: "mock",
      })),
    };
    const itemProvider = {
      extractQuoteItems: vi.fn(async () => ({
        extraction: {
          currencyCode: "EUR",
          items: [
            {
              brand: null,
              description: null,
              finishColor: null,
              itemReference: "1",
              name: "Chair",
              notes: null,
              quantity: "2.5",
              supplierSku: "SKU-1",
              totalPriceHt: "100",
              unitOfMeasure: "EA",
              unitPriceHt: "40",
              vatRate: "0.20",
              volumeEach: null,
              weightEach: null,
            },
          ],
          warnings: [],
        },
        model: "item-mock",
        provider: "mock",
      })),
      suggestSpreadsheetMapping: vi.fn(),
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
      itemProvider,
    );
    expect(itemProvider.extractQuoteItems).toHaveBeenCalledTimes(1);
    expect(result.itemReview?.rows[0]).toMatchObject({
      action: "UPDATE",
      category: null,
      existingItemId: "existing-item",
      quantity: "2.5",
    });
    expect(result.itemReview?.rows[0]?.diffs).toEqual(
      expect.arrayContaining([
        { after: "2.5", before: "2", field: "Quantity" },
        { after: "100", before: "80", field: "Total purchase HT" },
      ]),
    );
    expect(result.itemReview?.warnings[0]).toContain("does not reconcile");
  });
});
