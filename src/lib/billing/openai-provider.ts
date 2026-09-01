import "server-only";

import { z } from "zod";

import {
  CLIENT_DOCUMENT_EXTRACTION_PROVIDER,
  DEFAULT_CLIENT_DOCUMENT_EXTRACTION_MODEL,
} from "@/config/client-document-extraction";
import { clientDocumentExtractionSchema } from "@/domain/billing/extraction";
import { getClientDocumentExtractionEnvironment } from "@/lib/env/client-document-extraction";

import type {
  ClientDocumentExtractionProvider,
  TemporaryClientDocumentFile,
} from "./provider";

export type ClientDocumentExtractionFailure =
  | "configuration"
  | "timeout"
  | "provider_api"
  | "refusal"
  | "incomplete_response"
  | "empty_output"
  | "malformed_output"
  | "schema_validation";

export class ClientDocumentExtractionProviderError extends Error {
  constructor(
    message: string,
    readonly category: ClientDocumentExtractionFailure,
  ) {
    super(message);
    this.name = "ClientDocumentExtractionProviderError";
  }
}

const responseSchema = z
  .object({
    id: z.string().optional(),
    status: z.string().optional(),
    incomplete_details: z
      .object({ reason: z.string().optional() })
      .nullable()
      .optional(),
    output_text: z.string().optional(),
    output: z
      .array(
        z
          .object({
            type: z.string(),
            content: z
              .array(
                z
                  .object({
                    type: z.string(),
                    text: z.string().optional(),
                    refusal: z.string().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    error: z
      .object({ message: z.string().optional(), code: z.string().optional() })
      .nullable()
      .optional(),
  })
  .passthrough();

function logFailure(
  category: ClientDocumentExtractionFailure,
  details: Record<string, unknown>,
) {
  console.error("Client document extraction failed.", {
    category,
    provider: CLIENT_DOCUMENT_EXTRACTION_PROVIDER,
    ...details,
  });
}

function outputText(payload: z.infer<typeof responseSchema>): string | null {
  if (payload.output_text?.trim()) return payload.output_text;
  const parts = (payload.output ?? []).flatMap((item) =>
    (item.content ?? [])
      .filter((content) => content.type === "output_text" && content.text)
      .map((content) => content.text ?? ""),
  );
  return parts.join("").trim() || null;
}

const instructions = `Extract facts from a client quote/devis or client invoice for an internal procurement ERP. Return only the strict schema. Never guess. Mark every observation EXTRACTED, MISSING, or AMBIGUOUS. AMBIGUOUS needs a short diagnostic and normally a null value. Money is a non-negative decimal string without separators, rates are fractions (0.20 means 20%), and dates are YYYY-MM-DD. Extract HT, every VAT line, total VAT, and TTC independently. Do not average multiple VAT rates. Preserve payment wording and propose installments only where supported by the document. Do not decide legal VAT treatment, FX rates, authoritative Client, Project, Order allocation, or invoice matching.`;

export class OpenAIClientDocumentExtractionProvider implements ClientDocumentExtractionProvider {
  async extract(file: TemporaryClientDocumentFile) {
    let configuration: ReturnType<
      typeof getClientDocumentExtractionEnvironment
    >;
    try {
      configuration = getClientDocumentExtractionEnvironment();
    } catch (error) {
      logFailure("configuration", {
        error: error instanceof Error ? error.message : typeof error,
        model: DEFAULT_CLIENT_DOCUMENT_EXTRACTION_MODEL,
      });
      throw new ClientDocumentExtractionProviderError(
        "Client document extraction is not configured. Contact an administrator.",
        "configuration",
      );
    }
    const model = configuration.CLIENT_DOCUMENT_EXTRACTION_MODEL;
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configuration.OPENAI_API_KEY}`,
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
                {
                  type: "input_file",
                  filename: file.filename,
                  file_data: `data:application/pdf;base64,${Buffer.from(file.bytes).toString("base64")}`,
                  detail: "high",
                },
                {
                  type: "input_text",
                  text: "Extract this client commercial document into the exact response schema.",
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "client_billing_document_extraction",
              strict: true,
              schema: z.toJSONSchema(clientDocumentExtractionSchema),
            },
          },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      const timeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      logFailure(timeout ? "timeout" : "provider_api", {
        error:
          error instanceof Error ? error.message.slice(0, 300) : typeof error,
        model,
      });
      throw new ClientDocumentExtractionProviderError(
        timeout
          ? "Client document extraction timed out. Please retry."
          : "The extraction provider is temporarily unavailable. Please retry.",
        timeout ? "timeout" : "provider_api",
      );
    }
    const requestId = response.headers.get("x-request-id") ?? undefined;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      logFailure("provider_api", {
        httpStatus: response.status,
        model,
        requestId,
      });
      throw new ClientDocumentExtractionProviderError(
        "The extraction provider returned an invalid response. Please retry.",
        "provider_api",
      );
    }
    const parsedResponse = responseSchema.safeParse(body);
    if (!parsedResponse.success || !response.ok || parsedResponse.data.error) {
      logFailure("provider_api", {
        httpStatus: response.status,
        model,
        requestId,
        responseId: parsedResponse.success ? parsedResponse.data.id : undefined,
      });
      throw new ClientDocumentExtractionProviderError(
        "The extraction provider could not process this PDF. Please retry.",
        "provider_api",
      );
    }
    const payload = parsedResponse.data;
    const contentTypes = (payload.output ?? []).flatMap((item) =>
      (item.content ?? []).map((content) => content.type),
    );
    const refusal = (payload.output ?? [])
      .flatMap((item) => item.content ?? [])
      .find((content) => content.type === "refusal");
    if (refusal) {
      logFailure("refusal", {
        contentTypes,
        model,
        requestId,
        responseId: payload.id,
      });
      throw new ClientDocumentExtractionProviderError(
        "The model declined to process this document.",
        "refusal",
      );
    }
    if (payload.status === "incomplete") {
      logFailure("incomplete_response", {
        incompleteReason: payload.incomplete_details?.reason,
        model,
        requestId,
        responseId: payload.id,
      });
      throw new ClientDocumentExtractionProviderError(
        "Document extraction was incomplete. Please retry.",
        "incomplete_response",
      );
    }
    const text = outputText(payload);
    if (!text) {
      logFailure("empty_output", {
        contentTypes,
        model,
        requestId,
        responseId: payload.id,
      });
      throw new ClientDocumentExtractionProviderError(
        "No structured data was returned for this PDF.",
        "empty_output",
      );
    }
    let structured: unknown;
    try {
      structured = JSON.parse(text) as unknown;
    } catch {
      logFailure("malformed_output", {
        model,
        requestId,
        responseId: payload.id,
      });
      throw new ClientDocumentExtractionProviderError(
        "The extracted document data was malformed. Please retry.",
        "malformed_output",
      );
    }
    const extraction = clientDocumentExtractionSchema.safeParse(structured);
    if (!extraction.success) {
      logFailure("schema_validation", {
        model,
        requestId,
        responseId: payload.id,
        issues: extraction.error.issues.slice(0, 12).map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      throw new ClientDocumentExtractionProviderError(
        "The extracted document data failed validation. Please retry.",
        "schema_validation",
      );
    }
    return {
      extraction: extraction.data,
      model,
      provider: CLIENT_DOCUMENT_EXTRACTION_PROVIDER,
    };
  }
}

export function getClientDocumentExtractionProvider(): ClientDocumentExtractionProvider {
  return new OpenAIClientDocumentExtractionProvider();
}
