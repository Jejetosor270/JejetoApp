import { getAiProcessingModel } from "@/lib/settings/ai-processing-settings";
import "server-only";

import { z } from "zod";

import { ITEM_EXTRACTION_PROVIDER } from "@/config/item-extraction";
import {
  quoteItemExtractionSchema,
  spreadsheetMappingSuggestionSchema,
  type QuoteItemExtraction,
  type SpreadsheetMappingSuggestion,
} from "@/domain/items/extraction";
import { getItemExtractionEnvironment } from "@/lib/env/item-extraction";
import {
  safeItemErrorType,
  safeItemIncompleteReason,
  safeItemOutputTypes,
  safeItemRequestId,
  safeItemResponseState,
  safeItemSchemaIssues,
  type ItemExtractionFailureCategory,
} from "@/lib/items/extraction-diagnostics";
import type { TemporaryQuoteFile } from "@/lib/quote-intake/provider";

export type { ItemExtractionFailureCategory } from "@/lib/items/extraction-diagnostics";

export class ItemExtractionProviderError extends Error {
  constructor(
    message: string,
    readonly category: ItemExtractionFailureCategory = "PROVIDER",
  ) {
    super(message);
    this.name = "ItemExtractionProviderError";
  }
}

export interface ItemExtractionRequestOptions {
  signal?: AbortSignal;
  requestId?: string;
}

export interface ItemExtractionProvider {
  extractQuoteItems(
    file: TemporaryQuoteFile,
    options?: ItemExtractionRequestOptions,
  ): Promise<{
    extraction: QuoteItemExtraction;
    model: string;
    provider: string;
  }>;
  suggestSpreadsheetMapping(input: {
    headers: string[];
    samples: string[][];
  }): Promise<{
    model: string;
    provider: string;
    suggestion: SpreadsheetMappingSuggestion;
  }>;
}

const responseSchema = z
  .object({
    error: z
      .object({ code: z.string().optional(), message: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
    id: z.string().optional(),
    incomplete_details: z
      .object({ reason: z.string().optional() })
      .passthrough()
      .nullable()
      .optional(),
    output: z
      .array(
        z
          .object({
            content: z
              .array(
                z
                  .object({
                    refusal: z.string().optional(),
                    text: z.string().optional(),
                    type: z.string(),
                  })
                  .passthrough(),
              )
              .optional(),
            type: z.string(),
            status: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    output_text: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

function outputText(payload: z.infer<typeof responseSchema>): string | null {
  if (payload.output_text?.trim()) return payload.output_text;
  const value = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text ?? "")
    .join("")
    .trim();
  return value || null;
}

function refusal(payload: z.infer<typeof responseSchema>): boolean {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .some((content) => content.type === "refusal");
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function transportFailure(error: unknown, signal: AbortSignal) {
  if (
    signal.aborted ||
    (error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name))
  ) {
    const timedOut =
      (signal.reason instanceof Error &&
        signal.reason.name === "TimeoutError") ||
      (error instanceof Error && error.name === "TimeoutError");
    return new ItemExtractionProviderError(
      timedOut
        ? "Item extraction timed out. Retry the upload."
        : "Item extraction was cancelled. Retry when ready.",
      timedOut ? "TIMEOUT" : "ABORTED",
    );
  }
  return new ItemExtractionProviderError(
    "The Item extraction provider could not be reached.",
    "PROVIDER",
  );
}

function fileContent(file: TemporaryQuoteFile) {
  const dataUrl = `data:${file.mediaType};base64,${Buffer.from(file.bytes).toString("base64")}`;
  return file.mediaType === "application/pdf"
    ? {
        file_data: dataUrl,
        filename: file.filename,
        type: "input_file" as const,
      }
    : {
        detail: "high" as const,
        image_url: dataUrl,
        type: "input_image" as const,
      };
}

export class OpenAIItemExtractionProvider implements ItemExtractionProvider {
  constructor(private readonly request: typeof fetch = fetch) {}

  private async structured<T>(
    input: unknown,
    instructions: string,
    name: "supplier_quote_items" | "item_spreadsheet_mapping",
    schema: z.ZodType<T>,
    options: ItemExtractionRequestOptions = {},
  ): Promise<{ model: string; value: T }> {
    const startedAt = Date.now();
    const timeout = AbortSignal.timeout(90_000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const diagnostic: {
      provider: string;
      operation: string;
      requestId: string | null;
      model: string | null;
      providerRequestId?: string | null;
      responseId?: string | null;
      httpStatus?: number;
      responseStatus?: string;
      outputTextEmpty?: boolean;
      outputItemTypes?: string[];
      outputContentTypes?: string[];
      reason?: string;
      zodIssues?: ReturnType<typeof safeItemSchemaIssues>;
    } = {
      provider: ITEM_EXTRACTION_PROVIDER,
      operation: name,
      requestId: safeItemRequestId(options.requestId),
      model: null,
    };
    try {
      signal.throwIfAborted();
      let environment: ReturnType<typeof getItemExtractionEnvironment>;
      try {
        environment = getItemExtractionEnvironment(
          await withAbort(getAiProcessingModel("itemExtractionModel"), signal),
        );
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ItemExtractionProviderError(
          "Item extraction is not configured. Contact an administrator.",
          "CONFIGURATION",
        );
      }
      const model = environment.ITEM_EXTRACTION_MODEL;
      diagnostic.model = model;
      signal.throwIfAborted();
      const response = await withAbort(
        this.request("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${environment.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input,
            instructions,
            model,
            store: false,
            text: {
              format: {
                name,
                schema: z.toJSONSchema(schema),
                strict: true,
                type: "json_schema",
              },
            },
          }),
          signal,
        }),
        signal,
      );
      diagnostic.providerRequestId = safeItemRequestId(
        response.headers.get("x-request-id"),
      );
      diagnostic.httpStatus = response.status;
      let raw: unknown;
      try {
        raw = await withAbort(response.json(), signal);
      } catch (error) {
        if (signal.aborted) throw error;
        if (!response.ok)
          throw new ItemExtractionProviderError(
            "The Item extraction provider could not process this document.",
            [401, 403, 404].includes(response.status)
              ? "CONFIGURATION"
              : "PROVIDER",
          );
        if (error instanceof SyntaxError)
          throw new ItemExtractionProviderError(
            "The Item extraction provider returned an invalid response.",
            "INVALID_RESPONSE",
          );
        throw error;
      }
      signal.throwIfAborted();
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) {
        diagnostic.zodIssues = safeItemSchemaIssues(parsed.error.issues);
        throw new ItemExtractionProviderError(
          "The Item extraction provider returned an invalid response.",
          response.ok ? "INVALID_RESPONSE" : "PROVIDER",
        );
      }
      const payload = parsed.data;
      const text = outputText(payload);
      Object.assign(diagnostic, {
        responseId: safeItemRequestId(payload.id),
        responseStatus: safeItemResponseState(payload.status),
        outputTextEmpty: !text,
        outputItemTypes: safeItemOutputTypes(
          (payload.output ?? []).map((item) => item.type),
        ),
        outputContentTypes: safeItemOutputTypes(
          (payload.output ?? []).flatMap((item) =>
            (item.content ?? []).map((content) => content.type),
          ),
        ),
      });
      if (
        !response.ok ||
        payload.error ||
        payload.status === "failed" ||
        payload.status === "cancelled"
      ) {
        const configuration =
          [401, 403, 404].includes(response.status) ||
          ["invalid_api_key", "model_not_found", "unsupported_model"].includes(
            payload.error?.code ?? "",
          );
        throw new ItemExtractionProviderError(
          configuration
            ? "Item extraction is not configured correctly. Contact an administrator."
            : "The Item extraction provider could not process this document.",
          configuration ? "CONFIGURATION" : "PROVIDER",
        );
      }
      if (refusal(payload))
        throw new ItemExtractionProviderError(
          "The model declined to extract Items from this document.",
          "REFUSAL",
        );
      if (
        ["incomplete", "queued", "in_progress"].includes(
          payload.status ?? "",
        ) ||
        payload.output?.some((item) =>
          ["incomplete", "in_progress"].includes(item.status ?? ""),
        )
      ) {
        diagnostic.reason = safeItemIncompleteReason(
          payload.incomplete_details?.reason,
        );
        throw new ItemExtractionProviderError(
          "Item extraction was incomplete. Retry the document.",
          "INCOMPLETE",
        );
      }
      if (!text)
        throw new ItemExtractionProviderError(
          "The Item extraction provider returned no line items.",
          "EMPTY_OUTPUT",
        );
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ItemExtractionProviderError(
          "The extracted Item data was malformed.",
          "MALFORMED_OUTPUT",
        );
      }
      const validated = schema.safeParse(json);
      if (!validated.success) {
        diagnostic.zodIssues = safeItemSchemaIssues(validated.error.issues);
        throw new ItemExtractionProviderError(
          "The extracted Item data failed validation.",
          "SCHEMA_VALIDATION",
        );
      }
      return { model, value: validated.data };
    } catch (error) {
      const failure =
        error instanceof ItemExtractionProviderError
          ? error
          : transportFailure(error, signal);
      console.error("Item extraction failed.", {
        ...diagnostic,
        category: failure.category,
        elapsedMs: Date.now() - startedAt,
        errorType: safeItemErrorType(error),
      });
      throw failure;
    }
  }

  async suggestSpreadsheetMapping(input: {
    headers: string[];
    samples: string[][];
  }) {
    const result = await this.structured(
      [
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(input) }],
        },
      ],
      "Map only genuinely recognizable spreadsheet headers to the allowed procurement Item fields. Never guess. Return null for unknown columns. Do not transform row data.",
      "item_spreadsheet_mapping",
      spreadsheetMappingSuggestionSchema,
    );
    return {
      model: result.model,
      provider: ITEM_EXTRACTION_PROVIDER,
      suggestion: result.value,
    };
  }

  async extractQuoteItems(
    file: TemporaryQuoteFile,
    options?: ItemExtractionRequestOptions,
  ) {
    const result = await this.structured(
      [
        {
          role: "user",
          content: [
            fileContent(file),
            {
              type: "input_text",
              text: "Extract every meaningful supplier quote product/item line. Do not invent missing values. Item Reference means an explicitly labelled customer/internal budget reference only; never copy the description, line number, or Supplier SKU into Item Reference. Put the Supplier's product code only in supplierSku and leave itemReference null when an internal reference is not explicit. Rates are fractions: 0.20 means 20%. Exclude subtotal, freight, discount, VAT, and grand-total rows from items and report them only as warnings.",
            },
          ],
        },
      ],
      "Extract all product lines from this supplier quote. Preserve source unit and total values even when they disagree. Return one Item per meaningful quote line.",
      "supplier_quote_items",
      quoteItemExtractionSchema,
      options,
    );
    return {
      extraction: result.value,
      model: result.model,
      provider: ITEM_EXTRACTION_PROVIDER,
    };
  }
}

export function getItemExtractionProvider(): ItemExtractionProvider {
  return new OpenAIItemExtractionProvider();
}
