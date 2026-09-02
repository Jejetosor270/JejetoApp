import type { Metadata } from "next";
import Link from "next/link";

import { OrderForm } from "@/components/procurement/order-form";
import {
  OrderTable,
  type OrderViewMode,
} from "@/components/procurement/order-table";
import { PageSizeField, Pagination } from "@/components/listing/pagination";
import { ExportLink } from "@/components/export/export-link";
import {
  firstQueryValue,
  optionalUuid,
  parsePageInput,
  parseSort,
  parseSortDirection,
  queryStringFromParams,
  selectedValue,
} from "@/domain/listing/validation";
import { isDateOnly } from "@/domain/payments/dates";
import {
  ProcurementOrderStatus,
  VatTreatment,
} from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listOrderOptions, listOrdersPage } from "@/lib/procurement/orders";

export const metadata: Metadata = { title: "Procurement orders" };

function statusValue(
  value: string | undefined,
): ProcurementOrderStatus | undefined {
  return Object.values(ProcurementOrderStatus).find(
    (status) => status === value,
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = firstQueryValue(params, "query") ?? "";
  const requestedView = firstQueryValue(params, "view");
  const view: OrderViewMode =
    requestedView === "financial" ||
    requestedView === "supplier-payment" ||
    requestedView === "delivery"
      ? requestedView
      : "general";
  const projectId = optionalUuid(firstQueryValue(params, "projectId"));
  const supplierId = optionalUuid(firstQueryValue(params, "supplierId"));
  const buildingId = optionalUuid(firstQueryValue(params, "buildingId"));
  const status = statusValue(firstQueryValue(params, "status"));
  const vatTreatment = selectedValue(
    Object.values(VatTreatment),
    firstQueryValue(params, "vatTreatment"),
  );
  const pageInput = parsePageInput(params);
  const sort = parseSort(
    ["updated", "reference", "orderDate", "status"] as const,
    firstQueryValue(params, "sort"),
    "updated",
  );
  const direction = parseSortDirection(firstQueryValue(params, "direction"));
  const dateFrom = firstQueryValue(params, "dateFrom");
  const dateTo = firstQueryValue(params, "dateTo");
  const optionsPromise = listOrderOptions();
  const [user, options] = await Promise.all([requireUser(), optionsPromise]);
  const result = await listOrdersPage({
    buildingId,
    currencyCode: firstQueryValue(params, "currencyCode"),
    dateFrom: dateFrom && isDateOnly(dateFrom) ? dateFrom : undefined,
    dateTo: dateTo && isDateOnly(dateTo) ? dateTo : undefined,
    direction,
    projectId,
    query,
    sort,
    status,
    supplierId,
    vatTreatment,
    ...pageInput,
  });
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
            Procurement
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Procurement orders
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Supplier-level packages, cost progression, and commercial markup.
          </p>
        </div>
        <ExportLink
          entity="orders"
          queryString={queryStringFromParams(params)}
        />
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Order view">
        {(
          [
            ["general", "General"],
            ["financial", "Financial"],
            ["supplier-payment", "Supplier Payment"],
            ["delivery", "Delivery / Status"],
          ] as const
        ).map(([value, label]) => (
          <Link
            className={
              view === value
                ? "bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
                : "border-input rounded-md border px-3 py-2 text-sm font-medium"
            }
            href={`/orders?${new URLSearchParams({ view: value }).toString()}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <input
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={query}
          name="query"
          placeholder="Search reference, package, supplier"
        />
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={projectId ?? ""}
          name="projectId"
        >
          <option value="">All projects</option>
          {options.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={buildingId ?? ""}
          name="buildingId"
        >
          <option value="">All Buildings</option>
          {options.projects.flatMap((project) =>
            project.buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {project.name} · {building.shortCode}
              </option>
            )),
          )}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={supplierId ?? ""}
          name="supplierId"
        >
          <option value="">All suppliers</option>
          {options.suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.displayName}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={firstQueryValue(params, "currencyCode") ?? ""}
          name="currencyCode"
        >
          <option value="">All purchase currencies</option>
          {options.currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={vatTreatment ?? ""}
          name="vatTreatment"
        >
          <option value="">All VAT treatments</option>
          {options.vatTreatments.map((treatment) => (
            <option key={treatment} value={treatment}>
              {treatment.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input
          aria-label="Order date from"
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={dateFrom ?? ""}
          name="dateFrom"
          type="date"
        />
        <input
          aria-label="Order date to"
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={dateTo ?? ""}
          name="dateTo"
          type="date"
        />
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={sort}
          name="sort"
        >
          <option value="updated">Updated date</option>
          <option value="reference">Reference</option>
          <option value="orderDate">Order date</option>
          <option value="status">Status</option>
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={direction}
          name="direction"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
        <PageSizeField value={pageInput.pageSize} />
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={status ?? ""}
          name="status"
        >
          <option value="">All statuses</option>
          {options.statuses.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button
          className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
          type="submit"
        >
          Filter
        </button>
      </form>
      {canEditMasterData(user.role) ? (
        <div className="flex flex-wrap items-start gap-2">
          <details className="group">
            <summary className="bg-primary text-primary-foreground inline-flex h-9 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium">
              Create order
            </summary>
            <div className="mt-4">
              <OrderForm options={options} />
            </div>
          </details>
          <Link
            className="border-input bg-background hover:bg-muted inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium"
            href="/orders/import"
          >
            Import supplier quote
          </Link>
        </div>
      ) : null}
      <OrderTable
        canEdit={canEditMasterData(user.role)}
        orders={result.items}
        statuses={options.statuses}
        view={view}
      />
      <Pagination
        page={pageInput.page}
        pageSize={pageInput.pageSize}
        pathname="/orders"
        queryString={queryStringFromParams(params)}
        total={result.total}
      />
    </div>
  );
}
