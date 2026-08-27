"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  bulkUpdateItemsAction,
  deleteSelectedItemsAction,
} from "@/app/(app)/items/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import {
  formatMoney,
  formatQuantity,
  formatRate,
} from "@/domain/procurement/presentation";
import type { ManagedItem } from "@/lib/items/items";

type Options = Awaited<
  ReturnType<typeof import("@/lib/items/items").listItemOptions>
>;

export function ItemTable({
  canEdit,
  items,
  options,
}: {
  canEdit: boolean;
  items: ManagedItem[];
  options: Options;
}) {
  const selection = useBulkSelection(items.map((item) => item.id));
  const [field, setField] = useState("commercialStatus");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const values =
    field === "projectId"
      ? options.projects.map((x) => [x.id, x.name])
      : field === "buildingId"
        ? options.projects.flatMap((p) =>
            p.buildings.map((x) => [x.id, `${p.name} · ${x.name}`]),
          )
        : field === "roomId"
          ? options.projects.flatMap((p) =>
              p.buildings.flatMap((b) =>
                b.rooms.map((x) => [x.id, `${p.name} · ${b.name} · ${x.name}`]),
              ),
            )
          : field === "supplierId"
            ? options.suppliers.map((x) => [x.id, x.displayName])
            : field === "commercialStatus"
              ? ["BUDGET", "QUOTED", "SELECTED", "ORDERED", "CANCELLED"].map(
                  (x) => [x, x.replaceAll("_", " ")],
                )
              : field === "logisticsStatus"
                ? [
                    "PENDING",
                    "IN_PRODUCTION",
                    "IN_TRANSIT",
                    "RECEIVED_FABRICATOR",
                    "RECEIVED_WAREHOUSE",
                    "DELIVERED_RESIDENCE",
                    "INSTALLED",
                    "CLAIM",
                  ].map((x) => [x, x.replaceAll("_", " ")])
                : [];
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      {canEdit ? (
        <>
          <BulkActionBar
            action={deleteSelectedItemsAction}
            clearSelection={selection.clear}
            entityName="Item"
            scope="Only the selected Item records will be permanently deleted. Projects, Buildings, Rooms, Suppliers, Orders, and Locations are preserved."
            selectedIds={selection.selectedIds}
          />
          {selection.selectedIds.length ? (
            <div className="bg-muted/20 flex flex-wrap items-center gap-2 border-b px-4 py-2">
              <select
                className="border-input bg-background h-8 rounded border px-2 text-xs"
                value={field}
                onChange={(event) => setField(event.target.value)}
              >
                <option value="projectId">Project</option>
                <option value="buildingId">Building</option>
                <option value="roomId">Room</option>
                <option value="supplierId">Supplier</option>
                <option value="category">Category</option>
                <option value="commercialStatus">Commercial status</option>
                <option value="logisticsStatus">Logistics status</option>
                <option value="vatRate">VAT %</option>
              </select>
              {values.length ? (
                <select
                  className="border-input bg-background h-8 min-w-48 rounded border px-2 text-xs"
                  id="bulk-item-value"
                >
                  <option value="">Choose value</option>
                  {values.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="border-input bg-background h-8 rounded border px-2 text-xs"
                  id="bulk-item-value"
                  placeholder={field === "vatRate" ? "20" : "Value"}
                />
              )}
              <button
                className="bg-primary text-primary-foreground h-8 rounded px-3 text-xs font-medium disabled:opacity-50"
                disabled={pending}
                type="button"
                onClick={() => {
                  const element = document.getElementById("bulk-item-value") as
                    HTMLInputElement | HTMLSelectElement | null;
                  if (!element?.value) return;
                  const data = new FormData();
                  selection.selectedIds.forEach((id) =>
                    data.append("selectedIds", id),
                  );
                  data.set("field", field);
                  data.set("value", element.value);
                  startTransition(async () => {
                    const result = await bulkUpdateItemsAction(data);
                    setFeedback(result.message);
                    if (result.status === "success") selection.clear();
                  });
                }}
              >
                {pending ? "Updating…" : "Apply"}
              </button>
              {feedback ? (
                <span className="text-muted-foreground text-xs">
                  {feedback}
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[90rem] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground border-b">
            <tr>
              {canEdit ? (
                <SelectionHeader
                  checked={selection.allSelected}
                  disabled={!items.length}
                  onChange={selection.toggleAll}
                />
              ) : null}
              <th className="px-3 py-2">Reference / description</th>
              <th className="px-3 py-2">Project / location</th>
              <th className="px-3 py-2">Supplier / SKU</th>
              <th className="px-3 py-2">Commercial</th>
              <th className="px-3 py-2">Logistics</th>
              <th className="px-3 py-2 text-right">Quantity</th>
              <th className="px-3 py-2 text-right">Unit purchase HT</th>
              <th className="px-3 py-2 text-right">Purchase total HT</th>
              <th className="px-3 py-2 text-right">Selling total HT</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2">Est. delivery</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr className="hover:bg-muted/25" key={item.id}>
                {canEdit ? (
                  <SelectionCell
                    checked={selection.isSelected(item.id)}
                    label={item.itemReference ?? item.name}
                    onChange={() => selection.toggle(item.id)}
                  />
                ) : null}
                <td className="max-w-64 px-3 py-2">
                  <Link
                    className="font-medium hover:underline"
                    href={`/items/${item.id}`}
                  >
                    {item.itemReference || "—"}
                  </Link>
                  <span className="text-muted-foreground block truncate">
                    {item.name}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {item.project.name}
                  <span className="text-muted-foreground block">
                    {[item.building?.shortCode, item.room?.name]
                      .filter(Boolean)
                      .join(" · ") || "Unallocated"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {item.supplier?.displayName ?? "—"}
                  <span className="text-muted-foreground block">
                    {item.supplierSku ?? ""}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {item.commercialStatus.replaceAll("_", " ")}
                </td>
                <td className="px-3 py-2">
                  {item.logisticsStatus.replaceAll("_", " ")}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {formatQuantity(item.quantity)} {item.unitOfMeasure}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {item.purchaseCurrencyCode
                    ? formatMoney(
                        item.unitPurchasePriceHt,
                        item.purchaseCurrencyCode,
                      )
                    : "—"}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {item.purchaseCurrencyCode
                    ? formatMoney(
                        item.totalPurchasePriceHt,
                        item.purchaseCurrencyCode,
                      )
                    : "—"}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {item.purchaseCurrencyCode
                    ? formatMoney(
                        item.totalSellingPriceHt,
                        item.purchaseCurrencyCode,
                      )
                    : "—"}
                </td>
                <td className="financial-figure px-3 py-2 text-right">
                  {formatRate(item.financial.grossMarginRate)}
                </td>
                <td className="px-3 py-2">
                  {item.estimatedWarehouseDate ??
                    item.estimatedResidenceDate ??
                    "—"}
                </td>
                <td className="px-3 py-2">
                  {item.updatedAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length ? (
        <p className="text-muted-foreground px-4 py-10 text-sm">
          No Items match these filters.
        </p>
      ) : null}
    </section>
  );
}
