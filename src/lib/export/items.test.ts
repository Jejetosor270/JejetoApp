import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ item: { findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { operationalCsv } from "@/lib/export/operational";

describe("filtered Item CSV export", () => {
  it("preserves Decimal strings, currency, ISO dates, and formula protection", async () => {
    database.item.findMany.mockResolvedValue([
      {
        building: { name: "Villa" },
        category: "Furniture",
        commercialStatus: "QUOTED",
        estimatedWarehouseDate: new Date("2026-09-01T00:00:00Z"),
        itemReference: "=DANGEROUS",
        logisticsStatus: "IN_TRANSIT",
        name: "Chair",
        procurementOrder: { orderNumber: "PO-1" },
        project: { name: "Project" },
        purchaseCurrencyCode: "EUR",
        quantity: { toString: () => "2.5000" },
        room: { name: "Dining" },
        sourceType: "BUDGET_XLSX",
        supplier: { displayName: "Supplier" },
        supplierSku: "SKU-1",
        totalPurchasePriceHt: { toString: () => "2500.0000" },
        totalSellingPriceHt: { toString: () => "3200.0000" },
        unitOfMeasure: "EA",
        unitPurchasePriceHt: { toString: () => "1000.0000" },
        updatedAt: new Date("2026-08-26T10:00:00Z"),
        vatAmount: { toString: () => "500.0000" },
        vatRate: { toString: () => "0.200000" },
      },
    ]);
    const csv = await operationalCsv("items", {
      projectId: "2606d557-26d0-42fa-a535-c72c743f30db",
      query: "chair",
    });
    expect(csv).toContain("' =DANGEROUS".replace(" ", ""));
    expect(csv).toContain('"2500.0000"');
    expect(csv).toContain('"EUR"');
    expect(csv).toContain('"2026-09-01"');
  });
});
