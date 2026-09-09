import { RelatedRecordTable } from "@/components/layout/related-records";
import { requireUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { getApplicationSettings } from "@/lib/settings/application-settings";
import { formatEnumLabel } from "@/domain/presentation/labels";

export async function RelatedItems({
  projectId,
  orderId,
}: {
  projectId: string;
  orderId?: string;
}) {
  await requireUser();
  const settings = await getApplicationSettings();
  if (!settings.itemManagementEnabled) return null;
  const items = await getDatabase().item.findMany({
    where: { projectId, ...(orderId ? { procurementOrderId: orderId } : {}) },
    select: {
      id: true,
      name: true,
      itemReference: true,
      commercialStatus: true,
      logisticsStatus: true,
      building: { select: { name: true } },
      room: { select: { name: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return (
    <RelatedRecordTable
      table={{
        id: "items",
        title: "Items (Beta)",
        description:
          "Project-specific supporting detail; Order financials remain authoritative.",
        columns: [
          "Item",
          "Reference",
          "Building",
          "Room",
          "Commercial status",
          "Logistics status",
        ],
        rows: items.map((item) => ({
          id: item.id,
          href: `/items/${item.id}`,
          cells: [
            item.name,
            item.itemReference ?? "—",
            item.building?.name ?? "—",
            item.room?.name ?? "—",
            formatEnumLabel(item.commercialStatus),
            formatEnumLabel(item.logisticsStatus),
          ],
        })),
      }}
    />
  );
}
