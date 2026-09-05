import { expect, it } from "vitest";
import type { OrderSummary } from "@/lib/procurement/orders";
import type { PaymentInstallmentView } from "@/lib/payments/payments";
import { summarizePackage } from "./reporting";

const order = {
  id: "order",
  status: "DRAFT",
  orderCurrencyCode: "USD",
  costs: {
    purchaseCost: "10000",
    purchaseFxRate: "2",
    reportingEconomicLandedCost: "22000",
    reportingSellingRevenue: "30000",
  },
  billing: { invoicedAllocated: "5000" },
} as unknown as OrderSummary;
const payment = {
  orderId: "order",
  direction: "SUPPLIER_PAYMENT",
  currencyCode: "USD",
  expectedFxRate: "2",
  isCancelled: false,
  outstandingAmount: "6000",
  scheduledAmount: "10000",
  settlements: [{ amount: "4000", fxRate: "1.8" }],
} as unknown as PaymentInstallmentView;

it("aggregates authoritative Order values and keeps actual settlement FX separate from scheduled FX", () => {
  expect(summarizePackage([order], [payment], "EUR")).toEqual({
    count: 1,
    purchase: "20000.0000",
    economic: "22000.0000",
    sell: "30000.0000",
    allocated: "5000.0000",
    paid: "7200.0000",
    outstanding: "12000.0000",
  });
});
it("excludes cancelled commercial values without hiding actual cash or adding legacy Client schedules", () => {
  const summary = summarizePackage(
    [{ ...order, status: "CANCELLED" }],
    [payment, { ...payment, direction: "CLIENT_RECEIPT" }],
    "EUR",
  );
  expect(summary.sell).toBe("0.0000");
  expect(summary.paid).toBe("7200.0000");
});
it("keeps missing FX explicitly incomplete", () => {
  const summary = summarizePackage(
    [
      {
        ...order,
        costs: {
          ...order.costs,
          purchaseFxRate: null,
          reportingEconomicLandedCost: null,
          reportingSellingRevenue: null,
        },
      },
    ],
    [
      {
        ...payment,
        settlements: [{ ...payment.settlements[0]!, fxRate: null }],
      },
    ],
    "EUR",
  );
  expect(summary.purchase).toBeNull();
  expect(summary.economic).toBeNull();
  expect(summary.sell).toBeNull();
  expect(summary.paid).toBeNull();
});
