import Decimal from "decimal.js";
import { z } from "zod";

import {
  FinancialState,
  FreightTreatment,
  PricingMode,
  ProcurementOrderStatus,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import { isSupportedCountryCode } from "@/config/countries";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );

const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const optionalMoney = (label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .string()
      .trim()
      .regex(
        moneyPattern,
        `${label} must be a non-negative amount with up to 4 decimals.`,
      )
      .transform((value) => new Decimal(value).toFixed(4))
      .optional(),
  );

const optionalFxRate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/,
      "FX rate must be a positive value with up to 10 decimals.",
    )
    .refine(
      (value) => new Decimal(value).greaterThan(0),
      "FX rate must be greater than zero.",
    )
    .transform((value) => new Decimal(value).toFixed(10))
    .optional(),
);

const optionalVatRate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/,
      "VAT rate must be between 0 and 100%.",
    )
    .refine(
      (value) => new Decimal(value).lessThanOrEqualTo(100),
      "VAT rate must not exceed 100%.",
    )
    .transform((value) => new Decimal(value).dividedBy(100).toFixed(6))
    .optional(),
);

const optionalEnum = <T extends Record<string, string>>(values: T) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.enum(values).optional(),
  );

const optionalCountryCode = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .toUpperCase()
    .refine(isSupportedCountryCode, "Choose a supported country.")
    .optional(),
);

const optionalTargetMargin = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d?)(?:\.\d{1,4})?$/,
      "Target margin must be between 0 and 99.9999%.",
    )
    .refine(
      (value) => new Decimal(value).lessThan(100),
      "Target margin must be less than 100%.",
    )
    .transform((value) => new Decimal(value).dividedBy(100).toFixed(6))
    .optional(),
);

export const financialStateInputSchema = z
  .object({
    customsDuties: optionalMoney("Customs and duties"),
    freight: optionalMoney("Freight"),
    inputVatAmount: optionalMoney("Input VAT amount"),
    inputVatCountryCode: optionalCountryCode,
    inputVatCustomTreatmentNote: optionalText(240),
    inputVatRate: optionalVatRate,
    inputVatRecoverability: optionalEnum(VatRecoverability),
    inputVatTaxableBase: optionalMoney("Input VAT taxable base"),
    inputVatTreatment: optionalEnum(VatTreatment),
    miscellaneous: optionalMoney("Miscellaneous cost"),
    outputVatAmount: optionalMoney("Output VAT amount"),
    outputVatCountryCode: optionalCountryCode,
    outputVatCustomTreatmentNote: optionalText(240),
    outputVatRate: optionalVatRate,
    outputVatTaxableBase: optionalMoney("Output VAT taxable base"),
    outputVatTreatment: optionalEnum(VatTreatment),
    purchaseFxRate: optionalFxRate,
    sellingFxRate: optionalFxRate,
    state: z.enum(FinancialState),
    supplierDiscount: optionalMoney("Supplier discount"),
    supplierPurchase: optionalMoney("Supplier purchase"),
  })
  .refine(
    ({ supplierDiscount, supplierPurchase }) =>
      !supplierDiscount ||
      !supplierPurchase ||
      new Decimal(supplierDiscount).lessThanOrEqualTo(supplierPurchase),
    {
      error: "Supplier discount cannot exceed supplier purchase.",
      path: ["supplierDiscount"],
    },
  )
  .superRefine((value, context) => {
    for (const direction of ["input", "output"] as const) {
      const treatment = value[`${direction}VatTreatment`];
      const taxableBase = value[`${direction}VatTaxableBase`];
      const rate = value[`${direction}VatRate`];
      const customNote = value[`${direction}VatCustomTreatmentNote`];
      if (!treatment) {
        if (taxableBase || rate || value[`${direction}VatAmount`]) {
          context.addIssue({
            code: "custom",
            message: `Choose a ${direction} VAT treatment before entering VAT values.`,
            path: [`${direction}VatTreatment`],
          });
        }
        continue;
      }
      if (!taxableBase) {
        context.addIssue({
          code: "custom",
          message: `${direction === "input" ? "Purchase" : "Sales"} VAT taxable base is required.`,
          path: [`${direction}VatTaxableBase`],
        });
      }
      if (!rate && !value[`${direction}VatAmount`]) {
        context.addIssue({
          code: "custom",
          message: `${direction === "input" ? "Input" : "Output"} VAT rate or amount is required.`,
          path: [`${direction}VatRate`],
        });
      }
      if (treatment === VatTreatment.CUSTOM && !customNote) {
        context.addIssue({
          code: "custom",
          message: "Custom VAT treatment requires a short note.",
          path: [`${direction}VatCustomTreatmentNote`],
        });
      }
    }
    if (value.inputVatTreatment && !value.inputVatRecoverability) {
      context.addIssue({
        code: "custom",
        message: "Choose whether input VAT is recoverable.",
        path: ["inputVatRecoverability"],
      });
    }
  });

const orderFields = {
  buildingIds: z
    .array(z.uuid("Invalid building."))
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "A building can only be selected once.",
    ),
  category: optionalText(80),
  description: optionalText(4000),
  financialStates: z
    .array(financialStateInputSchema)
    .length(3)
    .refine(
      (states) => new Set(states.map(({ state }) => state)).size === 3,
      "Budget, Committed, and Actual must each appear exactly once.",
    ),
  freightResaleAmount: optionalMoney("Freight resale"),
  freightTreatment: z.enum(FreightTreatment),
  notes: optionalText(4000),
  orderCurrencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Choose a valid currency."),
  orderNumber: z
    .string()
    .trim()
    .min(2, "Internal reference must be at least 2 characters.")
    .max(50),
  packageName: z
    .string()
    .trim()
    .min(2, "Package title must be at least 2 characters.")
    .max(200),
  pricingMode: z.enum(PricingMode),
  pricingSourceState: z.enum(FinancialState),
  projectId: z.uuid("Choose a valid project."),
  sellingPriceAmount: optionalMoney("Selling price"),
  sellingCurrencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Choose a valid selling currency."),
  status: z.enum(ProcurementOrderStatus),
  supplierId: z.uuid("Choose a valid supplier."),
  supplierOrderConfirmationReference: optionalText(120),
  supplierQuoteReference: optionalText(120),
  targetMarginRate: optionalTargetMargin,
};

function validPricingInput(value: {
  freightResaleAmount?: string | undefined;
  freightTreatment: FreightTreatment;
  pricingMode: PricingMode;
  sellingPriceAmount?: string | undefined;
  targetMarginRate?: string | undefined;
}): boolean {
  if (
    value.freightTreatment !== FreightTreatment.RECHARGED_SEPARATELY &&
    value.freightResaleAmount &&
    !new Decimal(value.freightResaleAmount).isZero()
  ) {
    return false;
  }
  return value.pricingMode === PricingMode.TARGET_MARGIN
    ? Boolean(value.targetMarginRate) && !value.sellingPriceAmount
    : !value.targetMarginRate;
}

export const createOrderInputSchema = z
  .object(orderFields)
  .refine(validPricingInput, {
    error:
      "Check the pricing mode, margin, selling price, and freight resale values.",
    path: ["pricingMode"],
  });
export const updateOrderInputSchema = z
  .object({ id: z.uuid("Invalid order."), ...orderFields })
  .refine(validPricingInput, {
    error:
      "Check the pricing mode, margin, selling price, and freight resale values.",
    path: ["pricingMode"],
  });

export type FinancialStateInput = z.infer<typeof financialStateInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderInputSchema>;
