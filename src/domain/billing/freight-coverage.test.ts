import { describe, it, expect } from "vitest";
import { freightCoverageBreakdown } from "./freight-coverage";
import {
  summarizeFreightCoverage,
  freightDifference,
} from "./freight-reporting";
describe("Billing freight coverage", () => {
  it("splits freight within HT without adding revenue", () => {
    expect(
      freightCoverageBreakdown("10000", "1000", [
        { allocatedAmount: "9500", freightCoverageHt: "700" },
      ]),
    ).toEqual({
      productHt: "9000.0000",
      allocatedFreightHt: "700.0000",
      projectFreightHt: "300.0000",
    });
  });
  it.each([
    ["100", "101", []],
    ["100", "20", [{ allocatedAmount: "10", freightCoverageHt: "11" }]],
    ["100", "20", [{ allocatedAmount: "40", freightCoverageHt: "21" }]],
    ["100", "20", [{ allocatedAmount: "90", freightCoverageHt: "0" }]],
  ])("rejects inconsistent splits", (total, freight, allocations) => {
    expect(() =>
      freightCoverageBreakdown(
        total as string,
        freight as string,
        allocations as { allocatedAmount: string; freightCoverageHt: string }[],
      ),
    ).toThrow();
  });
  it("keeps old allocations and zero freight valid", () => {
    expect(
      freightCoverageBreakdown("0.3", "0", [
        { allocatedAmount: "0.1" },
        { allocatedAmount: "0.2" },
      ]).projectFreightHt,
    ).toBe("0.0000");
  });
  it("separates quotes, active invoices and cancelled documents with FX", () => {
    const row = {
      currencyCode: "USD",
      fxRate: "0.8",
      isCancelled: false,
      freightCoverageHt: "100",
    };
    expect(
      summarizeFreightCoverage(
        [
          { ...row, documentType: "QUOTE" },
          { ...row, documentType: "INVOICE" },
          { ...row, documentType: "INVOICE", isCancelled: true },
        ],
        "EUR",
      ),
    ).toEqual({ invoicedFreightHt: "80.0000", quotedFreightHt: "80.0000" });
  });
  it("keeps missing Invoice FX incomplete independently of Quotes", () => {
    expect(
      summarizeFreightCoverage(
        [
          {
            currencyCode: "USD",
            fxRate: null,
            isCancelled: false,
            freightCoverageHt: "100",
            documentType: "INVOICE",
          },
        ],
        "EUR",
      ),
    ).toEqual({ invoicedFreightHt: null, quotedFreightHt: "0.0000" });
    expect(freightDifference(null, "10")).toBeNull();
    expect(freightDifference("20", "10")).toBe("10.0000");
  });
});
