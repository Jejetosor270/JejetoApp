import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/** Only the financial fields whose meaning is approved in the focused editor. */
export const projectBudgetSelect = {
  id: true,
  reportingCurrencyCode: true,
  clientBudgetTargetHt: true,
  estimatedPurchaseCostHt: true,
  estimatedOtherCostHt: true,
  estimatedFreightCostHt: true,
  freightEstimateRate: true,
  freightEstimateNotes: true,
  defaultProductMarkupRate: true,
  defaultFreightMarkupRate: true,
  defaultOtherCostMarkupRate: true,
  targetMode: true,
  expectedSellHt: true,
  targetMarkupRate: true,
} satisfies Prisma.ProjectSelect;

type BudgetRecord = Prisma.ProjectGetPayload<{
  select: typeof projectBudgetSelect;
}>;

/** Reused by the edit token and audit; all money/rates stay exact strings. */
export function projectBudgetSnapshot(project: BudgetRecord) {
  return Object.fromEntries(
    (Object.keys(projectBudgetSelect) as (keyof BudgetRecord)[]).map((key) => [
      key,
      project[key]?.toString() ?? null,
    ]),
  );
}
