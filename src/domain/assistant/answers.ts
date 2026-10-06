import { z } from "zod";

export const assistantFinancialTopics = [
  "overview",
  "costs_profit",
  "billing_coverage",
  "cash",
  "vat",
  "freight",
] as const;

export type AssistantFinancialTopic = (typeof assistantFinancialTopics)[number];

export const assistantFinancialRequestSchema = z.strictObject({
  projectId: z.uuid(),
  topic: z.enum(assistantFinancialTopics),
});
export type AssistantFinancialRequest = z.infer<
  typeof assistantFinancialRequestSchema
>;

/** Trusted presentation only: never populated from AI prose or client-supplied amounts. */
export interface AssistantAnswer {
  title: string;
  paragraphs: string[];
  steps?: string[];
  metrics?: { label: string; value: string | null; href?: string }[];
  links: { label: string; href: string }[];
  sources?: { label: string; href: string; note?: string }[];
  sourceCount?: number;
  warnings?: string[];
  asOf?: string;
}
