import { describe, expect, it } from "vitest";

import {
  calculateOrderPricingDraft,
  effectiveVatBase,
  initializePricingMethod,
  orderPricingMethods,
} from "./order-pricing";
import { vatAmount } from "./calculations";

const base = {
  directPackageSell: "0",
  freightCost: "10",
  freightMarkupRate: "0.15",
  freightResale: "0",
  freightTreatment: "INCLUDED_IN_PACKAGE_PRICE",
  otherCost: "5",
  otherMarkupRate: "0.10",
  productCost: "100",
  productMarkupRate: "0.30",
  purchaseCurrencyCode: "EUR",
  reportingCurrencyCode: "EUR",
  sellingCurrencyCode: "EUR",
} as const;

describe("Order pricing draft", () => {
  it("exposes exactly the three current pricing methods", () => {
    expect(orderPricingMethods).toEqual([
      "PROJECT_MARKUP",
      "ORDER_MARKUP",
      "DIRECT_SELLING_PRICE",
    ]);
  });
  it.each(["PROJECT_MARKUP", "ORDER_MARKUP"] as const)(
    "derives separate sells in %s",
    (method) => {
      const result = calculateOrderPricingDraft({ ...base, method });
      expect(result).toMatchObject({
        freightSell: "11.5000",
        otherSell: "5.5000",
        productSell: "130.0000",
        totalSell: "147.0000",
      });
    },
  );

  it("derives effective markup from direct selling", () => {
    const result = calculateOrderPricingDraft({
      ...base,
      freightCost: "0",
      otherCost: "0",
      directPackageSell: "125",
      method: "DIRECT_SELLING_PRICE",
    });
    expect(result.productMarkupRate).toBe("0.250000");
    expect(result.effectiveMarkupRate).toBe("0.250000");
  });

  it("uses Total Sell in AUTO mode and preserves a manual VAT override", () => {
    expect(effectiveVatBase("147", null)).toBe("147.0000");
    expect(effectiveVatBase("160", "120")).toBe("120.0000");
    expect(effectiveVatBase("160", null)).toBe("160.0000");
  });

  it("reacts from cost through AUTO VAT base, VAT, and TTC", () => {
    const first = calculateOrderPricingDraft({
      ...base,
      freightCost: "0",
      method: "ORDER_MARKUP",
      otherCost: "0",
      productCost: "100",
    });
    const firstBase = effectiveVatBase(first.totalSell, null);
    const firstVat = vatAmount(firstBase ?? "0", "0.20");
    expect(first.totalSell).toBe("130.0000");
    expect(firstBase).toBe("130.0000");
    expect(firstVat.toFixed(4)).toBe("26.0000");
    expect(firstVat.plus(firstBase ?? "0").toFixed(4)).toBe("156.0000");

    const changed = calculateOrderPricingDraft({
      ...base,
      freightCost: "0",
      method: "ORDER_MARKUP",
      otherCost: "0",
      productCost: "200",
    });
    expect(effectiveVatBase(changed.totalSell, null)).toBe("260.0000");
    expect(effectiveVatBase(changed.totalSell, "125")).toBe("125.0000");
    expect(effectiveVatBase(changed.totalSell, null)).toBe("260.0000");
  });

  it("marks unlike currencies incomplete without authoritative FX", () => {
    expect(
      calculateOrderPricingDraft({
        ...base,
        method: "PROJECT_MARKUP",
        purchaseCurrencyCode: "USD",
      }).complete,
    ).toBe(false);
  });

  it("initializes explicit Order markups from currently effective rates", () => {
    expect(
      initializePricingMethod("ORDER_MARKUP", {
        effectiveFreightMarkupRate: "0.15",
        effectiveOtherMarkupRate: "0.10",
        effectiveProductMarkupRate: "0.30",
        freightSell: "11.5",
        freightTreatment: "INCLUDED_IN_PACKAGE_PRICE",
        totalSell: "147",
      }),
    ).toEqual({
      freightMarkupPercent: "15",
      otherMarkupPercent: "10",
      productMarkupPercent: "30",
    });
  });

  it("initializes direct selling without double-counting recharged freight", () => {
    expect(
      initializePricingMethod("DIRECT_SELLING_PRICE", {
        effectiveFreightMarkupRate: "0.15",
        effectiveOtherMarkupRate: "0.10",
        effectiveProductMarkupRate: "0.30",
        freightSell: "11.5",
        freightTreatment: "RECHARGED_SEPARATELY",
        totalSell: "147",
      }),
    ).toEqual({ directPackageSell: "135.5000", freightResale: "11.5000" });
    expect(
      initializePricingMethod("PROJECT_MARKUP", {
        effectiveFreightMarkupRate: "0.15",
        effectiveOtherMarkupRate: "0.10",
        effectiveProductMarkupRate: "0.30",
        freightSell: null,
        freightTreatment: "NOT_APPLICABLE",
        totalSell: null,
      }),
    ).toEqual({});
  });
});
