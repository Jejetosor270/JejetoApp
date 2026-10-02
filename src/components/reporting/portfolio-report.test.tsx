import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type {
  PortfolioReportingSnapshot,
  SerializedDirectionPaymentSummary,
} from "@/lib/reporting/reports";
import {
  CompanyFinancialSummary,
  ProjectPortfolioTable,
} from "./portfolio-report";

const amount = (value: string) => ({ value, complete: true, missingIds: [] });
function paymentSummary(
  outstanding: string,
): SerializedDirectionPaymentSummary {
  return {
    base: amount(outstanding),
    overdue: amount("0"),
    paid: amount("0"),
    scheduled: amount(outstanding),
    scheduledOutstanding: amount(outstanding),
    totalRemaining: outstanding,
    unscheduled: "0",
  };
}

const report: PortfolioReportingSnapshot = {
  companyCurrencyCode: "EUR",
  activeProjectCount: 1,
  excludedCurrencyProjects: [],
  projects: [],
  overdueItems: [],
  cashPosition: "0",
  cashFlow: {
    start: "2026-10-01",
    end: "2026-10-31",
    rows: [],
    chart: [],
    totals: {
      expectedIn: "150",
      expectedOut: "100",
      expectedNet: "50",
      actualIn: "0",
      actualOut: "0",
      actualNet: "0",
      expectedComplete: true,
      actualComplete: true,
      missingExpectedCount: 0,
      missingActualCount: 0,
    },
  },
  financial: {
    complete: true,
    missingOrderIds: [],
    totals: {
      salesRevenue: amount("150"),
      economicLandedCost: amount("100"),
      customsDuties: amount("0"),
      freight: amount("0"),
      inputVat: amount("0"),
      landedCost: amount("100"),
      miscellaneous: amount("0"),
      nonRecoverableInputVat: amount("0"),
      outputVat: amount("0"),
      packageSellingPrice: amount("150"),
      purchaseCost: amount("100"),
      recoverableInputVat: amount("0"),
      rechargedFreight: amount("0"),
    },
    grossProfit: "50",
    markupRate: "0.5",
    grossMarginRate: "0.333333",
  },
  fundingCoverage: {
    status: "EXCESS_BILLING_COVERAGE",
    fundingCoverageHt: "30",
    complete: true,
    gapProjectCount: 0,
  },
  payments: {
    supplier: paymentSummary("100"),
    client: paymentSummary("150"),
  },
  clientBilling: {
    invoicedHt: "150",
    paidTtc: "0",
    outstandingTtc: "150",
    overdueTtc: "0",
    complete: true,
  },
};

it("identifies Order-only prices, economic costs and ratios without claiming actual Project profit", () => {
  const html = renderToStaticMarkup(
    <CompanyFinancialSummary report={report} />,
  );
  for (const label of [
    "Order pricing plan",
    "Order economic cost",
    "Order pricing profit",
    "Order pricing markup",
    "Order pricing margin",
    "not actual Project profit",
  ])
    expect(html).toContain(label);
  for (const amount of [
    "150.00 EUR",
    "100.00 EUR",
    "50.00 EUR",
    "50%",
    "33.33%",
  ])
    expect(html).toContain(amount);
  expect(html).toContain("Total Billing less Order sell");
});

it("keeps portfolio funding coverage explicitly separate from the Order pricing plan", () => {
  const commercial = renderToStaticMarkup(
    <ProjectPortfolioTable report={report} />,
  );
  expect(commercial).toContain("Order pricing markup");
  expect(commercial).toContain("Order economic cost");
  const coverage = renderToStaticMarkup(
    <ProjectPortfolioTable report={report} view="funding" />,
  );
  expect(coverage).toContain("Billing less Order sell HT");
  expect(coverage).not.toContain("Order pricing markup");
});
