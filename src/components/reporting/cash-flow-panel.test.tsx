import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CashFlowPanel } from "./cash-flow-panel";
import type { SerializedCashFlow } from "@/lib/reporting/reports";

const cashFlow: SerializedCashFlow = {
  start: "2026-09-01",
  end: "2026-09-30",
  rows: [],
  chart: [],
  totals: {
    expectedIn: "600",
    expectedOut: "0",
    expectedNet: "600",
    actualIn: "400",
    actualOut: "0",
    actualNet: "400",
    expectedComplete: true,
    actualComplete: true,
    missingExpectedCount: 0,
    missingActualCount: 0,
  },
  planned: {
    amount: "300",
    complete: true,
    missingCount: 0,
    rows: [{ month: "2026-09", amount: "300", complete: true }],
  },
};

describe("Reports issued and planned cash presentation", () => {
  it("keeps planned receipts in a separate disclosure, outside main expected net", () => {
    const html = renderToStaticMarkup(
      <CashFlowPanel
        baseHref="/reports?view=cash"
        cashFlow={cashFlow}
        currencyCode="EUR"
        horizon="30d"
      />,
    );
    expect(html).toContain("issued Invoices only");
    expect(html).toContain(
      "Planned Client receipts · excluded from expected net",
    );
    expect(html).toContain("600.00 EUR");
    expect(html).toContain("300.00 EUR");
    expect(html).not.toContain("900.00 EUR");
    expect(html).toContain("<details");
  });
  it("does not present a planned subtotal with missing FX as a complete balance", () => {
    const html = renderToStaticMarkup(
      <CashFlowPanel
        baseHref="/reports"
        cashFlow={{
          ...cashFlow,
          planned: {
            amount: "300",
            complete: false,
            missingCount: 1,
            rows: [],
          },
        }}
        currencyCode="EUR"
        horizon="30d"
      />,
    );
    expect(html).toContain("Incomplete — review source data");
    expect(html).not.toContain("300.00 EUR");
  });
});
