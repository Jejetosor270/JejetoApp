import { describe, expect, it } from "vitest";

import {
  addAllocationAmount,
  allocationReconciliation,
  amountFromPercentage,
  calculateClientBillingAmounts,
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
    expect(percentageFromAmount("100000", "35000")).toBe("35");
    expect(scheduleReconciliation("100000", ["30000", "60000"])).toEqual({
      allocated: "90000.0000",
      overallocated: "0.0000",
      remaining: "10000.0000",
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
