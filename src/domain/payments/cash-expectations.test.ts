import { describe, expect, it } from "vitest";
import { cappedCashTerms } from "./cash-expectations";

const term = { amount: "1000", paid: "0", due: "2026-09-30", cancelled: false };

describe("shared cash expectation cap", () => {
  it("caps a 1000 term at 600 after a 400 document-level receipt", () => {
    const result = cappedCashTerms("1000", "400", [term]);
    expect(result.terms[0]?.amount.toFixed(4)).toBe("600.0000");
    expect(result.unscheduled.toString()).toBe("0");
    expect(term.paid).toBe("0");
  });
  it("allocates remaining balance by due date and preserves undated/cancelled terms", () => {
    const result = cappedCashTerms("1000", "400", [
      { ...term, amount: "500", due: null },
      { ...term, amount: "500", due: "2026-10-01" },
      { ...term, amount: "500", due: "2026-09-01" },
      { ...term, due: "2026-08-01", cancelled: true },
    ]);
    expect(result.terms.map(({ amount }) => amount.toString())).toEqual([
      "0",
      "500",
      "100",
      "0",
    ]);
    expect(result.unscheduled.toString()).toBe("0");
  });
  it("keeps exact fractional and unscheduled balances and rejects invalid overpayment", () => {
    expect(
      cappedCashTerms("0.3", "0.1", [
        { ...term, amount: "0.1" },
      ]).unscheduled.toString(),
    ).toBe("0.1");
    expect(() => cappedCashTerms("1000", "1100", [term])).toThrow(
      "Paid amount cannot exceed",
    );
  });
});
