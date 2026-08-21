import { describe, expect, it } from "vitest";

import {
  convertCurrency,
  grossMarginRate,
  grossProfit,
  landedCost,
  markupRate,
  sellingPriceFromTargetMargin,
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
  });
});
