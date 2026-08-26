import { describe, expect, it } from "vitest";

import { buildQuoteSupplierDraft } from "@/domain/quote-intake/supplier-creation";
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
});
