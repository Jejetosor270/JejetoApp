import "server-only";

import { z } from "zod";

import {
  DEFAULT_QUOTE_EXTRACTION_MODEL,
  QUOTE_EXTRACTION_PROVIDER,
} from "@/config/quote-extraction";
import { supplierQuoteExtractionSchema } from "@/domain/quote-intake/extraction";
import { getQuoteExtractionEnvironment } from "@/lib/env/quote-extraction";

import type {
  QuoteExtractionProvider,
  QuoteExtractionResult,
  TemporaryQuoteFile,
} from "./provider";

const responseErrorSchema = z
  .object({
    code: z.string().nullable().optional(),
    message: z.string().optional(),
    type: z.string().nullable().optional(),
  })
  .passthrough();

const responseContentSchema = z
  .object({
    type: z.string(),
    refusal: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();

const responseSchema = z
  .object({
    error: responseErrorSchema.nullable().optional(),
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
            type: z.string(),
            content: z.array(responseContentSchema).nullable().optional(),
            status: z.string().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    output_text: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const quoteExtractionFailureCategories = [
  "configuration",
  "timeout",
  "provider_api",
  "unsupported_document",
  "refusal",
  "incomplete_response",
  "empty_output",
  "malformed_structured_output",
  "schema_validation_failure",
  "invalid_provider_response",
] as const;

export type QuoteExtractionFailureCategory =
  (typeof quoteExtractionFailureCategories)[number];

export class QuoteExtractionProviderError extends Error {
  constructor(
    message: string,
    readonly category: QuoteExtractionFailureCategory,
  ) {
    super(message);
    this.name = "QuoteExtractionProviderError";
  }
}

type ProviderPayload = z.infer<typeof responseSchema>;

interface ExtractionFailureDiagnostics {
  caughtErrorMessage?: string | undefined;
  caughtErrorType?: string | undefined;
  contentTypes?: string[] | undefined;
  httpStatus?: number | undefined;
  incompleteReason?: string | undefined;
  model?: string | undefined;
  openaiRequestId?: string | undefined;
  outputItemTypes?: string[] | undefined;
  outputTextEmpty?: boolean | undefined;
  providerErrorCode?: string | undefined;
  providerErrorMessage?: string | undefined;
  providerErrorType?: string | undefined;
  responseId?: string | undefined;
  responseStatus?: string | undefined;
  zodIssues?: Array<{ message: string; path: string }> | undefined;
}

function truncated(value: string | undefined, maximum = 300) {
  if (!value) return undefined;
  const normalized = value
    .replaceAll(/data:[^\s]+/gi, "[redacted-data-url]")
    .replaceAll(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted-api-key]")
    .replaceAll(/\s+/g, " ")
    .trim();
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, maximum)}…`;
}

function caughtErrorDiagnostics(error: unknown) {
  return error instanceof Error
    ? {
        caughtErrorMessage: truncated(error.message),
        caughtErrorType: error.name,
      }
    : { caughtErrorType: typeof error };
}

function caughtErrorType(error: unknown) {
  return {
    caughtErrorType: error instanceof Error ? error.name : typeof error,
  };
}

function logExtractionFailure(
  category: QuoteExtractionFailureCategory,
  diagnostics: ExtractionFailureDiagnostics = {},
) {
  console.error("Supplier quote extraction failed.", {
    category,
    model: diagnostics.model ?? DEFAULT_QUOTE_EXTRACTION_MODEL,
    provider: QUOTE_EXTRACTION_PROVIDER,
    ...diagnostics,
  });
}

function failExtraction(
  category: QuoteExtractionFailureCategory,
  message: string,
  diagnostics: ExtractionFailureDiagnostics = {},
): never {
  logExtractionFailure(category, diagnostics);
  throw new QuoteExtractionProviderError(message, category);
}

function requiredProviderConfiguration(): { apiKey: string; model: string } {
  try {
    const environment = getQuoteExtractionEnvironment();
    return {
      apiKey: environment.OPENAI_API_KEY,
      model:
        environment.QUOTE_EXTRACTION_MODEL ?? DEFAULT_QUOTE_EXTRACTION_MODEL,
    };
  } catch (error) {
    return failExtraction(
      "configuration",
      "Quote extraction is not configured. Add OPENAI_API_KEY on the server.",
      {
        ...caughtErrorDiagnostics(error),
        model: DEFAULT_QUOTE_EXTRACTION_MODEL,
      },
    );
  }
}

function fileContent(file: TemporaryQuoteFile) {
  const dataUrl = `data:${file.mediaType};base64,${Buffer.from(file.bytes).toString("base64")}`;
  return file.mediaType === "application/pdf"
    ? {
        type: "input_file" as const,
        filename: file.filename,
        file_data: dataUrl,
        detail: "high" as const,
      }
    : {
        type: "input_image" as const,
        image_url: dataUrl,
        detail: "high" as const,
      };
}

function outputText(payload: ProviderPayload): string | null {
  if (payload.output_text?.trim()) return payload.output_text;
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  const combined = parts.join("");
  return combined.trim() ? combined : null;
}

function refusal(payload: ProviderPayload): string | null {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") return content.refusal ?? "Model refusal";
    }
  }
  return null;
}

function responseDiagnostics(
  payload: ProviderPayload,
  response: Response,
  model: string,
): ExtractionFailureDiagnostics {
  return {
    contentTypes: (payload.output ?? []).flatMap(
      (item) => item.content?.map((content) => content.type) ?? [],
    ),
    httpStatus: response.status,
    incompleteReason: payload.incomplete_details?.reason,
    model,
    openaiRequestId: response.headers.get("x-request-id") ?? undefined,
    outputItemTypes: (payload.output ?? []).map((item) => item.type),
    outputTextEmpty: outputText(payload) === null,
    responseId: payload.id,
    responseStatus: payload.status,
  };
}

function providerFailureCategory(
  response: Response,
  error: ProviderPayload["error"],
): QuoteExtractionFailureCategory {
  const diagnostic =
    `${error?.code ?? ""} ${error?.type ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (response.status === 408 || response.status === 504) return "timeout";
  if (
    diagnostic.includes("unsupported") ||
    diagnostic.includes("invalid_file") ||
    diagnostic.includes("invalid_image") ||
    diagnostic.includes("file type")
  ) {
    return "unsupported_document";
  }
  if (
    response.status === 401 ||
    response.status === 403 ||
    diagnostic.includes("api key") ||
    diagnostic.includes("model_not_found") ||
    diagnostic.includes("does not exist") ||
    diagnostic.includes("not have access")
  ) {
    return "configuration";
  }
  return "provider_api";
}

function providerFailureMessage(
  category: QuoteExtractionFailureCategory,
): string {
  switch (category) {
    case "configuration":
      return "Quote extraction is not configured correctly. Contact an administrator.";
    case "timeout":
      return "Quote extraction timed out. Please retry the upload.";
    case "unsupported_document":
      return "The extraction provider could not read this document. Try a clearer PDF, JPG, or PNG file.";
    default:
      return "The extraction provider could not process this quote. Please retry.";
  }
}

const instructions = `You extract supplier quote facts for an internal procurement ERP.
Return only the requested structured object. Never guess. For every observed field:
- EXTRACTED means the value is explicitly supported by the document.
- MISSING means it is not present.
- AMBIGUOUS means there are conflicting or unclear candidates; use diagnostic to explain and set value null unless one raw candidate is still useful.
Normalize monetary values as non-negative decimal strings without currency symbols or grouping separators, with at most 4 decimals.
Normalize percentages and VAT rates as fractions: 0.30 means 30%, with at most 6 decimals.
Normalize objective dates only as YYYY-MM-DD. You may calculate one only when an explicit document date and exact offset unambiguously define it. Do not invent a date from phrases such as "before shipment" or "on delivery"; preserve those phrases in timingDescription and leave objectiveDueDate missing.
Normalize lead time to integer weeks only when the wording supports it, preserving the original phrase in raw. Preserve separately stated production-time and expected-delivery wording. Set expectedDeliveryDate only when an objective date is explicit or unambiguously calculable.
Extract goods subtotal HT, freight HT, other charges HT, total HT, VAT, and TTC separately. State whether freight is included in or added to total HT; use UNCLEAR when unsure.
Do not infer VAT legal treatment or recoverability.
Split payment terms into installments only when the document supports the split. Preserve the raw terms.
Add concise warnings for discrepancies, multiple VAT rates, illegible content, or other uncertainty.`;

export class OpenAIQuoteExtractionProvider implements QuoteExtractionProvider {
  async extract(file: TemporaryQuoteFile): Promise<QuoteExtractionResult> {
    const { apiKey, model } = requiredProviderConfiguration();
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          instructions,
          input: [
            {
              role: "user",
              content: [
                fileContent(file),
                {
                  type: "input_text",
                  text: "Extract the supplier quote into the exact response schema.",
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "supplier_quote_extraction",
              strict: true,
              schema: z.toJSONSchema(supplierQuoteExtractionSchema),
            },
          },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      const diagnostics = { ...caughtErrorDiagnostics(error), model };
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        return failExtraction(
          "timeout",
          "Quote extraction timed out. Please retry the upload.",
          diagnostics,
        );
      }
      return failExtraction(
        "provider_api",
        "The extraction provider is temporarily unavailable. Please retry.",
        diagnostics,
      );
    }
    let responseBody: unknown;
    try {
      responseBody = (await response.json()) as unknown;
    } catch (error) {
      return failExtraction(
        "invalid_provider_response",
        "The extraction provider returned a response that could not be read. Please retry.",
        {
          ...caughtErrorType(error),
          httpStatus: response.status,
          model,
          openaiRequestId: response.headers.get("x-request-id") ?? undefined,
        },
      );
    }
    const payload = responseSchema.safeParse(responseBody);
    if (!payload.success) {
      return failExtraction(
        "invalid_provider_response",
        "The extraction provider returned an unexpected response. Please retry.",
        {
          httpStatus: response.status,
          model,
          openaiRequestId: response.headers.get("x-request-id") ?? undefined,
          zodIssues: payload.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.map(String).join("."),
          })),
        },
      );
    }
    const diagnostics = responseDiagnostics(payload.data, response, model);
    if (
      !response.ok ||
      payload.data.status === "failed" ||
      payload.data.error
    ) {
      const category = providerFailureCategory(response, payload.data.error);
      return failExtraction(category, providerFailureMessage(category), {
        ...diagnostics,
        providerErrorCode: payload.data.error?.code ?? undefined,
        providerErrorMessage: truncated(payload.data.error?.message),
        providerErrorType: payload.data.error?.type ?? undefined,
      });
    }
    if (
      payload.data.status === "incomplete" ||
      payload.data.status === "cancelled" ||
      payload.data.status === "in_progress" ||
      payload.data.status === "queued" ||
      payload.data.incomplete_details
    ) {
      return failExtraction(
        "incomplete_response",
        "Quote extraction did not finish. Please retry the upload.",
        diagnostics,
      );
    }
    const refusalReason = refusal(payload.data);
    if (refusalReason) {
      return failExtraction(
        "refusal",
        "The extraction model declined to process this quote. Try a clearer document or contact an administrator.",
        {
          ...diagnostics,
          providerErrorMessage: truncated(refusalReason),
        },
      );
    }
    const text = outputText(payload.data);
    if (!text) {
      return failExtraction(
        "empty_output",
        "The extraction model returned no quote data. Please retry the upload.",
        diagnostics,
      );
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(text) as unknown;
    } catch (error) {
      return failExtraction(
        "malformed_structured_output",
        "The extraction model returned malformed quote data. Please retry the upload.",
        {
          ...diagnostics,
          ...caughtErrorType(error),
        },
      );
    }
    const extraction = supplierQuoteExtractionSchema.safeParse(decoded);
    if (!extraction.success) {
      return failExtraction(
        "schema_validation_failure",
        "The extracted quote did not match the required structure. Please retry with a clearer file.",
        {
          ...diagnostics,
          zodIssues: extraction.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.map(String).join("."),
          })),
        },
      );
    }
    return {
      extraction: extraction.data,
      model,
      provider: QUOTE_EXTRACTION_PROVIDER,
    };
  }
}
