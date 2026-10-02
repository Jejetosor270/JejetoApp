import { describe, expect, it } from "vitest";

import { isPlannedProjectBilling, projectOverview } from "./project-overview";

const input = {
  issuedHt: "160",
  orderCostHt: "100",
  orderEconomicCost: "105",
  orderSellHt: "150",
  freightCostHt: "20",
  freightEconomicCost: "22",
  clientReceivedTtc: "120",
  clientRefundedTtc: "10",
  supplierPaidTtc: "50",
  freightPaidTtc: "10",
  supplierRefundedTtc: "5",
  recordedPayableTtc: "144",
  plannedCategories: [
    { billedHt: "150", markupRate: "0.5" },
    { billedHt: "20", markupRate: "0" },
  ],
};

describe("focused Project overview", () => {
  it("separates invoiced HT cost coverage from economic profit", () => {
    const result = projectOverview(input);
    expect(result.invoiced).toEqual({
      clientHt: "160",
      costHt: "120.0000",
      balanceHt: "40.0000",
    });
    expect(result.orders).toEqual({
      costHt: "100",
      sellHt: "150",
      profitHt: "45.0000",
      markupRate: "0.428571",
      nonDeductibleVat: "5.0000",
    });
    expect(result.planned).toMatchObject({
      profitHt: "43.0000",
      markupRate: "0.338583",
      nonDeductibleVat: "7.0000",
    });
  });

  it("nets actual refunds and keeps full payable separate from paid cash", () => {
    const result = projectOverview(input);
    expect(result.cash).toEqual({
      receivedTtc: "110.0000",
      paidTtc: "55.0000",
      balanceTtc: "55.0000",
    });
    expect(result.funding).toEqual({
      receivedTtc: "110.0000",
      recordedPayableTtc: "144",
      balanceTtc: "-34.0000",
    });
    const paid = projectOverview({ ...input, supplierPaidTtc: "140" });
    expect(paid.funding).toEqual(result.funding);
    expect(paid.cash.balanceTtc).toBe("-35.0000");
  });

  it("backs cost out of category revenue instead of applying markup as margin", () => {
    expect(projectOverview(input).planned).toMatchObject({
      billingHt: "170.0000",
      orderSellHt: "150",
      coverageHt: "20.0000",
      targetProfitHt: "50.0000",
      targetMarginRate: "0.294118",
      targetMarkupRate: "0.416667",
    });
  });

  it("retains a funding gap and a loss rather than clamping negatives", () => {
    const result = projectOverview({
      ...input,
      plannedCategories: [{ billedHt: "80", markupRate: "0.2" }],
    });
    expect(result.planned.coverageHt).toBe("-70.0000");
    expect(result.planned.profitHt).toBe("-47.0000");
    expect(result.planned.markupRate).toBe("-0.370079");
  });

  it("keeps missing FX incomplete only in the affected metrics", () => {
    const result = projectOverview({
      ...input,
      orderSellHt: null,
      supplierPaidTtc: null,
      plannedCategories: [{ billedHt: null, markupRate: "0.2" }],
    });
    expect(result.invoiced.balanceHt).toBe("40.0000");
    expect(result.funding.balanceTtc).toBe("-34.0000");
    expect(result.cash.balanceTtc).toBeNull();
    expect(result.orders.profitHt).toBeNull();
    expect(result.planned).toMatchObject({
      billingHt: null,
      targetProfitHt: null,
      targetMarginRate: null,
      targetMarkupRate: null,
      coverageHt: null,
      profitHt: null,
      markupRate: null,
    });
    const unknownCost = projectOverview({ ...input, orderCostHt: null });
    expect(unknownCost.invoiced.balanceHt).toBeNull();
    expect(unknownCost.orders.nonDeductibleVat).toBeNull();
  });

  it("treats zero as known without inventing zero-denominator rates", () => {
    const result = projectOverview({
      ...input,
      orderCostHt: "0",
      orderEconomicCost: "0",
      orderSellHt: "0",
      freightEconomicCost: "0",
      plannedCategories: [{ billedHt: "0", markupRate: "0.2" }],
    });
    expect(result.orders.profitHt).toBe("0.0000");
    expect(result.orders.markupRate).toBeNull();
    expect(result.planned).toMatchObject({
      billingHt: "0.0000",
      targetProfitHt: "0.0000",
      targetMarginRate: null,
      targetMarkupRate: null,
      profitHt: "0.0000",
      markupRate: null,
    });
  });

  it("does not produce an invalid inverse-markup target", () => {
    expect(
      projectOverview({
        ...input,
        plannedCategories: [{ billedHt: "100", markupRate: "-1" }],
      }).planned.targetProfitHt,
    ).toBeNull();
  });
});

it.each([
  ["INVOICE", "INVOICED", false, true],
  ["INVOICE", "PAID", false, true],
  ["INVOICE", "PARTIALLY_PAID", false, true],
  ["INVOICE", "OVERDUE", false, true],
  ["INVOICE", "TO_BE_INVOICED", false, true],
  ["INVOICE", "DRAFT", false, false],
  ["INVOICE", "CANCELLED", false, false],
  ["INVOICE", "TO_BE_INVOICED", true, false],
  ["INVOICE", "INVOICED", true, false],
  ["QUOTE", "INVOICED", false, false],
  ["QUOTE", "TO_BE_INVOICED", false, false],
])(
  "planned Billing eligibility: %s / %s / cancelled=%s",
  (documentType, workflowStatus, isCancelled, expected) => {
    expect(
      isPlannedProjectBilling({ documentType, workflowStatus, isCancelled }),
    ).toBe(expected);
  },
);
