"use client";

import Link from "next/link";

import { deleteSelectedOrdersAction } from "@/app/(app)/orders/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import type { OrderSummary } from "@/lib/procurement/orders";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function OrderTable({
  canEdit,
  orders,
}: {
  canEdit: boolean;
  orders: OrderSummary[];
}) {
  const selection = useBulkSelection(orders.map((order) => order.id));
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      {canEdit ? (
        <BulkActionBar
          action={deleteSelectedOrdersAction}
          clearSelection={selection.clear}
          entityName="Order"
          scope="Deleting the selected Orders will also permanently delete all related Supplier Payment and Client Receipt schedules, settlements, quote-import history, VAT and cost records, Building links, and other Order-owned data. Suppliers, Projects, and Clients are preserved."
          selectedIds={selection.selectedIds}
        />
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[68rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
            <tr>
              {canEdit ? (
                <SelectionHeader
                  checked={selection.allSelected}
                  disabled={orders.length === 0}
                  onChange={selection.toggleAll}
                />
              ) : null}
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Buildings</th>
              <th className="px-4 py-3 text-right">Economic landed cost</th>
              <th className="px-4 py-3 text-right">Selling revenue</th>
              <th className="px-4 py-3 text-right">Margin</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((order) => {
              const cost = order.costs;
              return (
                <tr className="hover:bg-muted/25" key={order.id}>
                  {canEdit ? (
                    <SelectionCell
                      checked={selection.isSelected(order.id)}
                      label={`Order ${order.orderNumber}`}
                      onChange={() => selection.toggle(order.id)}
                    />
                  ) : null}
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
                      cost.reportingEconomicLandedCost,
                      order.project.reportingCurrencyCode,
                    )}
                  </td>
                  <td className="financial-figure px-4 py-3 text-right">
                    {formatMoney(
                      cost.reportingSellingRevenue,
                      order.project.reportingCurrencyCode,
                    )}
                    {cost.outputVat ? (
                      <span className="text-muted-foreground block text-xs">
                        {cost.outputVat.treatment.replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="financial-figure px-4 py-3 text-right font-medium">
                    {formatRate(cost.grossMarginRate)}
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
