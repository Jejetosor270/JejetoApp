import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  plan: vi.fn(),
  search: vi.fn(),
  guard: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/assistant/planner", () => ({ planAssistantSearch: mocks.plan }));
vi.mock("@/lib/assistant/search", () => ({
  searchAssistantRecords: mocks.search,
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

import { askAssistant } from "@/app/(app)/assistant-actions";
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
      expect(mocks.plan).toHaveBeenCalledWith(request);
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
