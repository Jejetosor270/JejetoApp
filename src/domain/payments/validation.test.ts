import { describe, expect, it } from "vitest";

import {
  createInstallmentSchema,
  settlementSchema,
} from "@/domain/payments/validation";

const base = {
  currencyCode: "EUR",
  direction: "SUPPLIER_PAYMENT",
  dueDate: "2026-09-15",
  label: "Deposit",
  orderId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
};

describe("payment validation", () => {
  it("accepts percentage and fixed installments without circular inputs", () => {
    expect(
      createInstallmentSchema.parse({
        ...base,
        basis: "PERCENTAGE",
        percentageRate: "30",
      }).percentageRate,
    ).toBe("0.300000");
    expect(
      createInstallmentSchema.parse({
        ...base,
        basis: "FIXED_AMOUNT",
        fixedAmount: "25000",
      }).fixedAmount,
    ).toBe("25000.0000");
    expect(() =>
      createInstallmentSchema.parse({
        ...base,
        basis: "PERCENTAGE",
        fixedAmount: "25000",
        percentageRate: "30",
      }),
    ).toThrow();
  });

  it("rejects invalid percentages, dates, FX, and settlement amounts", () => {
    expect(() =>
      createInstallmentSchema.parse({
        ...base,
        basis: "PERCENTAGE",
        percentageRate: "101",
      }),
    ).toThrow();
    expect(() =>
      createInstallmentSchema.parse({
        ...base,
        basis: "FIXED_AMOUNT",
        dueDate: "2026-02-30",
        fixedAmount: "1",
      }),
    ).toThrow();
    expect(() =>
      settlementSchema.parse({
        amount: "0",
        installmentId: base.orderId,
        settledAt: "2026-09-15",
      }),
    ).toThrow();
  });
});
