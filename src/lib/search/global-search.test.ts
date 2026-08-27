import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  building: { findMany: vi.fn() },
  client: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  procurementOrder: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
  supplier: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { globalSearch } from "@/lib/search/global-search";

describe("global Item search", () => {
  it("returns Item context and detail navigation", async () => {
    database.project.findMany.mockResolvedValue([]);
    database.building.findMany.mockResolvedValue([]);
    database.client.findMany.mockResolvedValue([]);
    database.supplier.findMany.mockResolvedValue([]);
    database.procurementOrder.findMany.mockResolvedValue([]);
    database.item.findMany.mockResolvedValue([
      {
        building: { name: "Villa 1" },
        id: "item-1",
        itemReference: "IT-42",
        name: "Dining Chair",
        project: { name: "Project A" },
        room: { name: "Dining Room" },
        supplier: { displayName: "Supplier A" },
      },
    ]);
    await expect(globalSearch("chair")).resolves.toContainEqual({
      context: "Project A · Villa 1 · Dining Room · Supplier A",
      href: "/items/item-1",
      id: "item-1",
      label: "IT-42 · Dining Chair",
      type: "Item",
    });
    expect(database.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 12 }),
    );
  });
});
