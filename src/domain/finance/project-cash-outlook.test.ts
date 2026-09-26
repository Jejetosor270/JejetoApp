import { describe, expect, it } from "vitest";
import {
  projectCashOutlook,
  type CashOutlookDocument,
} from "./project-cash-outlook";

const document = (
  overrides: Partial<CashOutlookDocument> = {},
): CashOutlookDocument => ({
  kind: "issued",
  currency: "EUR",
  total: "100",
  paid: "20",
  fx: null,
  terms: [
    {
      amount: "100",
      paid: "20",
      due: "2026-09-30",
      fx: null,
      cancelled: false,
    },
  ],
  ...overrides,
});
const report = (
  documents: CashOutlookDocument[],
  cash: string | null = "200",
) => projectCashOutlook(documents, "EUR", "2026-09-26", cash);

describe("Project cash outlook", () => {
  it("adds issued receipts and subtracts payments without including planned receipts", () => {
    const result = report([
      document(),
      document({ kind: "planned" }),
      document({ kind: "payment" }),
    ]);
    expect(result.windows[0]).toMatchObject({
      expectedIn: "80.0000",
      expectedOut: "80.0000",
      plannedIn: "80.0000",
      projectedCash: "200.0000",
    });
  });
  it("uses exact Decimal amounts and expected FX, independent of actual cash FX", () => {
    const result = report(
      [
        document({
          currency: "USD",
          total: "0.3",
          paid: "0.1",
          terms: [
            {
              amount: "0.3",
              paid: "0.1",
              due: "2026-09-26",
              fx: "0.9",
              cancelled: false,
            },
          ],
        }),
      ],
      "0.1",
    );
    expect(result.windows[0]).toMatchObject({
      expectedIn: "0.1800",
      projectedCash: "0.2800",
    });
  });
  it("caps scheduled receipts by remaining invoice balance after document-level receipts", () => {
    const result = report([document({ paid: "90" })]);
    expect(result.windows[0]?.expectedIn).toBe("10.0000");
    expect(result.unscheduledCount).toBe(0);
  });
  it("keeps overdue amounts out of future windows and blocks a misleading projection", () => {
    const result = report([
      document({
        terms: [
          {
            amount: "100",
            paid: "20",
            due: "2026-09-25",
            fx: null,
            cancelled: false,
          },
        ],
      }),
    ]);
    expect(result.overdueIn).toBe("80.0000");
    expect(result.windows[0]).toMatchObject({
      expectedIn: "0.0000",
      projectedCash: null,
    });
  });
  it("exposes undated and unscheduled balances rather than omitting them", () => {
    const result = report([
      document({ terms: [] }),
      document({
        kind: "payment",
        terms: [
          { amount: "50", paid: "20", due: null, fx: null, cancelled: false },
        ],
      }),
    ]);
    expect(result).toMatchObject({
      undatedIn: "80.0000",
      undatedOut: "80.0000",
      unscheduledCount: 2,
    });
    expect(result.windows[0]?.projectedCash).toBeNull();
  });
  it("does not revive a cancelled term as a dated forecast or include fully paid terms", () => {
    const result = report([
      document({
        terms: [
          {
            amount: "100",
            paid: "20",
            due: "2026-09-26",
            fx: null,
            cancelled: true,
          },
        ],
      }),
      document({ paid: "100" }),
    ]);
    expect(result.windows[0]?.expectedIn).toBe("0.0000");
    expect(result.undatedIn).toBe("80.0000");
  });
  it("requires FX for outstanding foreign commitments but not settled zero balances", () => {
    const missing = report([document({ currency: "USD" })]);
    expect(missing.windows[0]).toMatchObject({
      expectedIn: null,
      projectedCash: null,
    });
    expect(
      report([document({ currency: "USD", paid: "100" })]).windows[0]
        ?.projectedCash,
    ).toBe("200.0000");
  });
  it("keeps planning uncertainty separate from the primary forecast", () => {
    const result = report([
      document({ kind: "planned", currency: "USD", terms: [] }),
    ]);
    expect(result.plannedUndated).toBeNull();
    expect(result.windows[0]?.projectedCash).toBe("200.0000");
  });
  it("uses inclusive business dates for 7, 30 and 90 days", () => {
    const result = report([
      document({
        terms: [
          {
            amount: "100",
            paid: "20",
            due: "2026-10-03",
            fx: null,
            cancelled: false,
          },
        ],
      }),
    ]);
    expect(result.windows.map((entry) => entry.expectedIn)).toEqual([
      "0.0000",
      "80.0000",
      "80.0000",
    ]);
    expect(result.windows[0]?.end).toBe("2026-10-02");
  });
  it("preserves missing actual cash and unknown supplier payable", () => {
    expect(report([], null).windows[0]?.projectedCash).toBeNull();
    expect(
      report([document({ kind: "payment", total: null })]).windows[0]
        ?.projectedCash,
    ).toBeNull();
  });
});
