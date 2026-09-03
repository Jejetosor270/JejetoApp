import Decimal from "decimal.js";
import { z } from "zod";

import { InstallmentBasis, PaymentDirection } from "@/generated/prisma/client";
import { isDateOnly } from "@/domain/payments/dates";
import { paymentSchedulePresets } from "@/domain/payments/presets";
import { optionalPercentageFraction } from "@/domain/validation/percentage";
import { normalizeNumericText } from "@/domain/validation/numeric";
import { requiredUuid } from "@/domain/validation/uuid";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );
const money = (label: string, allowZero: boolean) =>
  z.preprocess(
    (value) =>
      normalizeNumericText(value, {
        allowNegative: false,
        maximumDecimalPlaces: 4,
      }),
    z
      .string()
      .trim()
      .regex(
        /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
        `Enter a valid ${label.toLowerCase()}.`,
      )
      .refine(
        (value) => allowZero || new Decimal(value).greaterThan(0),
        `${label} must be greater than zero.`,
      )
      .transform((value) => new Decimal(value).toFixed(4)),
  );
const optionalPositiveMoney = (label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    money(label, false).optional(),
  );
const optionalFxRate = z.preprocess(
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
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/)
    .refine(
      (value) => new Decimal(value).greaterThan(0),
      "FX rate must be positive.",
    )
    .transform((value) => new Decimal(value).toFixed(10))
    .optional(),
);
const percentage = optionalPercentageFraction({
  label: "Payment percentage",
  maximumPercent: "100",
});
const dateOnly = z
  .string()
  .trim()
  .refine(isDateOnly, "Enter a valid business date.");

const installmentFields = {
  basis: z.enum(InstallmentBasis),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  direction: z.enum(PaymentDirection),
  dueDate: dateOnly,
  expectedFxRate: optionalFxRate,
  fixedAmount: optionalPositiveMoney("Fixed amount"),
  label: z.string().trim().min(1).max(200),
  notes: optionalText(4000),
  orderId: requiredUuid("Select a valid Order."),
  percentageRate: percentage,
};
const baseInstallmentSchema = z.object(installmentFields);
function validateInstallment(
  value: z.infer<typeof baseInstallmentSchema>,
  context: z.RefinementCtx,
) {
  if (
    value.basis === InstallmentBasis.PERCENTAGE
      ? !value.percentageRate || Boolean(value.fixedAmount)
      : !value.fixedAmount || Boolean(value.percentageRate)
  ) {
    context.addIssue({
      code: "custom",
      message: "Enter either an authoritative percentage or fixed amount.",
      path: [
        value.basis === InstallmentBasis.PERCENTAGE
          ? "percentageRate"
          : "fixedAmount",
      ],
    });
  }
}

export const createInstallmentSchema =
  baseInstallmentSchema.superRefine(validateInstallment);
export const updateInstallmentSchema = z
  .object({ id: z.uuid("Invalid installment."), ...installmentFields })
  .superRefine(validateInstallment);
export const inlineInstallmentSchema = z.object({
  dueDate: dateOnly,
  id: z.uuid("Invalid installment."),
  label: z.string().trim().min(1).max(200),
  notes: optionalText(4000),
  scheduledAmount: money("Scheduled amount", false),
});
export const settlementSchema = z.object({
  amount: money("Settlement amount", false),
  fxRate: optionalFxRate,
  installmentId: requiredUuid("Select a valid installment."),
  notes: optionalText(4000),
  reference: optionalText(120),
  settledAt: dateOnly,
});
export const installmentIdSchema = z.object({
  installmentId: z.uuid("Invalid installment."),
});
export const settlementIdSchema = z.object({
  settlementId: z.uuid("Invalid settlement."),
});
export const presetSchema = z.object({
  direction: z.enum(PaymentDirection),
  firstDueDate: dateOnly,
  orderId: z.uuid("Invalid procurement order."),
  preset: z.enum(
    Object.keys(paymentSchedulePresets) as [
      keyof typeof paymentSchedulePresets,
      ...(keyof typeof paymentSchedulePresets)[],
    ],
  ),
});
export type CreateInstallmentInput = z.infer<typeof createInstallmentSchema>;
export type InlineInstallmentInput = z.infer<typeof inlineInstallmentSchema>;
export type UpdateInstallmentInput = z.infer<typeof updateInstallmentSchema>;
export type SettlementInput = z.infer<typeof settlementSchema>;
