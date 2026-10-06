import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  plan: vi.fn(),
  search: vi.fn(),
  list: vi.fn(),
  context: vi.fn(),
  guard: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/assistant/planner", () => ({ planAssistantSearch: mocks.plan }));
vi.mock("@/lib/assistant/search", () => ({
  searchAssistantRecords: mocks.search,
}));
vi.mock("@/lib/assistant/lists", () => ({ listAssistantRecords: mocks.list }));
vi.mock("@/lib/assistant/context", () => ({
  resolveAssistantContext: mocks.context,
}));
vi.mock("@/lib/assistant/request-guard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/assistant/request-guard")>();
  return { ...actual, withAssistantRequest: mocks.guard };
});
const redirectError = new Error("redirect to login");
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (error === redirectError) throw error;
  },
}));

import { askAssistant, readAssistantList } from "@/app/(app)/assistant-actions";
import { emptyAssistantFilters } from "@/domain/assistant/lists";
import { AssistantQueryError } from "@/domain/assistant/list-plan";
import { AssistantLimitError } from "@/lib/assistant/request-guard";

const request = { message: "Find order PO-104", recentMessages: [] };
const user = { id: "employee", role: "USER", isActive: true };
const record = {
  id: "order-1",
  type: "Order",
  label: "PO-104",
  context: "Example Project",
  href: "/orders/order-1",
};
const projectId = "00000000-0000-4000-8000-000000000001";
const supplierId = "00000000-0000-4000-8000-000000000002";
const listPage = {
  query: {
    ...emptyAssistantFilters,
    kind: "Order",
    query: "",
    projectId: null,
    supplierId,
    clientId: null,
  },
  page: 1,
};
const listReply = {
  message: "Matching Orders.",
  results: [record],
  moreHref: null,
  query: null,
  listing: {
    ...listPage,
    pageSize: 25,
    total: 26,
    hasNext: true,
    hasPrevious: false,
    filters: ["Supplier: Example"],
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.requireUser.mockResolvedValue(user);
  mocks.plan.mockResolvedValue({
    intent: "SEARCH",
    kind: "Order",
    query: "PO-104",
  });
  mocks.search.mockResolvedValue({ results: [record], truncated: false });
  mocks.list.mockResolvedValue(listReply);
  mocks.context.mockResolvedValue({});
  mocks.guard.mockImplementation(
    (_userId: string, work: () => Promise<unknown>) => work(),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("authenticated read-only assistant", () => {
  it.each(["USER", "MANAGER", "ADMIN"])(
    "permits existing operational read access for %s",
    async (role) => {
      mocks.requireUser.mockResolvedValue({ ...user, role });
      const response = await askAssistant(request);
      expect(response).toMatchObject({
        ok: true,
        reply: { results: [record], query: "PO-104" },
      });
      expect(mocks.requireUser).toHaveBeenCalledTimes(2);
      expect(mocks.guard).toHaveBeenCalledWith(
        "employee",
        expect.any(Function),
      );
      expect(mocks.plan).toHaveBeenCalledWith({
        ...request,
        context: null,
        previousList: null,
      });
      expect(mocks.search).toHaveBeenCalledWith("PO-104", "Order");
      expect(mocks.requireUser.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.plan.mock.invocationCallOrder[0] ?? 0,
      );
      expect(mocks.requireUser.mock.invocationCallOrder[1]).toBeLessThan(
        mocks.search.mock.invocationCallOrder[0] ?? 0,
      );
    },
  );

  it("rejects unauthenticated/inactive sessions before provider or record access", async () => {
    mocks.requireUser.mockRejectedValue(redirectError);
    await expect(askAssistant(request)).rejects.toBe(redirectError);
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rechecks active-user access after the provider call and preserves authentication redirects", async () => {
    mocks.requireUser
      .mockResolvedValueOnce(user)
      .mockRejectedValueOnce(redirectError);
    await expect(askAssistant(request)).rejects.toBe(redirectError);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("does not return results when the account changes during a request", async () => {
    mocks.requireUser
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ ...user, id: "other" });
    expect(await askAssistant(request)).toMatchObject({
      ok: false,
      code: "UNAVAILABLE",
    });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rejects client-supplied identity, roles and query instructions before AI", async () => {
    const result = await askAssistant({
      ...request,
      userId: "other",
      role: "ADMIN",
      query: { raw: "anything" },
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID" });
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it.each(["CLARIFY", "OUT_OF_SCOPE"])(
    "returns a fixed %s response without querying records",
    async (intent) => {
      mocks.plan.mockResolvedValue({ intent, kind: "All", query: null });
      expect(await askAssistant(request)).toMatchObject({
        ok: true,
        reply: { results: [], moreHref: null },
      });
      expect(mocks.search).not.toHaveBeenCalled();
    },
  );

  it("rejects untrusted provider instructions outside the validated plan", async () => {
    mocks.plan.mockResolvedValue({
      intent: "SEARCH",
      kind: "Employee",
      query: "secret",
      sql: "SELECT *",
      href: "https://example.com",
    });
    expect(await askAssistant(request)).toMatchObject({
      ok: false,
      code: "UNAVAILABLE",
    });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("does not call the provider or database when throttled", async () => {
    mocks.guard.mockRejectedValue(new AssistantLimitError());
    expect(await askAssistant(request)).toMatchObject({
      ok: false,
      code: "LIMIT",
    });
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it.each(["provider", "database"])(
    "returns a safe %s failure without logging request or error contents",
    async (source) => {
      const failure = new Error("Private commercial data must not be logged");
      if (source === "provider") mocks.plan.mockRejectedValue(failure);
      else mocks.search.mockRejectedValue(failure);
      const response = await askAssistant(request);
      expect(response).toMatchObject({ ok: false, code: "UNAVAILABLE" });
      expect(JSON.stringify(response)).not.toContain(failure.message);
      const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
      expect(logs).not.toContain(failure.message);
      expect(logs).not.toContain(request.message);
      expect(logs).not.toContain(record.label);
    },
  );
});

describe("JejetoBot scoped lists", () => {
  it("carries only validated previous filters into a follow-up", async () => {
    mocks.plan.mockResolvedValue({
      intent: "LIST",
      kind: "All",
      query: null,
      followUp: true,
      filters: { ...emptyAssistantFilters, paymentStatus: "OVERDUE" },
    });
    expect(await askAssistant({ ...request, previousList: listPage })).toEqual({
      ok: true,
      reply: listReply,
    });
    expect(mocks.list).toHaveBeenCalledWith({
      query: { ...listPage.query, paymentStatus: "OVERDUE" },
      page: 1,
    });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("resolves current-page scope only after the active employee is rechecked", async () => {
    const context = { kind: "Order", id: projectId };
    mocks.plan.mockResolvedValue({
      intent: "LIST",
      kind: "Billing",
      query: null,
      contextScope: "PROJECT",
    });
    mocks.context.mockResolvedValue({ projectId });
    await askAssistant({ ...request, context });
    expect(mocks.context).toHaveBeenCalledWith(context, "PROJECT");
    expect(mocks.requireUser.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.context.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ kind: "Billing", projectId }),
      }),
    );
  });

  it("does not silently discard filters attached to a SEARCH plan", async () => {
    mocks.plan.mockResolvedValue({
      intent: "SEARCH",
      kind: "Order",
      query: "PO-104",
      filters: { ...emptyAssistantFilters, supplier: "Example" },
    });
    await askAssistant(request);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          query: "PO-104",
          supplier: "Example",
        }),
      }),
    );
  });

  it("does not turn unavailable context into an unrestricted list", async () => {
    mocks.plan.mockResolvedValue({
      intent: "LIST",
      kind: "Order",
      query: null,
      contextScope: "PROJECT",
    });
    mocks.context.mockRejectedValue(
      new AssistantQueryError("Open a Project first."),
    );
    expect(await askAssistant(request)).toMatchObject({
      ok: true,
      reply: { message: "Open a Project first.", results: [] },
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("requires prior criteria for page navigation, even on a SEARCH plan", async () => {
    mocks.plan.mockResolvedValue({
      intent: "SEARCH",
      kind: "Order",
      query: "PO-104",
      page: "NEXT",
    });
    expect(await askAssistant(request)).toMatchObject({
      ok: true,
      reply: { results: [] },
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("blocks context and list access if the session expires during AI planning", async () => {
    mocks.plan.mockResolvedValue({
      intent: "LIST",
      kind: "Order",
      query: null,
    });
    mocks.requireUser
      .mockResolvedValueOnce(user)
      .mockRejectedValueOnce(redirectError);
    await expect(askAssistant(request)).rejects.toBe(redirectError);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each(["USER", "MANAGER", "ADMIN"])(
    "authenticates %s paging without calling AI",
    async (role) => {
      mocks.requireUser.mockResolvedValue({ ...user, role });
      const page = { ...listPage, page: 2 };
      expect(await readAssistantList(page)).toEqual({
        ok: true,
        reply: listReply,
      });
      expect(mocks.list).toHaveBeenCalledWith(page);
      expect(mocks.requireUser.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.list.mock.invocationCallOrder[0] ?? 0,
      );
      expect(mocks.plan).not.toHaveBeenCalled();
    },
  );

  it("authenticates direct paging before any database access", async () => {
    mocks.requireUser.mockRejectedValue(redirectError);
    await expect(readAssistantList(listPage)).rejects.toBe(redirectError);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each([
    { ...listPage, role: "ADMIN" },
    { ...listPage, page: 0 },
    { ...listPage, query: { ...listPage.query, supplierId: "not-an-id" } },
    { ...listPage, query: { ...listPage.query, raw: "SELECT *" } },
    { ...listPage, query: { ...listPage.query, kind: "Employee" } },
  ])("rejects forged/invalid list criteria", async (input) => {
    expect(await readAssistantList(input)).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("applies burst protection to direct list requests", async () => {
    mocks.guard.mockRejectedValue(new AssistantLimitError());
    expect(await readAssistantList(listPage)).toMatchObject({
      ok: false,
      code: "LIMIT",
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("preserves explicit ambiguity choices instead of selecting a record", async () => {
    const reply = {
      ...listReply,
      results: [],
      clarification: {
        query: listPage.query,
        choices: [
          {
            field: "supplierId",
            id: supplierId,
            label: "Example",
            context: "Supplier",
          },
        ],
      },
    };
    mocks.list.mockResolvedValue(reply);
    expect(await readAssistantList(listPage)).toEqual({ ok: true, reply });
  });

  it("does not expose database failures in list replies or logs", async () => {
    const error = new Error("Private supplier data");
    mocks.list.mockRejectedValue(error);
    const response = await readAssistantList(listPage);
    expect(response).toMatchObject({ ok: false, code: "UNAVAILABLE" });
    expect(JSON.stringify(response)).not.toContain(error.message);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      error.message,
    );
  });
});
