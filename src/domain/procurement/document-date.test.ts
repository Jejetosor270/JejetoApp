import { describe, expect, it } from "vitest";
import { supplierDocumentDate } from "./document-date";

describe("Purchasing source document date", () => {
  it("uses the Quote until an actual Invoice date is recorded", () => {
    expect(
      supplierDocumentDate({ quoteDate: "2026-10-01", invoiceDate: null }),
    ).toEqual({
      kind: "QUOTE",
      field: "quoteDate",
      label: "Quote date",
      date: "2026-10-01",
    });
  });
  it("prefers the Invoice without copying or removing the earlier Quote date", () => {
    const source = { quoteDate: "2026-10-01", invoiceDate: "2026-10-09" };
    expect(supplierDocumentDate(source)).toEqual({
      kind: "INVOICE",
      field: "invoiceDate",
      label: "Invoice date",
      date: "2026-10-09",
    });
    expect(source.quoteDate).toBe("2026-10-01");
  });
  it("leaves unknown source dates missing", () => {
    expect(supplierDocumentDate({}).date).toBeNull();
  });
});
