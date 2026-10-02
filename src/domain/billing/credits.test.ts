import { describe, expect, it } from "vitest";
import { getClientCreditPosition, netBillingAllocation } from "./credits";
import { calculateClientBillingAmounts } from "./calculations";
import { billingCashContexts } from "./cash-expectations";

const credit = {
  totalHt: "20",
  vatAmount: "4",
  freightCoverageHt: "5",
  otherCoverageHt: "0",
  refunds: [{ amount: "24", isCancelled: false }],
  allocations: [
    {
      orderId: "order",
      amountHt: "20",
      freightCoverageHt: "5",
      otherCoverageHt: "0",
    },
  ],
};
describe("Client credit read-side balances", () => {
  it("keeps gross receipt history, deduplicates matched receipts and separates actual refunds", () => {
    const receipt = { id: "receipt", amount: "120" };
    const record = {
      totalTtc: "120",
      receipts: [receipt],
      matchedInstallment: { receipts: [receipt] },
      credits: [credit],
    };
    expect(getClientCreditPosition(record)).toMatchObject({
      paidTtc: "120.0000",
      creditedTtc: "24.0000",
      refundedTtc: "24.0000",
      netDue: "96.0000",
      netPaid: "96.0000",
      refundDue: "0.0000",
      outstanding: "0.0000",
    });
    expect(record.receipts[0]?.amount).toBe("120");
    expect(record.totalTtc).toBe("120");
  });
  it("does not invent cash or mark a fully credited invoice Paid", () => {
    const position = getClientCreditPosition({
      totalTtc: "24",
      credits: [{ ...credit, refunds: [] }],
    });
    expect(position).toMatchObject({
      outstanding: "0.0000",
      netPaid: "0.0000",
      refundDue: "0.0000",
    });
    expect(
      calculateClientBillingAmounts({
        documentType: "INVOICE",
        dueDate: "2026-01-01",
        today: "2026-10-02",
        isCancelled: false,
        paidAmounts: [],
        totalTtc: "24",
        creditedTtc: "24",
      }),
    ).toMatchObject({
      status: "INVOICED",
      paid: "0.0000",
      outstanding: "0.0000",
    });
  });
  it("reduces explicit Order attribution only, leaving original allocations unchanged", () => {
    const allocation = {
      orderId: "order",
      allocatedAmount: "80",
      freightCoverageHt: "10",
      otherCoverageHt: "0",
    };
    expect(netBillingAllocation({ credits: [credit] }, allocation)).toEqual({
      allocatedAmount: "60.0000",
      freightCoverageHt: "5.0000",
      otherCoverageHt: "0.0000",
    });
    expect(
      netBillingAllocation(
        { credits: [credit] },
        { ...allocation, orderId: "other" },
      ).allocatedAmount,
    ).toBe("80.0000");
    expect(allocation.allocatedAmount).toBe("80");
  });
  it("caps cash expectations by reduced debt without rewriting stored terms", () => {
    const record = {
      id: "bill",
      currencyCode: "EUR",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      isCancelled: false,
      totalTtc: "120",
      receipts: [{ id: "cash", amount: "40" }],
      matchedInstallment: null,
      credits: [{ ...credit, refunds: [] }],
      paymentInstallments: [
        {
          id: "term",
          currencyCode: "EUR",
          dueDate: new Date("2026-10-10T00:00:00.000Z"),
          expectedFxRateToReporting: null,
          isCancelled: false,
          label: "Balance",
          scheduledAmount: "120",
          receipts: [],
        },
      ],
    };
    expect(billingCashContexts([record])[0]).toMatchObject({
      total: "96.0000",
      paid: "40.0000",
    });
    expect(record.paymentInstallments[0]?.scheduledAmount).toBe("120");
  });
  it("ignores cancelled credits/refunds and rejects orphaned refunds", () => {
    expect(
      getClientCreditPosition({
        totalTtc: "120",
        credits: [{ ...credit, isCancelled: true }],
      }).creditedTtc,
    ).toBe("0.0000");
    expect(() =>
      getClientCreditPosition({
        totalTtc: "120",
        receipts: [{ id: "cash", amount: "100" }],
        credits: [credit],
      }),
    ).toThrow("Refunds exceed");
  });
});
