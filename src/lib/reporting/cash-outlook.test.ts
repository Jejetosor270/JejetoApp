import { describe, expect, it, vi } from "vitest";
import { projectCashOutlook } from "@/domain/finance/project-cash-outlook";
import { difference } from "@/domain/finance/project-control";
import { convertPaymentAmount } from "@/domain/payments/calculations";
import {
  buildCashOutlookDocuments,
  type CashOutlookSources,
} from "./cash-outlook";

vi.mock("server-only", () => ({}));

type Order = CashOutlookSources["orders"][number];
type Billing = CashOutlookSources["billingDocuments"][number];
type Term = Billing["paymentInstallments"][number];
const dueDate = new Date("2026-10-08T00:00:00.000Z");
const order = (overrides: Partial<Order> = {}): Order => ({
  id: "order",
  orderNumber: "ORDER-1",
  status: "DRAFT",
  orderCurrencyCode: "EUR",
  costs: { purchaseFxRate: null },
  supplierPayment: { totalPayable: "100", paid: "0" },
  ...overrides,
});
const term = (overrides: Partial<Term> = {}): Term => ({
  id: "term",
  label: "Balance",
  currencyCode: "EUR",
  scheduledAmount: "100",
  dueDate,
  expectedFxRateToReporting: null,
  isCancelled: false,
  receipts: [],
  ...overrides,
});
const billing = (overrides: Partial<Billing> = {}): Billing => ({
  id: "invoice",
  reference: "INVOICE-1",
  documentType: "INVOICE",
  workflowStatus: "INVOICED",
  isCancelled: false,
  currencyCode: "EUR",
  totalTtc: "100",
  dueDate: null,
  fxRateToReporting: null,
  receipts: [],
  paymentInstallments: [],
  matchedInstallment: null,
  credits: [],
  ...overrides,
});
const sources = (
  overrides: Partial<CashOutlookSources> = {},
): CashOutlookSources => ({
  projectId: "project",
  orders: [],
  installments: [],
  billingDocuments: [],
  freightExpenses: [],
  ...overrides,
});
const outlook = (input: CashOutlookSources, actualCash: string | null = "0") =>
  projectCashOutlook(
    buildCashOutlookDocuments(input),
    "EUR",
    "2026-10-06",
    actualCash,
  );

describe("shared cash outlook source adapter", () => {
  it("includes unscheduled Orders, undated freight and unscheduled issued balances", () => {
    const result = outlook(
      sources({
        orders: [
          order({ supplierPayment: { totalPayable: "100", paid: "10" } }),
          order({ id: "cancelled", status: "CANCELLED" }),
        ],
        installments: [
          {
            id: "supplier-term",
            orderId: "order",
            currencyCode: "EUR",
            scheduledAmount: "60",
            paidAmount: "10",
            dueDate: "2026-10-08",
            expectedFxRate: null,
            isCancelled: false,
          },
        ],
        billingDocuments: [
          billing({ receipts: [{ id: "receipt", amount: "20" }] }),
        ],
        freightExpenses: [
          {
            description: "Separate freight",
            costAmountHt: "100",
            vatAmount: "20",
            vatTreatment: "DOMESTIC",
            currencyCode: "EUR",
            fxRateToReporting: null,
            dueDate: null,
            payments: [
              { id: "freight-payment", amount: "30" },
              { id: "freight-payment", amount: "30" },
            ],
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      outstandingIn: "80.0000",
      outstandingOut: "180.0000",
      undatedIn: "80.0000",
      undatedOut: "130.0000",
      unscheduledCount: 2,
      undatedCount: 3,
    });
    expect(result.windows[0]).toMatchObject({
      expectedOut: "50.0000",
      expectedIn: "0.0000",
      projectedCash: null,
    });
    expect(result.entries.at(-1)?.source?.href).toBe(
      "/projects/project?tab=freight",
    );
  });

  it("transfers matched Quote terms once and keeps unissued Client plans separate", () => {
    const receipt = { id: "receipt", amount: "20" };
    const matched = term({ receipts: [receipt] });
    const result = outlook(
      sources({
        billingDocuments: [
          billing({
            id: "quote",
            documentType: "QUOTE",
            paymentInstallments: [matched],
            receipts: [receipt],
          }),
          billing({
            matchedInstallment: matched,
            receipts: [receipt, { id: "direct-receipt", amount: "10" }],
          }),
          billing({
            id: "planned",
            workflowStatus: "TO_BE_INVOICED",
            totalTtc: "60",
            dueDate,
            paymentInstallments: [
              term({
                id: "planned-term",
                scheduledAmount: "60",
                dueDate: null,
              }),
            ],
          }),
          billing({ id: "draft", workflowStatus: "DRAFT" }),
          billing({ id: "cancelled", isCancelled: true }),
        ],
      }),
      "30",
    );
    expect(result.entries).toHaveLength(2);
    expect(result.windows[0]).toMatchObject({
      expectedIn: "70.0000",
      plannedIn: "60.0000",
      projectedCash: "100.0000",
    });
  });

  it("caps credited balances and keeps remaining refunds as undated cash obligations", () => {
    const result = outlook(
      sources({
        orders: [
          order({
            credits: { count: 1 },
            supplierPayment: {
              totalPayable: "80",
              paid: "100",
              netPaid: "90",
              refundDue: "10",
            },
          }),
        ],
        billingDocuments: [
          billing({
            receipts: [{ id: "receipt", amount: "80" }],
            credits: [
              {
                totalHt: "40",
                vatAmount: "0",
                freightCoverageHt: "0",
                otherCoverageHt: "0",
                refunds: [{ amount: "10" }],
              },
            ],
          }),
        ],
      }),
    );
    expect(result.entries).toEqual([
      {
        unscheduled: true,
        kind: "issued",
        due: null,
        amount: "10.0000",
        source: {
          label: "Supplier refund · ORDER-1",
          href: "/orders/order?tab=related#credits",
        },
      },
      {
        unscheduled: true,
        kind: "payment",
        due: null,
        amount: "10.0000",
        source: {
          label: "Client refund · INVOICE-1",
          href: "/billing/invoice?tab=related#credits",
        },
      },
    ]);
    expect(result.windows[0]?.projectedCash).toBeNull();
  });

  it("keeps term expected FX independent from document FX and recorded actual cash", () => {
    const receipt = { id: "receipt", amount: "20", fxRateToReporting: "0.6" };
    const actualReceived = convertPaymentAmount({
      amount: receipt.amount,
      currencyCode: "USD",
      reportingCurrencyCode: "EUR",
      fxRateToReporting: receipt.fxRateToReporting,
    });
    const actualPaid = convertPaymentAmount({
      amount: "20",
      currencyCode: "USD",
      reportingCurrencyCode: "EUR",
      fxRateToReporting: "0.5",
    });
    const input = sources({
      orders: [
        order({
          orderCurrencyCode: "USD",
          costs: { purchaseFxRate: "0.8" },
          supplierPayment: { totalPayable: "100", paid: "20" },
        }),
      ],
      installments: [
        {
          id: "supplier-term",
          orderId: "order",
          currencyCode: "USD",
          scheduledAmount: "100",
          paidAmount: "20",
          dueDate: "2026-10-08",
          expectedFxRate: "0.7",
          isCancelled: false,
        },
      ],
      billingDocuments: [
        billing({
          currencyCode: "USD",
          fxRateToReporting: "0.8",
          receipts: [receipt],
          paymentInstallments: [
            term({ currencyCode: "USD", expectedFxRateToReporting: "0.9" }),
          ],
        }),
      ],
    });
    const result = outlook(
      input,
      difference(
        actualReceived?.toString() ?? null,
        actualPaid?.toString() ?? null,
      ),
    );
    expect(result.windows[0]).toMatchObject({
      expectedIn: "72.0000",
      expectedOut: "56.0000",
      projectedCash: "18.0000",
    });
    const missing = outlook({
      ...input,
      billingDocuments: [
        billing({
          currencyCode: "USD",
          fxRateToReporting: "0.8",
          receipts: [receipt],
          paymentInstallments: [term({ currencyCode: "USD" })],
        }),
      ],
    });
    expect(missing).toMatchObject({ outstandingIn: null, missingFxCount: 1 });
    expect(missing.windows[0]?.projectedCash).toBeNull();
  });

  it("does not use commercial FX to invent a foreign-currency refund expectation", () => {
    const result = outlook(
      sources({
        orders: [
          order({
            orderCurrencyCode: "USD",
            costs: { purchaseFxRate: "0.8" },
            credits: { count: 1 },
            supplierPayment: {
              totalPayable: "80",
              paid: "100",
              refundDue: "20",
            },
          }),
        ],
      }),
    );
    expect(result).toMatchObject({
      outstandingIn: null,
      outstandingOut: "0.0000",
      missingFxCount: 1,
      undatedCount: 1,
    });
  });

  it("retains explicit review for matched terms in a different currency", () => {
    const result = outlook(
      sources({
        billingDocuments: [
          billing({ matchedInstallment: term({ currencyCode: "USD" }) }),
        ],
      }),
    );
    expect(result).toMatchObject({ outstandingIn: null, reviewCount: 1 });
    expect(result.entries[0]?.reviewReason).toContain("currency differs");
    expect(result.windows[0]?.projectedCash).toBeNull();
  });

  it.each([
    { isCancelled: false, paidAmount: "0" },
    { isCancelled: true, paidAmount: "20" },
  ])(
    "requires review for a Supplier term currency mismatch with %o",
    ({ isCancelled, paidAmount }) => {
      const result = outlook(
        sources({
          orders: [
            order({
              orderCurrencyCode: "USD",
              costs: { purchaseFxRate: "0.8" },
              credits: { count: 1 },
              supplierPayment: {
                totalPayable: "80",
                paid: paidAmount,
                refundDue: "20",
              },
            }),
          ],
          installments: [
            {
              id: "supplier-term",
              orderId: "order",
              currencyCode: "EUR",
              scheduledAmount: "100",
              paidAmount,
              dueDate: "2026-10-08",
              expectedFxRate: "0.9",
              isCancelled,
            },
          ],
        }),
      );
      expect(result).toMatchObject({ outstandingOut: null, reviewCount: 1 });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.reviewReason).toContain("currency differs");
      expect(result.windows[0]?.projectedCash).toBeNull();
    },
  );

  it("ignores an unpaid cancelled Supplier term in another currency", () => {
    const result = outlook(
      sources({
        orders: [order()],
        installments: [
          {
            id: "supplier-term",
            orderId: "order",
            currencyCode: "USD",
            scheduledAmount: "100",
            paidAmount: "0",
            dueDate: "2026-10-08",
            expectedFxRate: null,
            isCancelled: true,
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      outstandingOut: "100.0000",
      undatedOut: "100.0000",
      reviewCount: 0,
      unscheduledCount: 1,
    });
  });

  it("caps same-date Supplier terms by immutable ID before applying each expected FX", () => {
    const input = sources({
      orders: [
        order({
          orderCurrencyCode: "USD",
          costs: { purchaseFxRate: "0.75" },
          credits: { count: 1 },
          supplierPayment: { totalPayable: "50", paid: "0" },
        }),
      ],
      installments: [
        {
          id: "z-term",
          orderId: "order",
          currencyCode: "USD",
          scheduledAmount: "50",
          paidAmount: "0",
          dueDate: "2026-10-08",
          expectedFxRate: "0.9",
          isCancelled: false,
        },
        {
          id: "a-term",
          orderId: "order",
          currencyCode: "USD",
          scheduledAmount: "50",
          paidAmount: "0",
          dueDate: "2026-10-08",
          expectedFxRate: "0.8",
          isCancelled: false,
        },
      ],
    });
    expect(outlook(input).windows[0]?.expectedOut).toBe("40.0000");
    expect(
      outlook({ ...input, installments: input.installments.toReversed() })
        .windows[0]?.expectedOut,
    ).toBe("40.0000");
    expect(input.installments[0]?.id).toBe("z-term");
  });
});
