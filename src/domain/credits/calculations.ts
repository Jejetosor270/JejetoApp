import Decimal from "decimal.js";

import { calculateInputVatRecovery } from "@/domain/vat/recoverability";

function amount(value: string, label: string): Decimal {
  const result = new Decimal(value);
  if (!result.isFinite() || result.isNegative())
    throw new RangeError(`${label} must be a non-negative amount.`);
  return result;
}

export interface CreditAmount {
  totalHt: string;
  vatAmount: string;
  freightCoverageHt: string;
  otherCoverageHt: string;
}

/** Credit amounts are positive reductions, never negative invoices or cash. */
export function creditAmounts(input: CreditAmount) {
  const ht = amount(input.totalHt, "Credit HT");
  const vat = amount(input.vatAmount, "Credit VAT");
  const freight = amount(input.freightCoverageHt, "Credit freight HT");
  const other = amount(input.otherCoverageHt, "Credit other/services HT");
  if (freight.plus(other).greaterThan(ht))
    throw new RangeError("Credit categories cannot exceed credit HT.");
  if (ht.plus(vat).isZero())
    throw new RangeError("A credit must have a positive HT or VAT amount.");
  return {
    totalHt: ht.toFixed(4),
    vatAmount: vat.toFixed(4),
    totalTtc: ht.plus(vat).toFixed(4),
    merchandiseHt: ht.minus(freight).minus(other).toFixed(4),
    freightCoverageHt: freight.toFixed(4),
    otherCoverageHt: other.toFixed(4),
  };
}

/** Source amounts are immutable here; reductions must fit each original category. */
export function remainingAfterCredits(
  original: CreditAmount,
  credits: readonly CreditAmount[],
) {
  const source = {
    totalHt: amount(original.totalHt, "Original HT"),
    vatAmount: amount(original.vatAmount, "Original VAT"),
    freightCoverageHt: amount(
      original.freightCoverageHt,
      "Original freight HT",
    ),
    otherCoverageHt: amount(
      original.otherCoverageHt,
      "Original other/services HT",
    ),
  };
  const totals = {
    totalHt: new Decimal(0),
    vatAmount: new Decimal(0),
    freightCoverageHt: new Decimal(0),
    otherCoverageHt: new Decimal(0),
    merchandiseHt: new Decimal(0),
  };
  for (const credit of credits) {
    const validated = creditAmounts(credit);
    for (const key of Object.keys(totals) as (keyof typeof totals)[])
      totals[key] = totals[key].plus(validated[key]);
  }
  const merchandise = source.totalHt
    .minus(source.freightCoverageHt)
    .minus(source.otherCoverageHt);
  if (merchandise.isNegative())
    throw new RangeError("Original categories exceed original HT.");
  for (const key of Object.keys(source) as (keyof typeof source)[]) {
    if (totals[key].greaterThan(source[key]))
      throw new RangeError(`Credits exceed the original ${key} amount.`);
  }
  if (totals.merchandiseHt.greaterThan(merchandise))
    throw new RangeError("Credits exceed the original merchandise HT amount.");
  return {
    totalHt: source.totalHt.minus(totals.totalHt).toFixed(4),
    vatAmount: source.vatAmount.minus(totals.vatAmount).toFixed(4),
    totalTtc: source.totalHt
      .plus(source.vatAmount)
      .minus(totals.totalHt)
      .minus(totals.vatAmount)
      .toFixed(4),
    freightCoverageHt: source.freightCoverageHt
      .minus(totals.freightCoverageHt)
      .toFixed(4),
    otherCoverageHt: source.otherCoverageHt
      .minus(totals.otherCoverageHt)
      .toFixed(4),
    merchandiseHt: merchandise.minus(totals.merchandiseHt).toFixed(4),
    creditedTtc: totals.totalHt.plus(totals.vatAmount).toFixed(4),
  };
}

/**
 * Cash is retained at its original amount. A credit reduces the commercial debt;
 * a separately recorded refund reduces net settled cash and never reduces debt twice.
 */
export function creditCashPosition(input: {
  originalTtc: string;
  creditedTtc: string;
  paidTtc: string;
  refundedTtc: string;
}) {
  const original = amount(input.originalTtc, "Original TTC");
  const credited = amount(input.creditedTtc, "Credit TTC");
  const paid = amount(input.paidTtc, "Paid TTC");
  const refunded = amount(input.refundedTtc, "Refunded TTC");
  if (credited.greaterThan(original))
    throw new RangeError("Credits exceed the original TTC amount.");
  const netDue = original.minus(credited);
  const refundLimit = Decimal.max(paid.minus(netDue), 0);
  if (refunded.greaterThan(refundLimit))
    throw new RangeError("Refunds exceed the cash refundable after credits.");
  return {
    netDue: netDue.toFixed(4),
    netPaid: paid.minus(refunded).toFixed(4),
    outstanding: Decimal.max(netDue.minus(paid).plus(refunded), 0).toFixed(4),
    refundDue: refundLimit.minus(refunded).toFixed(4),
  };
}

/** Supplier VAT reversal follows the source's explicit recoverability, never AI. */
export function supplierCreditEffect(input: {
  purchaseAmountHt: string;
  vatAmount: string;
  recoverableRate: string;
}) {
  const purchase = amount(input.purchaseAmountHt, "Credit purchase HT");
  const vat = amount(input.vatAmount, "Credit VAT");
  if (purchase.plus(vat).isZero())
    throw new RangeError("A credit must have a positive HT or VAT amount.");
  const recoverableRate = new Decimal(input.recoverableRate);
  if (
    !recoverableRate.isFinite() ||
    recoverableRate.lt(0) ||
    recoverableRate.gt(1)
  )
    throw new RangeError("Recoverable rate must be between 0 and 1.");
  const recovery = calculateInputVatRecovery({
    vatAmount: vat,
    recoverableRate,
  });
  const deductible = recovery.deductibleVat.toDecimalPlaces(4);
  return {
    deductibleVatAmount: deductible.toFixed(4),
    economicCostReduction: purchase.plus(vat).minus(deductible).toFixed(4),
    payableReduction: purchase.plus(vat).toFixed(4),
  };
}
