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

describe("Directory navigation", () => {
  it("groups Projects, Clients, and Suppliers together", () => {
    const directory = navigationForRole("ADMIN", true).find(
      (group) => group.label === "Directory",
    );
    expect(directory?.items.map((item) => item.href)).toEqual([
      "/projects",
      "/clients",
      "/suppliers",
    ]);
  });
});

describe("operational terminology", () => {
  it("distinguishes Supplier Orders from Client Billing", () => {
    const items = visibleItems(true);
    expect(items).toContainEqual(
      expect.objectContaining({ href: "/orders", label: "Supplier Orders" }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({ href: "/billing", label: "Client Billing" }),
    );
  });
});
