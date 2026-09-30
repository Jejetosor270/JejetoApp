import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  projectFreightExpense: { findMany: vi.fn().mockResolvedValue([]) },
  freightExpensePayment: { findMany: vi.fn().mockResolvedValue([]) },
  clientReceipt: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
}));
const billing = vi.hoisted(() => ({
  getProjectsClientBillingSummaries: vi.fn(),
  listClientCashInstallments: vi.fn(),
}));
const orders = vi.hoisted(() => ({ listOrders: vi.fn() }));
const payments = vi.hoisted(() => ({ listPaymentInstallments: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/billing/reporting", () => billing);
vi.mock("@/lib/procurement/orders", () => orders);
vi.mock("@/lib/payments/payments", () => payments);

import { getPortfolioReportingSnapshot } from "./reports";

describe("portfolio Client financial integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.project.findMany.mockResolvedValue([
      {
        client: { displayName: "Client" },
        code: "P-1",
        id: "project-1",
        name: "Project",
        reportingCurrencyCode: "EUR",
        status: "ACTIVE",
      },
    ]);
    orders.listOrders.mockResolvedValue([]);
    payments.listPaymentInstallments.mockResolvedValue([]);
    database.clientReceipt.findMany.mockResolvedValue([]);
    billing.listClientCashInstallments.mockResolvedValue([]);
  });

  it("keeps missing planned FX separate from complete issued cash forecasts", async () => {
    billing.getProjectsClientBillingSummaries.mockResolvedValue(
      new Map([
        [
          "project-1",
          {
            complete: true,
            coverageComplete: true,
            coverageHt: "1000",
            invoicedHt: "1000",
            outstandingTtc: "600",
            overdueTtc: "0",
            paidTtc: "400",
          },
        ],
      ]),
    );
    const base = {
      billingDocumentId: "invoice",
      billingReference: "INV",
      clientName: "Client",
      currencyCode: "EUR",
      dueDate: "2099-01-01",
      expectedFxRate: null,
      id: "term",
      isCancelled: false,
      label: "Term",
      outstandingAmount: "600",
      projectId: "project-1",
      projectName: "Project",
      scheduledAmount: "1000",
      status: "UPCOMING",
    };
    billing.listClientCashInstallments.mockResolvedValue([
      { ...base, cashKind: "issued", documentType: "INVOICE" },
      {
        ...base,
        id: "planned",
        cashKind: "planned",
        documentType: "INVOICE",
        currencyCode: "USD",
      },
      {
        ...base,
        id: "quote",
        cashKind: "planned",
        documentType: "QUOTE",
        outstandingAmount: "100",
      },
    ]);
    const report = await getPortfolioReportingSnapshot(
      { projectStatus: "ACTIVE" },
      { horizon: "30d", start: "2099-01-01", end: "2099-01-31" },
    );
    expect(report.cashFlow.totals).toMatchObject({
      expectedIn: "600",
      expectedComplete: true,
      missingExpectedCount: 0,
    });
    expect(report.cashFlow.planned).toMatchObject({
      amount: "100",
      complete: false,
      missingCount: 1,
    });
  });

  it("uses actual Billing receipts for outstanding and cash position", async () => {
    billing.getProjectsClientBillingSummaries.mockResolvedValue(
      new Map([
        [
          "project-1",
          {
            complete: true,
            coverageComplete: true,
            coverageHt: "100000.0000",
            invoicedHt: "100000.0000",
            outstandingTtc: "0.0000",
            overdueTtc: "0.0000",
            paidTtc: "120000.0000",
            quotedHt: "0.0000",
            reportingCurrencyCode: "EUR",
          },
        ],
      ]),
    );

    const report = await getPortfolioReportingSnapshot(
      { projectStatus: "ACTIVE" },
      { horizon: "30d" },
    );

    expect(report.clientBilling.outstandingTtc).toBe("0");
    expect(report.cashPosition).toBe("120000");
    expect(report.projects[0]).toMatchObject({
      cashPosition: "120000",
      clientOutstanding: "0.0000",
    });
  });

  it("aggregates signed Funding Coverage and counts Project gaps", async () => {
    const projects = [
      { id: "project-a", name: "A", coverage: "130000", sell: "100000" },
      { id: "project-b", name: "B", coverage: "70000", sell: "120000" },
      { id: "project-c", name: "C", coverage: "50000", sell: "50000" },
    ];
    database.project.findMany.mockResolvedValue(
      projects.map((project) => ({
        client: { displayName: "Client" },
        code: project.id,
        id: project.id,
        name: project.name,
        reportingCurrencyCode: "EUR",
        status: "ACTIVE",
      })),
    );
    billing.getProjectsClientBillingSummaries.mockResolvedValue(
      new Map(
        projects.map((project) => [
          project.id,
          {
            complete: true,
            coverageComplete: true,
            coverageHt: project.coverage,
            invoicedHt: project.coverage,
            outstandingTtc: "0",
            overdueTtc: "0",
            paidTtc: "0",
          },
        ]),
      ),
    );
    orders.listOrders.mockResolvedValue(
      projects.map((project) => ({
        costs: {
          customsDuties: "0",
          economicLandedCost: "0",
          freight: "0",
          inputVat: null,
          landedCost: "0",
          miscellaneous: "0",
          outputVat: null,
          purchaseCost: "0",
          purchaseFxRate: null,
          reportingSellingRevenue: project.sell,
          sellingFxRate: null,
        },
        freightResaleAmount: null,
        freightTreatment: "NOT_APPLICABLE",
        id: `order-${project.id}`,
        orderCurrencyCode: "EUR",
        orderNumber: `SO-${project.id}`,
        packageName: "Package",
        packageSellingPrice: project.sell,
        project: {
          id: project.id,
          reportingCurrencyCode: "EUR",
        },
        sellingCurrencyCode: "EUR",
        status: "CONFIRMED",
        supplier: { displayName: "Supplier" },
        totalSellingRevenue: project.sell,
      })),
    );

    const report = await getPortfolioReportingSnapshot(
      { projectStatus: "ACTIVE" },
      { horizon: "30d" },
    );

    expect(report.fundingCoverage).toEqual({
      complete: true,
      fundingCoverageHt: "-20000",
      gapProjectCount: 1,
      status: "FUNDING_GAP",
    });
    expect(
      report.projects.map((project) => project.fundingCoverage.status),
    ).toEqual(["EXCESS_BILLING_COVERAGE", "FUNDING_GAP", "FULLY_COVERED"]);
  });
});
