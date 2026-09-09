"use server";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { saveRecordStatus } from "@/lib/payments/record-status";
import { recordStatusSchema } from "@/domain/payments/record-status";
import { revalidatePath } from "next/cache";
import type { BulkActionState } from "@/domain/deletion/action-state";

export async function saveRecordStatusAction(
  input: unknown,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const parsed = recordStatusSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: "Choose a valid status and record." };
  try {
    await saveRecordStatus(actor.id, parsed.data);
    revalidatePath("/", "layout");
    return {
      status: "success",
      message:
        parsed.data.value === "CANCEL"
          ? "Record cancelled."
          : "Status saved. Cash and balances unchanged.",
    };
  } catch {
    return {
      status: "error",
      message:
        "Could not change status. Check the record; Billing with receipts cannot be cancelled.",
    };
  }
}
