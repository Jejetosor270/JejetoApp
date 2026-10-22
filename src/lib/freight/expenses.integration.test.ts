vi.mock("@/lib/billing/freight-reporting", () => ({
  getBilledFreight: vi.fn(async () => ({
    invoicedFreightHt: "0.0000",
    quotedFreightHt: "0.0000",
  })),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  currency: {
    findFirst: vi.fn((...args: unknown[]) =>
      database.currency.findFirst(...args),
    ),
  },
  supplier: {
    findUnique: vi.fn((...args: unknown[]) =>
      database.supplier.findUnique(...args),
    ),
  },
  projectFreightExpense: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn((...args: unknown[]) =>
      database.projectFreightExpense.findUnique(...args),
    ),
  },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
  currency: { findFirst: vi.fn() },
  project: { findUnique: vi.fn() },
  projectFreightExpense: { findMany: vi.fn(), findUnique: vi.fn() },
  supplier: { findUnique: vi.fn() },
}));
const orders = vi.hoisted(() => ({ listProjectOrders: vi.fn() }));
const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/procurement/orders", () => orders);
vi.mock("@/lib/audit/events", () => audit);

import {
  projectFreightExpenseSchema,
  updateProjectFreightExpenseSchema,
} from "@/domain/freight/validation";
import {
  createProjectFreightExpense,
  getProjectFreightReconciliation,
  updateProjectFreightExpense,
} from "./expenses";
import { Prisma } from "@/generated/prisma/client";
import { freightExpenseEditVersion } from "./expense-edit-version";

const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const actorId = "c12b6b9b-10e9-4e42-b93f-38796de4f65a";
const fixture = () => ({
  id: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
  projectId,
  supplierId: null,
  costAmountHt: new Prisma.Decimal("10000"),
  currencyCode: "EUR",
  description: "Road freight",
  dueDate: new Date("2026-10-20T00:00:00Z"),
  expenseDate: new Date("2026-09-03T00:00:00Z"),
  reference: null,
  notes: null,
  freightMarkupOverrideRate: null,
  fxRateToReporting: null,
  vatTreatment: null,
  vatRate: null,
  vatAmount: null,
  vatAmountIsManual: false,
  recoverability: null,
  recoverableRate: null,
  detachedReportingCurrencyCode: null,
  createdAt: new Date("2026-09-03T00:00:00Z"),
  updatedAt: new Date("2026-09-03T00:00:00Z"),
  createdById: actorId,
  updatedById: actorId,
  trashedAt: null,
  project: {
    reportingCurrencyCode: "EUR",
    defaultFreightMarkupRate: new Prisma.Decimal("0.1"),
  },
  payments: [] as Prisma.FreightExpensePaymentGetPayload<object>[],
});
const updateInput = (
  overrides: Record<string, unknown> = {},
  expense = fixture(),
) =>
  updateProjectFreightExpenseSchema.parse({
    id: expense.id,
    projectId,
    expectedVersion: freightExpenseEditVersion(expense),
    costAmountHt: "10000",
    currencyCode: "EUR",
    description: "Road freight",
    expenseDate: "2026-09-03",
    dueDate: "2026-10-20",
    ...overrides,
  });
const payment = () => ({
  id: "d12b6b9b-10e9-4e42-b93f-38796de4f65a",
  expenseId: fixture().id,
  amount: new Prisma.Decimal("6000"),
  paidAt: new Date("2026-09-04T00:00:00Z"),
  fxRateToReporting: null,
  reference: "Paid",
  notes: null,
  createdAt: new Date("2026-09-04T00:00:00Z"),
  updatedAt: new Date("2026-09-04T00:00:00Z"),
  createdById: actorId,
  updatedById: actorId,
  trashedAt: null,
});

describe("Project freight reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.user.findUnique.mockResolvedValue({
      isActive: true,
      role: "MANAGER",
    });
    database.project.findUnique.mockResolvedValue({
      defaultFreightMarkupRate: "0.10",
      estimatedPurchaseCostHt: "591700",
      freightEstimateRate: "0.10",
      reportingCurrencyCode: "EUR",
    });
    database.projectFreightExpense.findMany.mockResolvedValue([]);
    database.currency.findFirst.mockResolvedValue({ code: "EUR" });
    database.supplier.findUnique.mockResolvedValue(null);
    transaction.projectFreightExpense.create.mockResolvedValue({
      id: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });
    database.projectFreightExpense.findUnique.mockResolvedValue(fixture());
  });

  it("uses Project expected purchase for planning and actual costs for recovery", async () => {
    orders.listProjectOrders.mockResolvedValue([
      {
        componentPricing: { freightMarkupRate: "0.10" },
        costs: {
          freight: null,
          purchaseCost: "45652.07",
          purchaseFxRate: null,
          sellingFxRate: null,
        },
        freightAllowanceOverrideAmount: null,
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        status: "ORDERED",
      },
      {
        componentPricing: { freightMarkupRate: "0.10" },
        costs: {
          freight: "435",
          purchaseCost: "6766.49",
          purchaseFxRate: null,
          sellingFxRate: null,
        },
        freightAllowanceOverrideAmount: null,
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        status: "ORDERED",
      },
    ]);

    await expect(
      getProjectFreightReconciliation("legacy-project"),
    ).resolves.toMatchObject({
      actualComplete: true,
      actualCostHt: "435.0000",
      complete: true,
      expectedFreightAllowanceHt: "59170.0000",
      expectedProductPurchaseCostHt: "591700.0000",
      freightGrossProfitHt: "43.5000",
      headroomHt: "58691.5000",
      planningComplete: true,
      recoveryTargetHt: "478.5000",
    });
  });

  it("includes only non-deductible freight VAT in economic freight cost", async () => {
    orders.listProjectOrders.mockResolvedValue([]);
    database.projectFreightExpense.findMany.mockResolvedValue([
      {
        costAmountHt: "10000",
        currencyCode: "EUR",
        freightMarkupOverrideRate: null,
        fxRateToReporting: null,
        id: "freight-expense-1",
        recoverability: "PARTIALLY_RECOVERABLE",
        recoverableRate: "0.50",
        vatAmount: "2000",
      },
    ]);

    await expect(
      getProjectFreightReconciliation("project-with-partial-vat"),
    ).resolves.toMatchObject({
      actualCostHt: "11000.0000",
      freightGrossProfitHt: "1100.0000",
      projectExpenseDeductibleInputVat: {
        complete: true,
        value: "1000.0000",
      },
      projectExpenseEconomicCost: {
        complete: true,
        value: "11000.0000",
      },
      projectExpenseInputVat: { complete: true, value: "2000.0000" },
      projectExpenseNonDeductibleInputVat: {
        complete: true,
        value: "1000.0000",
      },
      recoveryTargetHt: "12100.0000",
    });
  });

  it("marks freight VAT and economic cost incomplete when manual FX is missing", async () => {
    orders.listProjectOrders.mockResolvedValue([]);
    database.projectFreightExpense.findMany.mockResolvedValue([
      {
        costAmountHt: "10000",
        currencyCode: "USD",
        freightMarkupOverrideRate: null,
        fxRateToReporting: null,
        id: "foreign-freight-expense",
        recoverability: "RECOVERABLE",
        recoverableRate: "1",
        vatAmount: "2000",
      },
    ]);

    await expect(
      getProjectFreightReconciliation("project-with-missing-fx"),
    ).resolves.toMatchObject({
      projectExpenseDeductibleInputVat: {
        complete: false,
        missingIds: ["foreign-freight-expense"],
      },
      projectExpenseEconomicCost: {
        complete: false,
        missingIds: ["foreign-freight-expense"],
      },
    });
  });

  it("persists derived partial VAT and audit attribution", async () => {
    const input = projectFreightExpenseSchema.parse({
      costAmountHt: "10000",
      currencyCode: "EUR",
      description: "Road freight",
      expenseDate: "2026-09-03",
      projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      vatRate: "20",
      vatRecoverableRate: "50",
      vatTreatment: "DOMESTIC",
    });
    await createProjectFreightExpense(
      "c12b6b9b-10e9-4e42-b93f-38796de4f65a",
      input,
    );

    expect(transaction.projectFreightExpense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recoverability: "PARTIALLY_RECOVERABLE",
          recoverableRate: "0.500000",
          vatAmount: "2000.0000",
          vatAmountIsManual: false,
          vatRate: "0.200000",
        }),
      }),
    );
    expect(audit.writeAuditEvent).toHaveBeenCalledOnce();
  });

  it("updates freight VAT transactionally with an audit event", async () => {
    const input = updateInput({
      vatAmount: "2000",
      vatRecoverableRate: "50",
      vatTreatment: "DOMESTIC",
    });
    await updateProjectFreightExpense(
      "c12b6b9b-10e9-4e42-b93f-38796de4f65a",
      input,
    );

    expect(transaction.projectFreightExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recoverability: "PARTIALLY_RECOVERABLE",
          recoverableRate: "0.500000",
          vatAmount: "2000.0000",
          vatAmountIsManual: true,
        }),
      }),
    );
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      transaction,
      expect.any(String),
      expect.objectContaining({ action: "UPDATED" }),
    );
  });

  it("edits the complete expense and derived VAT without replacing payments", async () => {
    const expense = { ...fixture(), payments: [payment()] };
    database.projectFreightExpense.findUnique.mockResolvedValue(expense);
    await updateProjectFreightExpense(
      actorId,
      updateInput(
        {
          costAmountHt: "7000",
          description: "Corrected delivery",
          reference: "F-2",
          expenseDate: "2026-10-01",
          dueDate: "",
          notes: "Reviewed",
          freightMarkupOverrideRate: "15",
          vatTreatment: "DOMESTIC",
          vatRate: "20",
          vatRecoverableRate: "50",
        },
        expense,
      ),
    );
    expect(transaction.projectFreightExpense.update).toHaveBeenCalledWith({
      where: { id: expense.id },
      data: expect.objectContaining({
        costAmountHt: "7000.0000",
        description: "Corrected delivery",
        reference: "F-2",
        dueDate: null,
        freightMarkupOverrideRate: "0.150000",
        vatAmount: "1400.0000",
        recoverableRate: "0.500000",
        updatedById: actorId,
      }),
    });
    expect(
      transaction.projectFreightExpense.update.mock.calls[0]?.[0].data,
    ).not.toHaveProperty("payments");
    expect(audit.writeAuditEvent.mock.calls[0]?.[2].metadata).toMatchObject({
      before: { costAmountHt: "10000" },
      after: { costAmountHt: "7000.0000", notes: "Reviewed" },
    });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("rejects a payable below cash already paid including a VAT reduction", async () => {
    const expense = { ...fixture(), payments: [payment()] };
    database.projectFreightExpense.findUnique.mockResolvedValue(expense);
    await expect(
      updateProjectFreightExpense(
        actorId,
        updateInput({ costAmountHt: "5000" }, expense),
      ),
    ).rejects.toThrow("below payments");
    expect(transaction.projectFreightExpense.update).not.toHaveBeenCalled();
  });

  it.each(["currencyCode", "supplierId"])(
    "does not reinterpret paid cash by changing %s",
    async (field) => {
      const expense = { ...fixture(), payments: [payment()] };
      database.projectFreightExpense.findUnique.mockResolvedValue(expense);
      await expect(
        updateProjectFreightExpense(
          actorId,
          updateInput(
            { [field]: field === "currencyCode" ? "USD" : actorId },
            expense,
          ),
        ),
      ).rejects.toThrow("cannot change");
      expect(transaction.projectFreightExpense.update).not.toHaveBeenCalled();
    },
  );

  it("rejects stale expenses and newly recorded payments", async () => {
    const input = updateInput();
    database.projectFreightExpense.findUnique.mockResolvedValue({
      ...fixture(),
      payments: [payment()],
    });
    await expect(updateProjectFreightExpense(actorId, input)).rejects.toThrow(
      "draft is retained",
    );
    database.projectFreightExpense.findUnique.mockResolvedValue({
      ...fixture(),
      description: "Newer edit",
    });
    await expect(updateProjectFreightExpense(actorId, input)).rejects.toThrow(
      "draft is retained",
    );
    expect(transaction.projectFreightExpense.update).not.toHaveBeenCalled();
  });

  it("requires manual FX for a new foreign currency and permits reviewed unpaid corrections", async () => {
    await expect(
      updateProjectFreightExpense(
        actorId,
        updateInput({ currencyCode: "USD" }),
      ),
    ).rejects.toThrow("manual FX");
    database.supplier.findUnique.mockResolvedValue({ id: actorId });
    await updateProjectFreightExpense(
      actorId,
      updateInput({
        currencyCode: "USD",
        fxRate: "0.923456789",
        supplierId: actorId,
      }),
    );
    expect(
      transaction.projectFreightExpense.update.mock.calls[0]?.[0].data,
    ).toMatchObject({
      currencyCode: "USD",
      fxRateToReporting: "0.923456789",
      supplierId: actorId,
    });
  });

  it("rejects read-only or inactive actors and maps concurrency conflicts", async () => {
    transaction.user.findUnique.mockResolvedValue({
      isActive: true,
      role: "USER",
    });
    await expect(
      updateProjectFreightExpense(actorId, updateInput()),
    ).rejects.toThrow("cannot edit");
    transaction.user.findUnique.mockResolvedValue({
      isActive: false,
      role: "ADMIN",
    });
    await expect(
      updateProjectFreightExpense(actorId, updateInput()),
    ).rejects.toThrow("cannot edit");
    database.$transaction.mockRejectedValueOnce({ code: "P2034" });
    await expect(
      updateProjectFreightExpense(actorId, updateInput()),
    ).rejects.toThrow("draft is retained");
  });
});
