import Decimal from "decimal.js";
import { z } from "zod";

import { isSupportedCountryCode } from "@/config/countries";
import { isDateOnly } from "@/domain/payments/dates";
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
  name: z.string().trim().min(1, "Description is required.").max(240),
  notes: optionalText(4000),
  pricingMode: z.enum(PricingMode),
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
export const updateFreightEstimateSchema = z.object({
  id: z.uuid(),
  freightEstimateRate: optionalRate("Freight estimate"),
  freightEstimateNotes: optionalText(500),
});

export type CreateItemInput = z.infer<typeof createItemInputSchema>;
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>;
export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type CreateLocationInput = z.infer<typeof createLocationInputSchema>;
