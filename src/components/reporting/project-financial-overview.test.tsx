// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import {
  ProjectFinancialOverview,
  projectMetricLabels,
} from "./project-financial-overview";
import {
  projectDashboard,
  type ProjectMetricRow,
} from "@/domain/finance/project-dashboard";

const row = (
  label: string,
  amount: string | null,
  href: string,
): ProjectMetricRow => ({ label, amount, href });
const dashboard = projectDashboard({
  cost: [
    row("Order cost", "100", "/orders/one"),
    row("Project freight", "20", "/projects/test?section=freight"),
  ],
  sell: [row("Order sell", "180", "/orders/one")],
  invoiced: [row("Invoice issued", "120", "/billing/issued")],
  toInvoice: [row("Future invoice", "80", "/billing/planned")],
  eligibleCoverage: [row("Approved invoice", "120", "/billing/issued")],
  receipts: [row("Receipt", "80", "/receipts/one")],
  supplierPayments: [row("Payment", "30", "/payments/one")],
  freightPayments: [],
  clientRefunds: [row("Refund", "10", "/billing/issued?section=credits")],
  supplierRefunds: [],
  toCollect: [row("Invoice due", "50", "/billing/issued")],
  toPay: [row("Order due", "70", "/orders/one")],
  budget: [row("Budget", "150", "/projects/test")],
  nonDeductibleVat: [],
  freightCost: [row("Freight", "20", "/projects/test?section=freight")],
  freightInvoiced: [row("Invoice freight", "30", "/billing/issued")],
  freightReceived: [row("Receipt freight", "10", "/receipts/one")],
  freightMarkupRate: "0.2",
  vatOutput: [row("Invoice VAT", "24", "/billing/issued")],
  vatInput: [row("Order VAT", "20", "/orders/one")],
  alerts: [],
});
type Props = ComponentProps<typeof ProjectFinancialOverview>;
const data: Props["data"] = { currency: "EUR", dashboard };
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
});
async function mount(overrides: Partial<Props> = {}) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <ProjectFinancialOverview data={data} projectId="test" {...overrides} />,
    ),
  );
}
function button(label: string) {
  const result = document.querySelector<HTMLButtonElement>(
    `button[aria-label="View ${label}"]`,
  );
  if (!result) throw new Error(`Missing metric ${label}`);
  return result;
}
it("prioritizes three questions with compact VAT/freight and short labels", async () => {
  await mount();
  expect(
    [...document.querySelectorAll("h2")].map((node) => node.textContent),
  ).toEqual(["Costs & profit", "Client Billing", "Cash"]);
  expect(
    [...document.querySelectorAll("details")].every((node) => !node.open),
  ).toBe(true);
  for (const label of Object.values(projectMetricLabels))
    expect(label.split(/\s+/).length).toBeLessThanOrEqual(4);
  expect(document.body.textContent).not.toContain("Provisional markup");
  expect(document.body.textContent).not.toContain("Funding balance");
  expect(button("Pricing profit").textContent).toContain("+60.00 EUR");
  expect(button("To invoice HT").textContent).toContain("80.00 EUR");
  expect(button("Net cash TTC").textContent).toContain("+40.00 EUR");
});
it("shows budget-backed expected profit rather than recorded-cost surplus", async () => {
  await mount();
  expect(button("Budgeted cost").textContent).toContain("150.00 EUR");
  expect(button("Expected profit").textContent).toContain("+50.00 EUR");
  expect(button("Order coverage HT").textContent).toContain("-60.00 EUR");
});
it("opens exact signed sources and a reconciled total without navigating away", async () => {
  await mount();
  await act(async () => button("Net cash TTC").click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("40.00 EUR");
  expect(dialog?.textContent).toContain("-10.00 EUR");
  expect(dialog?.textContent).toContain("-30.00 EUR");
  expect(dialog?.querySelector('a[href="/receipts/one"]')).not.toBeNull();
  expect(dialog?.querySelector('a[href="/payments/one"]')).not.toBeNull();
  expect(dialog?.querySelector("tfoot")?.textContent).toContain("40.00 EUR");
});
it("issued drilldown excludes the future Invoice but the plan includes it", async () => {
  await mount();
  await act(async () => button("Invoiced HT").click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("Invoice issued");
  expect(dialog?.textContent).not.toContain("Future invoice");
});
it("makes missing values actionable and never draws invented progress", async () => {
  await mount({
    data: {
      ...data,
      dashboard: {
        ...dashboard,
        metrics: {
          ...dashboard.metrics,
          planned: { ...dashboard.metrics.planned, value: null },
          expectedProfit: { ...dashboard.metrics.expectedProfit, value: null },
          cost: {
            value: null,
            help: "Needs FX",
            rows: [row("Order missing FX", null, "/orders/missing")],
          },
        },
      },
    },
  });
  expect(button("Budgeted cost").textContent).toContain("150.00 EUR");
  expect(button("Expected profit").textContent).toContain("Estimate needed");
  expect(document.body.textContent).toContain(
    "Review missing Billing amounts or FX",
  );
  await act(async () => button("Recorded cost").click());
  expect(
    document.querySelector('[role="dialog"] a[href="/orders/missing"]'),
  ).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Check source",
  );
});
it("keeps credit sign explicit and shows actual collection/payment needs", async () => {
  await mount({
    data: {
      ...data,
      dashboard: {
        ...dashboard,
        metrics: {
          ...dashboard.metrics,
          vatBalance: { ...dashboard.metrics.vatBalance, value: "-4" },
        },
      },
    },
  });
  expect(document.body.textContent).toContain("VAT credit");
  expect(button("VAT credit").textContent).toContain("-4.00 EUR");
  expect(button("To collect TTC").textContent).toContain("50.00 EUR");
  expect(button("To pay TTC").textContent).toContain("70.00 EUR");
});
it("limits initially visible checks and retains source links for the rest", async () => {
  await mount({
    data: {
      ...data,
      dashboard: {
        ...dashboard,
        alerts: [1, 2, 3, 4].map((index) => ({
          label: "Missing date",
          note: `Order ${index}`,
          href: `/orders/${index}`,
        })),
      },
    },
  });
  const alerts = document.querySelector('[aria-label="Needs attention"]');
  expect(alerts?.textContent).toContain("More checks (1)");
  expect(alerts?.querySelector('a[href="/orders/4"]')).not.toBeNull();
});
