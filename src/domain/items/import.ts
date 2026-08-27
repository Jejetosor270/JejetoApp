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
  if (!area) return null;
  const name = area.replace(/^\s*[A-Za-z0-9.]+\s*[-–—:]\s*/, "").trim();
  if (!name) return null;
  return name
    .toLocaleLowerCase("en")
    .replace(/\b\p{Letter}/gu, (letter) => letter.toLocaleUpperCase("en"))
    .slice(0, 160);
}

export function rowWarnings(
  row: Pick<
    BudgetReviewRow,
    | "buildingId"
    | "quantity"
    | "roomId"
    | "supplierId"
    | "supplierName"
    | "totalPurchasePriceHt"
    | "unitPurchasePriceHt"
    | "vatRate"
  >,
): string[] {
  const warnings: string[] = [];
  if (!row.buildingId) warnings.push("Building missing; allocate when known.");
  if (row.supplierName && !row.supplierId)
    warnings.push("Supplier not matched.");
  if (!row.roomId)
    warnings.push("Room missing; choose or create one if applicable.");
  if (!row.vatRate) warnings.push("VAT missing; review if applicable.");
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
    warnings.push("Quantity × unit price does not match total purchase HT.");
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
