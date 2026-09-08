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

export type OrderViewMode =
  "general" | "financial" | "supplier-payment" | "delivery";

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
          scope="Deleting the selected Orders will also permanently delete all related Supplier Payment and Client Receipt schedules, settlements, quote-import history, VAT and cost records, Building links, and other Order-owned data. Suppliers, Projects, and Clients are preserved."
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
              {view === "general" ? (
                <>
                  <SortHeader
                    className="px-4 py-3"
                    label="Reference"
                    field="reference"
                    defaultSort="updated"
                    defaultDirection="desc"
                  />
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Supplier</th>
                  <SortHeader
                    className="px-4 py-3"
                    label="Status"
                    field="status"
                    defaultSort="updated"
                    defaultDirection="desc"
                  />
                  <th className="px-4 py-3 text-right">Purchase HT</th>
                  <th className="px-4 py-3">Payment status</th>
                  <th className="px-4 py-3">Expected delivery</th>
                </>
              ) : view === "financial" ? (
                <>
                  <SortHeader
                    className="px-4 py-3"
                    label="Reference"
                    field="reference"
                    defaultSort="updated"
                    defaultDirection="desc"
                  />
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3 text-right">Purchase Cost HT</th>

                  <th className="px-4 py-3 text-right">
                    Economic Landed Cost HT
                  </th>
                  <th className="px-4 py-3 text-right">Total Order Sell HT</th>

                  <th className="px-4 py-3 text-right">Planned Markup</th>
                </>
              ) : view === "supplier-payment" ? (
                <>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Order reference</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3 text-right">Payable</th>
                  <th className="px-4 py-3 text-right">Scheduled</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Next due</th>
                  <th className="px-4 py-3">Payment status</th>
                </>
              ) : (
                <>
                  <SortHeader
                    className="px-4 py-3"
                    label="Reference"
                    field="reference"
                    defaultSort="updated"
                    defaultDirection="desc"
                  />
                  <SortHeader
                    className="px-4 py-3"
                    label="Status"
                    field="status"
                    defaultSort="updated"
                    defaultDirection="desc"
                  />
                  <th className="px-4 py-3">Expected ready</th>
                  <th className="px-4 py-3">Expected delivery</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Carrier</th>
                  <th className="px-4 py-3">Tracking reference</th>
                </>
              )}
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
