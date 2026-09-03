import Decimal from "decimal.js";
import { z } from "zod";

import {
  ClientBillingAllocationBasis,
  ClientBillingDocumentType,
  InstallmentBasis,
  VatTreatment,
} from "@/generated/prisma/client";
import { isDateOnly } from "@/domain/payments/dates";
import { normalizeNumericText } from "@/domain/validation/numeric";
import { optionalPercentageFraction } from "@/domain/validation/percentage";
import { optionalUuid, requiredUuid } from "@/domain/validation/uuid";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );
const money = z.preprocess(
  (value) =>
    normalizeNumericText(value, {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    }),
  z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, "Enter a valid amount.")
    .transform((value) => new Decimal(value).toFixed(4)),
);
const positiveMoney = money.refine(
  (value) => new Decimal(value).greaterThan(0),
  "Amount must be greater than zero.",
);
const fraction = z.preprocess(
  (value) =>
    normalizeNumericText(value, {
      allowNegative: false,
      maximumDecimalPlaces: 6,
    }),
  z
    .string()
    .regex(
      /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/,
      "Enter a percentage between 0 and 100.",
    )
    .transform((value) => new Decimal(value).toFixed(6)),
);
const optionalFraction = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  fraction.optional(),
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

export const billingAllocationSchema = z
  .object({
    orderId: requiredUuid("Select a valid Order."),
    basis: z.enum(ClientBillingAllocationBasis),
    allocatedAmount: money,
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
    allocations: z.array(billingAllocationSchema).max(100),
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

export const clientBillingInstallmentUpdateSchema = z
  .object({
    basis: z.enum(InstallmentBasis),
    billingDocumentId: requiredUuid("Select a valid Billing Event."),
    dueDate: dateOnly,
    id: requiredUuid("Select a valid installment."),
    label: z.string().trim().min(1, "Enter an installment label.").max(200),
    notes: optionalText(4000),
    percentageRate: optionalPercentageFraction({
      label: "Installment percentage",
      maximumPercent: "100",
    }),
    scheduledAmount: money,
  })
  .superRefine((value, context) => {
    if (
      value.basis === InstallmentBasis.PERCENTAGE &&
      value.percentageRate === undefined
    )
      context.addIssue({
        code: "custom",
        message: "Enter a percentage between 0 and 100.",
        path: ["percentageRate"],
      });
  });

export const inlineClientBillingSchema = z.object({
  dueDate: optionalDate,
  id: z.uuid(),
  isCancelled: z.enum(["true", "false"]).transform((value) => value === "true"),
  notes: optionalText(4000),
  reference: z.string().trim().min(1).max(120),
});

const billingEditFields = z.object({
  allocations: z.array(billingAllocationSchema).max(100),
  clientId: requiredUuid("Select a Client."),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Select a valid currency."),
  documentDate: dateOnly,
  documentType: z.enum(ClientBillingDocumentType),
  dueDate: optionalDate,
  fxRate: optionalFx,
  id: requiredUuid("Select a valid billing document."),
  isCancelled: z.boolean(),
  isProjectRemainderApproved: z.boolean(),
  notes: optionalText(4000),
  projectId: requiredUuid("Select a Project."),
  reference: z.string().trim().min(1).max(120),
  totalHt: money,
  totalTtc: money,
  vatAmount: money,
  vatRate: optionalFraction,
  vatTreatment: z.enum(VatTreatment).optional(),
});

export const billingDocumentEditSchema = billingEditFields.superRefine(
  (value, context) => {
    if (
      !new Decimal(value.totalHt).plus(value.vatAmount).equals(value.totalTtc)
    ) {
      context.addIssue({
        code: "custom",
        message: "TTC must equal HT plus VAT.",
        path: ["totalTtc"],
      });
    }
  },
);

export const billingAllocationsEditSchema = z.object({
  allocations: z.array(billingAllocationSchema).max(100),
  billingDocumentId: requiredUuid("Select a valid billing document."),
  isProjectRemainderApproved: z.boolean(),
});

export const orderBillingLinkSchema = z
  .object({
    allocatedAmount: money.optional(),
    basis: z.enum(ClientBillingAllocationBasis).optional(),
    billingDocumentId: requiredUuid("Select a valid billing document."),
    isProjectRemainderApproved: z.boolean(),
    orderId: requiredUuid("Select a valid Order."),
    percentageRate: optionalFraction,
    remove: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.remove) return;
    if (!value.basis || !value.allocatedAmount) {
      context.addIssue({
        code: "custom",
        message: "Choose an allocation basis and enter an amount.",
        path: ["allocatedAmount"],
      });
      return;
    }
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

export const orderCreationBillingLinkSchema = z
  .object({
    allocatedAmount: money,
    basis: z.enum(ClientBillingAllocationBasis),
    billingDocumentId: requiredUuid("Select a valid billing document."),
    isProjectRemainderApproved: z.boolean(),
    percentageRate: optionalFraction,
  })
  .superRefine((value, context) => {
    if (
      (value.basis === ClientBillingAllocationBasis.PERCENTAGE) !==
      Boolean(value.percentageRate)
    )
      context.addIssue({
        code: "custom",
        message: "Percentage allocations require a rate.",
        path: ["percentageRate"],
      });
  });

function parsedJsonArray(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function parseBillingDocumentEdit(formData: FormData) {
  const raw = Object.fromEntries(formData);
  return billingDocumentEditSchema.safeParse({
    ...raw,
    allocations: parsedJsonArray(formData.get("allocations")),
    isCancelled: formData.get("isCancelled") === "on",
    isProjectRemainderApproved:
      formData.get("isProjectRemainderApproved") === "on",
    vatRate: raw.vatRate || undefined,
    vatTreatment: raw.vatTreatment || undefined,
  });
}

export function parseBillingAllocationsEdit(formData: FormData) {
  return billingAllocationsEditSchema.safeParse({
    allocations: parsedJsonArray(formData.get("allocations")),
    billingDocumentId: formData.get("billingDocumentId"),
    isProjectRemainderApproved:
      formData.get("isProjectRemainderApproved") === "on",
  });
}

export function parseOrderBillingLink(formData: FormData) {
  const raw = Object.fromEntries(formData);
  return orderBillingLinkSchema.safeParse({
    ...raw,
    allocatedAmount: raw.allocatedAmount || undefined,
    basis: raw.basis || undefined,
    isProjectRemainderApproved:
      formData.get("isProjectRemainderApproved") === "on",
    percentageRate: raw.percentageRate || undefined,
    remove: formData.get("remove") === "true",
  });
}

export function parseOrderCreationBillingLink(formData: FormData) {
  const billingDocumentId = formData.get("billingDocumentId");
  if (typeof billingDocumentId !== "string" || !billingDocumentId)
    return { success: true as const, data: null };
  const raw = Object.fromEntries(formData);
  return orderCreationBillingLinkSchema.safeParse({
    allocatedAmount: raw.billingAllocatedAmount,
    basis: raw.billingAllocationBasis,
    billingDocumentId,
    isProjectRemainderApproved:
      formData.get("billingRemainderApproved") === "on",
    percentageRate: raw.billingPercentageRate || undefined,
  });
}

export type ClientBillingConfirmation = z.infer<
  typeof clientBillingConfirmationSchema
>;
export type ClientReceiptInput = z.infer<typeof clientReceiptSchema>;
export type ClientBillingInstallmentUpdateInput = z.infer<
  typeof clientBillingInstallmentUpdateSchema
>;
export type InlineClientBillingInput = z.infer<
  typeof inlineClientBillingSchema
>;
export type BillingAllocationInput = z.infer<typeof billingAllocationSchema>;
export type BillingDocumentEditInput = z.infer<
  typeof billingDocumentEditSchema
>;
export type BillingAllocationsEditInput = z.infer<
  typeof billingAllocationsEditSchema
>;
export type OrderBillingLinkInput = z.infer<typeof orderBillingLinkSchema>;
export type OrderCreationBillingLinkInput = z.infer<
  typeof orderCreationBillingLinkSchema
>;
