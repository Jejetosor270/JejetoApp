import Decimal from "decimal.js";

import { normalizeDecimalInput } from "@/domain/validation/numeric";

export const purchaseVatCostKeys = [
  "purchaseCost",
  "freight",
  "customsDuties",
  "miscellaneous",
] as const;

export type PurchaseVatCostKey = (typeof purchaseVatCostKeys)[number];
export type PurchaseVatCosts = Partial<
  Record<PurchaseVatCostKey, string | null>
>;

/** Editor suggestion only: the employee reviews which invoice costs are taxable. */
export function proposePurchaseVatBase(
  costs: PurchaseVatCosts,
  selected: readonly PurchaseVatCostKey[] = purchaseVatCostKeys,
): string | null {
  const selectedKeys = purchaseVatCostKeys.filter((key) =>
    selected.includes(key),
  );
  let total = new Decimal(0);
  let hasAmount = selectedKeys.length === 0;
  for (const key of selectedKeys) {
    const amount = normalizeDecimalInput(costs[key] ?? "", {
      allowNegative: false,
      maximumDecimalPlaces: 4,
    });
    if (amount === null) return null;
    if (amount === "") continue;
    hasAmount = true;
    total = total.plus(amount);
  }
  return hasAmount ? total.toFixed() : null;
}

/** Comparable editor snapshot; invalid drafts remain distinguishable, not zero. */
export function purchaseVatCostReviewKey(costs: PurchaseVatCosts): string {
  return JSON.stringify(
    purchaseVatCostKeys.map((key) => {
      const raw = costs[key] ?? "";
      const normalized = normalizeDecimalInput(raw, {
        allowNegative: false,
        maximumDecimalPlaces: 4,
      });
      if (normalized === null) return raw;
      return normalized === "" ? "" : new Decimal(normalized).toFixed();
    }),
  );
}
