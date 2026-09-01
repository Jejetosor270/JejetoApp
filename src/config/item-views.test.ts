import { describe, expect, it } from "vitest";

import { itemViewColumns } from "@/config/item-views";

describe("Item operational view presets", () => {
  it("keeps finance, status, and tracking concerns in focused column sets", () => {
    expect(itemViewColumns.financial).toContain("Markup %");
    expect(itemViewColumns.financial).toContain("Variance");
    expect(itemViewColumns.financial).not.toContain("Margin");
    expect(itemViewColumns.status).toContain("Vendor payment status");
    expect(itemViewColumns.tracking).toEqual(
      expect.arrayContaining(["Fabricator", "Warehouse"]),
    );
  });
});
