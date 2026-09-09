import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProjectFinancialControl } from "./project-control";
import { ProjectCoverage } from "./project-coverage";
import {
  cashFunding,
  categoryPosition,
  recoveryCategories,
} from "@/domain/finance/project-control";
import {
  financialCategoryTotals,
  projectFreightCoverage,
} from "@/domain/finance/project-coverage";
import type { ProjectControl } from "@/lib/reporting/project-control";

const categories = recoveryCategories.map((category) => ({
  category,
  quoted: "0",
  ...categoryPosition({
    billed: "100",
    allocated: "80",
    budget: "50",
    recordedCost: "70",
    markup: "0.15",
    recordedTarget: "80.5",
  }),
}));
const data: ProjectControl = {
  currency: "EUR",
  categories,
  totals: financialCategoryTotals(categories),
  supplierPaid: "100",
  freightPaid: "20",
  horizonEnd: "2026-10-09",
  orderNonDeductibleVat: "0",
  freightAllowance: "50",
  excludedReceiptCount: 0,
  billedTtc: "360",
  received: "180",
  outstandingTtc: "180",
  cash: cashFunding({
    received: "180",
    supplierPaid: "100",
    freightPaid: "20",
    commitments: [],
    horizonEnd: "2026-10-09",
  }),
  freightCoverage: projectFreightCoverage({
    supplierHt: "100",
    projectMarkup: "0.15",
    clientInvoicedHt: "150",
    clientPaidHt: "75",
  }),
};

it("renders the simplified Financials rows and money totals without the removed panels", () => {
  const html = renderToStaticMarkup(<ProjectFinancialControl data={data} />);
  for (const label of [
    "Financials",
    "Budgeted Sell HT",
    "Target Revenue HT",
    "Allocated Client Invoice Amount HT",
    "Invoiced Coverage HT",
    "Total",
    "300.00 EUR",
  ])
    expect(html).toContain(label);
  for (const label of [
    "Project commercial position",
    "Project cash position",
    "Recovery less budgeted cost",
    "Recovery less recorded cost",
    "Recovery less budget selling target",
    "Commercial freight allowance:",
  ])
    expect(html).not.toContain(label);
  expect(html).toContain("Category markup defaults are not added or averaged.");
});

it("separates actual TTC cash from proportional HT freight coverage and exposes incomplete FX", () => {
  const html = renderToStaticMarkup(
    <ProjectCoverage data={data} projectId="test" />,
  );
  for (const label of [
    "Billing/Purchasing Cash Coverage",
    "Supplier &amp; freight paid TTC",
    "Billing/Purchasing Freight Coverage",
    "Client Freight paid HT (proportional)",
    "Available freight coverage",
    "+60.00 EUR",
    "-40.00 EUR",
  ])
    expect(html).toContain(label);
  const missing = {
    ...data,
    cash: { ...data.cash, net: null },
    excludedReceiptCount: 1,
    freightCoverage: { ...data.freightCoverage, paidCoverageHt: null },
  };
  const warning = renderToStaticMarkup(
    <ProjectCoverage data={missing} projectId="test" />,
  );
  expect(warning).toContain("Cash coverage is incomplete");
  expect(warning).toContain("Freight coverage is incomplete");
  expect(warning).toContain("Review receipts");
});
