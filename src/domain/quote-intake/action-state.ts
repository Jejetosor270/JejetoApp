import type { ProcessedQuoteReview } from "@/lib/quote-intake/process";

export interface QuoteProcessingActionState {
  message?: string;
  review?: ProcessedQuoteReview;
  status?: "error" | "ready";
}

export interface QuoteConfirmationActionState {
  fieldErrors?: Record<string, string>;
  message?: string;
  orderId?: string;
  status?: "error" | "success";
}

export interface QuoteSupplierCreationActionState {
  duplicateCandidates?: Array<{
    basis: "VAT_NUMBER" | "LEGAL_NAME" | "DISPLAY_NAME";
    displayName: string;
    id: string;
  }>;
  fieldErrors?: Record<string, string>;
  message?: string;
  status?: "duplicate" | "error" | "success";
  supplier?: { displayName: string; id: string };
  values?: import("./supplier-creation").QuoteSupplierDraftValues;
}

export const initialQuoteProcessingState: QuoteProcessingActionState = {};
export const initialQuoteConfirmationState: QuoteConfirmationActionState = {};
export const initialQuoteSupplierCreationState: QuoteSupplierCreationActionState =
  {};
