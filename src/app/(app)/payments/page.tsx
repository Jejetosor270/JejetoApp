import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NavigationTabs } from "@/components/layout/navigation-tabs";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import type { Metadata } from "next";
import SupplierPaymentsPage from "./supplier-page";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { ReceiptEntry } from "@/components/payments/receipt-entry";
import { getDatabase } from "@/lib/db";
import { listClientCashInstallments } from "@/lib/billing/reporting";
import { ClientCashTable } from "@/components/payments/client-cash-table";
import { DateInput } from "@/components/forms/date-input";
import { FilterBar } from "@/components/listing/filter-bar";
import {
  FilterField,
  filterControlClassName,
} from "@/components/listing/filter-field";
import { Pagination } from "@/components/listing/pagination";
import {
  firstQueryValue,
  optionalUuid,
  parsePageInput,
  queryStringFromParams,
} from "@/domain/listing/validation";
import { businessToday, isDateOnly } from "@/domain/payments/dates";
export const metadata: Metadata = { title: "Payments" };
type Params = Record<string, string | string[] | undefined>;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const text = (key: string) => firstQueryValue(params, key);
  if (["overview", "transactions", "receipts"].includes(text("tab") ?? "")) {
    const query = new URLSearchParams(queryStringFromParams(params));
    query.set(
      "tab",
      text("tab") === "receipts"
        ? "entry"
        : text("tab") === "transactions" &&
            (text("direction") === "IN" || text("billingId"))
          ? "client"
          : "supplier",
    );
    query.delete("page");
    query.delete("direction");
    redirect(`/payments?${query}`);
  }
  const tab = ["supplier", "client", "entry"].includes(text("tab") ?? "")
    ? text("tab")
    : "supplier";
  const projectId = optionalUuid(text("projectId"));
  const tabs = (
    <NavigationTabs
      label="Payments sections"
      tabs={(
        [
          ["supplier", "Supplier"],
          ["client", "Client"],
          ["entry", "Record Payment"],
        ] as const
      ).map(([item, label]) => {
        const query = new URLSearchParams(queryStringFromParams(params));
        query.set("tab", item);
        query.delete("page");
        return {
          id: item,
          label,
          active: tab === item,
          href: `/payments?${query}`,
        };
      })}
    />
  );
  if (tab === "entry") {
    const canEdit = canEditMasterData(user.role);
    const [projects, currencies] = canEdit
      ? await Promise.all([
          getDatabase().project.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          getDatabase().currency.findMany({
            select: { code: true },
            orderBy: { code: "asc" },
          }),
        ])
      : [[], []];
    return (
      <div className="space-y-5">
        <PageHeader title="Payments" />
        {tabs}
        <section className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Record a Supplier payment made or a Client payment received.
          </p>
          {canEdit ? (
            <ReceiptEntry
              projects={projects}
              currencies={currencies}
              today={businessToday()}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              An ADMIN or MANAGER can record payments and receipts.
            </p>
          )}
        </section>
      </div>
    );
  }
  if (tab === "supplier")
    return (
      <div className="space-y-5">
        <PageHeader title="Payments" />
        {tabs}
        <SupplierPaymentsPage
          searchParams={Promise.resolve({
            ...params,
            dueFrom: text("dueFrom") ?? text("dateFrom"),
            dueTo: text("dueTo") ?? text("dateTo"),
            supplierId: text("supplierId") ?? text("counterpartyId"),
          })}
        />
      </div>
    );
  const db = getDatabase();
  const [projects, clients, billing] = await Promise.all([
    db.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.client.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.clientBillingDocument.findMany({
      where: projectId ? { projectId } : {},
      select: { id: true, reference: true },
      orderBy: { reference: "asc" },
    }),
  ]);
  const filters = (
    <FilterBar>
      <input name="tab" type="hidden" value={tab} />
      <FilterField label="Project">
        <select
          name="projectId"
          className={filterControlClassName}
          defaultValue={projectId ?? ""}
        >
          <option value="">All Projects</option>
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Counterparty">
        <select
          name="counterpartyId"
          className={filterControlClassName}
          defaultValue={text("counterpartyId") ?? ""}
        >
          <option value="">All counterparties</option>
          <optgroup label="Clients">
            {clients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </optgroup>
        </select>
      </FilterField>
      <FilterField label="From">
        <DateInput name="dateFrom" defaultValue={text("dateFrom") ?? ""} />
      </FilterField>
      <FilterField label="To">
        <DateInput name="dateTo" defaultValue={text("dateTo") ?? ""} />
      </FilterField>
      <FilterField label="Billing">
        <select
          name="billingId"
          className={filterControlClassName}
          defaultValue={text("billingId") ?? ""}
        >
          <option value="">All Billing</option>
          {billing.map((item) => (
            <option key={item.id} value={item.id}>
              {item.reference}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Reference">
        <input
          name="reference"
          className={filterControlClassName}
          defaultValue={text("reference") ?? ""}
        />
      </FilterField>
      <FilterField label="Timing">
        <select
          name="status"
          className={filterControlClassName}
          defaultValue={text("status") ?? ""}
        >
          <option value="">All</option>
          <option value="OVERDUE">Overdue</option>
          <option value="UPCOMING">Upcoming</option>
          <option value="PAID">Paid</option>
        </select>
      </FilterField>
      <FilterField label="Date order">
        <select
          name="sortDirection"
          className={filterControlClassName}
          defaultValue={text("sortDirection") ?? "desc"}
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </FilterField>
      <Button variant="outline" type="submit">
        Apply filters
      </Button>
    </FilterBar>
  );
  const today = businessToday();
  const from = text("dateFrom"),
    to = text("dateTo");
  const clientRows = (
    await listClientCashInstallments(projectId ? [projectId] : undefined)
  )
    .filter(
      (item) =>
        (!text("counterpartyId") || item.clientId === text("counterpartyId")) &&
        (!text("billingId") || item.billingDocumentId === text("billingId")) &&
        (!from || !isDateOnly(from) || item.dueDate >= from) &&
        (!to || !isDateOnly(to) || item.dueDate <= to) &&
        (!text("reference") ||
          item.billingReference
            .toLowerCase()
            .includes((text("reference") ?? "").toLowerCase())) &&
        (!text("status") ||
          (text("status") === "OVERDUE"
            ? !item.isCancelled &&
              item.dueDate < today &&
              new Decimal(item.outstandingAmount).isPositive()
            : text("status") === "UPCOMING"
              ? !item.isCancelled &&
                item.dueDate >= today &&
                new Decimal(item.outstandingAmount).isPositive()
              : item.status === text("status"))),
    )
    .sort(
      (a, b) =>
        (text("sortDirection") === "asc" ? 1 : -1) *
          a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
    );
  const { page, pageSize } = parsePageInput(params);
  return (
    <div className="space-y-5">
      <PageHeader title="Payments" />
      {tabs}
      {filters}
      <p className="text-muted-foreground text-sm">
        Billing schedules and recorded Client receipts.{" "}
        <Link
          className="text-primary"
          href={projectId ? `/billing?projectId=${projectId}` : "/billing"}
        >
          Open Billing
        </Link>{" "}
        to view, record or edit receipts, including Billing-level receipts.
      </p>
      <ClientCashTable
        items={clientRows.slice((page - 1) * pageSize, page * pageSize)}
      />
      <Pagination
        pathname="/payments"
        queryString={queryStringFromParams(params)}
        page={page}
        pageSize={pageSize}
        total={clientRows.length}
      />
    </div>
  );
}
