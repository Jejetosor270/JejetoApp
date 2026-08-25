/** Current MVP business setting for comparable company and portfolio totals. */
export const COMPANY_REPORTING_CURRENCY_CODE = "EUR";

export const cashFlowHorizons = [
  { label: "Next 30 days", value: "30d" },
  { label: "Next 90 days", value: "90d" },
  { label: "Next 6 months", value: "6m" },
  { label: "Next 12 months", value: "12m" },
] as const;

export type CashFlowHorizon = (typeof cashFlowHorizons)[number]["value"];

export function isCashFlowHorizon(value: string): value is CashFlowHorizon {
  return cashFlowHorizons.some((option) => option.value === value);
}
