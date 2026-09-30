export interface ProjectBudgetInputs {
  estimatedPurchaseCostHt: string | null;
  estimatedOtherCostHt: string | null;
  freightEstimateRate: string | null;
  targetMode: "MARKUP" | "EXPECTED_SELL";
  expectedSellHt: string | null;
}

/** Missing inputs only: zero is an explicit budget, never a missing value. */
export function missingProjectBudgetInputs(
  input: ProjectBudgetInputs,
): string[] {
  const missing: string[] = [];
  if (input.estimatedPurchaseCostHt === null)
    missing.push("Product purchase budget");
  if (input.freightEstimateRate === null)
    missing.push("Freight allowance percentage");
  if (input.estimatedOtherCostHt === null)
    missing.push("Other/services budget");
  if (input.targetMode === "EXPECTED_SELL" && input.expectedSellHt === null)
    missing.push("Approved selling target");
  return missing;
}
