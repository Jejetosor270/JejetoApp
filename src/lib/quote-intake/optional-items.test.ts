import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPTIONAL_QUOTE_ITEMS_TIMEOUT_MS } from "@/config/item-extraction";
import type { ItemExtractionProvider } from "@/lib/items/extraction-provider";
import type { TemporaryQuoteFile } from "./provider";

vi.mock("server-only", () => ({}));
const lifecycle = vi.hoisted(() => ({
  logSupplierOrderImportLifecycle: vi.fn(),
}));
vi.mock("./lifecycle", () => lifecycle);

import { startOptionalItemExtraction } from "./optional-items";

const requestId = "3e72ad2d-97c0-4462-93b3-315dceccbb82";
const file: TemporaryQuoteFile = {
  bytes: new Uint8Array([1, 2, 3]),
  filename: "private-document.pdf",
  mediaType: "application/pdf",
};
const extracted = {
  extraction: { currencyCode: "EUR", items: [], warnings: [] },
  model: "mock-model",
  provider: "mock",
};

function mockProvider() {
  return {
    extractQuoteItems: vi.fn<ItemExtractionProvider["extractQuoteItems"]>(),
    suggestSpreadsheetMapping: vi.fn(),
  };
}

describe("optional Item extraction budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("preserves results and clears the timer after one successful call", async () => {
    const provider = mockProvider();
    provider.extractQuoteItems.mockResolvedValue(extracted);
    const stage = startOptionalItemExtraction(file, provider, requestId);
    expect(await stage.result).toEqual({
      extraction: extracted,
      warning: null,
    });
    expect(provider.extractQuoteItems).toHaveBeenCalledExactlyOnceWith(file, {
      requestId,
      signal: expect.any(AbortSignal),
    });
    expect(vi.getTimerCount()).toBe(0);
    stage.cancel();
    expect(provider.extractQuoteItems.mock.calls[0]?.[1]?.signal?.aborted).toBe(
      false,
    );
    expect(lifecycle.logSupplierOrderImportLifecycle).toHaveBeenCalledWith(
      "supplier_order_import.items_completed",
      expect.objectContaining({
        elapsedMs: 0,
        requestId,
        extractedItemCount: 0,
      }),
    );
  });

  it("enforces 30 seconds even if the provider ignores cancellation", async () => {
    const provider = mockProvider();
    let rejectLate: (reason: Error) => void = () => {};
    provider.extractQuoteItems.mockReturnValue(
      new Promise((_, reject) => {
        rejectLate = reject;
      }),
    );
    const stage = startOptionalItemExtraction(file, provider, requestId);
    const resolved = vi.fn();
    void stage.result.then(resolved);
    await vi.advanceTimersByTimeAsync(OPTIONAL_QUOTE_ITEMS_TIMEOUT_MS - 1);
    expect(resolved).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await stage.result).toEqual({
      extraction: null,
      warning: expect.stringContaining("timed out"),
    });
    expect(provider.extractQuoteItems.mock.calls[0]?.[1]?.signal?.aborted).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
    rejectLate(new Error("Private late provider failure"));
    await Promise.resolve();
    expect(
      lifecycle.logSupplierOrderImportLifecycle,
    ).toHaveBeenCalledExactlyOnceWith(
      "supplier_order_import.items_skipped",
      expect.objectContaining({
        elapsedMs: 30_000,
        timeoutMs: 30_000,
        errorClassification: "timeout",
        requestId,
      }),
    );
    expect(
      JSON.stringify(lifecycle.logSupplierOrderImportLifecycle.mock.calls),
    ).not.toContain("Private");
  });

  it("turns unexpected optional failures into a safe nonfatal warning", async () => {
    const provider = mockProvider();
    provider.extractQuoteItems.mockRejectedValue(
      new Error("private document content"),
    );
    const stage = startOptionalItemExtraction(file, provider, requestId);
    expect(await stage.result).toEqual({
      extraction: null,
      warning: expect.stringContaining(
        "Aggregate Order review remains available",
      ),
    });
    expect(lifecycle.logSupplierOrderImportLifecycle).toHaveBeenCalledWith(
      "supplier_order_import.items_skipped",
      expect.objectContaining({ errorClassification: "unexpected" }),
    );
    expect(
      JSON.stringify(lifecycle.logSupplierOrderImportLifecycle.mock.calls),
    ).not.toContain("private document");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an in-flight optional call immediately after aggregate failure", async () => {
    const provider = mockProvider();
    provider.extractQuoteItems.mockReturnValue(new Promise(() => {}));
    const stage = startOptionalItemExtraction(file, provider, requestId);
    await Promise.resolve();
    stage.cancel();
    expect((await stage.result).extraction).toBeNull();
    expect(provider.extractQuoteItems.mock.calls[0]?.[1]?.signal?.aborted).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(lifecycle.logSupplierOrderImportLifecycle).toHaveBeenCalledWith(
      "supplier_order_import.items_skipped",
      expect.objectContaining({
        errorClassification: "cancelled",
        elapsedMs: 0,
      }),
    );
  });
});
