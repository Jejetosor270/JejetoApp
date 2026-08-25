import "server-only";

import type { SupplierQuoteExtraction } from "@/domain/quote-intake/extraction";

export interface TemporaryQuoteFile {
  bytes: Uint8Array;
  filename: string;
  mediaType: "application/pdf" | "image/jpeg" | "image/png";
}

export interface QuoteExtractionResult {
  extraction: SupplierQuoteExtraction;
  model: string;
  provider: string;
}

export interface QuoteExtractionProvider {
  extract(file: TemporaryQuoteFile): Promise<QuoteExtractionResult>;
}
