import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  clientReceipt: { findMany: vi.fn() },
  paymentSettlement: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import {
  aggregateFreightRows,
  aggregateVatRows,
  getActualCashReport,
} from "./global-reports";

describe("Phase 11.12 global reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.project.findMany.mockResolvedValue([{ id: "project-1" }]);
    database.paymentSettlement.findMany.mockResolvedValue([]);
  });

  it("reports the same Billing-level receipt as actual Cash In", async () => {
    database.clientReceipt.findMany.mockResolvedValue([
      {
        amount: { toString: () => "100000" },
        billingDocument: {
          client: { displayName: "Client" },
          currencyCode: "EUR",
          id: "billing-1",
          project: {
            id: "project-1",
            name: "Project",
            reportingCurrencyCode: "EUR",
          },
          reference: "INV-1",
        },
        fxRateToReporting: null,
        id: "receipt-1",
        receivedAt: new Date("2026-09-03T00:00:00.000Z"),
        reference: "BANK-1",
      },
    ]);
    const report = await getActualCashReport({});
    expect(report.totals).toEqual({
      cashIn: "100000",
      cashOut: "0",
      net: "100000",
    });
    expect(report.rows[0]).toMatchObject({
      billingOrOrderId: "billing-1",
      direction: "CLIENT_RECEIPT",
      projectReportingAmount: "100000",
    });
  });

  it("aggregates VAT amounts before deriving the global position", () => {
    const report = aggregateVatRows([
      {
        id: "one",
        name: "One",
        position: {
          complete: true,
          deductibleInputVat: "30",
          netVat: "70",
          outputVat: "100",
          positionAmount: "70",
          status: "PAYABLE",
        },
        reportingCurrencyCode: "EUR",
      },
      {
        id: "two",
        name: "Two",
        position: {
          complete: true,
          deductibleInputVat: "80",
          netVat: "-30",
          outputVat: "50",
          positionAmount: "30",
          status: "CREDIT",
        },
        reportingCurrencyCode: "EUR",
      },
    ]);
    expect(report.position).toMatchObject({
      deductibleInputVat: "110.0000",
      netVat: "40.0000",
      outputVat: "150.0000",
      status: "PAYABLE",
    });
  });

  it("aggregates freight money rather than averaging rates", () => {
    const report = aggregateFreightRows([
      {
        id: "one",
        name: "One",
        reconciliation: {
          actualCostHt: "100",
          complete: true,
          expectedFreightAllowanceHt: "150",
          expectedProductPurchaseCostHt: "1000",
          freightEstimateRate: "0.15",
          freightGrossProfitHt: "20",
          headroomHt: "30",
          recoveryTargetHt: "120",
        },
        reportingCurrencyCode: "EUR",
      },
      {
        id: "two",
        name: "Two",
        reconciliation: {
          actualCostHt: "200",
          complete: true,
          expectedFreightAllowanceHt: "250",
          expectedProductPurchaseCostHt: "1250",
          freightEstimateRate: "0.20",
          freightGrossProfitHt: "50",
          headroomHt: "0",
          recoveryTargetHt: "250",
        },
        reportingCurrencyCode: "EUR",
      },
    ]);
    expect(report.totals).toMatchObject({
      actualCostHt: "300",
      freightGrossProfitHt: "70",
      recoveryTargetHt: "370",
    });
  });
});
