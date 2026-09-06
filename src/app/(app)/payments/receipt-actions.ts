"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  receiptEntryOptions,
  type ReceiptEntryOptions,
} from "@/lib/payments/receipt-entry";
import { recordSettlement } from "@/lib/payments/payments";
import {
  recordClientReceipt,
  ClientBillingValidationError,
  ClientBillingNotFoundError,
} from "@/lib/billing/billing";
import { isExpectedPaymentError } from "@/lib/payments/errors";
import { settlementSchema } from "@/domain/payments/validation";
import { clientReceiptSchema } from "@/domain/billing/validation";
import { fieldErrorMap } from "@/domain/validation/issues";
import { revalidateProjectFinancialViews } from "@/lib/reporting/revalidation";
import type { PaymentActionState } from "@/domain/payments/action-state";

export async function loadReceiptEntryOptions(
  projectId: string,
): Promise<{ options: ReceiptEntryOptions | null; message: string }> {
  await requireMasterDataEditor();
  const parsed = z.uuid().safeParse(projectId);
  if (!parsed.success)
    return { options: null, message: "Choose a valid Project." };
  try {
    return { options: await receiptEntryOptions(parsed.data), message: "" };
  } catch {
    return {
      options: null,
      message: "The Project documents could not be loaded. Please try again.",
    };
  }
}

export async function recordReceiptEntryAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const context = z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal("SUPPLIER"),
        projectId: z.uuid("Choose a Project."),
        orderId: z.uuid("Choose an Order."),
      }),
      z.object({
        type: z.literal("CLIENT"),
        projectId: z.uuid("Choose a Project."),
      }),
    ])
    .safeParse(Object.fromEntries(formData));
  if (!context.success)
    return {
      status: "error",
      message: "Check the payment context.",
      fieldErrors: fieldErrorMap(context.error.issues),
    };
  const raw = Object.fromEntries(formData);
  const input =
    context.data.type === "SUPPLIER"
      ? settlementSchema.safeParse(raw)
      : clientReceiptSchema.safeParse(raw);
  if (!input.success)
    return {
      status: "error",
      message: input.error.issues[0]?.message ?? "Check the receipt.",
      fieldErrors: fieldErrorMap(input.error.issues),
    };
  try {
    if (context.data.type === "SUPPLIER" && "settledAt" in input.data) {
      await recordSettlement(actor.id, input.data, context.data);
      revalidatePath(`/orders/${context.data.orderId}`);
    } else if (
      context.data.type === "CLIENT" &&
      "billingDocumentId" in input.data
    ) {
      await recordClientReceipt(actor.id, input.data, context.data);
      revalidatePath(`/billing/${input.data.billingDocumentId}`);
      revalidatePath("/billing");
    }
    revalidatePath("/payments");
    revalidatePath("/calendar");
    revalidateProjectFinancialViews(context.data.projectId);
    return {
      status: "success",
      message:
        context.data.type === "SUPPLIER"
          ? "Supplier payment recorded."
          : "Client receipt recorded.",
    };
  } catch (error) {
    if (
      isExpectedPaymentError(error) ||
      error instanceof ClientBillingValidationError ||
      error instanceof ClientBillingNotFoundError
    )
      return { status: "error", message: error.message };
    return {
      status: "error",
      message:
        "The receipt could not be saved. Your draft is preserved; please try again.",
    };
  }
}
