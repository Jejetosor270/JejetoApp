import "server-only";

import { z } from "zod";

import { DEFAULT_QUOTE_EXTRACTION_MODEL } from "@/config/quote-extraction";

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

const quoteExtractionEnvironmentSchema = z.object({
  OPENAI_API_KEY: z
    .string()
    .trim()
    .min(1, "OPENAI_API_KEY is required for supplier quote extraction."),
  QUOTE_EXTRACTION_MODEL: optionalModel,
});

export type QuoteExtractionEnvironment = z.infer<
  typeof quoteExtractionEnvironmentSchema
>;

export function getQuoteExtractionEnvironment(): QuoteExtractionEnvironment {
  const environment = quoteExtractionEnvironmentSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    QUOTE_EXTRACTION_MODEL: process.env.QUOTE_EXTRACTION_MODEL,
  });
  return {
    ...environment,
    QUOTE_EXTRACTION_MODEL:
      environment.QUOTE_EXTRACTION_MODEL ?? DEFAULT_QUOTE_EXTRACTION_MODEL,
  };
}

export function getQuoteExtractionModel(): string {
  return (
    optionalModel.parse(process.env.QUOTE_EXTRACTION_MODEL) ??
    DEFAULT_QUOTE_EXTRACTION_MODEL
  );
}
