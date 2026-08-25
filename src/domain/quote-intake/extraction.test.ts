import { describe, expect, it } from "vitest";

import {
  buildQuoteReviewProposal,
  supplierQuoteExtractionSchema,
} from "@/domain/quote-intake/extraction";
import { quoteExtractionFixture } from "@/test/quote-extraction-fixture";

describe("supplier quote extraction", () => {
  it("validates strict normalized output and derives Decimal-safe proposals", () => {
    const extraction = supplierQuoteExtractionSchema.parse(
      quoteExtractionFixture(),
    );
    const proposal = buildQuoteReviewProposal(extraction);

    expect(proposal.financial).toMatchObject({
      currencyCode: "EUR",
      freight: "5000.0000",
      inputVatAmount: "21000.0000",
      inputVatRate: "0.200000",
      leadTimeWeeks: 10,
      purchaseCost: "100000.0000",
    });
    expect(proposal.payments.map((item) => item.percentageRate)).toEqual([
      "0.300000",
      "0.700000",
    ]);
    expect(proposal.warnings).toContain(
      "Lead time is a 8–10 week range; the proposed Order value uses the conservative maximum.",
    );
    expect(proposal.warnings).toContain(
      "One or more payment terms have no objective calendar date. Add due dates before approving a schedule.",
    );
  });

  it("flags total and payment reconciliation issues without inventing values", () => {
    const extraction = quoteExtractionFixture();
    extraction.financials.totalTtc.value = "125000";
    extraction.paymentTerms.installments[1]!.percentageRate.value = "0.60";
    const proposal = buildQuoteReviewProposal(extraction);

    expect(proposal.warnings).toContain(
      "HT plus VAT differs from TTC by 1000.00; verify the quote totals.",
    );
    expect(proposal.warnings).toContain(
      "Extracted percentage installments total 90%, not 100%.",
    );
  });

  it("flags missing currency, ambiguous freight, and an invalid VAT observation", () => {
    const extraction = quoteExtractionFixture();
    extraction.quote.currencyCode = {
      diagnostic: null,
      status: "MISSING",
      value: null,
    };
    extraction.financials.freightRelationToTotal = {
      diagnostic: "The document total label is unclear.",
      status: "AMBIGUOUS",
      value: "UNCLEAR",
    };
    extraction.financials.vatLines[0]!.rate.value = "1.20";
    const proposal = buildQuoteReviewProposal(extraction);

    expect(proposal.financial.currencyCode).toBeNull();
    expect(proposal.financial.inputVatRate).toBeNull();
    expect(proposal.warnings).toEqual(
      expect.arrayContaining([
        "Quote currency is missing or ambiguous; employee confirmation is required.",
        "Freight was extracted but its relationship to total HT is unclear; review the cost split before applying it.",
        "At least one extracted fractional rate exceeds 1.000000.",
      ]),
    );
  });

  it("keeps multiple VAT rates separate and compares observed VAT deterministically", () => {
    const multiple = quoteExtractionFixture();
    const firstLine = multiple.financials.vatLines[0];
    if (!firstLine) throw new Error("Fixture VAT line missing.");
    multiple.financials.vatLines.push(structuredClone(firstLine));
    const multipleProposal = buildQuoteReviewProposal(multiple);
    expect(multipleProposal.financial.inputVatRate).toBeNull();
    expect(multipleProposal.warnings).toContain(
      "Multiple VAT rates or bases were extracted. The current Order model accepts one INPUT VAT entry, so VAT must be reviewed manually.",
    );

    const inconsistent = quoteExtractionFixture();
    inconsistent.financials.vatLines[0]!.amount.value = "20900";
    expect(buildQuoteReviewProposal(inconsistent).warnings).toContain(
      "The observed VAT amount differs from taxable base × rate by 100.00; keep the document amount as evidence and review it manually.",
    );
  });

  it("represents 50/50, 30/40/30, and fixed payment proposals exactly", () => {
    const fifty = quoteExtractionFixture();
    fifty.paymentTerms.installments[0]!.percentageRate.value = "0.50";
    fifty.paymentTerms.installments[1]!.percentageRate.value = "0.50";
    const fiftyProposal = buildQuoteReviewProposal(fifty);
    expect(fiftyProposal.payments.map((item) => item.percentageRate)).toEqual([
      "0.500000",
      "0.500000",
    ]);
    expect(
      fiftyProposal.warnings.some((item) => item.includes("not 100%")),
    ).toBe(false);

    const split = quoteExtractionFixture();
    split.paymentTerms.installments[0]!.percentageRate.value = "0.30";
    split.paymentTerms.installments[1]!.percentageRate.value = "0.40";
    split.paymentTerms.installments.push({
      ...structuredClone(split.paymentTerms.installments[0]!),
      label: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "Balance",
      },
      percentageRate: {
        diagnostic: null,
        status: "EXTRACTED",
        value: "0.30",
      },
    });
    const splitProposal = buildQuoteReviewProposal(split);
    expect(splitProposal.payments.map((item) => item.percentageRate)).toEqual([
      "0.300000",
      "0.400000",
      "0.300000",
    ]);

    const fixed = quoteExtractionFixture();
    fixed.paymentTerms.installments = [
      {
        ...fixed.paymentTerms.installments[0]!,
        basis: "FIXED_AMOUNT",
        fixedAmount: {
          diagnostic: null,
          status: "EXTRACTED",
          value: "25000",
        },
        percentageRate: {
          diagnostic: null,
          status: "MISSING",
          value: null,
        },
      },
    ];
    expect(buildQuoteReviewProposal(fixed).payments[0]).toMatchObject({
      basis: "FIXED_AMOUNT",
      fixedAmount: "25000.0000",
      percentageRate: null,
    });
  });

  it("rejects unnormalized financial values and unknown output fields", () => {
    const extraction = quoteExtractionFixture();
    extraction.financials.totalHt.value = "105,000.00";
    expect(supplierQuoteExtractionSchema.safeParse(extraction).success).toBe(
      false,
    );

    expect(
      supplierQuoteExtractionSchema.safeParse({
        ...quoteExtractionFixture(),
        unsupported: "value",
      }).success,
    ).toBe(false);

    const inconsistent = quoteExtractionFixture();
    inconsistent.quote.reference.status = "MISSING";
    expect(supplierQuoteExtractionSchema.safeParse(inconsistent).success).toBe(
      false,
    );
  });
});
