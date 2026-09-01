import { describe, expect, it } from "vitest";

vi.mock("server-only", () => ({}));

import { vi } from "vitest";
import {
  ClientDocumentFileValidationError,
  validateTemporaryClientDocument,
} from "./files";

describe("temporary Client PDF validation", () => {
  it("accepts a genuine PDF without persisting it", async () => {
    const file = new File(
      [new Uint8Array([37, 80, 68, 70, 45, 10])],
      "quote.pdf",
      { type: "application/pdf" },
    );
    const result = await validateTemporaryClientDocument(file);
    expect(result.filename).toBe("quote.pdf");
    expect(result.bytes).toEqual(new Uint8Array([37, 80, 68, 70, 45, 10]));
  });

  it("rejects a renamed non-PDF", async () => {
    const file = new File(["not a pdf"], "invoice.pdf", {
      type: "application/pdf",
    });
    await expect(validateTemporaryClientDocument(file)).rejects.toBeInstanceOf(
      ClientDocumentFileValidationError,
    );
  });
});
