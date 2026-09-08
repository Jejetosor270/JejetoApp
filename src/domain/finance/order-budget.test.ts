import { describe, it, expect } from "vitest";
import { orderBudgetComparison, projectPurchaseBudget } from "./order-budget";
const base = {
  budget: "100.0000",
  purchase: "110.0000",
  purchaseCurrency: "EUR",
  reportingCurrency: "EUR",
  purchaseFx: null,
  agreedMarkup: "0.30",
  actualMarkup: "0.25",
};
describe("Order budget comparisons", () => {
  it("uses exact decimals and percentage point differences", () => {
    expect(orderBudgetComparison(base)).toEqual({
      actualPurchase: "110.0000",
      variance: "10.0000",
      markupDifferencePoints: "-5.00",
    });
  });
  it("converts purchase using manual FX", () => {
    expect(
      orderBudgetComparison({
        ...base,
        purchaseCurrency: "USD",
        purchaseFx: "0.8",
      }).variance,
    ).toBe("-12.0000");
  });
  it("keeps missing FX incomplete", () => {
    expect(
      orderBudgetComparison({ ...base, purchaseCurrency: "USD" }),
    ).toMatchObject({ actualPurchase: null, variance: null });
  });
  it("distinguishes missing budget, purchase and markup from zero", () => {
    expect(
      orderBudgetComparison({
        ...base,
        budget: null,
        purchase: null,
        actualMarkup: null,
      }),
    ).toEqual({
      actualPurchase: null,
      variance: null,
      markupDifferencePoints: null,
    });
    expect(
      orderBudgetComparison({ ...base, budget: "0", purchase: "0" }).variance,
    ).toBe("0.0000");
  });
  it("sums allocations exactly and identifies over-allocation", () => {
    expect(projectPurchaseBudget("0.2", ["0.1", "0.2", null])).toEqual({
      target: "0.2",
      allocated: "0.3000",
      remaining: "-0.1000",
      unbudgetedCount: 1,
    });
    expect(projectPurchaseBudget(null, []).remaining).toBeNull();
  });
});
