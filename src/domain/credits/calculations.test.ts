import { describe, expect, it } from "vitest";

import {
  creditAmounts,
  creditCashPosition,
  remainingAfterCredits,
  supplierCreditEffect,
} from "./calculations";

const original = {
  totalHt: "1000",
  vatAmount: "200",
  freightCoverageHt: "100",
  otherCoverageHt: "50",
};

describe("explicit credit reductions", () => {
  it("reconciles merchandise/freight/other and VAT without changing originals", () => {
    expect(
      remainingAfterCredits(original, [
        {
          totalHt: "200",
          vatAmount: "40",
          freightCoverageHt: "50",
          otherCoverageHt: "10",
        },
        {
          totalHt: "100",
          vatAmount: "20",
          freightCoverageHt: "0",
          otherCoverageHt: "0",
        },
      ]),
    ).toEqual({
      totalHt: "700.0000",
      vatAmount: "140.0000",
      totalTtc: "840.0000",
      freightCoverageHt: "50.0000",
      otherCoverageHt: "40.0000",
      merchandiseHt: "610.0000",
      creditedTtc: "360.0000",
    });
    expect(original.totalHt).toBe("1000");
  });
  it("rejects credit overruns separately for VAT and category balances", () => {
    expect(() =>
      remainingAfterCredits(original, [{ ...original, vatAmount: "201" }]),
    ).toThrow("vatAmount");
    expect(() =>
      remainingAfterCredits(original, [
        { ...original, freightCoverageHt: "101" },
      ]),
    ).toThrow("freightCoverageHt");
    expect(() =>
      remainingAfterCredits(original, [
        { ...original, freightCoverageHt: "0" },
      ]),
    ).toThrow("merchandise");
    expect(() => creditAmounts({ ...original, totalHt: "-1" })).toThrow();
    expect(() => creditAmounts({ ...original, totalHt: "NaN" })).toThrow();
  });
  it("keeps credits and refunded cash separate for unpaid, partial and fully paid documents", () => {
    expect(
      creditCashPosition({
        originalTtc: "1200",
        creditedTtc: "300",
        paidTtc: "600",
        refundedTtc: "0",
      }),
    ).toEqual({
      netDue: "900.0000",
      netPaid: "600.0000",
      outstanding: "300.0000",
      refundDue: "0.0000",
    });
    expect(
      creditCashPosition({
        originalTtc: "1200",
        creditedTtc: "900",
        paidTtc: "600",
        refundedTtc: "100",
      }),
    ).toEqual({
      netDue: "300.0000",
      netPaid: "500.0000",
      outstanding: "0.0000",
      refundDue: "200.0000",
    });
    expect(
      creditCashPosition({
        originalTtc: "1200",
        creditedTtc: "300",
        paidTtc: "1200",
        refundedTtc: "300",
      }),
    ).toEqual({
      netDue: "900.0000",
      netPaid: "900.0000",
      outstanding: "0.0000",
      refundDue: "0.0000",
    });
    expect(() =>
      creditCashPosition({
        originalTtc: "1200",
        creditedTtc: "300",
        paidTtc: "600",
        refundedTtc: "1",
      }),
    ).toThrow("refundable");
    expect(() =>
      creditCashPosition({
        originalTtc: "1200",
        creditedTtc: "1201",
        paidTtc: "1200",
        refundedTtc: "0",
      }),
    ).toThrow("original");
  });
  it("reverses partial input VAT recoverability without reducing selling prices", () => {
    expect(
      supplierCreditEffect({
        purchaseAmountHt: "100",
        vatAmount: "20",
        recoverableRate: "0.5",
      }),
    ).toEqual({
      deductibleVatAmount: "10.0000",
      economicCostReduction: "110.0000",
      payableReduction: "120.0000",
    });
    expect(
      supplierCreditEffect({
        purchaseAmountHt: "100",
        vatAmount: "20",
        recoverableRate: "1",
      }).economicCostReduction,
    ).toBe("100.0000");
    expect(
      supplierCreditEffect({
        purchaseAmountHt: "100",
        vatAmount: "20",
        recoverableRate: "0",
      }).economicCostReduction,
    ).toBe("120.0000");
  });
});
