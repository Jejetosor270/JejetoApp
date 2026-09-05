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
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex justify-between">
        <h2 className="font-semibold">Packages</h2>
        {canEdit ? <PackageEditor projectId={projectId} /> : null}
      </div>
      <p className="text-muted-foreground text-sm">
        Commercial totals use active Orders. Allocated Billing is confirmed
        Invoice HT; paid is actual Supplier settlements; outstanding is
        scheduled Supplier cash. — indicates missing values or FX.
      </p>
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
}
