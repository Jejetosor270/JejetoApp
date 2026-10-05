import "server-only";

import { z } from "zod";

import { resolveAiProcessingModel } from "@/config/ai-processing";

const optionalModel = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .optional(),
);

export function getClientDocumentExtractionEnvironment(modelOverride?: string) {
  const parsed = z
    .object({
      CLIENT_DOCUMENT_EXTRACTION_MODEL: optionalModel,
      OPENAI_API_KEY: z.string().trim().min(1),
    })
    .parse({
      CLIENT_DOCUMENT_EXTRACTION_MODEL:
        modelOverride ?? process.env.CLIENT_DOCUMENT_EXTRACTION_MODEL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    });
  return {
    ...parsed,
    CLIENT_DOCUMENT_EXTRACTION_MODEL: resolveAiProcessingModel(
      parsed.CLIENT_DOCUMENT_EXTRACTION_MODEL,
    ),
  };
}

export function getClientDocumentExtractionModel(): string {
  return resolveAiProcessingModel(
    optionalModel.parse(process.env.CLIENT_DOCUMENT_EXTRACTION_MODEL),
  );
}
