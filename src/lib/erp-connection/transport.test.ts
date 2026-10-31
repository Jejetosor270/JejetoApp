import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./auth", () => ({ authenticateConnection: mocks.authenticate }));
vi.mock("./tools", async () => {
  const { z } = await import("zod");
  return {
    erpReadTools: [
      {
        name: "search_records",
        description: "Find ERP records.",
        inputSchema: z.object({ query: z.string().min(1).max(100) }).strict(),
      },
    ],
    runReadTool: mocks.read,
    ErpReadToolError: class extends Error {},
  };
});
vi.mock("./request-guard", async (importOriginal) => {
  const original = await importOriginal<typeof import("./request-guard")>();
  return {
    ...original,
    withErpConnectionIngress: vi.fn(
      async (_id: string, work: () => Promise<unknown>) => work(),
    ),
    withErpConnectionRequest: vi.fn(
      async (_id: string, work: () => Promise<unknown>) => work(),
    ),
    withErpConnectionTool: vi.fn(
      async (_id: string, work: () => Promise<unknown>) => work(),
    ),
  };
});

import { handleErpMcpRequest } from "./transport";
import { getErpMcpOrigin } from "./config";
import {
  ErpConnectionLimitError,
  withErpConnectionIngress,
  withErpConnectionRequest,
  withErpConnectionTool,
} from "./request-guard";

const origin = "https://erp.example.test";
const endpoint = `${origin}/api/mcp`;
const authorization = "Bearer test-connection";
const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Test Owner",
  email: "owner@example.test",
  role: "ADMIN" as const,
  isActive: true as const,
};
const headers = {
  authorization,
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

function request(body: unknown, extraHeaders?: Record<string, string>) {
  return new Request(endpoint, {
    method: "POST",
    headers: { ...headers, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function call(name = "search_records", args: unknown = { query: "Villa" }) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ERP_MCP_ORIGIN", origin);
  vi.stubEnv("ERP_MCP_OWNER_ID", actor.id);
  mocks.authenticate.mockImplementation(async (header: string | null) =>
    header === authorization ? actor : null,
  );
  mocks.read.mockResolvedValue({
    readOnly: true,
    data: {
      amount: "1234.5600",
      currency: "EUR",
      href: "/projects/project-id",
    },
  });
  vi.mocked(withErpConnectionRequest).mockImplementation(async (_id, work) =>
    work(),
  );
  vi.mocked(withErpConnectionIngress).mockImplementation(async (_id, work) =>
    work(),
  );
  vi.mocked(withErpConnectionTool).mockImplementation(async (_id, work) =>
    work(),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ERP MCP transport", () => {
  it("supports a real SDK handshake, discovery and stateless read calls", async () => {
    const client = new Client({ name: "test-client", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { authorization } },
      fetch: async (input, init) =>
        handleErpMcpRequest(new Request(input, init)),
    });
    try {
      // SDK 1.x's optional sessionId types differ under exactOptionalPropertyTypes.
      // This is the SDK's own Transport implementation, without a session in this test.
      await client.connect(transport as Transport);
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        "get_connection_info",
        "search_records",
      ]);
      for (const tool of listed.tools) {
        expect(tool.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      }
      const result = await client.callTool({
        name: "search_records",
        arguments: { query: "Villa" },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        readOnly: true,
        data: {
          amount: "1234.5600",
          currency: "EUR",
          href: `${origin}/projects/project-id`,
        },
      });
      expect(mocks.read).toHaveBeenCalledWith(
        { id: actor.id, role: "ADMIN" },
        "search_records",
        { query: "Villa" },
      );
      const info = await client.callTool({
        name: "get_connection_info",
        arguments: {},
      });
      expect(info.structuredContent).toMatchObject({
        employee: { id: actor.id, name: actor.name },
        capabilities: { financialWrites: false, readOnly: true },
      });
      expect(info.structuredContent).not.toHaveProperty("email");
      expect(transport.sessionId).toBeUndefined();
    } finally {
      await client.close();
    }
  });

  it("requires a bearer key for discovery and never accepts a browser cookie", async () => {
    const response = await handleErpMcpRequest(
      request(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        {
          authorization: "",
          cookie: "next-auth.session-token=placeholder",
        },
      ),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="MB ERP"',
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns 405 for GET and DELETE without opening streams", async () => {
    for (const method of ["GET", "DELETE"]) {
      const response = await handleErpMcpRequest(
        new Request(endpoint, { method }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("fails closed when not configured", async () => {
    vi.stubEnv("ERP_MCP_OWNER_ID", "");
    expect((await handleErpMcpRequest(request(call()))).status).toBe(503);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it.each([
    { origin: "https://attacker.example" },
    { origin: "null" },
    { host: "attacker.example" },
  ])(
    "rejects untrusted origin/host before authentication: %o",
    async (extra) => {
      const response = await handleErpMcpRequest(request(call(), extra));
      expect(response.status).toBe(403);
      expect(mocks.authenticate).not.toHaveBeenCalled();
    },
  );

  it("rejects query credentials and wrong request origins", async () => {
    for (const url of [
      `${endpoint}?token=placeholder`,
      "https://other.example/api/mcp",
    ]) {
      const response = await handleErpMcpRequest(
        new Request(url, {
          method: "POST",
          headers,
          body: JSON.stringify(call()),
        }),
      );
      expect(response.status).toBe(403);
    }
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("rejects oversized declared and streamed bodies without executing tools", async () => {
    expect(
      (
        await handleErpMcpRequest(
          request(call(), { "content-length": "20000" }),
        )
      ).status,
    ).toBe(413);
    const response = await handleErpMcpRequest(
      request(call("search_records", { query: "x".repeat(20_000) })),
    );
    expect(response.status).toBe(413);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects malformed requests and unknown/write tools", async () => {
    const malformed = await handleErpMcpRequest(
      new Request(endpoint, { method: "POST", headers, body: "{invalid" }),
    );
    expect(malformed.status).toBe(400);
    const unknown = await handleErpMcpRequest(
      request(call("record_payment", {})),
    );
    expect(await unknown.json()).toMatchObject({ result: { isError: true } });
    const invalid = await handleErpMcpRequest(
      request(call("search_records", { query: "" })),
    );
    expect(await invalid.json()).toMatchObject({ result: { isError: true } });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("refuses to expose results if revoked during a slow read", async () => {
    mocks.authenticate
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce(null);
    const response = await handleErpMcpRequest(request(call()));
    const body = await response.json();
    expect(body).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(body)).not.toContain("1234.5600");
    expect(JSON.stringify(body)).toContain("access has ended");
  });

  it("sanitizes unexpected database/tool errors and invalid source links", async () => {
    mocks.read.mockRejectedValueOnce(new Error("sensitive commercial text"));
    const failed = await handleErpMcpRequest(request(call()));
    expect(await failed.text()).not.toContain("sensitive commercial text");
    expect(console.error).toHaveBeenCalledWith("ERP MCP read failed", {
      category: "read_failed",
    });
    mocks.read.mockResolvedValueOnce({ data: { href: "//attacker.example" } });
    const invalid = await handleErpMcpRequest(request(call()));
    expect(await invalid.json()).toMatchObject({ result: { isError: true } });
    mocks.authenticate.mockRejectedValueOnce(
      new Error("private database connection"),
    );
    const dbFailure = await handleErpMcpRequest(request(call()));
    expect(dbFailure.status).toBe(503);
    expect(await dbFailure.text()).not.toContain("private database connection");
  });

  it("limits requests and legacy batched tool work separately", async () => {
    vi.mocked(withErpConnectionRequest).mockRejectedValueOnce(
      new ErpConnectionLimitError(),
    );
    const limited = await handleErpMcpRequest(request(call()));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    vi.mocked(withErpConnectionTool).mockRejectedValueOnce(
      new ErpConnectionLimitError(),
    );
    const toolLimited = await handleErpMcpRequest(request(call()));
    expect(await toolLimited.json()).toMatchObject({
      result: { isError: true },
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("limits invalid-key bursts before making database authentication calls", async () => {
    vi.mocked(withErpConnectionIngress).mockRejectedValueOnce(
      new ErpConnectionLimitError(),
    );
    const response = await handleErpMcpRequest(
      request(call(), { authorization: "Bearer invalid" }),
    );
    expect(response.status).toBe(429);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("keeps term and pagination links usable on the configured ERP origin", async () => {
    mocks.read.mockResolvedValueOnce({
      data: {
        href: "/installments/supplier/term-id",
        moreHref: "/orders?page=2",
        sources: [{ href: "/receipts/receipt-id" }],
      },
    });
    const response = await handleErpMcpRequest(request(call()));
    expect(await response.json()).toMatchObject({
      result: {
        structuredContent: {
          data: {
            href: `${origin}/installments/supplier/term-id`,
            moreHref: `${origin}/orders?page=2`,
            sources: [{ href: `${origin}/receipts/receipt-id` }],
          },
        },
      },
    });
  });
});

describe("ERP MCP canonical origin", () => {
  it.each([
    "",
    "not a url",
    "http://erp.example.test",
    "https://user:pass@erp.example.test",
    `${origin}/path`,
    `${origin}?query=value`,
    `${origin}#hash`,
  ])("rejects invalid origin %s", (value) => {
    vi.stubEnv("ERP_MCP_ORIGIN", value);
    expect(getErpMcpOrigin()).toBeNull();
  });
  it("accepts a configured HTTPS origin with an optional trailing slash", () => {
    vi.stubEnv("ERP_MCP_ORIGIN", `${origin}/`);
    expect(getErpMcpOrigin()).toBe(origin);
  });
});
