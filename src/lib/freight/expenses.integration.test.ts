import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => ({
  projectFreightExpense: { create: vi.fn(), update: vi.fn() },
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

describe("Project freight reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    database.projectFreightExpense.findUnique.mockResolvedValue({
      costAmountHt: "10000",
      description: "Road freight",
      projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
      reference: null,
    });
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
    const input = updateProjectFreightExpenseSchema.parse({
      id: "b12b6b9b-10e9-4e42-b93f-38796de4f65a",
      projectId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
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
});
