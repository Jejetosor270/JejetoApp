import "server-only";

import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import {
  reportingAmount,
  vatAmount as calculateVatAmount,
} from "@/domain/finance/calculations";
import { reconcileProjectFreight } from "@/domain/freight/calculations";
import type {
  ProjectFreightExpenseInput,
  UpdateProjectFreightExpenseInput,
} from "@/domain/freight/validation";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { writeAuditEvent } from "@/lib/audit/events";
import { getDatabase } from "@/lib/db";
import { listProjectOrders } from "@/lib/procurement/orders";
import {
  calculateInputVatRecovery,
  inputVatRecoverabilityApplies,
  recoverabilityFromRate,
} from "@/domain/vat/recoverability";

export class ProjectFreightExpenseError extends Error {}

function freightVat(
  input: Pick<
    ProjectFreightExpenseInput,
    | "costAmountHt"
    | "vatAmount"
    | "vatRate"
    | "vatRecoverableRate"
    | "vatTreatment"
  >,
) {
  if (!input.vatTreatment)
    return {
      recoverability: null,
      recoverableRate: null,
      vatAmount: null,
      vatAmountIsManual: false,
      vatRate: null,
      vatTreatment: null,
    };
  const recoverableRate = inputVatRecoverabilityApplies(input.vatTreatment)
    ? (input.vatRecoverableRate ?? null)
    : null;
  const amount =
    input.vatAmount ??
    calculateVatAmount(input.costAmountHt, input.vatRate ?? "0").toFixed(4);
  return {
    recoverability:
      recoverableRate === null ? null : recoverabilityFromRate(recoverableRate),
    recoverableRate,
    vatAmount: amount,
    vatAmountIsManual: input.vatAmount !== undefined,
    vatRate: input.vatRate ?? null,
    vatTreatment: input.vatTreatment,
  };
}

function freightExpenseEconomicCost(input: {
  costAmountHt: { toString(): string };
  recoverability: Parameters<
    typeof calculateInputVatRecovery
  >[0]["recoverability"];
  recoverableRate: { toString(): string } | null;
  vatAmount: { toString(): string } | null;
}): string {
  if (!input.vatAmount) return input.costAmountHt.toString();
  return new Decimal(input.costAmountHt.toString())
    .plus(
      calculateInputVatRecovery({
        recoverability: input.recoverability,
        recoverableRate: input.recoverableRate?.toString() ?? null,
        vatAmount: input.vatAmount.toString(),
      }).nonDeductibleVat,
    )
    .toFixed(4);
}

function convertedAmount(input: {
  amount: string;
  currencyCode: string;
  fxRate: string | null;
  reportingCurrencyCode: string;
}): string | null {
  if (new Decimal(input.amount).isZero()) return "0.0000";
  return (
    reportingAmount({
      fxRateToReporting: input.fxRate ?? undefined,
      originalAmount: input.amount,
      originalCurrencyCode: input.currencyCode,
      reportingCurrencyCode: input.reportingCurrencyCode,
    })?.toFixed(4) ?? null
  );
}

function aggregateConvertedAmounts(
  values: readonly { id: string; value: string | null }[],
) {
  const missingIds: string[] = [];
  let total = new Decimal(0);
  for (const item of values) {
    if (item.value === null) missingIds.push(item.id);
    else total = total.plus(item.value);
  }
  return {
    complete: missingIds.length === 0,
    missingIds,
    value: total.toFixed(4),
  };
}

export async function listProjectFreightExpenses(projectId: string) {
  const expenses = await getDatabase().projectFreightExpense.findMany({
    where: { projectId },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    include: { supplier: { select: { displayName: true } } },
  });
  return expenses.map((expense) => ({
    costAmountHt: expense.costAmountHt.toString(),
    currencyCode: expense.currencyCode,
    description: expense.description,
    expenseDate: dateToDateOnly(expense.expenseDate),
    freightMarkupOverrideRate:
      expense.freightMarkupOverrideRate?.toString() ?? null,
    fxRate: expense.fxRateToReporting?.toString() ?? null,
    id: expense.id,
    notes: expense.notes,
    recoverability: expense.recoverability,
    recoverableRate: expense.recoverableRate?.toString() ?? null,
    reference: expense.reference,
    supplierId: expense.supplierId,
    supplier: expense.supplier,
    vatAmount: expense.vatAmount?.toString() ?? null,
    vatAmountIsManual: expense.vatAmountIsManual,
    vatRate: expense.vatRate?.toString() ?? null,
    vatTreatment: expense.vatTreatment,
  }));
}

export async function createProjectFreightExpense(
  actorId: string,
  input: ProjectFreightExpenseInput,
): Promise<void> {
  const database = getDatabase();
  const [project, currency, supplier] = await Promise.all([
    database.project.findUnique({
      where: { id: input.projectId },
      select: { reportingCurrencyCode: true },
    }),
    database.currency.findFirst({
      where: { code: input.currencyCode, isActive: true },
      select: { code: true },
    }),
    input.supplierId
      ? database.supplier.findUnique({
          where: { id: input.supplierId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!project || !currency || (input.supplierId && !supplier))
    throw new ProjectFreightExpenseError(
      "Select a valid Project, Supplier, and currency.",
    );
  if (input.currencyCode !== project.reportingCurrencyCode && !input.fxRate)
    throw new ProjectFreightExpenseError(
      "Enter the manual FX rate to the Project reporting currency.",
    );
  const vat = freightVat(input);
  await database.$transaction(async (transaction) => {
    const expense = await transaction.projectFreightExpense.create({
      data: {
        costAmountHt: input.costAmountHt,
        createdById: actorId,
        currencyCode: input.currencyCode,
        description: input.description,
        expenseDate: dateOnlyToDate(input.expenseDate),
        freightMarkupOverrideRate: input.freightMarkupOverrideRate ?? null,
        fxRateToReporting:
          input.currencyCode === project.reportingCurrencyCode
            ? null
            : (input.fxRate ?? null),
        notes: input.notes ?? null,
        projectId: input.projectId,
        reference: input.reference ?? null,
        supplierId: input.supplierId,
        updatedById: actorId,
        ...vat,
      },
      select: { id: true },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: expense.id,
      entityReference: input.reference ?? input.description,
      entityType: "FREIGHT_EXPENSE",
      metadata: {
        fields: [
          "costAmountHt",
          "currencyCode",
          "fxRate",
          "freightMarkupOverrideRate",
          "vatTreatment",
          "vatRate",
          "vatAmount",
          "recoverableRate",
        ],
      },
      summary: "Created a Project-level freight expense.",
    });
  });
}

export async function updateProjectFreightExpense(
  actorId: string,
  input: UpdateProjectFreightExpenseInput,
): Promise<void> {
  const database = getDatabase();
  const existing = await database.projectFreightExpense.findUnique({
    where: { id: input.id },
    select: {
      costAmountHt: true,
      description: true,
      projectId: true,
      reference: true,
    },
  });
  if (!existing || existing.projectId !== input.projectId)
    throw new ProjectFreightExpenseError("Freight expense not found.");
  const vat = freightVat({
    ...input,
    costAmountHt: existing.costAmountHt.toString(),
  });
  await database.$transaction(async (transaction) => {
    await transaction.projectFreightExpense.update({
      where: { id: input.id },
      data: {
        updatedById: actorId,
        ...vat,
      },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: input.id,
      entityReference: existing.reference ?? existing.description,
      entityType: "FREIGHT_EXPENSE",
      metadata: {
        fields: ["vatTreatment", "vatRate", "vatAmount", "recoverableRate"],
      },
      summary: "Updated a Project-level freight expense.",
    });
  });
}

export async function deleteProjectFreightExpense(
  actorId: string,
  id: string,
): Promise<string> {
  try {
    return await getDatabase().$transaction(async (transaction) => {
      const expense = await transaction.projectFreightExpense.delete({
        where: { id },
        select: { description: true, projectId: true, reference: true },
      });
      await writeAuditEvent(transaction, actorId, {
        action: "DELETED",
        entityId: id,
        entityReference: expense.reference ?? expense.description,
        entityType: "FREIGHT_EXPENSE",
        summary: "Deleted a Project-level freight expense.",
      });
      return expense.projectId;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      throw new ProjectFreightExpenseError("Freight expense not found.");
    throw error;
  }
}

export async function getProjectFreightReconciliation(projectId: string) {
  const database = getDatabase();
  const [project, orders, expenses] = await Promise.all([
    database.project.findUnique({
      where: { id: projectId },
      select: {
        defaultFreightMarkupRate: true,
        estimatedPurchaseCostHt: true,
        freightEstimateRate: true,
        reportingCurrencyCode: true,
      },
    }),
    listProjectOrders(projectId),
    database.projectFreightExpense.findMany({ where: { projectId } }),
  ]);
  if (!project) return null;
  const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
  const convertedOrders = activeOrders.map((order) => ({
    freightCostHt: order.costs.freight
      ? convertedAmount({
          amount: order.costs.freight,
          currencyCode: order.orderCurrencyCode,
          fxRate: order.costs.purchaseFxRate,
          reportingCurrencyCode: project.reportingCurrencyCode,
        })
      : "0.0000",
    freightMarkupRate: order.componentPricing.freightMarkupRate,
  }));
  const convertedExpenses = expenses.map((expense) => {
    const recovery = calculateInputVatRecovery({
      recoverability: expense.recoverability,
      recoverableRate: expense.recoverableRate?.toString() ?? null,
      vatAmount: expense.vatAmount?.toString() ?? "0",
    });
    const convert = (amount: string) =>
      convertedAmount({
        amount,
        currencyCode: expense.currencyCode,
        fxRate: expense.fxRateToReporting?.toString() ?? null,
        reportingCurrencyCode: project.reportingCurrencyCode,
      });
    return {
      costHt: convert(freightExpenseEconomicCost(expense)),
      deductibleInputVat: convert(recovery.deductibleVat.toString()),
      id: expense.id,
      inputVat: convert(expense.vatAmount?.toString() ?? "0"),
      markupRate:
        expense.freightMarkupOverrideRate?.toString() ??
        project.defaultFreightMarkupRate.toString(),
      nonDeductibleInputVat: convert(recovery.nonDeductibleVat.toString()),
    };
  });
  const expenseAggregate = (
    field: keyof Pick<
      (typeof convertedExpenses)[number],
      "costHt" | "deductibleInputVat" | "inputVat" | "nonDeductibleInputVat"
    >,
  ) =>
    aggregateConvertedAmounts(
      convertedExpenses.map((expense) => ({
        id: expense.id,
        value: expense[field],
      })),
    );
  return {
    ...reconcileProjectFreight({
      expenses: convertedExpenses,
      orders: convertedOrders,
      projectExpectedProductPurchaseCostHt:
        project.estimatedPurchaseCostHt?.toString() ?? null,
      projectFreightEstimateRate:
        project.freightEstimateRate?.toString() ?? null,
    }),
    defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
    freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
    projectExpenseDeductibleInputVat: expenseAggregate("deductibleInputVat"),
    projectExpenseEconomicCost: expenseAggregate("costHt"),
    projectExpenseInputVat: expenseAggregate("inputVat"),
    projectExpenseNonDeductibleInputVat: expenseAggregate(
      "nonDeductibleInputVat",
    ),
    reportingCurrencyCode: project.reportingCurrencyCode,
  };
}
