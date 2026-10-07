import { describe, expect, it } from "vitest";
import {
  projectCashOutlook,
  type CashOutlookDocument,
} from "@/domain/finance/project-cash-outlook";
import { cashDelay, cashDelayScenario } from "./forecast-scenario";

function document(
  kind: CashOutlookDocument["kind"],
  due: string | null,
  currency = "EUR",
): CashOutlookDocument {
  return {
    kind,
    total: "100.10",
    paid: "0",
    currency,
    fx: null,
    terms: [{ amount: "100.10", paid: "0", due, fx: null, cancelled: false }],
  };
}
function outlook(documents: CashOutlookDocument[]) {
  return projectCashOutlook(documents, "EUR", "2026-10-07", "0");
}
describe("cash-in delay scenarios", () => {
  it("uses supported delays only", () => {
    expect(
      [undefined, "-1", "999", "0", "15", "30", "60"].map(cashDelay),
    ).toEqual(["0", "0", "0", "0", "15", "30", "60"]);
  });
  it("moves only future cash-in, leaving payment dates and plans unchanged without mutating sources", () => {
    const source = outlook([
      document("issued", "2026-11-01"),
      document("payment", "2026-11-01"),
      document("planned", "2026-11-01"),
    ]);
    const before = JSON.stringify(source);
    const result = cashDelayScenario(source, "EUR", "30d", "15");
    expect(result.baseline).toMatchObject({
      incoming: "100.1000",
      outgoing: "100.1000",
      net: "0.0000",
      planned: "100.1000",
    });
    expect(result.scenario).toMatchObject({
      incoming: "0.0000",
      outgoing: "100.1000",
      net: "-100.1000",
      planned: "100.1000",
    });
    expect(result.impact).toBe("-100.1000");
    expect(JSON.stringify(source)).toBe(before);
    expect(cashDelayScenario(source, "EUR", "30d", "0").impact).toBe("0.0000");
  });
  it("moves amounts across calendar months and years with exact decimal totals", () => {
    const result = cashDelayScenario(
      outlook([document("issued", "2026-12-31")]),
      "EUR",
      "12m",
      "15",
    );
    expect(
      result.scenario.chart.rows.find((row) => row.month === "2027-01")
        ?.incoming,
    ).toBe("100.1000");
    expect(
      result.scenario.chart.rows.find((row) => row.month === "2026-12")
        ?.incoming,
    ).toBe("0.0000");
    expect(result.impact).toBe("0.0000");
  });
  it("does not reschedule overdue or undated obligations or fabricate missing FX", () => {
    const result = cashDelayScenario(
      outlook([
        document("issued", "2026-10-06"),
        document("issued", null),
        document("issued", "2026-10-09", "USD"),
      ]),
      "EUR",
      "30d",
      "60",
    );
    expect(result.scenario.reviewEntries).toHaveLength(3);
    expect(result.scenario.reviewEntries[0]?.due).toBe("2026-10-06");
    expect(result.scenario.net).toBeNull();
    expect(result.impact).toBeNull();
  });
  it("respects explicit export ranges and includes the final day once", () => {
    const result = cashDelayScenario(
      outlook([document("issued", "2026-10-07")]),
      "EUR",
      "90d",
      "15",
      { start: "2026-10-22", end: "2026-10-22" },
    );
    expect(result.baseline.incoming).toBe("0.0000");
    expect(result.scenario.incoming).toBe("100.1000");
    expect(result.scenario.chart.rows).toHaveLength(1);
  });
});
