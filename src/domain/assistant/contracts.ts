import { z } from "zod";

export const ASSISTANT_MESSAGE_LIMIT = 800;
export const ASSISTANT_CONTEXT_LIMIT = 4;
export const ASSISTANT_RESULT_LIMIT = 10;

export const assistantRecordKinds = [
  "Project",
  "Order",
  "Billing",
  "Client",
  "Supplier",
] as const;

export const assistantRequestSchema = z.strictObject({
  message: z.string().trim().min(2).max(ASSISTANT_MESSAGE_LIMIT),
  recentMessages: z
    .array(z.string().trim().min(2).max(ASSISTANT_MESSAGE_LIMIT))
    .max(ASSISTANT_CONTEXT_LIMIT),
});

export const assistantSearchPlanSchema = z
  .strictObject({
    intent: z.enum(["SEARCH", "CLARIFY", "OUT_OF_SCOPE"]),
    query: z.string().trim().min(2).max(100).nullable(),
    kind: z.enum(["All", ...assistantRecordKinds]),
  })
  .refine((plan) => plan.intent !== "SEARCH" || plan.query !== null, {
    path: ["query"],
    message: "A record search needs a name or reference.",
  });

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantSearchPlan = z.infer<typeof assistantSearchPlanSchema>;
export type AssistantRecordKind = (typeof assistantRecordKinds)[number];

export interface AssistantRecord {
  id: string;
  type: AssistantRecordKind;
  label: string;
  context: string;
  href: string;
}

export interface AssistantSearchResults {
  results: AssistantRecord[];
  truncated: boolean;
}

export interface AssistantReply extends AssistantSearchResults {
  message: string;
  query: string | null;
  moreHref: string | null;
}

export type AssistantActionResult =
  | { ok: true; reply: AssistantReply }
  | {
      ok: false;
      error: string;
      code: "INVALID" | "LIMIT" | "UNAVAILABLE";
    };
