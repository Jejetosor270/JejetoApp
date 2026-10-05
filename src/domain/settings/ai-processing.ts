import { z } from "zod";
import { AI_PROCESSING_MODEL_IDS } from "@/config/ai-processing";

const model = z.enum(AI_PROCESSING_MODEL_IDS, {
  error: "Choose GPT-6 Luna or GPT-6.1 Sol.",
});

export const aiProcessingSettingsSchema = z.object({
  quoteExtractionModel: model,
  itemExtractionModel: model,
  clientDocumentExtractionModel: model,
});

export type AiProcessingSettingsInput = z.infer<
  typeof aiProcessingSettingsSchema
>;
