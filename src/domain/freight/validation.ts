import Decimal from "decimal.js";
import { z } from "zod";

import { isDateOnly } from "@/domain/payments/dates";
import { optionalPercentageFraction } from "@/domain/validation/percentage";
import { normalizeNumericText } from "@/domain/validation/numeric";
import { optionalUuid, requiredUuid } from "@/domain/validation/uuid";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );
const optionalFx = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") return undefined;
    return normalizeNumericText(value, {
      allowNegative: false,
      maximumDecimalPlaces: 10,
    });
  },
  z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/, "Enter a valid FX rate.")
    .refine(
      (value) => new Decimal(value).greaterThan(0),
      "FX must be positive.",
    )
    .optional(),
);

export const projectFreightExpenseSchema = z.object({
  costAmountHt: z.preprocess(
    (value) =>
      normalizeNumericText(value, {
        allowNegative: false,
        maximumDecimalPlaces: 4,
      }),
    z
      .string()
      .trim()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, "Enter a valid freight cost.")
      .refine(
        (value) => new Decimal(value).greaterThan(0),
        "Cost must be positive.",
      )
      .transform((value) => new Decimal(value).toFixed(4)),
  ),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  description: z.string().trim().min(1, "Enter a description.").max(200),
  expenseDate: z.string().refine(isDateOnly, "Enter a valid expense date."),
  freightMarkupOverrideRate: optionalPercentageFraction({
    label: "Freight markup",
  }),
  fxRate: optionalFx,
  notes: optionalText(4000),
  projectId: requiredUuid("Select a valid Project."),
  reference: optionalText(120),
  supplierId: optionalUuid("Select a valid Supplier."),
});

export const projectFreightExpenseIdSchema = z.object({
  id: requiredUuid("Select a valid freight expense."),
});

export type ProjectFreightExpenseInput = z.infer<
  typeof projectFreightExpenseSchema
>;
