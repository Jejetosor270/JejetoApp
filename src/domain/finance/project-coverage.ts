import Decimal from "decimal.js";
import { difference, sumKnown } from "./project-control";

/** Reporting attribution only: a receipt pays each Invoice HT category proportionally. */
export function freightReceiptHt(
  amountTtc: string,
  invoiceTtc: string,
  freightHt: string,
): string | null {
  if (new Decimal(freightHt).isZero() || new Decimal(amountTtc).isZero())
    return "0";
  if (new Decimal(invoiceTtc).lessThanOrEqualTo(0)) return null;
  return new Decimal(amountTtc)
    .times(freightHt)
    .dividedBy(invoiceTtc)
    .toString();
}

export function projectFreightCoverage(input: {
  supplierHt: string | null;
  economicCost: string | null;
  recoveryTarget: string | null;
  clientInvoicedHt: string | null;
  clientPaidHt: string | null;
}) {
  const supplierSellHt = input.recoveryTarget;
  return {
    ...input,
    nonDeductibleVat: difference(input.economicCost, input.supplierHt),
    supplierMarkupHt: difference(supplierSellHt, input.economicCost),
    supplierSellHt,
    invoicedCoverageHt: difference(input.clientInvoicedHt, supplierSellHt),
    paidCoverageHt: difference(input.clientPaidHt, supplierSellHt),
  };
}

export const financialTotalKeys = [
  "budget",
  "recordedCost",
  "budgetTarget",
  "recordedTarget",
  "quoted",
  "billed",
  "allocated",
  "projectRemainder",
  "recordedTargetSurplus",
] as const;

export function financialCategoryTotals(
  categories: readonly Record<
    (typeof financialTotalKeys)[number],
    string | null
  >[],
) {
  return Object.fromEntries(
    financialTotalKeys.map((key) => [
      key,
      sumKnown(categories.map((row) => row[key])),
    ]),
  ) as Record<(typeof financialTotalKeys)[number], string | null>;
}
