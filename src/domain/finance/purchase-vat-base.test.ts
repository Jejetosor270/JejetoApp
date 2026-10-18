import { describe, expect, it } from "vitest";

import {
  proposePurchaseVatBase,
  purchaseVatCostReviewKey,
} from "./purchase-vat-base";

describe("reviewed purchase VAT base", () => {
  it("sums all normalized HT costs once without markup or VAT", () => {
    expect(
      proposePurchaseVatBase({
        purchaseCost: "100.1234",
        freight: "20.0001",
        customsDuties: "3.4567",
        miscellaneous: "0.0001",
      }),
    ).toBe("123.5803");
  });

  it("uses only the employee-selected components", () => {
    expect(
      proposePurchaseVatBase(
        {
          purchaseCost: "100",
          freight: "20",
          customsDuties: "3",
          miscellaneous: "5",
        },
        ["purchaseCost", "freight"],
      ),
    ).toBe("120");
  });

  it("does not double-count a duplicated selection", () => {
    expect(
      proposePurchaseVatBase({ freight: "20" }, ["freight", "freight"]),
    ).toBe("20");
  });

  it("handles grouped/comma decimals without floating point", () => {
    expect(
      proposePurchaseVatBase({ purchaseCost: "1 234,5678", freight: "0,0001" }),
    ).toBe("1234.5679");
  });

  it("retains explicit zero but does not turn an empty draft into zero", () => {
    expect(proposePurchaseVatBase({ purchaseCost: "0" })).toBe("0");
    expect(proposePurchaseVatBase({})).toBeNull();
    expect(proposePurchaseVatBase({ purchaseCost: "100" }, [])).toBe("0");
  });

  it.each(["-1", "not an amount", "1.23456", "Infinity"])(
    "does not propose a base for an invalid selected cost: %s",
    (freight) => {
      expect(
        proposePurchaseVatBase({ purchaseCost: "100", freight }),
      ).toBeNull();
      expect(
        proposePurchaseVatBase({ purchaseCost: "100", freight }, [
          "purchaseCost",
        ]),
      ).toBe("100");
    },
  );

  it("compares normalized costs without warnings for display-only changes", () => {
    expect(purchaseVatCostReviewKey({ purchaseCost: "1 200,00" })).toBe(
      purchaseVatCostReviewKey({ purchaseCost: "1200" }),
    );
    expect(
      purchaseVatCostReviewKey({ purchaseCost: "1200", freight: "2" }),
    ).not.toBe(
      purchaseVatCostReviewKey({ purchaseCost: "1200", freight: "3" }),
    );
  });
});
