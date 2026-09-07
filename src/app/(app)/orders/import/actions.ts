"use server";

import { z } from "zod";
import { previewReviewedBillingBasis } from "@/lib/quote-intake/confirmation";
import { randomUUID } from "node:crypto";

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
import {
  getItemExtractionProvider,
  ItemExtractionProviderError,
} from "@/lib/items/extraction-provider";
import {
  isDuplicateOrderReferenceError,
  ProcurementNotFoundError,
  ProcurementRelationError,
} from "@/lib/procurement/errors";
import { Prisma } from "@/generated/prisma/client";
import {
  confirmSupplierQuote,
  QuoteConfirmationError,
} from "@/lib/quote-intake/confirmation";
import {
  ClientBillingNotFoundError,
  ClientBillingValidationError,
} from "@/lib/billing/billing";
import { revalidateProjectFinancialViews } from "@/lib/reporting/revalidation";
import { QuoteFileValidationError } from "@/lib/quote-intake/files";
import { getQuoteExtractionProvider } from "@/lib/quote-intake/extractor";
import { QuoteExtractionProviderError } from "@/lib/quote-intake/openai-provider";
import {
  processSupplierQuote,
  QuoteProcessingError,
} from "@/lib/quote-intake/process";
import { findQuoteSupplierDuplicates } from "@/lib/quote-intake/supplier-creation";
import {
  QuoteExtractionBusyError,
  withQuoteExtractionGuard,
} from "@/lib/quote-intake/operational-guard";
import { isItemManagementEnabled } from "@/lib/settings/application-settings";
import { QUOTE_EXTRACTION_PROVIDER } from "@/config/quote-extraction";
import { getAiProcessingModel } from "@/lib/settings/ai-processing-settings";
import { logSupplierOrderImportLifecycle } from "@/lib/quote-intake/lifecycle";

function importRequestId(formData: FormData): string {
  const candidate = formData.get("importRequestId");
  return typeof candidate === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate,
    )
    ? candidate
    : randomUUID();
}

async function extractionModelForLogging(): Promise<string> {
  try {
    return await getAiProcessingModel("quoteExtractionModel");
  } catch {
    return "invalid-configuration";
  }
}

function processingFailureClassification(error: unknown): string {
  if (error instanceof QuoteExtractionProviderError) return error.category;
  if (error instanceof QuoteFileValidationError) return "file_validation";
  if (error instanceof QuoteProcessingError) return "review_processing";
  if (error instanceof ItemExtractionProviderError) return "item_extraction";
  if (error instanceof QuoteExtractionBusyError) return "rate_limit";
  return "unexpected";
}

function missingReviewFields(review: {
  proposal: {
    financial: { currencyCode: string | null; purchaseCost: string | null };
  };
  supplierMatch: { suggestedSupplierId: string | null };
}): string[] {
  return [
    "internalOrderReference",
    ...(review.supplierMatch.suggestedSupplierId ? [] : ["supplierId"]),
    ...(review.proposal.financial.currencyCode ? [] : ["orderCurrencyCode"]),
    ...(review.proposal.financial.purchaseCost ? [] : ["purchaseCost"]),
  ];
}

export async function processSupplierQuoteAction(
  _: QuoteProcessingActionState,
  formData: FormData,
): Promise<QuoteProcessingActionState> {
  const actor = await requireMasterDataEditor();
  const requestId = randomUUID();
  const projectId = formData.get("projectId");
  const model = await extractionModelForLogging();
  logSupplierOrderImportLifecycle("supplier_order_import.started", {
    model,
    provider: QUOTE_EXTRACTION_PROVIDER,
    requestId,
    stage: "extraction",
  });
  try {
    const itemsEnabled = await isItemManagementEnabled();
    const review = await withQuoteExtractionGuard(actor.id, () =>
      processSupplierQuote(
        typeof projectId === "string" ? projectId : "",
        formData.get("quoteFile"),
        getQuoteExtractionProvider(),
        itemsEnabled ? getItemExtractionProvider() : undefined,
      ),
    );
    const lifecycle = {
      extractedItemCount: review.itemReview?.rows.length ?? 0,
      extractionStatus: "completed",
      model: review.model,
      provider: review.provider,
      requestId,
      supplierMatched: Boolean(review.supplierMatch.suggestedSupplierId),
      warningCount:
        review.proposal.warnings.length +
        (review.itemReview?.warnings.length ?? 0),
    };
    logSupplierOrderImportLifecycle(
      "supplier_order_import.extraction_completed",
      { ...lifecycle, stage: "extraction" },
    );
    logSupplierOrderImportLifecycle("supplier_order_import.review_built", {
      ...lifecycle,
      missingRequiredFields: missingReviewFields(review),
      stage: "review",
    });
    return {
      message:
        "Supplier document extraction complete. Review every proposed value before saving.",
      review: { ...review, requestId },
      status: "ready",
    };
  } catch (error) {
    logSupplierOrderImportLifecycle("supplier_order_import.failed", {
      errorClassification: processingFailureClassification(error),
      extractionStatus: "failed",
      model,
      provider: QUOTE_EXTRACTION_PROVIDER,
      requestId,
      stage: "extraction",
    });
    if (
      error instanceof QuoteFileValidationError ||
      error instanceof QuoteProcessingError ||
      error instanceof QuoteExtractionProviderError ||
      error instanceof ItemExtractionProviderError ||
      error instanceof QuoteExtractionBusyError
    ) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to process supplier quote.", error);
    return {
      message:
        "The Supplier document could not be processed. Check the file and try again.",
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
    revalidatePath("/items/import");
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
  const requestId = importRequestId(formData);
  logSupplierOrderImportLifecycle(
    "supplier_order_import.confirmation_started",
    { requestId, stage: "confirmation" },
  );
  // A review can outlive an administrator disabling Items Beta. Aggregate
  // confirmation remains available, without persisting disabled Item proposals.
  let itemsSkipped = false;
  if (formData.get("approveItems") === "on") {
    try {
      itemsSkipped = !(await isItemManagementEnabled());
    } catch {
      logSupplierOrderImportLifecycle("supplier_order_import.failed", {
        errorClassification: "item_settings_unavailable",
        requestId,
        stage: "confirmation",
      });
      return {
        status: "error",
        message:
          "Item availability could not be checked. Your review is still available; please try again.",
      };
    }
  }
  const confirmationData = new FormData();
  for (const [key, value] of formData) confirmationData.append(key, value);
  if (itemsSkipped) confirmationData.delete("approveItems");
  const input = parseQuoteConfirmation(confirmationData);
  if (!input.success) {
    const fieldErrors = Object.fromEntries(
      input.error.issues.map((issue) => [
        issue.path.map(String).join("."),
        issue.message,
      ]),
    );
    const missingRequiredFields = [...new Set(Object.keys(fieldErrors))];
    logSupplierOrderImportLifecycle("supplier_order_import.validation_failed", {
      errorClassification: "confirmation_validation",
      missingRequiredFields,
      requestId,
      stage: "confirmation",
    });
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
    revalidateProjectFinancialViews(input.data.projectId);
    revalidatePath("/payments");
    revalidatePath("/calendar");
    logSupplierOrderImportLifecycle(
      "supplier_order_import.confirmation_completed",
      { requestId, stage: "confirmation" },
    );
    return {
      message:
        (input.data.action === "CREATE"
          ? "Draft Order created from the reviewed quote."
          : "Order updated from the reviewed quote.") +
        (itemsSkipped
          ? " Items were not imported because Items Beta is disabled."
          : ""),
      orderId,
      status: "success",
    };
  } catch (error) {
    const vatConstraintMismatch =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.message.includes("order_vat_entries_recoverability_check");
    const errorClassification = vatConstraintMismatch
      ? "vat_recoverability_constraint"
      : isDuplicateOrderReferenceError(error)
        ? "duplicate_order_reference"
        : error instanceof QuoteConfirmationError
          ? "confirmation_business_rule"
          : error instanceof ProcurementRelationError ||
              error instanceof ProcurementNotFoundError
            ? "order_relation"
            : error instanceof ClientBillingValidationError ||
                error instanceof ClientBillingNotFoundError
              ? "optional_billing_link"
              : "unexpected";
    logSupplierOrderImportLifecycle("supplier_order_import.failed", {
      errorClassification,
      ...(error instanceof Prisma.PrismaClientKnownRequestError
        ? { databaseErrorCode: error.code }
        : {}),
      requestId,
      stage: "confirmation",
    });
    if (vatConstraintMismatch) {
      return {
        status: "error",
        message:
          "The VAT setup needs an administrator update before this Order can be saved. Your review is still available.",
      };
    }
    if (isDuplicateOrderReferenceError(error)) {
      return {
        message: "A Order already uses this internal reference.",
        status: "error",
      };
    }
    if (
      error instanceof QuoteConfirmationError ||
      error instanceof ProcurementRelationError ||
      error instanceof ProcurementNotFoundError ||
      error instanceof ClientBillingValidationError ||
      error instanceof ClientBillingNotFoundError
    ) {
      return { message: error.message, status: "error" };
    }
    return {
      message:
        "The Order could not be saved. Your review is still available; please try again.",
      status: "error",
    };
  }
}

export async function previewSupplierOrderBillingAction(
  formData: FormData,
): Promise<{ amount: string | null; message: string }> {
  await requireMasterDataEditor();
  const billing = z.uuid().safeParse(formData.get("billingDocumentId"));
  formData.set("billingDocumentId", "");
  formData.set("approveItems", "");
  const parsed = parseQuoteConfirmation(formData);
  if (!billing.success || !parsed.success)
    return {
      amount: null,
      message:
        "Complete the reviewed Order fields before calculating coverage.",
    };
  try {
    const amount = await previewReviewedBillingBasis(parsed.data, billing.data);
    return {
      amount,
      message:
        amount === null
          ? "Complete manual FX before calculating Order coverage."
          : "Coverage uses the reviewed Order pricing. No record has been saved.",
    };
  } catch (error) {
    return {
      amount: null,
      message:
        error instanceof QuoteConfirmationError
          ? error.message
          : "Coverage preview is unavailable. Your review is preserved.",
    };
  }
}
