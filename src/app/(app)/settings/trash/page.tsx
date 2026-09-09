import { EmptyTrashButton } from "@/components/payments/empty-trash-button";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { SettingsNavigation } from "@/components/layout/settings-navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/listing/pagination";
import {
  parsePageInput,
  queryStringFromParams,
} from "@/domain/listing/validation";
import { TrashRestoreButton } from "@/components/payments/trash-restore-button";
import {
  tableContainerClassName,
  tableHeaderClassName,
} from "@/components/listing/table-styles";
import { formatDateOnly, dateToDateOnly } from "@/domain/payments/dates";
import { ListEmptyState } from "@/components/listing/empty-state";
export const metadata = { title: "Trash" };
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireMasterDataEditor();
  const params = await searchParams;
  const paging = parsePageInput(params);
  const db = getDatabase();
  const where = { restoredAt: null };
  const [rows, total] = await Promise.all([
    db.trashBatch.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (paging.page - 1) * paging.pageSize,
      take: paging.pageSize,
      include: { _count: { select: { records: true } } },
    }),
    db.trashBatch.count({ where }),
  ]);
  return (
    <div className="space-y-6">
      <SettingsNavigation role={user.role} />
      <PageHeader
        title="Trash"
        description="Deleted business records are excluded from operational views and calculations. Restore a group to recover its records and relationships. Restore deleted parents first."
      />
      {user.role === "ADMIN" && total > 0 && <EmptyTrashButton />}
      <section className={tableContainerClassName}>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className={tableHeaderClassName}>
              <tr>
                {[
                  "Deleted records",
                  "Deleted on",
                  "Records in group",
                  "Actions",
                ].map((label) => (
                  <th className="px-4 py-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3">
                    {formatDateOnly(dateToDateOnly(row.createdAt))}
                  </td>
                  <td className="px-4 py-3">{row._count.records}</td>
                  <td className="px-4 py-3">
                    <TrashRestoreButton batchId={row.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <ListEmptyState entity="Deleted records" />}
      </section>
      <Pagination
        pathname="/settings/trash"
        queryString={queryStringFromParams(params)}
        {...paging}
        total={total}
      />
    </div>
  );
}
