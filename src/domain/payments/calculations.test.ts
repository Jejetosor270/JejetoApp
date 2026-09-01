import { describe, expect, it } from "vitest";

import {
  aggregateReportingCash,
  clientReceivableBase,
  convertPaymentAmount,
  derivePaymentStatus,
  deriveVendorPaymentStatus,
  impliedPercentage,
  installmentOutstanding,
  reconcileSchedule,
  scheduledAmountFromPercentage,
  supplierPayableBase,
} from "@/domain/payments/calculations";

describe("payment calculations", () => {
  it("calculates a percentage installment exactly", () => {
    expect(scheduledAmountFromPercentage("100000", "0.30").toFixed(4)).toBe(
      "30000.0000",
    );
    expect(impliedPercentage("25000", "100000")?.toFixed(6)).toBe("0.250000");
  });

  it("calculates outstanding and rejects overpayment", () => {
    expect(installmentOutstanding("50000", "20000").toFixed(2)).toBe(
      "30000.00",
    );
    expect(() => installmentOutstanding("50000", "50000.01")).toThrow(
      RangeError,
    );
  });

  it.each([
    ["PAID", "50000", "50000", "2026-08-01"],
    ["PARTIALLY_PAID", "50000", "20000", "2026-09-01"],
    ["OVERDUE", "50000", "0", "2026-07-01"],
    ["DUE", "50000", "0", "2026-08-23"],
    ["UPCOMING", "50000", "0", "2026-09-01"],
  ])("derives %s status", (status, scheduledAmount, paidAmount, dueDate) => {
    expect(
      derivePaymentStatus({
        dueDate,
        isCancelled: false,
        paidAmount,
        scheduledAmount,
        today: "2026-08-23",
      }),
    ).toBe(status);
  });

  it("reconciles under- and over-allocated schedules", () => {
    const under = reconcileSchedule("100000", [
      { paidAmount: "20000", scheduledAmount: "50000" },
      { paidAmount: "0", scheduledAmount: "40000" },
    ]);
    expect(under.unscheduled.toFixed(2)).toBe("10000.00");
    expect(under.scheduledOutstanding.toFixed(2)).toBe("70000.00");
    expect(under.remainingTotal.toFixed(2)).toBe("80000.00");
    const over = reconcileSchedule("100000", [
      { paidAmount: "0", scheduledAmount: "110000" },
    ]);
    expect(over.overallocated.toFixed(2)).toBe("10000.00");
  });

  it("derives Item vendor payment context from Order settlements", () => {
    const installments = [
      {
        isCancelled: false,
        scheduledAmount: "30",
        sequence: 1,
        settlements: [{ amount: "30" }],
      },
      {
        isCancelled: false,
        scheduledAmount: "70",
        sequence: 2,
        settlements: [],
      },
    ];
    expect(deriveVendorPaymentStatus(installments)).toBe("DEPOSIT_PAID");
    expect(
      deriveVendorPaymentStatus([
        ...installments.slice(0, 1),
        { ...installments[1]!, settlements: [{ amount: "20" }] },
      ]),
    ).toBe("DEPOSIT_PAID");
    expect(
      deriveVendorPaymentStatus([
        { ...installments[0]!, settlements: [{ amount: "10" }] },
        installments[1]!,
      ]),
    ).toBe("PARTIALLY_PAID");
    expect(
      deriveVendorPaymentStatus([
        installments[0]!,
        { ...installments[1]!, settlements: [{ amount: "70" }] },
      ]),
    ).toBe("PAID_IN_FULL");
  });

  it("uses supplier invoice VAT but excludes unrelated landed costs", () => {
    expect(
      supplierPayableBase({
        inputVatAmount: "20000",
        inputVatTreatment: "DOMESTIC",
        supplierPurchase: "100000",
      }).toFixed(2),
    ).toBe("120000.00");
    expect(
      supplierPayableBase({
        inputVatAmount: "20000",
        inputVatTreatment: "IMPORT",
        supplierPurchase: "100000",
      }).toFixed(2),
    ).toBe("100000.00");
  });

  it("uses selling revenue plus output VAT without double-counting freight", () => {
    expect(
      clientReceivableBase({
        outputVatAmount: "20400",
        sellingRevenue: "102000",
      }).toFixed(2),
    ).toBe("122400.00");
  });

  it("converts same and foreign currencies and exposes missing FX", () => {
    expect(
      convertPaymentAmount({
        amount: "1000",
        currencyCode: "EUR",
        reportingCurrencyCode: "EUR",
      })?.toFixed(2),
    ).toBe("1000.00");
    expect(
      convertPaymentAmount({
        amount: "1000",
        currencyCode: "USD",
        fxRateToReporting: "0.86",
        reportingCurrencyCode: "EUR",
      })?.toFixed(2),
    ).toBe("860.00");
    expect(
      convertPaymentAmount({
        amount: "1000",
        currencyCode: "USD",
        reportingCurrencyCode: "EUR",
      }),
    ).toBeNull();
  });

  it("aggregates expected and actual FX independently without mixing missing currencies", () => {
    const summary = aggregateReportingCash({
      installments: [
        {
          currencyCode: "USD",
          expectedFxRate: "0.86",
          isCancelled: false,
          outstandingAmount: "700",
          scheduledAmount: "1000",
          settlements: [{ actualFxRate: "0.82", amount: "300" }],
        },
        {
          currencyCode: "CHF",
          isCancelled: false,
          outstandingAmount: "500",
          scheduledAmount: "500",
          settlements: [],
        },
      ],
      reportingCurrencyCode: "EUR",
    });
    expect(summary.scheduled.toFixed(2)).toBe("860.00");
    expect(summary.paid.toFixed(2)).toBe("246.00");
    expect(summary.outstanding.toFixed(2)).toBe("602.00");
    expect(summary.incompleteAmountCount).toBe(1);
  });
});
