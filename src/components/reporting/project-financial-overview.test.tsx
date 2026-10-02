// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ProjectFinancialOverview } from "./project-financial-overview";
import { projectFreightCoverage } from "@/domain/finance/project-coverage";
import { calculateProjectVatPosition } from "@/domain/vat/position";

type Props = ComponentProps<typeof ProjectFinancialOverview>;
const data: Props["data"] = {
  currency: "EUR",
  excludedReceiptCount: 0,
  overview: {
    invoiced: { clientHt: "120", costHt: "100", balanceHt: "20" },
    cash: { receivedTtc: "200", paidTtc: "100", balanceTtc: "100" },
    funding: {
      receivedTtc: "200",
      recordedPayableTtc: "160",
      balanceTtc: "40",
    },
    orders: {
      costHt: "100",
      sellHt: "130",
      profitHt: "30",
      markupRate: "0.3",
      nonDeductibleVat: "0",
    },
    planned: {
      billingHt: "180",
      targetProfitHt: "30",
      targetMarginRate: "0.1666666667",
      targetMarkupRate: "0.2",
      orderSellHt: "130",
      coverageHt: "50",
      profitHt: "80",
      markupRate: "0.8",
      nonDeductibleVat: "0",
    },
  },
  freightCoverage: projectFreightCoverage({
    supplierHt: "20",
    projectMarkup: "0.2",
    clientInvoicedHt: "30",
    clientPaidHt: "15",
  }),
};
const vatPosition = calculateProjectVatPosition({
  outputVat: "24",
  deductibleInputVat: "20",
});
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
      <ProjectFinancialOverview
        data={data}
        vatPosition={vatPosition}
        projectId="test"
        {...overrides}
      />,
    ),
  );
}
function section(heading: string) {
  const result = [...document.querySelectorAll("h2")]
    .find((node) => node.textContent === heading)
    ?.closest("section");
  if (!result) throw new Error(`Missing ${heading} section`);
  return result;
}

it("shows exactly six compact sections with short labels and no duplicated forecast or budget panels", async () => {
  await mount();
  expect(
    [...document.querySelectorAll("h2")].map((node) => node.textContent),
  ).toEqual([
    "Invoiced HT",
    "Cash TTC",
    "Orders HT",
    "Planned HT",
    "VAT",
    "Freight HT",
  ]);
  for (const label of document.querySelectorAll("dt")) {
    expect(label.textContent?.trim().split(/\s+/).length).toBeLessThanOrEqual(
      4,
    );
  }
  for (const removed of [
    "Upcoming cash",
    "Outstanding commitments",
    "Budget & recorded position",
    "Commercial position · recorded to date",
    "Next 7 days",
    "Next 30 days",
    "Next 90 days",
  ])
    expect(document.body.textContent).not.toContain(removed);
  expect(section("Invoiced HT").textContent).toContain("120.00 EUR");
  expect(section("Invoiced HT").textContent).toContain("100.00 EUR");
  expect(section("Invoiced HT").textContent).toContain("+20.00 EUR");
});

it("keeps actual cash separate from full-payable funding coverage", async () => {
  await mount();
  const cash = section("Cash TTC").textContent;
  expect(cash).toContain("200.00 EUR");
  expect(cash).toContain("100.00 EUR");
  expect(cash).toContain("+100.00 EUR");
  expect(cash).toContain("160.00 EUR");
  expect(cash).toContain("+40.00 EUR");
  expect(cash).toContain("Cash balance");
  expect(cash).toContain("Funding balance TTC");
});

it("shows agreed Order pricing separately from both planned billing comparisons", async () => {
  await mount();
  const orders = section("Orders HT").textContent;
  expect(orders).toContain("130.00 EUR");
  expect(orders).toContain("30.00 EUR");
  expect(orders).toContain("30%");
  const planned = section("Planned HT").textContent;
  expect(planned).toContain("180.00 EUR");
  expect(planned).toContain("30.00 EUR");
  expect(planned).toContain("16.67%");
  expect(planned).toContain("+50.00 EUR");
  expect(planned).toContain("80.00 EUR");
  expect(planned).toContain("80%");
  expect(section("VAT").textContent).toContain("VAT payable");
  expect(section("VAT").textContent).toContain("4.00 EUR");
  expect(section("Freight HT").textContent).toContain("24.00 EUR");
  expect(section("Freight HT").textContent).toContain("+6.00 EUR");
  expect(section("Freight HT").textContent).toContain("-9.00 EUR");
});

it("links summary amounts to the same Project's underlying records", async () => {
  await mount();
  for (const target of ["work", "orders", "payment-terms"]) {
    expect(
      document.querySelector(
        `a[href="/projects/test?tab=related&section=${target}"]`,
      ),
    ).not.toBeNull();
  }
  expect(document.querySelector('a[href^="#financial:"]')).toBeNull();
  for (const label of [
    "Recorded cost HT",
    "Supplier paid TTC",
    "Recorded payable TTC",
    "Freight cost HT",
  ]) {
    const metric = [...document.querySelectorAll("dt")].find(
      (node) => node.textContent === label,
    )?.parentElement;
    expect(metric).toBeDefined();
    expect(metric?.querySelector("a")).toBeNull();
  }
});

it("shows incomplete values without manufacturing zero or an economic profit", async () => {
  await mount({
    data: {
      ...data,
      overview: {
        ...data.overview,
        cash: { ...data.overview.cash, balanceTtc: null },
        funding: {
          ...data.overview.funding,
          recordedPayableTtc: null,
          balanceTtc: null,
        },
        planned: { ...data.overview.planned, profitHt: null, markupRate: null },
      },
      freightCoverage: { ...data.freightCoverage, paidCoverageHt: null },
    },
    vatPosition: calculateProjectVatPosition({
      outputVat: "24",
      deductibleInputVat: null,
    }),
  });
  for (const heading of ["Cash TTC", "Planned HT", "VAT", "Freight HT"]) {
    expect(section(heading).textContent).toContain("Incomplete");
    expect(section(heading).textContent).not.toMatch(/(?:^|[^\d])0\.00 EUR/);
  }
});

it("preserves explicit zero and identifies a VAT credit without calling it payable", async () => {
  await mount({
    data: {
      ...data,
      overview: {
        ...data.overview,
        invoiced: { clientHt: "0", costHt: "0", balanceHt: "0" },
      },
    },
    vatPosition: calculateProjectVatPosition({
      outputVat: "20",
      deductibleInputVat: "24",
    }),
  });
  expect(section("Invoiced HT").textContent).toContain("0.00 EUR");
  expect(section("Invoiced HT").textContent).not.toContain("Incomplete");
  expect(section("VAT").textContent).toContain("VAT credit");
  expect(section("VAT").textContent).toContain("4.00 EUR");
  expect(section("VAT").textContent).not.toContain("VAT payable");
});
