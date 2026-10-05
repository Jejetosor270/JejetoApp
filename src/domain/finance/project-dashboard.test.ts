import { describe, expect, it } from "vitest";
import {
  projectDashboard,
  type ProjectDashboardInput,
  type ProjectMetricRow,
} from "./project-dashboard";
import { sumKnown } from "./project-control";

const row = (amount: string | null, label = "Source"): ProjectMetricRow => ({
  label,
  href: `/orders/${label}`,
  amount,
});
const input = (
  overrides: Partial<ProjectDashboardInput> = {},
): ProjectDashboardInput => ({
  cost: [],
  sell: [],
  invoiced: [],
  toInvoice: [],
  receipts: [],
  supplierPayments: [],
  freightPayments: [],
  clientRefunds: [],
  supplierRefunds: [],
  toCollect: [],
  toPay: [],
  budget: [row(null, "Budget")],
  nonDeductibleVat: [],
  freightCost: [],
  freightInvoiced: [],
  freightReceived: [],
  vatOutput: [],
  vatInput: [],
  freightMarkupRate: "0.2",
  alerts: [],
  ...overrides,
});

describe("Project dashboard", () => {
  it("uses signed source rows and counts all issued Billing after credits for coverage", () => {
    const dashboard = projectDashboard(
      input({
        cost: [row("80", "Order"), row("10", "Project freight")],
        sell: [row("120")],
        invoiced: [row("100"), row("-10", "Credit")],
        toInvoice: [row("50")],
        budget: [row("70"), row("10"), row("5")],
        nonDeductibleVat: [row("2")],
        freightCost: [row("10")],
        freightInvoiced: [row("15")],
        freightReceived: [row("9")],
        vatOutput: [row("18")],
        vatInput: [row("7")],
      }),
    );
    expect(dashboard.metrics.profit.value).toBe("30.0000");
    expect(dashboard.metrics.planned.value).toBe("140.0000");
    expect(dashboard.metrics.invoiced.value).toBe("90.0000");
    expect(dashboard.metrics.toInvoice.value).toBe("50.0000");
    expect(dashboard.metrics.coverage.value).toBe("-30.0000");
    expect(dashboard.metrics.expectedCost.value).toBe("87.0000");
    expect(dashboard.metrics.expectedProfit.value).toBe("53.0000");
    expect(dashboard.metrics.freightTarget.value).toBe("12.0000");
    expect(dashboard.metrics.vatBalance.value).toBe("11.0000");
    expect(dashboard.markupRate).toBe("0.333333");
    for (const metric of Object.values(dashboard.metrics))
      expect(metric.value).toBe(
        sumKnown(metric.rows.map((source) => source.amount)),
      );
  });

  it("excludes planned Billing from coverage and keeps missing Invoice or Order FX incomplete", () => {
    expect(
      projectDashboard(
        input({
          invoiced: [row("150")],
          sell: [row("120")],
          toInvoice: [row("999")],
        }),
      ).metrics.coverage.value,
    ).toBe("30.0000");
    for (const missing of [
      { invoiced: [row(null)], sell: [row("120")] },
      { invoiced: [row("150")], sell: [row(null)] },
    ])
      expect(
        projectDashboard(input(missing)).metrics.coverage.value,
      ).toBeNull();
  });

  it("nets actual refunds on the correct cash side without changing issued revenue", () => {
    const dashboard = projectDashboard(
      input({
        receipts: [row("120")],
        clientRefunds: [row("24")],
        supplierPayments: [row("70")],
        freightPayments: [row("10")],
        supplierRefunds: [row("7")],
        invoiced: [row("80")],
        toCollect: [row("0")],
        toPay: [row("5", "Client refund due")],
      }),
    );
    expect(dashboard.metrics.received.value).toBe("96.0000");
    expect(dashboard.metrics.paid.value).toBe("73.0000");
    expect(dashboard.metrics.cash.value).toBe("23.0000");
    expect(dashboard.metrics.invoiced.value).toBe("80.0000");
    expect(dashboard.metrics.toPay.value).toBe("5.0000");
    expect(dashboard.metrics.toCollect.value).toBe("0.0000");
  });

  it("requires every approved budget category and retains missing FX as an actionable row", () => {
    const missing = row(null, "Foreign Order");
    const dashboard = projectDashboard(
      input({
        cost: [missing],
        budget: [row("100"), row("10"), row(null, "Other budget")],
        invoiced: [row("200")],
        sell: [row("200")],
      }),
    );
    expect(dashboard.metrics.cost.value).toBeNull();
    expect(dashboard.metrics.profit.value).toBeNull();
    expect(dashboard.metrics.expectedCost.value).toBeNull();
    expect(dashboard.metrics.expectedProfit.value).toBeNull();
    expect(dashboard.expectedMarkupRate).toBeNull();
    expect(dashboard.metrics.cost.rows).toContainEqual(missing);
    expect(dashboard.alerts).toContainEqual(
      expect.objectContaining({ href: missing.href }),
    );
    expect(dashboard.metrics.planned.value).toBe("200.0000");
  });

  it("accepts explicit zero budgets and never adds current HT costs to a full Project budget", () => {
    const dashboard = projectDashboard(
      input({
        budget: [row("0"), row("0"), row("0")],
        cost: [row("90")],
        nonDeductibleVat: [row("2")],
        invoiced: [row("120")],
      }),
    );
    expect(dashboard.metrics.expectedCost.value).toBe("2.0000");
    expect(dashboard.metrics.expectedProfit.value).toBe("118.0000");
    expect(dashboard.metrics.cost.value).toBe("90.0000");
  });
});
