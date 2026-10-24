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

const paymentKinds = new Set(["term-due", "document-due", "issue-invoice"]);
const paymentSetupKinds = new Set([
  "schedule",
  "schedule-overflow",
  "missing-date",
  "term-date",
  "cash-incomplete",
  "cash-match",
]);

export type AttentionOwnerFilter = "all" | "mine" | "unassigned";
export type AttentionScope =
  "payments" | "payment-setup" | "data-quality" | "all";

/** Home presentation only; the source issue and financial calculations are unchanged. */
export function attentionScopeForIssue(
  issue: Pick<AttentionIssue, "key">,
): Exclude<AttentionScope, "all"> {
  const kind = issue.key.split(":")[0] ?? "";
  if (paymentKinds.has(kind) || kind.startsWith("refund-due-"))
    return "payments";
  if (paymentSetupKinds.has(kind)) return "payment-setup";
  // Retain reporting, archival and future/unknown checks in an explicit review view.
  return "data-quality";
}

export function isAttentionDataQuality(issue: Pick<AttentionIssue, "key">) {
  return attentionScopeForIssue(issue) === "data-quality";
}

export function matchesAttentionScope(
  issue: Pick<AttentionIssue, "key">,
  scope: AttentionScope,
) {
  return scope === "all" || attentionScopeForIssue(issue) === scope;
}

/** Remove only the duplicate no-terms warning; never discard employee follow-ups. */
export function consolidateHomeAttention<
  T extends Pick<AttentionIssue, "key"> & {
    followUp?: unknown;
    snooze?: unknown;
  },
>(issues: readonly T[]): T[] {
  const schedules = new Set(
    issues
      .filter((issue) => issue.key.startsWith("schedule:"))
      .map((issue) => issue.key.slice("schedule:".length)),
  );
  return issues.filter(
    (issue) =>
      !issue.key.startsWith("missing-date:") ||
      !schedules.has(issue.key.slice("missing-date:".length)) ||
      issue.followUp != null ||
      issue.snooze != null,
  );
}

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
