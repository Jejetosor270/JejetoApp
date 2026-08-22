import Decimal from "decimal.js";
import { z } from "zod";

import {
  FinancialState,
  FreightTreatment,
  PricingMode,
  ProcurementOrderStatus,
} from "@/generated/prisma/client";

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
    miscellaneous: optionalMoney("Miscellaneous cost"),
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
  );

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
