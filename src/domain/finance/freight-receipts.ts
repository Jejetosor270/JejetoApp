import Decimal from "decimal.js";
import { reportingAmount } from "./calculations";
import { sumKnown } from "./project-control";

interface FreightCashTransaction {
  id: string;
  amount: string;
  currencyCode: string;
  fxRateToReporting: string | null;
  reportingCurrencyCode?: string;
}

interface FreightReceiptInput {
  totalTtc: string;
  freightCoverageHt: string;
  currencyCode: string;
  reportingCurrencyCode: string;
  credits: readonly {
    totalHt: string;
    vatAmount: string;
    freightCoverageHt: string;
    currencyCode: string;
    isCancelled: boolean;
  }[];
  receipts: readonly FreightCashTransaction[];
  refunds: readonly FreightCashTransaction[];
}

export interface FreightReceiptContribution {
  id: string;
  isRefund: boolean;
  amountHt: string | null;
  reportingAmountHt: string | null;
}

interface FreightReceiptSummary {
  paidFreightHt: string | null;
  reportingPaidFreightHt: string | null;
  contributions: FreightReceiptContribution[];
}

/**
 * Reporting attribution for one issued Invoice, after its active credits.
 * The caller resolves matched Quote receipts once and supplies actual refunds only.
 * Net cash pays the remaining freight proportionally, capped in Invoice currency.
 * Apply that same proportion to each signed cash transaction at its actual FX;
 * commercial Invoice/credit FX never supplies a missing cash conversion.
 * Reporting currency retains cash FX differences, rather than a commercial-FX cap.
 * This is a current category attribution, not dated cash or settlement authority.
 */
export function summarizeFreightReceipts(
  input: FreightReceiptInput,
): FreightReceiptSummary {
  const cash = [
    ...input.receipts.map((row) => ({ ...row, isRefund: false })),
    ...input.refunds.map((row) => ({ ...row, isRefund: true })),
  ];
  const incomplete = (): FreightReceiptSummary => ({
    paidFreightHt: null,
    reportingPaidFreightHt: null,
    contributions: cash.map((row) => ({
      id: row.id,
      isRefund: row.isRefund,
      amountHt: null,
      reportingAmountHt: null,
    })),
  });
  const credits = input.credits.filter((credit) => !credit.isCancelled);
  const originalTtc = new Decimal(input.totalTtc);
  const originalFreight = new Decimal(input.freightCoverageHt);
  if (
    originalTtc.isNegative() ||
    originalFreight.isNegative() ||
    originalFreight.greaterThan(originalTtc) ||
    credits.some(
      (credit) =>
        credit.currencyCode !== input.currencyCode ||
        new Decimal(credit.totalHt).isNegative() ||
        new Decimal(credit.vatAmount).isNegative() ||
        new Decimal(credit.freightCoverageHt).isNegative() ||
        new Decimal(credit.freightCoverageHt).greaterThan(credit.totalHt),
    ) ||
    cash.some(
      (row) =>
        row.currencyCode !== input.currencyCode ||
        new Decimal(row.amount).isNegative(),
    )
  )
    return incomplete();

  const netTtc = credits.reduce(
    (total, credit) => total.minus(credit.totalHt).minus(credit.vatAmount),
    originalTtc,
  );
  const netFreight = credits.reduce(
    (total, credit) => total.minus(credit.freightCoverageHt),
    originalFreight,
  );
  const netCash = cash.reduce(
    (total, row) =>
      row.isRefund ? total.minus(row.amount) : total.plus(row.amount),
    new Decimal(0),
  );
  if (
    netTtc.isNegative() ||
    netFreight.isNegative() ||
    netFreight.greaterThan(netTtc) ||
    netCash.isNegative()
  )
    return incomplete();

  // Excess cash can still be refund-due; it cannot pay extra freight.
  const proportion =
    netFreight.isZero() || netCash.isZero()
      ? new Decimal(0)
      : netFreight.dividedBy(Decimal.max(netTtc, netCash));
  const contributions = cash.map((row): FreightReceiptContribution => {
    const amount = new Decimal(row.amount).times(proportion);
    const converted = amount.isZero()
      ? amount
      : row.reportingCurrencyCode !== undefined &&
          row.reportingCurrencyCode !== input.reportingCurrencyCode
        ? null
        : reportingAmount({
            originalAmount: amount,
            originalCurrencyCode: row.currencyCode,
            reportingCurrencyCode: input.reportingCurrencyCode,
            fxRateToReporting: row.fxRateToReporting,
          });
    return {
      id: row.id,
      isRefund: row.isRefund,
      amountHt: (row.isRefund ? amount.negated() : amount).toString(),
      reportingAmountHt:
        converted === null
          ? null
          : (row.isRefund ? converted.negated() : converted).toFixed(4),
    };
  });
  return {
    paidFreightHt: netCash.times(proportion).toFixed(4),
    // Sum the serialized rows so every reporting drilldown reconciles exactly.
    reportingPaidFreightHt: sumKnown(
      contributions.map((row) => row.reportingAmountHt),
    ),
    contributions,
  };
}
