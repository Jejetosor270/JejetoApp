import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BillingProfitability } from "./billing-profitability";
import { billingProfitability } from "@/domain/finance/billing-profitability";
it("renders short labels, totals, markup and a separate unallocated balance without a refund note", () => {
  const result = billingProfitability({
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
      },
    ],
  });
  const html = renderToStaticMarkup(
    <BillingProfitability result={result} currency="EUR" />,
  );
  for (const label of [
    "Agreed markup",
    "Expected profit",
    "Allocated cost",
    "Allocated profit",
    "Actual markup",
    "Unallocated HT",
  ])
    expect(html).toContain(label);
  for (const value of [
    "30%",
    "3 000.00 EUR",
    "5 000.00 EUR",
    "1 500.00 EUR",
    "6 500.00 EUR",
  ])
    expect(html).toContain(value);
  expect(html).toContain("overflow-x-auto");
  expect(html).toContain('aria-label="Billing allocation and markup"');
  expect(html).not.toContain("Potential Client return");
  expect(html).not.toContain("Project remainder");
});
