import "server-only";

import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import { reportingAmount } from "@/domain/finance/calculations";
import { reconcileProjectFreight } from "@/domain/freight/calculations";
import type { ProjectFreightExpenseInput } from "@/domain/freight/validation";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { writeAuditEvent } from "@/lib/audit/events";
import { getDatabase } from "@/lib/db";
import { listProjectOrders } from "@/lib/procurement/orders";

export class ProjectFreightExpenseError extends Error {}

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
    reference: expense.reference,
    supplier: expense.supplier,
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
        ],
      },
      summary: "Created a Project-level freight expense.",
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
  const convertedExpenses = expenses.map((expense) => ({
    costHt: convertedAmount({
      amount: expense.costAmountHt.toString(),
      currencyCode: expense.currencyCode,
      fxRate: expense.fxRateToReporting?.toString() ?? null,
      reportingCurrencyCode: project.reportingCurrencyCode,
    }),
    markupRate:
      expense.freightMarkupOverrideRate?.toString() ??
      project.defaultFreightMarkupRate.toString(),
  }));
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
    reportingCurrencyCode: project.reportingCurrencyCode,
  };
}
