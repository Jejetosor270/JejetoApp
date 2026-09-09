import { RelatedRecordTable } from "@/components/layout/related-records";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { RecordSectionHeading } from "@/components/layout/record-presentation";
import Link from "next/link";
import { getDatabase } from "@/lib/db";
import { listProjectOrders } from "@/lib/procurement/orders";
import { listPaymentInstallments } from "@/lib/payments/payments";
import { summarizePackage } from "@/domain/packages/reporting";
import { formatMoney } from "@/domain/procurement/presentation";
import { PackageAssignment, PackageEditor } from "./package-management";

export async function ProjectPackages({
  projectId,
  currency,
  canEdit,
}: {
  projectId: string;
  currency: string;
  canEdit: boolean;
}) {
  const [packages, orders, payments] = await Promise.all([
    getDatabase().orderPackage.findMany({
      where: { projectId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true },
    }),
    listProjectOrders(projectId),
    listPaymentInstallments({ projectId, direction: "SUPPLIER_PAYMENT" }),
  ]);
  const manager = (
    <section className="bg-card space-y-4 rounded-lg border p-4">
      <RecordSectionHeading
        title="Order Packages"
        description="Group Orders without changing their financial totals. Commercial totals use active Orders; paid is actual Supplier cash, outstanding is scheduled cash. — indicates missing values or FX."
        actions={canEdit ? <PackageEditor projectId={projectId} /> : null}
      />
      {[...packages, { id: "", name: "Unassigned", isActive: true }].map(
        (group) => {
          const grouped = orders.filter(
            (order) => (order.packageId ?? "") === group.id,
          );
          const summary = summarizePackage(grouped, payments, currency);
          return (
            <details key={group.id} className="rounded border p-3">
              <summary className="cursor-pointer font-medium">
                {group.name}
                {group.isActive ? "" : " (archived)"} · {summary.count} Orders
              </summary>
              <dl className="my-3 grid gap-3 text-sm sm:grid-cols-3">
                {Object.entries({
                  "Purchase HT": summary.purchase,
                  "Economic cost": summary.economic,
                  "Order Sell HT": summary.sell,
                  "Allocated Billing HT": summary.allocated,
                  "Supplier paid": summary.paid,
                  "Supplier outstanding": summary.outstanding,
                }).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums">
                      {formatMoney(value, currency)}
                    </dd>
                  </div>
                ))}
              </dl>
              {group.id && canEdit ? (
                <PackageEditor projectId={projectId} item={group} />
              ) : null}
              <ul className="mt-3 space-y-3">
                {grouped.map((order) => (
                  <li key={order.id} className="rounded border p-3">
                    <Link
                      className="text-primary underline"
                      href={`/orders/${order.id}`}
                    >
                      {order.orderNumber}
                    </Link>
                    {canEdit ? (
                      <PackageAssignment
                        projectId={projectId}
                        orderId={order.id}
                        currentPackageId={order.packageId ?? null}
                        packages={packages}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          );
        },
      )}
    </section>
  );
  return (
    <RelatedRecordTable
      table={{
        id: "packages",
        ...(canEdit
          ? {
              editKind: "package" as const,
              removal: {
                kind: "assignment" as const,
                relation: "package-project" as const,
                parentId: projectId,
              },
            }
          : {}),
        title: "Order Packages",
        description:
          "Project Order groupings. Open a Package to list its Orders.",
        columns: ["Package", "Status", "Orders"],
        numericColumns: [2],
        rows: packages.map((group) => ({
          id: group.id,
          href: "/orders?projectId=" + projectId + "&packageId=" + group.id,
          cells: [
            group.name,
            group.isActive ? "Active" : "Archived",
            String(
              orders.filter((order) => order.packageId === group.id).length,
            ),
          ],
        })),
      }}
      actions={
        <EditorDrawer
          title={canEdit ? "Manage Packages" : "View Package breakdown"}
          wide
        >
          {manager}
        </EditorDrawer>
      }
    />
  );
}
