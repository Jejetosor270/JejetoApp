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
import type { TemporaryQuoteFile } from "@/lib/quote-intake/provider";

export class ItemExtractionProviderError extends Error {}

export interface ItemExtractionProvider {
  extractQuoteItems(file: TemporaryQuoteFile): Promise<{
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
      .object({ message: z.string().optional() })
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

function refusal(payload: z.infer<typeof responseSchema>): string | null {
  return (
    (payload.output ?? [])
      .flatMap((item) => item.content ?? [])
      .find((content) => content.type === "refusal")?.refusal ?? null
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
    name: string,
    schema: z.ZodType<T>,
  ): Promise<{ model: string; value: T }> {
    let environment: ReturnType<typeof getItemExtractionEnvironment>;
    try {
      environment = getItemExtractionEnvironment();
    } catch (error) {
      console.error("Item extraction configuration failed.", {
        error: error instanceof Error ? error.message : typeof error,
        provider: ITEM_EXTRACTION_PROVIDER,
      });
      throw new ItemExtractionProviderError(
        "Item extraction is not configured. Contact an administrator.",
      );
    }
    const model = environment.ITEM_EXTRACTION_MODEL ?? "gpt-5.6-luna";
    let response: Response;
    try {
      response = await this.request("https://api.openai.com/v1/responses", {
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
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      console.error("Item extraction request failed.", {
        error: error instanceof Error ? error.message : typeof error,
        model,
        provider: ITEM_EXTRACTION_PROVIDER,
      });
      throw new ItemExtractionProviderError(
        error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
          ? "Item extraction timed out. Retry the upload."
          : "The Item extraction provider could not be reached.",
      );
    }
    const raw: unknown = await response.json().catch(() => null);
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("Item extraction response shape invalid.", {
        model,
        requestId: response.headers.get("x-request-id"),
        status: response.status,
        zodIssues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
      });
      throw new ItemExtractionProviderError(
        "The Item extraction provider returned an invalid response.",
      );
    }
    const diagnostic = {
      model,
      requestId: response.headers.get("x-request-id"),
      responseId: parsed.data.id,
      responseStatus: parsed.data.status,
    };
    if (!response.ok || parsed.data.error) {
      console.error("Item extraction provider error.", {
        ...diagnostic,
        httpStatus: response.status,
        message: parsed.data.error?.message?.slice(0, 300),
      });
      throw new ItemExtractionProviderError(
        "The Item extraction provider could not process this document.",
      );
    }
    if (refusal(parsed.data)) {
      console.error("Item extraction refused.", diagnostic);
      throw new ItemExtractionProviderError(
        "The model declined to extract Items from this document.",
      );
    }
    if (parsed.data.status === "incomplete") {
      console.error("Item extraction incomplete.", {
        ...diagnostic,
        reason: parsed.data.incomplete_details?.reason,
      });
      throw new ItemExtractionProviderError(
        "Item extraction was incomplete. Retry the document.",
      );
    }
    const text = outputText(parsed.data);
    if (!text) {
      console.error("Item extraction empty.", diagnostic);
      throw new ItemExtractionProviderError(
        "The Item extraction provider returned no line items.",
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("Item extraction malformed JSON.", {
        ...diagnostic,
        fragment: text.slice(0, 120),
      });
      throw new ItemExtractionProviderError(
        "The extracted Item data was malformed.",
      );
    }
    const validated = schema.safeParse(json);
    if (!validated.success) {
      console.error("Item extraction schema validation failed.", {
        ...diagnostic,
        zodIssues: validated.error.issues
          .map((issue) => ({
            message: issue.message,
            path: issue.path.join("."),
          }))
          .slice(0, 30),
      });
      throw new ItemExtractionProviderError(
        "The extracted Item data failed validation.",
      );
    }
    return { model, value: validated.data };
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

  async extractQuoteItems(file: TemporaryQuoteFile) {
    const result = await this.structured(
      [
        {
          role: "user",
          content: [
            fileContent(file),
            {
              type: "input_text",
              text: "Extract every meaningful supplier quote product/item line. Do not invent missing values. Rates are fractions: 0.20 means 20%. Exclude subtotal, freight, discount, VAT, and grand-total rows from items and report them only as warnings.",
            },
          ],
        },
      ],
      "Extract all product lines from this supplier quote. Preserve source unit and total values even when they disagree. Return one Item per meaningful quote line.",
      "supplier_quote_items",
      quoteItemExtractionSchema,
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
