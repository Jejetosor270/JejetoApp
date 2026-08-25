import "server-only";

import { z } from "zod";

const quoteExtractionEnvironmentSchema = z.object({
  OPENAI_API_KEY: z
    .string()
    .trim()
    .min(1, "OPENAI_API_KEY is required for supplier quote extraction."),
});

export type QuoteExtractionEnvironment = z.infer<
  typeof quoteExtractionEnvironmentSchema
>;

export function getQuoteExtractionEnvironment(): QuoteExtractionEnvironment {
  return quoteExtractionEnvironmentSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  });
}
