import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { billingStatuses } from "@/domain/billing/status";
import { clientReceiptSchema } from "@/domain/billing/validation";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import {
  ClientBillingValidationError,
  recordClientReceiptInTransaction,
} from "./billing";

export const billingStatusChangeSchema = z.object({
  id: z.uuid(),
  value: z.enum(billingStatuses),
  paymentDate: z.string().optional(),
  paymentFx: z.string().optional(),
  confirmedAmount: z.string().optional(),
});

export async function changeBillingStatusInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  raw: z.infer<typeof billingStatusChangeSchema>,
) {
  const input = billingStatusChangeSchema.parse(raw);
  const doc = await tx.clientBillingDocument.findUniqueOrThrow({
    where: { id: input.id },
    include: {
      receipts: true,
      paymentInstallments: {
        include: { receipts: true },
        orderBy: { sequence: "asc" },
      },
      matchedInstallment: { include: { receipts: true } },
    },
  });
  const receipts = [
    ...new Map(
      [...doc.receipts, ...(doc.matchedInstallment?.receipts ?? [])].map(
        (r) => [r.id, r],
      ),
    ).values(),
  ];
  const paid = receipts.reduce((sum, r) => sum.plus(r.amount), new Decimal(0));
  const remaining = Decimal.max(
    new Decimal(doc.totalTtc.toString()).minus(paid),
    0,
  );
  if (
    doc.documentType === "QUOTE" &&
    ["INVOICED", "PAID", "OVERDUE"].includes(input.value)
  )
    throw new ClientBillingValidationError(
      "Create or select an Invoice to use this status. Quotes remain planning documents.",
    );
  if (
    ["DRAFT", "TO_BE_INVOICED", "CANCELLED"].includes(input.value) &&
    paid.greaterThan(0)
  )
    throw new ClientBillingValidationError(
      "Correct recorded payments before returning this Invoice to a pre-invoice or cancelled status.",
    );
  if (
    input.value === "PAID" &&
    remaining.greaterThan(0) &&
    (!input.confirmedAmount || !remaining.equals(input.confirmedAmount))
  )
    throw new ClientBillingValidationError(
      "The remaining amount changed. Refresh and confirm the current balance before marking Paid.",
    );
  if (input.value === "PAID" && new Decimal(doc.totalTtc.toString()).isZero())
    throw new ClientBillingValidationError(
      "A zero-value Invoice has no payment to record.",
    );
  await tx.clientBillingDocument.update({
    where: { id: doc.id },
    data: {
      workflowStatus: input.value === "PAID" ? "INVOICED" : input.value,
      isCancelled: input.value === "CANCELLED",
      paymentStatusOverride: null,
      updatedById: actorId,
    },
  });
  if (input.value === "PAID" && remaining.greaterThan(0)) {
    let unrecorded = remaining;
    const terms = doc.matchedInstallment
      ? [doc.matchedInstallment]
      : doc.paymentInstallments;
    for (const term of terms) {
      if (term.isCancelled || unrecorded.isZero()) continue;
      const termPaid = term.receipts.reduce(
        (sum, r) => sum.plus(r.amount),
        new Decimal(0),
      );
      const amount = Decimal.min(
        unrecorded,
        Decimal.max(
          new Decimal(term.scheduledAmount.toString()).minus(termPaid),
          0,
        ),
      );
      if (amount.isZero()) continue;
      await recordClientReceiptInTransaction(
        tx,
        actorId,
        clientReceiptSchema.parse({
          billingDocumentId: doc.id,
          installmentId: term.id,
          amount: amount.toFixed(4),
          receivedAt: input.paymentDate,
          fxRate: input.paymentFx,
        }),
      );
      unrecorded = unrecorded.minus(amount);
    }
    if (unrecorded.greaterThan(0))
      await recordClientReceiptInTransaction(
        tx,
        actorId,
        clientReceiptSchema.parse({
          billingDocumentId: doc.id,
          amount: unrecorded.toFixed(4),
          receivedAt: input.paymentDate,
          fxRate: input.paymentFx,
        }),
      );
  }
  await writeAuditEvent(tx, actorId, {
    action: "UPDATED",
    entityType: "BILLING_DOCUMENT",
    entityId: doc.id,
    entityReference: doc.reference,
    summary: "Changed Billing status.",
    metadata: { previous: doc.workflowStatus, status: input.value },
  });
}

export async function changeBillingStatus(actorId: string, raw: unknown) {
  const input = billingStatusChangeSchema.parse(raw);
  await getDatabase().$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { role: true, isActive: true },
      });
      if (!actor?.isActive || !["ADMIN", "MANAGER"].includes(actor.role))
        throw new ClientBillingValidationError(
          "Only an Administrator or Manager can change Billing status.",
        );
      await changeBillingStatusInTransaction(tx, actorId, input);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
