import "server-only";

import {
  MAX_QUOTE_FILE_BYTES,
  MAX_QUOTE_FILE_LABEL,
} from "@/config/quote-extraction";

import type { TemporaryQuoteFile } from "./provider";

export class QuoteFileValidationError extends Error {}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function detectedMediaType(
  bytes: Uint8Array,
): TemporaryQuoteFile["mediaType"] | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  return null;
}

function safeFilename(value: string): string {
  const finalSegment = value.split(/[\\/]/).at(-1)?.trim() ?? "";
  const normalized = finalSegment.replace(/[\u0000-\u001f\u007f]/g, "");
  return normalized.slice(0, 255);
}

function expectedExtensions(
  mediaType: TemporaryQuoteFile["mediaType"],
): readonly string[] {
  if (mediaType === "application/pdf") return [".pdf"];
  if (mediaType === "image/png") return [".png"];
  return [".jpg", ".jpeg"];
}

export async function validateTemporaryQuoteFile(
  value: FormDataEntryValue | null,
): Promise<TemporaryQuoteFile> {
  if (!(value instanceof File) || value.size === 0) {
    throw new QuoteFileValidationError("Choose a non-empty quote file.");
  }
  if (value.size > MAX_QUOTE_FILE_BYTES) {
    throw new QuoteFileValidationError(
      `The quote file must not exceed ${MAX_QUOTE_FILE_LABEL}.`,
    );
  }
  const filename = safeFilename(value.name);
  if (!filename) {
    throw new QuoteFileValidationError("The quote filename is invalid.");
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  const mediaType = detectedMediaType(bytes);
  if (!mediaType) {
    throw new QuoteFileValidationError(
      "Only genuine PDF, JPG, JPEG, and PNG quote files are accepted.",
    );
  }
  const lowercaseName = filename.toLowerCase();
  if (
    !expectedExtensions(mediaType).some((item) => lowercaseName.endsWith(item))
  ) {
    throw new QuoteFileValidationError(
      "The filename extension does not match the quote file content.",
    );
  }
  return { bytes, filename, mediaType };
}
