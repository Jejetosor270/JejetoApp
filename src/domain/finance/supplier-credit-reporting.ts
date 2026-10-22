import Decimal from "decimal.js";
import { supplierCreditEffect } from "@/domain/credits/calculations";
import { reportingAmount } from "./calculations";
import { sumKnown } from "./project-control";
import type { RefundExpectationCredit } from "@/domain/credits/refund-expectations";

type Amount = { toString(): string };
export interface SupplierReportingCredit extends RefundExpectationCredit {
  isCancelled: boolean;
  totalHt: Amount;
  freightCoverageHt?: Amount;
  otherCoverageHt?: Amount;
  vatAmount: Amount;
  supplierRecoverableRate: Amount | null;
  currencyCode: string;
  reportingCurrencyCode: string;
  fxRateToReporting: Amount | null;
  refunds: readonly {
    amount: Amount;
    fxRateToReporting: Amount | null;
    isCancelled: boolean;
  }[];
}

/** Positive reductions, with each credit/refund's own preserved FX context. */
export function summarizeSupplierCredits(
  credits: readonly SupplierReportingCredit[],
  reportingCurrencyCode: string,
) {
  const active = credits.filter((credit) => !credit.isCancelled);
  const rows = active.map((credit) => {
    const effect = supplierCreditEffect({
      purchaseAmountHt: credit.totalHt.toString(),
      vatAmount: credit.vatAmount.toString(),
      recoverableRate: credit.supplierRecoverableRate?.toString() ?? "0",
    });
    const convert = (amount: string, fx = credit.fxRateToReporting) =>
      new Decimal(amount).isZero()
        ? "0"
        : credit.reportingCurrencyCode !== reportingCurrencyCode
          ? null
          : (reportingAmount({
              originalAmount: amount,
              originalCurrencyCode: credit.currencyCode,
              reportingCurrencyCode,
              fxRateToReporting: fx?.toString() ?? null,
            })?.toString() ?? null);
    const refunds = credit.refunds.filter((refund) => !refund.isCancelled);
    const freight = credit.freightCoverageHt?.toString() ?? "0";
    const other = credit.otherCoverageHt?.toString() ?? "0";
    const merchandise = new Decimal(credit.totalHt.toString())
      .minus(freight)
      .minus(other)
      .toString();
    return {
      purchaseHt: credit.totalHt.toString(),
      merchandiseHt: merchandise,
      freightHt: freight,
      otherHt: other,
      vat: credit.vatAmount.toString(),
      economic: effect.economicCostReduction,
      payable: effect.payableReduction,
      deductibleVat: effect.deductibleVatAmount,
      reportingPurchaseHt: convert(credit.totalHt.toString()),
      reportingMerchandiseHt: convert(merchandise),
      reportingFreightHt: convert(freight),
      reportingOtherHt: convert(other),
      reportingVat: convert(credit.vatAmount.toString()),
      reportingEconomic: convert(effect.economicCostReduction),
      reportingPayable: convert(effect.payableReduction),
      reportingDeductibleVat: convert(effect.deductibleVatAmount),
      refunded: refunds
        .reduce(
          (sum, refund) => sum.plus(refund.amount.toString()),
          new Decimal(0),
        )
        .toString(),
      reportingRefunded: sumKnown(
        refunds.map((refund) =>
          convert(refund.amount.toString(), refund.fxRateToReporting),
        ),
      ),
    };
  });
  const sum = (field: keyof (typeof rows)[number]) =>
    sumKnown(rows.map((row) => row[field]));
  return {
    count: active.length,
    purchaseHt: sum("purchaseHt") ?? "0",
    merchandiseHt: sum("merchandiseHt") ?? "0",
    freightHt: sum("freightHt") ?? "0",
    otherHt: sum("otherHt") ?? "0",
    vat: sum("vat") ?? "0",
    economic: sum("economic") ?? "0",
    payable: sum("payable") ?? "0",
    deductibleVat: sum("deductibleVat") ?? "0",
    refunded: sum("refunded") ?? "0",
    reportingPurchaseHt: sum("reportingPurchaseHt"),
    reportingMerchandiseHt: sum("reportingMerchandiseHt"),
    reportingFreightHt: sum("reportingFreightHt"),
    reportingOtherHt: sum("reportingOtherHt"),
    reportingVat: sum("reportingVat"),
    reportingEconomic: sum("reportingEconomic"),
    reportingPayable: sum("reportingPayable"),
    reportingDeductibleVat: sum("reportingDeductibleVat"),
    reportingRefunded: sum("reportingRefunded"),
  };
}
export type SupplierCreditSummary = ReturnType<typeof summarizeSupplierCredits>;
