import { describe, expect, it, vi } from "vitest";

import { MAX_QUOTE_FILE_BYTES } from "@/config/quote-extraction";

vi.mock("server-only", () => ({}));

import {
  QuoteFileValidationError,
  validateTemporaryQuoteFile,
} from "@/lib/quote-intake/files";

describe("temporary supplier quote files", () => {
  it("accepts a genuine PDF into memory", async () => {
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])],
      "quote.pdf",
      { type: "application/pdf" },
    );
    const validated = await validateTemporaryQuoteFile(file);
    expect(validated).toMatchObject({
      filename: "quote.pdf",
      mediaType: "application/pdf",
    });
    expect(validated.bytes).toBeInstanceOf(Uint8Array);
  });

  it.each([
    {
      bytes: [0xff, 0xd8, 0xff, 0xe0],
      filename: "quote.jpeg",
      mediaType: "image/jpeg",
    },
    {
      bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      filename: "quote.png",
      mediaType: "image/png",
    },
  ])("accepts genuine $mediaType image content", async (example) => {
    const validated = await validateTemporaryQuoteFile(
      new File([new Uint8Array(example.bytes)], example.filename, {
        type: "application/octet-stream",
      }),
    );
    expect(validated.mediaType).toBe(example.mediaType);
  });

  it("rejects extension spoofing and oversized files", async () => {
    const spoofed = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "quote.pdf",
      { type: "application/pdf" },
    );
    await expect(validateTemporaryQuoteFile(spoofed)).rejects.toBeInstanceOf(
      QuoteFileValidationError,
    );

    const oversized = new File(
      [new Uint8Array(MAX_QUOTE_FILE_BYTES + 1)],
      "quote.png",
      { type: "image/png" },
    );
    await expect(validateTemporaryQuoteFile(oversized)).rejects.toThrow(
      "must not exceed",
    );
  });
});
