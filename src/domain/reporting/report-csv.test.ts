import { describe, expect, it } from "vitest";
import { reportExportSchema } from "./export-options";
import { reportCsv } from "./report-csv";

describe("report exports", () => {
  it("validates scope, dates and bounded scenario values", () => {
    for (const value of [
      { dataset: "unknown" },
      { dataset: "vat", projectId: "bad" },
      { dataset: "forecast", cashDelay: "-1" },
      { dataset: "forecast", horizon: "100y" },
      { dataset: "forecast", dateFrom: "2026-10-01" },
      { dataset: "summary", dateTo: "2026-10-01" },
      { dataset: "trend", dateFrom: "2026-02-30" },
      { dataset: "trend", dateFrom: "2026-10-10", dateTo: "2026-10-01" },
      { dataset: "trend", dateFrom: "2000-01-01", dateTo: "2026-01-01" },
      { dataset: ["vat", "freight"] },
    ])
      expect(reportExportSchema.safeParse(value).success).toBe(false);
    expect(
      reportExportSchema.parse({
        dataset: "transactions",
        dateFrom: "2026-01-01",
        projectId: "",
      }),
    ).toMatchObject({ cashDelay: "0", horizon: "90d", dateFrom: "2026-01-01" });
  });
  it("exports exact signed decimal strings, unknown separately from zero, ISO metadata and safe text", () => {
    const csv = reportCsv(
      [
        {
          type: "ACTUAL",
          metric: "Net TTC",
          amount: "-123456789012345.1234",
          currency: "EUR",
          project: '=HYPERLINK("x")',
          reference: "+cmd",
          date: "2026-10-07",
        },
        {
          type: "ACTUAL",
          metric: "Cash TTC",
          amount: null,
          currency: "USD",
          notes: "@SUM(1)",
        },
        {
          type: "ACTUAL",
          metric: "Cash TTC",
          amount: "0.0000",
          currency: "EUR",
        },
      ],
      reportExportSchema.parse({ dataset: "trend" }),
      "2026-10-07",
      "2026-10-07T12:00:00.000Z",
    );
    expect(csv).toContain('"-123456789012345.1234"');
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"\'+cmd"');
    expect(csv).toContain('"\'@SUM(1)"');
    expect(csv).toContain('"","USD","INCOMPLETE"');
    expect(csv).toContain('"0","EUR","COMPLETE"');
    expect(csv).toContain('"2026-10-07T12:00:00.000Z"');
    expect(csv).toContain('"2026-10-07"');
  });
});
