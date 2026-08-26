import Decimal from "decimal.js";
import { z } from "zod";

import { isSupportedCountryCode } from "@/config/countries";
import { isDateOnly } from "@/domain/payments/dates";
import { VatRecoverability, VatTreatment } from "@/generated/prisma/client";

function optionalString(maximum: number) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );
}

const optionalMoney = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/)
    .transform((value) => new Decimal(value).toFixed(4))
    .optional(),
);
const optionalFx = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/)
    .refine((value) => new Decimal(value).greaterThan(0))
    .transform((value) => new Decimal(value).toFixed(10))
    .optional(),
);
const optionalPercent = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/)
    .refine((value) => new Decimal(value).lessThanOrEqualTo(100))
    .transform((value) => new Decimal(value).dividedBy(100).toFixed(6))
    .optional(),
);
const optionalDate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().refine(isDateOnly).optional(),
);

const paymentSchema = z
  .object({
    basis: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
    dueDate: optionalDate,
    fixedAmount: optionalMoney,
    label: z.string().trim().min(1).max(200),
    percentageRate: optionalPercent,
    timingDescription: optionalString(500),
  })
  .strict();

const confirmationSchema = z
  .object({
    action: z.enum(["CREATE", "UPDATE"]),
    applyBuildings: z.boolean(),
    applyCurrency: z.boolean(),
    applyExpectedDeliveryDate: z.boolean(),
    applyFreight: z.boolean(),
    applyInputVat: z.boolean(),
    applyLeadTime: z.boolean(),
    applyMiscellaneous: z.boolean(),
    applyPurchaseCost: z.boolean(),
    applyQuoteDate: z.boolean(),
    applyQuoteReference: z.boolean(),
    approveSchedule: z.boolean(),
    buildingIds: z
      .array(z.uuid())
      .refine((ids) => new Set(ids).size === ids.length),
    freight: optionalMoney,
    freightResaleAmount: optionalMoney,
    freightTreatment: z.enum([
      "INCLUDED_IN_PACKAGE_PRICE",
      "RECHARGED_SEPARATELY",
      "NOT_APPLICABLE",
    ]),
    inputVatAmount: optionalMoney,
    inputVatCountryCode: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().trim().toUpperCase().refine(isSupportedCountryCode).optional(),
    ),
    inputVatCustomTreatmentNote: optionalString(240),
    inputVatRate: optionalPercent,
    inputVatRecoverability: z.enum(VatRecoverability).optional(),
    inputVatTaxableBase: optionalMoney,
    inputVatTreatment: z.enum(VatTreatment).optional(),
    expectedDeliveryDate: optionalDate,
    leadTimeRaw: optionalString(500),
    leadTimeWeeks: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.coerce.number().int().min(0).max(520).optional(),
    ),
    miscellaneous: optionalMoney,
    orderCurrencyCode: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/)
        .optional(),
    ),
    orderId: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.uuid().optional(),
    ),
    orderNumber: optionalString(50),
    originalFilename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[^\\/\u0000-\u001f\u007f]+$/),
    packageName: optionalString(200),
    paymentTermsRaw: optionalString(2000),
    payments: z.array(paymentSchema).max(12),
    projectId: z.uuid("Choose a valid Project."),
    purchaseCost: optionalMoney,
    purchaseFxRate: optionalFx,
    quoteDate: optionalDate,
    supplierId: z.uuid("Choose an existing or newly created Supplier."),
    supplierQuoteReference: optionalString(120),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "CREATE") {
      if (!value.orderNumber) {
        context.addIssue({
          code: "custom",
          message: "Enter an internal Order reference.",
          path: ["orderNumber"],
        });
      }
      if (!value.packageName) {
        context.addIssue({
          code: "custom",
          message: "Enter a package title.",
          path: ["packageName"],
        });
      }
      if (!value.applyCurrency || !value.orderCurrencyCode) {
        context.addIssue({
          code: "custom",
          message: "Choose the purchase currency.",
          path: ["orderCurrencyCode"],
        });
      }
    } else if (!value.orderId) {
      context.addIssue({
        code: "custom",
        message: "Choose an existing Order to update.",
        path: ["orderId"],
      });
    }
    const requiredApplied: Array<[boolean, unknown, string, string]> = [
      [
        value.applyCurrency,
        value.orderCurrencyCode,
        "orderCurrencyCode",
        "Enter the quote currency.",
      ],
      [
        value.applyPurchaseCost,
        value.purchaseCost,
        "purchaseCost",
        "Enter the supplier purchase HT amount.",
      ],
      [
        value.applyQuoteDate,
        value.quoteDate,
        "quoteDate",
        "Enter the quote date.",
      ],
      [
        value.applyQuoteReference,
        value.supplierQuoteReference,
        "supplierQuoteReference",
        "Enter the supplier quote reference.",
      ],
      [
        value.applyExpectedDeliveryDate,
        value.expectedDeliveryDate,
        "expectedDeliveryDate",
        "Enter the expected delivery date.",
      ],
      [
        value.applyLeadTime,
        value.leadTimeWeeks,
        "leadTimeWeeks",
        "Enter the normalized lead time.",
      ],
    ];
    for (const [apply, field, path, message] of requiredApplied) {
      if (apply && field === undefined) {
        context.addIssue({ code: "custom", message, path: [path] });
      }
    }
    if (value.applyInputVat) {
      if (!value.inputVatTreatment || !value.inputVatRecoverability) {
        context.addIssue({
          code: "custom",
          message:
            "Choose the management VAT treatment and recoverability before applying VAT.",
          path: ["inputVatTreatment"],
        });
      }
      if (!value.inputVatTaxableBase) {
        context.addIssue({
          code: "custom",
          message: "Enter the INPUT VAT taxable base.",
          path: ["inputVatTaxableBase"],
        });
      }
      if (!value.inputVatRate && !value.inputVatAmount) {
        context.addIssue({
          code: "custom",
          message: "Enter the INPUT VAT rate or amount.",
          path: ["inputVatRate"],
        });
      }
      if (
        value.inputVatTreatment === VatTreatment.CUSTOM &&
        !value.inputVatCustomTreatmentNote
      ) {
        context.addIssue({
          code: "custom",
          message: "Enter a note for the custom INPUT VAT treatment.",
          path: ["inputVatCustomTreatmentNote"],
        });
      }
    }
    if (value.approveSchedule) {
      if (value.payments.length === 0) {
        context.addIssue({
          code: "custom",
          message: "There is no payment proposal to approve.",
          path: ["payments"],
        });
      }
      value.payments.forEach((payment, index) => {
        if (!payment.dueDate) {
          context.addIssue({
            code: "custom",
            message: "Every approved installment needs an objective due date.",
            path: ["payments", index, "dueDate"],
          });
        }
        if (payment.basis === "PERCENTAGE" && !payment.percentageRate) {
          context.addIssue({
            code: "custom",
            message: "Enter the installment percentage.",
            path: ["payments", index, "percentageRate"],
          });
        }
        if (payment.basis === "FIXED_AMOUNT" && !payment.fixedAmount) {
          context.addIssue({
            code: "custom",
            message: "Enter the fixed installment amount.",
            path: ["payments", index, "fixedAmount"],
          });
        }
      });
    }
  });

export type QuoteConfirmationInput = z.infer<typeof confirmationSchema>;

function stringValue(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function quoteConfirmationValues(formData: FormData): unknown {
  const countValue = Number(stringValue(formData, "paymentCount") ?? "0");
  const count = Number.isInteger(countValue)
    ? Math.min(Math.max(countValue, 0), 12)
    : 0;
  const approveSchedule = formData.get("approveSchedule") === "on";
  return {
    action: stringValue(formData, "action"),
    applyBuildings: formData.get("applyBuildings") === "on",
    applyCurrency: formData.get("applyCurrency") === "on",
    applyExpectedDeliveryDate:
      formData.get("applyExpectedDeliveryDate") === "on",
    applyFreight: formData.get("applyFreight") === "on",
    applyInputVat: formData.get("applyInputVat") === "on",
    applyLeadTime: formData.get("applyLeadTime") === "on",
    applyMiscellaneous: formData.get("applyMiscellaneous") === "on",
    applyPurchaseCost: formData.get("applyPurchaseCost") === "on",
    applyQuoteDate: formData.get("applyQuoteDate") === "on",
    applyQuoteReference: formData.get("applyQuoteReference") === "on",
    approveSchedule,
    buildingIds: formData
      .getAll("buildingIds")
      .filter((value): value is string => typeof value === "string"),
    freight: stringValue(formData, "freight"),
    freightResaleAmount: stringValue(formData, "freightResaleAmount"),
    freightTreatment: stringValue(formData, "freightTreatment"),
    expectedDeliveryDate: stringValue(formData, "expectedDeliveryDate"),
    inputVatAmount: stringValue(formData, "inputVatAmount"),
    inputVatCountryCode: stringValue(formData, "inputVatCountryCode"),
    inputVatCustomTreatmentNote: stringValue(
      formData,
      "inputVatCustomTreatmentNote",
    ),
    inputVatRate: stringValue(formData, "inputVatRate"),
    inputVatRecoverability: stringValue(formData, "inputVatRecoverability"),
    inputVatTaxableBase: stringValue(formData, "inputVatTaxableBase"),
    inputVatTreatment: stringValue(formData, "inputVatTreatment"),
    leadTimeRaw: stringValue(formData, "leadTimeRaw"),
    leadTimeWeeks: stringValue(formData, "leadTimeWeeks"),
    miscellaneous: stringValue(formData, "miscellaneous"),
    orderCurrencyCode: stringValue(formData, "orderCurrencyCode"),
    orderId: stringValue(formData, "orderId"),
    orderNumber: stringValue(formData, "orderNumber"),
    originalFilename: stringValue(formData, "originalFilename"),
    packageName: stringValue(formData, "packageName"),
    paymentTermsRaw: stringValue(formData, "paymentTermsRaw"),
    payments: approveSchedule
      ? Array.from({ length: count }, (_, index) => ({
          basis: stringValue(formData, `payment.${index}.basis`),
          dueDate: stringValue(formData, `payment.${index}.dueDate`),
          fixedAmount: stringValue(formData, `payment.${index}.fixedAmount`),
          label: stringValue(formData, `payment.${index}.label`),
          percentageRate: stringValue(
            formData,
            `payment.${index}.percentageRate`,
          ),
          timingDescription: stringValue(
            formData,
            `payment.${index}.timingDescription`,
          ),
        }))
      : [],
    projectId: stringValue(formData, "projectId"),
    purchaseCost: stringValue(formData, "purchaseCost"),
    purchaseFxRate: stringValue(formData, "purchaseFxRate"),
    quoteDate: stringValue(formData, "quoteDate"),
    supplierId: stringValue(formData, "supplierId"),
    supplierQuoteReference: stringValue(formData, "supplierQuoteReference"),
  };
}

export function parseQuoteConfirmation(
  formData: FormData,
): ReturnType<typeof confirmationSchema.safeParse> {
  return confirmationSchema.safeParse(quoteConfirmationValues(formData));
}
