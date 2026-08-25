import "server-only";

import { OpenAIQuoteExtractionProvider } from "./openai-provider";
import type { QuoteExtractionProvider } from "./provider";

export function getQuoteExtractionProvider(): QuoteExtractionProvider {
  return new OpenAIQuoteExtractionProvider();
}
