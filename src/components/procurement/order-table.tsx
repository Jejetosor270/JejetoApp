import Link from "next/link";

import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import type { OrderSummary } from "@/lib/procurement/orders";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function OrderTable({ orders }: { orders: OrderSummary[] }) {
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[68rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Buildings</th>
              <th className="px-4 py-3 text-right">Committed landed</th>
              <th className="px-4 py-3 text-right">Selling revenue</th>
              <th className="px-4 py-3 text-right">Margin</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((order) => {
              const committed = order.financialStates.find(
                (state) => state.state === "COMMITTED",
              );
              return (
                <tr className="hover:bg-muted/25" key={order.id}>
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      className="hover:text-primary underline-offset-4 hover:underline"
                      href={`/orders/${order.id}`}
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {order.packageName}
                    <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                      Buy {order.orderCurrencyCode} · sell{" "}
                      {order.sellingCurrencyCode}
                    </span>
                  </td>
                  <td className="px-4 py-3">{order.project.name}</td>
                  <td className="px-4 py-3">{order.supplier.displayName}</td>
                  <td className="px-4 py-3">
                    {order.status.replaceAll("_", " ")}
                  </td>
                  <td className="text-muted-foreground max-w-48 truncate px-4 py-3">
                    {order.buildings.join(", ") || "—"}
                  </td>
                  <td className="financial-figure px-4 py-3 text-right">
                    {formatMoney(
                      committed?.reportingEconomicLandedCost ?? null,
                      order.project.reportingCurrencyCode,
                    )}
                  </td>
                  <td className="financial-figure px-4 py-3 text-right">
                    {formatMoney(
                      committed?.reportingSellingRevenue ?? null,
                      order.project.reportingCurrencyCode,
                    )}
                    {committed?.outputVat ? (
                      <span className="text-muted-foreground block text-xs">
                        {committed.outputVat.treatment.replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="financial-figure px-4 py-3 text-right font-medium">
                    {formatRate(committed?.grossMarginRate ?? null)}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {dateLabel(order.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {orders.length === 0 ? (
        <p className="text-muted-foreground px-4 py-10 text-sm">
          No procurement orders yet.
        </p>
      ) : null}
    </section>
  );
}
