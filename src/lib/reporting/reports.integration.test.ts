import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  clientBillingDocument: { findMany: vi.fn().mockResolvedValue([]) },
  financialCreditRefund: { findMany: vi.fn().mockResolvedValue([]) },
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

function projectRecord(overrides = {}) {
  return {
    client: { displayName: "Client" },
    code: "P-1",
    id: "project-1",
    name: "Project",
    reportingCurrencyCode: "EUR",
    status: "ACTIVE",
    billingDocuments: [],
    freightExpenses: [],
    ...overrides,
  };
}

function billingDocument(overrides = {}) {
  const document = {
    id: "invoice",
    reference: "INV-1",
    documentType: "INVOICE",
    workflowStatus: "INVOICED",
    isCancelled: false,
    currencyCode: "EUR",
    totalTtc: "1000",
    dueDate: new Date("2099-01-01"),
    fxRateToReporting: null,
    receipts: [],
    paymentInstallments: [],
    matchedInstallment: null,
    credits: [],
    ...overrides,
  };
  return {
    ...document,
    paymentInstallments: [
      {
        id: `term-${document.id}`,
        currencyCode: document.currencyCode,
        scheduledAmount: document.totalTtc,
        label: "Term",
        dueDate: document.dueDate,
        expectedFxRateToReporting: null,
        isCancelled: false,
        receipts: document.receipts,
      },
    ],
    ...overrides,
  };
}

function orderRecord(overrides = {}) {
  return {
    costs: {
      customsDuties: "0",
      economicLandedCost: "100",
      freight: "0",
      inputVat: null,
      landedCost: "100",
      miscellaneous: "0",
      outputVat: null,
      purchaseCost: "100",
      purchaseFxRate: null,
      reportingEconomicLandedCost: "100",
      reportingSellingRevenue: "120",
      sellingFxRate: null,
    },
    supplierPayment: {
      totalPayable: "100",
      paid: "0",
      netPaid: "0",
      refundDue: "0",
    },
    freightResaleAmount: null,
    freightTreatment: "NOT_APPLICABLE",
    id: "order-1",
    orderCurrencyCode: "EUR",
    orderNumber: "SO-1",
    packageName: "Package",
    packageSellingPrice: "120",
    project: { id: "project-1", reportingCurrencyCode: "EUR" },
    sellingCurrencyCode: "EUR",
    status: "CONFIRMED",
    supplier: { displayName: "Supplier" },
    totalSellingRevenue: "120",
    ...overrides,
  };
}

function supplierTerm(overrides = {}) {
  return {
    id: "term",
    orderId: "order-1",
    projectId: "project-1",
    direction: "SUPPLIER_PAYMENT",
    currencyCode: "EUR",
    scheduledAmount: "100",
    paidAmount: "0",
    outstandingAmount: "100",
    dueDate: "2099-01-01",
    expectedFxRate: null,
    isCancelled: false,
    settlements: [],
    status: "UPCOMING",
    label: "Payment",
    ...overrides,
  };
}

function billingSummary(overrides = {}) {
  return {
    complete: true,
    invoicedComplete: true,
    coverageComplete: true,
    coverageHt: "0",
    invoicedHt: "1000",
    outstandingTtc: "1000",
    overdueTtc: "0",
    paidTtc: "0",
    ...overrides,
  };
}

function creditRefund(input: {
  id: string;
  side: "SUPPLIER" | "CLIENT";
  amount: string;
  date: string;
  actualFx: string;
  reportingCurrencyCode?: string;
}) {
  const project = {
    id: "project-1",
    name: "Project",
    reportingCurrencyCode: "EUR",
  };
  return {
    id: input.id,
    amount: input.amount,
    refundDate: new Date(input.date),
    fxRateToReporting: input.actualFx,
    reference: input.id,
    credit: {
      side: input.side,
      reference: `credit-${input.id}`,
      currencyCode: "USD",
      reportingCurrencyCode: input.reportingCurrencyCode ?? "EUR",
      fxRateToReporting: "0.6",
      totalHt: "100",
      vatAmount: "0",
      freightCoverageHt: "0",
      order:
        input.side === "SUPPLIER"
          ? {
              id: "order-1",
              orderNumber: "SO-1",
              project,
              supplier: { displayName: "Supplier" },
            }
          : null,
      billingDocument:
        input.side === "CLIENT"
          ? {
              id: "invoice",
              reference: "INV-1",
              project,
              client: { displayName: "Client" },
            }
          : null,
    },
  };
}

const januaryRange = {
  horizon: "30d" as const,
  start: "2099-01-01",
  end: "2099-01-31",
};

describe("portfolio Client financial integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.project.findMany.mockResolvedValue([projectRecord()]);
    orders.listOrders.mockResolvedValue([]);
    payments.listPaymentInstallments.mockResolvedValue([]);
    database.clientReceipt.findMany.mockResolvedValue([]);
    database.financialCreditRefund.findMany.mockResolvedValue([]);
    database.freightExpensePayment.findMany.mockResolvedValue([]);
    billing.listClientCashInstallments.mockResolvedValue([]);
    billing.getProjectsClientBillingSummaries.mockResolvedValue(
      new Map([["project-1", billingSummary()]]),
    );
  });

  it("keeps missing planned FX separate from complete issued cash forecasts", async () => {
    database.project.findMany.mockResolvedValue([
      projectRecord({
        billingDocuments: [
          billingDocument({ receipts: [{ id: "receipt", amount: "400" }] }),
          billingDocument({
            id: "planned",
            workflowStatus: "TO_BE_INVOICED",
            currencyCode: "USD",
            totalTtc: "600",
          }),
          billingDocument({
            id: "quote",
            documentType: "QUOTE",
            totalTtc: "100",
          }),
        ],
      }),
    ]);
    billing.getProjectsClientBillingSummaries.mockResolvedValue(
      new Map([
        [
          "project-1",
          {
            complete: true,
            invoicedComplete: true,
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
    database.clientReceipt.findMany.mockResolvedValue([
      {
        id: "receipt",
        amount: "120000",
        receivedAt: new Date("2099-01-01"),
        fxRateToReporting: null,
        billingDocument: { currencyCode: "EUR", projectId: "project-1" },
      },
    ]);
    billing.getProjectsClientBillingSummaries.mockResolvedValue(
      new Map([
        [
          "project-1",
          {
            complete: true,
            invoicedComplete: true,
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
    expect(report.cashPosition).toBe("120000.0000");
    expect(report.projects[0]).toMatchObject({
      cashPosition: "120000.0000",
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
        ...projectRecord(),
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
            invoicedComplete: true,
            coverageComplete: true,
            coverageHt: "0",
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
          reportingEconomicLandedCost: "0",
          reportingSellingRevenue: project.sell,
          sellingFxRate: null,
        },
        supplierPayment: { totalPayable: "0", paid: "0" },
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

  it("includes separate freight economic cost and exposes undated and unscheduled obligations", async () => {
    orders.listOrders.mockResolvedValue([orderRecord()]);
    database.project.findMany.mockResolvedValue([
      projectRecord({
        billingDocuments: [billingDocument({ dueDate: null })],
        freightExpenses: [
          {
            id: "freight",
            description: "Delivery",
            costAmountHt: "20",
            vatAmount: "4",
            vatTreatment: "DOMESTIC",
            recoverability: "PARTIALLY_RECOVERABLE",
            recoverableRate: "0.5",
            currencyCode: "EUR",
            fxRateToReporting: null,
            dueDate: null,
            payments: [],
            supplierId: "supplier-1",
          },
        ],
      }),
    ]);
    const report = await getPortfolioReportingSnapshot({}, januaryRange);
    expect(report.pricing).toMatchObject({
      cost: { value: "122.0000" },
      sell: { value: "120.0000" },
      profit: { value: "-2.0000" },
    });
    expect(report.projects[0]?.pricing).toEqual(report.pricing);
    expect(report.cashFlow.outlook).toMatchObject({
      undatedIn: "1000.0000",
      undatedOut: "124.0000",
      outstandingOut: "124.0000",
      undatedCount: 3,
      unscheduledCount: 1,
    });
    expect(report.projects[0]?.supplierOutstanding).toBe("124.0000");
    expect(report.cashFlow.totals).toMatchObject({
      expectedComplete: false,
      missingExpectedCount: 3,
      expectedIn: "0",
      expectedOut: "0",
    });
  });

  it("does not hide known expected cash when actual or commercial FX is missing", async () => {
    billing.getProjectsClientBillingSummaries.mockResolvedValue(
      new Map([
        [
          "project-1",
          billingSummary({ complete: false, invoicedComplete: false }),
        ],
      ]),
    );
    database.project.findMany.mockResolvedValue([
      projectRecord({
        billingDocuments: [
          billingDocument({
            currencyCode: "USD",
            receipts: [{ id: "receipt", amount: "400" }],
            paymentInstallments: [
              {
                id: "client-term",
                label: "Term",
                currencyCode: "USD",
                dueDate: new Date("2099-01-01"),
                expectedFxRateToReporting: "0.8",
                scheduledAmount: "1000",
                isCancelled: false,
                receipts: [{ id: "receipt", amount: "400" }],
              },
            ],
          }),
        ],
      }),
    ]);
    database.clientReceipt.findMany.mockResolvedValue([
      {
        id: "receipt",
        amount: "400",
        receivedAt: new Date("2099-01-01"),
        fxRateToReporting: null,
        billingDocument: { currencyCode: "USD", projectId: "project-1" },
      },
    ]);
    const report = await getPortfolioReportingSnapshot({}, januaryRange);
    expect(report.cashFlow.totals).toMatchObject({
      expectedIn: "480",
      expectedComplete: true,
      actualComplete: false,
    });
    expect(report.projects[0]?.clientOutstanding).toBe("480.0000");
    expect(report.cashPosition).toBeNull();
    database.clientReceipt.findMany.mockResolvedValue([
      {
        id: "receipt",
        amount: "400",
        receivedAt: new Date("2099-01-01"),
        fxRateToReporting: "0.9",
        billingDocument: { currencyCode: "USD", projectId: "project-1" },
      },
    ]);
    const actualKnown = await getPortfolioReportingSnapshot({}, januaryRange);
    expect(actualKnown.cashPosition).toBe("360.0000");
    expect(actualKnown.cashFlow.totals).toMatchObject({
      actualIn: "360",
      actualComplete: true,
      expectedIn: "480",
    });
  });

  it("keeps cancelled Order cash but removes its expectations and pricing", async () => {
    orders.listOrders.mockResolvedValue([orderRecord({ status: "CANCELLED" })]);
    payments.listPaymentInstallments.mockResolvedValue([
      supplierTerm({
        dueDate: "2020-01-01",
        status: "OVERDUE",
        paidAmount: "40",
        outstandingAmount: "60",
        settlements: [
          {
            id: "paid",
            amount: "40",
            settledAt: "2099-01-01",
            actualFxRate: null,
          },
        ],
      }),
    ]);
    const report = await getPortfolioReportingSnapshot({}, januaryRange);
    expect(report.pricing?.cost.value).toBe("0.0000");
    expect(report.payments.supplier.totalRemaining).toBe("0");
    expect(report.cashFlow.outlook?.outstandingOut).toBe("0.0000");
    expect(report.overdueItems).toEqual([]);
    expect(report.cashFlow.totals.actualOut).toBe("40");
    expect(report.cashPosition).toBe("-40.0000");
  });

  it("counts each Supplier and Client refund once at its actual date and FX", async () => {
    database.financialCreditRefund.findMany.mockResolvedValue([
      creditRefund({
        id: "supplier-refund",
        side: "SUPPLIER",
        amount: "100",
        date: "2099-01-10",
        actualFx: "0.8",
      }),
      creditRefund({
        id: "client-refund",
        side: "CLIENT",
        amount: "50",
        date: "2099-02-10",
        actualFx: "0.9",
      }),
      creditRefund({
        id: "earlier-refund",
        side: "SUPPLIER",
        amount: "10",
        date: "2098-12-31",
        actualFx: "0.5",
      }),
    ]);

    const report = await getPortfolioReportingSnapshot(
      {},
      { ...januaryRange, end: "2099-02-28" },
    );

    expect(report.cashFlow.rows).toMatchObject([
      {
        month: "2099-01",
        actualIn: "80",
        actualOut: "0",
        actualNet: "80",
        actualComplete: true,
      },
      {
        month: "2099-02",
        actualIn: "0",
        actualOut: "45",
        actualNet: "-45",
        actualComplete: true,
      },
    ]);
    expect(report.cashFlow.totals).toMatchObject({
      actualIn: "80",
      actualOut: "45",
      actualNet: "35",
      actualComplete: true,
      expectedIn: "0",
      expectedOut: "0",
      missingActualCount: 0,
    });
    expect(report.cashPosition).toBe("40.0000");
    expect(report.projects[0]?.cashPosition).toBe("40.0000");
  });

  it.each(["SUPPLIER", "CLIENT"] as const)(
    "keeps %s refund cash incomplete when its preserved reporting currency differs",
    async (side) => {
      database.financialCreditRefund.findMany.mockResolvedValue([
        creditRefund({
          id: "refund",
          side,
          amount: "100",
          date: "2099-01-10",
          actualFx: "0.8",
          reportingCurrencyCode: "GBP",
        }),
      ]);

      const report = await getPortfolioReportingSnapshot({}, januaryRange);

      expect(report.cashFlow.rows[0]).toMatchObject({
        actualComplete: false,
        missingActualCount: 1,
      });
      expect(report.cashFlow.totals).toMatchObject({
        actualIn: "0",
        actualOut: "0",
        actualComplete: false,
        missingActualCount: 1,
        expectedComplete: true,
      });
      expect(report.cashPosition).toBeNull();
      expect(report.projects[0]?.cashPosition).toBeNull();
    },
  );

  it("limits Supplier scope to its purchasing and freight, without Client cash", async () => {
    database.project.findMany.mockResolvedValue([
      projectRecord({
        billingDocuments: [billingDocument()],
        freightExpenses: ["supplier-1", "supplier-2"].map((supplierId) => ({
          id: supplierId,
          supplierId,
          description: "Delivery",
          costAmountHt: "20",
          vatAmount: null,
          vatTreatment: null,
          recoverability: null,
          recoverableRate: null,
          currencyCode: "EUR",
          fxRateToReporting: null,
          dueDate: new Date("2099-01-01"),
          payments: [],
        })),
      }),
    ]);
    billing.getProjectsClientBillingSummaries.mockResolvedValue(new Map());
    const report = await getPortfolioReportingSnapshot(
      { supplierId: "supplier-1" },
      januaryRange,
    );
    expect(database.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { orders: { some: { supplierId: "supplier-1" } } },
            { freightExpenses: { some: { supplierId: "supplier-1" } } },
          ],
        },
      }),
    );
    expect(database.clientReceipt.findMany).not.toHaveBeenCalled();
    expect(billing.listClientCashInstallments).not.toHaveBeenCalled();
    expect(billing.getProjectsClientBillingSummaries).toHaveBeenCalledWith([]);
    expect(report.supplierScoped).toBe(true);
    expect(report.pricing?.cost.value).toBe("20.0000");
    expect(report.cashFlow.totals).toMatchObject({
      expectedIn: "0",
      expectedOut: "20",
      expectedComplete: true,
    });
    expect(report.fundingCoverage.complete).toBe(false);
  });

  it("keeps non-company-currency Projects separate", async () => {
    database.project.findMany.mockResolvedValue([
      projectRecord({ reportingCurrencyCode: "USD" }),
    ]);
    orders.listOrders.mockResolvedValue([
      orderRecord({
        project: { id: "project-1", reportingCurrencyCode: "USD" },
        orderCurrencyCode: "USD",
        sellingCurrencyCode: "USD",
      }),
    ]);
    const report = await getPortfolioReportingSnapshot({}, januaryRange);
    expect(report.pricing?.cost.value).toBe("0.0000");
    expect(report.projects[0]?.pricing?.cost.value).toBe("100.0000");
    expect(report.excludedCurrencyProjects).toEqual([
      { id: "project-1", name: "Project", reportingCurrencyCode: "USD" },
    ]);
  });
});
