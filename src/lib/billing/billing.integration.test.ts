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
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  clientReceipt: { create: vi.fn() },
  currency: { findFirst: vi.fn() },
  procurementOrder: { count: vi.fn() },
  project: { findFirst: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
  clientPaymentInstallment: { findFirst: vi.fn(), findUnique: vi.fn() },
  currency: { findFirst: vi.fn() },
  procurementOrder: { findMany: vi.fn() },
  project: { findFirst: vi.fn() },
}));
const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/events", () => audit);
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import {
  ClientBillingValidationError,
  confirmClientBillingDocument,
  recordClientReceipt,
  updateClientBillingAllocations,
  updateClientBillingDocument,
  updateClientBillingInstallment,
  updateClientBillingInline,
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
    database.clientPaymentInstallment.findUnique.mockResolvedValue({
      billingDocument: {
        project: { reportingCurrencyCode: "EUR" },
        reference: "INV-1",
      },
      currencyCode: "EUR",
      receipts: [{ amount: "20" }],
      scheduledAmount: "120",
    });
    await recordClientReceipt("actor-1", {
      amount: "30.0000",
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
        installmentId,
        receivedAt: "2026-09-02",
      }),
    ).rejects.toBeInstanceOf(ClientBillingValidationError);
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

  it("uses the same reconciliation when an Order links and removes Billing", async () => {
    transaction.clientBillingDocument.findUnique.mockResolvedValue({
      allocations: [],
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: false,
      projectId,
      reference: "INV-1",
      totalHt: new Decimal("100"),
    });
    transaction.procurementOrder.count.mockResolvedValue(1);
    await updateOrderBillingLink("actor-1", {
      allocatedAmount: "40.0000",
      basis: ClientBillingAllocationBasis.PERCENTAGE,
      billingDocumentId: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: true,
      orderId: firstOrderId,
      percentageRate: "0.400000",
      remove: false,
    });
    expect(transaction.clientBillingAllocation.createMany).toHaveBeenCalledWith(
      {
        data: [expect.objectContaining({ orderId: firstOrderId })],
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
      id: "f12b6b9b-10e9-4e42-b93f-38796de4f65a",
      isProjectRemainderApproved: true,
      projectId,
      reference: "INV-1",
      totalHt: new Decimal("100"),
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
