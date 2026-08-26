import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => ({
  paymentInstallment: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  paymentSettlement: { create: vi.fn() },
}));
const database = vi.hoisted(() => ({
  currency: { findFirst: vi.fn() },
  paymentInstallment: {
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
}));
const getOrder = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/procurement/orders", () => ({ getOrder }));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: vi.fn() }));

import {
  cancelInstallment,
  createInstallment,
  recordSettlement,
  removeUnpaidInstallment,
  updateInstallment,
} from "@/lib/payments/payments";

const order = {
  costs: {
    inputVat: null,
    outputVat: { amount: "20000" },
    purchaseCost: "100000",
    purchaseFxRate: "0.86",
    sellingFxRate: null,
  },
  orderCurrencyCode: "USD",
  project: { reportingCurrencyCode: "EUR" },
  sellingCurrencyCode: "EUR",
  totalSellingRevenue: "100000",
};

describe("payment persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrder.mockResolvedValue(order);
    database.currency.findFirst.mockResolvedValue({ code: "USD" });
    transaction.paymentInstallment.findFirst.mockResolvedValue(null);
    transaction.paymentInstallment.create.mockResolvedValue({
      id: "installment-1",
    });
    transaction.paymentInstallment.update.mockResolvedValue({
      id: "installment-1",
      label: "Deposit",
    });
    transaction.paymentSettlement.create.mockResolvedValue({
      id: "settlement-1",
    });
  });

  it("derives and preserves a percentage installment amount server-side", async () => {
    await createInstallment("actor-1", {
      basis: "PERCENTAGE",
      currencyCode: "USD",
      direction: "SUPPLIER_PAYMENT",
      dueDate: "2026-09-15",
      label: "Deposit",
      orderId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      percentageRate: "0.300000",
    });
    expect(transaction.paymentInstallment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dueDate: new Date("2026-09-15T00:00:00.000Z"),
        expectedFxRateToReporting: null,
        percentageRate: "0.300000",
        scheduledAmount: "30000.0000",
        sequence: 1,
      }),
    });
  });

  it("moves the authoritative due date when an installment is edited", async () => {
    database.paymentInstallment.findUnique.mockResolvedValue({
      currencyCode: "USD",
      direction: "SUPPLIER_PAYMENT",
      orderId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      settlements: [],
    });
    await updateInstallment("actor-1", {
      basis: "FIXED_AMOUNT",
      currencyCode: "USD",
      direction: "SUPPLIER_PAYMENT",
      dueDate: "2026-09-20",
      fixedAmount: "30000",
      id: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      label: "Moved deposit",
      orderId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });
    expect(transaction.paymentInstallment.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dueDate: new Date("2026-09-20T00:00:00.000Z"),
        updatedById: "actor-1",
      }),
      where: { id: "a12b6b9b-10e9-4e42-b93f-38796de4f65a" },
    });
  });

  it("cancels installments and hard-deletes only those without settlements", async () => {
    await cancelInstallment("actor-1", "a12b6b9b-10e9-4e42-b93f-38796de4f65a");
    expect(transaction.paymentInstallment.update).toHaveBeenCalledWith({
      data: { isCancelled: true, updatedById: "actor-1" },
      select: { id: true, label: true },
      where: { id: "a12b6b9b-10e9-4e42-b93f-38796de4f65a" },
    });

    transaction.paymentInstallment.findUnique.mockResolvedValue({
      id: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      label: "Deposit",
    });
    transaction.paymentInstallment.deleteMany.mockResolvedValue({ count: 1 });
    await removeUnpaidInstallment(
      "actor-1",
      "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
    );
    expect(transaction.paymentInstallment.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
        settlements: { none: {} },
      },
    });
  });

  it("rejects a settlement that would overpay an installment", async () => {
    transaction.paymentInstallment.findUnique.mockResolvedValue({
      currencyCode: "EUR",
      id: "installment-1",
      isCancelled: false,
      order: { project: { reportingCurrencyCode: "EUR" } },
      scheduledAmount: "50000",
      settlements: [{ amount: "20000" }],
    });
    await expect(
      recordSettlement("actor-1", {
        amount: "30000.0001",
        installmentId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
        settledAt: "2026-09-15",
      }),
    ).rejects.toThrow("exceed");
    expect(transaction.paymentSettlement.create).not.toHaveBeenCalled();
  });

  it("stores actual settlement FX separately from expected FX", async () => {
    transaction.paymentInstallment.findUnique.mockResolvedValue({
      currencyCode: "USD",
      id: "installment-1",
      isCancelled: false,
      order: { project: { reportingCurrencyCode: "EUR" } },
      scheduledAmount: "50000",
      settlements: [{ amount: "20000" }],
    });
    await recordSettlement("actor-1", {
      amount: "30000.0000",
      fxRate: "0.8200000000",
      installmentId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      settledAt: "2026-09-15",
    });
    expect(transaction.paymentSettlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: "30000.0000",
        fxRateToReporting: "0.8200000000",
      }),
    });
  });
});
