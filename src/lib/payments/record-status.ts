import { changeBillingStatus } from "@/lib/billing/status";
import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { recordStatusSchema } from "@/domain/payments/record-status";

export async function saveRecordStatus(actorId: string, raw: unknown) {
  const input = recordStatusSchema.parse(raw);
  if (input.kind === "billing") {
    if (input.value === "CANCEL")
      return changeBillingStatus(actorId, { id: input.id, value: "CANCELLED" });
    throw new Error("Use the Billing status selector.");
  }
  return getDatabase().$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { role: true, isActive: true },
      });
      if (!actor?.isActive || !["ADMIN", "MANAGER"].includes(actor.role))
        throw new Error(
          "Only an active Administrator or Manager can change status.",
        );
      const override = input.value === "AUTO" ? null : input.value;
      if (input.kind === "order") {
        const order = await tx.procurementOrder.findUniqueOrThrow({
          where: { id: input.id },
        });
        if (order.status === "CANCELLED")
          throw new Error("This Order is cancelled.");
        await tx.procurementOrder.update({
          where: { id: input.id },
          data: {
            updatedById: actorId,
            ...(input.value === "CANCEL"
              ? { status: "CANCELLED" as const }
              : { paymentStatusOverride: override }),
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
              : "Updated display-only payment status; cash and balances unchanged.",
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
