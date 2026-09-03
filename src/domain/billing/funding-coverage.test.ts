import { describe, expect, it } from "vitest";

import { calculateProjectFundingCoverage } from "./funding-coverage";

function coverage(clientBillingCoverageHt: string, sellingHt: string | null) {
  return calculateProjectFundingCoverage({
    clientBillingCoverageComplete: true,
    clientBillingCoverageHt,
    supplierOrders: [{ id: "order-1", sellingHt, status: "CONFIRMED" }],
  });
}

describe("Project Funding Coverage", () => {
  it.each([
    ["100000", "100000", "0.0000", "FULLY_COVERED"],
    ["70000", "100000", "-30000.0000", "FUNDING_GAP"],
    ["130000", "100000", "30000.0000", "EXCESS_BILLING_COVERAGE"],
  ] as const)(
    "derives the signed coverage and status from aggregated HT values",
    (billing, orders, expected, status) => {
      const result = coverage(billing, orders);

      expect(result.fundingCoverageHt).toBe(expected);
      expect(result.status).toBe(status);
    },
  );

  it("excludes cancelled Supplier Orders", () => {
    const result = calculateProjectFundingCoverage({
      clientBillingCoverageComplete: true,
      clientBillingCoverageHt: "100",
      supplierOrders: [
        { id: "active", sellingHt: "100", status: "CONFIRMED" },
        { id: "cancelled", sellingHt: "500", status: "CANCELLED" },
      ],
    });

    expect(result.supplierOrderSellHt).toBe("100.0000");
    expect(result.fundingCoverageHt).toBe("0.0000");
  });

  it("is incomplete when Billing FX or Supplier Order FX is missing", () => {
    expect(
      calculateProjectFundingCoverage({
        clientBillingCoverageComplete: false,
        clientBillingCoverageHt: "0",
        supplierOrders: [],
      }).fundingCoverageHt,
    ).toBeNull();
    expect(coverage("100", null)).toMatchObject({
      complete: false,
      fundingCoverageHt: null,
      missingOrderIds: ["order-1"],
    });
  });

  it("is unchanged by Client receipts and Supplier payments", () => {
    const input = {
      clientBillingCoverageComplete: true,
      clientBillingCoverageHt: "100000",
      supplierOrders: [
        { id: "order-1", sellingHt: "100000", status: "CONFIRMED" },
      ],
    };

    const beforeCash = { ...input, clientReceived: "0", supplierPaid: "0" };
    const afterCash = {
      ...input,
      clientReceived: "100000",
      supplierPaid: "100000",
    };

    expect(calculateProjectFundingCoverage(beforeCash)).toEqual(
      calculateProjectFundingCoverage(afterCash),
    );
  });
});
