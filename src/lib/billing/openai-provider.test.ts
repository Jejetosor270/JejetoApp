import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fixture = await import("@/test/client-document-extraction-fixture");
const {
  ClientDocumentExtractionProviderError,
  OpenAIClientDocumentExtractionProvider,
} = await import("./openai-provider");

const file = {
  bytes: new Uint8Array([37, 80, 68, 70, 45]),
  filename: "invoice.pdf",
  mediaType: "application/pdf" as const,
};

function providerResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "x-request-id": "req_test" },
    status: ok ? 200 : 500,
  });
}

describe("OpenAI Client document provider", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.CLIENT_DOCUMENT_EXTRACTION_MODEL = "gpt-5.6-luna";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses a valid structured Responses API output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      providerResponse({
        id: "resp_1",
        status: "completed",
        output_text: JSON.stringify(fixture.clientDocumentExtractionFixture()),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenAIClientDocumentExtractionProvider().extract(
      file,
    );
    expect(result.extraction.reference.value).toBe("INV-2026-014");
    const request = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as {
      store: boolean;
      text: { format: { type: string } };
    };
    expect(request.store).toBe(false);
    expect(request.text.format.type).toBe("json_schema");
  });

  it.each([
    ["empty_output", { id: "resp_empty", status: "completed", output: [] }],
    [
      "malformed_output",
      { id: "resp_bad", status: "completed", output_text: "{" },
    ],
    [
      "schema_validation",
      { id: "resp_schema", status: "completed", output_text: "{}" },
    ],
    [
      "incomplete_response",
      {
        id: "resp_incomplete",
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      },
    ],
    [
      "refusal",
      {
        id: "resp_refusal",
        status: "completed",
        output: [
          { type: "message", content: [{ type: "refusal", refusal: "No" }] },
        ],
      },
    ],
  ] as const)("classifies %s", async (category, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse(body)));
    await expect(
      new OpenAIClientDocumentExtractionProvider().extract(file),
    ).rejects.toMatchObject({
      category,
    });
  });

  it("classifies provider errors without exposing document output", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          providerResponse({ error: { message: "Unavailable" } }, false),
        ),
    );
    await expect(
      new OpenAIClientDocumentExtractionProvider().extract(file),
    ).rejects.toBeInstanceOf(ClientDocumentExtractionProviderError);
  });
});
