"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import {
  unassignCash,
  UnassignedCashError,
} from "@/lib/payments/unassigned-cash";
import type { BulkActionState } from "@/domain/deletion/action-state";
import { getDatabase } from "@/lib/db";
import { settlementSchema } from "@/domain/payments/validation";
import { dateOnlyToDate } from "@/domain/payments/dates";
import { writeAuditEvent } from "@/lib/audit/events";
import { moveToTrash } from "@/lib/trash/service";

export async function unassignCashAction(
  kind: "payment" | "receipt",
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const parsedKind = z.enum(["payment", "receipt"]).safeParse(kind);
  const ids = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!parsedKind.success || !ids.success)
    return { status: "error", message: "Select valid cash records." };
  try {
    await unassignCash(actor.id, parsedKind.data, ids.data);
    revalidatePath("/", "layout");
    return {
      status: "success",
      message:
        "Moved to Unassigned cash records. The former balances have been updated.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof UnassignedCashError
          ? error.message
          : "The cash assignment could not be removed. Refresh and try again.",
    };
  }
}

export async function editUnassignedCashAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const schema = settlementSchema
    .pick({ amount: true, settledAt: true, reference: true })
    .extend({ id: z.uuid() });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the cash row.",
    };
  try {
    await getDatabase().$transaction(async (tx) => {
      const { id, amount, reference, settledAt } = parsed.data;
      const row = await tx.unassignedCashRecord.update({
        where: { id },
        data: {
          amount,
          reference: reference ?? null,
          cashDate: dateOnlyToDate(settledAt),
          updatedById: actor.id,
        },
      });
      await writeAuditEvent(tx, actor.id, {
        action: "UPDATED",
        entityType: "SETTLEMENT",
        entityId: id,
        entityReference: row.reference ?? "Unassigned cash",
        summary: "Updated an unassigned cash record.",
      });
    });
    revalidatePath("/unassigned-cash");
    return { status: "success", message: "Cash record updated." };
  } catch {
    return {
      status: "error",
      message: "The cash record could not be updated. Your draft is retained.",
    };
  }
}

export async function trashUnassignedCashAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const ids = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!ids.success)
    return { status: "error", message: "Select valid cash records." };
  try {
    await moveToTrash(actor.id, "UnassignedCashRecord", ids.data);
    revalidatePath("/", "layout");
    return { status: "success", message: "Moved to Trash." };
  } catch {
    return {
      status: "error",
      message: "The cash records could not be moved to Trash.",
    };
  }
}
