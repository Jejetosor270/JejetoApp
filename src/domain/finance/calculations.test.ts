import { describe, expect, it } from "vitest";

import {
  amountIncludingVat,
  convertCurrency,
  crossCurrencyFinancialMetrics,
  economicLandedCost,
  grossMarginRate,
  grossProfit,
  financialMetrics,
  landedCost,
  markupRate,
  packageSellingPriceFromTargetMargin,
  reportingAmount,
  sellingPriceFromTargetMargin,
  totalSellingRevenue,
  vatAmount,
} from "@/domain/finance/calculations";

describe("procurement finance calculations", () => {
  it("calculates gross profit", () => {
    expect(
      grossProfit({ landedCost: "70000", sellingPrice: "100000" }).toFixed(2),
    ).toBe("30000.00");
  });

  it("keeps margin and markup distinct", () => {
    const input = { landedCost: "70000", sellingPrice: "100000" };

    expect(grossMarginRate(input).toFixed(6)).toBe("0.300000");
    expect(markupRate(input).toFixed(6)).toBe("0.428571");
  });

  it("calculates selling price from a target margin", () => {
    expect(sellingPriceFromTargetMargin("70000", "0.30").toFixed(2)).toBe(
      "100000.00",
    );
  });

  it("supports a zero percent target margin", () => {
    expect(sellingPriceFromTargetMargin("70000", "0").toFixed(2)).toBe(
      "70000.00",
    );
  });

  it("adds separately recharged freight once", () => {
    expect(
      totalSellingRevenue("90000", "RECHARGED_SEPARATELY", "5000").toFixed(2),
    ).toBe("95000.00");
    expect(
      totalSellingRevenue("90000", "INCLUDED_IN_PACKAGE_PRICE", "5000").toFixed(
        2,
      ),
    ).toBe("90000.00");
  });

  it("backs separately recharged freight out of target package price", () => {
    const packagePrice = packageSellingPriceFromTargetMargin(
      "70000",
      "0.30",
      "RECHARGED_SEPARATELY",
      "5000",
    );
    expect(packagePrice.toFixed(2)).toBe("95000.00");
    expect(
      totalSellingRevenue(packagePrice, "RECHARGED_SEPARATELY", "5000").toFixed(
        2,
      ),
    ).toBe("100000.00");
  });

  it("returns explicit undefined rates for zero denominators", () => {
    const zeroCost = financialMetrics({
      landedCost: "0",
      sellingPrice: "100",
    });
    const zeroSelling = financialMetrics({
      landedCost: "25",
      sellingPrice: "0",
    });
    expect(zeroCost.markupRate).toBeNull();
    expect(zeroSelling.grossMarginRate).toBeNull();
    expect(zeroSelling.grossProfit.toFixed(2)).toBe("-25.00");
  });

  it("calculates landed cost without binary floating-point errors", () => {
    expect(
      landedCost({
        supplierPurchase: "0.20",
        supplierDiscount: "0.05",
        freight: "0.10",
        customsDuties: "0.03",
        miscellaneous: "0.02",
      }).toFixed(2),
    ).toBe("0.30");
  });

  it("converts currency with an exact decimal rate", () => {
    expect(convertCurrency("1000", "0.9234567890").toFixed(4)).toBe("923.4568");
  });

  it("handles same-currency, foreign-currency, and missing FX explicitly", () => {
    expect(
      reportingAmount({
        originalAmount: "1000",
        originalCurrencyCode: "EUR",
        reportingCurrencyCode: "EUR",
      })?.toFixed(4),
    ).toBe("1000.0000");
    expect(
      reportingAmount({
        fxRateToReporting: "0.8575000000",
        originalAmount: "50000",
        originalCurrencyCode: "USD",
        reportingCurrencyCode: "EUR",
      })?.toFixed(4),
    ).toBe("42875.0000");
    expect(
      reportingAmount({
        originalAmount: "50000",
        originalCurrencyCode: "USD",
        reportingCurrencyCode: "EUR",
      }),
    ).toBeNull();
  });

  it("calculates VAT and TTC at arbitrary Decimal-safe rates", () => {
    expect(vatAmount("100", "0.20").toFixed(4)).toBe("20.0000");
    expect(vatAmount("100", "0.22").toFixed(4)).toBe("22.0000");
    expect(vatAmount("100", "0").toFixed(4)).toBe("0.0000");
    expect(amountIncludingVat("100", "22").toFixed(4)).toBe("122.0000");
  });

  it("adds only non-recoverable input VAT to economic landed cost", () => {
    expect(economicLandedCost("70000").toFixed(2)).toBe("70000.00");
    expect(economicLandedCost("70000", "4000").toFixed(2)).toBe("74000.00");
  });

  it("keeps output VAT out of revenue and margin, including recharged freight", () => {
    const sellingRevenue = totalSellingRevenue(
      "90000",
      "RECHARGED_SEPARATELY",
      "5000",
    );
    const outputVat = vatAmount(sellingRevenue, "0.20");
    const metrics = financialMetrics({
      landedCost: "70000",
      sellingPrice: sellingRevenue,
    });
    expect(sellingRevenue.toFixed(2)).toBe("95000.00");
    expect(amountIncludingVat(sellingRevenue, outputVat).toFixed(2)).toBe(
      "114000.00",
    );
    expect(metrics.grossProfit.toFixed(2)).toBe("25000.00");
  });

  it("calculates USD purchase versus EUR sale margin in EUR", () => {
    const metrics = crossCurrencyFinancialMetrics({
      economicLandedCost: "50000",
      purchaseCurrencyCode: "USD",
      purchaseFxRateToReporting: "0.8575",
      reportingCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      sellingRevenue: "60000",
    });
    expect(metrics?.grossProfit.toFixed(2)).toBe("17125.00");
    expect(metrics?.grossMarginRate?.toFixed(6)).toBe("0.285417");
  });

  it("converts CHF cost and GBP revenue before an EUR margin comparison", () => {
    const metrics = crossCurrencyFinancialMetrics({
      economicLandedCost: "80000",
      purchaseCurrencyCode: "CHF",
      purchaseFxRateToReporting: "1.04",
      reportingCurrencyCode: "EUR",
      sellingCurrencyCode: "GBP",
      sellingFxRateToReporting: "1.17",
      sellingRevenue: "100000",
    });
    expect(metrics?.grossProfit.toFixed(2)).toBe("33800.00");
    expect(metrics?.grossMarginRate?.toFixed(6)).toBe("0.288889");
  });

  it("does not calculate a cross-currency margin with missing FX", () => {
    expect(
      crossCurrencyFinancialMetrics({
        economicLandedCost: "50000",
        purchaseCurrencyCode: "USD",
        reportingCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        sellingRevenue: "60000",
      }),
    ).toBeNull();
  });

  it("rejects undefined pricing denominators and invalid target rates", () => {
    expect(() =>
      grossMarginRate({ landedCost: "0", sellingPrice: "0" }),
    ).toThrow(RangeError);
    expect(() => markupRate({ landedCost: "0", sellingPrice: "100" })).toThrow(
      RangeError,
    );
    expect(() => sellingPriceFromTargetMargin("100", "1")).toThrow(RangeError);
  });

  it("rejects a discount greater than the supplier purchase", () => {
    expect(() =>
      landedCost({ supplierPurchase: "100", supplierDiscount: "100.01" }),
    ).toThrow(RangeError);
  });

  it("rejects negative cost components and non-positive FX rates", () => {
    expect(() => landedCost({ supplierPurchase: "-0.01" })).toThrow(RangeError);
    expect(() => convertCurrency("100", "0")).toThrow(RangeError);
    expect(() => convertCurrency("100", "-1")).toThrow(RangeError);
    expect(() => vatAmount("100", "1.01")).toThrow(RangeError);
  });

  it("rejects negative selling inputs and an excessive freight recharge", () => {
    expect(() =>
      financialMetrics({ landedCost: "10", sellingPrice: "-1" }),
    ).toThrow(RangeError);
    expect(() =>
      packageSellingPriceFromTargetMargin(
        "10",
        "0",
        "RECHARGED_SEPARATELY",
        "11",
      ),
    ).toThrow(RangeError);
  });
});
