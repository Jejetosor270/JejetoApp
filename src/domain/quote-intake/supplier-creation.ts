import type { ZodError } from "zod";

import { countries } from "@/config/countries";
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

interface ParsedSupplierAddress {
  addressLine1: string;
  addressLine2: string;
  city: string;
  countryCode: string;
  postalCode: string;
}

const countryAliases: Record<string, string> = {
  deutschland: "DE",
  espana: "ES",
  italia: "IT",
  nederland: "NL",
  osterreich: "AT",
  schweiz: "CH",
  suisse: "CH",
  svizzera: "CH",
  uk: "GB",
  "great britain": "GB",
};
const postalToken =
  "(?:[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2}|\\d{4}\\s?[A-Z]{2}|\\d{2}-\\d{3}|\\d{4}-\\d{3}|\\d{3}\\s\\d{2}|\\d{5}|\\d{4})";
const postalAndCityPattern = new RegExp(`^(${postalToken})\\s+(.+)$`, "iu");
const embeddedPostalAndCityPattern = new RegExp(
  `^(.+?)\\s+(${postalToken})\\s+([^,]+)$`,
  "iu",
);
const postalOnlyPattern = new RegExp(`^${postalToken}$`, "iu");

function normalizedAddressPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countryCode(value: string): string | null {
  const normalized = normalizedAddressPart(value);
  const configured = countries.find(
    (country) =>
      normalizedAddressPart(country.label) === normalized ||
      country.code.toLocaleLowerCase("en") === normalized,
  );
  return configured?.code ?? countryAliases[normalized] ?? null;
}

function addressLines(parts: string[]): {
  addressLine1: string;
  addressLine2: string;
} {
  if (!parts.length) return { addressLine1: "", addressLine2: "" };
  return {
    addressLine1: (parts[0] ?? "").slice(0, 200),
    addressLine2: parts.slice(1).join(", ").slice(0, 200),
  };
}

export function parseSupplierAddress(
  value: string | null,
): ParsedSupplierAddress {
  const source =
    value
      ?.replace(/[\r\n]+/g, ",")
      .replace(/[\t ]+/g, " ")
      .trim() ?? "";
  if (!source)
    return {
      addressLine1: "",
      addressLine2: "",
      city: "",
      countryCode: "",
      postalCode: "",
    };
  const parts = source
    .split(/[,;\n]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  let detectedCountry = "";
  const lastPart = parts.at(-1);
  if (lastPart) {
    const exactCountry = countryCode(lastPart);
    if (exactCountry) {
      detectedCountry = exactCountry;
      parts.pop();
    }
  }
  let city = "";
  let postalCode = "";
  let postalIndex = -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const match = postalAndCityPattern.exec(parts[index] ?? "");
    if (!match) continue;
    postalCode = (match[1] ?? "").replace(/\s+/g, " ").toUpperCase();
    city = (match[2] ?? "").trim();
    postalIndex = index;
    break;
  }
  if (postalIndex >= 0) {
    parts.splice(postalIndex, 1);
  } else {
    let postalOnlyIndex = -1;
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (postalOnlyPattern.test(parts[index] ?? "")) {
        postalOnlyIndex = index;
        break;
      }
    }
    if (postalOnlyIndex > 0) {
      const possibleCity = parts[postalOnlyIndex - 1] ?? "";
      if (!/\d/u.test(possibleCity)) {
        postalCode = (parts[postalOnlyIndex] ?? "")
          .replace(/\s+/g, " ")
          .toUpperCase();
        city = possibleCity;
        parts.splice(postalOnlyIndex - 1, 2);
      }
    } else if (parts.length === 1) {
      const embedded = embeddedPostalAndCityPattern.exec(parts[0] ?? "");
      if (embedded) {
        parts[0] = (embedded[1] ?? "").trim();
        postalCode = (embedded[2] ?? "").replace(/\s+/g, " ").toUpperCase();
        city = (embedded[3] ?? "").trim();
      }
    }
  }
  const lines = addressLines(parts);
  return {
    ...lines,
    city: city.slice(0, 120),
    countryCode: detectedCountry,
    postalCode: postalCode.slice(0, 32),
  };
}

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
  const address = parseSupplierAddress(
    extractedText(extraction.supplier.address),
  );
  return {
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    contactName: "",
    countryCode: address.countryCode,
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
    postalCode: address.postalCode,
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
