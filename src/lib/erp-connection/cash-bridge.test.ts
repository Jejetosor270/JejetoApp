import { generateKeyPairSync, verify } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  ElicitRequestSchema,
  type ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createErpCashBridge } from "../../../scripts/erp-cash-bridge";
import {
  approvalMessage,
  cashApiRequestSchema,
  type CashProposalReview,
  type CashSavedResult,
} from "./cash-contract";

const origin = "https://erp.example.test";
const proposalId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const at = new Date("2026-10-31T12:00:00.000Z");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const credentials = {
  token: "fictional-cash-credential-for-local-tests",
  approvalPrivateKey: privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString(),
};
const proposal: CashProposalReview = {
  proposalId,
  digest: "a".repeat(64),
  nonce: "00000000-0000-4000-8000-000000000003",
  expiresAt: "2026-10-31T12:10:00.000Z",
  actorId: "00000000-0000-4000-8000-000000000004",
  tokenId: "00000000-0000-4000-8000-000000000005",
  action: "RECORD_SUPPLIER_PAYMENT",
  summary: "Record Supplier payment for Example Order, term Deposit.",
  changes: [
    { label: "Amount TTC", after: "123.45 EUR" },
    { label: "Payment date", after: "2026-10-31" },
    { label: "Term remaining", before: "500.00 EUR", after: "376.55 EUR" },
  ],
  sourceHref: `${origin}/orders/${targetId}`,
};
const change = {
  action: "RECORD_SUPPLIER_PAYMENT",
  targetId,
  amount: "123.45",
  currency: "EUR",
  date: "2026-10-31",
};
const savedResult: CashSavedResult = {
  status: "EXECUTED",
  proposalId,
  action: proposal.action,
  resultId: targetId,
  alreadyExecuted: false,
  sourceHref: proposal.sourceHref,
  message: "Supplier payment recorded.",
};
const closes: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closes.splice(0).map((close) => close()));
  vi.unstubAllGlobals();
});

async function connect(
  options: {
    reply?: ElicitResult;
    review?: unknown;
    supported?: boolean;
    now?: () => Date;
    onApproval?: () => void;
    requestError?: Error;
    realApi?: boolean;
    loseExecuteResponse?: boolean;
  } = {},
) {
  const prompts: string[] = [];
  let saved = false;
  const request = vi.fn(async (input: unknown) => {
    if (options.requestError) throw options.requestError;
    const body = cashApiRequestSchema.parse(input);
    if (body.operation === "execute") {
      saved = true;
      if (options.loseExecuteResponse)
        throw new Error("Response lost after save");
      return savedResult;
    }
    return saved
      ? { ...savedResult, alreadyExecuted: true }
      : (options.review ?? proposal);
  });
  const loadCredentials = vi.fn(async () => credentials);
  const server = createErpCashBridge({
    origin,
    loadCredentials,
    now: options.now ?? (() => at),
    ...(options.realApi ? {} : { request }),
  });
  const client = new Client(
    { name: "approval-test", version: "1" },
    {
      capabilities:
        options.supported === false ? {} : { elicitation: { form: {} } },
    },
  );
  if (options.supported !== false) {
    client.setRequestHandler(ElicitRequestSchema, async (input) => {
      prompts.push(input.params.message);
      options.onApproval?.();
      return options.reply ?? { action: "accept", content: { confirm: true } };
    });
  }
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport as Transport);
  await client.connect(clientTransport as Transport);
  closes.push(() => client.close());
  return { client, request, prompts, loadCredentials };
}

describe("cash approval bridge", () => {
  it("prepares server-validated values without recording cash or asking for approval", async () => {
    const { client, request, prompts } = await connect();
    const result = await client.callTool({
      name: "prepare_cash_change",
      arguments: { change },
    });
    expect(result.isError).not.toBe(true);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      { operation: "prepare", change },
      credentials,
    );
    expect(prompts).toHaveLength(0);
    expect(JSON.stringify(result)).toContain("AWAITING_APPROVAL");
    expect(JSON.stringify(result)).not.toContain(credentials.token);
  });

  it("signs the exact expiring proposal only after native approval", async () => {
    const { client, request, prompts } = await connect();
    const result = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(result.isError).not.toBe(true);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("123.45 EUR");
    expect(prompts[0]).toContain("2026-10-31");
    expect(prompts[0]).toContain("500.00 EUR → 376.55 EUR");
    expect(prompts[0]).toContain(proposal.summary);
    const executed = cashApiRequestSchema.parse(request.mock.calls[1]?.[0]);
    expect(executed.operation).toBe("execute");
    if (executed.operation !== "execute")
      throw new Error("Missing execution request");
    expect(
      verify(
        null,
        Buffer.from(approvalMessage(proposal, executed.approvedAt)),
        publicKey,
        Buffer.from(executed.signature, "base64url"),
      ),
    ).toBe(true);
    expect(
      verify(
        null,
        Buffer.from(
          approvalMessage(
            { ...proposal, digest: "b".repeat(64) },
            executed.approvedAt,
          ),
        ),
        publicKey,
        Buffer.from(executed.signature, "base64url"),
      ),
    ).toBe(false);
    expect(JSON.stringify(result)).not.toContain(executed.signature);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("recovers a saved acknowledgement after a lost response without asking or executing twice", async () => {
    let now = at;
    const { client, request, prompts } = await connect({
      loseExecuteResponse: true,
      now: () => now,
    });
    const first = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(first.isError).toBe(true);
    now = new Date(proposal.expiresAt);
    const retry = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(retry.isError).not.toBe(true);
    expect(retry.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ ...savedResult, alreadyExecuted: true }),
      },
    ]);
    expect(prompts).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(3);
    expect(
      request.mock.calls.map(
        ([body]) => cashApiRequestSchema.parse(body).operation,
      ),
    ).toEqual(["review", "execute", "review"]);
  });

  it.each([
    { ...savedResult, proposalId: targetId },
    { ...savedResult, sourceHref: "https://other.example.test/payments/1" },
  ])("rejects an invalid saved acknowledgement", async (review) => {
    const { client, request, prompts } = await connect({ review });
    const result = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(result.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(prompts).toHaveLength(0);
  });

  it.each<ElicitResult>([
    { action: "decline" },
    { action: "cancel" },
    { action: "accept", content: { confirm: false } },
  ])(
    "does not execute after $action without explicit true confirmation",
    async (reply) => {
      const { client, request } = await connect({ reply });
      const result = await client.callTool({
        name: "approve_cash_change",
        arguments: { proposalId },
      });
      expect(JSON.stringify(result)).toContain("NOT_APPROVED");
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects malformed acceptance without executing", async () => {
    const { client, request } = await connect({
      reply: { action: "accept", content: {} },
    });
    const result = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(result.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the client cannot display approval forms", async () => {
    const { client, request, loadCredentials } = await connect({
      supported: false,
    });
    const result = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(loadCredentials).not.toHaveBeenCalled();
  });

  it("does not accept an approval flag from the model", async () => {
    const { client, request, prompts } = await connect();
    const result = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId, approved: true },
    });
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(prompts).toHaveLength(0);
  });

  it("rejects a different proposal returned for review", async () => {
    const { client, request, prompts } = await connect({
      review: { ...proposal, proposalId: targetId },
    });
    const result = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(result.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(prompts).toHaveLength(0);
  });

  it("rejects an expired proposal before asking", async () => {
    const { client, request, prompts } = await connect({
      now: () => new Date(proposal.expiresAt),
    });
    const result = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(result.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(prompts).toHaveLength(0);
  });

  it("does not execute if a proposal expires while approval is open", async () => {
    let now = at;
    const { client, request } = await connect({
      now: () => now,
      onApproval: () => {
        now = new Date(proposal.expiresAt);
      },
    });
    const result = await client.callTool({
      name: "approve_cash_change",
      arguments: { proposalId },
    });
    expect(result.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid review data and foreign record links", async () => {
    for (const review of [
      { ...proposal, digest: "invalid" },
      { ...proposal, sourceHref: "https://other.example.test/orders/1" },
    ]) {
      const { client, request, prompts } = await connect({ review });
      const result = await client.callTool({
        name: "approve_cash_change",
        arguments: { proposalId },
      });
      expect(result.isError).toBe(true);
      expect(request).toHaveBeenCalledTimes(1);
      expect(prompts).toHaveLength(0);
    }
  });

  it("does not disclose caught exception details or credentials", async () => {
    const { client } = await connect({
      requestError: new Error(`sensitive ${credentials.token}`),
    });
    const result = await client.callTool({
      name: "prepare_cash_change",
      arguments: { change },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(credentials.token);
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("uses a fixed HTTPS endpoint and refuses redirects", async () => {
    const fetchMock = vi.fn(async () => Response.json(proposal));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = await connect({ realApi: true });
    const result = await client.callTool({
      name: "prepare_cash_change",
      arguments: { change },
    });
    expect(result.isError).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/api/erp-cash`,
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        cache: "no-store",
      }),
    );
  });

  it.each([400, 409, 410])(
    "surfaces only bounded server validation on HTTP %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            { error: "The term balance changed. Prepare a new proposal." },
            { status },
          ),
        ),
      );
      const { client } = await connect({ realApi: true });
      const result = await client.callTool({
        name: "prepare_cash_change",
        arguments: { change },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain("The term balance changed");
    },
  );

  it("never exposes unexpected server-error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: credentials.token }, { status: 500 }),
      ),
    );
    const { client } = await connect({ realApi: true });
    const result = await client.callTool({
      name: "prepare_cash_change",
      arguments: { change },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(credentials.token);
  });

  it.each([
    "http://erp.example.test",
    "https://erp.example.test/path",
    "https://user:password@erp.example.test",
  ])("rejects unsafe configured origin %s", (invalidOrigin) => {
    expect(() =>
      createErpCashBridge({
        origin: invalidOrigin,
        loadCredentials: async () => credentials,
      }),
    ).toThrow();
  });
});
