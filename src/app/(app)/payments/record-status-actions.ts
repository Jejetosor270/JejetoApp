"use server";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { saveRecordStatus } from "@/lib/payments/record-status";
import { recordStatusSchema } from "@/domain/payments/record-status";
import { revalidatePath } from "next/cache";
import type { BulkActionState } from "@/domain/deletion/action-state";
import { isExpectedPaymentError } from "@/lib/payments/errors";
import { ClientBillingValidationError } from "@/lib/billing/billing";
import { z } from "zod";

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
          : "Payment status updated from actual cash.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof z.ZodError
          ? "Check the payment amount, date and FX rate."
          : isExpectedPaymentError(error) ||
              error instanceof ClientBillingValidationError
            ? error.message
            : "Could not change payment status. Review the record and try again.",
    };
  }
}
