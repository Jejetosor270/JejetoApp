import { describe, expect, it } from "vitest";

import {
  calculateComponentMarkup,
  markupFromSelling,
  resolveMarkup,
  sellingFromMarkup,
} from "./component-markup";

describe("component markup pricing", () => {
  it.each([
    ["0.15", "115.0000"],
    ["0.30", "130.0000"],
  ])("applies %s markup to cost", (rate, expected) => {
    expect(sellingFromMarkup("100", rate).toFixed(4)).toBe(expected);
  });

  it("derives markup from direct selling HT", () => {
    expect(markupFromSelling("100", "130")?.toFixed(6)).toBe("0.300000");
  });

  it("marks product and freight independently and aggregates money", () => {
    expect(
      calculateComponentMarkup({
        freightCost: "10",
        freightMarkupRate: "0.15",
        otherCost: "0",
        otherMarkupRate: "0",
        productCost: "100",
        productMarkupRate: "0.30",
      }),
    ).toEqual({
      effectiveMarkupRate: "0.286364",
      freightSell: "11.5000",
      grossProfit: "31.5000",
      otherSell: "0.0000",
      productSell: "130.0000",
      totalCost: "110.0000",
      totalSell: "141.5000",
    });
  });

  it("uses null as inheritance and keeps explicit overrides", () => {
    expect(resolveMarkup("0.30", null)).toEqual({
      rate: "0.300000",
      source: "PROJECT_DEFAULT",
    });
    expect(resolveMarkup("0.30", "0.25")).toEqual({
      rate: "0.250000",
      source: "ORDER_OVERRIDE",
    });
    expect(resolveMarkup("0.35", null).rate).toBe("0.350000");
    expect(resolveMarkup("0.35", "0.25").rate).toBe("0.250000");
  });

  it("does not invent freight revenue from zero cost", () => {
    expect(sellingFromMarkup("0", "9.99").toFixed(4)).toBe("0.0000");
  });
});
