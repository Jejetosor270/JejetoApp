import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({
  getPortfolioReportingSnapshot: vi.fn(),
  getActualCashReport: vi.fn(),
  getGlobalVatReport: vi.fn(),
  getGlobalFreightReport: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./reports", () => ({
  getPortfolioReportingSnapshot: services.getPortfolioReportingSnapshot,
}));
vi.mock("./global-reports", () => services);
import { reportingCsv } from "./export";
import { dashboardFixture } from "@/components/reporting/reports-dashboard.fixture";
import { calculateProjectVatPosition } from "@/domain/vat/position";
const supplierId = "22222222-2222-4222-8222-222222222222";
describe("report CSV source integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    services.getPortfolioReportingSnapshot.mockResolvedValue({
      ...dashboardFixture,
      projects: dashboardFixture.projects.map((p) => ({ ...p, code: p.id })),
    });
  });
  afterEach(() => vi.useRealTimers());
  it.each(["summary", "trend", "forecast", "obligations", "projects"])(
    "exports %s using the shared authoritative snapshot and scope",
    async (dataset) => {
      const csv = await reportingCsv({
        dataset,
        supplierId,
        trendMonths: "3",
        horizon: "30d",
        cashDelay: "15",
      });
      expect(services.getPortfolioReportingSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ supplierId }),
        { start: "2026-08-01", end: "2026-10-07", horizon: "30d" },
      );
      expect(csv).toContain(`"${dataset}"`);
      expect(csv).toContain(supplierId);
      expect(csv).toContain("EUR");
      if (dataset === "summary") expect(csv).toContain('"75000"');
      if (dataset === "projects") expect(csv).toContain("NOT_APPLICABLE");
      if (dataset === "forecast") {
        expect(csv).toContain("PLANNED_ONLY");
        expect(csv).toContain("INCOMPLETE");
      }
      if (dataset === "obligations") {
        expect(csv).toContain("/billing/demo?tab=related");
        expect(csv).toContain("Undated or unscheduled");
      }
    },
  );
  it("preserves original and converted cash, source links, direction and open-ended transaction dates", async () => {
    services.getActualCashReport.mockResolvedValue({
      companyCurrencyCode: "EUR",
      complete: false,
      excludedProjectCount: 0,
      incompleteIds: ["refund"],
      totals: { cashIn: "0", cashOut: "0", net: "0" },
      rows: [
        {
          id: "refund",
          href: "/orders/example?tab=related#credits",
          date: "2026-09-01",
          amount: "100.1234",
          currencyCode: "USD",
          projectReportingAmount: null,
          projectReportingCurrencyCode: "EUR",
          reference: "=danger",
          billingOrOrderReference: "Supplier refund",
          projectName: "Demo",
          partyName: "Supplier",
          direction: "CLIENT_RECEIPT",
        },
      ],
    });
    const csv = await reportingCsv({
      dataset: "transactions",
      supplierId,
      direction: "CLIENT_RECEIPT",
      dateFrom: "2026-09-01",
    });
    expect(services.getActualCashReport).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId,
        direction: "CLIENT_RECEIPT",
        dateFrom: "2026-09-01",
        dateTo: undefined,
      }),
    );
    expect(csv).toContain('"100.1234","USD","COMPLETE"');
    expect(csv).toContain('"","EUR","INCOMPLETE"');
    expect(csv).toContain('"\'=danger"');
    expect(csv).toContain("/orders/example?tab=related#credits");
    await reportingCsv({ dataset: "transactions" });
    expect(services.getActualCashReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: undefined, dateTo: undefined }),
    );
  });
  it("exports signed VAT credit and prevents incomplete company totals appearing complete", async () => {
    services.getGlobalVatReport.mockResolvedValue({
      companyCurrencyCode: "EUR",
      complete: false,
      excludedProjectCount: 1,
      position: calculateProjectVatPosition({
        outputVat: "10",
        deductibleInputVat: "30",
      }),
      rows: [
        {
          id: "demo",
          name: "Demo",
          reportingCurrencyCode: "USD",
          position: calculateProjectVatPosition({
            outputVat: "10",
            deductibleInputVat: "30",
          }),
        },
      ],
    });
    const csv = await reportingCsv({ dataset: "vat", supplierId });
    expect(services.getGlobalVatReport).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId }),
    );
    expect(csv).toContain('"Net VAT","-20","USD","COMPLETE"');
    expect(csv).toContain('"Net VAT","","EUR","INCOMPLETE"');
    expect(csv).toContain("Full Project VAT for Projects using Supplier");
  });
  it("keeps freight planning, economic cost and recovery distinct, without inventing unknown allowance", async () => {
    services.getGlobalFreightReport.mockResolvedValue({
      companyCurrencyCode: "EUR",
      complete: false,
      excludedProjectCount: 0,
      totals: {},
      rows: [
        {
          id: "demo",
          name: "Demo",
          reportingCurrencyCode: "EUR",
          reconciliation: {
            expectedProductPurchaseCostHt: null,
            expectedFreightAllowanceHt: null,
            actualCostHt: "3730",
            recoveryTargetHt: "4807",
            freightGrossProfitHt: "1077",
            headroomHt: null,
            freightEstimateRate: "0.10",
          },
        },
      ],
    });
    const csv = await reportingCsv({ dataset: "freight" });
    expect(csv).toContain('"Economic freight cost","3730","EUR","COMPLETE"');
    expect(csv).toContain('"Freight allowance HT","","EUR","INCOMPLETE"');
    expect(csv).toContain('"Freight estimate rate","0.1","fraction"');
  });
  it("exports foreign-currency exclusions explicitly and does not convert them", async () => {
    services.getPortfolioReportingSnapshot.mockResolvedValue({
      ...dashboardFixture,
      excludedCurrencyProjects: [
        { id: "foreign", name: "Foreign", reportingCurrencyCode: "USD" },
      ],
    });
    const csv = await reportingCsv({ dataset: "summary" });
    expect(csv).toContain('"USD","EXCLUDED_CURRENCY"');
    expect(csv).toContain("/projects/foreign");
  });
});
