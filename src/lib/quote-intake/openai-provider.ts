import "server-only";

import { z } from "zod";

import {
  QUOTE_EXTRACTION_MODEL,
  QUOTE_EXTRACTION_PROVIDER,
} from "@/config/quote-extraction";
import { supplierQuoteExtractionSchema } from "@/domain/quote-intake/extraction";
import { getQuoteExtractionEnvironment } from "@/lib/env/quote-extraction";

import type {
  QuoteExtractionProvider,
  QuoteExtractionResult,
  TemporaryQuoteFile,
} from "./provider";

const responseSchema = z
  .object({
    error: z
      .object({ message: z.string().optional() })
      .passthrough()
      .optional(),
    output: z
      .array(
        z
          .object({
            type: z.string(),
            content: z
              .array(
                z
                  .object({ type: z.string(), text: z.string().optional() })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export class QuoteExtractionProviderError extends Error {}

function requiredApiKey(): string {
  try {
    return getQuoteExtractionEnvironment().OPENAI_API_KEY;
  } catch {
    throw new QuoteExtractionProviderError(
      "Quote extraction is not configured. Add OPENAI_API_KEY on the server.",
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

function outputText(payload: z.infer<typeof responseSchema>): string | null {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return null;
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
    const apiKey = requiredApiKey();
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: QUOTE_EXTRACTION_MODEL,
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
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new QuoteExtractionProviderError(
          "Quote extraction timed out. Please retry the upload.",
        );
      }
      throw new QuoteExtractionProviderError(
        "The extraction provider is temporarily unavailable. Please retry.",
      );
    }
    let responseBody: unknown;
    try {
      responseBody = (await response.json()) as unknown;
    } catch {
      throw new QuoteExtractionProviderError(
        "The extraction provider returned an unreadable response.",
      );
    }
    const payload = responseSchema.safeParse(responseBody);
    if (!payload.success) {
      throw new QuoteExtractionProviderError(
        "The extraction provider returned an unreadable response.",
      );
    }
    if (!response.ok) {
      throw new QuoteExtractionProviderError(
        payload.data.error?.message ??
          "The extraction provider could not process this quote.",
      );
    }
    const text = outputText(payload.data);
    if (!text) {
      throw new QuoteExtractionProviderError(
        "The extraction provider returned no structured quote data.",
      );
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(text) as unknown;
    } catch {
      throw new QuoteExtractionProviderError(
        "The extraction provider returned invalid structured quote data.",
      );
    }
    const extraction = supplierQuoteExtractionSchema.safeParse(decoded);
    if (!extraction.success) {
      throw new QuoteExtractionProviderError(
        "The extracted quote did not pass server-side validation.",
      );
    }
    return {
      extraction: extraction.data,
      model: QUOTE_EXTRACTION_MODEL,
      provider: QUOTE_EXTRACTION_PROVIDER,
    };
  }
}
