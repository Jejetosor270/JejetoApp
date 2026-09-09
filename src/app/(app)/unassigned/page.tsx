import { getApplicationSettings } from "@/lib/settings/application-settings";
import Link from "next/link";
import { requireUser, canEditMasterData } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { RelatedRecords } from "@/components/layout/related-records";
import { editableRelatedTables } from "@/lib/related-records/editing";
import {
  table,
  projectsTable,
  ordersTable,
  billingsTable,
  supplierInstallmentsTable,
  clientInstallmentsTable,
  projectSelect,
  orderSelect,
  billingSelect,
  supplierInstallmentSelect,
  clientInstallmentSelect,
} from "@/lib/related-records/projections";
import {
  parsePageInput,
  queryStringFromParams,
} from "@/domain/listing/validation";
import { Pagination } from "@/components/listing/pagination";

export const metadata = { title: "Unassigned records" };
export default async function UnassignedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const settings = await getApplicationSettings();
  const params = await searchParams;
  const paging = parsePageInput(params);
  const page = {
    skip: (paging.page - 1) * paging.pageSize,
    take: paging.pageSize,
    orderBy: { id: "asc" as const },
  };
  const db = getDatabase();
  const [
    projects,
    orders,
    billing,
    supplier,
    client,
    buildings,
    rooms,
    packages,
    items,
    counts,
  ] = await Promise.all([
    db.project.findMany({
      where: { clientId: null },
      select: projectSelect,
      ...page,
    }),
    db.procurementOrder.findMany({
      where: { OR: [{ projectId: null }, { supplierId: null }] },
      select: orderSelect,
      ...page,
    }),
    db.clientBillingDocument.findMany({
      where: { OR: [{ projectId: null }, { clientId: null }] },
      select: billingSelect,
      ...page,
    }),
    db.paymentInstallment.findMany({
      where: { orderId: null },
      select: supplierInstallmentSelect,
      ...page,
    }),
    db.clientPaymentInstallment.findMany({
      where: { billingDocumentId: null },
      select: clientInstallmentSelect,
      ...page,
    }),
    db.building.findMany({
      where: { projectId: null },
      select: { id: true, name: true, shortCode: true },
      ...page,
    }),
    db.room.findMany({
      where: { buildingId: null },
      select: { id: true, name: true, code: true },
      ...page,
    }),
    db.orderPackage.findMany({
      where: { projectId: null },
      select: { id: true, name: true },
      ...page,
    }),
    db.item.findMany({
      where: { projectId: null },
      select: { id: true, name: true, itemReference: true },
      ...page,
    }),
    Promise.all([
      db.project.count({ where: { clientId: null } }),
      db.procurementOrder.count({
        where: { OR: [{ projectId: null }, { supplierId: null }] },
      }),
      db.clientBillingDocument.count({
        where: { OR: [{ projectId: null }, { clientId: null }] },
      }),
      db.paymentInstallment.count({ where: { orderId: null } }),
      db.clientPaymentInstallment.count({ where: { billingDocumentId: null } }),
      db.building.count({ where: { projectId: null } }),
      db.room.count({ where: { buildingId: null } }),
      db.orderPackage.count({ where: { projectId: null } }),
      db.item.count({ where: { projectId: null } }),
    ]),
  ]);
  const allTables = [
    projectsTable(projects),
    ordersTable(orders),
    billingsTable(billing),
    supplierInstallmentsTable(supplier),
    clientInstallmentsTable(client),
    table(
      "buildings",
      "Buildings",
      ["Building", "Code"],
      buildings.map((row) => ({
        id: row.id,
        cells: [row.name, row.shortCode],
      })),
    ),
    table(
      "rooms",
      "Rooms",
      ["Room", "Code"],
      rooms.map((row) => ({ id: row.id, cells: [row.name, row.code ?? "—"] })),
    ),
    table(
      "packages",
      "Packages",
      ["Package"],
      packages.map((row) => ({ id: row.id, cells: [row.name] })),
    ),
    table(
      "items",
      "Items",
      ["Item", "Reference"],
      items.map((row) => ({
        id: row.id,
        href: `/items/${row.id}`,
        cells: [row.name, row.itemReference ?? "—"],
      })),
    ),
  ];
  const tables = allTables.filter(
    (table) => table.id !== "items" || settings.itemManagementEnabled,
  );
  if (canEditMasterData(user.role)) {
    editableRelatedTables(tables);
    for (const table of tables)
      if (
        table.editKind &&
        table.editKind !== "allocation" &&
        table.editKind !== "allocation-order"
      )
        table.trashKind = table.editKind;
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Unassigned records"
        description="Retained records whose assignments have been removed. Each table shows the current page of that record type."
      />
      <Link className="underline" href="/unassigned-cash">
        View unassigned cash records
      </Link>
      <RelatedRecords tables={tables} />
      <Pagination
        pathname="/unassigned"
        queryString={queryStringFromParams(params)}
        {...paging}
        total={Math.max(0, ...counts)}
      />
    </div>
  );
}
