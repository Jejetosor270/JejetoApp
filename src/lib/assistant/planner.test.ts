import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AssistantProviderError,
  planAssistantSearch,
  type AssistantProviderErrorCode,
} from "./planner";

const request = { message: "Find order PO-104", recentMessages: [] };
const searchPlan = { intent: "SEARCH", query: "PO-104", kind: "Order" };

function completedResponse(text: string | null) {
  return {
    id: "resp_assistant_test",
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      {
        type: "message",
        status: "completed",
        content: text === null ? [] : [{ type: "output_text", text }],
      },
    ],
  };
}

function mockResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "x-request-id": "req_assistant_test" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function expectFailure(code: AssistantProviderErrorCode) {
  await expect(planAssistantSearch(request)).rejects.toMatchObject({
    name: "AssistantProviderError",
    code,
  });
  expect(console.error).toHaveBeenCalledWith(
    "Record assistant request failed.",
    expect.objectContaining({ category: code, model: "gpt-6-luna" }),
  );
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "assistant-test-value");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("record assistant planner", () => {
  it("uses one bounded, non-stored Luna request with strict structured output", async () => {
    const fetchMock = mockResponse(
      completedResponse(JSON.stringify(searchPlan)),
    );
    const input = {
      message: "I meant order PO-104",
      recentMessages: ["Find PO-104"],
    };
    await expect(planAssistantSearch(input)).resolves.toEqual(searchPlan);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options.cache).toBe("no-store");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 512,
      text: {
        format: {
          type: "json_schema",
          strict: true,
          schema: {
            additionalProperties: false,
            required: ["intent", "query", "kind"],
          },
        },
      },
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(input) }],
        },
      ],
    });
    expect(body.tools).toBeUndefined();
    expect(body.previous_response_id).toBeUndefined();
    expect(body.instructions).toContain("all orders for Acme");
    expect(body.instructions).toContain("OUT_OF_SCOPE");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("accepts an output_text convenience field", async () => {
    mockResponse({
      ...completedResponse(null),
      output_text: JSON.stringify(searchPlan),
    });
    await expect(planAssistantSearch(request)).resolves.toEqual(searchPlan);
  });

  it.each(["CLARIFY", "OUT_OF_SCOPE"])(
    "accepts %s without generated prose",
    async (intent) => {
      const plan = { intent, query: null, kind: "All" };
      mockResponse(completedResponse(JSON.stringify(plan)));
      await expect(planAssistantSearch(request)).resolves.toEqual(plan);
    },
  );

  it("rejects oversized or extra request fields before any API call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      planAssistantSearch({ ...request, message: "x".repeat(801) }),
    ).rejects.toThrow();
    await expect(
      planAssistantSearch({ ...request, recentMessages: Array(5).fill("old") }),
    ).rejects.toThrow();
    await expect(
      planAssistantSearch({ ...request, tools: ["sql"] } as typeof request),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the provider without server configuration", async () => {
    vi.stubEnv("OPENAI_API_KEY", " ");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expectFailure("configuration");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "configuration"],
    [403, "configuration"],
    [404, "configuration"],
    [408, "timeout"],
    [504, "timeout"],
    [429, "provider_api"],
    [500, "provider_api"],
  ] as const)(
    "classifies HTTP %s without reading or logging its error body",
    async (status, code) => {
      mockResponse({ error: { message: "private provider detail" } }, status);
      await expectFailure(code);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "private provider detail",
      );
    },
  );

  it("classifies network failure without leaking the caught error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private question")),
    );
    await expectFailure("provider_api");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private question",
    );
  });

  it("classifies timeout without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    await expectFailure("timeout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-JSON provider envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private non-JSON response")),
    );
    await expectFailure("invalid_provider_response");
  });

  it.each([
    ["incomplete", "incomplete_response"],
    ["in_progress", "incomplete_response"],
    ["cancelled", "incomplete_response"],
    ["failed", "provider_api"],
  ] as const)(
    "does not accept output from a %s response",
    async (status, code) => {
      mockResponse({
        ...completedResponse(JSON.stringify(searchPlan)),
        status,
      });
      await expectFailure(code);
    },
  );

  it("rejects refusal even if a convenience output_text also exists", async () => {
    mockResponse({
      status: "completed",
      output_text: JSON.stringify(searchPlan),
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "private refusal" }],
        },
      ],
    });
    await expectFailure("refusal");
  });

  it("rejects an incomplete message in a completed envelope", async () => {
    mockResponse({
      status: "completed",
      output: [{ type: "message", status: "incomplete", content: [] }],
    });
    await expectFailure("incomplete_response");
  });

  it("rejects empty output", async () => {
    mockResponse(completedResponse("  "));
    await expectFailure("empty_output");
  });

  it("rejects malformed JSON without logging output or questions", async () => {
    mockResponse(completedResponse('{"query":"private model contents"'));
    await expectFailure("malformed_structured_output");
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).not.toContain("private model contents");
    expect(logs).not.toContain(request.message);
    expect(logs).not.toContain("assistant-test-value");
  });

  it.each([
    { intent: "SEARCH", query: null, kind: "Order" },
    { intent: "SEARCH", query: "x".repeat(101), kind: "Order" },
    { intent: "SEARCH", query: "PO-104", kind: "Employee" },
    { ...searchPlan, sql: "SELECT *" },
    { ...searchPlan, message: "private prose" },
  ])("rejects untrusted schema-invalid output %#", async (plan) => {
    mockResponse(completedResponse(JSON.stringify(plan)));
    await expectFailure("schema_validation_failure");
  });

  it("logs only safe identifiers, status, model and failure category", async () => {
    mockResponse(completedResponse(null));
    await expectFailure("empty_output");
    expect(console.error).toHaveBeenCalledWith(
      "Record assistant request failed.",
      {
        category: "empty_output",
        model: "gpt-6-luna",
        httpStatus: 200,
        requestId: "req_assistant_test",
        responseId: "resp_assistant_test",
        responseStatus: "completed",
      },
    );
  });

  it("does not log arbitrary strings in provider metadata", async () => {
    mockResponse({
      ...completedResponse(null),
      id: "private response contents",
    });
    await expectFailure("empty_output");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "private response contents",
    );
  });

  it("exposes only a fixed safe provider error message", () => {
    const error = new AssistantProviderError("refusal");
    expect(error.message).toBe(
      "The record assistant is unavailable. Please try again.",
    );
  });
});
