import "server-only";

import type { ClientDocumentExtraction } from "@/domain/billing/extraction";

export interface TemporaryClientDocumentFile {
  bytes: Uint8Array;
  filename: string;
  mediaType: "application/pdf";
}

export interface ClientDocumentExtractionResult {
  extraction: ClientDocumentExtraction;
  model: string;
  provider: string;
}

export interface ClientDocumentExtractionProvider {
  extract(
    file: TemporaryClientDocumentFile,
  ): Promise<ClientDocumentExtractionResult>;
}
