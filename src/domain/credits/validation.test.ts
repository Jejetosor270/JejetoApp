import { describe, expect, it } from "vitest";
import { createCreditSchema, creditRefundSchema } from "./validation";

const credit = {
  side: "CLIENT",
  sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  expectedVersion: "a".repeat(64),
  reference: "CN-001",
  creditDate: "2026-10-01",
  totalHt: "100,25",
  vatAmount: "20,05",
  freightCoverageHt: "10",
  otherCoverageHt: "0",
  reason: "Returned goods",
};

describe("reviewed credit inputs", () => {
  it("normalizes Decimal input but does not accept authority supplied by the browser", () => {
    expect(createCreditSchema.parse(credit).totalHt).toBe("100.2500");
    expect(
      createCreditSchema.safeParse({ ...credit, createdById: credit.sourceId })
        .success,
    ).toBe(false);
    expect(
      createCreditSchema.safeParse({ ...credit, currencyCode: "EUR" }).success,
    ).toBe(false);
    expect(
      createCreditSchema.safeParse({ ...credit, recoverableRate: "1" }).success,
    ).toBe(false);
  });
  it("requires a dated justified credit in range and the original edit version", () => {
    for (const patch of [
      { totalHt: "-1" },
      { totalHt: "1000000000000000" },
      { totalHt: "0.00001" },
      { creditDate: "2026-02-30" },
      { reason: " " },
      { expectedVersion: "" },
      { totalHt: "0", vatAmount: "0", freightCoverageHt: "0" },
      { freightCoverageHt: "101" },
    ])
      expect(
        createCreditSchema.safeParse({ ...credit, ...patch }).success,
      ).toBe(false);
  });
  it("limits Supplier credits to product HT and invoice VAT", () => {
    expect(
      createCreditSchema.safeParse({ ...credit, side: "SUPPLIER" }).success,
    ).toBe(false);
    expect(
      createCreditSchema.safeParse({
        ...credit,
        side: "SUPPLIER",
        freightCoverageHt: "0",
      }).success,
    ).toBe(true);
  });
  it("refunds require positive cash and manual positive FX when entered", () => {
    const refund = {
      side: "CLIENT",
      creditId: credit.sourceId,
      expectedVersion: credit.expectedVersion,
      amount: "120,3",
      refundDate: "2026-10-02",
      fxRate: "1,1234567890",
    };
    expect(creditRefundSchema.parse(refund)).toMatchObject({
      amount: "120.3000",
      fxRate: "1.1234567890",
    });
    expect(
      creditRefundSchema.safeParse({ ...refund, amount: "0" }).success,
    ).toBe(false);
    expect(
      creditRefundSchema.safeParse({ ...refund, fxRate: "0" }).success,
    ).toBe(false);
    expect(
      creditRefundSchema.safeParse({ ...refund, refundDate: "" }).success,
    ).toBe(false);
  });
});
