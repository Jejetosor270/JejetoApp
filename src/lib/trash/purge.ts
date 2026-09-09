import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { modelMap } from "./model-map";
import { TrashError } from "./service";

const business = Object.entries(modelMap).filter(([, value]) => value.trash);
// Supporting normalized rows have no independent Trash lifecycle.
const supporting = [
  "ProcurementOrderBuilding",
  "ProcurementOrderCostLine",
  "ProcurementOrderVatEntry",
  "SupplierQuoteImport",
  "ClientBillingAllocation",
  "ClientDocumentImport",
  "ItemImport",
];
function table(model: string) {
  const metadata = modelMap[model];
  if (!metadata) throw new TrashError("Unknown business record type.");
  return Prisma.raw(`"${metadata.table}"`);
}
const column = (field: string) => Prisma.raw(`"${field}"`);

export async function emptyTrash(actorId: string) {
  return getDatabase().$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { role: true, isActive: true },
      });
      if (!actor?.isActive || actor.role !== "ADMIN")
        throw new TrashError("Only an active Administrator can empty Trash.");
      // Prevent new dependencies, restoration and concurrent deletion during the purge.
      await tx.$executeRaw(
        Prisma.sql`LOCK TABLE ${Prisma.join([...business.map(([name]) => table(name)), ...supporting.map(table), table("TrashBatch"), table("TrashRecord"), table("TrashDependency")])} IN SHARE ROW EXCLUSIVE MODE`,
      );
      const counts: Record<string, number> = {};
      for (const [name] of business) {
        const [row] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM ${table(name)} WHERE "trashedAt" IS NOT NULL`,
        );
        counts[name] = Number(row?.count ?? 0);
      }
      const total = Object.values(counts).reduce(
        (sum, count) => sum + count,
        0,
      );
      if (!total) return 0;
      for (const [child, metadata] of business) {
        for (const relation of Object.values(metadata.relations)) {
          if (!modelMap[relation.model]?.trash || !relation.fields.length)
            continue;
          const field = relation.fields[0];
          if (!field) continue;
          const [active] = await tx.$queryRaw<{ found: boolean }[]>(
            Prisma.sql`SELECT EXISTS (SELECT 1 FROM ${table(child)} c JOIN ${table(relation.model)} p ON c.${column(field)} = p.id WHERE c."trashedAt" IS NULL AND p."trashedAt" IS NOT NULL) AS found`,
          );
          if (active?.found)
            throw new TrashError(
              "An active record still depends on Trash. Restore or remove that relationship before emptying Trash.",
            );
          if (
            child === "ClientBillingDocument" &&
            ["matchedInstallmentId", "supersedesDocumentId"].includes(field)
          )
            await tx.$executeRaw(
              Prisma.sql`UPDATE ${table(child)} SET ${column(field)} = NULL WHERE "trashedAt" IS NOT NULL AND ${column(field)} IN (SELECT id FROM ${table(relation.model)} WHERE "trashedAt" IS NOT NULL)`,
            );
        }
      }
      for (const name of supporting) {
        const metadata = modelMap[name];
        if (!metadata)
          throw new TrashError("Missing supporting record policy.");
        const conditions = Object.values(metadata.relations).flatMap(
          (relation) => {
            const field = relation.fields[0];
            // Item import history survives supplier/order deletion; these FKs use SetNull.
            if (
              !field ||
              !modelMap[relation.model]?.trash ||
              (name === "ItemImport" && relation.model !== "Project")
            )
              return [];
            return [
              Prisma.sql`${column(field)} IN (SELECT id FROM ${table(relation.model)} WHERE "trashedAt" IS NOT NULL)`,
            ];
          },
        );
        if (conditions.length)
          await tx.$executeRaw(
            Prisma.sql`DELETE FROM ${table(name)} WHERE ${Prisma.join(conditions, " OR ")}`,
          );
      }
      const pending = new Set(business.map(([name]) => name));
      while (pending.size) {
        const leaf = [...pending].find(
          (parent) =>
            ![...pending].some((child) =>
              Object.values(modelMap[child]?.relations ?? {}).some(
                (relation) =>
                  relation.model === parent &&
                  relation.fields.length &&
                  !(
                    child === "ClientBillingDocument" &&
                    ["matchedInstallmentId", "supersedesDocumentId"].includes(
                      relation.fields[0] ?? "",
                    )
                  ),
              ),
            ),
        );
        if (!leaf)
          throw new TrashError(
            "A required relationship prevents permanent deletion. Nothing was deleted.",
          );
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM ${table(leaf)} WHERE "trashedAt" IS NOT NULL`,
        );
        pending.delete(leaf);
      }
      await tx.trashDependency.deleteMany({
        where: { batch: { restoredAt: null } },
      });
      await tx.trashRecord.deleteMany({
        where: { batch: { restoredAt: null } },
      });
      await tx.trashBatch.deleteMany({ where: { restoredAt: null } });
      await writeAuditEvent(tx, actorId, {
        action: "DELETED",
        entityType: "SETTING",
        entityReference: "Trash",
        summary: `Permanently deleted ${total} trashed business records.`,
        metadata: { counts },
      });
      return total;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000,
    },
  );
}
