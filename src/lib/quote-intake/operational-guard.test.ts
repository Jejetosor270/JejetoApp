import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  QuoteExtractionBusyError,
  resetQuoteExtractionGuardForTests,
  withQuoteExtractionGuard,
} from "@/lib/quote-intake/operational-guard";

describe("quote extraction operational guard", () => {
  beforeEach(resetQuoteExtractionGuardForTests);

  it("rejects a duplicate concurrent extraction for the same employee", async () => {
    let releaseFirst: (() => void) | undefined;
    const first = withQuoteExtractionGuard(
      "employee-1",
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );

    await expect(
      withQuoteExtractionGuard("employee-1", async () => undefined),
    ).rejects.toBeInstanceOf(QuoteExtractionBusyError);
    releaseFirst?.();
    await first;
  });

  it("limits repeated extraction bursts without affecting another employee", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await withQuoteExtractionGuard("employee-1", async () => undefined);
    }
    await expect(
      withQuoteExtractionGuard("employee-1", async () => undefined),
    ).rejects.toThrow("Too many quote extraction attempts");
    await expect(
      withQuoteExtractionGuard("employee-2", async () => "ok"),
    ).resolves.toBe("ok");
  });
});
