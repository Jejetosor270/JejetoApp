import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ItemExtractionProviderError,
  OpenAIItemExtractionProvider,
} from "@/lib/items/extraction-provider";

const previousKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  vi.restoreAllMocks();
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});

function providerResponse(value: unknown, status = "completed") {
  return new Response(
    JSON.stringify({
      id: "resp_item_test",
      output_text: JSON.stringify(value),
      status,
    }),
    { status: 200, headers: { "x-request-id": "req_item_test" } },
  );
}

describe("OpenAI Item extraction provider", () => {
  it("parses a valid 100-line structured quote response with one mocked call", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    const items = Array.from({ length: 100 }, (_, index) => ({
      brand: null,
      description: null,
      finishColor: null,
      itemReference: String(index + 1),
      name: `Item ${index + 1}`,
      notes: null,
      quantity: index === 0 ? "2.5" : "1",
      supplierSku: index === 2 ? null : `SKU-${index}`,
      totalPriceHt: "10",
      unitOfMeasure: "EA",
      unitPriceHt: "10",
      vatRate: index === 4 ? "0.10" : "0.20",
      volumeEach: null,
      weightEach: null,
    }));
    const request = vi.fn(async () =>
      providerResponse({ currencyCode: "EUR", items, warnings: [] }),
    );
    const result = await new OpenAIItemExtractionProvider(
      request,
    ).extractQuoteItems({
      bytes: new Uint8Array([1]),
      filename: "quote.pdf",
      mediaType: "application/pdf",
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.extraction.items).toHaveLength(100);
    expect(result.extraction.items[0]?.quantity).toBe("2.5");
  });

  it("classifies malformed, incomplete, and schema-invalid responses without live calls", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    const malformed = new OpenAIItemExtractionProvider(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ output_text: "{bad", status: "completed" }),
          ),
      ),
    );
    await expect(
      malformed.extractQuoteItems({
        bytes: new Uint8Array([1]),
        filename: "q.pdf",
        mediaType: "application/pdf",
      }),
    ).rejects.toBeInstanceOf(ItemExtractionProviderError);
    const incomplete = new OpenAIItemExtractionProvider(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              incomplete_details: { reason: "max_output_tokens" },
              status: "incomplete",
            }),
          ),
      ),
    );
    await expect(
      incomplete.extractQuoteItems({
        bytes: new Uint8Array([1]),
        filename: "q.pdf",
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("incomplete");
    const invalid = new OpenAIItemExtractionProvider(
      vi.fn(async () =>
        providerResponse({
          currencyCode: "EUR",
          items: [{ name: "Missing strict fields" }],
          warnings: [],
        }),
      ),
    );
    await expect(
      invalid.extractQuoteItems({
        bytes: new Uint8Array([1]),
        filename: "q.pdf",
        mediaType: "application/pdf",
      }),
    ).rejects.toThrow("failed validation");
  });

  it("validates one semantic spreadsheet mapping response", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    const request = vi.fn(async () =>
      providerResponse({
        mappings: [
          {
            confidence: "HIGH",
            field: "quantity",
            header: "How Many",
            reason: "Explicit quantity semantics",
          },
        ],
        warnings: [],
      }),
    );
    const result = await new OpenAIItemExtractionProvider(
      request,
    ).suggestSpreadsheetMapping({ headers: ["How Many"], samples: [["2.5"]] });
    expect(result.suggestion.mappings[0]?.field).toBe("quantity");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
