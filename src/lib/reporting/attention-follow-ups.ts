import "server-only";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { requireRole } from "@/lib/auth/current-user";
import {
  attentionFollowUpKey,
  attentionFollowUpSchema,
} from "@/domain/finance/attention-follow-up";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { getAttentionWorkspace } from "./attention-workspace";

class FollowUpConflict extends Error {}

export async function saveAttentionFollowUp(input: unknown) {
  const actor = await requireRole(["ADMIN", "MANAGER"]);
  const parsed = attentionFollowUpSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message:
        "Choose a valid owner and date, and keep the note within 1,000 characters.",
    };
  const data = parsed.data;
  const issueKey = attentionFollowUpKey(data.key);
  if (!issueKey)
    return {
      ok: false,
      message:
        "Duplicate groups need record review; shared ownership is not available for these changing groups.",
    };
  try {
    const snapshot = await getAttentionWorkspace(data.horizon);
    const issue = snapshot.issues.find((row) => row.key === data.key);
    if (!issue)
      return {
        ok: false,
        message:
          "This issue is no longer in the current view. Refresh Home and review its source record; your draft is retained.",
      };
    await getDatabase().$transaction(
      async (tx) => {
        if (data.assigneeId) {
          const assignee = await tx.user.findFirst({
            where: { id: data.assigneeId, isActive: true },
            select: { id: true },
          });
          if (!assignee)
            throw new FollowUpConflict(
              "Choose an active employee. Your draft is retained.",
            );
        }
        const before = await tx.financialFollowUp.findUnique({
          where: { issueKey },
        });
        if ((before?.version ?? null) !== data.version)
          throw new FollowUpConflict(
            "This follow-up changed after you opened it. Your draft is retained; close and reopen to load the latest version.",
          );
        const fields = {
          assigneeId: data.assigneeId,
          nextFollowUpDate: data.nextFollowUpDate
            ? dateOnlyToDate(data.nextFollowUpDate)
            : null,
          note: data.note,
          updatedById: actor.id,
        };
        const after = before
          ? await tx.financialFollowUp.update({
              where: { id: before.id, version: data.version ?? 0 },
              data: { ...fields, version: { increment: 1 } },
            })
          : await tx.financialFollowUp.create({
              data: { ...fields, issueKey, createdById: actor.id },
            });
        const snapshotFields = (row: typeof after) => ({
          issueKey: row.issueKey,
          assigneeId: row.assigneeId,
          nextFollowUpDate: row.nextFollowUpDate
            ? dateToDateOnly(row.nextFollowUpDate)
            : null,
          note: row.note,
          version: row.version,
        });
        await writeAuditEvent(tx, actor.id, {
          action: before ? "UPDATED" : "CREATED",
          entityType: "FINANCIAL_FOLLOW_UP",
          entityId: after.id,
          entityReference: issue.reference,
          summary: `${before ? "Updated" : "Created"} shared financial follow-up.`,
          metadata: {
            before: before ? snapshotFields(before) : null,
            after: snapshotFields(after),
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return {
      ok: true,
      message: "Shared follow-up saved. Financial records are unchanged.",
    };
  } catch (error) {
    if (error instanceof FollowUpConflict)
      return { ok: false, message: error.message };
    return {
      ok: false,
      message:
        "Could not save the follow-up. It may have changed. Your draft is retained; refresh and reopen before retrying.",
    };
  }
}
