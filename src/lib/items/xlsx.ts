import "server-only";

import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";

import {
  MAX_BUDGET_FILE_BYTES,
  MAX_BUDGET_ROWS,
} from "@/config/item-extraction";
import type { BudgetField } from "@/domain/items/import";

export class BudgetFileError extends Error {}

export interface ParsedBudgetRow {
  fields: Partial<Record<BudgetField, string>>;
  rowNumber: number;
  sheet: string;
}
export interface ParsedBudgetWorkbook {
  detectedTotal: string | null;
  filename: string;
  headers: string[];
  mapping: Record<string, BudgetField>;
  rows: ParsedBudgetRow[];
  sheets: string[];
}

const aliases: Record<BudgetField, readonly string[]> = {
  area: ["area", "room", "location"],
  itemReference: ["item #", "item no", "item number", "reference", "ref"],
  description: ["description", "item description", "short description"],
  vendor: ["vendor", "supplier", "manufacturer"],
  supplierSku: [
    "item number/name",
    "supplier sku",
    "sku",
    "supplier reference",
    "product code",
  ],
  finishColor: ["finish/color", "finish", "color", "colour"],
  weightEach: ["weight each", "unit weight"],
  volumeEach: ["volume each", "unit volume"],
  quantity: ["qty", "quantity"],
  unitOfMeasure: ["u/m", "um", "uom", "unit", "unit of measure"],
  totalWeight: ["weight total", "total weight"],
  totalVolume: ["volume total", "total volume"],
  unitPurchasePriceHt: [
    "base unit cost",
    "unit purchase price",
    "unit cost ht",
    "purchase unit cost",
  ],
  totalPurchasePriceHt: [
    "base total cost",
    "total purchase price",
    "total cost ht",
    "purchase total",
  ],
  markupRate: ["mark up (%)", "mark up %", "markup", "markup %"],
  unitSellingPriceHt: ["unit cost", "unit selling price", "unit sale price"],
  totalSellingPriceHt: ["total cost", "total selling price", "selling total"],
  vatRate: ["vat (%)", "vat %", "vat rate", "tax rate"],
  vatAmount: ["total vat", "vat amount"],
  billingCountry: ["billing entity country", "billing country", "country"],
  notes: ["comments", "notes", "comment"],
  category: ["category", "type"],
  brand: ["brand", "manufacturer brand"],
};

function normalized(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .trim()
    .replace(/[_\s]+/g, " ")
    .replace(/\s*%\s*/g, " %");
}
export function deterministicColumnMapping(
  headers: string[],
): Record<string, BudgetField> {
  const mapping: Record<string, BudgetField> = {};
  for (const header of headers) {
    const key = normalized(header);
    for (const [field, names] of Object.entries(aliases) as Array<
      [BudgetField, readonly string[]]
    >) {
      if (names.some((name) => normalized(name) === key)) {
        mapping[header] = field;
        break;
      }
    }
  }
  return mapping;
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value)
      return value.result === null || value.result === undefined
        ? ""
        : String(value.result);
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
  }
  return String(value).trim();
}

function safeFilename(name: string): string {
  return (name.split(/[\\/]/).at(-1) ?? "budget.xlsx")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 255);
}

export async function validateBudgetFile(
  value: FormDataEntryValue | null,
): Promise<{ bytes: Uint8Array; filename: string }> {
  if (!(value instanceof File) || value.size === 0)
    throw new BudgetFileError("Choose a non-empty XLSX budget.");
  if (value.size > MAX_BUDGET_FILE_BYTES)
    throw new BudgetFileError("The XLSX budget must not exceed 4 MB.");
  const filename = safeFilename(value.name);
  if (!filename.toLowerCase().endsWith(".xlsx"))
    throw new BudgetFileError("Only XLSX workbooks are supported.");
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    bytes.fill(0);
    throw new BudgetFileError(
      "The uploaded file is not a valid XLSX workbook.",
    );
  }
  return { bytes, filename };
}

function findHeaderRow(
  sheet: ExcelJS.Worksheet,
): { headers: string[]; row: number } | null {
  let best: { headers: string[]; row: number; score: number } | null = null;
  for (let index = 1; index <= Math.min(sheet.rowCount, 30); index += 1) {
    const row = sheet.getRow(index);
    const headers: string[] = [];
    for (let column = 1; column <= row.cellCount; column += 1)
      headers.push(cellText(row.getCell(column)));
    const score = Object.keys(
      deterministicColumnMapping(headers.filter(Boolean)),
    ).length;
    if (score >= 2 && (!best || score > best.score))
      best = { headers, row: index, score };
  }
  return best;
}

export async function parseBudgetWorkbook(
  bytes: Uint8Array,
  filename = "budget.xlsx",
  mappingOverride?: Record<string, BudgetField>,
): Promise<ParsedBudgetWorkbook> {
  const workbook = new ExcelJS.Workbook();
  const input = Buffer.from(bytes) as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0];
  try {
    await workbook.xlsx.load(input);
  } catch {
    throw new BudgetFileError("The XLSX workbook is corrupt or unsupported.");
  }
  const rows: ParsedBudgetRow[] = [];
  const allHeaders = new Set<string>();
  let detectedTotal: string | null = null;
  const sheetNames: string[] = [];
  for (const sheet of workbook.worksheets) {
    const header = findHeaderRow(sheet);
    if (!header) continue;
    sheetNames.push(sheet.name);
    const mapping = {
      ...deterministicColumnMapping(header.headers),
      ...mappingOverride,
    };
    header.headers.filter(Boolean).forEach((entry) => allHeaders.add(entry));
    for (let index = header.row + 1; index <= sheet.rowCount; index += 1) {
      const row = sheet.getRow(index);
      const fields: Partial<Record<BudgetField, string>> = {};
      header.headers.forEach((name, columnIndex) => {
        const field = mapping[name];
        const value = cellText(row.getCell(columnIndex + 1));
        if (field && value) fields[field] = value;
      });
      if (!Object.values(fields).some(Boolean)) continue;
      const description = fields.description?.toLocaleLowerCase("en") ?? "";
      if (/^(grand )?total$/.test(description) && fields.totalPurchasePriceHt) {
        detectedTotal = fields.totalPurchasePriceHt;
        continue;
      }
      rows.push({ fields, rowNumber: index, sheet: sheet.name });
      if (rows.length > MAX_BUDGET_ROWS)
        throw new BudgetFileError(
          `The workbook contains more than ${MAX_BUDGET_ROWS} Item rows.`,
        );
    }
  }
  if (!rows.length)
    throw new BudgetFileError(
      "No recognizable Item table was found in the workbook.",
    );
  const headers = [...allHeaders];
  return {
    detectedTotal,
    filename,
    headers,
    mapping: { ...deterministicColumnMapping(headers), ...mappingOverride },
    rows,
    sheets: sheetNames,
  };
}
