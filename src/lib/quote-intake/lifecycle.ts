import "server-only";

export type SupplierOrderImportLifecycleEvent =
  | "supplier_order_import.started"
  | "supplier_order_import.extraction_completed"
  | "supplier_order_import.items_completed"
  | "supplier_order_import.items_skipped"
  | "supplier_order_import.review_built"
  | "supplier_order_import.validation_failed"
  | "supplier_order_import.confirmation_started"
  | "supplier_order_import.confirmation_completed"
  | "supplier_order_import.failed";

interface SupplierOrderImportLifecycleMetadata {
  elapsedMs?: number;
  databaseErrorCode?: string;
  errorClassification?: string;
  extractedItemCount?: number;
  extractionStatus?: string;
  missingRequiredFields?: string[];
  model?: string;
  provider?: string;
  requestId: string;
  stage: "confirmation" | "extraction" | "items" | "review";
  supplierMatched?: boolean;
  warningCount?: number;
  timeoutMs?: number;
}

/** Logs only bounded workflow metadata; document values and file contents are excluded. */
export function logSupplierOrderImportLifecycle(
  event: SupplierOrderImportLifecycleEvent,
  metadata: SupplierOrderImportLifecycleMetadata,
): void {
  const output = { event, ...metadata };
  if (event === "supplier_order_import.failed") {
    console.error(event, output);
  } else if (
    event === "supplier_order_import.validation_failed" ||
    event === "supplier_order_import.items_skipped"
  ) {
    console.warn(event, output);
  } else {
    console.info(event, output);
  }
}
