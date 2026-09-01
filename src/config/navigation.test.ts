import { describe, expect, it } from "vitest";

import { navigationForRole } from "@/config/navigation";

function visibleItems(itemManagementEnabled: boolean) {
  return navigationForRole("ADMIN", itemManagementEnabled).flatMap(
    (group) => group.items,
  );
}

describe("Item Management Beta navigation", () => {
  it("hides Item routes while the feature is disabled", () => {
    expect(visibleItems(false).some((item) => item.href === "/items")).toBe(
      false,
    );
  });

  it("labels Item Management as Beta when enabled", () => {
    expect(visibleItems(true)).toContainEqual(
      expect.objectContaining({ href: "/items", label: "Items (Beta)" }),
    );
  });
});
