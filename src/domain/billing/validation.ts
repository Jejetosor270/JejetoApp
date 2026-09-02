import Decimal from "decimal.js";
import { z } from "zod";

import {
  ClientBillingAllocationBasis,
  ClientBillingDocumentType,
  InstallmentBasis,
  VatTreatment,
} from "@/generated/prisma/client";
import { isDateOnly } from "@/domain/payments/dates";
import { optionalUuid, requiredUuid } from "@/domain/validation/uuid";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );
const money = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
    "Enter a non-negative amount with up to 4 decimals.",
  )
  .transform((value) => new Decimal(value).toFixed(4));
const positiveMoney = money.refine(
  (value) => new Decimal(value).greaterThan(0),
  "Amount must be greater than zero.",
);
const fraction = z
  .string()
  .regex(/^(?:0|1|0?\.\d{1,6})$/, "Enter a percentage between 0 and 100.")
  .refine(
    (value) => new Decimal(value).greaterThan(0),
    "Percentage must be greater than zero.",
  )
  .transform((value) => new Decimal(value).toFixed(6));
const optionalFraction = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  fraction.optional(),
);
const optionalFx = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/)
    .refine((value) => new Decimal(value).greaterThan(0))
    .transform((value) => new Decimal(value).toFixed(10))
    .optional(),
);
const dateOnly = z.string().refine(isDateOnly, "Enter a valid date.");
const optionalDate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  dateOnly.optional(),
);

const allocationSchema = z
  .object({
    orderId: requiredUuid("Select a valid Order."),
    basis: z.enum(ClientBillingAllocationBasis),
    allocatedAmount: positiveMoney,
    percentageRate: optionalFraction,
  })
  .superRefine((value, context) => {
    if (
      (value.basis === ClientBillingAllocationBasis.PERCENTAGE) !==
      Boolean(value.percentageRate)
    ) {
      context.addIssue({
        code: "custom",
        message: "Percentage allocations require a rate.",
        path: ["percentageRate"],
      });
    }
  });

const installmentSchema = z
  .object({
    basis: z.enum(InstallmentBasis),
    dueDate: dateOnly,
    fixedAmount: positiveMoney.optional(),
    label: z.string().trim().min(1).max(200),
    notes: optionalText(4000),
    percentageRate: optionalFraction,
  })
  .superRefine((value, context) => {
    if (
      value.basis === InstallmentBasis.PERCENTAGE
        ? !value.percentageRate || Boolean(value.fixedAmount)
        : !value.fixedAmount || Boolean(value.percentageRate)
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose one authoritative installment basis.",
        path: ["basis"],
      });
    }
  });

export const clientBillingConfirmationSchema = z
  .object({
    action: z.enum(["CREATE", "UPDATE"]),
    allocations: z.array(allocationSchema).max(100),
    clientId: requiredUuid("Select a Client."),
    documentDate: dateOnly,
    documentType: z.enum(ClientBillingDocumentType),
    dueDate: optionalDate,
    duplicateWarning: z.boolean(),
    existingDocumentId: optionalUuid("Select a valid billing document."),
    fxRate: optionalFx,
    installments: z.array(installmentSchema).max(12),
    isCancelled: z.boolean(),
    isProjectRemainderApproved: z.boolean(),
    matchedInstallmentId: optionalUuid("Select a valid payment schedule."),
    notes: optionalText(4000),
    originalFilename: z.string().trim().min(1).max(255),
    paymentTermsRaw: optionalText(4000),
    projectId: requiredUuid("Select a Project."),
    provider: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(120),
    reference: z.string().trim().min(1).max(120),
    replaceSchedule: z.boolean(),
    totalHt: money,
    totalTtc: money,
    vatAmount: money,
    vatRate: optionalFraction,
    vatTreatment: z.enum(VatTreatment).optional(),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
  })
  .superRefine((value, context) => {
    if (value.action === "UPDATE" && !value.existingDocumentId) {
      context.addIssue({
        code: "custom",
        message: "Choose the billing document to update.",
        path: ["existingDocumentId"],
      });
    }
    if (
      !new Decimal(value.totalHt).plus(value.vatAmount).equals(value.totalTtc)
    ) {
      context.addIssue({
        code: "custom",
        message: "TTC must equal HT plus VAT.",
        path: ["totalTtc"],
      });
    }
  });

function jsonArray(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseClientBillingConfirmation(formData: FormData) {
  const raw = Object.fromEntries(formData);
  return clientBillingConfirmationSchema.safeParse({
    ...raw,
    allocations: jsonArray(formData.get("allocations")),
    duplicateWarning: formData.get("duplicateWarning") === "true",
    installments: jsonArray(formData.get("installments")),
    isCancelled: formData.get("isCancelled") === "on",
    isProjectRemainderApproved:
      formData.get("isProjectRemainderApproved") === "on",
    replaceSchedule: formData.get("replaceSchedule") === "on",
    vatRate: raw.vatRate || undefined,
    vatTreatment: raw.vatTreatment || undefined,
  });
}

export const clientReceiptSchema = z.object({
  amount: positiveMoney,
  fxRate: optionalFx,
  installmentId: requiredUuid("Select a valid billing installment."),
  notes: optionalText(4000),
  receivedAt: dateOnly,
  reference: optionalText(120),
});

export const inlineClientBillingSchema = z.object({
  dueDate: optionalDate,
  id: z.uuid(),
  isCancelled: z.enum(["true", "false"]).transform((value) => value === "true"),
  notes: optionalText(4000),
  reference: z.string().trim().min(1).max(120),
});

export type ClientBillingConfirmation = z.infer<
  typeof clientBillingConfirmationSchema
>;
export type ClientReceiptInput = z.infer<typeof clientReceiptSchema>;
export type InlineClientBillingInput = z.infer<
  typeof inlineClientBillingSchema
>;
