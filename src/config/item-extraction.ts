export { DEFAULT_AI_PROCESSING_MODEL as DEFAULT_ITEM_EXTRACTION_MODEL } from "./ai-processing";
export const ITEM_EXTRACTION_PROVIDER = "openai";
// Optional line items must not hold a successful aggregate Order review open.
export const OPTIONAL_QUOTE_ITEMS_TIMEOUT_MS = 30_000;
export const MAX_BUDGET_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_BUDGET_ROWS = 500;
export const ACCEPTED_BUDGET_FILE_TYPES =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
