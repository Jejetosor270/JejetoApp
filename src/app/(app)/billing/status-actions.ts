"use server";
import { ClientBillingValidationError } from "@/lib/billing/billing";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  changeBillingStatus,
  billingStatusChangeSchema,
} from "@/lib/billing/status";
import { revalidatePath } from "next/cache";

export async function changeBillingStatusAction(input: unknown) {
  const actor = await requireMasterDataEditor();
  const parsed = billingStatusChangeSchema.safeParse(input);
  if (!parsed.success)
    return {
      status: "error" as const,
      message: "Check the status and payment details.",
    };
  try {
    await changeBillingStatus(actor.id, parsed.data);
    revalidatePath("/", "layout");
    return { status: "success" as const, message: "Billing status saved." };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof ClientBillingValidationError
          ? error.message
          : "Could not save Billing status. Your selection is retained.",
    };
  }
}
