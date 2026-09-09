import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/listing/filter-bar";
import type { Metadata } from "next";

import { BillingTable } from "@/components/billing/billing-table";
import { CreateBillingActions } from "@/components/billing/create-billing-actions";
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
import { ClientBillingDocumentType } from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import {
  listClientBillingOptions,
  listClientBillingPage,
} from "@/lib/billing/billing";

export const metadata: Metadata = { title: "Billing" };
export const maxDuration = 120;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pageInput = parsePageInput(params);
  const clientId = optionalUuid(firstQueryValue(params, "clientId"));
  const projectId = optionalUuid(firstQueryValue(params, "projectId"));
  const documentType = selectedValue(
    Object.values(ClientBillingDocumentType),
    firstQueryValue(params, "documentType"),
  );
  const sort = parseSort(
    ["date", "dueDate", "reference", "updated"] as const,
    firstQueryValue(params, "sort"),
    "updated",
  );
  const direction = parseSortDirection(firstQueryValue(params, "direction"));
  const [user, options, result] = await Promise.all([
    requireUser(),
    listClientBillingOptions(),
    listClientBillingPage({
      clientId,
      currencyCode: firstQueryValue(params, "currencyCode"),
      direction,
      documentType,
      projectId,
      query: firstQueryValue(params, "query") ?? "",
      sort,
      ...pageInput,
    }),
  ]);
  const canEdit = canEditMasterData(user.role);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description={
          <>
            Quotes, Invoices, planned payments, actual receipts, and
            Project-level Order allocation.
          </>
        }
        actions={
          <>
            <div className="flex gap-2">
              <ExportLink
                entity="billing"
                queryString={queryStringFromParams(params)}
              />
              {canEdit ? <CreateBillingActions options={options} /> : null}
            </div>
          </>
        }
      />
      <FilterBar>
        <FilterField label="Search">
          <input
            className={filterControlClassName}
            defaultValue={firstQueryValue(params, "query") ?? ""}
            name="query"
            placeholder="Search reference, Client, Project"
          />
        </FilterField>
        <FilterField label="Client">
          <select
            className={filterControlClassName}
            defaultValue={clientId ?? ""}
            name="clientId"
          >
            <option value="">All Clients</option>
            {options.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.displayName}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Project">
          <select
            className={filterControlClassName}
            defaultValue={projectId ?? ""}
            name="projectId"
          >
            <option value="">All Projects</option>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Document type">
          <select
            className={filterControlClassName}
            defaultValue={documentType ?? ""}
            name="documentType"
          >
            <option value="">Quotes and Invoices</option>
            <option value="QUOTE">Quote / Devis</option>
            <option value="INVOICE">Invoice</option>
          </select>
        </FilterField>
        <FilterField label="Currency">
          <select
            className={filterControlClassName}
            defaultValue={firstQueryValue(params, "currencyCode") ?? ""}
            name="currencyCode"
          >
            <option value="">All currencies</option>
            {options.currencies.map((currency) => (
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
            <option value="updated">Updated</option>
            <option value="date">Document date</option>
            <option value="dueDate">Due date</option>
            <option value="reference">Reference</option>
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
        <button
          className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
          type="submit"
        >
          Filter
        </button>
      </FilterBar>
      <BillingTable canEdit={canEdit} documents={result.items} />
      <Pagination
        page={pageInput.page}
        pageSize={pageInput.pageSize}
        pathname="/billing"
        queryString={queryStringFromParams(params)}
        total={result.total}
      />
    </div>
  );
}
