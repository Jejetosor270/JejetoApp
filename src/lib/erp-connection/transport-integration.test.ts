import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({
  authenticateConnection: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Fictional owner",
    email: "owner@example.test",
    isActive: true,
    role: "ADMIN",
  })),
}));
vi.mock("@/lib/db", () => ({
  getDatabase: vi.fn(() => {
    throw new Error("This integration test must not reach a database.");
  }),
}));

import { handleErpMcpRequest } from "./transport";

afterEach(() => vi.unstubAllEnvs());

it("publishes the real schemas and reads curated help through the real SDK and tool adapter", async () => {
  const origin = "https://erp.example.test";
  vi.stubEnv("ERP_MCP_ORIGIN", origin);
  vi.stubEnv("ERP_MCP_OWNER_ID", "00000000-0000-4000-8000-000000000001");
  const client = new Client({ name: "integration-test", version: "1" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${origin}/api/mcp`),
    {
      requestInit: { headers: { authorization: "Bearer mocked-credential" } },
      fetch: (input, init) => handleErpMcpRequest(new Request(input, init)),
    },
  );
  try {
    // SDK 1.x declares optional sessionId differently with exactOptionalPropertyTypes.
    await client.connect(transport as Transport);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual([
      "get_connection_info",
      "search_records",
      "list_records",
      "get_project_financials",
      "get_payment_terms",
      "get_cash_forecast",
      "get_financial_attention",
      "get_workflow_help",
    ]);
    for (const tool of listed.tools) {
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
    const help = await client.callTool({
      name: "get_workflow_help",
      arguments: { topic: "mark_paid" },
    });
    expect(help.isError).not.toBe(true);
    expect(help.structuredContent).toMatchObject({
      readOnly: true,
      data: {
        title: "Mark paid",
        links: expect.arrayContaining([
          { label: "Open Purchasing", href: `${origin}/orders` },
        ]),
      },
    });
  } finally {
    await client.close();
  }
});
