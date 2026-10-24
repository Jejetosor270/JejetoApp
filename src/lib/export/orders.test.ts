import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listOrders: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/procurement/orders", () => ({ listOrders: mocks.listOrders }));

import { operationalCsv } from "@/lib/export/operational";

describe("Purchasing CSV", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listOrders.mockResolvedValue([
      {
        orderNumber: "PO-100",
        packageName: "Historical title",
        orderPackage: { name: "Retired group" },
        project: { name: "Project" },
        supplier: { displayName: "Supplier" },
        status: "CONFIRMED",
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        costs: {
          economicLandedCost: "100.0000",
          grossProfit: "30.0000",
          markupRate: "0.300000",
        },
        totalSellingRevenue: "130.0000",
        addedDate: "2026-10-24",
        orderDate: "2026-01-01",
      },
    ]);
  });

  it("exports the Added date and exact money without retired Package fields", async () => {
    const csv = await operationalCsv("orders", {});
    expect(csv).toContain('"Added date"');
    expect(csv).toContain('"2026-10-24"');
    expect(csv).toContain('"100.0000"');
    expect(csv).toContain('"EUR"');
    expect(csv).not.toContain('"Package"');
    expect(csv).not.toContain("Historical title");
    expect(csv).not.toContain("Retired group");
    expect(csv).not.toContain("2026-01-01");
  });

  it("ignores a legacy Package filter while preserving the Project scope", async () => {
    const projectId = "2606d557-26d0-42fa-a535-c72c743f30db";
    await operationalCsv("orders", {
      projectId,
      packageId: "2606d557-26d0-42fa-a535-c72c743f30dc",
    });
    expect(mocks.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ projectId }),
    );
    expect(mocks.listOrders.mock.calls[0]?.[0]).not.toHaveProperty("packageId");
  });
});
