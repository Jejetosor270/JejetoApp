import { z } from "zod";

import { isDateOnly } from "@/domain/payments/dates";

const status = z.enum(["EXTRACTED", "MISSING", "AMBIGUOUS"]);
const diagnostic = z.string().trim().max(500).nullable();
const money = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/);
const rate = z.string().regex(/^(?:0|1|0?\.\d{1,6})$/);

function observed<T extends z.ZodType>(schema: T) {
  return z
    .object({ status, value: schema.nullable(), diagnostic })
    .strict()
    .superRefine((value, context) => {
      const observation = value as {
        diagnostic: string | null;
        status: "EXTRACTED" | "MISSING" | "AMBIGUOUS";
        value: unknown;
      };
      if (observation.status === "EXTRACTED" && observation.value === null) {
        context.addIssue({
          code: "custom",
          message: "Extracted values cannot be null.",
          path: ["value"],
        });
      }
      if (observation.status === "MISSING" && observation.value !== null) {
        context.addIssue({
          code: "custom",
          message: "Missing values must be null.",
          path: ["value"],
        });
      }
      if (observation.status === "AMBIGUOUS" && !observation.diagnostic) {
        context.addIssue({
          code: "custom",
          message: "Ambiguous values require a diagnostic.",
          path: ["diagnostic"],
        });
      }
    });
}

const text = (maximum: number) =>
  observed(z.string().trim().min(1).max(maximum));
const date = observed(z.string().refine(isDateOnly, "Expected YYYY-MM-DD."));

export const clientDocumentExtractionSchema = z
  .object({
    documentType: observed(z.enum(["QUOTE", "INVOICE"])),
    clientName: text(200),
    projectReference: text(200),
    reference: text(120),
    documentDate: date,
    dueDate: date,
    currencyCode: observed(z.string().regex(/^[A-Z]{3}$/)),
    totalHt: observed(money),
    vatLines: z
      .array(
        z
          .object({
            label: text(120),
            rate: observed(rate),
            taxableBase: observed(money),
            amount: observed(money),
          })
          .strict(),
      )
      .max(8),
    vatAmount: observed(money),
    totalTtc: observed(money),
    paymentTerms: z
      .object({
        raw: text(2000),
        installments: z
          .array(
            z
              .object({
                label: text(200),
                basis: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "UNRESOLVED"]),
                percentageRate: observed(rate),
                fixedAmount: observed(money),
                dueDate: date,
                timingDescription: text(500),
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
    notes: text(2000),
    warnings: z.array(z.string().trim().min(1).max(500)).max(30),
  })
  .strict();

export type ClientDocumentExtraction = z.infer<
  typeof clientDocumentExtractionSchema
>;

export function extractedValue<T>(field: {
  status: "EXTRACTED" | "MISSING" | "AMBIGUOUS";
  value: T | null;
}): T | null {
  return field.status === "EXTRACTED" ? field.value : null;
}
