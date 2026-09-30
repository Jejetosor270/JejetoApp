import { expect, it } from "vitest";
import {
  missingProjectBudgetInputs,
  type ProjectBudgetInputs,
} from "./budget-information";

const inputs: ProjectBudgetInputs = {
  estimatedPurchaseCostHt: "0",
  estimatedOtherCostHt: "0",
  freightEstimateRate: "0",
  targetMode: "MARKUP",
  expectedSellHt: null,
};

it("treats approved zero budgets as complete and ignores inactive direct selling input", () => {
  expect(missingProjectBudgetInputs(inputs)).toEqual([]);
});

it("identifies each missing budget input without reporting dependent calculated values", () => {
  expect(
    missingProjectBudgetInputs({
      ...inputs,
      estimatedPurchaseCostHt: null,
      estimatedOtherCostHt: null,
      freightEstimateRate: null,
    }),
  ).toEqual([
    "Product purchase budget",
    "Freight allowance percentage",
    "Other/services budget",
  ]);
  expect(
    missingProjectBudgetInputs({ ...inputs, estimatedOtherCostHt: null }),
  ).toEqual(["Other/services budget"]);
});

it("requires the approved selling target only in direct mode", () => {
  expect(
    missingProjectBudgetInputs({ ...inputs, targetMode: "EXPECTED_SELL" }),
  ).toEqual(["Approved selling target"]);
  expect(
    missingProjectBudgetInputs({
      ...inputs,
      targetMode: "EXPECTED_SELL",
      expectedSellHt: "0",
    }),
  ).toEqual([]);
});
