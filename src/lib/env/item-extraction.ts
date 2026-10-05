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

export function getItemExtractionEnvironment(modelOverride?: string) {
  const environment = z
    .object({
      OPENAI_API_KEY: z.string().trim().min(1),
      ITEM_EXTRACTION_MODEL: optionalModel,
    })
    .parse({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ITEM_EXTRACTION_MODEL: modelOverride ?? process.env.ITEM_EXTRACTION_MODEL,
    });
  return {
    ...environment,
    ITEM_EXTRACTION_MODEL: resolveAiProcessingModel(
      environment.ITEM_EXTRACTION_MODEL,
    ),
  };
}

export function getItemExtractionModel(): string {
  return resolveAiProcessingModel(
    optionalModel.parse(process.env.ITEM_EXTRACTION_MODEL),
  );
}
