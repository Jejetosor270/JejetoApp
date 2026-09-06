import Link from "next/link";
import Decimal from "decimal.js";
import type { Metadata } from "next";
import SupplierPaymentsPage from "./supplier-page";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { ReceiptEntry } from "@/components/payments/receipt-entry";
import { getDatabase } from "@/lib/db";
import { listClientCashInstallments } from "@/lib/billing/reporting";
import { listPaymentInstallments } from "@/lib/payments/payments";
import { listCashTransactions } from "@/lib/payments/transactions";
import { CashTransactions } from "@/components/payments/cash-transactions";
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
import {
  businessToday,
  formatDateOnly,
  isDateOnly,
} from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
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
  const tab = ["supplier", "client", "receipts", "transactions"].includes(
    text("tab") ?? "",
  )
    ? text("tab")
    : "overview";
  const projectId = optionalUuid(text("projectId"));
  const tabs = (
    <nav
      aria-label="Payments sections"
      className="flex flex-wrap gap-x-4 gap-y-2 border-b pb-3"
    >
      {["overview", "supplier", "client", "receipts", "transactions"].map(
        (item) => {
          const query = new URLSearchParams(queryStringFromParams(params));
          query.set("tab", item);
          query.delete("page");
          return (
            <Link
              key={item}
              aria-current={tab === item ? "page" : undefined}
              className={
                tab === item
                  ? "text-primary font-semibold"
                  : "text-muted-foreground"
              }
              href={`/payments?${query}`}
            >
              {item[0]?.toUpperCase()}
              {item.slice(1)}
            </Link>
          );
        },
      )}
    </nav>
  );
  if (tab === "receipts") {
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
        <h1 className="text-2xl font-semibold">Payments</h1>
        {tabs}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">Receipts</h2>
          <p className="text-muted-foreground text-sm">
            Record a Supplier payment made or a Client payment received. Review
            actual cash history in Transactions.
          </p>
          {canEdit ? (
            <ReceiptEntry
              projects={projects}
              currencies={currencies}
              today={businessToday()}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              An ADMIN or MANAGER can record receipts.
            </p>
          )}
        </section>
      </div>
    );
  }
  if (tab === "supplier")
    return (
      <div className="space-y-5">
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
  const [projects, clients, suppliers, orders, billing] = await Promise.all([
    db.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.client.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.supplier.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.procurementOrder.findMany({
      where: projectId ? { projectId } : {},
      select: { id: true, orderNumber: true },
      orderBy: { orderNumber: "asc" },
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
          {tab !== "client" ? (
            <optgroup label="Suppliers">
              {suppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </FilterField>
      <FilterField label="From">
        <DateInput name="dateFrom" defaultValue={text("dateFrom") ?? ""} />
      </FilterField>
      <FilterField label="To">
        <DateInput name="dateTo" defaultValue={text("dateTo") ?? ""} />
      </FilterField>
      {tab === "transactions" ? (
        <>
          <FilterField label="Direction">
            <select
              className={filterControlClassName}
              name="direction"
              defaultValue={text("direction") ?? ""}
            >
              <option value="">Both</option>
              <option value="IN">Cash In</option>
              <option value="OUT">Cash Out</option>
            </select>
          </FilterField>
          <FilterField label="Order">
            <select
              name="orderId"
              className={filterControlClassName}
              defaultValue={text("orderId") ?? ""}
            >
              <option value="">All Orders</option>
              {orders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.orderNumber}
                </option>
              ))}
            </select>
          </FilterField>
        </>
      ) : null}
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
      {tab !== "transactions" ? (
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
      ) : null}
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
      <button className="rounded border px-3 py-2" type="submit">
        Apply filters
      </button>
    </FilterBar>
  );
  const today = businessToday();
  const from = text("dateFrom"),
    to = text("dateTo");
  const clientRows =
    tab === "transactions"
      ? []
      : (await listClientCashInstallments(projectId ? [projectId] : undefined))
          .filter(
            (item) =>
              (!text("counterpartyId") ||
                item.clientId === text("counterpartyId")) &&
              (!text("billingId") ||
                item.billingDocumentId === text("billingId")) &&
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
  const actual =
    tab === "client"
      ? null
      : await listCashTransactions(
          tab === "overview"
            ? { ...params, page: "1", pageSize: "10" }
            : params,
        );
  const supplierRows =
    tab === "overview" && !text("billingId")
      ? (
          await listPaymentInstallments({
            projectId,
            direction: "SUPPLIER_PAYMENT",
            supplierId: optionalUuid(text("counterpartyId")),
            dueFrom: from && isDateOnly(from) ? from : undefined,
            dueTo: to && isDateOnly(to) ? to : undefined,
          })
        )
          .filter(
            (item) =>
              !item.isCancelled &&
              new Decimal(item.outstandingAmount).isPositive() &&
              (!text("reference") ||
                item.orderNumber
                  .toLowerCase()
                  .includes((text("reference") ?? "").toLowerCase())) &&
              (!text("status") ||
                (text("status") === "OVERDUE"
                  ? item.dueDate < today
                  : text("status") === "UPCOMING"
                    ? item.dueDate >= today
                    : item.status === text("status"))),
          )
          .sort(
            (a, b) =>
              a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
          )
      : [];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Payments</h1>
      {tabs}
      {filters}
      {tab === "transactions" && actual ? (
        <>
          <p className="text-muted-foreground text-sm">
            Actual Client receipts and Supplier settlements only. Original
            transaction currencies are preserved.
          </p>
          <CashTransactions items={actual.items} />
          <Pagination
            pathname="/payments"
            queryString={queryStringFromParams(params)}
            {...actual}
          />
        </>
      ) : tab === "client" ? (
        <>
          <p className="text-muted-foreground text-sm">
            Billing schedules and recorded Client receipts. Open Billing to
            record or edit a receipt.
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
        </>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">
              Expected Cash Out · Supplier installments
            </h2>
            <ul className="divide-y rounded border">
              {supplierRows.slice(0, 10).map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-2 p-3"
                >
                  <Link
                    className="text-primary"
                    href={`/orders/${item.orderId}`}
                  >
                    {item.supplierName} · {item.orderNumber} · {item.label}
                  </Link>
                  <span>
                    {item.dueDate < today ? "Overdue" : "Upcoming"} ·{" "}
                    {formatDateOnly(item.dueDate)} ·{" "}
                    {formatMoney(item.outstandingAmount, item.currencyCode)}
                  </span>
                </li>
              ))}
              {!supplierRows.length ? (
                <li className="p-3">No outstanding Supplier installments.</li>
              ) : null}
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">
              Expected Cash In · Client collections
            </h2>
            <ClientCashTable
              items={clientRows
                .filter(
                  (item) =>
                    !item.isCancelled &&
                    new Decimal(item.outstandingAmount).isPositive(),
                )
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .slice(0, 10)}
            />
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Recent actual cash</h2>
            <CashTransactions items={actual?.items ?? []} />
          </section>
        </>
      )}
    </div>
  );
}
