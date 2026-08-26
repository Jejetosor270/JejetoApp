import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

vi.mock("server-only", () => ({}));

import {
  OpenAIQuoteExtractionProvider,
  QuoteExtractionProviderError,
  type QuoteExtractionFailureCategory,
} from "@/lib/quote-intake/openai-provider";

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.QUOTE_EXTRACTION_MODEL;
const temporaryFile = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
  filename: "quote.pdf",
  mediaType: "application/pdf" as const,
};

function completedResponse(outputText: string | null) {
  return {
    error: null,
    id: "resp_test_quote",
    incomplete_details: null,
    object: "response",
    output: [
      { id: "reasoning_test", summary: [], type: "reasoning" },
      {
        content:
          outputText === null
            ? []
            : [{ annotations: [], text: outputText, type: "output_text" }],
        id: "message_test",
        role: "assistant",
        status: "completed",
        type: "message",
      },
    ],
    status: "completed",
  };
}

function mockResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      headers: { "x-request-id": "req_test_quote" },
      status,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function expectProviderFailure(
  promise: Promise<unknown>,
  category: QuoteExtractionFailureCategory,
) {
  try {
    await promise;
    throw new Error("Expected quote extraction to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(QuoteExtractionProviderError);
    if (!(error instanceof QuoteExtractionProviderError)) throw error;
    expect(error.category).toBe(category);
    return error;
  }
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-only-key";
  delete process.env.QUOTE_EXTRACTION_MODEL;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
  if (originalModel === undefined) delete process.env.QUOTE_EXTRACTION_MODEL;
  else process.env.QUOTE_EXTRACTION_MODEL = originalModel;
});

describe("OpenAI quote extraction provider", () => {
  it("accepts the production Responses envelope and validates structured output", async () => {
    const fetchMock = mockResponse(
      completedResponse(JSON.stringify(quoteExtractionFixture())),
    );

    const result = await new OpenAIQuoteExtractionProvider().extract(
      temporaryFile,
    );
    expect(result.extraction.quote.reference.value).toBe("Q-2026-44");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body)) as {
      input: Array<{ content: Array<Record<string, unknown>> }>;
      model: string;
      store: boolean;
      text: { format: { strict: boolean; type: string } };
    };
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({
      strict: true,
      type: "json_schema",
    });
    expect(body.input[0]?.content[0]).toMatchObject({
      filename: "quote.pdf",
      type: "input_file",
    });
  });

  it("uses the optional server-side model override", async () => {
    process.env.QUOTE_EXTRACTION_MODEL = "gpt-5.6-terra";
    const fetchMock = mockResponse(
      completedResponse(JSON.stringify(quoteExtractionFixture())),
    );

    const result = await new OpenAIQuoteExtractionProvider().extract(
      temporaryFile,
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body)) as { model: string };
    expect(body.model).toBe("gpt-5.6-terra");
    expect(result.model).toBe("gpt-5.6-terra");
  });

  it("also accepts the SDK-style output_text convenience field", async () => {
    mockResponse({
      ...completedResponse(null),
      output_text: JSON.stringify(quoteExtractionFixture()),
    });

    const result = await new OpenAIQuoteExtractionProvider().extract(
      temporaryFile,
    );
    expect(result.extraction.financials.totalHt.value).toBe("105000");
  });

  it("classifies an empty completed response", async () => {
    mockResponse(completedResponse(null));

    const error = await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "empty_output",
    );
    expect(error.message).toContain("no quote data");
    expect(console.error).toHaveBeenCalledWith(
      "Supplier quote extraction failed.",
      expect.objectContaining({
        category: "empty_output",
        contentTypes: [],
        openaiRequestId: "req_test_quote",
        outputItemTypes: ["reasoning", "message"],
        outputTextEmpty: true,
        responseId: "resp_test_quote",
        responseStatus: "completed",
      }),
    );
  });

  it("classifies malformed structured JSON without logging the raw output", async () => {
    const sensitiveOutput = '{"supplier":"commercial secret"';
    mockResponse(completedResponse(sensitiveOutput));

    await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "malformed_structured_output",
    );
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("commercial secret");
    expect(logged).toContain("malformed_structured_output");
  });

  it("classifies Zod-invalid structured output and logs issue paths", async () => {
    mockResponse(completedResponse("{}"));

    await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "schema_validation_failure",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Supplier quote extraction failed.",
      expect.objectContaining({
        category: "schema_validation_failure",
        zodIssues: expect.arrayContaining([
          expect.objectContaining({ path: "supplier" }),
        ]),
      }),
    );
  });

  it("classifies incomplete responses with their reason", async () => {
    mockResponse({
      ...completedResponse(null),
      incomplete_details: { reason: "max_output_tokens" },
      status: "incomplete",
    });

    const error = await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "incomplete_response",
    );
    expect(error.message).toContain("did not finish");
    expect(console.error).toHaveBeenCalledWith(
      "Supplier quote extraction failed.",
      expect.objectContaining({ incompleteReason: "max_output_tokens" }),
    );
  });

  it("classifies model refusals", async () => {
    mockResponse({
      ...completedResponse(null),
      output: [
        {
          content: [
            { refusal: "I cannot process this document.", type: "refusal" },
          ],
          status: "completed",
          type: "message",
        },
      ],
    });

    const error = await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "refusal",
    );
    expect(error.message).toContain("declined");
    expect(console.error).toHaveBeenCalledWith(
      "Supplier quote extraction failed.",
      expect.objectContaining({
        category: "refusal",
        contentTypes: ["refusal"],
      }),
    );
  });

  it("classifies provider API errors without exposing technical text to users", async () => {
    mockResponse(
      {
        error: {
          code: "rate_limit_exceeded",
          message: "Provider capacity exceeded",
          type: "requests",
        },
      },
      429,
    );

    const error = await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "provider_api",
    );
    expect(error.message).not.toContain("Provider capacity exceeded");
    expect(console.error).toHaveBeenCalledWith(
      "Supplier quote extraction failed.",
      expect.objectContaining({
        httpStatus: 429,
        providerErrorCode: "rate_limit_exceeded",
        providerErrorMessage: "Provider capacity exceeded",
      }),
    );
  });

  it("classifies non-JSON and unexpected provider envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not JSON", {
          headers: { "x-request-id": "req_bad_json" },
          status: 502,
        }),
      ),
    );
    await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "invalid_provider_response",
    );

    mockResponse({ error: null, output: "unexpected", status: "completed" });
    await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "invalid_provider_response",
    );
  });

  it("turns provider timeouts into a recoverable retry message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );
    const error = await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "timeout",
    );
    expect(error.message).toContain("timed out");
  });

  it("never calls the provider without a server API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const error = await expectProviderFailure(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
      "configuration",
    );
    expect(error.message).toContain("OPENAI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
