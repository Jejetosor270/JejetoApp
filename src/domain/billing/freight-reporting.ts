import Decimal from "decimal.js";
import { reportingAmount } from "@/domain/finance/calculations";
export function summarizeFreightCoverage(
  records: readonly {
    freightCoverageHt: string;
    currencyCode: string;
    fxRate: string | null;
    documentType: string;
    isCancelled: boolean;
  }[],
  reportingCurrency: string,
) {
  let actual = new Decimal(0),
    planned = new Decimal(0);
  let actualComplete = true,
    plannedComplete = true;
  for (const record of records) {
    if (record.isCancelled || new Decimal(record.freightCoverageHt).isZero())
      continue;
    const amount = reportingAmount({
      originalAmount: record.freightCoverageHt,
      originalCurrencyCode: record.currencyCode,
      reportingCurrencyCode: reportingCurrency,
      fxRateToReporting: record.fxRate,
    });
    if (record.documentType === "INVOICE") {
      if (amount === null) actualComplete = false;
      else actual = actual.plus(amount);
    } else {
      if (amount === null) plannedComplete = false;
      else planned = planned.plus(amount);
    }
  }
  return {
    invoicedFreightHt: actualComplete ? actual.toFixed(4) : null,
    quotedFreightHt: plannedComplete ? planned.toFixed(4) : null,
  };
}
export function freightDifference(revenue: string | null, cost: string | null) {
  return revenue === null || cost === null
    ? null
    : new Decimal(revenue).minus(cost).toFixed(4);
}
