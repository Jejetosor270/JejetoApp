import { describe, expect, it } from "vitest";

import { createOrderInputSchema } from "@/domain/procurement/validation";

const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const supplierId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";

function validOrder() {
  return {
    buildingIds: [],
    financialStates: [
      { state: "BUDGET", supplierPurchase: "70000.00" },
      { state: "COMMITTED", supplierPurchase: "67500.00" },
      { state: "ACTUAL", supplierPurchase: "69200.00" },
    ],
    freightTreatment: "INCLUDED_IN_PACKAGE_PRICE",
    orderCurrencyCode: "EUR",
    orderNumber: "PRJ-001-PO-001",
    packageName: "Example Package",
    pricingMode: "SELLING_PRICE",
    pricingSourceState: "COMMITTED",
    projectId,
    sellingPriceAmount: "100000",
    sellingCurrencyCode: "EUR",
    status: "DRAFT",
    supplierId,
  };
}

describe("procurement order validation", () => {
  it("preserves distinct Budget, Committed, and Actual inputs", () => {
    const order = createOrderInputSchema.parse(validOrder());
    expect(
      order.financialStates.map((state) => state.supplierPurchase),
    ).toEqual(["70000.0000", "67500.0000", "69200.0000"]);
  });

  it("converts a user-entered percentage to a stored fractional rate", () => {
    const order = createOrderInputSchema.parse({
      ...validOrder(),
      pricingMode: "TARGET_MARGIN",
      sellingPriceAmount: undefined,
      targetMarginRate: "30",
    });
    expect(order.targetMarginRate).toBe("0.300000");
  });

  it("rejects target margins of 100 percent or more", () => {
    expect(() =>
      createOrderInputSchema.parse({
        ...validOrder(),
        pricingMode: "TARGET_MARGIN",
        sellingPriceAmount: undefined,
        targetMarginRate: "100",
      }),
    ).toThrow("Target margin");
  });

  it("rejects separate freight revenue unless freight is recharged separately", () => {
    expect(() =>
      createOrderInputSchema.parse({
        ...validOrder(),
        freightResaleAmount: "500",
      }),
    ).toThrow("pricing mode");
  });

  it("rejects malformed and negative money before Prisma", () => {
    expect(() =>
      createOrderInputSchema.parse({
        ...validOrder(),
        financialStates: [
          { state: "BUDGET", supplierPurchase: "-1" },
          { state: "COMMITTED" },
          { state: "ACTUAL" },
        ],
      }),
    ).toThrow("non-negative amount");
  });

  it("preserves state-specific manual FX rates at full precision", () => {
    const order = createOrderInputSchema.parse({
      ...validOrder(),
      financialStates: [
        {
          purchaseFxRate: "0.9000000000",
          sellingFxRate: "1.1000000000",
          state: "BUDGET",
          supplierPurchase: "70000",
        },
        {
          purchaseFxRate: "0.8700000000",
          sellingFxRate: "1.1200000000",
          state: "COMMITTED",
          supplierPurchase: "67500",
        },
        {
          purchaseFxRate: "0.8551234567",
          sellingFxRate: "1.1300000000",
          state: "ACTUAL",
          supplierPurchase: "69200",
        },
      ],
    });
    expect(order.financialStates[2]?.purchaseFxRate).toBe("0.8551234567");
  });

  it("validates independent input and output VAT", () => {
    const order = createOrderInputSchema.parse({
      ...validOrder(),
      financialStates: [
        {
          inputVatCountryCode: "IT",
          inputVatRate: "22",
          inputVatRecoverability: "NON_RECOVERABLE",
          inputVatTaxableBase: "1000",
          inputVatTreatment: "INTRA_EU_ACQUISITION",
          outputVatCountryCode: "GB",
          outputVatRate: "0",
          outputVatTaxableBase: "1500",
          outputVatTreatment: "EXPORT",
          state: "BUDGET",
          supplierPurchase: "1000",
        },
        { state: "COMMITTED" },
        { state: "ACTUAL" },
      ],
    });
    expect(order.financialStates[0]?.inputVatRate).toBe("0.220000");
    expect(order.financialStates[0]?.outputVatRate).toBe("0.000000");
  });

  it("rejects non-positive FX and unsupported VAT countries", () => {
    expect(() =>
      createOrderInputSchema.parse({
        ...validOrder(),
        financialStates: [
          { purchaseFxRate: "0", state: "BUDGET" },
          { state: "COMMITTED" },
          { state: "ACTUAL" },
        ],
      }),
    ).toThrow("greater than zero");
    expect(() =>
      createOrderInputSchema.parse({
        ...validOrder(),
        financialStates: [
          {
            inputVatCountryCode: "XX",
            inputVatRate: "20",
            inputVatRecoverability: "RECOVERABLE",
            inputVatTaxableBase: "100",
            inputVatTreatment: "DOMESTIC",
            state: "BUDGET",
          },
          { state: "COMMITTED" },
          { state: "ACTUAL" },
        ],
      }),
    ).toThrow("supported country");
  });
});
