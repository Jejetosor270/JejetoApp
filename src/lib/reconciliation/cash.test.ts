import type { Prisma } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readReconciliationCash } from "./cash";
import { recognizedReceiptWhere } from "@/lib/billing/receipt-eligibility";

const payment = {
  id: "payment",
  amount: "100",
  settledAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  fxRateToReporting: "0.9",
  reference: "Payment reference",
  installmentId: "term",
  installment: {
    currencyCode: "USD",
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    label: "Supplier term",
    orderId: "order",
    order: {
      orderNumber: "ORDER-01",
      projectId: "project",
      supplierId: "supplier",
      status: "CANCELLED",
      trashedAt: null,
    },
  },
};
const receipt = {
  id: "receipt",
  amount: "100",
  receivedAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  fxRateToReporting: null,
  reference: null,
  billingDocumentId: "invoice",
  installmentId: null,
  billingDocument: {
    reference: "INV-01",
    currencyCode: "EUR",
    projectId: "project",
    clientId: "client",
    workflowStatus: "INVOICED",
    isCancelled: false,
  },
  installment: null,
};
const freight = {
  id: "freight-payment",
  amount: "50",
  paidAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  fxRateToReporting: null,
  reference: "Shipping",
  expenseId: "expense",
  expense: {
    reference: "FR-001",
    currencyCode: "EUR",
    projectId: "project",
    supplierId: "supplier",
    trashedAt: null,
  },
};
const refund = {
  id: "refund",
  creditId: "credit",
  amount: "20",
  refundDate: new Date("2026-10-02"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  fxRateToReporting: "0.9",
  isCancelled: false,
  reference: null,
  credit: {
    id: "credit",
    reference: "CN-1",
    side: "CLIENT",
    currencyCode: "USD",
    isCancelled: false,
    billingDocumentId: "invoice",
    orderId: null,
    billingDocument: { ...receipt.billingDocument, trashedAt: null },
    order: null,
  },
};
const queries = {
  paymentSettlement: { findMany: vi.fn() },
  clientReceipt: { findMany: vi.fn() },
  freightExpensePayment: { findMany: vi.fn() },
  financialCreditRefund: { findMany: vi.fn() },
};
const db = queries as unknown as Prisma.TransactionClient;

describe("existing-cash reconciliation adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.financialCreditRefund.findMany.mockResolvedValue([]);
    queries.paymentSettlement.findMany.mockResolvedValue([
      structuredClone(payment),
    ]);
    queries.clientReceipt.findMany.mockResolvedValue([
      structuredClone(receipt),
    ]);
    queries.freightExpensePayment.findMany.mockResolvedValue([
      structuredClone(freight),
    ]);
  });
  it("keeps positive original cash and explicit direction including freight", async () => {
    expect(await readReconciliationCash(db, {})).toMatchObject([
      {
        kind: "SUPPLIER_PAYMENT",
        id: "payment",
        amount: "100",
        currencyCode: "USD",
        direction: "SUPPLIER_PAYMENT",
        date: "2026-10-01",
        href: "/payments/payment",
      },
      {
        kind: "CLIENT_RECEIPT",
        id: "receipt",
        amount: "100",
        currencyCode: "EUR",
        direction: "CLIENT_RECEIPT",
        date: "2026-10-01",
        href: "/receipts/receipt",
      },
      {
        kind: "FREIGHT_PAYMENT",
        id: "freight-payment",
        amount: "50",
        currencyCode: "EUR",
        direction: "SUPPLIER_PAYMENT",
        date: "2026-10-01",
      },
    ]);
    expect(queries.paymentSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trashedAt: null,
          installment: { direction: "SUPPLIER_PAYMENT", trashedAt: null },
        }),
      }),
    );
    expect(queries.clientReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            recognizedReceiptWhere,
            { billingDocument: { trashedAt: null } },
          ],
        }),
      }),
    );
  });
  it("does not include legacy Client Order settlements or wrong cash direction", async () => {
    const receipts = await readReconciliationCash(db, {
      direction: "CLIENT_RECEIPT",
      currencyCode: "EUR",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
    expect(receipts.map((row) => row.kind)).toEqual(["CLIENT_RECEIPT"]);
    expect(queries.paymentSettlement.findMany).not.toHaveBeenCalled();
    expect(queries.freightExpensePayment.findMany).not.toHaveBeenCalled();
    expect(queries.clientReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          receivedAt: {
            gte: new Date("2026-10-01"),
            lte: new Date("2026-10-31"),
          },
          AND: [
            recognizedReceiptWhere,
            { billingDocument: { currencyCode: "EUR", trashedAt: null } },
          ],
        }),
      }),
    );
  });
  it("invalidates Supplier fingerprints on amount, date, FX, currency and parent assignment changes", async () => {
    const original = (
      await readReconciliationCash(db, { direction: "SUPPLIER_PAYMENT" })
    )[0]?.fingerprint;
    const changes = [
      { ...payment, amount: "99" },
      { ...payment, settledAt: new Date("2026-10-02") },
      { ...payment, fxRateToReporting: "0.91" },
      { ...payment, installmentId: "different-term" },
      {
        ...payment,
        installment: { ...payment.installment, currencyCode: "EUR" },
      },
      {
        ...payment,
        installment: {
          ...payment.installment,
          order: { ...payment.installment.order, projectId: "new-project" },
        },
      },
    ];
    for (const changed of changes) {
      queries.paymentSettlement.findMany.mockResolvedValue([changed]);
      expect(
        (await readReconciliationCash(db, { direction: "SUPPLIER_PAYMENT" }))[0]
          ?.fingerprint,
      ).not.toBe(original);
    }
  });
  it("invalidates Client fingerprints when eligibility or linkage changes", async () => {
    const original = (
      await readReconciliationCash(db, { direction: "CLIENT_RECEIPT" })
    )[0]?.fingerprint;
    for (const changed of [
      { ...receipt, amount: "90" },
      { ...receipt, receivedAt: new Date("2026-10-02") },
      { ...receipt, billingDocumentId: "other-invoice" },
      {
        ...receipt,
        billingDocument: { ...receipt.billingDocument, currencyCode: "USD" },
      },
      {
        ...receipt,
        billingDocument: {
          ...receipt.billingDocument,
          workflowStatus: "DRAFT",
        },
      },
      {
        ...receipt,
        billingDocument: {
          ...receipt.billingDocument,
          projectId: "new-project",
        },
      },
    ]) {
      queries.clientReceipt.findMany.mockResolvedValue([changed]);
      expect(
        (await readReconciliationCash(db, { direction: "CLIENT_RECEIPT" }))[0]
          ?.fingerprint,
      ).not.toBe(original);
    }
  });
  it("limits explicit IDs by cash kind and retains incomplete FX without inventing a rate", async () => {
    queries.paymentSettlement.findMany.mockResolvedValue([]);
    queries.freightExpensePayment.findMany.mockResolvedValue([]);
    const result = await readReconciliationCash(db, {
      ids: [{ kind: "CLIENT_RECEIPT", id: "receipt" }],
    });
    expect(result[0]).toMatchObject({ amount: "100", currencyCode: "EUR" });
    expect(queries.paymentSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
        where: expect.objectContaining({ id: { in: [] } }),
      }),
    );
    expect(queries.clientReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["receipt"] } }),
      }),
    );
  });
  it.each([
    ["CLIENT", "SUPPLIER_PAYMENT"],
    ["SUPPLIER", "CLIENT_RECEIPT"],
  ] as const)(
    "matches %s refunds as opposite-direction original cash",
    async (side, direction) => {
      queries.financialCreditRefund.findMany.mockResolvedValue([
        { ...refund, credit: { ...refund.credit, side } },
      ]);
      const result = await readReconciliationCash(db, {
        ids: [{ kind: "CREDIT_REFUND", id: "refund" }],
        currencyCode: "USD",
        direction,
      });
      expect(result.find((row) => row.kind === "CREDIT_REFUND")).toMatchObject({
        amount: "20",
        currencyCode: "USD",
        direction,
        date: "2026-10-02",
      });
      expect(queries.financialCreditRefund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ["refund"] },
            isCancelled: false,
            credit: expect.objectContaining({
              isCancelled: false,
              side,
              currencyCode: "USD",
            }),
          }),
        }),
      );
    },
  );
  it("invalidates refund matches after cash corrections, cancellation or source changes", async () => {
    queries.financialCreditRefund.findMany.mockResolvedValue([refund]);
    const original = (await readReconciliationCash(db, {})).find(
      (row) => row.kind === "CREDIT_REFUND",
    )?.fingerprint;
    for (const changed of [
      { ...refund, amount: "19" },
      { ...refund, refundDate: new Date("2026-10-03") },
      { ...refund, fxRateToReporting: "0.95" },
      { ...refund, isCancelled: true },
      { ...refund, credit: { ...refund.credit, isCancelled: true } },
      { ...refund, credit: { ...refund.credit, currencyCode: "EUR" } },
      {
        ...refund,
        credit: {
          ...refund.credit,
          billingDocument: {
            ...refund.credit.billingDocument,
            projectId: "new-project",
          },
        },
      },
    ]) {
      queries.financialCreditRefund.findMany.mockResolvedValue([changed]);
      expect(
        (await readReconciliationCash(db, {})).find(
          (row) => row.kind === "CREDIT_REFUND",
        )?.fingerprint,
      ).not.toBe(original);
    }
    expect(queries.financialCreditRefund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          credit: expect.objectContaining({
            OR: [
              {
                side: "CLIENT",
                billingDocument: {
                  trashedAt: null,
                  documentType: "INVOICE",
                  isCancelled: false,
                  workflowStatus: {
                    notIn: ["DRAFT", "TO_BE_INVOICED", "CANCELLED"],
                  },
                },
              },
              {
                side: "SUPPLIER",
                order: { trashedAt: null, status: { not: "CANCELLED" } },
              },
            ],
          }),
        }),
      }),
    );
  });
});
