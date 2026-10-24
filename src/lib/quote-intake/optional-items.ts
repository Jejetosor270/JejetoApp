import "server-only";

import { OPTIONAL_QUOTE_ITEMS_TIMEOUT_MS } from "@/config/item-extraction";
import {
  ItemExtractionProviderError,
  type ItemExtractionProvider,
} from "@/lib/items/extraction-provider";

import { logSupplierOrderImportLifecycle } from "./lifecycle";
import type { TemporaryQuoteFile } from "./provider";

type ItemResult = Awaited<
  ReturnType<ItemExtractionProvider["extractQuoteItems"]>
>;

/** A hard optional-stage deadline, including configuration and response-body reads. */
export function startOptionalItemExtraction(
  file: TemporaryQuoteFile,
  provider: ItemExtractionProvider,
  requestId: string,
): {
  result: Promise<{ extraction: ItemResult | null; warning: string | null }>;
  cancel: () => void;
} {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  let finished = false;
  let abort: () => void = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("Optional Item extraction stopped."));
    controller.signal.addEventListener("abort", abort, { once: true });
  });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(
      new DOMException("Optional Items deadline reached.", "TimeoutError"),
    );
  }, OPTIONAL_QUOTE_ITEMS_TIMEOUT_MS);
  const operation = Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return provider.extractQuoteItems(file, {
      requestId,
      signal: controller.signal,
    });
  });
  const result = Promise.race([operation, cancellation])
    .then(
      (extraction) => {
        logSupplierOrderImportLifecycle(
          "supplier_order_import.items_completed",
          {
            elapsedMs: Date.now() - startedAt,
            extractedItemCount: extraction.extraction.items.length,
            model: extraction.model,
            provider: extraction.provider,
            requestId,
            stage: "items",
          },
        );
        return { extraction, warning: null };
      },
      (error: unknown) => {
        const cancelled = controller.signal.aborted && !timedOut;
        logSupplierOrderImportLifecycle("supplier_order_import.items_skipped", {
          elapsedMs: Date.now() - startedAt,
          errorClassification: timedOut
            ? "timeout"
            : cancelled
              ? "cancelled"
              : error instanceof ItemExtractionProviderError
                ? error.category
                : "unexpected",
          requestId,
          stage: "items",
          timeoutMs: OPTIONAL_QUOTE_ITEMS_TIMEOUT_MS,
        });
        return {
          extraction: null,
          warning: timedOut
            ? "Item-line extraction timed out. Aggregate Order review remains available; Items can be added later."
            : "Item-line extraction was unavailable. Aggregate Order review remains available; Items can be added later.",
        };
      },
    )
    .finally(() => {
      finished = true;
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", abort);
    });
  return {
    result,
    cancel: () => {
      if (!finished) controller.abort();
    },
  };
}
