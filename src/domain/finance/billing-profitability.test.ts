import { describe, expect, it } from "vitest";
import {
  billingProfitability,
  type BillingProfitInput,
} from "./billing-profitability";
const base: BillingProfitInput = {
  totalHt: "13000",
  freightHt: "0",
  otherHt: "0",
  currency: "EUR",
  reportingCurrency: "EUR",
  fx: null,
  rates: ["0.3", "0.15", "0"],
  cancelled: false,
  allocations: [{ orderId: "one", allocatedAmount: "6500" }],
  orders: [
    {
      id: "one",
      plannedSell: "13000",
      economicCost: "10000",
      reportingCurrencyCode: "EUR",
      invoicedAllocated: "6500",
    },
  ],
};
const total = (input: BillingProfitInput) =>
  billingProfitability(input).columns.at(-1);
describe("Billing-specific profitability", () => {
  it("separates expected markup embedded in Billing from allocated profit and unallocated HT", () => {
    expect(total(base)).toMatchObject({
      total: "13000.0000",
      agreedMarkup: "0.300000",
      expectedProfit: "3000.0000",
      allocated: "6500.0000",
      allocatedCost: "5000.0000",
      allocatedProfit: "1500.0000",
      actualMarkup: "0.300000",
      remaining: "6500.0000",
    });
  });
  it("two half invoices attribute one full Order cost, not twice the cost", () => {
    const invoice = { ...base, totalHt: "6500" };
    expect(total(invoice)?.allocatedCost).toBe("5000.0000");
    expect(total(invoice)?.remaining).toBe("0.0000");
    expect(billingProfitability(invoice).orderRates.one).toBe("0.300000");
  });
  it("uses category rates and aggregated amounts rather than averaging percentages", () => {
    const result = total({
      ...base,
      totalHt: "2650",
      freightHt: "1150",
      otherHt: "200",
      allocations: [],
    });
    expect(result).toMatchObject({
      expectedProfit: "450.0000",
      agreedMarkup: "0.204545",
      allocatedCost: "0.0000",
      allocatedProfit: "0.0000",
      actualMarkup: null,
    });
    const categories = billingProfitability({
      ...base,
      totalHt: "2650",
      freightHt: "1150",
      otherHt: "200",
      allocations: [],
    }).columns;
    expect(categories.map((c) => c.expectedProfit)).toEqual([
      "300.0000",
      "150.0000",
      "0.0000",
      "450.0000",
    ]);
  });
  it("attributes full economic cost including freight, other and non-recoverable VAT", () => {
    const result = billingProfitability({
      ...base,
      totalHt: "6500",
      freightHt: "650",
      otherHt: "650",
      allocations: [
        {
          orderId: "one",
          allocatedAmount: "6500",
          freightCoverageHt: "650",
          otherCoverageHt: "650",
        },
      ],
      orders: [{ ...base.orders[0]!, economicCost: "10400" }],
    });
    expect(result.columns.map((c) => c.allocatedCost)).toEqual([
      "4160.0000",
      "520.0000",
      "520.0000",
      "5200.0000",
    ]);
    expect(result.columns.at(-1)).toMatchObject({
      allocatedProfit: "1300.0000",
      actualMarkup: "0.250000",
    });
  });
  it("uses the supplier-credit-adjusted cost without changing the agreed selling price", () => {
    expect(
      total({
        ...base,
        orders: [{ ...base.orders[0]!, economicCost: "9000" }],
      }),
    ).toMatchObject({
      allocatedCost: "4500.0000",
      allocatedProfit: "2000.0000",
      actualMarkup: "0.444444",
    });
  });
  it("reduces Invoice and explicitly selected allocations for active Client credits", () => {
    expect(
      total({
        ...base,
        credits: [
          {
            totalHt: "1300",
            vatAmount: "260",
            freightCoverageHt: "0",
            otherCoverageHt: "0",
            allocations: [
              {
                orderId: "one",
                amountHt: "1300",
                freightCoverageHt: "0",
                otherCoverageHt: "0",
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      total: "11700.0000",
      expectedProfit: "2700.0000",
      allocated: "5200.0000",
      allocatedCost: "4000.0000",
      allocatedProfit: "1200.0000",
      remaining: "6500.0000",
    });
  });
  it("keeps missing FX, absent/cancelled Orders and overcovered Orders incomplete", () => {
    for (const input of [
      { ...base, orders: [] },
      { ...base, currency: "USD" },
      { ...base, orders: [{ ...base.orders[0]!, cancelled: true }] },
      { ...base, orders: [{ ...base.orders[0]!, plannedSell: null }] },
      { ...base, orders: [{ ...base.orders[0]!, invoicedAllocated: "14000" }] },
    ])
      expect(total(input)).toMatchObject({
        allocatedCost: null,
        allocatedProfit: null,
        actualMarkup: null,
      });
  });
  it("keeps native Billing currency amounts with valid manual FX", () => {
    expect(total({ ...base, currency: "USD", fx: "0.8" })).toMatchObject({
      allocatedCost: "5000.0000",
      allocatedProfit: "1500.0000",
    });
  });
  it("keeps zero-cost markup undefined, negative profitability visible, and missing rates incomplete", () => {
    expect(
      total({ ...base, orders: [{ ...base.orders[0]!, economicCost: "0" }] }),
    ).toMatchObject({
      allocatedCost: "0.0000",
      actualMarkup: null,
      allocatedProfit: "6500.0000",
    });
    expect(
      total({
        ...base,
        orders: [{ ...base.orders[0]!, economicCost: "26000" }],
      }),
    ).toMatchObject({
      allocatedProfit: "-6500.0000",
      actualMarkup: "-0.500000",
    });
    expect(
      total({ ...base, rates: [null, null, null] })?.expectedProfit,
    ).toBeNull();
  });
});
