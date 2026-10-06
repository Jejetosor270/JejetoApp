import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: vi.fn() }));

import { projectPricingRows, summarizeProjectPricing } from "./project-pricing";

type PricingInput = Parameters<typeof projectPricingRows>[0];
const order: PricingInput["orders"][number] = {
  id: "order",
  orderNumber: "ORDER-1",
  status: "ORDERED",
  costs: {
    reportingEconomicLandedCost: "90",
    reportingSellingRevenue: "150",
  },
};
const freight: PricingInput["freightExpenses"][number] = {
  id: "freight",
  description: "Separate freight",
  currencyCode: "EUR",
  costAmountHt: "20",
  vatAmount: "4",
  recoverability: "PARTIALLY_RECOVERABLE",
  recoverableRate: "0.5",
  fxRateToReporting: null,
};
const input = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  projectId: "project",
  reportingCurrencyCode: "EUR",
  orders: [order],
  freightExpenses: [freight],
  ...overrides,
});

describe("shared Project pricing sources", () => {
  it("uses net Order economic cost and adds separate freight including non-deductible VAT once", () => {
    const creditedOrder = { ...order, credits: { reportingEconomic: "10" } };
    const source = input({
      orders: [
        creditedOrder,
        { ...order, id: "cancelled", status: "CANCELLED" },
      ],
    });
    const original = structuredClone(source);
    const pricing = summarizeProjectPricing(projectPricingRows(source));

    expect(pricing.cost.value).toBe("112.0000");
    expect(pricing.sell.value).toBe("150.0000");
    expect(pricing.profit.value).toBe("38.0000");
    expect(pricing.markupRate).toBe("0.339286");
    expect(pricing.marginRate).toBe("0.253333");
    expect(pricing.cost.rows).toEqual([
      expect.objectContaining({ href: "/orders/order", amount: "90.0000" }),
      expect.objectContaining({
        href: "/projects/project?section=freight#freight-freight",
        amount: "22.0000",
      }),
    ]);
    expect(pricing.sell.rows).toHaveLength(1);
    expect(source).toEqual(original);
  });

  it("uses manual freight FX and leaves missing non-zero FX incomplete", () => {
    const converted = summarizeProjectPricing(
      projectPricingRows(
        input({
          freightExpenses: [
            { ...freight, currencyCode: "USD", fxRateToReporting: "0.9" },
          ],
        }),
      ),
    );
    expect(converted.cost.value).toBe("109.8000");

    const missing = summarizeProjectPricing(
      projectPricingRows(
        input({ freightExpenses: [{ ...freight, currencyCode: "USD" }] }),
      ),
    );
    expect(missing.cost.value).toBeNull();
    expect(missing.profit.value).toBeNull();
    expect(missing.markupRate).toBeNull();
    expect(missing.marginRate).toBeNull();
    expect(missing.sell.value).toBe("150.0000");
    expect(missing.cost.rows[1]).toMatchObject({
      label: "Separate freight",
      amount: null,
    });
  });

  it("keeps Order purchase and selling conversion completeness independent", () => {
    for (const costs of [
      { ...order.costs, reportingEconomicLandedCost: null },
      { ...order.costs, reportingSellingRevenue: null },
    ]) {
      const pricing = summarizeProjectPricing(
        projectPricingRows(input({ orders: [{ ...order, costs }] })),
      );
      expect(pricing.profit.value).toBeNull();
      expect(pricing.markupRate).toBeNull();
      expect(pricing.marginRate).toBeNull();
    }
  });

  it("adds freight-only costs without inventing a selling price and accepts foreign zero cost", () => {
    const freightOnly = summarizeProjectPricing(
      projectPricingRows(input({ orders: [] })),
    );
    expect(freightOnly.cost.value).toBe("22.0000");
    expect(freightOnly.sell.value).toBe("0.0000");
    expect(freightOnly.profit.value).toBe("-22.0000");
    expect(freightOnly.markupRate).toBe("-1.000000");
    expect(freightOnly.marginRate).toBeNull();

    const zero = summarizeProjectPricing(
      projectPricingRows(
        input({
          orders: [],
          freightExpenses: [
            {
              ...freight,
              currencyCode: "USD",
              costAmountHt: "0",
              vatAmount: null,
            },
          ],
        }),
      ),
    );
    expect(zero.cost.value).toBe("0.0000");
    expect(zero.profit.value).toBe("0.0000");
    expect(zero.markupRate).toBeNull();
    expect(zero.marginRate).toBeNull();
  });
});
