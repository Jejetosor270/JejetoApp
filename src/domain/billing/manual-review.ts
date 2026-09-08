import type { ProcessedClientDocumentReview } from "@/lib/billing/process";
import { businessToday } from "@/domain/payments/dates";
export function manualBillingReview(): ProcessedClientDocumentReview {
  const missing = { status: "MISSING" as const, value: null, diagnostic: null };
  return {
    clientSuggestionId: null,
    projectSuggestionId: null,
    duplicateCandidates: [],
    model: "manual",
    provider: "manual",
    originalFilename: "Manual billing entry",
    extraction: {
      documentType: missing,
      clientName: missing,
      projectReference: missing,
      reference: missing,
      documentDate: missing,
      dueDate: missing,
      currencyCode: missing,
      totalHt: missing,
      freightCoverageHt: missing,
      vatLines: [],
      vatAmount: missing,
      totalTtc: missing,
      paymentTerms: { raw: missing, installments: [] },
      notes: missing,
      warnings: [],
    },
    proposal: {
      currencyCode: null,
      documentDate: businessToday(),
      documentType: "INVOICE",
      dueDate: null,
      installments: [],
      notes: null,
      paymentTermsRaw: null,
      reference: null,
      totalHt: null,
      freightCoverageHt: null,
      totalTtc: null,
      vatAmount: null,
      vatRate: null,
      warnings: [],
    },
  };
}
