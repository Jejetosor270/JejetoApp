import "server-only";

import { z } from "zod";

import { DEFAULT_ITEM_EXTRACTION_MODEL } from "@/config/item-extraction";

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

export function getItemExtractionEnvironment() {
  return z
    .object({
      OPENAI_API_KEY: z.string().trim().min(1),
      ITEM_EXTRACTION_MODEL: optionalModel,
    })
    .parse({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ITEM_EXTRACTION_MODEL:
        process.env.ITEM_EXTRACTION_MODEL ?? DEFAULT_ITEM_EXTRACTION_MODEL,
    });
}

export function getItemExtractionModel(): string {
  return (
    optionalModel.parse(process.env.ITEM_EXTRACTION_MODEL) ??
    DEFAULT_ITEM_EXTRACTION_MODEL
  );
}
