import Decimal from "decimal.js";

import { vatAmount } from "@/domain/finance/calculations";
import {
  impliedPercentage,
  reconcileSchedule,
  scheduledAmountFromPercentage,
  supplierPayableBase,
} from "@/domain/payments/calculations";
import { normalizeMoneyInput } from "@/domain/procurement/presentation";

export interface QuoteScheduleDraftLine {
  basis: "PERCENTAGE" | "FIXED_AMOUNT";
  fixedAmount: string;
  percentagePercent: string;
}

export interface QuoteScheduleDraftSummary {
  invalidLineCount: number;
  isReconciled: boolean;
  overallocated: string;
  scheduled: string;
  scheduledPercentage: string | null;
  unscheduled: string;
}

function money(value: string): Decimal | null {
  const normalized = normalizeMoneyInput(value);
  if (normalized === null || normalized === "") return null;
  return new Decimal(normalized);
}

function percentage(value: string): Decimal | null {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d?|100)(?:\.\d{0,4})?$/.test(normalized)) return null;
  const rate = new Decimal(normalized).dividedBy(100);
  return rate.greaterThan(0) && rate.lessThanOrEqualTo(1) ? rate : null;
}

export function calculateQuoteSupplierPayable(input: {
  applyInputVat: boolean;
  inputVatAmount: string;
  inputVatRatePercent: string;
  inputVatTaxableBase: string;
  inputVatTreatment: string;
  purchaseCost: string;
}): Decimal {
  const purchase = money(input.purchaseCost) ?? new Decimal(0);
  const manualVat = money(input.inputVatAmount);
  const taxableBase = money(input.inputVatTaxableBase);
  const rate = percentage(input.inputVatRatePercent);
  const calculatedVat =
    taxableBase && rate ? vatAmount(taxableBase, rate) : null;
  return supplierPayableBase({
    inputVatAmount: input.applyInputVat
      ? (manualVat ?? calculatedVat)
      : undefined,
    inputVatTreatment: input.applyInputVat
      ? input.inputVatTreatment
      : undefined,
    supplierPurchase: purchase,
  });
}

export function reconcileQuoteScheduleDraft(
  supplierPayable: Decimal.Value,
  lines: readonly QuoteScheduleDraftLine[],
): QuoteScheduleDraftSummary {
  const base = new Decimal(supplierPayable);
  let invalidLineCount = 0;
  const installments = lines.flatMap((line) => {
    const scheduledAmount =
      line.basis === "PERCENTAGE"
        ? (() => {
            const rate = percentage(line.percentagePercent);
            if (!rate || base.isZero()) return null;
            return scheduledAmountFromPercentage(base, rate);
          })()
        : money(line.fixedAmount);
    if (!scheduledAmount || !scheduledAmount.greaterThan(0)) {
      invalidLineCount += 1;
      return [];
    }
    return [{ paidAmount: "0", scheduledAmount }];
  });
  const reconciliation = reconcileSchedule(base, installments);
  const implied = impliedPercentage(reconciliation.scheduled, base);
  return {
    invalidLineCount,
    isReconciled:
      invalidLineCount === 0 &&
      !base.isZero() &&
      reconciliation.unscheduled.isZero() &&
      reconciliation.overallocated.isZero(),
    overallocated: reconciliation.overallocated.toFixed(4),
    scheduled: reconciliation.scheduled.toFixed(4),
    scheduledPercentage: implied
      ? implied.times(100).toDecimalPlaces(4).toString()
      : null,
    unscheduled: reconciliation.unscheduled.toFixed(4),
  };
}
