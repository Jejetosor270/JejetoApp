import type { Metadata } from "next";

import { ProjectManagement } from "@/app/(app)/projects/project-management";
import { ExportLink } from "@/components/export/export-link";
import { PageSizeField, Pagination } from "@/components/listing/pagination";
import { countries } from "@/config/countries";
import {
  firstQueryValue,
  optionalUuid,
  parsePageInput,
  parseSort,
  parseSortDirection,
  queryStringFromParams,
} from "@/domain/listing/validation";
import { ProjectStatus } from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listProjectFormOptions } from "@/lib/master-data/lookups";
import { listProjects } from "@/lib/master-data/projects";

export const metadata: Metadata = { title: "Projects" };

function enumValue(value: string | undefined): ProjectStatus | undefined {
  return Object.values(ProjectStatus).find((status) => status === value);
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = firstQueryValue(params, "query") ?? "";
  const clientId = optionalUuid(firstQueryValue(params, "clientId"));
  const managerId = optionalUuid(firstQueryValue(params, "managerId"));
  const status = enumValue(firstQueryValue(params, "status"));
  const pageInput = parsePageInput(params);
  const sort = parseSort(
    ["name", "code", "status", "created", "updated"] as const,
    firstQueryValue(params, "sort"),
    "name",
  );
  const direction = parseSortDirection(firstQueryValue(params, "direction"));
  const [user, options, result] = await Promise.all([
    requireUser(),
    listProjectFormOptions(),
    listProjects({
      clientId,
      countryCode: firstQueryValue(params, "countryCode"),
      currencyCode: firstQueryValue(params, "currencyCode"),
      direction,
      managerId,
      query,
      sort,
      status,
      ...pageInput,
    }),
  ]);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
            Workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Projects
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Client projects and their buildings.
          </p>
        </div>
        <ExportLink
          entity="projects"
          queryString={queryStringFromParams(params)}
        />
      </header>
      <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <input
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={query}
          name="query"
          placeholder="Search project, code, or client"
        />
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={clientId ?? ""}
          name="clientId"
        >
          <option value="">All clients</option>
          {options.clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.displayName}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
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
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={firstQueryValue(params, "currencyCode") ?? ""}
          name="currencyCode"
        >
          <option value="">All reporting currencies</option>
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
          <option value="name">Name</option>
          <option value="code">Code</option>
          <option value="status">Status</option>
          <option value="updated">Updated date</option>
          <option value="created">Created date</option>
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={direction}
          name="direction"
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
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
              {item.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={managerId ?? ""}
          name="managerId"
        >
          <option value="">All managers</option>
          {options.managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
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
      <ProjectManagement
        canEdit={canEditMasterData(user.role)}
        clients={options.clients}
        currencies={options.currencies}
        managers={options.managers}
        projects={result.items.map((project) => ({
          ...project,
          expectedCompletionDate:
            project.expectedCompletionDate?.toISOString().slice(0, 10) ?? null,
          freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
          startDate: project.startDate?.toISOString().slice(0, 10) ?? null,
        }))}
        statuses={options.statuses}
      />
      <Pagination
        page={pageInput.page}
        pageSize={pageInput.pageSize}
        pathname="/projects"
        queryString={queryStringFromParams(params)}
        total={result.total}
      />
    </div>
  );
}
