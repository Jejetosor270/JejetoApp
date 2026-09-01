import "server-only";

import {
  MAX_CLIENT_DOCUMENT_BYTES,
  MAX_CLIENT_DOCUMENT_LABEL,
} from "@/config/client-document-extraction";

import type { TemporaryClientDocumentFile } from "./provider";

export class ClientDocumentFileValidationError extends Error {}

export async function validateTemporaryClientDocument(
  value: FormDataEntryValue | null,
): Promise<TemporaryClientDocumentFile> {
  if (!(value instanceof File) || value.size === 0) {
    throw new ClientDocumentFileValidationError("Choose a non-empty PDF.");
  }
  if (value.size > MAX_CLIENT_DOCUMENT_BYTES) {
    throw new ClientDocumentFileValidationError(
      `The PDF must not exceed ${MAX_CLIENT_DOCUMENT_LABEL}.`,
    );
  }
  const filename =
    value.name
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 255) ?? "";
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new ClientDocumentFileValidationError(
      "Only PDF documents are accepted.",
    );
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (
    bytes.length < 5 ||
    ![0x25, 0x50, 0x44, 0x46, 0x2d].every(
      (signature, index) => bytes[index] === signature,
    )
  ) {
    bytes.fill(0);
    throw new ClientDocumentFileValidationError(
      "The uploaded file is not a genuine PDF.",
    );
  }
  return { bytes, filename, mediaType: "application/pdf" };
}
