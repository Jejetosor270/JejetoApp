import { describe, expect, it } from "vitest";
import {
  refundExpectations,
  type RefundExpectationCredit,
} from "./refund-expectations";

const credit = (
  overrides: Partial<RefundExpectationCredit> = {},
): RefundExpectationCredit => ({
  id: "a",
  reference: "CN-1",
  creditDate: new Date("2026-10-01"),
  totalHt: "100",
  vatAmount: "20",
  expectedRefundDate: new Date("2026-10-30"),
  expectedRefundFxRateToReporting: "0.9",
  reportingCurrencyCode: "EUR",
  refunds: [],
  ...overrides,
});

describe("refund expectations", () => {
  it("caps expectations to refundable cash and excludes actual refunds", () => {
    expect(
      refundExpectations(
        [
          credit({ id: "b", creditDate: new Date("2026-10-02") }),
          credit({
            refunds: [{ amount: "30" }, { amount: "10", isCancelled: true }],
          }),
          credit({ id: "cancelled", isCancelled: true }),
        ],
        "110",
      ),
    ).toEqual([
      {
        id: "a",
        reference: "CN-1",
        amount: "90.0000",
        dueDate: "2026-10-30",
        expectedFxRate: "0.9",
        reportingCurrencyCode: "EUR",
      },
      {
        id: "b",
        reference: "CN-1",
        amount: "20.0000",
        dueDate: "2026-10-30",
        expectedFxRate: "0.9",
        reportingCurrencyCode: "EUR",
      },
    ]);
  });
  it("does not invent dates or expected FX for historical credits", () => {
    expect(
      refundExpectations(
        [
          credit({
            expectedRefundDate: null,
            expectedRefundFxRateToReporting: null,
          }),
        ],
        "5.1234",
      )[0],
    ).toMatchObject({ amount: "5.1234", dueDate: null, expectedFxRate: null });
    expect(refundExpectations([credit()], "0")).toEqual([]);
    expect(refundExpectations([], "5")[0]).toMatchObject({
      id: "unplanned",
      amount: "5.0000",
      dueDate: null,
      expectedFxRate: null,
    });
  });
  it("uses immutable IDs to break same-date ties without changing source arrays", () => {
    const rows = [credit({ id: "b" }), credit({ id: "a" })];
    expect(refundExpectations(rows, "10")[0]?.id).toBe("a");
    expect(rows[0]?.id).toBe("b");
  });
});
