import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/listing/filter-bar";
import type { Metadata } from "next";

import {
  SupplierManagement,
  CreateSupplierForm,
} from "@/app/(app)/suppliers/supplier-management";
import { ExportLink } from "@/components/export/export-link";
import { PageSizeField, Pagination } from "@/components/listing/pagination";
import {
  FilterField,
  filterControlClassName,
} from "@/components/listing/filter-field";
import { countries } from "@/config/countries";
import {
  firstQueryValue,
  parsePageInput,
  parseSort,
  parseSortDirection,
  queryStringFromParams,
} from "@/domain/listing/validation";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listActiveCurrencies } from "@/lib/master-data/lookups";
import { listSuppliers } from "@/lib/master-data/suppliers";

export const metadata: Metadata = { title: "Suppliers" };

function activeFilter(
  value: string | undefined,
): "active" | "inactive" | "all" {
  return value === "inactive" || value === "all" ? value : "active";
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = firstQueryValue(params, "query") ?? "";
  const active = activeFilter(firstQueryValue(params, "active"));
  const pageInput = parsePageInput(params);
  const sort = parseSort(
    ["name", "created", "updated"] as const,
    firstQueryValue(params, "sort"),
    "name",
  );
  const direction = parseSortDirection(firstQueryValue(params, "direction"));
  const [user, result, currencies] = await Promise.all([
    requireUser(),
    listSuppliers({
      active,
      countryCode: firstQueryValue(params, "countryCode"),
      currencyCode: firstQueryValue(params, "currencyCode"),
      direction,
      query,
      sort,
      ...pageInput,
    }),
    listActiveCurrencies(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description={<>Supplier master data and future-order defaults.</>}
        actions={
          <>
            {canEditMasterData(user.role) && (
              <CreateSupplierForm currencies={currencies} />
            )}
            {
              <>
                <ExportLink
                  entity="suppliers"
                  queryString={queryStringFromParams(params)}
                />
              </>
            }
          </>
        }
      />
      <FilterBar>
        <FilterField label="Search">
          <input
            className={filterControlClassName}
            defaultValue={query}
            name="query"
            placeholder="Search name, contact, or VAT"
          />
        </FilterField>
        <FilterField label="Activity">
          <select
            className={filterControlClassName}
            defaultValue={active}
            name="active"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All suppliers</option>
          </select>
        </FilterField>
        <FilterField label="Country">
          <select
            className={filterControlClassName}
            defaultValue={firstQueryValue(params, "countryCode") ?? ""}
            name="countryCode"
          >
            <option value="">All countries</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Default currency">
          <select
            className={filterControlClassName}
            defaultValue={firstQueryValue(params, "currencyCode") ?? ""}
            name="currencyCode"
          >
            <option value="">All currencies</option>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Sort by">
          <select
            className={filterControlClassName}
            defaultValue={sort}
            name="sort"
          >
            <option value="name">Name</option>
            <option value="updated">Updated date</option>
            <option value="created">Created date</option>
          </select>
        </FilterField>
        <FilterField label="Sort direction">
          <select
            className={filterControlClassName}
            defaultValue={direction}
            name="direction"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </FilterField>
        <PageSizeField value={pageInput.pageSize} />
        <button
          className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
          type="submit"
        >
          Filter
        </button>
      </FilterBar>
      <SupplierManagement
        canEdit={canEditMasterData(user.role)}
        currencies={currencies}
        suppliers={result.items}
      />
      <Pagination
        page={pageInput.page}
        pageSize={pageInput.pageSize}
        pathname="/suppliers"
        queryString={queryStringFromParams(params)}
        selectionIsPageScoped={canEditMasterData(user.role)}
        total={result.total}
      />
    </div>
  );
}
