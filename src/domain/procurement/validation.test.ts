import { describe, expect, it } from "vitest";

import { createOrderInputSchema } from "@/domain/procurement/validation";

const base = {
  buildingIds: [],
  freightTreatment: "NOT_APPLICABLE",
  orderCurrencyCode: "USD",
  orderNumber: "PO-001",
  packageName: "Example package",
  pricingMode: "SELLING_PRICE",
  projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
  purchaseCost: "70000",
  sellingCurrencyCode: "EUR",
  sellingPriceAmount: "100000",
  status: "DRAFT",
  supplierId: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
};
describe("single procurement order cost validation", () => {
  it("accepts one current cost structure with manual FX", () => {
    const value = createOrderInputSchema.parse({
      ...base,
      purchaseFxRate: "0.8575",
      sellingFxRate: "1",
    });
    expect(value.purchaseCost).toBe("70000.0000");
    expect(value.purchaseFxRate).toBe("0.8575000000");
  });
  it("validates independent VAT and non-recoverability", () => {
    const value = createOrderInputSchema.parse({
      ...base,
      inputVatTreatment: "IMPORT",
      inputVatRecoverability: "NON_RECOVERABLE",
      inputVatTaxableBase: "70000",
      inputVatRate: "8",
      outputVatTreatment: "DOMESTIC",
      outputVatTaxableBase: "100000",
      outputVatRate: "20",
    });
    expect(value.inputVatRate).toBe("0.080000");
    expect(value.outputVatRate).toBe("0.200000");
  });
  it("rejects negative cost and invalid foreign FX", () => {
    expect(() =>
      createOrderInputSchema.parse({ ...base, purchaseCost: "-1" }),
    ).toThrow();
    expect(() =>
      createOrderInputSchema.parse({ ...base, purchaseFxRate: "0" }),
    ).toThrow();
  });

  it("does not silently discard VAT values without a treatment", () => {
    expect(() =>
      createOrderInputSchema.parse({
        ...base,
        inputVatTaxableBase: "70000",
        inputVatRate: "20",
      }),
    ).toThrow("Choose a VAT treatment");
  });

  it("rejects irrelevant input VAT recoverability combinations", () => {
    expect(() =>
      createOrderInputSchema.parse({
        ...base,
        inputVatRecoverability: "RECOVERABLE",
        inputVatTreatment: "OUT_OF_SCOPE",
        inputVatTaxableBase: "70000",
        inputVatRate: "0",
      }),
    ).toThrow("Recoverability does not apply");
  });
});
