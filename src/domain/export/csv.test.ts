import { describe, expect, it } from "vitest";

import { csvDocument, trustedCsvValue } from "@/domain/export/csv";

describe("CSV safety and precision", () => {
  it("protects user-controlled spreadsheet formulas and escapes quotes", () => {
    const csv = csvDocument(
      ["Name"],
      [["@SUM(A1:A2)"], ["=1+1"], ['Supplier "A"']],
    );
    expect(csv).toContain('"\'@SUM(A1:A2)"');
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"Supplier ""A"""');
  });

  it("preserves trusted Decimal and ISO values exactly", () => {
    const csv = csvDocument(
      ["Amount", "Date"],
      [[trustedCsvValue("-123456789.1234"), trustedCsvValue("2026-08-26")]],
    );
    expect(csv).toContain('"-123456789.1234","2026-08-26"');
  });
});
