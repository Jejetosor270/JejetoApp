import Decimal from "decimal.js";
import { z } from "zod";

import { isSupportedCountryCode } from "@/config/countries";
import { isDateOnly } from "@/domain/payments/dates";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";
import {
  ItemCommercialStatus,
  ItemLogisticsStatus,
  LogisticsLocationType,
  PricingMode,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const requiredDecimal = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
      `${label} must be non-negative with up to 4 decimals.`,
    )
    .refine(
      (value) => new Decimal(value).greaterThan(0),
      `${label} must be greater than zero.`,
    )
    .transform((value) => new Decimal(value).toFixed(4));
const optionalDecimal = (label: string) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(
        /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
        `${label} must be non-negative with up to 4 decimals.`,
      )
      .transform((value) => new Decimal(value).toFixed(4))
      .optional(),
  );
const optionalRate = (label: string) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(
        /^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/,
        `${label} must be between 0 and 100.`,
      )
      .refine((value) => new Decimal(value).lessThanOrEqualTo(100))
      .transform((value) => new Decimal(value).dividedBy(100).toFixed(6))
      .optional(),
  );
const optionalDate = z.preprocess(
  blankToUndefined,
  z.string().trim().refine(isDateOnly, "Enter a valid date.").optional(),
);
const optionalEnum = <T extends Record<string, string>>(value: T) =>
  z.preprocess(blankToUndefined, z.enum(value).optional());

const itemFields = {
  brand: optionalText(160),
  budgetPurchaseTotalPriceHt: optionalDecimal("Budget purchase total"),
  budgetPurchaseUnitPriceHt: optionalDecimal("Budget purchase unit"),
  budgetVarianceComment: optionalText(500),
  buildingId: optionalUuid,
  category: optionalText(80),
  claimNotes: optionalText(4000),
  claimOpenedDate: optionalDate,
  claimResolvedDate: optionalDate,
  claimStatus: optionalText(120),
  commercialStatus: z.enum(ItemCommercialStatus),
  deliveredResidenceDate: optionalDate,
  description: optionalText(4000),
  destinationLocationId: optionalUuid,
  estimatedFabricatorDate: optionalDate,
  estimatedResidenceDate: optionalDate,
  estimatedWarehouseDate: optionalDate,
  expectedWarehouseId: optionalUuid,
  fabricatorId: optionalUuid,
  finishColor: optionalText(240),
  inTransitDate: optionalDate,
  installedDate: optionalDate,
  issueDescription: optionalText(4000),
  itemReference: optionalText(120),
  logisticsStatus: z.enum(ItemLogisticsStatus),
  markupRate: optionalRate("Markup"),
  name: z.string().trim().min(1, "Description is required.").max(240),
  notes: optionalText(4000),
  pricingMode: z.enum([PricingMode.SELLING_PRICE, PricingMode.TARGET_MARGIN]),
  procurementOrderId: optionalUuid,
  projectId: z.uuid("Choose a valid project."),
  purchaseCurrencyCode: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  ),
  quantity: requiredDecimal("Quantity"),
  receivedFabricatorDate: optionalDate,
  receivedWarehouseDate: optionalDate,
  receivedWarehouseId: optionalUuid,
  roomId: optionalUuid,
  supplierId: optionalUuid,
  supplierSku: optionalText(160),
  targetMarginRate: optionalRate("Target margin"),
  totalPurchasePriceHt: optionalDecimal("Total purchase price"),
  totalSellingPriceHt: optionalDecimal("Total selling price"),
  unitOfMeasure: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .transform((value) => value.toUpperCase()),
  unitPurchasePriceHt: optionalDecimal("Unit purchase price"),
  unitSellingPriceHt: optionalDecimal("Unit selling price"),
  vatAmount: optionalDecimal("VAT amount"),
  vatRate: optionalRate("VAT rate"),
  vatRecoverability: optionalEnum(VatRecoverability),
  vatTreatment: optionalEnum(VatTreatment),
  volumeEach: optionalDecimal("Volume each"),
  totalVolume: optionalDecimal("Total volume"),
  weightEach: optionalDecimal("Weight each"),
  totalWeight: optionalDecimal("Total weight"),
};

function refineItem(
  value: z.infer<typeof baseItemSchema>,
  context: z.RefinementCtx,
) {
  if (value.roomId && !value.buildingId)
    context.addIssue({
      code: "custom",
      path: ["roomId"],
      message: "Choose a Building before choosing a Room.",
    });
  if (
    value.pricingMode === PricingMode.TARGET_MARGIN &&
    !value.targetMarginRate
  )
    context.addIssue({
      code: "custom",
      path: ["targetMarginRate"],
      message: "Enter a target margin.",
    });
  if (
    value.logisticsStatus === ItemLogisticsStatus.CLAIM &&
    !value.issueDescription
  )
    context.addIssue({
      code: "custom",
      path: ["issueDescription"],
      message: "Describe the claim or issue.",
    });
  if (value.vatRecoverability && !value.vatTreatment)
    context.addIssue({
      code: "custom",
      path: ["vatTreatment"],
      message: "Choose a VAT treatment.",
    });
  if (
    value.vatRecoverability &&
    !inputVatRecoverabilityApplies(value.vatTreatment)
  )
    context.addIssue({
      code: "custom",
      path: ["vatRecoverability"],
      message: "Recoverability does not apply to this VAT treatment.",
    });
}

const baseItemSchema = z.object(itemFields);
export const createItemInputSchema = baseItemSchema.superRefine(refineItem);
export const updateItemInputSchema = z
  .object({ id: z.uuid(), ...itemFields })
  .superRefine(refineItem);

export const createRoomInputSchema = z.object({
  buildingId: z.uuid("Choose a Building."),
  code: optionalText(40),
  name: z.string().trim().min(1).max(160),
  notes: optionalText(4000),
});
export const createLocationInputSchema = z.object({
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  countryCode: z.preprocess(
    blankToUndefined,
    z.string().trim().toUpperCase().refine(isSupportedCountryCode).optional(),
  ),
  name: z.string().trim().min(1).max(160),
  notes: optionalText(4000),
  postalCode: optionalText(32),
  type: z.enum(LogisticsLocationType),
});
export const updateRoomInlineInputSchema = z.object({
  code: optionalText(40),
  id: z.uuid("Choose a valid Room."),
  isActive: z.boolean(),
  name: z.string().trim().min(1).max(160),
});
export const updateLocationInlineInputSchema = z.object({
  countryCode: z.preprocess(
    blankToUndefined,
    z.string().trim().toUpperCase().refine(isSupportedCountryCode).optional(),
  ),
  id: z.uuid("Choose a valid Location."),
  isActive: z.boolean(),
  name: z.string().trim().min(1).max(160),
  type: z.enum(LogisticsLocationType),
});
export const updateFreightEstimateSchema = z.object({
  id: z.uuid(),
  freightEstimateRate: optionalRate("Freight estimate"),
  freightEstimateNotes: optionalText(500),
});

const nullableDecimal = (label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.union([
      z
        .string()
        .trim()
        .regex(
          /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
          `${label} must be non-negative with up to 4 decimals.`,
        )
        .transform((value) => new Decimal(value).toFixed(4)),
      z.null(),
    ]),
  );
const nullableRate = (label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.union([
      z
        .string()
        .trim()
        .regex(
          /^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/,
          `${label} must be between 0 and 100.`,
        )
        .transform((value) => new Decimal(value).dividedBy(100).toFixed(6)),
      z.null(),
    ]),
  );
export const inlineItemFinancialInputSchema = z
  .object({
    basis: z.enum([
      "QUANTITY",
      "UNIT_PURCHASE",
      "TOTAL_PURCHASE",
      "BUDGET_UNIT",
      "BUDGET_TOTAL",
      "MARKUP",
    ]),
    budgetTotal: nullableDecimal("Budget total"),
    budgetUnit: nullableDecimal("Budget unit"),
    budgetVarianceComment: optionalText(500),
    id: z.uuid(),
    markupRate: nullableRate("Markup"),
    quantity: requiredDecimal("Quantity"),
    totalPurchase: nullableDecimal("Purchase total"),
    unitPurchase: nullableDecimal("Purchase unit"),
    vatRate: nullableRate("VAT"),
    vatRecoverability: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? null : value,
      z.enum(VatRecoverability).nullable(),
    ),
    vatTreatment: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? null : value,
      z.enum(VatTreatment).nullable(),
    ),
  })
  .superRefine((value, context) => {
    if (value.vatRecoverability && !value.vatTreatment)
      context.addIssue({
        code: "custom",
        message: "Choose a VAT treatment before recoverability.",
        path: ["vatTreatment"],
      });
    if (
      value.vatRecoverability &&
      !inputVatRecoverabilityApplies(value.vatTreatment)
    )
      context.addIssue({
        code: "custom",
        message: "Recoverability does not apply to this VAT treatment.",
        path: ["vatRecoverability"],
      });
  });

export const inlineItemGeneralInputSchema = z
  .object({
    buildingId: optionalUuid,
    category: optionalText(80),
    id: z.uuid(),
    itemReference: optionalText(120),
    name: z.string().trim().min(1, "Description is required.").max(240),
    quantity: requiredDecimal("Quantity"),
    roomId: optionalUuid,
    supplierId: optionalUuid,
    unitOfMeasure: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .transform((value) => value.toUpperCase()),
  })
  .refine((value) => !value.roomId || Boolean(value.buildingId), {
    message: "Choose a Building before choosing a Room.",
    path: ["roomId"],
  });

export const inlineItemStatusInputSchema = z.object({
  commercialStatus: z.enum(ItemCommercialStatus),
  id: z.uuid(),
  logisticsStatus: z.enum(ItemLogisticsStatus),
});

export const inlineItemTrackingInputSchema = z.object({
  deliveredResidenceDate: optionalDate,
  estimatedFabricatorDate: optionalDate,
  estimatedResidenceDate: optionalDate,
  estimatedWarehouseDate: optionalDate,
  expectedWarehouseId: optionalUuid,
  fabricatorId: optionalUuid,
  id: z.uuid(),
  inTransitDate: optionalDate,
  installedDate: optionalDate,
  logisticsStatus: z.enum(ItemLogisticsStatus),
  receivedFabricatorDate: optionalDate,
  receivedWarehouseDate: optionalDate,
  receivedWarehouseId: optionalUuid,
});

export type CreateItemInput = z.infer<typeof createItemInputSchema>;
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>;
export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type CreateLocationInput = z.infer<typeof createLocationInputSchema>;
export type UpdateLocationInlineInput = z.infer<
  typeof updateLocationInlineInputSchema
>;
export type UpdateRoomInlineInput = z.infer<typeof updateRoomInlineInputSchema>;
export type InlineItemFinancialInput = z.infer<
  typeof inlineItemFinancialInputSchema
>;
export type InlineItemGeneralInput = z.infer<
  typeof inlineItemGeneralInputSchema
>;
export type InlineItemStatusInput = z.infer<typeof inlineItemStatusInputSchema>;
export type InlineItemTrackingInput = z.infer<
  typeof inlineItemTrackingInputSchema
>;
