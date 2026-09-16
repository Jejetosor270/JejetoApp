"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { payTermRemaining } from "@/lib/payments/term-paid";
import { isExpectedPaymentError } from "@/lib/payments/errors";
import { ClientBillingValidationError } from "@/lib/billing/billing";

export async function payTermRemainingAction(raw: unknown) {
  const actor = await requireMasterDataEditor();
  const input = z
    .object({
      id: z.uuid(),
      kind: z.enum(["supplier", "client"]),
      documentId: z.uuid().optional(),
      fxRate: z.string().optional(),
      date: z.string().optional(),
    })
    .safeParse(raw);
  if (!input.success) return { error: "Select a valid payment term." };
  try {
    await payTermRemaining(actor.id, input.data);
    revalidatePath("/", "layout");
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? "Enter a valid payment date and positive FX rate."
          : isExpectedPaymentError(error) ||
              error instanceof ClientBillingValidationError
            ? error.message
            : "The payment could not be recorded. Refresh and check its current balance before retrying.",
    };
  }
}
