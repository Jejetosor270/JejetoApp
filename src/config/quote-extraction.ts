export { DEFAULT_AI_PROCESSING_MODEL as DEFAULT_QUOTE_EXTRACTION_MODEL } from "./ai-processing";
export const QUOTE_EXTRACTION_PROVIDER = "openai";

export const MAX_QUOTE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_QUOTE_FILE_LABEL = "4 MB";
export const ACCEPTED_QUOTE_FILE_TYPES =
  ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
