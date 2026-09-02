"use server";

import { revalidatePath } from "next/cache";

import {
  clientReceiptSchema,
  inlineClientBillingSchema,
  parseClientBillingConfirmation,
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
  updateClientBillingInline,
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
      return { message: error.message, status: "error" };
    }
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return {
        message:
          "A Client document already uses this type and reference. Choose explicit update or change the reference.",
        status: "error",
      };
    }
    console.error("Unable to confirm Client billing document.", error);
    return {
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
      return { message: error.message, status: "error" };
    console.error("Unable to record Client receipt.", error);
    return {
      message: "The Client receipt could not be recorded.",
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
