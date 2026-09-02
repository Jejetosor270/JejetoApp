import { describe, expect, it } from "vitest";

import {
  createOrderInputSchema,
  inlineOrderInputSchema,
} from "@/domain/procurement/validation";

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
  it("accepts component markup overrides and keeps blank values as inheritance", () => {
    const value = createOrderInputSchema.parse({
      ...base,
      freightMarkupOverrideRate: "15",
      pricingMode: "COMPONENT_MARKUP",
      productMarkupOverrideRate: "30",
      sellingPriceAmount: undefined,
    });
    expect(value.productMarkupOverrideRate).toBe("0.300000");
    expect(value.freightMarkupOverrideRate).toBe("0.150000");
    expect(value.otherCostMarkupOverrideRate).toBeUndefined();
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

  it("validates routine inline Order references, statuses, and date-only values", () => {
    expect(
      inlineOrderInputSchema.parse({
        expectedDeliveryDate: "2026-10-20",
        id: base.projectId,
        orderNumber: "PO-002",
        status: "ORDERED",
      }).status,
    ).toBe("ORDERED");
    expect(() =>
      inlineOrderInputSchema.parse({
        expectedDeliveryDate: "20/10/2026",
        id: base.projectId,
        orderNumber: "PO-002",
        status: "ORDERED",
      }),
    ).toThrow();
  });
});
