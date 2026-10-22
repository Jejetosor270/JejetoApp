import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { editVersion } from "@/lib/edit-version";

export const freightExpenseEditInclude = {
  payments: true,
  project: {
    select: { reportingCurrencyCode: true, defaultFreightMarkupRate: true },
  },
} satisfies Prisma.ProjectFreightExpenseInclude;

type Expense = Prisma.ProjectFreightExpenseGetPayload<{
  include: typeof freightExpenseEditInclude;
}>;

export function freightExpenseEditVersion(expense: Expense): string {
  return editVersion({
    id: expense.id,
    projectId: expense.projectId,
    supplierId: expense.supplierId,
    reference: expense.reference,
    description: expense.description,
    expenseDate: expense.expenseDate,
    dueDate: expense.dueDate,
    currencyCode: expense.currencyCode,
    fxRateToReporting: expense.fxRateToReporting,
    costAmountHt: expense.costAmountHt,
    vatTreatment: expense.vatTreatment,
    vatRate: expense.vatRate,
    vatAmount: expense.vatAmount,
    vatAmountIsManual: expense.vatAmountIsManual,
    recoverability: expense.recoverability,
    recoverableRate: expense.recoverableRate,
    freightMarkupOverrideRate: expense.freightMarkupOverrideRate,
    notes: expense.notes,
    updatedAt: expense.updatedAt,
    project: expense.project,
    payments: expense.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      paidAt: payment.paidAt,
      fxRateToReporting: payment.fxRateToReporting,
      updatedAt: payment.updatedAt,
    })),
  });
}

export const staleFreightExpenseMessage =
  "This expense or its payments changed since editing began. Your draft is retained. Close and reopen the editor to compare the latest values.";
