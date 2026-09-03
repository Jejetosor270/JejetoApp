import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
}));
const billing = vi.hoisted(() => ({
  getProjectsClientBillingSummaries: vi.fn(),
}));
const orders = vi.hoisted(() => ({ listOrders: vi.fn() }));
const payments = vi.hoisted(() => ({ listPaymentInstallments: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/billing/billing", () => billing);
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
  });

  it("uses actual Billing receipts for outstanding and cash position", async () => {
    billing.getProjectsClientBillingSummaries.mockResolvedValue(
      new Map([
        [
          "project-1",
          {
            complete: true,
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
});
