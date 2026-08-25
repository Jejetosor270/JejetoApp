import { afterEach, describe, expect, it, vi } from "vitest";

import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

vi.mock("server-only", () => ({}));

import {
  OpenAIQuoteExtractionProvider,
  QuoteExtractionProviderError,
} from "@/lib/quote-intake/openai-provider";

const originalApiKey = process.env.OPENAI_API_KEY;
const temporaryFile = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
  filename: "quote.pdf",
  mediaType: "application/pdf" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
});

describe("OpenAI quote extraction provider", () => {
  it("uses one non-stored structured Responses API call and validates output", async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(quoteExtractionFixture()),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAIQuoteExtractionProvider().extract(
      temporaryFile,
    );
    expect(result.extraction.quote.reference.value).toBe("Q-2026-44");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body)) as {
      input: Array<{ content: Array<Record<string, unknown>> }>;
      store: boolean;
      text: { format: { strict: boolean; type: string } };
    };
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

  it("returns a controlled provider error for API and schema failures", async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Bad file" } }), {
          status: 400,
        }),
      ),
    );
    await expect(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
    ).rejects.toThrow("Bad file");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "{}" }],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
    ).rejects.toBeInstanceOf(QuoteExtractionProviderError);
  });

  it("turns provider timeouts into a recoverable retry message", async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );
    await expect(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
    ).rejects.toThrow("timed out");
  });

  it("never calls the provider without a server API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new OpenAIQuoteExtractionProvider().extract(temporaryFile),
    ).rejects.toThrow("OPENAI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
