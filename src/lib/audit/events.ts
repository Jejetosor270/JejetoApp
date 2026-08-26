import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, AuditEntityType } from "@/domain/audit/constants";
import { getDatabase } from "@/lib/db";

interface AuditEventInput {
  action: AuditAction;
  entityId?: string | undefined;
  entityReference: string;
  entityType: AuditEntityType;
  metadata?: Prisma.InputJsonValue | undefined;
  summary: string;
}

export async function writeAuditEvent(
  transaction: Prisma.TransactionClient,
  actorId: string,
  input: AuditEventInput,
): Promise<void> {
  const actor = await transaction.user.findUnique({
    where: { id: actorId },
    select: { email: true, id: true, name: true },
  });
  if (!actor) throw new Error("The acting employee no longer exists.");
  await transaction.auditEvent.create({
    data: {
      action: input.action,
      actorEmail: actor.email,
      actorId: actor.id,
      actorName: actor.name,
      entityId: input.entityId ?? null,
      entityReference: input.entityReference,
      entityType: input.entityType,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      summary: input.summary,
    },
  });
}

export async function recordAuditEvent(
  actorId: string,
  input: AuditEventInput,
): Promise<void> {
  await getDatabase().$transaction((transaction) =>
    writeAuditEvent(transaction, actorId, input),
  );
}

export interface AuditFilters {
  action?: AuditAction | undefined;
  actorEmail?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  entityType?: AuditEntityType | undefined;
  page: number;
  pageSize: number;
}

export async function listAuditEvents(filters: AuditFilters) {
  const where = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.actorEmail ? { actorEmail: filters.actorEmail } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          occurredAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
  };
  const database = getDatabase();
  const [items, total] = await Promise.all([
    database.auditEvent.findMany({
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      where,
    }),
    database.auditEvent.count({ where }),
  ]);
  return { items, total };
}

export async function listAuditActors() {
  return getDatabase().auditEvent.findMany({
    distinct: ["actorEmail"],
    orderBy: { actorName: "asc" },
    select: { actorEmail: true, actorId: true, actorName: true },
  });
}
