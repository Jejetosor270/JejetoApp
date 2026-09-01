import { describe, expect, it } from "vitest";

import {
  allocationReconciliation,
  calculateClientBillingAmounts,
} from "./calculations";

describe("client billing calculations", () => {
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
