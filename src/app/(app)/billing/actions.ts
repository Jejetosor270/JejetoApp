"use server";

import { revalidatePath } from "next/cache";

import {
  clientReceiptSchema,
  clientBillingInstallmentUpdateSchema,
  inlineClientBillingSchema,
  parseBillingAllocationsEdit,
  parseBillingDocumentEdit,
  parseClientBillingConfirmation,
  parseOrderBillingLink,
} from "@/domain/billing/validation";
import type {
  BillingActionState,
  ClientDocumentProcessingState,
} from "@/domain/billing/action-state";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  ClientBillingNotFoundError,
  ClientBillingValidationError,
  confirmClientBillingDocument,
  recordClientReceipt,
  updateClientBillingInstallment,
  updateClientBillingAllocations,
  updateClientBillingDocument,
  updateClientBillingInline,
  updateOrderBillingLink,
} from "@/lib/billing/billing";
import { ClientDocumentFileValidationError } from "@/lib/billing/files";
import {
  ClientDocumentExtractionProviderError,
  getClientDocumentExtractionProvider,
} from "@/lib/billing/openai-provider";
import {
  ClientDocumentProcessingError,
  processClientDocument,
} from "@/lib/billing/process";
import {
  QuoteExtractionBusyError,
  withQuoteExtractionGuard,
} from "@/lib/quote-intake/operational-guard";
import { fieldErrorMap } from "@/domain/validation/issues";

export async function processClientDocumentAction(
  _: ClientDocumentProcessingState,
  formData: FormData,
): Promise<ClientDocumentProcessingState> {
  const actor = await requireMasterDataEditor();
  try {
    const review = await withQuoteExtractionGuard(actor.id, () =>
      processClientDocument(
        formData.get("clientDocument"),
        getClientDocumentExtractionProvider(),
      ),
    );
    return {
      message:
        "Extraction complete. Review and confirm every authoritative value.",
      review,
      status: "ready",
    };
  } catch (error) {
    if (
      error instanceof ClientDocumentFileValidationError ||
      error instanceof ClientDocumentExtractionProviderError ||
      error instanceof ClientDocumentProcessingError ||
      error instanceof QuoteExtractionBusyError
    ) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to process Client billing document.", error);
    return {
      message: "The Client PDF could not be processed. Please retry.",
      status: "error",
    };
  }
}

export async function confirmClientDocumentAction(
  _: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const actor = await requireMasterDataEditor();
  const input = parseClientBillingConfirmation(formData);
  if (!input.success) {
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError:
        input.error.issues[0]?.message ?? "Review the Client billing values.",
      message:
        input.error.issues[0]?.message ?? "Review the Client billing values.",
      status: "error",
      values: Object.fromEntries(
        [...formData.entries()].filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    };
  }
  try {
    const recordId = await confirmClientBillingDocument(actor.id, input.data);
    revalidatePath("/billing");
    revalidatePath("/payments");
    revalidatePath(`/projects/${input.data.projectId}`);
    revalidatePath("/reports");
    return {
      message: `Client ${input.data.documentType.toLowerCase()} saved after review.`,
      recordId,
      status: "success",
    };
  } catch (error) {
    if (error instanceof ClientBillingValidationError) {
      return {
        formError: error.message,
        message: error.message,
        status: "error",
      };
    }
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return {
        formError:
          "A Client document already uses this type and reference. Choose explicit update or change the reference.",
        message:
          "A Client document already uses this type and reference. Choose explicit update or change the reference.",
        status: "error",
      };
    }
    console.error("Unable to confirm Client billing document.", error);
    return {
      formError: "The reviewed Client billing document could not be saved.",
      message: "The reviewed Client billing document could not be saved.",
      status: "error",
    };
  }
}

export async function recordClientReceiptAction(
  _: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const actor = await requireMasterDataEditor();
  const input = clientReceiptSchema.safeParse(Object.fromEntries(formData));
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the receipt.",
      message: input.error.issues[0]?.message ?? "Check the receipt.",
      status: "error",
    };
  try {
    await recordClientReceipt(actor.id, input.data);
    revalidatePath("/billing");
    revalidatePath("/payments");
    revalidatePath("/projects", "layout");
    return { message: "Client receipt recorded.", status: "success" };
  } catch (error) {
    if (
      error instanceof ClientBillingValidationError ||
      error instanceof ClientBillingNotFoundError
    )
      return {
        formError: error.message,
        message: error.message,
        status: "error",
      };
    console.error("Unable to record Client receipt.", error);
    return {
      formError: "The Client receipt could not be recorded.",
      message: "The Client receipt could not be recorded.",
      status: "error",
    };
  }
}

export async function updateClientBillingInstallmentAction(
  _: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const actor = await requireMasterDataEditor();
  const input = clientBillingInstallmentUpdateSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the installment.",
      message: input.error.issues[0]?.message ?? "Check the installment.",
      status: "error",
    };
  try {
    const values = await updateClientBillingInstallment(actor.id, input.data);
    revalidatePath("/billing");
    revalidatePath(`/billing/${input.data.billingDocumentId}`);
    revalidatePath("/payments");
    revalidatePath("/projects", "layout");
    revalidatePath("/reports");
    return {
      message: "Payment installment updated.",
      status: "success",
      values,
    };
  } catch (error) {
    if (
      error instanceof ClientBillingValidationError &&
      (error.message.includes("Scheduled amount") ||
        error.message.includes("payment schedule"))
    )
      return {
        fieldErrors: { scheduledAmount: error.message },
        formError: error.message,
        message: error.message,
        status: "error",
      };
    const expected = expectedBillingError(error);
    if (expected) return expected;
    console.error("Unable to update Client Billing installment.", error);
    return {
      formError: "The payment installment could not be updated.",
      message: "The payment installment could not be updated.",
      status: "error",
    };
  }
}

export async function updateClientBillingInlineAction(
  formData: FormData,
): Promise<BillingActionState> {
  const actor = await requireMasterDataEditor();
  const input = inlineClientBillingSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      message: input.error.issues[0]?.message ?? "Check the billing row.",
      status: "error",
    };
  try {
    await updateClientBillingInline(actor.id, input.data);
    revalidatePath("/billing");
    return { message: "Billing row updated.", status: "success" };
  } catch (error) {
    if (
      error instanceof ClientBillingValidationError ||
      error instanceof ClientBillingNotFoundError
    ) {
      return {
        message: error.message || "Billing document not found.",
        status: "error",
      };
    }
    console.error("Unable to update Client billing row.", error);
    return {
      message: "The billing row could not be updated.",
      status: "error",
    };
  }
}

function expectedBillingError(error: unknown): BillingActionState | null {
  if (
    error instanceof ClientBillingValidationError ||
    error instanceof ClientBillingNotFoundError
  )
    return {
      formError: error.message || "Billing Event not found.",
      message: error.message || "Billing Event not found.",
      status: "error",
    };
  if (error instanceof Error && "code" in error && error.code === "P2002")
    return {
      formError: "A Client Billing Event already uses this type and reference.",
      message: "A Client Billing Event already uses this type and reference.",
      status: "error",
    };
  return null;
}

export async function updateClientBillingDocumentAction(
  _: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const actor = await requireMasterDataEditor();
  const input = parseBillingDocumentEdit(formData);
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the Billing Event.",
      message: input.error.issues[0]?.message ?? "Check the Billing Event.",
      status: "error",
    };
  try {
    await updateClientBillingDocument(actor.id, input.data);
    revalidatePath("/billing");
    revalidatePath(`/billing/${input.data.id}`);
    revalidatePath(`/projects/${input.data.projectId}`);
    revalidatePath("/orders", "layout");
    revalidatePath("/reports");
    return { message: "Billing Event updated.", status: "success" };
  } catch (error) {
    const expected = expectedBillingError(error);
    if (expected) return expected;
    console.error("Unable to update Client Billing Event.", error);
    return {
      formError: "The Billing Event could not be updated.",
      message: "The Billing Event could not be updated.",
      status: "error",
    };
  }
}

export async function updateClientBillingAllocationsAction(
  _: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const actor = await requireMasterDataEditor();
  const input = parseBillingAllocationsEdit(formData);
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the allocations.",
      message: input.error.issues[0]?.message ?? "Check the allocations.",
      status: "error",
    };
  try {
    await updateClientBillingAllocations(actor.id, input.data);
    revalidatePath("/billing");
    revalidatePath(`/billing/${input.data.billingDocumentId}`);
    revalidatePath("/orders", "layout");
    revalidatePath("/projects", "layout");
    revalidatePath("/reports");
    return { message: "Order reconciliation updated.", status: "success" };
  } catch (error) {
    const expected = expectedBillingError(error);
    if (expected) return expected;
    console.error("Unable to update Client Billing allocations.", error);
    return {
      formError: "The Order reconciliation could not be updated.",
      message: "The Order reconciliation could not be updated.",
      status: "error",
    };
  }
}

export async function updateOrderBillingLinkAction(
  _: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const actor = await requireMasterDataEditor();
  const input = parseOrderBillingLink(formData);
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the allocation.",
      message: input.error.issues[0]?.message ?? "Check the allocation.",
      status: "error",
    };
  try {
    await updateOrderBillingLink(actor.id, input.data);
    revalidatePath("/billing");
    revalidatePath(`/billing/${input.data.billingDocumentId}`);
    revalidatePath(`/orders/${input.data.orderId}`);
    revalidatePath(`/projects`, "layout");
    revalidatePath("/reports");
    return {
      message: input.data.remove
        ? "Billing allocation removed."
        : "Billing allocation saved.",
      status: "success",
    };
  } catch (error) {
    if (error instanceof ClientBillingValidationError)
      return {
        fieldErrors: { allocatedAmount: error.message },
        formError: error.message,
        message: error.message,
        status: "error",
      };
    const expected = expectedBillingError(error);
    if (expected) return expected;
    console.error("Unable to update the Order Billing link.", error);
    return {
      formError: "The Billing allocation could not be saved.",
      message: "The Billing allocation could not be saved.",
      status: "error",
    };
  }
}
