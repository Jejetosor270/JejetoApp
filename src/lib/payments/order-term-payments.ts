import "server-only";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { trashInTransaction } from "@/lib/trash/service";
import {
  getOrderPaymentSummary,
  type PaymentInstallmentView,
} from "./payments";
import {
  cashEditVersion,
  isPaymentWriteConflict,
  stalePaymentMessage,
} from "./edit-version";
import { PaymentValidationError } from "./errors";

export type OrderTermPayments = {
  orderId: string;
  orderNumber: string;
  cancelled: boolean;
  terms: PaymentInstallmentView[];
};

export const markSupplierTermUnpaidSchema = z.object({
  orderId: z.uuid(),
  termId: z.uuid(),
  payments: z
    .array(
      z.object({
        id: z.uuid(),
        version: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(1000),
  reason: z.string().trim().min(1).max(500),
});

/** The server caller must authorize editing before loading this drawer. */
export async function getOrderTermPayments(
  orderId: string,
): Promise<OrderTermPayments | null> {
  const order = await getDatabase().procurementOrder.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true },
  });
  if (!order) return null;
  const summary = await getOrderPaymentSummary(order.id);
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    cancelled: order.status === "CANCELLED",
    terms: summary.supplier.installments,
  };
}

/** Undo the reviewed cash only; never rewrite a term, create a refund or hard-delete history. */
export async function markSupplierTermUnpaid(
  actorId: string,
  raw: unknown,
): Promise<void> {
  const input = markSupplierTermUnpaidSchema.parse(raw);
  try {
    await getDatabase().$transaction(
      async (tx) => {
        const actor = await tx.user.findUnique({
          where: { id: actorId },
          select: { role: true, isActive: true },
        });
        if (!actor?.isActive || !["ADMIN", "MANAGER"].includes(actor.role))
          throw new PaymentValidationError(
            "Only an active Administrator or Manager can correct payments.",
          );
        const term = await tx.paymentInstallment.findUnique({
          where: { id: input.termId },
          include: {
            settlements: true,
            order: { select: { id: true, status: true } },
          },
        });
        if (
          !term ||
          term.direction !== "SUPPLIER_PAYMENT" ||
          term.orderId !== input.orderId ||
          !term.order ||
          term.order.status === "CANCELLED"
        )
          throw new PaymentValidationError(
            "Select a Supplier payment term on an active Order.",
          );
        const reviewed = new Map(
          input.payments.map((payment) => [payment.id, payment.version]),
        );
        if (
          reviewed.size !== input.payments.length ||
          term.settlements.length !== reviewed.size ||
          term.settlements.some(
            (payment) => reviewed.get(payment.id) !== cashEditVersion(payment),
          )
        )
          throw new PaymentValidationError(
            "Payments changed since this panel opened. Reload the payment terms before marking unpaid.",
          );
        const paymentIds = term.settlements.map((payment) => payment.id);
        // Existing Trash retains cash rows and bank-match identity and enforces credit-history guards.
        const trashBatchId = await trashInTransaction(
          tx,
          actorId,
          "PaymentSettlement",
          paymentIds,
        );
        await writeAuditEvent(tx, actorId, {
          action: "UPDATED",
          entityType: "INSTALLMENT",
          entityId: term.id,
          entityReference: term.label,
          summary:
            "Marked Supplier term unpaid by undoing its reviewed payments.",
          metadata: {
            orderId: input.orderId,
            paymentIds,
            trashBatchId,
            reason: input.reason,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isPaymentWriteConflict(error))
      throw new PaymentValidationError(stalePaymentMessage);
    throw error;
  }
}
