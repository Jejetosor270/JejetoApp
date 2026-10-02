import { expect, it } from "vitest";
import {
  summarizeSupplierCredits,
  type SupplierReportingCredit,
} from "./supplier-credit-reporting";
import { creditCashPosition } from "@/domain/credits/calculations";

const credit: SupplierReportingCredit = {
  isCancelled: false,
  totalHt: "20",
  vatAmount: "4",
  supplierRecoverableRate: "0.5",
  currencyCode: "USD",
  reportingCurrencyCode: "EUR",
  fxRateToReporting: "0.8",
  refunds: [{ amount: "24", fxRateToReporting: "0.75", isCancelled: false }],
};
it("separates credit cost/VAT reduction from original cash and actual refund FX", () => {
  expect(summarizeSupplierCredits([credit], "EUR")).toEqual({
    count: 1,
    purchaseHt: "20.0000",
    vat: "4.0000",
    economic: "22.0000",
    payable: "24.0000",
    deductibleVat: "2.0000",
    refunded: "24.0000",
    reportingPurchaseHt: "16.0000",
    reportingVat: "3.2000",
    reportingEconomic: "17.6000",
    reportingPayable: "19.2000",
    reportingDeductibleVat: "1.6000",
    reportingRefunded: "18.0000",
  });
  expect(
    creditCashPosition({
      originalTtc: "120",
      creditedTtc: "24",
      paidTtc: "120",
      refundedTtc: "24",
    }),
  ).toEqual({
    netDue: "96.0000",
    netPaid: "96.0000",
    outstanding: "0.0000",
    refundDue: "0.0000",
  });
});
it("preserves explicit incompleteness for independent missing credit and refund FX", () => {
  const missing = summarizeSupplierCredits(
    [{ ...credit, fxRateToReporting: null }],
    "EUR",
  );
  expect(missing.reportingEconomic).toBeNull();
  expect(missing.reportingRefunded).toBe("18.0000");
  const refundMissing = summarizeSupplierCredits(
    [
      {
        ...credit,
        refunds: [
          { amount: "24", fxRateToReporting: null, isCancelled: false },
        ],
      },
    ],
    "EUR",
  );
  expect(refundMissing.reportingEconomic).toBe("17.6000");
  expect(refundMissing.reportingRefunded).toBeNull();
  expect(
    summarizeSupplierCredits([credit], "GBP").reportingEconomic,
  ).toBeNull();
});
it("ignores cancelled credits/refunds and handles zero VAT without a recovery classification", () => {
  expect(
    summarizeSupplierCredits([{ ...credit, isCancelled: true }], "EUR").count,
  ).toBe(0);
  const zeroVat = summarizeSupplierCredits(
    [
      {
        ...credit,
        vatAmount: "0",
        supplierRecoverableRate: null,
        refunds: [
          { amount: "24", fxRateToReporting: "0.8", isCancelled: true },
        ],
      },
    ],
    "EUR",
  );
  expect(zeroVat.economic).toBe("20.0000");
  expect(zeroVat.deductibleVat).toBe("0.0000");
  expect(zeroVat.refunded).toBe("0.0000");
});
