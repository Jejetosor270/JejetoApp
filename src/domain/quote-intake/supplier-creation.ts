import type { ZodError } from "zod";

import type { SupplierQuoteExtraction } from "@/domain/quote-intake/extraction";
import { extractedText } from "@/domain/quote-intake/extraction";

export const quoteSupplierDraftFields = [
  "addressLine1",
  "addressLine2",
  "city",
  "contactName",
  "countryCode",
  "defaultCurrencyCode",
  "defaultLeadTimeWeeks",
  "defaultPaymentTermsDays",
  "defaultPaymentTermsNotes",
  "displayName",
  "email",
  "legalName",
  "notes",
  "phone",
  "postalCode",
  "vatNumber",
] as const;

export type QuoteSupplierDraftField = (typeof quoteSupplierDraftFields)[number];
export type QuoteSupplierDraftValues = Record<QuoteSupplierDraftField, string>;

export function quoteSupplierDraftValues(
  formData: FormData,
): QuoteSupplierDraftValues {
  return Object.fromEntries(
    quoteSupplierDraftFields.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  ) as QuoteSupplierDraftValues;
}

export function buildQuoteSupplierDraft(
  extraction: SupplierQuoteExtraction,
  fallbackCurrencyCode: string,
): QuoteSupplierDraftValues {
  return {
    addressLine1: extractedText(extraction.supplier.address) ?? "",
    addressLine2: "",
    city: "",
    contactName: "",
    countryCode: "",
    defaultCurrencyCode:
      extractedText(extraction.quote.currencyCode) ?? fallbackCurrencyCode,
    defaultLeadTimeWeeks: "",
    defaultPaymentTermsDays: "",
    defaultPaymentTermsNotes:
      extractedText(extraction.paymentTerms.raw)?.slice(0, 240) ?? "",
    displayName: extractedText(extraction.supplier.displayName) ?? "",
    email: extractedText(extraction.supplier.email) ?? "",
    legalName: extractedText(extraction.supplier.legalName) ?? "",
    notes: "",
    phone: extractedText(extraction.supplier.phone) ?? "",
    postalCode: "",
    vatNumber: extractedText(extraction.supplier.vatNumber) ?? "",
  };
}

export function supplierCreationFieldErrors(
  error: ZodError,
): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [
      issue.path.map(String).join("."),
      issue.message,
    ]),
  );
}
