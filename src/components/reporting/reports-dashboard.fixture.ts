/** Fictional data for component regression tests and isolated visual review only. */
import { summarizeProjectPricing } from "@/domain/finance/project-dashboard";
import { projectCashOutlook } from "@/domain/finance/project-cash-outlook";
import { difference } from "@/domain/finance/project-control";
import type { DashboardReport, DashboardLinks } from "./reports-dashboard";

const pricing = (id: string, cost: string, sell: string) =>
  summarizeProjectPricing({
    cost: [{ label: "Recorded cost", amount: cost, href: `/projects/${id}` }],
    sell: [{ label: "Order sell", amount: sell, href: `/projects/${id}` }],
  });

export const dashboardFixture: DashboardReport = {
  companyCurrencyCode: "EUR",
  excludedCurrencyProjects: [],
  pricing: pricing("all", "120000", "144000"),
  projects: [
    {
      id: "harbour",
      name: "Harbour House",
      reportingCurrencyCode: "EUR",
      pricing: pricing("harbour", "85000", "100000"),
      fundingCoverage: {
        complete: true,
        clientBillingCoverageHt: "80000",
        supplierOrderSellHt: "100000",
        fundingCoverageHt: "-20000",
        status: "FUNDING_GAP",
        missingOrderIds: [],
      },
    },
    {
      id: "garden",
      name: "Garden Studio",
      reportingCurrencyCode: "EUR",
      pricing: pricing("garden", "35000", "44000"),
      fundingCoverage: {
        complete: true,
        clientBillingCoverageHt: "60000",
        supplierOrderSellHt: "44000",
        fundingCoverageHt: "16000",
        status: "EXCESS_BILLING_COVERAGE",
        missingOrderIds: [],
      },
    },
  ],
  cashFlow: {
    start: "2026-05-01",
    end: "2026-10-07",
    chart: [],
    rows: [
      ["2026-05", "10000", "8000"],
      ["2026-06", "12000", "10000"],
      ["2026-07", "15000", "9000"],
      ["2026-08", "18000", "16000"],
      ["2026-09", "11000", "13000"],
      ["2026-10", "9000", "5000"],
    ].map(([month = "", incoming = "0", outgoing = "0"]) => ({
      month,
      actualIn: incoming,
      actualOut: outgoing,
      actualNet: difference(incoming, outgoing) ?? "0",
      actualComplete: true,
      expectedIn: "0",
      expectedOut: "0",
      expectedNet: "0",
      expectedComplete: true,
      missingActualCount: 0,
      missingExpectedCount: 0,
    })),
    totals: {
      actualIn: "75000",
      actualOut: "61000",
      actualNet: "14000",
      actualComplete: true,
      expectedIn: "0",
      expectedOut: "0",
      expectedNet: "0",
      expectedComplete: true,
      missingActualCount: 0,
      missingExpectedCount: 0,
    },
    outlook: projectCashOutlook(
      [
        {
          kind: "issued",
          currency: "EUR",
          total: "50000",
          paid: "0",
          fx: null,
          terms: [
            {
              amount: "30000",
              paid: "0",
              due: "2026-10-20",
              fx: null,
              cancelled: false,
            },
            {
              amount: "20000",
              paid: "0",
              due: "2026-11-20",
              fx: null,
              cancelled: false,
            },
          ],
        },
        {
          kind: "payment",
          currency: "EUR",
          total: "48000",
          paid: "0",
          fx: null,
          terms: [
            {
              amount: "20000",
              paid: "0",
              due: "2026-10-28",
              fx: null,
              cancelled: false,
            },
            {
              amount: "28000",
              paid: "0",
              due: "2026-12-10",
              fx: null,
              cancelled: false,
            },
          ],
        },
        {
          kind: "planned",
          currency: "EUR",
          total: "15000",
          paid: "0",
          fx: null,
          terms: [
            {
              amount: "15000",
              paid: "0",
              due: "2026-11-10",
              fx: null,
              cancelled: false,
            },
          ],
        },
        {
          kind: "issued",
          currency: "EUR",
          total: "3000",
          paid: "0",
          fx: null,
          terms: [],
          source: { label: "INV-DEMO-04", href: "/billing/demo?tab=related" },
        },
      ],
      "EUR",
      "2026-10-07",
      "14000",
    ),
  },
};

export const dashboardFixtureLinks: DashboardLinks = {
  transactions: "/reports?view=payments&projectId=example",
  forecast: "/reports?view=cash-flow&projectId=example",
  projects: "/reports?view=projects&projectId=example",
  coverage: "/reports?view=projects&portfolioView=funding&projectId=example",
  vat: "/reports?view=vat&projectId=example",
  freight: "/reports?view=freight&projectId=example",
};
