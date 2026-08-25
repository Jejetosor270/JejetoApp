import type { ProcessedQuoteReview } from "@/lib/quote-intake/process";

export interface QuoteProcessingActionState {
  message?: string;
  review?: ProcessedQuoteReview;
  status?: "error" | "ready";
}

export interface QuoteConfirmationActionState {
  message?: string;
  orderId?: string;
  status?: "error" | "success";
}

export const initialQuoteProcessingState: QuoteProcessingActionState = {};
export const initialQuoteConfirmationState: QuoteConfirmationActionState = {};
