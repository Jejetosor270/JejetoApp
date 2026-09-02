import Decimal from "decimal.js";
import { z } from "zod";

import { InstallmentBasis, PaymentDirection } from "@/generated/prisma/client";
import { isDateOnly } from "@/domain/payments/dates";
import { paymentSchedulePresets } from "@/domain/payments/presets";
import { optionalPercentageFraction } from "@/domain/validation/percentage";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );
const money = (label: string, allowZero: boolean) =>
  z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
      `${label} must be a non-negative amount with up to 4 decimals.`,
    )
    .refine(
      (value) => allowZero || new Decimal(value).greaterThan(0),
      `${label} must be greater than zero.`,
    )
    .transform((value) => new Decimal(value).toFixed(4));
const optionalPositiveMoney = (label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    money(label, false).optional(),
  );
const optionalFxRate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
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
}).refine(
  (value) => value === undefined || new Decimal(value).greaterThan(0),
  "Payment percentage must be greater than zero.",
);
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
  orderId: z.uuid("Invalid procurement order."),
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
  installmentId: z.uuid("Invalid installment."),
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
