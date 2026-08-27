import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => ({
  building: { findFirst: vi.fn() },
  currency: { findFirst: vi.fn() },
  item: { findMany: vi.fn(), updateMany: vi.fn() },
  logisticsLocation: { count: vi.fn() },
  procurementOrder: { findFirst: vi.fn() },
  project: { findUnique: vi.fn() },
  room: { findFirst: vi.fn() },
  supplier: { findFirst: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: vi.fn() }));

import { bulkUpdateItems, ItemValidationError } from "@/lib/items/items";

describe("transactional bulk Item updates", () => {
  beforeEach(() => vi.clearAllMocks());
  it("updates only explicitly selected IDs and validates Room/Building hierarchy", async () => {
    transaction.item.findMany.mockResolvedValue([
      { id: "item-1", projectId: "project-1" },
      { id: "item-2", projectId: "project-1" },
    ]);
    transaction.project.findUnique.mockResolvedValue({ id: "project-1" });
    transaction.building.findFirst.mockResolvedValue({ id: "building-1" });
    transaction.room.findFirst.mockResolvedValue({ id: "room-1" });
    transaction.logisticsLocation.count.mockResolvedValue(0);
    await bulkUpdateItems("actor-1", ["item-1", "item-2"], {
      buildingId: "building-1",
      roomId: "room-1",
    });
    expect(transaction.item.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["item-1", "item-2"] } },
        data: expect.objectContaining({
          buildingId: "building-1",
          roomId: "room-1",
          updatedById: "actor-1",
        }),
      }),
    );
  });

  it("rejects cross-Project Room assignment before mutation", async () => {
    transaction.item.findMany.mockResolvedValue([
      { id: "item-1", projectId: "project-1" },
    ]);
    transaction.project.findUnique.mockResolvedValue({ id: "project-1" });
    transaction.building.findFirst.mockResolvedValue(null);
    transaction.room.findFirst.mockResolvedValue(null);
    transaction.logisticsLocation.count.mockResolvedValue(0);
    await expect(
      bulkUpdateItems("actor-1", ["item-1"], {
        buildingId: "other-building",
        roomId: "other-room",
      }),
    ).rejects.toBeInstanceOf(ItemValidationError);
    expect(transaction.item.updateMany).not.toHaveBeenCalled();
  });
});
