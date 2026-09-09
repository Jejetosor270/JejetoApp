import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { cellEditSchema, CellEditError } from "@/domain/listing/cell-edit";
import { getDatabase } from "@/lib/db";
import { editOrderCell } from "@/lib/procurement/cell-edit";
import { editBillingCell } from "@/lib/billing/cell-edit";

export async function saveTableCell(actorId: string, raw: unknown) {
  const input = cellEditSchema.parse(raw);
  return getDatabase().$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { isActive: true, role: true },
      });
      if (!actor?.isActive || !["ADMIN", "MANAGER"].includes(actor.role))
        throw new CellEditError(
          "Only active Administrators and Managers can edit records.",
        );
      if (input.kind === "order") await editOrderCell(tx, actorId, input);
      else await editBillingCell(tx, actorId, input);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
