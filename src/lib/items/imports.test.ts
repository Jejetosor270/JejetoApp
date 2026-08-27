import { describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  building: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  supplier: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { prepareBudgetReview } from "@/lib/items/imports";

describe("budget duplicate and revised-Item matching", () => {
  it("proposes an explicit update with diffs and never mutates during review", async () => {
    database.supplier.findMany.mockResolvedValue([
      {
        displayName: "Supplier A",
        id: "e78182e1-404b-409c-bf2c-5dde28436099",
        legalName: "Supplier A SAS",
      },
    ]);
    database.building.findMany.mockResolvedValue([
      {
        id: "8ecea4f0-637b-40cf-9c79-680697778bb6",
        name: "Villa 1",
        rooms: [
          {
            id: "ce837518-89cb-4319-a408-cd4957263664",
            name: "Master Bedroom",
          },
        ],
        shortCode: "V1",
      },
    ]);
    database.item.findMany.mockResolvedValue([
      {
        buildingId: "8ecea4f0-637b-40cf-9c79-680697778bb6",
        category: "Furniture",
        finishColor: "Oak",
        id: "c2578e8d-08e4-4452-925e-e0eae2d6eb7f",
        itemReference: "I-1",
        name: "Chair",
        quantity: { toString: () => "8" },
        roomId: "ce837518-89cb-4319-a408-cd4957263664",
        sourceReference: "I-1",
        supplierId: "e78182e1-404b-409c-bf2c-5dde28436099",
        supplierSku: "CHAIR-1",
        totalPurchasePriceHt: { toString: () => "10000" },
        unitPurchasePriceHt: { toString: () => "1250" },
      },
    ]);
    const result = await prepareBudgetReview(
      {
        detectedTotal: null,
        filename: "revision.xlsx",
        headers: [],
        mapping: {},
        sheets: ["Budget"],
        rows: [
          {
            fields: {
              area: "1201 - MASTER BEDROOM",
              description: "Chair",
              finishColor: "Dark Oak",
              itemReference: "I-1",
              markupRate: "30%",
              quantity: "10",
              supplierSku: "CHAIR-1",
              totalPurchasePriceHt: "13100",
              unitPurchasePriceHt: "1310",
              vendor: "Supplier A",
            },
            rowNumber: 2,
            sheet: "Budget",
          },
        ],
      },
      {
        buildingId: "8ecea4f0-637b-40cf-9c79-680697778bb6",
        currencyCode: "EUR",
        projectId: "2606d557-26d0-42fa-a535-c72c743f30db",
        supplierId: null,
      },
    );
    expect(result.rows[0]).toMatchObject({
      action: "UPDATE",
      existingItemId: "c2578e8d-08e4-4452-925e-e0eae2d6eb7f",
      matchStatus: "MATCHED",
    });
    expect(result.rows[0]?.diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "Quantity",
          before: "8",
          after: "10.0000",
        }),
        expect.objectContaining({
          field: "Finish",
          before: "Oak",
          after: "Dark Oak",
        }),
      ]),
    );
    expect(result.rows[0]).toMatchObject({
      markupRate: "0.300000",
      totalSellingPriceHt: "17030.0000",
      unitSellingPriceHt: "1703.0000",
    });
    expect(database.item.findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps the same Supplier SKU as separate Items in separate Rooms and flags true duplicate rows", async () => {
    database.supplier.findMany.mockResolvedValue([]);
    database.building.findMany.mockResolvedValue([
      {
        id: "8ecea4f0-637b-40cf-9c79-680697778bb6",
        name: "Villa 1",
        rooms: [
          {
            id: "ce837518-89cb-4319-a408-cd4957263664",
            name: "Living Room",
          },
          {
            id: "1ec801bb-51a3-4900-8e71-fe9664bb0230",
            name: "Dining Room",
          },
        ],
        shortCode: "V1",
      },
    ]);
    database.item.findMany.mockResolvedValue([]);
    const makeRow = (area: string, rowNumber: number) => ({
      fields: {
        area,
        description: "Chair",
        supplierSku: "CHAIR-1",
      },
      rowNumber,
      sheet: "Budget",
    });
    const separate = await prepareBudgetReview(
      {
        detectedTotal: null,
        filename: "locations.xlsx",
        headers: [],
        mapping: {},
        rows: [
          makeRow("400 - LIVING ROOM", 2),
          makeRow("500 - DINING ROOM", 3),
        ],
        sheets: ["Budget"],
      },
      {
        buildingId: "8ecea4f0-637b-40cf-9c79-680697778bb6",
        currencyCode: "EUR",
        projectId: "2606d557-26d0-42fa-a535-c72c743f30db",
        supplierId: null,
      },
    );
    expect(separate.rows.map((row) => row.matchStatus)).toEqual(["NEW", "NEW"]);

    const duplicate = await prepareBudgetReview(
      {
        detectedTotal: null,
        filename: "duplicate.xlsx",
        headers: [],
        mapping: {},
        rows: [
          makeRow("400 - LIVING ROOM", 2),
          makeRow("400 - LIVING ROOM", 3),
        ],
        sheets: ["Budget"],
      },
      {
        buildingId: "8ecea4f0-637b-40cf-9c79-680697778bb6",
        currencyCode: "EUR",
        projectId: "2606d557-26d0-42fa-a535-c72c743f30db",
        supplierId: null,
      },
    );
    expect(duplicate.rows.every((row) => row.matchStatus === "CONFLICT")).toBe(
      true,
    );
    expect(duplicate.rows.every((row) => !row.include)).toBe(true);
  });
});
