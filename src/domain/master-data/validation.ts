import { z } from "zod";
import Decimal from "decimal.js";

import { isSupportedCountryCode } from "@/config/countries";
import { ProjectStatus, ProjectTargetMode } from "@/generated/prisma/client";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );

const optionalEmail = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .toLowerCase()
    .max(320, "Email must be 320 characters or fewer.")
    .pipe(z.email("Enter a valid email address."))
    .optional(),
);

const optionalCountryCode = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === ""
      ? undefined
      : typeof value === "string"
        ? value.trim().toUpperCase()
        : value,
  z
    .string()
    .refine(isSupportedCountryCode, "Choose a supported country.")
    .optional(),
);

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Choose a valid currency.");

const optionalDate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.iso.date("Enter a valid date.").optional(),
);

const optionalPercentRate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/,
      "Enter a percentage from 0 to 100.",
    )
    .refine((value) => new Decimal(value).lessThanOrEqualTo(100))
    .transform((value) => new Decimal(value).dividedBy(100).toFixed(6))
    .optional(),
);

const optionalMoney = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
      "Enter a positive monetary amount.",
    )
    .transform((value) => new Decimal(value).toFixed(4))
    .optional(),
);

const optionalNonNegativeInteger = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce
    .number()
    .int("Enter a whole number.")
    .min(0, "This value cannot be negative.")
    .optional(),
);

const clientFields = {
  billingAddressLine1: optionalText(200),
  billingAddressLine2: optionalText(200),
  billingCity: optionalText(120),
  billingPostalCode: optionalText(32),
  contactName: optionalText(160),
  countryCode: optionalCountryCode,
  defaultCurrencyCode: currencyCode,
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(160),
  email: optionalEmail,
  legalName: z
    .string()
    .trim()
    .min(2, "Legal name must be at least 2 characters.")
    .max(200),
  notes: optionalText(4000),
  phone: optionalText(50),
  vatNumber: optionalText(64),
};

const supplierFields = {
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  contactName: optionalText(160),
  countryCode: optionalCountryCode,
  defaultCurrencyCode: currencyCode,
  defaultLeadTimeWeeks: optionalNonNegativeInteger,
  defaultPaymentTermsDays: optionalNonNegativeInteger,
  defaultPaymentTermsNotes: optionalText(240),
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(160),
  email: optionalEmail,
  legalName: z
    .string()
    .trim()
    .min(2, "Legal name must be at least 2 characters.")
    .max(200),
  notes: optionalText(4000),
  phone: optionalText(50),
  postalCode: optionalText(32),
  vatNumber: optionalText(64),
};

export const createClientInputSchema = z.object(clientFields);
export const updateClientInputSchema = z.object({
  id: z.uuid("Invalid client."),
  isActive: z.boolean(),
  ...clientFields,
});
export const createSupplierInputSchema = z.object(supplierFields);
export const updateSupplierInputSchema = z.object({
  id: z.uuid("Invalid supplier."),
  isActive: z.boolean(),
  ...supplierFields,
});

const projectFields = {
  clientBudgetTargetHt: optionalMoney,
  clientId: z.uuid("Choose a valid client."),
  code: z
    .string()
    .trim()
    .min(2, "Project code must be at least 2 characters.")
    .max(40),
  countryCode: optionalCountryCode,
  expectedCompletionDate: optionalDate,
  estimatedFreightCostHt: optionalMoney,
  estimatedPurchaseCostHt: optionalMoney,
  expectedSellHt: optionalMoney,
  freightEstimateNotes: optionalText(500),
  freightEstimateRate: optionalPercentRate,
  name: z
    .string()
    .trim()
    .min(2, "Project name must be at least 2 characters.")
    .max(200),
  notes: optionalText(4000),
  projectManagerId: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.uuid("Choose a valid project manager.").optional(),
  ),
  reportingCurrencyCode: currencyCode,
  startDate: optionalDate,
  status: z.enum(ProjectStatus),
  targetMarkupRate: optionalPercentRate,
  targetMode: z.enum(ProjectTargetMode).optional(),
};

const projectDateOrder = (value: {
  expectedCompletionDate?: string | undefined;
  startDate?: string | undefined;
}) =>
  !value.startDate ||
  !value.expectedCompletionDate ||
  value.expectedCompletionDate >= value.startDate;

export const createProjectInputSchema = z
  .object(projectFields)
  .refine(projectDateOrder, {
    error: "Expected completion must be on or after the start date.",
    path: ["expectedCompletionDate"],
  });
export const updateProjectInputSchema = z
  .object({ id: z.uuid("Invalid project."), ...projectFields })
  .refine(projectDateOrder, {
    error: "Expected completion must be on or after the start date.",
    path: ["expectedCompletionDate"],
  });

const buildingFields = {
  description: optionalText(4000),
  name: z
    .string()
    .trim()
    .min(2, "Building name must be at least 2 characters.")
    .max(160),
  shortCode: z.string().trim().min(1, "Short code is required.").max(32),
};

export const createBuildingInputSchema = z.object({
  projectId: z.uuid("Invalid project."),
  ...buildingFields,
});
export const updateBuildingInputSchema = z.object({
  id: z.uuid("Invalid building."),
  isActive: z.boolean(),
  ...buildingFields,
});

export type CreateClientInput = z.infer<typeof createClientInputSchema>;
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierInputSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierInputSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type CreateBuildingInput = z.infer<typeof createBuildingInputSchema>;
export type UpdateBuildingInput = z.infer<typeof updateBuildingInputSchema>;
