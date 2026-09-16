import { changeBillingStatus } from "@/lib/billing/status";
import "server-only";
import { payOrderRemaining } from "./order-paid";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { recordStatusSchema } from "@/domain/payments/record-status";
import { PaymentValidationError } from "./errors";

export async function saveRecordStatus(actorId: string, raw: unknown) {
  const input = recordStatusSchema.parse(raw);
  if (input.kind === "billing") {
    if (input.value === "CANCEL")
      return changeBillingStatus(actorId, { id: input.id, value: "CANCELLED" });
    throw new PaymentValidationError("Use the Billing status selector.");
  }
  return getDatabase().$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { role: true, isActive: true },
      });
      if (!actor?.isActive || !["ADMIN", "MANAGER"].includes(actor.role))
        throw new PaymentValidationError(
          "Only an active Administrator or Manager can change status.",
        );
      if (["UNPAID", "OVERDUE"].includes(input.value))
        throw new PaymentValidationError(
          "Payment status follows actual payments and due dates. Correct the payment history or due date instead.",
        );
      if (input.value === "PAID" || input.value === "PARTIALLY_PAID") {
        if (input.value === "PARTIALLY_PAID" && !input.amount)
          throw new PaymentValidationError("Enter the partial payment amount.");
        await payOrderRemaining(tx, actorId, input);
      }
      if (input.kind === "order") {
        const order = await tx.procurementOrder.findUniqueOrThrow({
          where: { id: input.id },
        });
        if (order.status === "CANCELLED")
          throw new PaymentValidationError("This Order is cancelled.");
        await tx.procurementOrder.update({
          where: { id: input.id },
          data: {
            updatedById: actorId,
            ...(input.value === "CANCEL"
              ? { status: "CANCELLED" as const }
              : { paymentStatusOverride: null }),
          },
        });
        await writeAuditEvent(tx, actorId, {
          action: "UPDATED",
          entityType: "ORDER",
          entityId: input.id,
          entityReference: order.orderNumber,
          summary:
            input.value === "CANCEL"
              ? "Cancelled Order; cash history retained."
              : "Updated payment status from actual cash records.",
          metadata: {
            previous:
              input.value === "CANCEL"
                ? order.status
                : order.paymentStatusOverride,
            value: input.value,
          },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
