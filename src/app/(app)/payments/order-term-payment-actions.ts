"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  getOrderTermPayments,
  markSupplierTermUnpaid,
} from "@/lib/payments/order-term-payments";
import { isExpectedPaymentError } from "@/lib/payments/errors";
import { CreditError } from "@/lib/credits/source";
import { TrashError } from "@/lib/trash/service";

export async function loadOrderTermPaymentsAction(raw: unknown) {
  await requireMasterDataEditor();
  const input = z.object({ orderId: z.uuid() }).safeParse(raw);
  if (!input.success) return { data: null, error: "Select a valid Order." };
  try {
    const data = await getOrderTermPayments(input.data.orderId);
    return { data, error: data ? null : "This Order is no longer available." };
  } catch {
    return {
      data: null,
      error: "Payment terms could not be loaded. Please try again.",
    };
  }
}

export async function markSupplierTermUnpaidAction(raw: unknown) {
  const actor = await requireMasterDataEditor();
  try {
    await markSupplierTermUnpaid(actor.id, raw);
    revalidatePath("/", "layout");
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? "Select the reviewed payments and enter a correction reason."
          : isExpectedPaymentError(error) ||
              error instanceof CreditError ||
              error instanceof TrashError
            ? error.message
            : "Payments could not be undone. Reload the payment terms and check their current balances before retrying.",
    };
  }
}
