import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { nextUnpaidTerm } from "@/domain/payments/terms";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { writeAuditEvent } from "@/lib/audit/events";
import { ClientBillingValidationError } from "./errors";
import { getClientCreditPosition } from "@/domain/billing/credits";
import { activeCreditsInclude } from "@/lib/credits/select";
import Decimal from "decimal.js";

export async function billingDueDateContext(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const doc = await tx.clientBillingDocument.findUniqueOrThrow({
    where: { id },
    include: {
      credits: activeCreditsInclude,
      receipts: true,
      matchedInstallment: { include: { receipts: true } },
      paymentInstallments: { include: { receipts: true } },
    },
  });
  const terms = doc.matchedInstallment
    ? [doc.matchedInstallment]
    : doc.paymentInstallments;
  const term = new Decimal(getClientCreditPosition(doc).outstanding).isZero()
    ? undefined
    : nextUnpaidTerm(
        terms.map((t) => ({
          id: t.id,
          dueDate: dateToDateOnly(t.dueDate),
          isCancelled: t.isCancelled,
          scheduledAmount: t.scheduledAmount.toString(),
          payments: t.receipts.map((r) => ({ amount: r.amount.toString() })),
        })),
      );
  return {
    term,
    dueDate: term?.dueDate ?? null,
  };
}

export async function editBillingDueDate(
  tx: Prisma.TransactionClient,
  actorId: string,
  id: string,
  value: string | null,
) {
  const context = await billingDueDateContext(tx, id);
  if (context.dueDate === value) return;
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
    return;
  }
  throw new ClientBillingValidationError(
    "Add an unpaid payment term before setting its due date.",
  );
}
