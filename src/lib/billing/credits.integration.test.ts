import Decimal from "decimal.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findMany: vi.fn(),
  allocations: vi.fn(),
  receiptFind: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  trash: vi.fn(),
}));
const tx = {
  clientBillingAllocation: { findMany: mocks.allocations },
  clientBillingDocument: {
    findUnique: mocks.find,
    findMany: mocks.findMany,
    update: mocks.update,
  },
  clientReceipt: {
    findUnique: mocks.receiptFind,
    create: mocks.create,
    update: mocks.update,
  },
};
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    ...tx,
    $transaction: async <T>(callback: (transaction: unknown) => Promise<T>) =>
      callback(tx),
  }),
}));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/trash/service", () => ({ trashInTransaction: mocks.trash }));
vi.mock("@/lib/procurement/orders", () => ({}));
import {
  recordClientReceipt,
  updateClientReceipt,
  deleteClientReceipt,
  getOrderBillingAllocations,
} from "./billing";
import { summarizeClientBillingRecords } from "./reporting";

const credit = {
  id: "credit",
  isCancelled: false,
  totalHt: new Decimal(10),
  vatAmount: new Decimal(2),
  freightCoverageHt: new Decimal(0),
  otherCoverageHt: new Decimal(0),
  currencyCode: "USD",
  reportingCurrencyCode: "EUR",
  fxRateToReporting: new Decimal(3),
  refunds: [
    {
      id: "refund",
      amount: new Decimal(12),
      fxRateToReporting: new Decimal(5),
      isCancelled: false,
    },
  ],
  allocations: [
    {
      orderId: "order",
      amountHt: new Decimal(10),
      freightCoverageHt: new Decimal(0),
      otherCoverageHt: new Decimal(0),
    },
  ],
};
function document() {
  return {
    id: "bill",
    projectId: "project",
    documentType: "INVOICE",
    workflowStatus: "INVOICED",
    isCancelled: false,
    currencyCode: "USD",
    totalHt: new Decimal(100),
    vatAmount: new Decimal(20),
    totalTtc: new Decimal(120),
    fxRateToReporting: new Decimal(2),
    dueDate: null,
    isProjectRemainderApproved: false,
    credits: [credit],
    receipts: [
      {
        id: "cash",
        amount: new Decimal(120),
        fxRateToReporting: new Decimal(4),
      },
    ],
    matchedInstallment: null,
    paymentInstallments: [],
    allocations: [
      {
        orderId: "order",
        allocatedAmount: new Decimal(100),
        order: { status: "CONFIRMED" },
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
});

describe("Billing credits and independent FX", () => {
  it("keeps a paid Invoice readable while a new credit awaits its refund", () => {
    const record = { ...document(), credits: [{ ...credit, refunds: [] }] };
    const result = summarizeClientBillingRecords(
      [record] as unknown as Parameters<
        typeof summarizeClientBillingRecords
      >[0],
      "EUR",
    );
    expect(result).toMatchObject({
      paidTtc: "480.0000",
      refundedTtc: "0.0000",
      netPaidTtc: "480.0000",
      outstandingTtc: "0.0000",
    });
    expect(record.receipts[0]?.amount.toString()).toBe("120");
  });
  it.each(["3", null])(
    "makes Order allocation coverage incomplete when credit FX is %s",
    async (fx) => {
      mocks.allocations.mockResolvedValue([
        {
          orderId: "order",
          allocatedAmount: new Decimal(100),
          billingDocument: {
            ...document(),
            project: { reportingCurrencyCode: "EUR" },
            credits: [
              {
                ...credit,
                fxRateToReporting: fx === null ? null : new Decimal(fx),
              },
            ],
          },
        },
      ]);
      expect(
        (await getOrderBillingAllocations(["order"])).get("order"),
      ).toEqual({
        invoiced: fx === null ? null : "170.0000",
        quoted: "0.0000",
        complete: fx !== null,
      });
    },
  );
  it("converts original invoice, credit, receipt and refund independently exactly once", () => {
    const result = summarizeClientBillingRecords(
      [document()] as unknown as Parameters<
        typeof summarizeClientBillingRecords
      >[0],
      "EUR",
    );
    expect(result).toMatchObject({
      invoicedHt: "170.0000",
      invoicedTtc: "204.0000",
      outputVat: "34.0000",
      coverageHt: "170.0000",
      outstandingTtc: "0.0000",
      paidTtc: "480.0000",
      refundedTtc: "60.0000",
      netPaidTtc: "420.0000",
    });
  });
  it("missing credit/refund FX makes reporting incomplete, never silently zero", () => {
    const record = document();
    const broken = {
      ...record,
      credits: [
        {
          ...credit,
          fxRateToReporting: null,
          refunds: [{ ...credit.refunds[0], fxRateToReporting: null }],
        },
      ],
    };
    const result = summarizeClientBillingRecords(
      [broken] as unknown as Parameters<
        typeof summarizeClientBillingRecords
      >[0],
      "EUR",
    );
    expect(result.complete).toBe(false);
    expect(result.invoicedComplete).toBe(false);
    expect(result.coverageComplete).toBe(false);
    expect(result.missingIds).toEqual(
      expect.arrayContaining(["credit", "refund"]),
    );
  });
  it("does not reuse a credit FX snapshot for a different reporting currency", () => {
    const record = {
      ...document(),
      credits: [{ ...credit, reportingCurrencyCode: "USD" }],
    };
    const result = summarizeClientBillingRecords(
      [record] as unknown as Parameters<
        typeof summarizeClientBillingRecords
      >[0],
      "EUR",
    );
    expect(result.coverageComplete).toBe(false);
    expect(result.coverageMissingIds).toEqual(["credit"]);
  });
  it("rejects a receipt above credit-adjusted remaining before any cash write", async () => {
    mocks.find.mockResolvedValue({
      ...document(),
      receipts: [],
      credits: [{ ...credit, refunds: [] }],
      project: { reportingCurrencyCode: "EUR" },
    });
    await expect(
      recordClientReceipt("actor", {
        billingDocumentId: "bill",
        installmentId: null,
        amount: "109",
        receivedAt: "2026-10-02",
        fxRate: "2",
      }),
    ).rejects.toThrow("outstanding balance");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["edit", "delete"])(
    "rejects %s of a historical Quote receipt when it would invalidate an Invoice refund",
    async (action) => {
      mocks.receiptFind.mockResolvedValue({
        id: "cash",
        billingDocumentId: "quote",
        installmentId: "matched-term",
        billingDocument: { reference: "Q-1" },
      });
      mocks.findMany.mockResolvedValue([document()]);
      const operation =
        action === "edit"
          ? updateClientReceipt("actor", {
              id: "cash",
              billingDocumentId: "quote",
              installmentId: null,
              amount: "100",
              receivedAt: "2026-10-02",
              fxRate: "2",
            })
          : deleteClientReceipt("actor", {
              id: "cash",
              billingDocumentId: "quote",
            });
      await expect(operation).rejects.toThrow("Refunds exceed");
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.trash).not.toHaveBeenCalled();
      expect(mocks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ id: "quote" }, { matchedInstallmentId: "matched-term" }],
          }),
        }),
      );
    },
  );
});
