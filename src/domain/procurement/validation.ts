import Decimal from "decimal.js";
import { z } from "zod";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";

import {
  FreightTreatment,
  ProcurementOrderStatus,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import { isSupportedCountryCode } from "@/config/countries";
import { isDateOnly } from "@/domain/payments/dates";
import { orderPricingMethods } from "@/domain/finance/order-pricing";
import { optionalPercentageFraction } from "@/domain/validation/percentage";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );
const optionalMoney = (label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
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
const optionalFxRate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/)
    .refine(
      (value) => new Decimal(value).greaterThan(0),
      "FX rate must be greater than zero.",
    )
    .transform((value) => new Decimal(value).toFixed(10))
    .optional(),
);
const optionalVatRate = optionalPercentageFraction({
  label: "VAT rate",
  maximumPercent: "100",
});
const optionalEnum = <T extends Record<string, string>>(values: T) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.enum(values).optional(),
  );
const optionalCountryCode = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().toUpperCase().refine(isSupportedCountryCode).optional(),
);
const optionalMarkupRate = optionalPercentageFraction({ label: "Markup" });
const optionalDateOnly = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .refine(isDateOnly, "Enter a valid business date.")
    .optional(),
);
const optionalLeadTime = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.number().int().min(0).max(520).optional(),
);

const orderFields = {
  buildingIds: z
    .array(z.uuid("Invalid building."))
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "A building can only be selected once.",
    ),
  category: optionalText(80),
  actualDeliveryDate: optionalDateOnly,
  customsDuties: optionalMoney("Customs and duties"),
  description: optionalText(4000),
  freight: optionalMoney("Freight"),
  freightMarkupOverrideRate: optionalMarkupRate,
  freightResaleAmount: optionalMoney("Freight resale"),
  freightTreatment: z.enum(FreightTreatment),
  expectedDeliveryDate: optionalDateOnly,
  expectedReadyDate: optionalDateOnly,
  inputVatAmount: optionalMoney("Input VAT amount"),
  inputVatCountryCode: optionalCountryCode,
  inputVatCustomTreatmentNote: optionalText(240),
  inputVatRate: optionalVatRate,
  inputVatRecoverability: optionalEnum(VatRecoverability),
  inputVatTaxableBase: optionalMoney("Input VAT taxable base"),
  inputVatTreatment: optionalEnum(VatTreatment),
  miscellaneous: optionalMoney("Miscellaneous cost"),
  otherCostMarkupOverrideRate: optionalMarkupRate,
  leadTimeWeeks: optionalLeadTime,
  notes: optionalText(4000),
  orderCurrencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  orderNumber: z.string().trim().min(2).max(50),
  orderDate: optionalDateOnly,
  outputVatAmount: optionalMoney("Output VAT amount"),
  outputVatCountryCode: optionalCountryCode,
  outputVatCustomTreatmentNote: optionalText(240),
  outputVatRate: optionalVatRate,
  outputVatTaxableBaseOverride: optionalMoney(
    "Output VAT taxable base override",
  ),
  outputVatTreatment: optionalEnum(VatTreatment),
  packageName: z.string().trim().min(2).max(200),
  pricingMode: z.enum(orderPricingMethods),
  projectId: z.uuid("Choose a valid project."),
  purchaseFxRate: optionalFxRate,
  purchaseCost: optionalMoney("Purchase cost"),
  productMarkupOverrideRate: optionalMarkupRate,
  quoteDate: optionalDateOnly,
  sellingCurrencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  sellingFxRate: optionalFxRate,
  sellingPriceAmount: optionalMoney("Selling price"),
  status: z.enum(ProcurementOrderStatus),
  supplierId: z.uuid("Choose a valid supplier."),
  supplierOrderConfirmationReference: optionalText(120),
  supplierQuoteReference: optionalText(120),
};

const baseOrderSchema = z.object(orderFields);
type VatValidationInput = Pick<
  z.infer<typeof baseOrderSchema>,
  | "inputVatAmount"
  | "inputVatCountryCode"
  | "inputVatCustomTreatmentNote"
  | "inputVatRecoverability"
  | "inputVatRate"
  | "inputVatTaxableBase"
  | "inputVatTreatment"
  | "outputVatAmount"
  | "outputVatCountryCode"
  | "outputVatCustomTreatmentNote"
  | "outputVatRate"
  | "outputVatTaxableBaseOverride"
  | "outputVatTreatment"
>;
function validVat(
  value: VatValidationInput,
  direction: "input" | "output",
  context: z.RefinementCtx,
) {
  const treatment = value[`${direction}VatTreatment`];
  const hasVatValues = [
    value[`${direction}VatAmount`],
    value[`${direction}VatCountryCode`],
    value[`${direction}VatCustomTreatmentNote`],
    value[`${direction}VatRate`],
    direction === "input"
      ? value.inputVatTaxableBase
      : value.outputVatTaxableBaseOverride,
    direction === "input" ? value.inputVatRecoverability : undefined,
  ].some(Boolean);
  if (!treatment) {
    if (hasVatValues) {
      context.addIssue({
        code: "custom",
        path: [`${direction}VatTreatment`],
        message: "Choose a VAT treatment for the VAT values entered.",
      });
    }
    return;
  }
  if (direction === "input" && !value.inputVatTaxableBase) {
    context.addIssue({
      code: "custom",
      path: [`${direction}VatTaxableBase`],
      message: "VAT taxable base is required.",
    });
  }
  if (!value[`${direction}VatRate`] && !value[`${direction}VatAmount`]) {
    context.addIssue({
      code: "custom",
      path: [`${direction}VatRate`],
      message: "VAT rate or amount is required.",
    });
  }
  if (
    treatment === VatTreatment.CUSTOM &&
    !value[`${direction}VatCustomTreatmentNote`]
  ) {
    context.addIssue({
      code: "custom",
      path: [`${direction}VatCustomTreatmentNote`],
      message: "Custom VAT treatment requires a short note.",
    });
  }
}

function validOrder(
  value: z.infer<typeof baseOrderSchema>,
  context: z.RefinementCtx,
): void {
  if (
    value.freightTreatment !== FreightTreatment.RECHARGED_SEPARATELY &&
    value.freightResaleAmount &&
    !new Decimal(value.freightResaleAmount).isZero()
  ) {
    context.addIssue({
      code: "custom",
      path: ["freightResaleAmount"],
      message: "Freight resale requires separately recharged freight.",
    });
  }
  if (
    value.pricingMode !== "DIRECT_SELLING_PRICE" &&
    value.freightResaleAmount &&
    !new Decimal(value.freightResaleAmount).isZero()
  ) {
    context.addIssue({
      code: "custom",
      path: ["freightResaleAmount"],
      message: "A direct freight resale amount requires Direct Selling Price.",
    });
  }
  const hasEveryOrderMarkup = Boolean(
    value.productMarkupOverrideRate !== undefined &&
    value.freightMarkupOverrideRate !== undefined &&
    value.otherCostMarkupOverrideRate !== undefined,
  );
  const hasAnyOrderMarkup = Boolean(
    value.productMarkupOverrideRate !== undefined ||
    value.freightMarkupOverrideRate !== undefined ||
    value.otherCostMarkupOverrideRate !== undefined,
  );
  const invalidPricing =
    value.pricingMode === "DIRECT_SELLING_PRICE"
      ? !value.sellingPriceAmount || hasAnyOrderMarkup
      : value.pricingMode === "ORDER_MARKUP"
        ? !hasEveryOrderMarkup || Boolean(value.sellingPriceAmount)
        : hasAnyOrderMarkup || Boolean(value.sellingPriceAmount);
  if (invalidPricing) {
    context.addIssue({
      code: "custom",
      path: ["pricingMode"],
      message: "Check the pricing method and its required selling inputs.",
    });
  }
  validVat(value, "input", context);
  validVat(value, "output", context);
  if (
    inputVatRecoverabilityApplies(value.inputVatTreatment) &&
    !value.inputVatRecoverability
  ) {
    context.addIssue({
      code: "custom",
      path: ["inputVatRecoverability"],
      message: "Choose whether input VAT is recoverable.",
    });
  }
  if (
    value.inputVatRecoverability &&
    !inputVatRecoverabilityApplies(value.inputVatTreatment)
  )
    context.addIssue({
      code: "custom",
      path: ["inputVatRecoverability"],
      message: "Recoverability does not apply to this VAT treatment.",
    });
}

export const createOrderInputSchema = baseOrderSchema.superRefine(validOrder);
export const updateOrderInputSchema = z
  .object({ id: z.uuid("Invalid order."), ...orderFields })
  .superRefine(validOrder);
export const inlineOrderInputSchema = z.object({
  expectedDeliveryDate: optionalDateOnly,
  expectedReadyDate: optionalDateOnly,
  id: z.uuid("Invalid order."),
  orderNumber: z.string().trim().min(1).max(50),
  status: z.enum(ProcurementOrderStatus),
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type InlineOrderInput = z.infer<typeof inlineOrderInputSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderInputSchema>;
