import { RelatedRecords } from "@/components/layout/related-records";
import { getDatabase } from "@/lib/db";
import { requireUser, canEditMasterData } from "@/lib/auth/current-user";
import {
  table,
  projectsTable,
  ordersTable,
  partiesTable,
  projectSelect,
  orderSelect,
  partySelect,
} from "@/lib/related-records/projections";
import { editableRelatedTables } from "@/lib/related-records/editing";
import type { AssignmentRelation } from "@/lib/related-records/types";

export async function ItemRelatedRecords({ itemId }: { itemId: string }) {
  const user = await requireUser();
  const item = await getDatabase().item.findUnique({
    where: { id: itemId },
    select: {
      project: { select: projectSelect },
      procurementOrder: { select: orderSelect },
      supplier: { select: partySelect },
      building: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
    },
  });
  if (!item) return null;
  const tables = [
    projectsTable([item.project]),
    ordersTable([item.procurementOrder]),
    partiesTable("suppliers", [item.supplier]),
    table(
      "buildings",
      "Buildings",
      ["Building"],
      item.building
        ? [{ id: item.building.id, cells: [item.building.name] }]
        : [],
    ),
    table(
      "rooms",
      "Rooms",
      ["Room"],
      item.room ? [{ id: item.room.id, cells: [item.room.name] }] : [],
    ),
  ];
  if (canEditMasterData(user.role)) {
    editableRelatedTables(tables);
    const relations: Record<string, AssignmentRelation> = {
      projects: "item-project",
      orders: "item-order",
      suppliers: "item-supplier",
      buildings: "item-building",
      rooms: "item-room",
    };
    for (const table of tables) {
      const relation = relations[table.id];
      if (relation)
        table.removal = {
          kind: "assignment",
          relation,
          parentId: itemId,
          ownerId: itemId,
        };
    }
  }
  return <RelatedRecords tables={tables} />;
}
