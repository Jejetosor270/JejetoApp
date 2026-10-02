import "server-only";

import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import {
  recordActivityHref,
  recordAuditChanges,
  recordHistoryScopeSchema,
  type RecordHistoryData,
  type RecordHistoryType,
} from "@/domain/audit/history";

const HISTORY_LIMIT = 20;

/** Same ADMIN/MANAGER audience as Settings Activity; USER never receives audit data. */
export async function getRecordHistory(
  entityType: RecordHistoryType,
  entityId: string,
): Promise<RecordHistoryData | null> {
  const user = await requireUser();
  if (!canEditMasterData(user.role)) return null;
  const scope = recordHistoryScopeSchema.parse({ entityType, entityId });
  const events = await getDatabase().auditEvent.findMany({
    where: scope,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT + 1,
    select: {
      id: true,
      occurredAt: true,
      actorName: true,
      action: true,
      summary: true,
      metadata: true,
    },
  });
  return {
    activityHref: recordActivityHref(scope.entityType, scope.entityId),
    hasMore: events.length > HISTORY_LIMIT,
    entries: events.slice(0, HISTORY_LIMIT).map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      actorName: event.actorName,
      action: event.action,
      summary: event.summary,
      changes: recordAuditChanges(scope.entityType, event.metadata),
    })),
  };
}
