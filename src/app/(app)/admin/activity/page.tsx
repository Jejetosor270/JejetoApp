import type { Metadata } from "next";

import { Pagination, PageSizeField } from "@/components/listing/pagination";
import {
  FilterField,
  filterControlClassName,
} from "@/components/listing/filter-field";
import { auditActions, auditEntityTypes } from "@/domain/audit/constants";
import {
  firstQueryValue,
  parsePageInput,
  selectedValue,
} from "@/domain/listing/validation";
import { formatTimestamp, isDateOnly } from "@/domain/payments/dates";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { listAuditActors, listAuditEvents } from "@/lib/audit/events";

export const metadata: Metadata = { title: "Activity" };

function auditDate(value: string | undefined, end = false): Date | undefined {
  if (!value || !isDateOnly(value)) return undefined;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMasterDataEditor();
  const params = await searchParams;
  const pageInput = parsePageInput(params);
  const action = selectedValue(auditActions, firstQueryValue(params, "action"));
  const entityType = selectedValue(
    auditEntityTypes,
    firstQueryValue(params, "entityType"),
  );
  const [events, actors] = await Promise.all([
    listAuditEvents({
      action,
      actorEmail: firstQueryValue(params, "actorEmail"),
      dateFrom: auditDate(firstQueryValue(params, "dateFrom")),
      dateTo: auditDate(firstQueryValue(params, "dateTo"), true),
      entityType,
      ...pageInput,
    }),
    listAuditActors(),
  ]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Activity history
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Important authoritative changes, newest first.
        </p>
      </header>
      <form className="bg-card grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-6">
        <FilterField label="Employee">
          <select
            className={filterControlClassName}
            defaultValue={firstQueryValue(params, "actorEmail") ?? ""}
            name="actorEmail"
          >
            <option value="">All employees</option>
            {actors.map((actor) => (
              <option key={actor.actorEmail} value={actor.actorEmail}>
                {actor.actorName}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Action">
          <select
            className={filterControlClassName}
            defaultValue={action ?? ""}
            name="action"
          >
            <option value="">All actions</option>
            {auditActions.map((item) => (
              <option key={item} value={item}>
                {formatEnumLabel(item)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Entity type">
          <select
            className={filterControlClassName}
            defaultValue={entityType ?? ""}
            name="entityType"
          >
            <option value="">All entity types</option>
            {auditEntityTypes.map((item) => (
              <option key={item} value={item}>
                {formatEnumLabel(item)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Activity from">
          <input
            className={filterControlClassName}
            defaultValue={firstQueryValue(params, "dateFrom") ?? ""}
            name="dateFrom"
            type="date"
          />
        </FilterField>
        <FilterField label="Activity to">
          <input
            className={filterControlClassName}
            defaultValue={firstQueryValue(params, "dateTo") ?? ""}
            name="dateTo"
            type="date"
          />
        </FilterField>
        <PageSizeField value={pageInput.pageSize} />
        <button
          className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
          type="submit"
        >
          Filter
        </button>
      </form>
      <section className="bg-card overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
              <tr>
                <th className="px-4 py-3">Date / time</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.items.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3 text-xs">
                    {formatTimestamp(event.occurredAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{event.actorName}</span>
                    <span className="text-muted-foreground block text-xs">
                      {event.actorEmail}
                    </span>
                  </td>
                  <td className="px-4 py-3">{event.action}</td>
                  <td className="px-4 py-3">{event.entityType}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {event.entityReference}
                  </td>
                  <td className="px-4 py-3">{event.summary}</td>
                </tr>
              ))}
              {events.items.length === 0 ? (
                <tr>
                  <td
                    className="text-muted-foreground px-4 py-12 text-center"
                    colSpan={6}
                  >
                    No activity matches these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          page={pageInput.page}
          pageSize={pageInput.pageSize}
          pathname="/admin/activity"
          queryString={query.toString()}
          total={events.total}
        />
      </section>
    </div>
  );
}
