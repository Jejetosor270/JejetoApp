import Decimal from "decimal.js";
import { z } from "zod";

import { isDateOnly } from "@/domain/payments/dates";
import { optionalPercentageFraction } from "@/domain/validation/percentage";
import { normalizeNumericText } from "@/domain/validation/numeric";
import { optionalUuid, requiredUuid } from "@/domain/validation/uuid";
import { VatTreatment } from "@/generated/prisma/client";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";

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

const optionalMoney = (label: string) =>
  z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim() === "") return undefined;
      return normalizeNumericText(value, {
        allowNegative: false,
        maximumDecimalPlaces: 4,
      });
    },
    z
      .string()
      .trim()
      .regex(
        /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
        `${label} must be a non-negative amount with up to 4 decimals.`,
      )
      .transform((value) => new Decimal(value).toFixed(4))
      .optional(),
  );

const freightVatFields = {
  vatAmount: optionalMoney("VAT amount"),
  vatRate: optionalPercentageFraction({
    label: "VAT rate",
    maximumPercent: "100",
  }),
  vatRecoverableRate: optionalPercentageFraction({
    label: "Recoverability",
    maximumPercent: "100",
  }),
  vatTreatment: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.enum(VatTreatment).optional(),
  ),
};

const freightExpenseFields = {
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
  ...freightVatFields,
};

function validateFreightVat(
  value: z.infer<z.ZodObject<typeof freightVatFields>>,
  context: z.RefinementCtx,
): void {
  const hasVatValues =
    value.vatAmount !== undefined ||
    value.vatRate !== undefined ||
    value.vatRecoverableRate !== undefined;
  if (!value.vatTreatment) {
    if (hasVatValues)
      context.addIssue({
        code: "custom",
        path: ["vatTreatment"],
        message: "Choose a VAT treatment for the VAT values entered.",
      });
    return;
  }
  if (value.vatAmount === undefined && value.vatRate === undefined)
    context.addIssue({
      code: "custom",
      path: ["vatRate"],
      message: "Enter a VAT rate or VAT amount.",
    });
  const applies = inputVatRecoverabilityApplies(value.vatTreatment);
  if (applies && value.vatRecoverableRate === undefined)
    context.addIssue({
      code: "custom",
      path: ["vatRecoverableRate"],
      message: "Enter the recoverable percentage.",
    });
  if (!applies && value.vatRecoverableRate !== undefined)
    context.addIssue({
      code: "custom",
      path: ["vatRecoverableRate"],
      message: "Recoverability does not apply to this VAT treatment.",
    });
}

export const projectFreightExpenseSchema = z
  .object(freightExpenseFields)
  .superRefine(validateFreightVat);

export const updateProjectFreightExpenseSchema = z
  .object({
    id: requiredUuid("Select a valid freight expense."),
    projectId: requiredUuid("Select a valid Project."),
    ...freightVatFields,
  })
  .superRefine(validateFreightVat);

export const projectFreightExpenseIdSchema = z.object({
  id: requiredUuid("Select a valid freight expense."),
});

export type ProjectFreightExpenseInput = z.infer<
  typeof projectFreightExpenseSchema
>;
export type UpdateProjectFreightExpenseInput = z.infer<
  typeof updateProjectFreightExpenseSchema
>;
