import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  analyzeColumnMapping,
  BudgetFileError,
  deterministicColumnMapping,
  needsBudgetMappingFallback,
  normalizeBudgetHeader,
  parseBudgetWorkbook,
} from "@/lib/items/xlsx";

async function workbookBytes(
  headers: string[],
  count: number,
  formula = false,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Budget");
  sheet.addRow(headers);
  for (let index = 1; index <= count; index += 1)
    sheet.addRow([
      `400 - LIVING ROOM`,
      `I-${index}`,
      `Chair ${index}`,
      "Vendor A",
      index === 1 ? 2.5 : 2,
      "EA",
      10,
      formula
        ? {
            formula: `E${index + 1}*G${index + 1}`,
            result: index === 1 ? 25 : 20,
          }
        : index === 1
          ? 25
          : 20,
    ]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("deterministic XLSX Project-budget parsing", () => {
  const headers = [
    "Area",
    "Item #",
    "Description",
    "Vendor",
    "QTY",
    "U/M",
    "Base Unit Cost",
    "Base Total Cost",
  ];

  it("maps known reordered columns and preserves Decimal/formula values", async () => {
    const parsed = await parseBudgetWorkbook(
      await workbookBytes(headers, 2, true),
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.fields.quantity).toBe("2.5");
    expect(parsed.rows[0]?.fields.totalPurchasePriceHt).toBe("25");
    expect(parsed.mapping["Base Unit Cost"]).toBe("unitPurchasePriceHt");
    expect(
      deterministicColumnMapping([
        "Comments",
        "Mark Up (%)",
        "Extra custom field",
      ]),
    ).toEqual({ Comments: "notes", "Mark Up (%)": "markupRate" });
  });

  it("maps the primary procurement budget columns without AI", () => {
    const result = analyzeColumnMapping([
      "Area",
      "Item #",
      "Description",
      "Vendor",
      "Item Number/Name",
      "Finish/Color",
      "Weight Each",
      "Volume Each",
      "QTY",
      "U/M",
      "Weight Total",
      "Volume Total",
      "Base Unit Cost",
      "Base Total Cost",
      "Unit Cost",
      "Total Cost",
      "Mark Up (%)",
      "Unit Mark Up (€)",
      "Total Mark Up (€)",
      "VAT (%)",
      "Total VAT (€)",
      "Billing Entity Country",
      "Comments",
    ]);

    expect(result.mapping).toMatchObject({
      Area: "area",
      "Base Total Cost": "totalPurchasePriceHt",
      "Base Unit Cost": "unitPurchasePriceHt",
      Description: "description",
      "Item #": "itemReference",
      "Item Number/Name": "supplierSku",
      "Mark Up (%)": "markupRate",
      QTY: "quantity",
      "Total Cost": "totalSellingPriceHt",
      "Unit Cost": "unitSellingPriceHt",
      "VAT (%)": "vatRate",
      Vendor: "vendor",
    });
    expect(result.mapping["Mark Up (%)"]).not.toBe("targetMarginRate");
    expect(result.ignoredHeaders).toEqual([
      "Unit Mark Up (€)",
      "Total Mark Up (€)",
    ]);
    expect(result.ambiguousHeaders).toEqual([]);
    expect(needsBudgetMappingFallback(result)).toBe(false);
  });

  it("normalizes capitalization, spacing, punctuation, currency suffixes, and line breaks", () => {
    expect(normalizeBudgetHeader("  BASE  UNIT\nCOST (€) ")).toBe(
      "base unit cost",
    );
    expect(
      deterministicColumnMapping([
        "  BASE  UNIT\nCOST (€) ",
        "base total cost",
        "UNIT COST",
        "Total Cost (€)",
        "Item # ",
        "Qty",
      ]),
    ).toMatchObject({
      "  BASE  UNIT\nCOST (€) ": "unitPurchasePriceHt",
      "base total cost": "totalPurchasePriceHt",
      "UNIT COST": "unitSellingPriceHt",
      "Total Cost (€)": "totalSellingPriceHt",
      "Item # ": "itemReference",
      Qty: "quantity",
    });
  });

  it("uses structural inference only for generic prices with purchase context", () => {
    expect(
      analyzeColumnMapping([
        "Base Unit Cost",
        "Unit Price",
        "Base Total Cost",
        "Total Price",
      ]),
    ).toMatchObject({
      mapping: {
        "Base Total Cost": "totalPurchasePriceHt",
        "Base Unit Cost": "unitPurchasePriceHt",
        "Total Price": "totalSellingPriceHt",
        "Unit Price": "unitSellingPriceHt",
      },
      mappingLevels: {
        "Total Price": "STRUCTURAL",
        "Unit Price": "STRUCTURAL",
      },
    });
  });

  it("accepts a useful budget row when optional columns are absent", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Early budget");
    sheet.addRow(["Item #", "QTY"]);
    sheet.addRow(["EARLY-1", 3]);

    const parsed = await parseBudgetWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
    );
    expect(parsed.rows[0]?.fields).toEqual({
      itemReference: "EARLY-1",
      quantity: "3",
    });
  });

  it("skips section and summary rows while retaining the source subtotal", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Villa 1");
    sheet.addRow([
      "Area",
      "Item #",
      "Description",
      "Vendor",
      "QTY",
      "Base Unit Cost",
      "Base Total Cost",
      "Unit Cost",
      "Total Cost",
      "Mark Up (%)",
      "VAT (%)",
    ]);
    sheet.addRow(["100 - FICTIONAL VENDOR"]);
    sheet.addRow([
      "1201 - MASTER BEDROOM",
      "I-1",
      "Table lamp",
      "Fictional Vendor",
      2,
      100,
      { formula: "E3*F3", result: 200 },
      115,
      { formula: "E3*H3", result: 230 },
      0.15,
      0.2,
    ]);
    sheet.addRow([null, null, "SUBTOTAL", null, null, null, 200]);
    sheet.addRow([null, null, "FREIGHT ESTIMATE", null, null, null, 25]);

    const parsed = await parseBudgetWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.detectedTotal).toBe("200");
    expect(parsed.rows[0]?.fields).toMatchObject({
      area: "1201 - MASTER BEDROOM",
      markupRate: "0.15",
      totalPurchasePriceHt: "200",
      totalSellingPriceHt: "230",
      unitPurchasePriceHt: "100",
      unitSellingPriceHt: "115",
      vendor: "Fictional Vendor",
    });
  });

  it("supports 500 rows and rejects row 501", async () => {
    const parsed = await parseBudgetWorkbook(await workbookBytes(headers, 500));
    expect(parsed.rows).toHaveLength(500);
    await expect(
      parseBudgetWorkbook(await workbookBytes(headers, 501)),
    ).rejects.toBeInstanceOf(BudgetFileError);
  });

  it("rejects malformed workbooks", async () => {
    await expect(
      parseBudgetWorkbook(new Uint8Array([1, 2, 3])),
    ).rejects.toThrow("corrupt or unsupported");
  });
});
