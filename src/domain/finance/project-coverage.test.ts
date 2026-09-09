import { expect, it } from "vitest";
import {
  financialCategoryTotals,
  financialTotalKeys,
  freightReceiptHt,
  projectFreightCoverage,
} from "./project-coverage";

it("attributes partial TTC receipts to Invoice freight HT without counting VAT as freight", () => {
  expect(freightReceiptHt("600", "1200", "100")).toBe("50");
  expect(freightReceiptHt("1200", "1200", "100")).toBe("100");
  expect(freightReceiptHt("0.1", "0.3", "0.09")).toBe("0.03");
  expect(freightReceiptHt("0", "1200", "100")).toBe("0");
  expect(freightReceiptHt("100", "0", "0")).toBe("0");
  expect(freightReceiptHt("100", "0", "10")).toBeNull();
});

it("compares freight Invoice and proportionally paid amounts with Project-marked-up HT", () => {
  expect(
    projectFreightCoverage({
      supplierHt: "3400",
      projectMarkup: "0.15",
      clientInvoicedHt: "7245",
      clientPaidHt: "3622.5",
    }),
  ).toMatchObject({
    supplierMarkupHt: "510.0000",
    supplierSellHt: "3910.0000",
    invoicedCoverageHt: "3335.0000",
    paidCoverageHt: "-287.5000",
  });
  expect(
    projectFreightCoverage({
      supplierHt: null,
      projectMarkup: "0.15",
      clientInvoicedHt: "7245",
      clientPaidHt: null,
    }),
  ).toMatchObject({
    supplierSellHt: null,
    invoicedCoverageHt: null,
    paidCoverageHt: null,
  });
});

it("totals category money exactly without inventing missing values or averaging percentages", () => {
  const row = Object.fromEntries(
    financialTotalKeys.map((key) => [key, "0.1"]),
  ) as Record<(typeof financialTotalKeys)[number], string | null>;
  const totals = financialCategoryTotals([
    row,
    { ...row, billed: "0.2", budget: null },
  ]);
  expect(totals.billed).toBe("0.3000");
  expect(totals.budget).toBeNull();
  expect(totals).not.toHaveProperty("markup");
});
