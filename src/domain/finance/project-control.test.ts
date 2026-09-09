import { expect, it } from "vitest";
import { freightCoverageBreakdown } from "@/domain/billing/freight-coverage";
import {
  cashFunding,
  categoryPosition,
  freightPayable,
  revenueParts,
} from "./project-control";
it("partitions revenue without adding freight or services twice", () => {
  expect(revenueParts("100000", "15000", "10000")).toEqual({
    merchandise: "75000.0000",
    freight: "15000",
    other: "10000",
  });
});
it("rejects allocations that borrow another revenue category", () => {
  expect(() =>
    freightCoverageBreakdown(
      "100",
      "20",
      [
        {
          allocatedAmount: "90",
          freightCoverageHt: "10",
          otherCoverageHt: "0",
        },
      ],
      "30",
    ),
  ).toThrow("non-freight");
  expect(() =>
    freightCoverageBreakdown(
      "100",
      "20",
      [{ allocatedAmount: "50", otherCoverageHt: "40" }],
      "30",
    ),
  ).toThrow("Other/services");
  expect(() => freightCoverageBreakdown("100", "80", [], "30")).toThrow("fit");
});
it("distinguishes profit from recovery of the marked-up requirement", () => {
  expect(
    categoryPosition({
      billed: "120",
      allocated: "100",
      budget: "80",
      recordedCost: "100",
      markup: "0.3",
      recordedTarget: "130",
    }),
  ).toMatchObject({
    projectRemainder: "20.0000",
    recordedCostSurplus: "20.0000",
    recordedTargetSurplus: "-10.0000",
    budgetTarget: "104.0000",
  });
});
it("includes overdue commitments and subtracts only outstanding amounts from actual cash", () => {
  expect(
    cashFunding({
      received: "150000",
      supplierPaid: "100000",
      freightPaid: "0",
      horizonEnd: "2026-10-09",
      commitments: [
        { amount: "80000", dueDate: "2026-09-01" },
        { amount: "5000", dueDate: null },
        { amount: "10000", dueDate: "2026-12-01" },
      ],
    }),
  ).toMatchObject({
    net: "50000.0000",
    nearTerm: "80000.0000",
    afterNearTerm: "-30000.0000",
    afterAll: "-45000.0000",
    undatedCount: 1,
  });
});
it("keeps missing FX incomplete and includes only VAT actually payable", () => {
  expect(freightPayable("100", "20", "REVERSE_CHARGE")).toBe("100.0000");
  expect(freightPayable("100", "20", "DOMESTIC")).toBe("120.0000");
  expect(
    cashFunding({
      received: null,
      supplierPaid: "0",
      freightPaid: "0",
      horizonEnd: "2026-10-09",
      commitments: [],
    }).net,
  ).toBeNull();
});
