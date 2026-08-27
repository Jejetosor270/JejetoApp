import Decimal from "decimal.js";
import { z } from "zod";

import { MAX_BUDGET_ROWS } from "@/config/item-extraction";
import { quantityTimesUnitMatchesTotal } from "@/domain/items/calculations";

export const budgetFields = [
  "area",
  "itemReference",
  "description",
  "vendor",
  "supplierSku",
  "finishColor",
  "weightEach",
  "volumeEach",
  "quantity",
  "unitOfMeasure",
  "totalWeight",
  "totalVolume",
  "unitPurchasePriceHt",
  "totalPurchasePriceHt",
  "markupRate",
  "unitSellingPriceHt",
  "totalSellingPriceHt",
  "vatRate",
  "vatAmount",
  "billingCountry",
  "notes",
  "category",
  "brand",
] as const;
export type BudgetField = (typeof budgetFields)[number];

export const budgetReviewColumnLabels = {
  itemReference: "Item #",
  description: "Description",
  vendor: "Supplier",
  area: "Room / Area",
  quantity: "Qty",
  unitOfMeasure: "Unit",
  unitPurchasePriceHt: "Purchase Unit HT",
  totalPurchasePriceHt: "Purchase Total HT",
  unitSellingPriceHt: "Selling Unit HT",
  totalSellingPriceHt: "Selling Total HT",
  markupRate: "Markup %",
  vatRate: "VAT %",
} satisfies Partial<Record<BudgetField, string>>;

export const budgetReviewVisibleColumns = [
  "Include",
  "Action / Match",
  "Item #",
  "Description",
  "Supplier",
  "Building",
  "Room",
  "Qty",
  "Unit",
  "Purchase Unit HT",
  "Purchase Total HT",
  "Selling Unit HT",
  "Selling Total HT",
  "Markup %",
  "VAT %",
  "Warnings",
] as const;

export const budgetColumnMappingSchema = z.record(
  z.string(),
  z.enum(budgetFields),
);
const decimal = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/)
  .nullable();
const rateDecimal = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .nullable();
export const budgetReviewRowSchema = z.object({
  action: z.enum(["CREATE", "UPDATE", "SKIP"]),
  brand: z.string().max(160).nullable(),
  buildingId: z.uuid().nullable(),
  category: z.string().max(80).nullable(),
  commercialStatus: z.enum(["BUDGET", "QUOTED"]),
  description: z.string().min(1).max(240),
  detailedDescription: z.string().max(4000).nullable(),
  diffs: z
    .array(
      z.object({
        field: z.string(),
        before: z.string().nullable(),
        after: z.string().nullable(),
      }),
    )
    .max(30),
  existingItemId: z.uuid().nullable(),
  finishColor: z.string().max(240).nullable(),
  include: z.boolean(),
  itemReference: z.string().max(120).nullable(),
  markupRate: rateDecimal,
  matchStatus: z.enum(["NEW", "MATCHED", "POSSIBLE_MATCH", "CONFLICT"]),
  notes: z.string().max(4000).nullable(),
  quantity: decimal,
  roomId: z.uuid().nullable(),
  sourceReference: z.string().max(120).nullable(),
  purchaseCurrencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  sourceRowNumber: z.number().int().positive(),
  sourceSheet: z.string().max(120),
  supplierId: z.uuid().nullable(),
  supplierName: z.string().max(200).nullable(),
  supplierSku: z.string().max(160).nullable(),
  totalPurchasePriceHt: decimal,
  totalSellingPriceHt: decimal,
  totalVolume: decimal,
  totalWeight: decimal,
  unitOfMeasure: z.string().max(24).nullable(),
  unitPurchasePriceHt: decimal,
  unitSellingPriceHt: decimal,
  vatAmount: decimal,
  vatRate: rateDecimal,
  volumeEach: decimal,
  weightEach: decimal,
  warnings: z.array(z.string().max(300)).max(20),
});
export const confirmBudgetImportSchema = z.object({
  defaultBuildingId: z.uuid().nullable(),
  defaultSupplierId: z.uuid().nullable(),
  extractionModel: z.string().max(120).nullable(),
  extractionProvider: z.string().max(50).nullable(),
  filename: z.string().min(1).max(255),
  mapping: budgetColumnMappingSchema,
  projectId: z.uuid(),
  rows: z.array(budgetReviewRowSchema).max(MAX_BUDGET_ROWS),
});
export type BudgetReviewRow = z.infer<typeof budgetReviewRowSchema>;
export type ConfirmBudgetImportInput = z.infer<
  typeof confirmBudgetImportSchema
>;

export function normalizeImportText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
  return normalized || null;
}

export function proposedRoomName(area: string | null): string | null {
  return parseBudgetArea(area)?.name ?? null;
}

export function proposedRoomCode(area: string | null): string | null {
  return parseBudgetArea(area)?.code ?? null;
}

export function parseBudgetArea(
  area: string | null,
): { code: string | null; name: string } | null {
  if (!area) return null;
  const trimmed = area.trim();
  const parsed = trimmed.match(/^\s*(\d+(?:\.\d+)?)\s*[-–—:]\s*(.+)$/u);
  const name = (parsed?.[2] ?? trimmed).trim();
  if (!name) return null;
  return {
    code: parsed?.[1]?.slice(0, 40) ?? null,
    name: name
      .toLocaleLowerCase("en")
      .replace(/\b\p{Letter}/gu, (letter) => letter.toLocaleUpperCase("en"))
      .slice(0, 160),
  };
}

export function rowWarnings(
  row: Pick<
    BudgetReviewRow,
    | "markupRate"
    | "purchaseCurrencyCode"
    | "quantity"
    | "supplierId"
    | "supplierName"
    | "totalPurchasePriceHt"
    | "totalSellingPriceHt"
    | "unitPurchasePriceHt"
    | "unitSellingPriceHt"
  >,
): string[] {
  const warnings: string[] = [];
  if (row.supplierName && !row.supplierId)
    warnings.push(`Supplier “${row.supplierName}” is unresolved.`);
  if (
    !row.purchaseCurrencyCode &&
    (row.unitPurchasePriceHt ||
      row.totalPurchasePriceHt ||
      row.unitSellingPriceHt ||
      row.totalSellingPriceHt)
  )
    warnings.push("Purchase currency is required for financial values.");
  if (
    row.quantity &&
    row.unitPurchasePriceHt &&
    row.totalPurchasePriceHt &&
    !quantityTimesUnitMatchesTotal(
      row.quantity,
      row.unitPurchasePriceHt,
      row.totalPurchasePriceHt,
    )
  )
    warnings.push("Purchase total does not match quantity × purchase unit HT.");
  if (
    row.quantity &&
    row.unitSellingPriceHt &&
    row.totalSellingPriceHt &&
    !quantityTimesUnitMatchesTotal(
      row.quantity,
      row.unitSellingPriceHt,
      row.totalSellingPriceHt,
    )
  )
    warnings.push("Selling total does not match quantity × selling unit HT.");
  if (
    row.markupRate &&
    row.totalPurchasePriceHt &&
    row.totalSellingPriceHt &&
    new Decimal(row.totalPurchasePriceHt)
      .times(new Decimal(1).plus(row.markupRate))
      .minus(row.totalSellingPriceHt)
      .abs()
      .greaterThan("0.02")
  )
    warnings.push("Markup does not reconcile purchase and selling totals.");
  return warnings;
}

export function importReconciliation(
  rows: BudgetReviewRow[],
  detectedTotal: string | null,
) {
  const included = rows.filter((row) => row.include && row.action !== "SKIP");
  const sum = included.reduce(
    (total, row) =>
      row.totalPurchasePriceHt ? total.plus(row.totalPurchasePriceHt) : total,
    new Decimal(0),
  );
  return {
    detectedTotal,
    difference: detectedTotal ? sum.minus(detectedTotal).toFixed(4) : null,
    itemTotal: sum.toFixed(4),
  };
}
