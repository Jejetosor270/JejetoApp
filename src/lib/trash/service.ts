import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { modelMap } from "./model-map";

export class TrashError extends Error {}
const targets = Object.entries(modelMap).filter(([, value]) => value.trash);
function table(model: string) {
  const definition = modelMap[model];
  if (!definition?.trash)
    throw new TrashError("This record type does not support Trash.");
  return Prisma.raw('"' + definition.table + '"');
}
function column(name: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name))
    throw new TrashError("Invalid relation.");
  return Prisma.raw('"' + name + '"');
}
const uuidList = (ids: readonly string[]) =>
  Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
type Transaction = Prisma.TransactionClient;

/** Store only restoration metadata here; business data stays in its original tables. */
export async function trashInTransaction(
  tx: Transaction,
  actorId: string,
  model: string,
  ids: string[],
) {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new TrashError("Select at least one record.");
  const roots = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM ${table(model)} WHERE id IN (${uuidList(unique)}) AND "trashedAt" IS NULL FOR UPDATE`,
  );
  if (roots.length !== unique.length)
    throw new TrashError(
      "Some selected records are no longer available. Refresh and try again.",
    );
  const batchId = randomUUID();
  const pending = new Map<string, Set<string>>([[model, new Set(unique)]]);
  const visited = new Map<string, Set<string>>();
  // Follow business dependencies without severing foreign keys or replacing money with snapshots.
  while (pending.size) {
    const entry = pending.entries().next().value as
      [string, Set<string>] | undefined;
    if (!entry) break;
    const [parent, candidates] = entry;
    pending.delete(parent);
    const seen = visited.get(parent) ?? new Set<string>();
    const newIds = [...candidates].filter((id) => !seen.has(id));
    if (!newIds.length) continue;
    newIds.forEach((id) => seen.add(id));
    visited.set(parent, seen);
    for (const [child, metadata] of targets) {
      const foreignKeys = Object.values(metadata.relations)
        .filter(
          (relation) => relation.model === parent && relation.fields.length > 0,
        )
        .flatMap((relation) =>
          relation.fields.filter(
            (field) => field !== "projectId" || relation.fields.length === 1,
          ),
        );
      if (!foreignKeys.length) continue;
      const rows = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM ${table(child)} WHERE "trashedAt" IS NULL AND (${Prisma.join(
          foreignKeys.map(
            (field) => Prisma.sql`${column(field)} IN (${uuidList(newIds)})`,
          ),
          " OR ",
        )})`,
      );
      const next = pending.get(child) ?? new Set<string>();
      rows.forEach((row) => {
        if (!visited.get(child)?.has(row.id)) next.add(row.id);
      });
      if (next.size) pending.set(child, next);
    }
  }
  const referenceFields: Record<string, string> = {
    Client: "displayName",
    Supplier: "displayName",
    Project: "name",
    ProcurementOrder: "orderNumber",
    ClientBillingDocument: "reference",
    PaymentInstallment: "label",
    ClientPaymentInstallment: "label",
    PaymentSettlement: "reference",
    ClientReceipt: "reference",
    Item: "name",
    ProjectFreightExpense: "description",
  };
  const field = referenceFields[model] ?? "id";
  const references = await tx.$queryRaw<{ reference: string | null }[]>(
    Prisma.sql`SELECT ${column(field)}::text AS reference FROM ${table(model)} WHERE id IN (${uuidList(unique)}) ORDER BY id LIMIT 3`,
  );
  const label =
    `${model.replace(/([a-z])([A-Z])/g, "$1 $2")} · ${references.map((row) => row.reference || "Untitled").join(", ")}${unique.length > 3 ? "…" : ""}`.slice(
      0,
      255,
    );
  await tx.trashBatch.create({
    data: { id: batchId, label, createdById: actorId },
  });
  const dependencies = new Map<
    string,
    { batchId: string; model: string; recordId: string; signature: string }
  >();
  for (const [child, records] of visited) {
    for (const relation of Object.values(modelMap[child]?.relations ?? {})) {
      const foreignKey = relation.fields[0];
      if (!modelMap[relation.model]?.trash || !foreignKey) continue;
      const parents = await tx.$queryRaw<{ id: string; signature: string }[]>(
        Prisma.sql`SELECT DISTINCT parent.id, md5((to_jsonb(parent) - 'updatedAt' - 'updatedById' - 'createdById' - 'trashedAt')::text) AS signature FROM ${table(child)} child JOIN ${table(relation.model)} parent ON child.${column(foreignKey)} = parent.id WHERE child.id IN (${uuidList([...records])})`,
      );
      for (const parent of parents)
        if (!visited.get(relation.model)?.has(parent.id))
          dependencies.set(relation.model + parent.id, {
            batchId,
            model: relation.model,
            recordId: parent.id,
            signature: parent.signature,
          });
    }
  }
  if (dependencies.size)
    await tx.trashDependency.createMany({ data: [...dependencies.values()] });
  for (const [kind, records] of visited) {
    const recordIds = [...records];
    await tx.$executeRaw(
      Prisma.sql`UPDATE ${table(kind)} SET "trashedAt" = CURRENT_TIMESTAMP WHERE id IN (${uuidList(recordIds)}) AND "trashedAt" IS NULL`,
    );
    await tx.trashRecord.createMany({
      data: recordIds.map((recordId) => ({ batchId, model: kind, recordId })),
    });
  }
  await writeAuditEvent(tx, actorId, {
    action: "DELETED",
    entityType: "SETTING",
    entityId: batchId,
    entityReference: `${model} Trash group`,
    summary:
      "Moved business records and their dependents to recoverable Trash.",
    metadata: {
      model,
      selectedIds: unique,
      count: [...visited.values()].reduce((sum, rows) => sum + rows.size, 0),
    },
  });
  return batchId;
}
export async function moveToTrash(
  actorId: string,
  model: string,
  ids: string[],
) {
  try {
    return await getDatabase().$transaction(
      (tx) => trashInTransaction(tx, actorId, model, ids),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    )
      throw new TrashError(
        "The records changed during deletion. Refresh and try again.",
      );
    throw error;
  }
}

async function validateRestoration(
  tx: Transaction,
  models: Map<string, string[]>,
  batchId: string,
) {
  for (const [model, ids] of models) {
    for (const relation of Object.values(modelMap[model]?.relations ?? {})) {
      if (!modelMap[relation.model]?.trash || !relation.fields.length) continue;
      // Composite Order/Package references use the first (UUID identity) column.
      const field = relation.fields[0];
      if (!field) continue;
      const blocked = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT child.id FROM ${table(model)} child JOIN ${table(relation.model)} parent ON child.${column(field)} = parent.id WHERE child.id IN (${uuidList(ids)}) AND parent."trashedAt" IS NOT NULL LIMIT 1`,
      );
      if (blocked.length)
        throw new TrashError(
          "Restore the related parent record from Trash first.",
        );
    }
  }
  const paymentConflict = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT i.id FROM payment_installments i JOIN payment_settlements s ON s."installmentId" = i.id
    WHERE i."trashedAt" IS NULL AND s."trashedAt" IS NULL
    AND (i.id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'PaymentInstallment')
      OR i.id IN (SELECT "installmentId" FROM payment_settlements WHERE id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'PaymentSettlement')))
    GROUP BY i.id
    HAVING SUM(s.amount) > i."scheduledAmount" LIMIT 1`);
  const receiptConflict = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT i.id FROM client_payment_installments i JOIN client_receipts r ON r."installmentId" = i.id
    WHERE i."trashedAt" IS NULL AND r."trashedAt" IS NULL
    AND (i.id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ClientPaymentInstallment')
      OR i.id IN (SELECT "installmentId" FROM client_receipts WHERE id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ClientReceipt')))
    GROUP BY i.id
    HAVING SUM(r.amount) > i."scheduledAmount" LIMIT 1`);
  const billingConflict = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT b.id FROM client_billing_documents b JOIN client_receipts r ON r."billingDocumentId" = b.id OR r."installmentId" = b."matchedInstallmentId"
    WHERE b."trashedAt" IS NULL AND r."trashedAt" IS NULL
    AND (b.id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ClientBillingDocument')
      OR b.id IN (SELECT "billingDocumentId" FROM client_receipts WHERE id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ClientReceipt'))
      OR b."matchedInstallmentId" IN (SELECT "installmentId" FROM client_receipts WHERE id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ClientReceipt')))
    GROUP BY b.id
    HAVING SUM(r.amount) > b."totalTtc" LIMIT 1`);
  if (
    paymentConflict.length ||
    receiptConflict.length ||
    billingConflict.length
  )
    throw new TrashError(
      "Restoring these records would cause an overpayment. Correct the replacement payments or receipts before restoring.",
    );
  const scheduleConflict = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT b.id FROM client_billing_documents b JOIN client_payment_installments i ON i."billingDocumentId" = b.id
    WHERE b."trashedAt" IS NULL AND i."trashedAt" IS NULL AND NOT i."isCancelled"
    AND b.id IN (SELECT "billingDocumentId" FROM client_payment_installments WHERE id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ClientPaymentInstallment'))
    GROUP BY b.id HAVING SUM(i."scheduledAmount") > b."totalTtc" LIMIT 1`);
  const matchConflict = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "matchedInstallmentId" AS id FROM client_billing_documents
    WHERE "trashedAt" IS NULL AND NOT "isCancelled" AND "matchedInstallmentId" IN
      (SELECT "matchedInstallmentId" FROM client_billing_documents WHERE id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ClientBillingDocument'))
    GROUP BY "matchedInstallmentId" HAVING COUNT(*) > 1 LIMIT 1`);
  if (scheduleConflict.length || matchConflict.length)
    throw new TrashError(
      "Restoring would duplicate a collection schedule or exceed Billing TTC. Correct the replacement schedule before restoring.",
    );
  const allocationConflict = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT b.id FROM client_billing_documents b JOIN client_billing_allocations a ON a."billingDocumentId" = b.id
    JOIN procurement_orders o ON o.id = a."orderId"
    WHERE b."trashedAt" IS NULL AND o."trashedAt" IS NULL
    AND (b.id IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ClientBillingDocument')
      OR b.id IN (SELECT "billingDocumentId" FROM client_billing_allocations WHERE "orderId" IN (SELECT "recordId" FROM trash_records WHERE "batchId" = ${batchId}::uuid AND model = 'ProcurementOrder')))
    GROUP BY b.id HAVING SUM(a."allocatedAmount") > b."totalHt"
      OR SUM(a."freightCoverageHt") > b."freightCoverageHt"
      OR SUM(a."allocatedAmount" - a."freightCoverageHt") > b."totalHt" - b."freightCoverageHt" LIMIT 1`);
  if (allocationConflict.length)
    throw new TrashError(
      "Restoring these Orders would exceed a Billing allocation or its freight coverage. Correct the replacement allocations first.",
    );
}
export async function restoreTrash(actorId: string, batchId: string) {
  return getDatabase().$transaction(
    async (tx) => {
      const batches = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM trash_batches WHERE id = ${batchId}::uuid AND "restoredAt" IS NULL FOR UPDATE`,
      );
      if (!batches.length)
        throw new TrashError(
          "This Trash group has already been restored or no longer exists.",
        );
      const dependencies = await tx.trashDependency.findMany({
        where: { batchId },
      });
      for (const dependency of dependencies) {
        const rows = await tx.$queryRaw<{ signature: string }[]>(
          Prisma.sql`SELECT md5((to_jsonb(parent) - 'updatedAt' - 'updatedById' - 'createdById' - 'trashedAt')::text) AS signature FROM ${table(dependency.model)} parent WHERE id = ${dependency.recordId}::uuid AND "trashedAt" IS NULL`,
        );
        if (rows[0]?.signature !== dependency.signature)
          throw new TrashError(
            "A related parent is deleted or has changed since deletion. Restore its original state before restoring this group.",
          );
      }
      const records = await tx.trashRecord.findMany({ where: { batchId } });
      const models = new Map<string, string[]>();
      for (const row of records)
        models.set(row.model, [...(models.get(row.model) ?? []), row.recordId]);
      for (const [model, ids] of models) {
        const count = await tx.$executeRaw(
          Prisma.sql`UPDATE ${table(model)} SET "trashedAt" = NULL WHERE id IN (${uuidList(ids)}) AND "trashedAt" IS NOT NULL`,
        );
        if (count !== ids.length)
          throw new TrashError(
            "The Trash group has changed. Nothing was restored.",
          );
      }
      await validateRestoration(tx, models, batchId);
      await tx.trashBatch.update({
        where: { id: batchId },
        data: { restoredAt: new Date(), restoredById: actorId },
      });
      await writeAuditEvent(tx, actorId, {
        action: "UPDATED",
        entityType: "SETTING",
        entityId: batchId,
        entityReference: "Trash restoration",
        summary:
          "Restored business records and their original relationships from Trash.",
        metadata: { count: records.length },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
