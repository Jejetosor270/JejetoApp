import "server-only";
import { getDatabase } from "@/lib/db";
import { derivePaymentStatus } from "@/domain/payments/calculations";
import { businessToday, dateToDateOnly } from "@/domain/payments/dates";
import { freightPaymentBalance } from "@/domain/finance/project-control";
import type { ReportingInstallmentInput } from "@/domain/reporting/calculations";
export async function listFreightCash(
  projectIds: readonly string[],
  supplierId?: string,
) {
  if (!projectIds.length) return [];
  const rows = await getDatabase().freightExpensePayment.findMany({
    where: {
      expense: {
        projectId: { in: [...projectIds] },
        ...(supplierId ? { supplierId } : {}),
      },
    },
    include: { expense: { select: { currencyCode: true, projectId: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount.toString(),
    currencyCode: row.expense.currencyCode,
    projectId: row.expense.projectId,
    fxRate: row.fxRateToReporting?.toString() ?? null,
    receivedAt: dateToDateOnly(row.paidAt),
    isOutflow: true,
  }));
}

/** Derive dated expense commitments; no duplicate schedule records are stored. */
export async function listFreightCommitments(
  projectIds: readonly string[],
  supplierId?: string,
): Promise<(ReportingInstallmentInput & { projectId: string | null })[]> {
  if (!projectIds.length) return [];
  const rows = await getDatabase().projectFreightExpense.findMany({
    where: {
      projectId: { in: [...projectIds] },
      dueDate: { not: null },
      ...(supplierId ? { supplierId } : {}),
    },
    include: { payments: true },
  });
  return rows.flatMap((row) => {
    if (!row.dueDate) return [];
    const balance = freightPaymentBalance(
      row.costAmountHt.toString(),
      row.vatAmount?.toString() ?? null,
      row.vatTreatment,
      row.payments.map((payment) => payment.amount.toString()),
    );
    if (balance.outstanding === null)
      throw new Error("Freight balance is unavailable.");
    return [
      {
        id: row.id,
        orderId: row.id,
        projectId: row.projectId,
        currencyCode: row.currencyCode,
        direction: "SUPPLIER_PAYMENT",
        dueDate: dateToDateOnly(row.dueDate),
        expectedFxRate: row.fxRateToReporting?.toString() ?? null,
        isCancelled: false,
        outstandingAmount: balance.outstanding,
        scheduledAmount: balance.outstanding,
        settlements: [],
        status: derivePaymentStatus({
          dueDate: dateToDateOnly(row.dueDate),
          today: businessToday(),
          scheduledAmount: balance.outstanding,
          paidAmount: "0",
          isCancelled: false,
        }),
      },
    ];
  });
}
