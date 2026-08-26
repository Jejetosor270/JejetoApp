"use server";

import { revalidatePath } from "next/cache";

import type {
  QuoteConfirmationActionState,
  QuoteProcessingActionState,
  QuoteSupplierCreationActionState,
} from "@/domain/quote-intake/action-state";
import { createSupplierInputSchema } from "@/domain/master-data/validation";
import { parseQuoteConfirmation } from "@/domain/quote-intake/confirmation";
import {
  quoteSupplierDraftValues,
  supplierCreationFieldErrors,
} from "@/domain/quote-intake/supplier-creation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { isExpectedMasterDataError } from "@/lib/master-data/errors";
import { createSupplier } from "@/lib/master-data/suppliers";
import { isDuplicateOrderReferenceError } from "@/lib/procurement/errors";
import {
  confirmSupplierQuote,
  QuoteConfirmationError,
} from "@/lib/quote-intake/confirmation";
import { QuoteFileValidationError } from "@/lib/quote-intake/files";
import { getQuoteExtractionProvider } from "@/lib/quote-intake/extractor";
import { QuoteExtractionProviderError } from "@/lib/quote-intake/openai-provider";
import {
  processSupplierQuote,
  QuoteProcessingError,
} from "@/lib/quote-intake/process";
import { findQuoteSupplierDuplicates } from "@/lib/quote-intake/supplier-creation";

export async function processSupplierQuoteAction(
  _: QuoteProcessingActionState,
  formData: FormData,
): Promise<QuoteProcessingActionState> {
  await requireMasterDataEditor();
  const projectId = formData.get("projectId");
  try {
    const review = await processSupplierQuote(
      typeof projectId === "string" ? projectId : "",
      formData.get("quoteFile"),
      getQuoteExtractionProvider(),
    );
    return {
      message:
        "Extraction complete. Review every proposed value before saving.",
      review,
      status: "ready",
    };
  } catch (error) {
    if (
      error instanceof QuoteFileValidationError ||
      error instanceof QuoteProcessingError ||
      error instanceof QuoteExtractionProviderError
    ) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to process supplier quote.", error);
    return {
      message:
        "The quote could not be processed. Check the file and try again.",
      status: "error",
    };
  }
}

export async function createQuoteSupplierAction(
  _: QuoteSupplierCreationActionState,
  formData: FormData,
): Promise<QuoteSupplierCreationActionState> {
  const actor = await requireMasterDataEditor();
  const values = quoteSupplierDraftValues(formData);
  const input = createSupplierInputSchema.safeParse(values);
  if (!input.success) {
    return {
      fieldErrors: supplierCreationFieldErrors(input.error),
      message:
        input.error.issues[0]?.message ??
        "Review the new Supplier details before creating it.",
      status: "error",
      values,
    };
  }
  try {
    const duplicateCandidates = await findQuoteSupplierDuplicates(input.data);
    if (duplicateCandidates.length) {
      return {
        duplicateCandidates,
        message:
          "A probable existing Supplier was found. Select it instead of creating a duplicate.",
        status: "duplicate",
        values,
      };
    }
    const supplier = await createSupplier(actor.id, input.data);
    revalidatePath("/suppliers");
    return {
      message: "Supplier created and selected for this quote.",
      status: "success",
      supplier: { displayName: supplier.displayName, id: supplier.id },
      values,
    };
  } catch (error) {
    if (isExpectedMasterDataError(error)) {
      return { message: error.message, status: "error", values };
    }
    console.error("Unable to create Supplier from quote review.", error);
    return {
      message: "The Supplier could not be created. Please try again.",
      status: "error",
      values,
    };
  }
}

export async function confirmSupplierQuoteAction(
  _: QuoteConfirmationActionState,
  formData: FormData,
): Promise<QuoteConfirmationActionState> {
  const actor = await requireMasterDataEditor();
  const input = parseQuoteConfirmation(formData);
  if (!input.success) {
    const fieldErrors = Object.fromEntries(
      input.error.issues.map((issue) => [
        issue.path.map(String).join("."),
        issue.message,
      ]),
    );
    return {
      fieldErrors,
      message:
        input.error.issues[0]?.message ??
        "Check the reviewed quote values before saving.",
      status: "error",
    };
  }
  try {
    const orderId = await confirmSupplierQuote(actor.id, input.data);
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/projects/${input.data.projectId}`);
    revalidatePath("/payments");
    revalidatePath("/calendar");
    revalidatePath("/reports");
    return {
      message:
        input.data.action === "CREATE"
          ? "Draft Procurement Order created from the reviewed quote."
          : "Procurement Order updated from the reviewed quote.",
      orderId,
      status: "success",
    };
  } catch (error) {
    if (isDuplicateOrderReferenceError(error)) {
      return {
        message: "An Order already uses this internal reference.",
        status: "error",
      };
    }
    if (error instanceof QuoteConfirmationError) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to confirm supplier quote.", error);
    return {
      message: "The reviewed quote could not be saved. Please try again.",
      status: "error",
    };
  }
}
