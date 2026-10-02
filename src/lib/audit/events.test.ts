import { beforeEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({
  auditEvent: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
import { listAuditEvents } from "./events";

describe("exact record Activity filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.auditEvent.findMany.mockResolvedValue([]);
    database.auditEvent.count.mockResolvedValue(0);
  });
  it("uses the same exact entity type/id scope for rows and pagination count", async () => {
    const entityId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await listAuditEvents({
      entityId,
      entityType: "ORDER",
      page: 2,
      pageSize: 25,
    });
    expect(database.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityId, entityType: "ORDER" },
        skip: 25,
        take: 25,
      }),
    );
    expect(database.auditEvent.count).toHaveBeenCalledWith({
      where: { entityId, entityType: "ORDER" },
    });
  });
  it("rejects an invalid ID rather than silently loading all records", async () => {
    await expect(
      listAuditEvents({ entityId: "bad?id=other", page: 1, pageSize: 25 }),
    ).rejects.toThrow();
    expect(database.auditEvent.findMany).not.toHaveBeenCalled();
    expect(database.auditEvent.count).not.toHaveBeenCalled();
  });
});
