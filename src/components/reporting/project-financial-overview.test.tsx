// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ProjectFinancialOverview } from "./project-financial-overview";
import { projectCashOutlook } from "@/domain/finance/project-cash-outlook";
import { cashFunding } from "@/domain/finance/project-control";
import {
  calculateProjectFinancialPerformance,
  calculateProjectTargets,
} from "@/domain/projects/targets";

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
});
const performance = calculateProjectFinancialPerformance({
  actualInvoicedHt: "120",
  actualOrderEconomicCostHt: "80",
  projectFreightExpenseEconomicCostHt: "20",
  target: calculateProjectTargets({
    targetMode: "MARKUP",
    estimatedPurchaseCostHt: "1000",
    estimatedFreightCostHt: "100",
    estimatedOtherCostHt: "0",
    defaultProductMarkupRate: "0.2",
    defaultFreightMarkupRate: "0.2",
  }),
});
const data = {
  currency: "EUR",
  received: "200",
  excludedReceiptCount: 0,
  cash: cashFunding({
    received: "200",
    supplierPaid: "80",
    freightPaid: "20",
    commitments: [],
    horizonEnd: "2026-10-25",
  }),
  cashOutlook: projectCashOutlook(
    [
      {
        kind: "issued",
        currency: "EUR",
        total: "50",
        paid: "0",
        fx: null,
        terms: [
          {
            amount: "50",
            paid: "0",
            due: "2026-10-20",
            fx: null,
            cancelled: false,
          },
        ],
      },
      {
        kind: "planned",
        currency: "EUR",
        total: "900",
        paid: "0",
        fx: null,
        terms: [
          {
            amount: "900",
            paid: "0",
            due: "2026-10-20",
            fx: null,
            cancelled: false,
          },
        ],
      },
    ],
    "EUR",
    "2026-09-26",
    "100",
  ),
};
async function mount(missing = false) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <>
        <input aria-label="Unrelated draft" defaultValue="Keep my draft" />
        <ProjectFinancialOverview
          data={missing ? { ...data, cash: { ...data.cash, net: null } } : data}
          performance={
            missing
              ? {
                  ...performance,
                  target: {
                    costHt: null,
                    sellHt: null,
                    markupRate: null,
                    marginRate: null,
                    grossProfitHt: null,
                  },
                }
              : performance
          }
          projectId="test"
        />
      </>,
    ),
  );
}
it("shows three clear groups and uses actual and approved-budget profitability", async () => {
  await mount();
  expect(
    [...document.querySelectorAll("h2")].map((element) => element.textContent),
  ).toEqual(["Cash · actual to date", "Expected cash", "Profitability"]);
  expect(document.body.textContent).toContain("20%");
  expect(document.body.textContent).toContain("220.00 EUR");
  expect(document.body.textContent).toContain("Current · provisional");
  expect(document.body.textContent).toContain("Expected · approved budget");
  expect(document.body.textContent).not.toContain("Billing less Order sell");
  expect(document.querySelector("details")?.open).toBe(false);
});
it("switches 7/30/90 days locally without including planned receipts or losing a draft", async () => {
  await mount();
  const expected = document.querySelector(
    '[aria-labelledby="project-outlook-heading"]',
  );
  expect(expected?.textContent).toContain("+150.00 EUR");
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent === "Next 7 days",
  );
  await act(async () => button?.click());
  expect(button?.getAttribute("aria-pressed")).toBe("true");
  expect(expected?.textContent).toContain("+100.00 EUR");
  expect(expected?.textContent).not.toContain("+1 050.00 EUR");
  expect(document.querySelector("input")?.value).toBe("Keep my draft");
  expect(
    document.querySelector('a[href="/projects/test?tab=related"]'),
  ).not.toBeNull();
});
it("shows missing cash and budget as incomplete rather than zero", async () => {
  await mount(true);
  expect(document.body.textContent).toContain("Actual cash is incomplete");
  expect(document.body.textContent).toContain("Budget incomplete");
});
