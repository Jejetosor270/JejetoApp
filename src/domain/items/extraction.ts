import { z } from "zod";

import { budgetFields } from "@/domain/items/import";

const nullableDecimal = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/)
  .nullable();
const nullableRate = z
  .string()
  .regex(/^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/)
  .nullable();

export const spreadsheetMappingSuggestionSchema = z.object({
  mappings: z
    .array(
      z.object({
        confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
        field: z.enum(budgetFields).nullable(),
        header: z.string().max(200),
        reason: z.string().max(300),
      }),
    )
    .max(100),
  warnings: z.array(z.string().max(300)).max(20),
});

export const quoteItemLineSchema = z.object({
  brand: z.string().max(160).nullable(),
  description: z.string().max(4000).nullable(),
  finishColor: z.string().max(240).nullable(),
  itemReference: z.string().max(120).nullable(),
  name: z.string().min(1).max(240),
  notes: z.string().max(1000).nullable(),
  quantity: nullableDecimal,
  supplierSku: z.string().max(160).nullable(),
  totalPriceHt: nullableDecimal,
  unitOfMeasure: z.string().max(24).nullable(),
  unitPriceHt: nullableDecimal,
  vatRate: nullableRate,
  volumeEach: nullableDecimal,
  weightEach: nullableDecimal,
});

export const quoteItemExtractionSchema = z.object({
  currencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  items: z.array(quoteItemLineSchema).max(500),
  warnings: z.array(z.string().max(300)).max(50),
});

export type QuoteItemExtraction = z.infer<typeof quoteItemExtractionSchema>;
export type SpreadsheetMappingSuggestion = z.infer<
  typeof spreadsheetMappingSuggestionSchema
>;
