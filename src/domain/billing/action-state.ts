import type { ProcessedClientDocumentReview } from "@/lib/billing/process";

export interface BillingActionState {
  fieldErrors?: Record<string, string> | undefined;
  message: string;
  recordId?: string | undefined;
  status: "idle" | "error" | "success";
  values?: Record<string, string> | undefined;
}

export interface ClientDocumentProcessingState {
  message: string;
  review?: ProcessedClientDocumentReview | undefined;
  status: "idle" | "error" | "ready";
}
