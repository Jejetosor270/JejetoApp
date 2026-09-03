import { describe, expect, it } from "vitest";

import {
  addAllocationAmount,
  allocationReconciliation,
  amountFromPercentage,
  calculateClientBillingAmounts,
  fractionFromAmount,
  isRecognizedClientReceivable,
  orderBillingCoverage,
  orderSellingBasisInBillingCurrency,
  percentageFromAmount,
  orderBillingDifference,
  scheduleReconciliation,
} from "./calculations";

describe("client billing calculations", () => {
  it("adds a Project remainder to an allocation Decimal-safely", () => {
    expect(addAllocationAmount("40.1234", "59.8766")).toBe("100.0000");
  });
  it("derives unbilled and overbilled Order differences without changing revenue", () => {
    expect(orderBillingDifference("100.0000", "70.0000")).toEqual({
      amount: "30.0000",
      state: "UNBILLED",
    });
    expect(orderBillingDifference("100.0000", "125.0000")).toEqual({
      amount: "25.0000",
      state: "OVERBILLED",
    });
    expect(orderBillingDifference("100.0000", null)).toBeNull();
  });
  it("derives partial, paid and overdue states", () => {
    const partial = calculateClientBillingAmounts({
      documentType: "INVOICE",
      dueDate: "2026-09-03",
      isCancelled: false,
      paidAmounts: ["25"],
      today: "2026-09-02",
      totalTtc: "100",
    });
    expect(partial).toMatchObject({
      outstanding: "75.0000",
      paid: "25.0000",
      status: "PARTIALLY_PAID",
    });
    expect(
      calculateClientBillingAmounts({
        documentType: "INVOICE",
        dueDate: "2026-09-01",
        isCancelled: false,
        paidAmounts: [],
        today: "2026-09-02",
        totalTtc: "100",
      }).status,
    ).toBe("OVERDUE");
  });

  it("reduces Invoice outstanding from authoritative receipts", () => {
    expect(
      calculateClientBillingAmounts({
        documentType: "INVOICE",
        dueDate: "2026-09-03",
        isCancelled: false,
        paidAmounts: [],
        today: "2026-09-02",
        totalTtc: "100000",
      }).outstanding,
    ).toBe("100000.0000");
    expect(
      calculateClientBillingAmounts({
        documentType: "INVOICE",
        dueDate: "2026-09-03",
        isCancelled: false,
        paidAmounts: ["100000"],
        today: "2026-09-02",
        totalTtc: "100000",
      }),
    ).toMatchObject({
      outstanding: "0.0000",
      paid: "100000.0000",
      status: "PAID",
    });
    expect(
      calculateClientBillingAmounts({
        documentType: "INVOICE",
        dueDate: "2026-09-03",
        isCancelled: false,
        paidAmounts: ["30000", "70000"],
        today: "2026-09-02",
        totalTtc: "100000",
      }).outstanding,
    ).toBe("0.0000");
    expect(
      calculateClientBillingAmounts({
        documentType: "INVOICE",
        dueDate: "2026-09-03",
        isCancelled: false,
        paidAmounts: ["40000"],
        today: "2026-09-02",
        totalTtc: "100000",
      }).outstanding,
    ).toBe("60000.0000");
  });

  it("recognizes active Invoices, not Quotes, as outstanding receivables", () => {
    expect(
      isRecognizedClientReceivable({
        documentType: "INVOICE",
        isCancelled: false,
      }),
    ).toBe(true);
    expect(
      isRecognizedClientReceivable({
        documentType: "QUOTE",
        isCancelled: false,
      }),
    ).toBe(false);
    expect(
      isRecognizedClientReceivable({
        documentType: "INVOICE",
        isCancelled: true,
      }),
    ).toBe(false);
  });

  it("reconciles Decimal allocations exactly", () => {
    expect(
      allocationReconciliation("150000", ["60000", "40000", "50000"]),
    ).toEqual({
      allocated: "150000.0000",
      overallocated: "0.0000",
      remaining: "0.0000",
    });
  });

  it("links human percentages and amounts in both directions", () => {
    expect(amountFromPercentage("100000", "30%")).toBe("30000.0000");
    expect(amountFromPercentage("100000", "30,5")).toBe("30500.0000");
    expect(amountFromPercentage("100 000,00", "30,5%")).toBe("30500.0000");
    expect(percentageFromAmount("100000", "35000")).toBe("35");
    expect(percentageFromAmount("100 000,00", "40 000,00")).toBe("40");
    expect(scheduleReconciliation("100000", ["30000", "60000"])).toEqual({
      allocated: "90000.0000",
      overallocated: "0.0000",
      remaining: "10000.0000",
    });
  });

  it("derives contextual allocation rates from one authoritative amount", () => {
    expect(fractionFromAmount("200000", "40000")).toBe("0.2");
    expect(fractionFromAmount("80000", "40000")).toBe("0.5");
    expect(percentageFromAmount("80000", "60000")).toBe("75");
  });

  it("converts the authoritative Order Sell HT into Billing currency", () => {
    expect(
      orderSellingBasisInBillingCurrency({
        billingCurrencyCode: "EUR",
        billingFxRateToReporting: null,
        orderSellingReporting: "80000",
        reportingCurrencyCode: "EUR",
      }),
    ).toBe("80000.0000");
    expect(
      orderSellingBasisInBillingCurrency({
        billingCurrencyCode: "USD",
        billingFxRateToReporting: "0.8",
        orderSellingReporting: "80000",
        reportingCurrencyCode: "EUR",
      }),
    ).toBe("100000.0000");
    expect(
      orderSellingBasisInBillingCurrency({
        billingCurrencyCode: "USD",
        billingFxRateToReporting: null,
        orderSellingReporting: "80000",
        reportingCurrencyCode: "EUR",
      }),
    ).toBeNull();
  });

  it("summarizes Order coverage across multiple Billing Events", () => {
    expect(orderBillingCoverage("100000", "80000")).toEqual({
      allocated: "80000.0000",
      coverageRate: "0.8",
      overallocated: "0.0000",
      remaining: "20000.0000",
      remainingRate: "0.2",
    });
    expect(orderBillingCoverage("100000", "120000")).toEqual({
      allocated: "120000.0000",
      coverageRate: "1.2",
      overallocated: "20000.0000",
      remaining: "0.0000",
      remainingRate: "0",
    });
  });

  it("derives cancellation without leaving an outstanding balance", () => {
    expect(
      calculateClientBillingAmounts({
        documentType: "QUOTE",
        dueDate: null,
        isCancelled: true,
        paidAmounts: [],
        today: "2026-09-02",
        totalTtc: "100",
      }),
    ).toEqual({
      outstanding: "0.0000",
      paid: "0.0000",
      status: "CANCELLED",
    });
  });
});
