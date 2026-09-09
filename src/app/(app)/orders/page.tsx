import { orderSortFields, orderSortLabels } from "@/config/order-list";
import { DateInput } from "@/components/forms/date-input";
import { CreateOrderActions } from "@/components/procurement/create-order-actions";
import { ViewSelector } from "@/components/listing/view-selector";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/listing/filter-bar";
import type { Metadata } from "next";

import { OrderForm } from "@/components/procurement/order-form";
import {
  OrderTable,
  type OrderViewMode,
} from "@/components/procurement/order-table";
import { PageSizeField, Pagination } from "@/components/listing/pagination";
import {
  FilterField,
  filterControlClassName,
} from "@/components/listing/filter-field";
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
import { formatEnumLabel } from "@/domain/presentation/labels";
import {
  ProcurementOrderStatus,
  VatTreatment,
} from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listOrderOptions, listOrdersPage } from "@/lib/procurement/orders";

export const metadata: Metadata = { title: "Purchasing" };

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
  const packageId = optionalUuid(firstQueryValue(params, "packageId"));
  const supplierId = optionalUuid(firstQueryValue(params, "supplierId"));
  const buildingId = optionalUuid(firstQueryValue(params, "buildingId"));
  const status = statusValue(firstQueryValue(params, "status"));
  const vatTreatment = selectedValue(
    Object.values(VatTreatment),
    firstQueryValue(params, "vatTreatment"),
  );
  const pageInput = parsePageInput(params);
  const sort = parseSort(
    orderSortFields,
    firstQueryValue(params, "sort"),
    "updated",
  );
  const direction = parseSortDirection(firstQueryValue(params, "direction"));
  const dateFrom = firstQueryValue(params, "dateFrom");
  const dateTo = firstQueryValue(params, "dateTo");
  const optionsPromise = listOrderOptions();
  const [user, options] = await Promise.all([requireUser(), optionsPromise]);
  const result = await listOrdersPage({
    packageId,
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
      <PageHeader
        title="Purchasing"
        description={<>Supplier Orders, payment status and delivery dates.</>}
        actions={
          <>
            <ExportLink
              entity="orders"
              queryString={queryStringFromParams(params)}
            />
            {canEditMasterData(user.role) ? (
              <CreateOrderActions>
                <OrderForm options={options} />
              </CreateOrderActions>
            ) : null}
          </>
        }
      />
      <ViewSelector
        pathname="/orders"
        queryString={queryStringFromParams(params)}
        field="view"
        defaultValue="general"
        options={[
          { label: "Standard", value: "general" },
          { label: "Cost & pricing detail", value: "financial" },
          { label: "Supplier payment detail", value: "supplier-payment" },
          { label: "Delivery & tracking detail", value: "delivery" },
        ]}
      />
      <FilterBar>
        <FilterField label="Search">
          <input
            className={filterControlClassName}
            defaultValue={query}
            name="query"
            placeholder="Search reference, package, supplier"
          />
        </FilterField>
        <FilterField label="Project">
          <select
            className={filterControlClassName}
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
        </FilterField>
        <FilterField label="Building">
          <select
            className={filterControlClassName}
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
        </FilterField>
        <FilterField label="Package">
          <select
            className={filterControlClassName}
            name="packageId"
            defaultValue={packageId ?? ""}
          >
            <option value="">All Packages</option>
            {options.projects
              .filter((project) => !projectId || project.id === projectId)
              .flatMap((project) =>
                project.orderPackages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {project.name} · {item.name}
                    {item.isActive ? "" : " (archived)"}
                  </option>
                )),
              )}
          </select>
        </FilterField>
        <FilterField label="Supplier">
          <select
            className={filterControlClassName}
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
        </FilterField>
        <FilterField label="Purchase currency">
          <select
            className={filterControlClassName}
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
        </FilterField>
        <FilterField label="VAT treatment">
          <select
            className={filterControlClassName}
            defaultValue={vatTreatment ?? ""}
            name="vatTreatment"
          >
            <option value="">All VAT treatments</option>
            {options.vatTreatments.map((treatment) => (
              <option key={treatment} value={treatment}>
                {formatEnumLabel(treatment)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Order date from">
          <DateInput
            className={filterControlClassName}
            defaultValue={dateFrom ?? ""}
            name="dateFrom"
          />
        </FilterField>
        <FilterField label="Order date to">
          <DateInput
            className={filterControlClassName}
            defaultValue={dateTo ?? ""}
            name="dateTo"
          />
        </FilterField>
        <FilterField label="Sort by">
          <select
            className={filterControlClassName}
            defaultValue={sort}
            name="sort"
          >
            {orderSortFields.map((field) => (
              <option key={field} value={field}>
                {orderSortLabels[field]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Sort direction">
          <select
            className={filterControlClassName}
            defaultValue={direction}
            name="direction"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </FilterField>
        <PageSizeField value={pageInput.pageSize} />
        <FilterField label="Delivery status">
          <select
            className={filterControlClassName}
            defaultValue={status ?? ""}
            name="status"
          >
            <option value="">All statuses</option>
            {options.statuses.map((item) => (
              <option key={item} value={item}>
                {formatEnumLabel(item)}
              </option>
            ))}
          </select>
        </FilterField>
        <button
          className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
          type="submit"
        >
          Filter
        </button>
      </FilterBar>

      <OrderTable
        options={options}
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
        selectionIsPageScoped={canEditMasterData(user.role)}
        total={result.total}
      />
    </div>
  );
}
