import Decimal from "decimal.js";
import { difference, requiredRecovery, sumKnown } from "./project-control";

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
  projectMarkup: string;
  clientInvoicedHt: string | null;
  clientPaidHt: string | null;
}) {
  const supplierSellHt = requiredRecovery(
    input.supplierHt,
    input.projectMarkup,
  );
  return {
    ...input,
    supplierMarkupHt: difference(supplierSellHt, input.supplierHt),
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
