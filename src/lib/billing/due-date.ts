import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { nextUnpaidTerm } from "@/domain/payments/terms";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { writeAuditEvent } from "@/lib/audit/events";

export async function billingDueDateContext(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const doc = await tx.clientBillingDocument.findUniqueOrThrow({
    where: { id },
    include: {
      matchedInstallment: { include: { receipts: true } },
      paymentInstallments: { include: { receipts: true } },
    },
  });
  const terms = doc.matchedInstallment
    ? [doc.matchedInstallment]
    : doc.paymentInstallments;
  const term = nextUnpaidTerm(
    terms.map((t) => ({
      id: t.id,
      dueDate: dateToDateOnly(t.dueDate),
      isCancelled: t.isCancelled,
      scheduledAmount: t.scheduledAmount.toString(),
      payments: t.receipts.map((r) => ({ amount: r.amount.toString() })),
    })),
    dateToDateOnly(doc.dueDate),
  );
  return {
    term,
    dueDate:
      !term && terms.length
        ? null
        : (term?.dueDate ?? dateToDateOnly(doc.dueDate)),
    documentDueDate: doc.dueDate,
  };
}

export async function editBillingDueDate(
  tx: Prisma.TransactionClient,
  actorId: string,
  id: string,
  value: string | null,
) {
  const context = await billingDueDateContext(tx, id);
  if (context.dueDate === value) return context.documentDueDate;
  if (context.term) {
    await tx.clientPaymentInstallment.update({
      where: { id: context.term.id },
      data: {
        dueDate: value ? dateOnlyToDate(value) : null,
        updatedById: actorId,
      },
    });
    await writeAuditEvent(tx, actorId, {
      action: "UPDATED",
      entityType: "BILLING_DOCUMENT",
      entityId: id,
      entityReference: "Payment term due date",
      summary: "Updated the earliest unpaid Client term only.",
      metadata: {
        installmentId: context.term.id,
        previous: context.term.dueDate,
        dueDate: value,
      },
    });
    return context.documentDueDate;
  }
  return value ? dateOnlyToDate(value) : null;
}
