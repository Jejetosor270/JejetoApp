import { z } from "zod";
import { isDateOnly } from "@/domain/payments/dates";
import type { AttentionIssue } from "./attention";

const issueKeySchema = z
  .string()
  .max(120)
  .regex(/^[a-z0-9-]+:[a-f0-9-]{36}$/);

export const attentionFollowUpSchema = z.object({
  key: issueKeySchema,
  horizon: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  version: z.number().int().positive().nullable(),
  assigneeId: z.uuid().nullable(),
  nextFollowUpDate: z
    .string()
    .refine(isDateOnly, "Choose a valid date.")
    .nullable(),
  note: z.string().trim().max(1000),
});

export interface AttentionFollowUp {
  version: number;
  assigneeId: string | null;
  assigneeName: string | null;
  nextFollowUpDate: string | null;
  note: string;
}

/** Follow-ups survive monetary changes and horizon switches, unlike personal snoozes. */
export function attentionFollowUpKey(key: string): string | null {
  // Duplicate groups can change their representative record. Do not attach shared
  // ownership to that unstable identity or silently transfer it to another group.
  if (key.startsWith("duplicate:")) return null;
  return key.replace(/^cash-gap-(7|30|90):/, "cash-gap:");
}

const dataQualityKinds = new Set([
  "document-fx",
  "actual-fx",
  "term-fx",
  "term-actual-fx",
  "schedule",
  "missing-date",
  "term-date",
  "cash-incomplete",
  "cash-match",
  "duplicate",
]);

export function isAttentionDataQuality(issue: Pick<AttentionIssue, "key">) {
  const kind = issue.key.split(":")[0] ?? "";
  return (
    dataQualityKinds.has(kind) ||
    kind.startsWith("unassigned-") ||
    kind.startsWith("archived-")
  );
}

export type AttentionOwnerFilter = "all" | "mine" | "unassigned";
export type AttentionScope = "all" | "data-quality";

export function matchesAttentionOwner(
  followUp: Pick<AttentionFollowUp, "assigneeId"> | null | undefined,
  owner: AttentionOwnerFilter,
  userId: string,
) {
  if (owner === "mine") return followUp?.assigneeId === userId;
  if (owner === "unassigned") return !followUp?.assigneeId;
  return true;
}

export function attentionWorkspaceQuery(input: {
  horizon: number;
  snoozed: boolean;
  owner: AttentionOwnerFilter;
  scope: AttentionScope;
  pageSize: number;
}) {
  return new URLSearchParams({
    horizon: String(input.horizon),
    attention: input.snoozed ? "snoozed" : "active",
    owner: input.owner,
    scope: input.scope,
    pageSize: String(input.pageSize),
  }).toString();
}
