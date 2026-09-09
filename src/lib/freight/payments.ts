import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { trashInTransaction } from "@/lib/trash/service";
import { freightPayable } from "@/domain/finance/project-control";
import { isDateOnly, dateOnlyToDate } from "@/domain/payments/dates";
import { normalizeNumericText } from "@/domain/validation/numeric";

const decimal = (places: number) =>
  z.preprocess(
    (value) =>
      normalizeNumericText(value, {
        allowNegative: false,
        maximumDecimalPlaces: places,
      }),
    z
      .string()
      .regex(/^\d+(?:\.\d+)?$/)
      .refine(
        (value) => new Decimal(value).greaterThan(0),
        "Enter a positive amount.",
      ),
  );
export const freightPaymentInput = z.object({
  expenseId: z.uuid(),
  id: z.preprocess((value) => value || undefined, z.uuid().optional()),
  amount: decimal(4),
  paidAt: z.string().refine(isDateOnly, "Enter a valid payment date."),
  fxRate: z.preprocess((value) => value || undefined, decimal(10).optional()),
  reference: z.string().trim().max(120),
  notes: z.string().trim().max(4000),
});
export class FreightPaymentError extends Error {}
export async function saveFreightPayment(
  actorId: string,
  input: z.infer<typeof freightPaymentInput>,
) {
  return getDatabase().$transaction(
    async (tx) => {
      const expense = await tx.projectFreightExpense.findUnique({
        where: { id: input.expenseId },
        include: {
          payments: true,
          project: { select: { reportingCurrencyCode: true } },
        },
      });
      if (!expense)
        throw new FreightPaymentError("Freight expense is unavailable.");
      const current = input.id
        ? expense.payments.find((row) => row.id === input.id)
        : null;
      if (input.id && !current)
        throw new FreightPaymentError(
          "Payment is unavailable for this expense.",
        );
      const reportingCurrency =
        expense.project?.reportingCurrencyCode ??
        expense.detachedReportingCurrencyCode;
      if (
        !reportingCurrency ||
        (reportingCurrency !== expense.currencyCode && !input.fxRate)
      )
        throw new FreightPaymentError(
          "Enter the actual payment FX to the reporting currency.",
        );
      const otherPaid = expense.payments
        .filter((row) => row.id !== input.id)
        .reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
      if (
        otherPaid
          .plus(input.amount)
          .greaterThan(
            freightPayable(
              expense.costAmountHt.toString(),
              expense.vatAmount?.toString() ?? null,
              expense.vatTreatment,
            ),
          )
      )
        throw new FreightPaymentError(
          "Payment exceeds the freight expense outstanding balance.",
        );
      const data = {
        amount: input.amount,
        paidAt: dateOnlyToDate(input.paidAt),
        fxRateToReporting:
          expense.currencyCode === reportingCurrency
            ? null
            : (input.fxRate ?? null),
        reference: input.reference || null,
        notes: input.notes || null,
        updatedById: actorId,
      };
      const result = input.id
        ? await tx.freightExpensePayment.update({
            where: { id: input.id },
            data,
          })
        : await tx.freightExpensePayment.create({
            data: { ...data, expenseId: expense.id, createdById: actorId },
          });
      await writeAuditEvent(tx, actorId, {
        action: input.id ? "UPDATED" : "CREATED",
        entityType: "FREIGHT_EXPENSE",
        entityId: expense.id,
        entityReference: expense.reference ?? expense.description,
        summary: input.id
          ? "Corrected a freight payment."
          : "Recorded a freight payment.",
        metadata: {
          paymentId: result.id,
          amount: input.amount,
          paidAt: input.paidAt,
          previousAmount: current?.amount.toString() ?? null,
          fxRate: data.fxRateToReporting,
          previousFxRate: current?.fxRateToReporting?.toString() ?? null,
          previousPaidAt: current?.paidAt.toISOString() ?? null,
        },
      });
      return expense.projectId;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
export async function removeFreightPayment(actorId: string, id: string) {
  return getDatabase().$transaction(
    async (tx) => {
      await trashInTransaction(tx, actorId, "FreightExpensePayment", [id]);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function unassignFreightPayments(actorId: string, ids: string[]) {
  return getDatabase().$transaction(
    async (tx) => {
      for (const id of new Set(ids)) {
        const row = await tx.freightExpensePayment.findUnique({
          where: { id },
          include: {
            expense: {
              include: { project: { select: { reportingCurrencyCode: true } } },
            },
          },
        });
        if (!row)
          throw new FreightPaymentError(
            "A selected payment is no longer available.",
          );
        const reportingCurrencyCode =
          row.expense.project?.reportingCurrencyCode ??
          row.expense.detachedReportingCurrencyCode;
        if (!reportingCurrencyCode)
          throw new FreightPaymentError(
            "The payment has incomplete currency context.",
          );
        await tx.unassignedCashRecord.create({
          data: {
            id: row.id,
            direction: "SUPPLIER_PAYMENT",
            amount: row.amount,
            currencyCode: row.expense.currencyCode,
            reportingCurrencyCode,
            cashDate: row.paidAt,
            fxRateToReporting: row.fxRateToReporting,
            reference: row.reference,
            notes: row.notes,
            createdAt: row.createdAt,
            createdById: row.createdById,
            updatedById: actorId,
          },
        });
        await tx.freightExpensePayment.delete({ where: { id } });
        await writeAuditEvent(tx, actorId, {
          action: "UPDATED",
          entityType: "SETTLEMENT",
          entityId: id,
          entityReference: row.reference ?? "Freight payment",
          summary:
            "Removed freight expense relationship; retained payment as unassigned cash.",
          metadata: { expenseId: row.expenseId, amount: row.amount.toString() },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
