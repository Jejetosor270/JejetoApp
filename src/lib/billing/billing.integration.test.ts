import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";

import {
  ClientBillingAllocationBasis,
  ClientBillingDocumentType,
  InstallmentBasis,
} from "@/generated/prisma/client";
import { clientBillingConfirmationSchema } from "@/domain/billing/validation";

const transaction = vi.hoisted(() => ({
  clientBillingAllocation: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  clientBillingDocument: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  clientDocumentImport: { create: vi.fn() },
  clientPaymentInstallment: {
    aggregate: vi.fn(),
    count: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  clientReceipt: {
    create: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  currency: { findFirst: vi.fn() },
  procurementOrder: { count: vi.fn() },
  project: { findFirst: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
  clientBillingDocument: { findMany: vi.fn() },
  clientPaymentInstallment: { findFirst: vi.fn(), findUnique: vi.fn() },
  currency: { findFirst: vi.fn() },
  procurementOrder: { findMany: vi.fn() },
  project: { findFirst: vi.fn(), findUnique: vi.fn() },
}));
const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn() }));
const procurementOrders = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getOrderInTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/events", () => audit);
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/procurement/orders", () => procurementOrders);

import {
  ClientBillingValidationError,
  confirmClientBillingDocument,
  createClientBillingInstallment,
  deleteClientBillingInstallment,
  deleteClientReceipt,
  getProjectsClientBillingSummaries,
  recordClientReceipt,
  updateClientBillingAllocations,
  updateClientBillingDocument,
  updateClientBillingInstallment,
  updateClientBillingInline,
  updateClientReceipt,
  updateOrderBillingLink,
} from "./billing";

const clientId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const projectId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";
const firstOrderId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";
const secondOrderId = "d12b6b9b-10e9-4e42-b93f-38796de4f65a";
const installmentId = "e12b6b9b-10e9-4e42-b93f-38796de4f65a";

function confirmation(overrides: Record<string, unknown> = {}) {
  return clientBillingConfirmationSchema.parse({
    action: "CREATE",
    allocations: [],
    clientId,
    currencyCode: "EUR",
    documentDate: "2026-09-01",
    documentType: ClientBillingDocumentType.INVOICE,
    duplicateWarning: false,
    installments: [],
    isCancelled: false,
    isProjectRemainderApproved: false,
    model: "mock-model",
    originalFilename: "invoice.pdf",
    projectId,
    provider: "mock",
    reference: "INV-1",
    replaceSchedule: false,
    totalHt: "100",
    totalTtc: "120",
    vatAmount: "20",
    ...overrides,
  });
}

function summaryRecord(input: {
  allocations?: readonly string[];
  documentType?: ClientBillingDocumentType;
  dueDate?: string | null;
  id: string;
  installments?: readonly {
    dueDate: string;
    receiptAmounts?: readonly string[];
    scheduledAmount: string;
  }[];
  isProjectRemainderApproved?: boolean;
  totalHt: string;
  totalTtc: string;
  vatAmount?: string;
}) {
  const paymentInstallments = (input.installments ?? []).map(
    (installment, installmentIndex) => ({
      currencyCode: "EUR",
      dueDate: new Date(`${installment.dueDate}T00:00:00.000Z`),
      expectedFxRateToReporting: null,
      id: `${input.id}-installment-${installmentIndex}`,
      isCancelled: false,
      receipts: (installment.receiptAmounts ?? []).map(
        (amount, receiptIndex) => ({
          amount: new Decimal(amount),
          billingDocumentId: input.id,
          fxRateToReporting: null,
          id: `${input.id}-receipt-${installmentIndex}-${receiptIndex}`,
          installmentId: `${input.id}-installment-${installmentIndex}`,
        }),
      ),
      scheduledAmount: new Decimal(installment.scheduledAmount),
    }),
  );
  return {
    allocations: (input.allocations ?? []).map((amount, index) => ({
      allocatedAmount: new Decimal(amount),
      id: `${input.id}-allocation-${index}`,
      order: { status: "CONFIRMED" },
    })),
    currencyCode: "EUR",
    documentType: input.documentType ?? ClientBillingDocumentType.INVOICE,
    dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
    fxRateToReporting: null,
    id: input.id,
    isCancelled: false,
    isProjectRemainderApproved: input.isProjectRemainderApproved ?? false,
    matchedInstallment: null,
    paymentInstallments,
    projectId,
    receipts: paymentInstallments.flatMap(
      (installment) => installment.receipts,
    ),
    totalHt: new Decimal(input.totalHt),
    totalTtc: new Decimal(input.totalTtc),
    vatAmount: new Decimal(
      input.vatAmount ?? new Decimal(input.totalTtc).minus(input.totalHt),
    ),
  };
}

describe("Client billing persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.project.findFirst.mockResolvedValue({
      id: projectId,
      reportingCurrencyCode: "EUR",
    });
    database.currency.findFirst.mockResolvedValue({ code: "EUR" });
    database.procurementOrder.findMany.mockResolvedValue([]);
    database.clientPaymentInstallment.findFirst.mockResolvedValue(null);
    transaction.clientBillingDocument.create.mockResolvedValue({
      id: "document-1",
    });
    transaction.clientBillingDocument.findUnique.mockResolvedValue(null);
    transaction.clientPaymentInstallment.count.mockResolvedValue(0);
    transaction.clientPaymentInstallment.aggregate.mockResolvedValue({
      _sum: { scheduledAmount: new Decimal(0) },
    });
    transaction.clientReceipt.create.mockResolvedValue({ id: "receipt-1" });
    transaction.currency.findFirst.mockResolvedValue({ code: "EUR" });
    transaction.procurementOrder.count.mockResolvedValue(0);
    transaction.project.findFirst.mockResolvedValue({
      id: projectId,
      reportingCurrencyCode: "EUR",
    });
    procurementOrders.getOrderInTransaction.mockResolvedValue({
      costs: { reportingSellingRevenue: "80000" },
      project: { id: projectId, reportingCurrencyCode: "EUR" },
    });
  });

  it("shows Villa Apsaras as fully collected from its Invoice and Receipt", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([
      summaryRecord({
        dueDate: "2026-09-02",
        id: "invoice-1",
        installments: [
          {
            dueDate: "2026-09-02",
            receiptAmounts: ["30000", "20000", "34363.86"],
            scheduledAmount: "84363.86",
          },
        ],
        totalHt: "70303.22",
        totalTtc: "84363.86",
      }),
      summaryRecord({
        documentType: ClientBillingDocumentType.QUOTE,
        id: "quote-1",
        totalHt: "100000",
        totalTtc: "120000",
      }),
    ]);

    const summaries = await getProjectsClientBillingSummaries([
      { id: projectId, reportingCurrencyCode: "EUR" },
    ]);

    expect(summaries.get(projectId)).toMatchObject({
      complete: true,
      invoicedComplete: true,
      invoicedHt: "70303.2200",
      invoicedTtc: "84363.8600",
      nextDueDate: null,
      outstandingTtc: "0.0000",
      overdueTtc: "0.0000",
      outputVat: "14060.6400",
      outputVatComplete: true,
      paidTtc: "84363.8600",
      quotedHt: "100000.0000",
      scheduleComplete: true,
      upcomingScheduledTtc: "0.0000",
    });
  });

  it("uses active Invoice VAT only and keeps Quotes out of Project output VAT", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([
      summaryRecord({
        id: "invoice-1",
        totalHt: "40000",
        totalTtc: "48000",
        vatAmount: "8000",
      }),
      summaryRecord({
        id: "invoice-2",
        totalHt: "30000",
        totalTtc: "31500",
        vatAmount: "1500",
      }),
      summaryRecord({
        documentType: ClientBillingDocumentType.QUOTE,
        id: "quote-1",
        totalHt: "100000",
        totalTtc: "120000",
        vatAmount: "20000",
      }),
    ]);

    const summaries = await getProjectsClientBillingSummaries([
      { id: projectId, reportingCurrencyCode: "EUR" },
    ]);

    expect(summaries.get(projectId)).toMatchObject({
      invoicedHt: "70000.0000",
      outputVat: "9500.0000",
      outputVatComplete: true,
      quotedHt: "100000.0000",
    });
  });

  it("counts Invoice allocations plus an approved Project remainder exactly once", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([
      summaryRecord({
        allocations: ["80000", "60000"],
        id: "allocated-invoice",
        totalHt: "200000",
        totalTtc: "240000",
      }),
      summaryRecord({
        allocations: ["25000"],
        id: "project-funded-invoice",
        isProjectRemainderApproved: true,
        totalHt: "100000",
        totalTtc: "120000",
      }),
      summaryRecord({
        allocations: ["500000"],
        documentType: ClientBillingDocumentType.QUOTE,
        id: "quote",
        isProjectRemainderApproved: true,
        totalHt: "500000",
        totalTtc: "600000",
      }),
    ]);

    const summaries = await getProjectsClientBillingSummaries([
      { id: projectId, reportingCurrencyCode: "EUR" },
    ]);

    expect(summaries.get(projectId)).toMatchObject({
      coverageComplete: true,
      coverageHt: "240000.0000",
      coverageMissingIds: [],
    });
  });

  it("excludes allocations attached to cancelled Supplier Orders", async () => {
    const record = summaryRecord({
      allocations: ["40", "20"],
      id: "invoice",
      isProjectRemainderApproved: true,
      totalHt: "100",
      totalTtc: "120",
    });
    const cancelledAllocation = record.allocations[1];
    if (!cancelledAllocation) throw new Error("Fixture allocation is missing.");
    cancelledAllocation.order.status = "CANCELLED";
    database.clientBillingDocument.findMany.mockResolvedValue([record]);

    const summaries = await getProjectsClientBillingSummaries([
      { id: projectId, reportingCurrencyCode: "EUR" },
    ]);

    // Active allocation 40 + authoritative remaining 40; cancelled 20 is not
    // reclassified as Project remainder.
    expect(summaries.get(projectId)?.coverageHt).toBe("80.0000");
  });

  it("marks non-zero foreign Invoice coverage incomplete without saved FX", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([
      {
        ...summaryRecord({
          allocations: ["100"],
          id: "foreign-invoice",
          totalHt: "100",
          totalTtc: "120",
        }),
        currencyCode: "USD",
      },
    ]);

    const summaries = await getProjectsClientBillingSummaries([
      { id: projectId, reportingCurrencyCode: "EUR" },
    ]);

    expect(summaries.get(projectId)).toMatchObject({
      coverageComplete: false,
      coverageHt: "0.0000",
      coverageMissingIds: ["foreign-invoice"],
    });
  });

  it("tracks Invoice FX completeness independently from Quotes and receipts", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([
      {
        ...summaryRecord({
          documentType: ClientBillingDocumentType.QUOTE,
          id: "foreign-quote",
          totalHt: "100",
          totalTtc: "120",
        }),
        currencyCode: "USD",
      },
      summaryRecord({
        id: "invoice-1",
        totalHt: "100",
        totalTtc: "120",
        vatAmount: "20",
      }),
    ]);

    const summaries = await getProjectsClientBillingSummaries([
      { id: projectId, reportingCurrencyCode: "EUR" },
    ]);

    expect(summaries.get(projectId)).toMatchObject({
      complete: false,
      invoicedComplete: true,
      invoicedHt: "100.0000",
      outputVat: "20.0000",
      outputVatComplete: true,
    });
  });

  it("derives unpaid and partially collected Invoice balances and timing", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([
      summaryRecord({
        dueDate: "2099-10-15",
        id: "invoice-1",
        installments: [
          {
            dueDate: "2099-09-15",
            receiptAmounts: ["30000"],
            scheduledAmount: "30000",
          },
          { dueDate: "2099-10-15", scheduledAmount: "70000" },
        ],
        totalHt: "83333.33",
        totalTtc: "100000",
      }),
      summaryRecord({
        dueDate: "2099-12-01",
        id: "invoice-2",
        totalHt: "100000",
        totalTtc: "100000",
      }),
    ]);

    const summaries = await getProjectsClientBillingSummaries([
      { id: projectId, reportingCurrencyCode: "EUR" },
    ]);

    expect(summaries.get(projectId)).toMatchObject({
      invoicedTtc: "200000.0000",
      nextDueDate: "2099-10-15",
      outstandingTtc: "170000.0000",
      paidTtc: "30000.0000",
      upcomingScheduledTtc: "70000.0000",
    });
  });

  it("aggregates multiple fully paid Invoices without using legacy Order schedules", async () => {
    database.clientBillingDocument.findMany.mockResolvedValue([
      summaryRecord({
        id: "invoice-a",
        installments: [
          {
            dueDate: "2099-09-15",
            receiptAmounts: ["60000"],
            scheduledAmount: "60000",
          },
        ],
        totalHt: "50000",
        totalTtc: "60000",
      }),
      summaryRecord({
        id: "invoice-b",
        installments: [
          {
            dueDate: "2099-10-15",
            receiptAmounts: ["40000"],
            scheduledAmount: "40000",
          },
        ],
        totalHt: "33333.33",
        totalTtc: "40000",
      }),
    ]);

    const summaries = await getProjectsClientBillingSummaries([
      { id: projectId, reportingCurrencyCode: "EUR" },
    ]);

    expect(summaries.get(projectId)).toMatchObject({
      invoicedTtc: "100000.0000",
      outstandingTtc: "0.0000",
      paidTtc: "100000.0000",
      upcomingScheduledTtc: "0.0000",
    });
  });

  it("creates a Quote schedule from approved TTC terms", async () => {
    await confirmClientBillingDocument(
      "actor-1",
      confirmation({
        documentType: ClientBillingDocumentType.QUOTE,
        installments: [
          {
            basis: InstallmentBasis.PERCENTAGE,
            dueDate: "2026-09-30",
            label: "Deposit",
            percentageRate: "0.25",
          },
        ],
        reference: "Q-1",
      }),
    );

    expect(
      transaction.clientPaymentInstallment.createMany,
    ).toHaveBeenCalledWith({
      data: [expect.objectContaining({ scheduledAmount: "30.0000" })],
    });
  });

  it("links an Invoice to the explicitly selected schedule without duplicating it", async () => {
    database.procurementOrder.findMany.mockResolvedValue([
      { id: firstOrderId },
      { id: secondOrderId },
    ]);
    database.clientPaymentInstallment.findFirst.mockResolvedValue({
      id: installmentId,
    });
    await confirmClientBillingDocument(
      "actor-1",
      confirmation({
        allocations: [
          {
            allocatedAmount: "60",
            basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
            orderId: firstOrderId,
          },
          {
            allocatedAmount: "40",
            basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
            orderId: secondOrderId,
          },
        ],
        installments: [
          {
            basis: InstallmentBasis.FIXED_AMOUNT,
            dueDate: "2026-09-30",
            fixedAmount: "120",
            label: "Extracted term",
          },
        ],
        matchedInstallmentId: installmentId,
      }),
    );

    expect(transaction.clientBillingDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchedInstallmentId: installmentId }),
      }),
    );
    expect(
      transaction.clientPaymentInstallment.createMany,
    ).not.toHaveBeenCalled();
    expect(transaction.clientBillingAllocation.createMany).toHaveBeenCalledWith(
      {
        data: expect.arrayContaining([
          expect.objectContaining({ orderId: firstOrderId }),
          expect.objectContaining({ orderId: secondOrderId }),
        ]),
      },
    );
  });

  it("rejects over-allocation and requires approval for a Project remainder", async () => {
    database.procurementOrder.findMany.mockResolvedValue([
      { id: firstOrderId },
    ]);
    await expect(
      confirmClientBillingDocument(
        "actor-1",
        confirmation({
          allocations: [
            {
              allocatedAmount: "101",
              basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
              orderId: firstOrderId,
            },
          ],
        }),
      ),
    ).rejects.toThrow("cannot exceed");
    await expect(
      confirmClientBillingDocument(
        "actor-1",
        confirmation({
          allocations: [
            {
              allocatedAmount: "60",
              basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
              orderId: firstOrderId,
            },
          ],
        }),
      ),
    ).rejects.toThrow("unallocated remainder");
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a new payment schedule above the document TTC", async () => {
    await expect(
      confirmClientBillingDocument(
        "actor-1",
        confirmation({
          installments: [
            {
              basis: InstallmentBasis.FIXED_AMOUNT,
              dueDate: "2026-09-30",
              fixedAmount: "121",
              label: "Over scheduled",
            },
          ],
        }),
      ),
    ).rejects.toThrow("cannot exceed");
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("records partial receipts and rejects overpayment", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      currencyCode: "EUR",
      matchedInstallment: null,
      project: { reportingCurrencyCode: "EUR" },
      receipts: [{ amount: "20" }],
      reference: "INV-1",
      totalTtc: "120",
    });
    transaction.clientPaymentInstallment.findUnique.mockResolvedValue({
      billingDocumentId: projectId,
      receipts: [{ amount: "20" }],
      scheduledAmount: "120",
    });
    await recordClientReceipt("actor-1", {
      amount: "30.0000",
      billingDocumentId: projectId,
      installmentId,
      receivedAt: "2026-09-02",
    });
    expect(transaction.clientReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: "30.0000" }),
      }),
    );
    await expect(
      recordClientReceipt("actor-1", {
        amount: "101.0000",
        billingDocumentId: projectId,
        installmentId,
        receivedAt: "2026-09-02",
      }),
    ).rejects.toBeInstanceOf(ClientBillingValidationError);
  });

  it("records a Billing-level receipt without installment attribution", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      currencyCode: "EUR",
      matchedInstallment: null,
      project: { reportingCurrencyCode: "EUR" },
      receipts: [],
      reference: "INV-1",
      totalTtc: "100000",
    });
    await recordClientReceipt("actor-1", {
      amount: "100000.0000",
      billingDocumentId: projectId,
      installmentId: null,
      receivedAt: "2026-09-03",
    });
    expect(transaction.clientReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billingDocumentId: projectId,
          installmentId: null,
        }),
      }),
    );
  });

  it("updates a receipt in place without creating a duplicate", async () => {
    const receiptId = "f12b6b9b-10e9-4e42-b93f-38796de4f65a";
    transaction.clientReceipt.findUnique.mockResolvedValue({
      billingDocumentId: projectId,
      installmentId,
    });
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      currencyCode: "EUR",
      matchedInstallment: null,
      project: { reportingCurrencyCode: "EUR" },
      receipts: [{ amount: new Decimal("30000"), id: receiptId }],
      reference: "INV-1",
      totalTtc: new Decimal("100000"),
    });
    transaction.clientPaymentInstallment.findUnique.mockResolvedValue({
      billingDocumentId: projectId,
      receipts: [{ amount: new Decimal("30000"), id: receiptId }],
      scheduledAmount: new Decimal("100000"),
    });
    transaction.clientReceipt.update.mockResolvedValue({
      amount: new Decimal("40000"),
      fxRateToReporting: null,
      installmentId,
      notes: "Revised",
      receivedAt: new Date("2026-09-04T00:00:00.000Z"),
      reference: "BANK-2",
    });

    const result = await updateClientReceipt("actor-1", {
      amount: "40000.0000",
      billingDocumentId: projectId,
      id: receiptId,
      installmentId,
      notes: "Revised",
      receivedAt: "2026-09-04",
      reference: "BANK-2",
    });

    expect(result.amount).toBe("40000");
    expect(transaction.clientReceipt.update).toHaveBeenCalledOnce();
    expect(transaction.clientReceipt.create).not.toHaveBeenCalled();
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      transaction,
      "actor-1",
      expect.objectContaining({
        action: "UPDATED",
        entityType: "CLIENT_RECEIPT",
      }),
    );
  });

  it("removes the selected receipt with an immutable audit snapshot", async () => {
    transaction.clientReceipt.findUnique.mockResolvedValue({
      amount: new Decimal("20000"),
      billingDocument: { reference: "INV-1" },
      billingDocumentId: projectId,
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      installmentId: null,
      receivedAt: new Date("2026-09-03T00:00:00.000Z"),
    });

    await deleteClientReceipt("actor-1", {
      billingDocumentId: projectId,
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });

    expect(transaction.clientReceipt.delete).toHaveBeenCalledWith({
      where: { id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a" },
    });
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      transaction,
      "actor-1",
      expect.objectContaining({
        action: "DELETED",
        entityType: "CLIENT_RECEIPT",
      }),
    );
  });

  it("rejects installment attribution across Billing Events", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      currencyCode: "EUR",
      matchedInstallment: null,
      project: { reportingCurrencyCode: "EUR" },
      receipts: [],
      reference: "INV-1",
      totalTtc: "100000",
    });
    transaction.clientPaymentInstallment.findUnique.mockResolvedValue({
      billingDocumentId: "another-document",
      receipts: [],
      scheduledAmount: "100000",
    });
    await expect(
      recordClientReceipt("actor-1", {
        amount: "100.0000",
        billingDocumentId: projectId,
        installmentId,
        receivedAt: "2026-09-03",
      }),
    ).rejects.toThrow("another Billing Event");
    expect(transaction.clientReceipt.create).not.toHaveBeenCalled();
  });

  it("updates an existing Client Billing installment in both directions without creating a duplicate", async () => {
    transaction.clientPaymentInstallment.findUnique.mockResolvedValue({
      billingDocument: {
        id: "document-1",
        reference: "INV-1",
        totalTtc: new Decimal("100000"),
      },
      billingDocumentId: "document-1",
      id: installmentId,
      matchedInvoices: [],
      receipts: [],
    });
    transaction.clientPaymentInstallment.update
      .mockResolvedValueOnce({
        basis: InstallmentBasis.PERCENTAGE,
        dueDate: new Date("2026-09-30T00:00:00.000Z"),
        label: "Deposit",
        notes: null,
        percentageRate: new Decimal("0.35"),
        scheduledAmount: new Decimal("35000"),
      })
      .mockResolvedValueOnce({
        basis: InstallmentBasis.FIXED_AMOUNT,
        dueDate: new Date("2026-09-30T00:00:00.000Z"),
        label: "Deposit",
        notes: "Revised",
        percentageRate: null,
        scheduledAmount: new Decimal("40000"),
      });

    const percentageResult = await updateClientBillingInstallment("actor-1", {
      basis: InstallmentBasis.PERCENTAGE,
      billingDocumentId: "document-1",
      dueDate: "2026-09-30",
      id: installmentId,
      label: "Deposit",
      percentageRate: "0.350000",
      scheduledAmount: "35000.0000",
    });
    const amountResult = await updateClientBillingInstallment("actor-1", {
      basis: InstallmentBasis.FIXED_AMOUNT,
      billingDocumentId: "document-1",
      dueDate: "2026-09-30",
      id: installmentId,
      label: "Deposit",
      notes: "Revised",
      scheduledAmount: "40000.0000",
    });

    expect(percentageResult.scheduledAmount).toBe("35000");
    expect(amountResult.scheduledAmount).toBe("40000");
    expect(transaction.clientPaymentInstallment.update).toHaveBeenCalledTimes(
      2,
    );
    expect(
      transaction.clientPaymentInstallment.createMany,
    ).not.toHaveBeenCalled();
    expect(audit.writeAuditEvent).toHaveBeenCalledTimes(2);
  });

  it("adds and safely removes a post-creation Billing installment", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      currencyCode: "EUR",
      fxRateToReporting: null,
      id: projectId,
      paymentInstallments: [
        { scheduledAmount: new Decimal("40"), sequence: 1 },
      ],
      reference: "INV-1",
      totalTtc: new Decimal("100"),
    });
    transaction.clientPaymentInstallment.create.mockResolvedValue({
      id: installmentId,
      label: "Balance",
    });
    await createClientBillingInstallment("actor-1", {
      basis: InstallmentBasis.FIXED_AMOUNT,
      billingDocumentId: projectId,
      dueDate: "2026-10-01",
      label: "Balance",
      scheduledAmount: "60.0000",
    });
    expect(transaction.clientPaymentInstallment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billingDocumentId: projectId,
          scheduledAmount: "60.0000",
          sequence: 2,
        }),
      }),
    );

    transaction.clientPaymentInstallment.findUnique.mockResolvedValue({
      billingDocument: { reference: "INV-1" },
      billingDocumentId: projectId,
      id: installmentId,
      label: "Balance",
      matchedInvoices: [],
      receipts: [],
    });
    await deleteClientBillingInstallment("actor-1", {
      billingDocumentId: projectId,
      id: installmentId,
    });
    expect(transaction.clientPaymentInstallment.delete).toHaveBeenCalledWith({
      where: { id: installmentId },
    });
  });

  it("supports repeatedly adding three installments up to Billing TTC", async () => {
    transaction.clientBillingDocument.findUnique
      .mockResolvedValueOnce({
        currencyCode: "EUR",
        fxRateToReporting: null,
        id: projectId,
        paymentInstallments: [],
        reference: "INV-1",
        totalTtc: new Decimal("100000"),
      })
      .mockResolvedValueOnce({
        currencyCode: "EUR",
        fxRateToReporting: null,
        id: projectId,
        paymentInstallments: [
          { scheduledAmount: new Decimal("30000"), sequence: 1 },
        ],
        reference: "INV-1",
        totalTtc: new Decimal("100000"),
      })
      .mockResolvedValueOnce({
        currencyCode: "EUR",
        fxRateToReporting: null,
        id: projectId,
        paymentInstallments: [
          { scheduledAmount: new Decimal("30000"), sequence: 1 },
          { scheduledAmount: new Decimal("20000"), sequence: 2 },
        ],
        reference: "INV-1",
        totalTtc: new Decimal("100000"),
      });
    transaction.clientPaymentInstallment.create.mockResolvedValue({
      id: installmentId,
      label: "Installment",
    });

    for (const [index, scheduledAmount] of [
      "30000",
      "20000",
      "50000",
    ].entries()) {
      await createClientBillingInstallment("actor-1", {
        basis: InstallmentBasis.FIXED_AMOUNT,
        billingDocumentId: projectId,
        dueDate: `2026-${10 + index}-01`,
        label: `Installment ${index + 1}`,
        scheduledAmount,
      });
    }

    expect(transaction.clientPaymentInstallment.create).toHaveBeenCalledTimes(
      3,
    );
    expect(
      transaction.clientPaymentInstallment.create.mock.calls.map(
        ([call]) => call.data.scheduledAmount,
      ),
    ).toEqual(["30000.0000", "20000.0000", "50000.0000"]);
  });

  it("rejects removing an installment with an attributed receipt", async () => {
    transaction.clientPaymentInstallment.findUnique.mockResolvedValue({
      billingDocument: { reference: "INV-1" },
      billingDocumentId: projectId,
      id: installmentId,
      label: "Deposit",
      matchedInvoices: [],
      receipts: [{ id: "receipt-1" }],
    });

    await expect(
      deleteClientBillingInstallment("actor-1", {
        billingDocumentId: projectId,
        id: installmentId,
      }),
    ).rejects.toThrow("attributed receipts");
    expect(transaction.clientPaymentInstallment.delete).not.toHaveBeenCalled();
  });

  it("rejects reducing a Client Billing installment below receipts without an audit write", async () => {
    transaction.clientPaymentInstallment.findUnique.mockResolvedValue({
      billingDocument: {
        id: "document-1",
        reference: "INV-1",
        totalTtc: new Decimal("100000"),
      },
      billingDocumentId: "document-1",
      id: installmentId,
      matchedInvoices: [],
      receipts: [{ amount: new Decimal("20000") }],
    });

    await expect(
      updateClientBillingInstallment("actor-1", {
        basis: InstallmentBasis.FIXED_AMOUNT,
        billingDocumentId: "document-1",
        dueDate: "2026-09-30",
        id: installmentId,
        label: "Deposit",
        scheduledAmount: "15000.0000",
      }),
    ).rejects.toThrow("below the amount already received");
    expect(transaction.clientPaymentInstallment.update).not.toHaveBeenCalled();
    expect(audit.writeAuditEvent).not.toHaveBeenCalled();
  });

  it("does not cancel a billing document that already has receipts", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      _count: { receipts: 0 },
      isCancelled: false,
      matchedInstallment: null,
      paymentInstallments: [{ _count: { receipts: 1 } }],
    });
    await expect(
      updateClientBillingInline("actor-1", {
        id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
        isCancelled: true,
        reference: "INV-1",
      }),
    ).rejects.toThrow("recorded Client receipts");
    expect(transaction.clientBillingDocument.update).not.toHaveBeenCalled();
  });

  it("adds, changes, and removes post-creation allocations in one authoritative reconciliation", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      allocations: [
        {
          allocatedAmount: new Decimal("60"),
          basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
          id: "allocation-a",
          orderId: firstOrderId,
          percentageRate: null,
        },
        {
          allocatedAmount: new Decimal("20"),
          basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
          id: "allocation-b",
          orderId: secondOrderId,
          percentageRate: null,
        },
      ],
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: false,
      projectId,
      reference: "INV-1",
      totalHt: new Decimal("100"),
    });
    transaction.procurementOrder.count.mockResolvedValue(2);
    const thirdOrderId = "a22b6b9b-10e9-4e42-b93f-38796de4f65a";

    await updateClientBillingAllocations("actor-1", {
      allocations: [
        {
          allocatedAmount: "30.0000",
          basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
          orderId: secondOrderId,
        },
        {
          allocatedAmount: "20.0000",
          basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
          orderId: thirdOrderId,
        },
      ],
      billingDocumentId: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: true,
    });

    expect(transaction.clientBillingAllocation.deleteMany).toHaveBeenCalledWith(
      { where: { id: { in: ["allocation-a"] } } },
    );
    expect(transaction.clientBillingAllocation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "allocation-b" } }),
    );
    expect(transaction.clientBillingAllocation.createMany).toHaveBeenCalledWith(
      {
        data: [expect.objectContaining({ orderId: thirdOrderId })],
      },
    );
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      transaction,
      "actor-1",
      expect.objectContaining({
        entityType: "BILLING_DOCUMENT",
        metadata: expect.objectContaining({
          allocationAddedOrderIds: [thirdOrderId],
          allocationChangedOrderIds: [secondOrderId],
          allocationRemovedOrderIds: [firstOrderId],
        }),
      }),
    );
  });

  it("uses Order Sell HT for an Order-side percentage and persists one amount truth", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      allocations: [],
      currencyCode: "EUR",
      fxRateToReporting: null,
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: false,
      projectId,
      reference: "INV-1",
      totalHt: new Decimal("200000"),
    });
    transaction.procurementOrder.count.mockResolvedValue(1);
    await updateOrderBillingLink("actor-1", {
      allocatedAmount: "0.0000",
      basis: ClientBillingAllocationBasis.PERCENTAGE,
      billingDocumentId: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: true,
      orderId: firstOrderId,
      percentageRate: "1.000000",
      remove: false,
    });
    expect(transaction.clientBillingAllocation.createMany).toHaveBeenCalledWith(
      {
        data: [
          expect.objectContaining({
            allocatedAmount: "80000.0000",
            basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
            orderId: firstOrderId,
            percentageRate: null,
          }),
        ],
      },
    );

    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      allocations: [
        {
          allocatedAmount: new Decimal("40"),
          basis: ClientBillingAllocationBasis.PERCENTAGE,
          id: "allocation-a",
          orderId: firstOrderId,
          percentageRate: new Decimal("0.4"),
        },
      ],
      currencyCode: "EUR",
      fxRateToReporting: null,
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: true,
      projectId,
      reference: "INV-1",
      totalHt: new Decimal("200000"),
    });
    transaction.procurementOrder.count.mockResolvedValue(0);
    await updateOrderBillingLink("actor-1", {
      billingDocumentId: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: true,
      orderId: firstOrderId,
      remove: true,
    });
    expect(transaction.clientBillingAllocation.deleteMany).toHaveBeenCalledWith(
      { where: { id: { in: ["allocation-a"] } } },
    );
  });

  it("rejects an Order-side percentage above remaining Billing capacity", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      allocations: [
        {
          allocatedAmount: new Decimal("30000"),
          basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
          id: "allocation-other",
          orderId: secondOrderId,
          percentageRate: null,
        },
      ],
      currencyCode: "EUR",
      fxRateToReporting: null,
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isCancelled: false,
      isProjectRemainderApproved: true,
      projectId,
      reference: "INV-1",
      totalHt: new Decimal("50000"),
    });

    await expect(
      updateOrderBillingLink("actor-1", {
        basis: ClientBillingAllocationBasis.PERCENTAGE,
        billingDocumentId: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
        isProjectRemainderApproved: true,
        orderId: firstOrderId,
        percentageRate: "1.000000",
        remove: false,
      }),
    ).rejects.toThrow("remaining Billing Event amount");
    expect(
      transaction.clientBillingAllocation.createMany,
    ).not.toHaveBeenCalled();
    expect(audit.writeAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects cross-Project allocations and unsafe Billing Project changes", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValueOnce({
      allocations: [],
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: false,
      projectId,
      reference: "INV-1",
      totalHt: new Decimal("100"),
    });
    transaction.procurementOrder.count.mockResolvedValue(0);
    await expect(
      updateClientBillingAllocations("actor-1", {
        allocations: [
          {
            allocatedAmount: "100.0000",
            basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
            orderId: firstOrderId,
          },
        ],
        billingDocumentId: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
        isProjectRemainderApproved: false,
      }),
    ).rejects.toThrow("Billing Event Project");

    transaction.clientBillingDocument.findUnique.mockResolvedValueOnce({
      allocations: [{ orderId: firstOrderId }],
      clientId,
      currencyCode: "EUR",
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isCancelled: false,
      isProjectRemainderApproved: false,
      matchedInstallment: null,
      matchedInstallmentId: null,
      paymentInstallments: [],
      projectId,
      reference: "INV-1",
    });
    await expect(
      updateClientBillingDocument("actor-1", {
        allocations: [],
        clientId,
        currencyCode: "EUR",
        documentDate: "2026-09-01",
        documentType: ClientBillingDocumentType.INVOICE,
        id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
        isCancelled: false,
        isProjectRemainderApproved: true,
        projectId: "a32b6b9b-10e9-4e42-b93f-38796de4f65a",
        reference: "INV-1",
        totalHt: "100.0000",
        totalTtc: "120.0000",
        vatAmount: "20.0000",
      }),
    ).rejects.toThrow("Reconcile Order allocations");
  });
});
