import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BudgetFileError,
  deterministicColumnMapping,
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
