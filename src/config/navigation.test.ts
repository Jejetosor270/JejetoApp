import { describe, expect, it } from "vitest";

import { isNavigationActive, navigationForRole } from "@/config/navigation";

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

describe("Workspace navigation", () => {
  it("keeps Projects primary and directories under More", () => {
    const directory = navigationForRole("ADMIN", true).find(
      (group) => group.label === "More",
    );
    expect(directory?.items.map((item) => item.href)).toEqual([
      "/clients",
      "/suppliers",
      "/calendar",
      "/items",
    ]);
  });
});

describe("operational terminology", () => {
  it("distinguishes Orders from Billing", () => {
    const items = visibleItems(true);
    expect(items).toContainEqual(
      expect.objectContaining({ href: "/orders", label: "Orders" }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({ href: "/billing", label: "Billing" }),
    );
  });
});

describe("active navigation and role visibility", () => {
  it("matches only the current route segment", () => {
    expect(isNavigationActive("/projects/abc", "/projects")).toBe(true);
    expect(isNavigationActive("/projects/abc", "/")).toBe(false);
    expect(isNavigationActive("/projects-archive", "/projects")).toBe(false);
    expect(isNavigationActive("/admin/users", "/settings")).toBe(true);
  });
  it("does not advertise administration to USER", () => {
    expect(
      navigationForRole("USER", true)
        .flatMap((group) => group.items)
        .some(
          (item) => item.href.startsWith("/admin") || item.href === "/settings",
        ),
    ).toBe(false);
  });
});
