import { describe, expect, it } from "vitest";
import { AI_PROCESSING_MODEL_IDS } from "@/config/ai-processing";
import { aiProcessingSettingsSchema } from "./ai-processing";

describe("AI processing choices", () => {
  it.each(AI_PROCESSING_MODEL_IDS)(
    "accepts %s independently for every capability",
    (model) => {
      expect(
        aiProcessingSettingsSchema.parse({
          quoteExtractionModel: model,
          itemExtractionModel: "gpt-5.6-luna",
          clientDocumentExtractionModel: "gpt-5.6-sol",
        }).quoteExtractionModel,
      ).toBe(model);
    },
  );
  it.each(["", "terra", "gpt-5.6", "gpt-unknown", null, undefined])(
    "rejects an unsupported model: %s",
    (model) => {
      const result = aiProcessingSettingsSchema.safeParse({
        quoteExtractionModel: "gpt-5.6-luna",
        itemExtractionModel: model,
        clientDocumentExtractionModel: "gpt-5.6-sol",
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0]?.path).toEqual(["itemExtractionModel"]);
    },
  );
});
