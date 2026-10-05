export const DEFAULT_AI_PROCESSING_MODEL = "gpt-6-luna";

export const AI_PROCESSING_MODEL_IDS = ["gpt-6-luna", "gpt-6.1-sol"] as const;

export const AI_PROCESSING_MODELS = [
  { id: "gpt-6-luna", label: "GPT-6 Luna (default)" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
] as const;

/** Retire old configuration on read; preserve historical extraction metadata. */
export function resolveAiProcessingModel(
  model: string | null | undefined,
): string {
  if (
    !model ||
    ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"].includes(model)
  ) {
    return DEFAULT_AI_PROCESSING_MODEL;
  }
  return model;
}

export const AI_PROCESSING_CAPABILITIES = [
  {
    field: "quoteExtractionModel",
    label: "Supplier document analysis",
    description:
      "Supplier quote and invoice totals, payment terms, and procurement details.",
  },
  {
    field: "itemExtractionModel",
    label: "Item extraction and spreadsheet mapping",
    description:
      "Item lines in supplier documents and optional AI mapping of spreadsheet columns.",
  },
  {
    field: "clientDocumentExtractionModel",
    label: "Client billing document analysis",
    description:
      "Client quote and invoice details, VAT amounts, and proposed payment terms.",
  },
] as const;

export type AiProcessingCapability =
  (typeof AI_PROCESSING_CAPABILITIES)[number]["field"];
export type AiProcessingModels = Record<AiProcessingCapability, string>;
