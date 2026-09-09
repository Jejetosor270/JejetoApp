"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  freightPaymentInput,
  FreightPaymentError,
  saveFreightPayment,
  removeFreightPayment,
  unassignFreightPayments,
} from "@/lib/freight/payments";
import type { MasterDataActionState } from "@/components/master-data/action-state";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { isDateOnly, dateOnlyToDate } from "@/domain/payments/dates";

function refresh() {
  revalidatePath("/");
  revalidatePath("/projects", "layout");
  revalidatePath("/reports");
  revalidatePath("/settings/trash");
  revalidatePath("/unassigned-cash");
}

export async function unassignFreightPaymentAction(
  _: MasterDataActionState,
  form: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const ids = z.array(z.uuid()).min(1).max(100).safeParse(form.getAll("ids"));
  if (!ids.success)
    return {
      status: "error",
      message: "Select payments to remove from this expense.",
    };
  try {
    await unassignFreightPayments(actor.id, ids.data);
    refresh();
    return {
      status: "success",
      message: "Payments retained as unassigned cash.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof FreightPaymentError
          ? error.message
          : "Unable to remove these relationships.",
    };
  }
}
export async function saveFreightPaymentAction(
  _: MasterDataActionState,
  form: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = freightPaymentInput.safeParse(Object.fromEntries(form));
  if (!input.success)
    return {
      status: "error",
      message: input.error.issues[0]?.message ?? "Check payment fields.",
    };
  try {
    await saveFreightPayment(actor.id, input.data);
    refresh();
    return { status: "success", message: "Freight payment saved." };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof FreightPaymentError
          ? error.message
          : "The payment could not be saved. Refresh and retry.",
    };
  }
}
export async function removeFreightPaymentAction(
  _: MasterDataActionState,
  form: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success)
    return { status: "error", message: "Select a valid payment." };
  try {
    await removeFreightPayment(actor.id, id.data);
    refresh();
    return { status: "success", message: "Freight payment moved to Trash." };
  } catch {
    return {
      status: "error",
      message: "The payment could not be removed. Refresh and retry.",
    };
  }
}
export async function setFreightDueDateAction(
  _: MasterDataActionState,
  form: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = z
    .object({
      expenseId: z.uuid(),
      dueDate: z.string().refine((value) => value === "" || isDateOnly(value)),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return { status: "error", message: "Enter a valid due date." };
  try {
    await getDatabase().$transaction(async (tx) => {
      const row = await tx.projectFreightExpense.update({
        where: { id: input.data.expenseId },
        data: {
          dueDate: input.data.dueDate
            ? dateOnlyToDate(input.data.dueDate)
            : null,
          updatedById: actor.id,
        },
      });
      await writeAuditEvent(tx, actor.id, {
        action: "UPDATED",
        entityType: "FREIGHT_EXPENSE",
        entityId: row.id,
        entityReference: row.description,
        summary: "Updated freight payment due date.",
        metadata: { dueDate: input.data.dueDate },
      });
    });
    refresh();
    return { status: "success", message: "Due date saved." };
  } catch {
    return { status: "error", message: "The due date could not be saved." };
  }
}
