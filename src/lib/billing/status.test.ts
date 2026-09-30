import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  receipt: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: vi.fn() }));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("./billing", () => ({
  ClientBillingValidationError: class extends Error {},
  recordClientReceiptInTransaction: mocks.receipt,
}));
import { changeBillingStatusInTransaction } from "./status";

const id = "d12b6b9b-10e9-4e42-b93f-38796de4f65a";
const tx = {
  clientBillingDocument: {
    findUniqueOrThrow: mocks.find,
    update: mocks.update,
  },
} as unknown as Prisma.TransactionClient;

beforeEach(() => vi.clearAllMocks());

it.each([
  ["DRAFT", false],
  ["TO_BE_INVOICED", false],
  ["CANCELLED", true],
  ["INVOICED", true],
] as const)(
  "rejects full and partial cash before any writes for %s (cancelled=%s)",
  async (workflowStatus, isCancelled) => {
    mocks.find.mockResolvedValue({
      id,
      documentType: "INVOICE",
      workflowStatus,
      isCancelled,
      totalTtc: "120",
      receipts: [],
      matchedInstallment: null,
      paymentInstallments: [],
    });
    for (const value of ["PAID", "PARTIALLY_PAID"] as const) {
      await expect(
        changeBillingStatusInTransaction(tx, "actor", {
          id,
          value,
          confirmedAmount: "120",
          amount: "20",
          paymentDate: "2026-09-30",
        }),
      ).rejects.toThrow("Invoiced and save before recording a receipt");
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.receipt).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  },
);
