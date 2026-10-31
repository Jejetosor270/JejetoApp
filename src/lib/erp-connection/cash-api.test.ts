import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  prepare: vi.fn(),
  review: vi.fn(),
  execute: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("./auth", () => ({
  authenticateCashConnection: mocks.authenticate,
  ConnectionAccessError: class extends Error {},
}));
vi.mock("./cash-proposals", () => ({
  prepareCashChange: mocks.prepare,
  reviewCashChange: mocks.review,
  executeCashChange: mocks.execute,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => {
    throw new Error("API boundary tests must not access a database.");
  },
}));
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
  };
});

import { handleErpCashRequest } from "./cash-api";
import { CashProposalError } from "./cash-context";
import { ConnectionAccessError } from "./auth";
import { PaymentValidationError } from "@/lib/payments/errors";
import {
  withErpConnectionIngress,
  withErpConnectionRequest,
  ErpConnectionLimitError,
} from "./request-guard";

const origin = "https://erp.example.test";
const endpoint = `${origin}/api/erp-cash`;
const authorization = "Bearer fictional-cash-connection";
const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Test Owner",
  email: "owner@example.test",
  role: "ADMIN",
  isActive: true,
};
const connection = {
  actor,
  tokenId: "00000000-0000-4000-8000-000000000002",
  approvalPublicKey: "fictional-public-key",
};
const proposalId = "00000000-0000-4000-8000-000000000003";
const change = {
  action: "RECORD_SUPPLIER_PAYMENT",
  targetId: "00000000-0000-4000-8000-000000000004",
  amount: "123.4500",
  currency: "EUR",
  date: "2026-10-31",
};
const execution = {
  operation: "execute",
  proposalId,
  approvedAt: "2026-10-31T12:00:00.000Z",
  signature: "a".repeat(86),
};
function request(
  body: unknown,
  headers: Record<string, string> = {},
  url = endpoint,
) {
  return new Request(url, {
    method: "POST",
    headers: { authorization, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function expectNoOperations() {
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.review).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ERP_MCP_ORIGIN", origin);
  vi.stubEnv("ERP_MCP_OWNER_ID", actor.id);
  mocks.authenticate.mockImplementation(async (header: string | null) =>
    header === authorization ? connection : null,
  );
  mocks.prepare.mockResolvedValue({ proposalId, status: "PREPARED" });
  mocks.review.mockResolvedValue({ proposalId, status: "REVIEWED" });
  mocks.execute.mockResolvedValue({
    proposalId,
    resultId: change.targetId,
    alreadyExecuted: false,
    sourceHref: `${origin}/payments/${change.targetId}`,
  });
  vi.mocked(withErpConnectionIngress).mockImplementation(async (_id, work) =>
    work(),
  );
  vi.mocked(withErpConnectionRequest).mockImplementation(async (_id, work) =>
    work(),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ERP cash API boundary", () => {
  it("routes prepare/review to authenticated services without invalidating cash pages", async () => {
    const prepared = await handleErpCashRequest(
      request({ operation: "prepare", change }),
    );
    expect(prepared.status).toBe(200);
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(connection, change);
    const reviewed = await handleErpCashRequest(
      request({ operation: "review", proposalId }),
    );
    expect(reviewed.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledExactlyOnceWith(
      connection,
      proposalId,
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(prepared.headers.get("cache-control")).toBe("private, no-store");
    expect(prepared.headers.get("x-content-type-options")).toBe("nosniff");
    expect(prepared.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("passes only signed execution fields and refreshes affected financial views", async () => {
    const response = await handleErpCashRequest(request(execution));
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(
      connection,
      execution,
    );
    expect(await response.json()).toMatchObject({
      resultId: change.targetId,
      alreadyExecuted: false,
    });
    expect(mocks.revalidate.mock.calls).toEqual(
      [
        "/",
        "/projects",
        "/orders",
        "/billing",
        "/payments",
        "/receipts",
        "/calendar",
        "/reports",
      ].map((path) => [path, "layout"]),
    );
  });

  it.each(["", "Bearer fictional-read-only-key", "Bearer invalid"])(
    "rejects missing/read-only/invalid credentials: %s",
    async (header) => {
      const response = await handleErpCashRequest(
        request(execution, {
          authorization: header,
          cookie: "next-auth.session-token=fictional",
        }),
      );
      expect(response.status).toBe(401);
      expectNoOperations();
    },
  );

  it.each(["GET", "PUT", "DELETE", "OPTIONS"])(
    "rejects %s without authentication or operations",
    async (method) => {
      const response = await handleErpCashRequest(
        new Request(endpoint, { method }),
      );
      expect(response.status).toBe(405);
      expect(mocks.authenticate).not.toHaveBeenCalled();
      expectNoOperations();
    },
  );

  it.each(["ERP_MCP_ORIGIN", "ERP_MCP_OWNER_ID"])(
    "fails closed without %s",
    async (name) => {
      vi.stubEnv(name, "");
      const response = await handleErpCashRequest(request(execution));
      expect(response.status).toBe(503);
      expect(mocks.authenticate).not.toHaveBeenCalled();
      expectNoOperations();
    },
  );

  it.each([
    { origin: "https://other.example.test" },
    { origin: "null" },
    { host: "other.example.test" },
  ])(
    "rejects foreign origin/host before authentication: %o",
    async (headers) => {
      const response = await handleErpCashRequest(request(execution, headers));
      expect(response.status).toBe(403);
      expect(mocks.authenticate).not.toHaveBeenCalled();
      expectNoOperations();
    },
  );

  it.each([
    `${endpoint}?token=fictional`,
    "https://other.example.test/api/erp-cash",
  ])("rejects query credentials or wrong request origin", async (url) => {
    const response = await handleErpCashRequest(request(execution, {}, url));
    expect(response.status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expectNoOperations();
  });

  it("rejects an oversized actual body regardless of declared length", async () => {
    const response = await handleErpCashRequest(
      request(
        {
          operation: "prepare",
          change: { ...change, notes: "x".repeat(20_000) },
        },
        { "content-length": "100" },
      ),
    );
    expect(response.status).toBe(413);
    expectNoOperations();
  });

  it("requires JSON and rejects malformed or missing bodies", async () => {
    expect(
      (
        await handleErpCashRequest(
          request(execution, { "content-type": "text/plain" }),
        )
      ).status,
    ).toBe(415);
    for (const body of ["{invalid", undefined]) {
      const response = await handleErpCashRequest(
        new Request(endpoint, {
          method: "POST",
          headers: { authorization, "content-type": "application/json" },
          ...(body === undefined ? {} : { body }),
        }),
      );
      expect(response.status).toBe(400);
    }
    expectNoOperations();
  });

  it.each([
    { ...execution, approved: true },
    { ...execution, actorId: actor.id },
    { ...execution, signature: true },
    { operation: "prepare", change: { ...change, amount: 123.45 } },
    { operation: "prepare", change: { ...change, date: "2026-02-30" } },
    { operation: "prepare", change: { ...change, approval: true } },
    { operation: "record_payment", change },
  ])(
    "rejects forged approval flags, extra fields and invalid cash input",
    async (body) => {
      const response = await handleErpCashRequest(request(body));
      expect(response.status).toBe(400);
      expectNoOperations();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );

  it("returns safe business validation and proposal conflict messages", async () => {
    mocks.prepare.mockRejectedValueOnce(
      new PaymentValidationError("The amount exceeds the term balance."),
    );
    let response = await handleErpCashRequest(
      request({ operation: "prepare", change }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "The amount exceeds the term balance.",
    });
    mocks.review.mockRejectedValueOnce(
      new CashProposalError("The record changed. Review it again.", 409),
    );
    response = await handleErpCashRequest(
      request({ operation: "review", proposalId }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "The record changed. Review it again.",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects a credential revoked inside the execution transaction", async () => {
    mocks.execute.mockRejectedValueOnce(new ConnectionAccessError());
    const response = await handleErpCashRequest(request(execution));
    expect(response.status).toBe(401);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("contains authentication failures and logs no credential or exception text", async () => {
    mocks.authenticate.mockRejectedValueOnce(
      new Error(`private authentication diagnostic ${authorization}`),
    );
    const response = await handleErpCashRequest(request(execution));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(authorization);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "ERP cash connection failed",
      { category: "cash_request_failed" },
    );
    expectNoOperations();
  });

  it("sanitizes unexpected execution failures and preserves retry guidance", async () => {
    mocks.execute.mockRejectedValueOnce(
      new Error("private SQL and customer record contents"),
    );
    const response = await handleErpCashRequest(request(execution));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private SQL");
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "ERP cash connection failed",
      { category: "cash_request_failed" },
    );
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("returns a conflict for a serialized financial write race", async () => {
    mocks.execute.mockRejectedValueOnce({
      code: "P2034",
      message: "private transaction details",
    });
    const response = await handleErpCashRequest(request(execution));
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("private transaction details");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("limits bursts before auth and owner requests before operations", async () => {
    vi.mocked(withErpConnectionIngress).mockRejectedValueOnce(
      new ErpConnectionLimitError(),
    );
    let response = await handleErpCashRequest(request(execution));
    expect(response.status).toBe(429);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    vi.mocked(withErpConnectionRequest).mockRejectedValueOnce(
      new ErpConnectionLimitError(),
    );
    response = await handleErpCashRequest(request(execution));
    expect(response.status).toBe(429);
    expectNoOperations();
  });
});
