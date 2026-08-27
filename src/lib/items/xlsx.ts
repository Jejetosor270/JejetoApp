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
  ambiguousHeaders: string[];
  conflicts: Array<{ field: BudgetField; headers: string[] }>;
  detectedTotal: string | null;
  filename: string;
  headers: string[];
  ignoredHeaders: string[];
  mappingLevels: Record<string, "EXACT" | "KNOWN" | "STRUCTURAL" | "AI">;
  mapping: Record<string, BudgetField>;
  rows: ParsedBudgetRow[];
  samples: string[][];
  sheets: string[];
  unmappedHeaders: string[];
}

const exactAliases: Partial<Record<BudgetField, readonly string[]>> = {
  area: ["Area"],
  itemReference: ["Item #"],
  description: ["Description"],
  vendor: ["Vendor"],
  supplierSku: ["Item Number/Name"],
  finishColor: ["Finish/Color"],
  quantity: ["QTY"],
  unitOfMeasure: ["U/M"],
  unitPurchasePriceHt: ["Base Unit Cost"],
  totalPurchasePriceHt: ["Base Total Cost"],
  unitSellingPriceHt: ["Unit Cost"],
  totalSellingPriceHt: ["Total Cost"],
  markupRate: ["Mark Up (%)"],
  vatRate: ["VAT (%)"],
  notes: ["Comments"],
};

const knownAliases: Record<BudgetField, readonly string[]> = {
  area: ["room", "room area", "location"],
  itemReference: [
    "item no",
    "item number",
    "item reference",
    "reference",
    "ref",
  ],
  description: ["item description", "short description", "item"],
  vendor: ["supplier", "manufacturer vendor", "vendor supplier"],
  supplierSku: [
    "supplier sku",
    "sku",
    "supplier reference",
    "supplier item",
    "supplier product",
    "product code",
  ],
  finishColor: ["finish", "color", "colour", "finish colour"],
  weightEach: ["weight each", "unit weight"],
  volumeEach: ["volume each", "unit volume"],
  quantity: ["quantity", "item quantity"],
  unitOfMeasure: ["um", "uom", "unit", "unit of measure"],
  totalWeight: ["weight total", "total weight"],
  totalVolume: ["volume total", "total volume"],
  unitPurchasePriceHt: [
    "purchase unit cost",
    "purchase unit price",
    "purchase price",
    "unit purchase price",
    "buy unit price",
    "buy price",
    "unit cost ht",
  ],
  totalPurchasePriceHt: [
    "purchase total cost",
    "purchase total price",
    "total purchase price",
    "total cost ht",
    "purchase total",
    "buy total",
  ],
  markupRate: ["mark up", "markup", "markup percent", "mark up percent"],
  unitSellingPriceHt: [
    "unit selling price",
    "unit sale price",
    "selling unit price",
  ],
  totalSellingPriceHt: ["total selling price", "selling total", "sale total"],
  vatRate: ["vat percent", "vat rate", "tax rate", "tax percent"],
  vatAmount: ["total vat", "vat amount", "total vat amount"],
  billingCountry: ["billing entity country", "billing country", "country"],
  notes: ["notes", "comment"],
  category: ["category", "type"],
  brand: ["brand", "manufacturer brand"],
};

const intentionallyIgnored = new Set(
  ["Unit Mark Up (€)", "Total Mark Up (€)"].map(normalizeBudgetHeader),
);

export function normalizeBudgetHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .trim()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\(\s*(?:€|eur|£|gbp|\$|usd)\s*\)/giu, " ")
    .replace(/[€£$]/g, " ")
    .replace(/%/g, " percent ")
    .replace(/#/g, " number ")
    .replace(/№/g, " number ")
    .replace(/&/g, " and ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasLookup(
  source: Partial<Record<BudgetField, readonly string[]>>,
): Map<string, BudgetField> {
  const result = new Map<string, BudgetField>();
  for (const [field, values] of Object.entries(source) as Array<
    [BudgetField, readonly string[]]
  >)
    for (const value of values) result.set(normalizeBudgetHeader(value), field);
  return result;
}

const exactLookup = aliasLookup(exactAliases);
const knownLookup = aliasLookup(knownAliases);

export function analyzeColumnMapping(headers: string[]) {
  const mapping: Record<string, BudgetField> = {};
  const mappingLevels: ParsedBudgetWorkbook["mappingLevels"] = {};
  for (const header of headers) {
    const key = normalizeBudgetHeader(header);
    const exact = exactLookup.get(key);
    const known = knownLookup.get(key);
    if (exact) {
      mapping[header] = exact;
      mappingLevels[header] = "EXACT";
    } else if (known) {
      mapping[header] = known;
      mappingLevels[header] = "KNOWN";
    }
  }
  const mappedFields = new Set(Object.values(mapping));
  for (const header of headers) {
    if (mapping[header]) continue;
    const key = normalizeBudgetHeader(header);
    if (key === "unit price" && mappedFields.has("unitPurchasePriceHt")) {
      mapping[header] = "unitSellingPriceHt";
      mappingLevels[header] = "STRUCTURAL";
      mappedFields.add("unitSellingPriceHt");
    } else if (
      key === "total price" &&
      mappedFields.has("totalPurchasePriceHt")
    ) {
      mapping[header] = "totalSellingPriceHt";
      mappingLevels[header] = "STRUCTURAL";
      mappedFields.add("totalSellingPriceHt");
    }
  }
  const headersByField = new Map<BudgetField, string[]>();
  for (const [header, field] of Object.entries(mapping)) {
    const values = headersByField.get(field) ?? [];
    values.push(header);
    headersByField.set(field, values);
  }
  const conflicts = [...headersByField.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([field, values]) => ({ field, headers: values }));
  const ignoredHeaders = headers.filter(
    (header) =>
      !mapping[header] &&
      intentionallyIgnored.has(normalizeBudgetHeader(header)),
  );
  const ambiguousHeaders = headers.filter((header) => {
    if (mapping[header] || ignoredHeaders.includes(header)) return false;
    return ["cost", "price", "unit price", "total price"].includes(
      normalizeBudgetHeader(header),
    );
  });
  const unmappedHeaders = headers.filter(
    (header) =>
      !mapping[header] &&
      !ignoredHeaders.includes(header) &&
      !ambiguousHeaders.includes(header),
  );
  return {
    ambiguousHeaders,
    conflicts,
    ignoredHeaders,
    mapping,
    mappingLevels,
    unmappedHeaders,
  };
}

export function deterministicColumnMapping(headers: string[]) {
  return analyzeColumnMapping(headers).mapping;
}

export function needsBudgetMappingFallback(
  workbook: Pick<ParsedBudgetWorkbook, "ambiguousHeaders" | "mapping">,
): boolean {
  const fields = new Set(Object.values(workbook.mapping));
  return (
    (!fields.has("description") && !fields.has("itemReference")) ||
    !fields.has("quantity") ||
    workbook.ambiguousHeaders.length > 0
  );
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

function isSummaryRow(fields: Partial<Record<BudgetField, string>>): boolean {
  const description = normalizeBudgetHeader(fields.description ?? "");
  return (
    !fields.itemReference &&
    /(?:^| )(?:summary|sub total|subtotal|grand total|total|total estimate|freight estimate)(?: |$)/.test(
      description,
    )
  );
}

function isSectionRow(fields: Partial<Record<BudgetField, string>>): boolean {
  return (
    Boolean(fields.area) &&
    !fields.itemReference &&
    !fields.description &&
    !fields.supplierSku &&
    !fields.quantity &&
    !fields.unitPurchasePriceHt &&
    !fields.totalPurchasePriceHt &&
    !fields.unitSellingPriceHt &&
    !fields.totalSellingPriceHt
  );
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
  const samples: string[][] = [];
  let detectedTotal: string | null = null;
  const sheetNames: string[] = [];
  for (const sheet of workbook.worksheets) {
    const header = findHeaderRow(sheet);
    if (!header) continue;
    sheetNames.push(sheet.name);
    const mapping = {
      ...analyzeColumnMapping(header.headers).mapping,
      ...mappingOverride,
    };
    header.headers.filter(Boolean).forEach((entry) => allHeaders.add(entry));
    for (let index = header.row + 1; index <= sheet.rowCount; index += 1) {
      const row = sheet.getRow(index);
      const fields: Partial<Record<BudgetField, string>> = {};
      const rawValues = header.headers.map((_, columnIndex) =>
        cellText(row.getCell(columnIndex + 1)),
      );
      header.headers.forEach((name, columnIndex) => {
        const field = mapping[name];
        const value = rawValues[columnIndex] ?? "";
        if (field && value) fields[field] = value;
      });
      if (!Object.values(fields).some(Boolean)) continue;
      if (isSummaryRow(fields)) {
        if (
          fields.totalPurchasePriceHt &&
          !normalizeBudgetHeader(fields.description ?? "").includes("freight")
        )
          detectedTotal = fields.totalPurchasePriceHt;
        continue;
      }
      if (isSectionRow(fields)) continue;
      if (samples.length < 5) samples.push(rawValues);
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
  const deterministic = analyzeColumnMapping(headers);
  const mapping = { ...deterministic.mapping, ...mappingOverride };
  const mappingLevels = { ...deterministic.mappingLevels };
  for (const header of Object.keys(mappingOverride ?? {}))
    mappingLevels[header] = "AI";
  const headersByField = new Map<BudgetField, string[]>();
  for (const [header, field] of Object.entries(mapping)) {
    const values = headersByField.get(field) ?? [];
    values.push(header);
    headersByField.set(field, values);
  }
  const conflicts = [...headersByField.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([field, values]) => ({ field, headers: values }));
  return {
    ambiguousHeaders: deterministic.ambiguousHeaders.filter(
      (header) => !mapping[header],
    ),
    conflicts,
    detectedTotal,
    filename,
    headers,
    ignoredHeaders: deterministic.ignoredHeaders,
    mapping,
    mappingLevels,
    rows,
    samples,
    sheets: sheetNames,
    unmappedHeaders: deterministic.unmappedHeaders.filter(
      (header) => !mapping[header],
    ),
  };
}
