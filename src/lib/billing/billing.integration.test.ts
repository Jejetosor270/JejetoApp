import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ClientBillingAllocationBasis,
  ClientBillingDocumentType,
  InstallmentBasis,
} from "@/generated/prisma/client";
import { clientBillingConfirmationSchema } from "@/domain/billing/validation";

const transaction = vi.hoisted(() => ({
  clientBillingAllocation: { createMany: vi.fn(), deleteMany: vi.fn() },
  clientBillingDocument: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  clientDocumentImport: { create: vi.fn() },
  clientPaymentInstallment: {
    count: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  clientReceipt: { create: vi.fn() },
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

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import {
  ClientBillingValidationError,
  confirmClientBillingDocument,
  recordClientReceipt,
  updateClientBillingInline,
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
    transaction.clientReceipt.create.mockResolvedValue({ id: "receipt-1" });
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
});
