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

  it("uses Total HT as the ordinary single-rate VAT taxable base", () => {
    const extraction = quoteExtractionFixture();
    extraction.financials.goodsSubtotalHt.value = "100000";
    extraction.financials.freightHt = {
      diagnostic: null,
      status: "MISSING",
      value: null,
    };
    extraction.financials.totalHt.value = "100000";
    extraction.financials.totalVat.value = "20000";
    extraction.financials.totalTtc.value = "120000";
    extraction.financials.vatLines[0]!.taxableBase.value = "90000";
    extraction.financials.vatLines[0]!.amount.value = "20000";

    const proposal = buildQuoteReviewProposal(extraction);
    expect(proposal.financial).toMatchObject({
      inputVatAmount: "20000.0000",
      inputVatRate: "0.200000",
      inputVatTaxableBase: "100000.0000",
    });
  });

  it("does not add freight again when Total HT already includes it", () => {
    const extraction = quoteExtractionFixture();
    extraction.financials.goodsSubtotalHt.value = "90000";
    extraction.financials.freightHt.value = "10000";
    extraction.financials.freightRelationToTotal.value = "INCLUDED_IN_TOTAL";
    extraction.financials.totalHt.value = "100000";
    extraction.financials.totalVat.value = "20000";
    extraction.financials.totalTtc.value = "120000";
    extraction.financials.vatLines[0]!.taxableBase.value = "110000";
    extraction.financials.vatLines[0]!.amount.value = "20000";

    const proposal = buildQuoteReviewProposal(extraction);
    expect(proposal.financial.inputVatTaxableBase).toBe("100000.0000");
    expect(proposal.financial.freight).toBe("10000.0000");
  });

  it("preserves a zero-rate taxable base without inventing VAT", () => {
    const extraction = quoteExtractionFixture();
    extraction.financials.goodsSubtotalHt.value = "100000";
    extraction.financials.totalHt.value = "100000";
    extraction.financials.totalVat.value = "0";
    extraction.financials.totalTtc.value = "100000";
    extraction.financials.vatLines[0]!.taxableBase.value = "100000";
    extraction.financials.vatLines[0]!.rate.value = "0";
    extraction.financials.vatLines[0]!.amount.value = "0";

    expect(buildQuoteReviewProposal(extraction).financial).toMatchObject({
      inputVatAmount: "0.0000",
      inputVatRate: "0.000000",
      inputVatTaxableBase: "100000.0000",
    });
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

  it("adds an editable balance to a single 30% deposit", () => {
    const extraction = quoteExtractionFixture();
    extraction.paymentTerms.installments = [
      extraction.paymentTerms.installments[0]!,
    ];

    expect(
      buildQuoteReviewProposal(extraction).payments.map((payment) => ({
        label: payment.label,
        rate: payment.percentageRate,
      })),
    ).toEqual([
      { label: "Deposit", rate: "0.300000" },
      { label: "Balance", rate: "0.700000" },
    ]);
  });

  it("adds an editable balance to a single 50% deposit", () => {
    const extraction = quoteExtractionFixture();
    const deposit = extraction.paymentTerms.installments[0]!;
    deposit.percentageRate.value = "0.50";
    extraction.paymentTerms.installments = [deposit];

    expect(
      buildQuoteReviewProposal(extraction).payments.map(
        (payment) => payment.percentageRate,
      ),
    ).toEqual(["0.500000", "0.500000"]);
  });

  it("defaults to one editable 100% installment without clear terms", () => {
    const extraction = quoteExtractionFixture();
    extraction.paymentTerms.installments = [];

    expect(buildQuoteReviewProposal(extraction).payments).toEqual([
      {
        basis: "PERCENTAGE",
        dueDate: null,
        fixedAmount: null,
        label: "Full payment",
        percentageRate: "1.000000",
        timingDescription: null,
      },
    ]);
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
