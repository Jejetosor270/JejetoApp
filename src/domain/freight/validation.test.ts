import { describe, expect, it } from "vitest";

import { projectFreightExpenseSchema } from "@/domain/freight/validation";

const base = {
  costAmountHt: "10000",
  currencyCode: "EUR",
  description: "Freight service",
  expenseDate: "2026-09-03",
  projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
};

describe("Project freight expense VAT validation", () => {
  it("accepts explicit partial recoverability", () => {
    const value = projectFreightExpenseSchema.parse({
      ...base,
      vatRate: "20",
      vatRecoverableRate: "50",
      vatTreatment: "DOMESTIC",
    });
    expect(value.vatRate).toBe("0.200000");
    expect(value.vatRecoverableRate).toBe("0.500000");
  });

  it("accepts zero and full recoverability boundaries", () => {
    expect(
      projectFreightExpenseSchema.parse({
        ...base,
        vatAmount: "2000",
        vatRecoverableRate: "0",
        vatTreatment: "IMPORT",
      }).vatRecoverableRate,
    ).toBe("0.000000");
    expect(
      projectFreightExpenseSchema.parse({
        ...base,
        vatAmount: "2000",
        vatRecoverableRate: "100",
        vatTreatment: "IMPORT",
      }).vatRecoverableRate,
    ).toBe("1.000000");
  });

  it("leaves VAT absent unless the employee enters it", () => {
    const value = projectFreightExpenseSchema.parse(base);
    expect(value.vatTreatment).toBeUndefined();
    expect(value.vatAmount).toBeUndefined();
  });

  it("rejects VAT values without treatment and missing recoverability", () => {
    expect(() =>
      projectFreightExpenseSchema.parse({ ...base, vatRate: "20" }),
    ).toThrow("Choose a VAT treatment");
    expect(() =>
      projectFreightExpenseSchema.parse({
        ...base,
        vatRate: "20",
        vatTreatment: "DOMESTIC",
      }),
    ).toThrow("Enter the recoverable percentage");
  });
});
