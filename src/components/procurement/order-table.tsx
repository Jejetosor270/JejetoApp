"use client";

import { deleteSelectedOrdersAction } from "@/app/(app)/orders/actions";
import {
  BulkActionBar,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import { ListEmptyState } from "@/components/listing/empty-state";
import { SortHeader } from "@/components/listing/sort-header";
import {
  tableContainerClassName,
  tableHeaderClassName,
} from "@/components/listing/table-styles";
import type { OrderSummary } from "@/lib/procurement/orders";
import { OrderRow } from "./order-table-row";

import {
  orderViewColumns,
  orderSortLabels,
  orderNumericColumns,
  type OrderViewMode,
} from "@/config/order-list";
export type { OrderViewMode } from "@/config/order-list";

export function OrderTable({
  canEdit,
  orders,
  statuses,
  view,
}: {
  canEdit: boolean;
  orders: OrderSummary[];
  statuses: readonly string[];
  view: OrderViewMode;
}) {
  const selection = useBulkSelection(orders.map((order) => order.id));
  return (
    <section className={tableContainerClassName}>
      {canEdit ? (
        <BulkActionBar
          action={deleteSelectedOrdersAction}
          clearSelection={selection.clear}
          entityName="Order"
          scope="The selected records and their dependent business records will move to Trash. Their financial effects will be removed until the group is restored from Settings."
          selectedIds={selection.selectedIds}
        />
      ) : null}
      <div
        className="max-h-[70svh] overflow-auto"
        role="region"
        aria-label="Orders table"
        tabIndex={0}
      >
        <table
          className={`w-full text-left text-sm ${view === "general" ? "min-w-[48rem]" : "min-w-[60rem]"}`}
        >
          <thead className={tableHeaderClassName}>
            <tr>
              {canEdit ? (
                <SelectionHeader
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected}
                  disabled={orders.length === 0}
                  onChange={selection.toggleAll}
                />
              ) : null}
              {orderViewColumns[view].map((field) => (
                <SortHeader
                  key={field}
                  className={`px-4 py-3 ${orderNumericColumns.includes(field) ? "text-right" : ""}`}
                  label={orderSortLabels[field]}
                  field={field}
                  defaultSort="updated"
                  defaultDirection="desc"
                />
              ))}
              {canEdit ? <th className="px-4 py-3 text-right">Edit</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((order) => (
              <OrderRow
                canEdit={canEdit}
                isSelected={selection.isSelected(order.id)}
                key={order.id}
                onSelect={() => selection.toggle(order.id)}
                order={order}
                statuses={statuses}
                view={view}
              />
            ))}
          </tbody>
        </table>
      </div>
      {orders.length === 0 ? <ListEmptyState entity="Orders" /> : null}
    </section>
  );
}
