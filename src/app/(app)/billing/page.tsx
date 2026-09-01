import type { Metadata } from "next";
import Link from "next/link";

import { BillingTable } from "@/components/billing/billing-table";
import { ClientDocumentIntake } from "@/components/billing/client-document-intake";
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
import { ClientBillingDocumentType } from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import {
  listClientBillingOptions,
  listClientBillingPage,
} from "@/lib/billing/billing";

export const metadata: Metadata = { title: "Client Billing" };
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-medium tracking-wide uppercase">
            Client commercial control
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Client Billing</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Quotes, Invoices, planned payments, actual receipts, and
            Project-level Order allocation.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportLink
            entity="billing"
            queryString={queryStringFromParams(params)}
          />
          <Link
            className="border-input rounded-md border px-3 py-2 text-sm font-medium"
            href="/payments?direction=SUPPLIER_PAYMENT"
          >
            Supplier Payments
          </Link>
        </div>
      </header>
      {canEdit ? (
        <details>
          <summary className="bg-primary text-primary-foreground inline-flex h-9 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium">
            Import Client PDF
          </summary>
          <div className="mt-4">
            <ClientDocumentIntake options={options} />
          </div>
        </details>
      ) : null}
      <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        <input
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={firstQueryValue(params, "query") ?? ""}
          name="query"
          placeholder="Search reference, Client, Project"
        />
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
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
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
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
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={documentType ?? ""}
          name="documentType"
        >
          <option value="">Quotes and Invoices</option>
          <option value="QUOTE">Quote / Devis</option>
          <option value="INVOICE">Invoice</option>
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
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
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={sort}
          name="sort"
        >
          <option value="updated">Updated</option>
          <option value="date">Document date</option>
          <option value="dueDate">Due date</option>
          <option value="reference">Reference</option>
        </select>
        <div className="flex gap-2">
          <select
            className="border-input bg-background h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm"
            defaultValue={direction}
            name="direction"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <button className="border-input h-9 rounded-lg border px-3 text-sm font-medium">
            Filter
          </button>
        </div>
        <PageSizeField value={pageInput.pageSize} />
      </form>
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
