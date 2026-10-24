import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const modelSettings = vi.hoisted(() => ({
  findUnique: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ applicationSetting: modelSettings }),
}));

import {
  ItemExtractionProviderError,
  OpenAIItemExtractionProvider,
} from "@/lib/items/extraction-provider";

const previousKey = process.env.OPENAI_API_KEY;
beforeEach(() => {
  vi.stubEnv("ITEM_EXTRACTION_MODEL", "");
  modelSettings.findUnique.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const temporaryFile = {
  bytes: new Uint8Array([37, 80, 68, 70, 45]),
  filename: "private-quote.pdf",
  mediaType: "application/pdf" as const,
};
const emptyExtraction = { currencyCode: "EUR", items: [], warnings: [] };

function rawResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "x-request-id": "req_item_test" },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
  it("reads raw Responses output after reasoning and preserves request settings", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      rawResponse({
        id: "resp_item_test",
        status: "completed",
        output: [
          { type: "reasoning", summary: [] },
          {
            type: "message",
            status: "completed",
            content: [
              { type: "output_text", text: JSON.stringify(emptyExtraction) },
            ],
          },
        ],
      }),
    );
    const result = await new OpenAIItemExtractionProvider(
      request,
    ).extractQuoteItems(temporaryFile);
    expect(result.extraction).toEqual(emptyExtraction);
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(body.input[0].content[0]).toMatchObject({
      type: "input_file",
      filename: temporaryFile.filename,
    });
    expect(request.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps image inputs on the same structured request path", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(providerResponse(emptyExtraction));
    await new OpenAIItemExtractionProvider(request).extractQuoteItems({
      ...temporaryFile,
      mediaType: "image/png",
    });
    const content = JSON.parse(String(request.mock.calls[0]?.[1]?.body))
      .input[0].content[0];
    expect(content).toMatchObject({ type: "input_image", detail: "high" });
    expect(content.image_url).toMatch(/^data:image\/png;base64,/);
  });

  it.each([
    ["empty", { status: "completed", output: [] }, "EMPTY_OUTPUT"],
    [
      "malformed",
      { status: "completed", output_text: "private document text {" },
      "MALFORMED_OUTPUT",
    ],
    [
      "schema",
      {
        status: "completed",
        output_text: JSON.stringify({
          ...emptyExtraction,
          currencyCode: "private document text",
        }),
      },
      "SCHEMA_VALIDATION",
    ],
    [
      "shape",
      { status: "completed", output: "private document text" },
      "INVALID_RESPONSE",
    ],
    [
      "incomplete",
      {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: JSON.stringify(emptyExtraction),
      },
      "INCOMPLETE",
    ],
    [
      "partial message",
      {
        status: "completed",
        output: [
          {
            type: "message",
            status: "incomplete",
            content: [
              { type: "output_text", text: JSON.stringify(emptyExtraction) },
            ],
          },
        ],
      },
      "INCOMPLETE",
    ],
    [
      "queued",
      { status: "queued", output_text: JSON.stringify(emptyExtraction) },
      "INCOMPLETE",
    ],
    [
      "refusal",
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "private document text" }],
          },
        ],
      },
      "REFUSAL",
    ],
    [
      "empty refusal",
      {
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      },
      "REFUSAL",
    ],
    [
      "failed",
      { status: "failed", output_text: JSON.stringify(emptyExtraction) },
      "PROVIDER",
    ],
    ["API error", { error: { message: "private document text" } }, "PROVIDER"],
    [
      "model error",
      { error: { code: "model_not_found", message: "private document text" } },
      "CONFIGURATION",
    ],
  ])(
    "classifies %s without logging document content",
    async (_, payload, category) => {
      process.env.OPENAI_API_KEY = "test-server-key";
      const provider = new OpenAIItemExtractionProvider(
        vi.fn<typeof fetch>().mockResolvedValue(rawResponse(payload)),
      );
      await expect(
        provider.extractQuoteItems(temporaryFile, {
          requestId: "11111111-1111-4111-8111-111111111111",
        }),
      ).rejects.toMatchObject({ category });
      expect(console.error).toHaveBeenCalledWith(
        "Item extraction failed.",
        expect.objectContaining({
          category,
          provider: "openai",
          model: "gpt-6-luna",
          operation: "supplier_quote_items",
          requestId: "11111111-1111-4111-8111-111111111111",
          providerRequestId: "req_item_test",
          elapsedMs: expect.any(Number),
        }),
      );
      const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
      expect(logs).not.toContain("private document text");
      expect(logs).not.toContain(temporaryFile.filename);
      expect(logs).not.toContain("test-server-key");
    },
  );

  it.each([401, 403, 404, 429, 500])(
    "classifies HTTP %s even without JSON",
    async (status) => {
      process.env.OPENAI_API_KEY = "test-server-key";
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private provider detail", { status }));
      await expect(
        new OpenAIItemExtractionProvider(request).extractQuoteItems(
          temporaryFile,
        ),
      ).rejects.toMatchObject({
        category: status < 429 ? "CONFIGURATION" : "PROVIDER",
      });
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "private provider detail",
      );
    },
  );

  it("classifies an unreadable successful HTTP body", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    await expect(
      new OpenAIItemExtractionProvider(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("private malformed envelope")),
      ).extractQuoteItems(temporaryFile),
    ).rejects.toMatchObject({ category: "INVALID_RESPONSE" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private malformed envelope",
    );
  });

  it.each(["headers", "body"])(
    "times out while waiting for %s",
    async (stage) => {
      process.env.OPENAI_API_KEY = "test-server-key";
      const controller = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          stage === "headers"
            ? new Promise<Response>(() => {})
            : new Response(new ReadableStream<Uint8Array>()),
        );
      const result = new OpenAIItemExtractionProvider(
        request,
      ).extractQuoteItems(temporaryFile);
      const rejected = expect(result).rejects.toMatchObject({
        category: "TIMEOUT",
      });
      await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
      if (stage === "body") await Promise.resolve();
      controller.abort(
        new DOMException("private timeout details", "TimeoutError"),
      );
      await rejected;
      expect(AbortSignal.timeout).toHaveBeenCalledWith(90_000);
      expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "private timeout details",
      );
    },
  );

  it("forwards caller cancellation through body reads", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    const controller = new AbortController();
    const response = new Response("unused");
    const read = vi
      .spyOn(response, "json")
      .mockImplementation(() => new Promise(() => {}));
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    const result = new OpenAIItemExtractionProvider(request).extractQuoteItems(
      temporaryFile,
      { signal: controller.signal },
    );
    const rejected = expect(result).rejects.toMatchObject({
      category: "ABORTED",
    });
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    controller.abort(new Error("private cancellation reason"));
    await rejected;
    expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private cancellation reason",
    );
  });

  it("does not launch a provider request after cancellation during settings lookup", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    let finishSettings: (value: null) => void = () => {};
    modelSettings.findUnique.mockReturnValueOnce(
      new Promise<null>((resolve) => {
        finishSettings = resolve;
      }),
    );
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>();
    const result = new OpenAIItemExtractionProvider(request).extractQuoteItems(
      temporaryFile,
      { signal: controller.signal },
    );
    const rejected = expect(result).rejects.toMatchObject({
      category: "ABORTED",
    });
    await vi.waitFor(() =>
      expect(modelSettings.findUnique).toHaveBeenCalledOnce(),
    );
    controller.abort();
    await rejected;
    finishSettings(null);
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });

  it("does not request an already cancelled upload", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn<typeof fetch>();
    await expect(
      new OpenAIItemExtractionProvider(request).extractQuoteItems(
        temporaryFile,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ category: "ABORTED" });
    expect(request).not.toHaveBeenCalled();
    expect(modelSettings.findUnique).not.toHaveBeenCalled();
  });

  it("sanitizes transport exceptions and missing configuration", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private exception test-server-key"));
    await expect(
      new OpenAIItemExtractionProvider(request).extractQuoteItems(
        temporaryFile,
      ),
    ).rejects.toMatchObject({ category: "PROVIDER" });
    delete process.env.OPENAI_API_KEY;
    await expect(
      new OpenAIItemExtractionProvider(request).extractQuoteItems(
        temporaryFile,
      ),
    ).rejects.toMatchObject({ category: "CONFIGURATION" });
    expect(request).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
      /private exception|test-server-key|OPENAI_API_KEY/,
    );
  });

  it("does not log untrusted response metadata or enum validation messages", async () => {
    process.env.OPENAI_API_KEY = "test-server-key";
    const provider = new OpenAIItemExtractionProvider(
      vi.fn<typeof fetch>().mockResolvedValue(
        rawResponse({
          id: "private document metadata",
          status: "private document metadata",
          output: [
            {
              type: "private document metadata",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    mappings: [
                      {
                        confidence: "private document metadata",
                        field: null,
                        header: "private document metadata",
                        reason: "private document metadata",
                      },
                    ],
                    warnings: [],
                  }),
                },
              ],
            },
          ],
        }),
      ),
    );
    await expect(
      provider.suggestSpreadsheetMapping({
        headers: ["private column"],
        samples: [["private value"]],
      }),
    ).rejects.toMatchObject({ category: "SCHEMA_VALIDATION" });
    const diagnostic = vi.mocked(console.error).mock.calls.at(-1)?.[1];
    expect(diagnostic).toMatchObject({
      responseId: null,
      responseStatus: "unknown",
      outputItemTypes: ["other"],
      zodIssues: [{ path: "mappings.0.confidence", code: "invalid_value" }],
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private",
    );
  });

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
    expect(result.model).toBe("gpt-6-luna");
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
    expect(result.model).toBe("gpt-6-luna");
  });
});

it.each(["gpt-6-luna", "gpt-6.1-sol"])(
  "sends the saved Item model %s to OpenAI",
  async (model) => {
    process.env.OPENAI_API_KEY = "test-key";
    modelSettings.findUnique.mockResolvedValueOnce({
      itemExtractionModel: model,
    });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        providerResponse({ currencyCode: "EUR", items: [], warnings: [] }),
      );
    const result = await new OpenAIItemExtractionProvider(
      request,
    ).extractQuoteItems({
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
      filename: "quote.pdf",
      mediaType: "application/pdf",
    });
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).model).toBe(
      model,
    );
    expect(result.model).toBe(model);
  },
);

it("uses the Item selection for optional spreadsheet semantic mapping", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  modelSettings.findUnique.mockResolvedValueOnce({
    itemExtractionModel: "gpt-6.1-sol",
  });
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(providerResponse({ mappings: [], warnings: [] }));
  const result = await new OpenAIItemExtractionProvider(
    request,
  ).suggestSpreadsheetMapping({ headers: ["Item"], samples: [["Chair"]] });
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).model).toBe(
    "gpt-6.1-sol",
  );
  expect(result.model).toBe("gpt-6.1-sol");
});
