import type { z } from "zod";

export type ItemExtractionFailureCategory =
  | "CONFIGURATION"
  | "TIMEOUT"
  | "ABORTED"
  | "PROVIDER"
  | "REFUSAL"
  | "INCOMPLETE"
  | "EMPTY_OUTPUT"
  | "MALFORMED_OUTPUT"
  | "INVALID_RESPONSE"
  | "SCHEMA_VALIDATION";

const schemaFields = new Set([
  "brand",
  "code",
  "confidence",
  "content",
  "currencyCode",
  "description",
  "error",
  "field",
  "finishColor",
  "header",
  "id",
  "incomplete_details",
  "itemReference",
  "items",
  "mappings",
  "message",
  "name",
  "notes",
  "output",
  "output_text",
  "quantity",
  "reason",
  "refusal",
  "status",
  "supplierSku",
  "text",
  "totalPriceHt",
  "type",
  "unitOfMeasure",
  "unitPriceHt",
  "vatRate",
  "volumeEach",
  "warnings",
  "weightEach",
]);

export function safeItemSchemaIssues(issues: z.core.$ZodIssue[]) {
  return issues.slice(0, 20).map((issue) => ({
    code: issue.code,
    path: issue.path
      .slice(0, 8)
      .map((part) =>
        typeof part === "number"
          ? part
          : typeof part === "string" && schemaFields.has(part)
            ? part
            : "[field]",
      )
      .join("."),
  }));
}

// Never accept arbitrary response text as metadata, including a nominal ID/type.
export function safeItemRequestId(value: string | null | undefined) {
  return value &&
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:req|resp)_[A-Za-z0-9_-]{1,128})$/i.test(
      value,
    )
    ? value
    : null;
}

export function safeItemResponseState(value: string | undefined) {
  return value &&
    [
      "completed",
      "incomplete",
      "failed",
      "cancelled",
      "queued",
      "in_progress",
    ].includes(value)
    ? value
    : "unknown";
}

export function safeItemIncompleteReason(value: string | undefined) {
  return value &&
    ["max_output_tokens", "content_filter", "steered"].includes(value)
    ? value
    : "unknown";
}

export function safeItemErrorType(error: unknown) {
  return error instanceof Error &&
    [
      "AbortError",
      "TimeoutError",
      "TypeError",
      "SyntaxError",
      "ZodError",
      "ItemExtractionProviderError",
    ].includes(error.name)
    ? error.name
    : "Error";
}

export function safeItemOutputTypes(types: string[]) {
  return [
    ...new Set(
      types.map((type) =>
        ["message", "reasoning", "output_text", "refusal"].includes(type)
          ? type
          : "other",
      ),
    ),
  ].slice(0, 8);
}
