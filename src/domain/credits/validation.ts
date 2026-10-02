import Decimal from "decimal.js";
import { z } from "zod";

import { isDateOnly } from "@/domain/payments/dates";
import { normalizeNumericText } from "@/domain/validation/numeric";

const money = z.preprocess(
  (value) =>
    normalizeNumericText(value, {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    }),
  z
    .string()
    .regex(
      /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/,
      "Enter a non-negative amount with at most four decimal places.",
    )
    .transform((value) => new Decimal(value).toFixed(4)),
);
const positiveMoney = money.refine(
  (value) => new Decimal(value).gt(0),
  "Enter an amount greater than zero.",
);
const date = z.string().refine(isDateOnly, "Enter a valid business date.");
const version = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Reopen this form to refresh the financial record.");
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().trim().max(max).optional(),
  );
const optionalFx = z.preprocess(
  (value) =>
    value === "" || value == null
      ? undefined
      : normalizeNumericText(value, {
          allowNegative: false,
          maximumDecimalPlaces: 10,
        }),
  z
    .string()
    .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,10})?$/)
    .refine(
      (value) => new Decimal(value).gt(0),
      "Enter a positive actual refund FX rate.",
    )
    .optional(),
);

export const creditSourceSchema = z.object({
  side: z.enum(["CLIENT", "SUPPLIER"]),
  sourceId: z.uuid(),
});

const allocationSchema = z
  .object({
    orderId: z.uuid(),
    amountHt: positiveMoney,
    freightCoverageHt: money,
    otherCoverageHt: money,
  })
  .strict()
  .refine(
    (value) =>
      new Decimal(value.freightCoverageHt)
        .plus(value.otherCoverageHt)
        .lte(value.amountHt),
    {
      message: "Allocation categories cannot exceed allocation HT.",
      path: ["amountHt"],
    },
  );

/** Source currency/FX, actor and VAT recovery are derived server-side, never submitted. */
export const createCreditSchema = creditSourceSchema
  .extend({
    expectedVersion: version,
    reference: z.string().trim().min(1).max(120),
    creditDate: date,
    totalHt: money,
    vatAmount: money,
    freightCoverageHt: money,
    otherCoverageHt: money,
    reason: z.string().trim().min(1).max(4000),
    supplierVatEntryId: z.uuid().optional(),
    allocations: z.array(allocationSchema).max(100).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      new Set(input.allocations.map((row) => row.orderId)).size !==
      input.allocations.length
    )
      context.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Select each linked Order once.",
      });
    if (input.side === "SUPPLIER" && input.allocations.length)
      context.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Supplier credits apply only to their original Order.",
      });
    if (input.side === "CLIENT" && input.supplierVatEntryId)
      context.addIssue({
        code: "custom",
        path: ["supplierVatEntryId"],
        message: "Client credits do not select Supplier VAT.",
      });
    if (new Decimal(input.totalHt).plus(input.vatAmount).isZero())
      context.addIssue({
        code: "custom",
        path: ["totalHt"],
        message: "Enter a positive credit HT or VAT amount.",
      });
    if (
      new Decimal(input.freightCoverageHt)
        .plus(input.otherCoverageHt)
        .gt(input.totalHt)
    )
      context.addIssue({
        code: "custom",
        path: ["freightCoverageHt"],
        message: "Freight and other/services cannot exceed credit HT.",
      });
    if (
      input.side === "SUPPLIER" &&
      (!new Decimal(input.freightCoverageHt).isZero() ||
        !new Decimal(input.otherCoverageHt).isZero())
    )
      context.addIssue({
        code: "custom",
        path: ["totalHt"],
        message:
          "Supplier credits cover the original product purchase and invoice VAT only.",
      });
  });

export const creditRefundSchema = z
  .object({
    side: z.enum(["CLIENT", "SUPPLIER"]),
    creditId: z.uuid(),
    expectedVersion: version,
    amount: positiveMoney,
    refundDate: date,
    fxRate: optionalFx,
    reference: optionalText(120),
    notes: optionalText(4000),
  })
  .strict();

export type CreateCreditInput = z.infer<typeof createCreditSchema>;
export type CreditRefundInput = z.infer<typeof creditRefundSchema>;

export const cancelCreditSchema = z
  .object({
    creditId: z.uuid(),
    expectedVersion: version,
    reason: z.string().trim().min(1).max(4000),
  })
  .strict();
export const cancelCreditRefundSchema = z
  .object({
    refundId: z.uuid(),
    expectedVersion: version,
    reason: z.string().trim().min(1).max(4000),
  })
  .strict();
