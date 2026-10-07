import { describe, expect, it } from "vitest";
import {
  cashChart,
  dashboardForecast,
  dashboardHistoryRange,
  signedComparison,
} from "./reports-dashboard";
import {
  projectCashOutlook,
  type CashOutlookDocument,
} from "./project-cash-outlook";

const document = (
  overrides: Partial<CashOutlookDocument> = {},
): CashOutlookDocument => ({
  kind: "issued",
  currency: "EUR",
  total: "100.10",
  paid: "0",
  fx: null,
  terms: [
    {
      amount: "100.10",
      paid: "0",
      due: "2026-10-07",
      fx: null,
      cancelled: false,
    },
  ],
  ...overrides,
});

describe("Reports dashboard presentation calculations", () => {
  it("bounds actual history by calendar months and includes the current month only to today", () => {
    expect(dashboardHistoryRange("2026-01-07", 6)).toEqual({
      start: "2025-08-01",
      end: "2026-01-07",
    });
    expect(dashboardHistoryRange("2024-02-29", 3)).toEqual({
      start: "2023-12-01",
      end: "2024-02-29",
    });
  });
  it("keeps all chart arithmetic decimal-safe and distinguishes unknown from zero", () => {
    const chart = cashChart([
      { month: "2026-01", incoming: "0.30", outgoing: "0.10", net: "0.20" },
      { month: "2026-02", incoming: null, outgoing: "0", net: null },
    ]);
    expect(chart.maximum).toBe("0.3000");
    expect(chart.rows[0]).toMatchObject({
      incomingHeight: "100.0000%",
      outgoingHeight: "33.3333%",
      net: "0.20",
    });
    expect(chart.rows[1]).toMatchObject({
      incomingHeight: null,
      outgoingHeight: "0.0000%",
      net: null,
    });
    expect(
      cashChart([{ month: "2026-01", incoming: "0", outgoing: "0", net: "0" }]),
    ).toMatchObject({ hasActivity: false, maximum: "0.0000" });
  });
  it("separates planned cash, includes boundary dates once, and preserves negative net", () => {
    const outlook = projectCashOutlook(
      [
        document(),
        document({ kind: "planned" }),
        document({
          kind: "payment",
          total: "120.20",
          terms: [
            {
              amount: "120.20",
              paid: "0",
              due: "2026-11-05",
              fx: null,
              cancelled: false,
            },
          ],
        }),
        document({
          terms: [
            {
              amount: "100.10",
              paid: "0",
              due: "2026-11-06",
              fx: null,
              cancelled: false,
            },
          ],
        }),
      ],
      "EUR",
      "2026-10-07",
      "0",
    );
    const result = dashboardForecast(outlook, "EUR", "30d");
    expect(result).toMatchObject({
      start: "2026-10-07",
      end: "2026-11-05",
      incoming: "100.1000",
      outgoing: "120.2000",
      net: "-20.1000",
      planned: "100.1000",
    });
    expect(result.chart.rows.map((row) => row.net)).toEqual([
      "100.1000",
      "-120.2000",
    ]);
  });
  it("leaves overdue and unscheduled balances out of future buckets without implying complete net", () => {
    const outlook = projectCashOutlook(
      [
        document({ terms: [] }),
        document({
          kind: "payment",
          terms: [
            {
              amount: "100.10",
              paid: "0",
              due: "2026-10-06",
              fx: null,
              cancelled: false,
            },
          ],
        }),
      ],
      "EUR",
      "2026-10-07",
      "0",
    );
    const result = dashboardForecast(outlook, "EUR", "90d");
    expect(result).toMatchObject({
      incoming: "0.0000",
      outgoing: "0.0000",
      net: null,
    });
    expect(result.reviewEntries).toHaveLength(2);
  });
  it("keeps missing FX and reviews incomplete, while planned gaps do not contaminate issued cash", () => {
    const planned = document({ kind: "planned", currency: "USD" });
    const complete = dashboardForecast(
      projectCashOutlook([document(), planned], "EUR", "2026-10-07", "0"),
      "EUR",
      "30d",
    );
    expect(complete).toMatchObject({
      net: "100.1000",
      planned: null,
      plannedIssues: 1,
    });
    const incomplete = dashboardForecast(
      projectCashOutlook(
        [document({ currency: "USD" })],
        "EUR",
        "2026-10-07",
        "0",
      ),
      "EUR",
      "30d",
    );
    expect(incomplete.incoming).toBeNull();
    expect(incomplete.chart.rows[0]?.incomingHeight).toBeNull();
    expect(incomplete.net).toBeNull();
  });
  it("sorts unknown and negative Project values first without mutating inputs", () => {
    const rows = [
      { id: "profit", amount: "20" },
      { id: "loss", amount: "-10" },
      { id: "unknown", amount: null },
    ];
    const result = signedComparison(rows);
    expect(result.map((row) => row.id)).toEqual(["unknown", "loss", "profit"]);
    expect(result[1]).toMatchObject({ negative: true, width: "50.0000%" });
    expect(result[0]?.width).toBeNull();
    expect(rows[0]?.id).toBe("profit");
  });
});
