import type { Metadata } from "next";
import Link from "next/link";

import { ExportLink } from "@/components/export/export-link";
import { ItemTable } from "@/components/items/item-table";
import { PageSizeField, Pagination } from "@/components/listing/pagination";
import {
  firstQueryValue,
  optionalUuid,
  parsePageInput,
  parseSort,
  parseSortDirection,
  queryStringFromParams,
  selectedValue,
} from "@/domain/listing/validation";
import {
  ItemCommercialStatus,
  ItemLogisticsStatus,
  ItemSourceType,
} from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listItemOptions, listItemsPage } from "@/lib/items/items";

export const metadata: Metadata = { title: "Items" };
const control = "border-input bg-background h-9 rounded-lg border px-3 text-sm";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pageInput = parsePageInput(params);
  const filters = {
    buildingId: optionalUuid(firstQueryValue(params, "buildingId")),
    category: firstQueryValue(params, "category"),
    commercialStatus: selectedValue(
      Object.values(ItemCommercialStatus),
      firstQueryValue(params, "commercialStatus"),
    ),
    currencyCode: firstQueryValue(params, "currencyCode"),
    direction: parseSortDirection(firstQueryValue(params, "direction")),
    logisticsStatus: selectedValue(
      Object.values(ItemLogisticsStatus),
      firstQueryValue(params, "logisticsStatus"),
    ),
    orderId: optionalUuid(firstQueryValue(params, "orderId")),
    projectId: optionalUuid(firstQueryValue(params, "projectId")),
    query: firstQueryValue(params, "query") ?? "",
    roomId: optionalUuid(firstQueryValue(params, "roomId")),
    sort: parseSort(
      [
        "updated",
        "reference",
        "description",
        "status",
        "estimatedDelivery",
      ] as const,
      firstQueryValue(params, "sort"),
      "updated",
    ),
    sourceType: selectedValue(
      Object.values(ItemSourceType),
      firstQueryValue(params, "sourceType"),
    ),
    supplierId: optionalUuid(firstQueryValue(params, "supplierId")),
    ...pageInput,
  };
  const [user, options, result] = await Promise.all([
    requireUser(),
    listItemOptions(),
    listItemsPage(filters),
  ]);
  const canEdit = canEditMasterData(user.role);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
            Operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Items</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Project-specific procurement, pricing, and logistics lines.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportLink
            entity="items"
            queryString={queryStringFromParams(params)}
          />
          {canEdit ? (
            <>
              <Link
                className="border-input bg-background inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium"
                href="/items/import"
              >
                Import Project budget
              </Link>
              <Link
                className="bg-primary text-primary-foreground inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium"
                href="/items/new"
              >
                Create Item
              </Link>
            </>
          ) : null}
        </div>
      </header>
      <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <input
          className={control}
          defaultValue={filters.query}
          name="query"
          placeholder="Search reference, description, SKU…"
        />
        <select
          className={control}
          defaultValue={filters.projectId ?? ""}
          name="projectId"
        >
          <option value="">All Projects</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className={control}
          defaultValue={filters.buildingId ?? ""}
          name="buildingId"
        >
          <option value="">All Buildings</option>
          {options.projects.flatMap((p) =>
            p.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {p.name} · {b.name}
              </option>
            )),
          )}
        </select>
        <select
          className={control}
          defaultValue={filters.roomId ?? ""}
          name="roomId"
        >
          <option value="">All Rooms</option>
          {options.projects.flatMap((p) =>
            p.buildings.flatMap((b) =>
              b.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {b.name} · {r.name}
                </option>
              )),
            ),
          )}
        </select>
        <select
          className={control}
          defaultValue={filters.supplierId ?? ""}
          name="supplierId"
        >
          <option value="">All Suppliers</option>
          {options.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
        <select
          className={control}
          defaultValue={filters.orderId ?? ""}
          name="orderId"
        >
          <option value="">All Orders</option>
          {options.projects.flatMap((p) =>
            p.orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNumber}
              </option>
            )),
          )}
        </select>
        <select
          className={control}
          defaultValue={filters.commercialStatus ?? ""}
          name="commercialStatus"
        >
          <option value="">All commercial statuses</option>
          {Object.values(ItemCommercialStatus).map((x) => (
            <option key={x} value={x}>
              {x.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          className={control}
          defaultValue={filters.logisticsStatus ?? ""}
          name="logisticsStatus"
        >
          <option value="">All logistics statuses</option>
          {Object.values(ItemLogisticsStatus).map((x) => (
            <option key={x} value={x}>
              {x.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input
          className={control}
          defaultValue={filters.category ?? ""}
          name="category"
          placeholder="Category"
        />
        <select
          className={control}
          defaultValue={filters.currencyCode ?? ""}
          name="currencyCode"
        >
          <option value="">All currencies</option>
          {options.currencies.map((x) => (
            <option key={x.code} value={x.code}>
              {x.code}
            </option>
          ))}
        </select>
        <select
          className={control}
          defaultValue={filters.sourceType ?? ""}
          name="sourceType"
        >
          <option value="">All sources</option>
          {Object.values(ItemSourceType).map((x) => (
            <option key={x} value={x}>
              {x.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select className={control} defaultValue={filters.sort} name="sort">
          <option value="updated">Updated</option>
          <option value="reference">Reference</option>
          <option value="description">Description</option>
          <option value="status">Status</option>
          <option value="estimatedDelivery">Estimated delivery</option>
        </select>
        <select
          className={control}
          defaultValue={filters.direction}
          name="direction"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
        <PageSizeField value={pageInput.pageSize} />
        <button
          className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
          type="submit"
        >
          Filter
        </button>
      </form>
      <ItemTable canEdit={canEdit} items={result.items} options={options} />
      <Pagination
        page={pageInput.page}
        pageSize={pageInput.pageSize}
        pathname="/items"
        queryString={queryStringFromParams(params)}
        total={result.total}
      />
    </div>
  );
}
