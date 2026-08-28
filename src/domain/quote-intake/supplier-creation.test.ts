import { describe, expect, it } from "vitest";

import {
  buildQuoteSupplierDraft,
  parseSupplierAddress,
} from "@/domain/quote-intake/supplier-creation";
import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

describe("quote Supplier creation draft", () => {
  it("prefills only structured extracted Supplier values", () => {
    const draft = buildQuoteSupplierDraft(quoteExtractionFixture(), "GBP");
    expect(draft).toMatchObject({
      addressLine1: "",
      city: "",
      contactName: "",
      defaultCurrencyCode: "EUR",
      displayName: "Maison Exemple",
      legalName: "Maison Exemple SAS",
      postalCode: "",
      vatNumber: "FR 12 345678901",
    });
  });

  it("does not promote missing or ambiguous AI values to defaults", () => {
    const extraction = quoteExtractionFixture();
    extraction.supplier.legalName = {
      diagnostic: "Two names are visible.",
      status: "AMBIGUOUS",
      value: "Possible Supplier",
    };
    extraction.quote.currencyCode = {
      diagnostic: null,
      status: "MISSING",
      value: null,
    };
    const draft = buildQuoteSupplierDraft(extraction, "GBP");
    expect(draft.legalName).toBe("");
    expect(draft.defaultCurrencyCode).toBe("GBP");
  });

  it("splits a recognized European full address conservatively", () => {
    expect(
      parseSupplierAddress("25 Rue du Commerce, 75015 Paris, France"),
    ).toEqual({
      addressLine1: "25 Rue du Commerce",
      addressLine2: "",
      city: "Paris",
      countryCode: "FR",
      postalCode: "75015",
    });
  });

  it("preserves uncertain address text instead of inventing components", () => {
    expect(parseSupplierAddress("Industrial Estate, Building B")).toEqual({
      addressLine1: "Industrial Estate",
      addressLine2: "Building B",
      city: "",
      countryCode: "",
      postalCode: "",
    });
  });

  it("recognizes common spaced European postal formats", () => {
    expect(
      parseSupplierAddress("Keizersgracht 1, 1012 AB Amsterdam, Netherlands"),
    ).toMatchObject({
      addressLine1: "Keizersgracht 1",
      city: "Amsterdam",
      countryCode: "NL",
      postalCode: "1012 AB",
    });
  });

  it("prefills parsed address fields only for an extracted address", () => {
    const extraction = quoteExtractionFixture();
    extraction.supplier.address = {
      diagnostic: null,
      status: "EXTRACTED",
      value: "25 Rue du Commerce, 75015 Paris, France",
    };
    expect(buildQuoteSupplierDraft(extraction, "EUR")).toMatchObject({
      addressLine1: "25 Rue du Commerce",
      city: "Paris",
      countryCode: "FR",
      postalCode: "75015",
    });
  });
});
