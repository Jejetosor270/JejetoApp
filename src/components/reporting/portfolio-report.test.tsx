import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type {
  PortfolioProjectRow,
  PortfolioReportingSnapshot,
  SerializedDirectionPaymentSummary,
} from "@/lib/reporting/reports";
import { summarizeProjectPricing } from "@/domain/finance/project-dashboard";
import { projectCashOutlook } from "@/domain/finance/project-cash-outlook";
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

const pricing = summarizeProjectPricing({
  cost: [
    { label: "Orders and freight", href: "/projects/project", amount: "120" },
  ],
  sell: [{ label: "Order sell", href: "/orders/order", amount: "150" }],
});

function project(
  overrides: Partial<PortfolioProjectRow> = {},
): PortfolioProjectRow {
  return {
    id: "project",
    name: "Project",
    code: "P-1",
    clientName: "Client",
    status: "ACTIVE",
    reportingCurrencyCode: "EUR",
    pricing,
    financialComplete: true,
    salesRevenue: "150",
    economicLandedCost: "100",
    grossProfit: "50",
    markupRate: "0.5",
    grossMarginRate: "0.333333",
    supplierOutstanding: "170",
    clientOutstanding: "999",
    clientBillingComplete: true,
    cashPosition: "-20",
    fundingCoverage: {
      clientBillingCoverageHt: "180",
      supplierOrderSellHt: "150",
      fundingCoverageHt: "30",
      complete: true,
      missingOrderIds: [],
      status: "EXCESS_BILLING_COVERAGE",
    },
    ...overrides,
  };
}

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
  expect(html).toContain("Issued Billing less Order sell");
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
  expect(coverage).toContain("Issued Billing less Order sell HT");
  expect(coverage).not.toContain("Order pricing markup");
});

it("shows shared Project pricing including separate freight for company totals and Project rows", () => {
  const shared = { ...report, pricing, projects: [project()] };
  const company = renderToStaticMarkup(
    <CompanyFinancialSummary report={shared} />,
  );
  const portfolio = renderToStaticMarkup(
    <ProjectPortfolioTable report={shared} />,
  );
  expect(company).toContain("Project pricing");
  for (const html of [company, portfolio]) {
    for (const value of ["150.00 EUR", "120.00 EUR", "30.00 EUR", "25%", "20%"])
      expect(html).toContain(value);
    expect(html).toContain("including separate Project freight");
    expect(html).toContain("not actual Project profit");
    expect(html).not.toContain(">50.00 EUR<");
    expect(html).not.toContain("50%");
  }
  expect(company).toContain("including unallocated Billing");
  expect(portfolio).toContain("whether allocated or not");
});

it("preserves incomplete shared pricing instead of substituting legacy Order-only amounts", () => {
  const incompletePricing = summarizeProjectPricing({
    cost: [
      { label: "Freight missing FX", href: "/projects/project", amount: null },
    ],
    sell: pricing.sell.rows,
  });
  const incompleteReport = {
    ...report,
    pricing: incompletePricing,
    projects: [project({ pricing: incompletePricing })],
  };
  const company = renderToStaticMarkup(
    <CompanyFinancialSummary report={incompleteReport} />,
  );
  const portfolio = renderToStaticMarkup(
    <ProjectPortfolioTable report={incompleteReport} />,
  );
  expect(company).toContain("Incomplete");
  expect(portfolio).toContain("Financial reporting incomplete");
  for (const html of [company, portfolio]) {
    expect(html).not.toContain(">50.00 EUR<");
    expect(html).not.toContain("50%");
    expect(html).toContain("150.00 EUR");
  }
});

it("uses all outstanding cash obligations for To pay and keeps unknown obligations incomplete", () => {
  const outlook = projectCashOutlook([], "EUR", "2026-10-01", "0");
  for (const outstandingOut of ["170", null]) {
    const html = renderToStaticMarkup(
      <CompanyFinancialSummary
        report={{
          ...report,
          pricing,
          cashFlow: {
            ...report.cashFlow,
            outlook: { ...outlook, outstandingOut },
          },
        }}
      />,
    );
    expect(html).toContain("To pay TTC");
    expect(html).not.toContain("100.00 EUR");
    expect(html).toContain(
      outstandingOut === null ? "Incomplete" : "170.00 EUR",
    );
  }
});

it("makes Supplier scope explicit and suppresses unattributable Client balances and coverage", () => {
  const supplierReport = {
    ...report,
    pricing,
    supplierScoped: true,
    projects: [project({ clientBillingComplete: false })],
  };
  const company = renderToStaticMarkup(
    <CompanyFinancialSummary report={supplierReport} />,
  );
  const cash = renderToStaticMarkup(
    <ProjectPortfolioTable report={supplierReport} view="cash" />,
  );
  const funding = renderToStaticMarkup(
    <ProjectPortfolioTable report={supplierReport} view="funding" />,
  );
  for (const html of [company, cash, funding])
    expect(html).toContain(
      "Supplier Orders, freight, payments and refunds only; Client Billing is not attributed to Suppliers.",
    );
  for (const label of [
    "To collect TTC",
    "Overdue to collect TTC",
    "Issued Billing less Order sell",
    "Projects with Billing shortfall",
  ])
    expect(company).not.toContain(label);
  expect(cash).toContain("Supplier net cash");
  expect(cash).toContain("170.00 EUR");
  expect(cash).toContain("-20.00 EUR");
  expect(cash).not.toContain("To collect TTC");
  expect(cash).not.toContain("999.00 EUR");
  expect(cash).not.toContain("Billing FX incomplete");
  expect(funding).toContain("Not applicable");
  expect(funding).not.toContain("Incomplete");
  expect(funding).not.toContain("30.00 EUR");
});

it("uses shared outstanding and overdue cash values independently of commercial Billing FX", () => {
  const outlook = projectCashOutlook([], "EUR", "2026-10-01", "0");
  const scoped = {
    ...report,
    pricing,
    clientBilling: { ...report.clientBilling, complete: false },
    cashFlow: {
      ...report.cashFlow,
      outlook: {
        ...outlook,
        outstandingIn: "432",
        overdueIn: "54",
        overdueOut: "76",
      },
    },
    projects: [project({ clientBillingComplete: false })],
  };
  const company = renderToStaticMarkup(
    <CompanyFinancialSummary report={scoped} />,
  );
  for (const value of [
    "To collect TTC",
    "432.00 EUR",
    "54.00 EUR",
    "76.00 EUR",
  ])
    expect(company).toContain(value);
  expect(company).not.toContain("Incomplete");
  const portfolio = renderToStaticMarkup(
    <ProjectPortfolioTable report={scoped} view="cash" />,
  );
  expect(portfolio).toContain("999.00 EUR");
  expect(portfolio).not.toContain("incomplete");

  const unknown = renderToStaticMarkup(
    <CompanyFinancialSummary
      report={{
        ...scoped,
        cashFlow: {
          ...scoped.cashFlow,
          outlook: {
            ...scoped.cashFlow.outlook,
            outstandingIn: null,
            overdueIn: null,
            overdueOut: null,
          },
        },
      }}
    />,
  );
  expect(unknown).toContain("Incomplete");
  expect(unknown).not.toContain("432.00 EUR");
  expect(unknown).not.toContain("54.00 EUR");
  expect(unknown).not.toContain("76.00 EUR");
});
