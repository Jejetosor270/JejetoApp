"use server";
import Decimal from "decimal.js";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditEvent } from "@/lib/audit/events";
import type { BulkActionState } from "@/domain/deletion/action-state";

export async function setPaymentTermCancelled(
  data: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const parsed = z
    .object({
      id: z.uuid(),
      kind: z.enum(["supplier", "client"]),
      cancelled: z.enum(["true", "false"]),
    })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success)
    return { status: "error", message: "Select a valid payment term." };
  const { id, kind } = parsed.data;
  const cancelled = parsed.data.cancelled === "true";
  try {
    await getDatabase().$transaction(
      async (tx) => {
        const row =
          kind === "supplier"
            ? await tx.paymentInstallment.findUniqueOrThrow({ where: { id } })
            : await tx.clientPaymentInstallment.findUniqueOrThrow({
                where: { id },
                include: { billingDocument: true },
              });
        if (!cancelled && "billingDocument" in row && row.billingDocument) {
          const other = await tx.clientPaymentInstallment.aggregate({
            where: {
              billingDocumentId: row.billingDocumentId,
              id: { not: id },
              isCancelled: false,
            },
            _sum: { scheduledAmount: true },
          });
          if (
            new Decimal(row.scheduledAmount.toString())
              .plus(other._sum.scheduledAmount?.toString() ?? "0")
              .greaterThan(row.billingDocument.totalTtc.toString())
          )
            throw new Error(
              "Reactivating this term would exceed the Billing total.",
            );
        }
        if (kind === "supplier")
          await tx.paymentInstallment.update({
            where: { id },
            data: { isCancelled: cancelled, updatedById: actor.id },
          });
        else
          await tx.clientPaymentInstallment.update({
            where: { id },
            data: { isCancelled: cancelled, updatedById: actor.id },
          });
        await writeAuditEvent(tx, actor.id, {
          action: "UPDATED",
          entityType: "INSTALLMENT",
          entityId: id,
          entityReference: row.label,
          summary: cancelled
            ? "Cancelled the remaining payment term; actual cash history retained."
            : "Reactivated payment term.",
          metadata: { wasCancelled: row.isCancelled, isCancelled: cancelled },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    revalidatePath("/", "layout");
    return {
      status: "success",
      message: cancelled
        ? "Term cancelled. Payment history retained."
        : "Term reactivated.",
    };
  } catch {
    return {
      status: "error",
      message:
        "The term could not be changed. Check its parent record and the total of active terms.",
    };
  }
}
