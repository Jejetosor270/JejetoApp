import { describe, expect, it } from "vitest";
import {
  AI_PROCESSING_CAPABILITIES,
  AI_PROCESSING_MODEL_IDS,
} from "@/config/ai-processing";
import { aiProcessingSettingsSchema } from "./ai-processing";

describe("AI processing choices", () => {
  const selections = {
    quoteExtractionModel: "gpt-6-luna",
    itemExtractionModel: "gpt-6.1-sol",
    clientDocumentExtractionModel: "gpt-6-luna",
  } as const;

  it("offers only GPT-6 Luna and GPT-6.1 Sol for new selections", () => {
    expect(AI_PROCESSING_MODEL_IDS).toEqual(["gpt-6-luna", "gpt-6.1-sol"]);
  });

  it.each(AI_PROCESSING_MODEL_IDS)(
    "accepts %s independently for every capability",
    (model) => {
      for (const { field } of AI_PROCESSING_CAPABILITIES) {
        expect(
          aiProcessingSettingsSchema.parse({ ...selections, [field]: model })[
            field
          ],
        ).toBe(model);
      }
    },
  );
  it.each([
    "",
    "terra",
    "gpt-5.6",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-unknown",
    null,
    undefined,
  ])("rejects an unsupported model: %s", (model) => {
    for (const { field } of AI_PROCESSING_CAPABILITIES) {
      const result = aiProcessingSettingsSchema.safeParse({
        ...selections,
        [field]: model,
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0]?.path).toEqual([field]);
    }
  });
});
