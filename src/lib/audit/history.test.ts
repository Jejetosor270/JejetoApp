import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "MANAGER",
  requireUser: vi.fn(),
  events: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: state.requireUser,
  canEditMasterData: (role: string) => role === "ADMIN" || role === "MANAGER",
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ auditEvent: { findMany: state.events } }),
}));
import { getRecordHistory } from "./history";

const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const event = {
  id: "event",
  occurredAt: new Date("2026-10-01T12:00:00Z"),
  actorName: "Former employee",
  actorEmail: "private@example.invalid",
  action: "UPDATED",
  summary: "Updated Project budget and pricing.",
  metadata: { field: "passwordHash", previous: "private", value: "private" },
};

describe("authorized record history reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.role = "MANAGER";
    state.requireUser.mockImplementation(async () => ({ role: state.role }));
    state.events.mockResolvedValue([event]);
  });
  it.each(["ADMIN", "MANAGER"])(
    "returns only safe latest20 data for %s and exact record scope",
    async (role) => {
      state.role = role;
      state.events.mockResolvedValue(
        Array.from({ length: 21 }, (_, index) => ({
          ...event,
          id: `event-${index}`,
        })),
      );
      const result = await getRecordHistory("PROJECT", id);
      expect(state.requireUser).toHaveBeenCalledOnce();
      expect(state.events).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: "PROJECT", entityId: id },
          take: 21,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        }),
      );
      expect(result?.entries).toHaveLength(20);
      expect(result?.hasMore).toBe(true);
      expect(result?.entries[0]).toEqual({
        id: "event-0",
        occurredAt: "2026-10-01T12:00:00.000Z",
        actorName: "Former employee",
        action: "UPDATED",
        summary: event.summary,
        changes: [],
      });
      expect(JSON.stringify(result)).not.toContain("private");
      expect(result?.activityHref).toContain(`entityId=${id}`);
    },
  );
  it("does not query or serialize any audit data for USER", async () => {
    state.role = "USER";
    expect(await getRecordHistory("ORDER", id)).toBeNull();
    expect(state.events).not.toHaveBeenCalled();
  });
  it("requires an active authenticated user before touching audit records", async () => {
    state.requireUser.mockRejectedValue(new Error("unauthenticated"));
    await expect(getRecordHistory("ORDER", id)).rejects.toThrow(
      "unauthenticated",
    );
    expect(state.events).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs before a query and exposes an explicit empty result", async () => {
    await expect(getRecordHistory("ORDER", "invalid")).rejects.toThrow();
    expect(state.events).not.toHaveBeenCalled();
    state.events.mockResolvedValue([]);
    expect(await getRecordHistory("BILLING_DOCUMENT", id)).toMatchObject({
      entries: [],
      hasMore: false,
    });
  });
});
