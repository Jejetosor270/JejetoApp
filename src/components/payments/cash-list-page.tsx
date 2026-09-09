import { requireUser, canEditMasterData } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/listing/filter-bar";
import {
  FilterField,
  filterControlClassName,
} from "@/components/listing/filter-field";
import { PageSizeField, Pagination } from "@/components/listing/pagination";
import { NavigationTabs } from "@/components/layout/navigation-tabs";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/date-input";
import {
  firstQueryValue,
  optionalUuid,
  parsePageInput,
  parseSortDirection,
  selectedValue,
  queryStringFromParams,
} from "@/domain/listing/validation";
import { businessToday, isDateOnly } from "@/domain/payments/dates";
import { listCashRecords, installmentStatuses } from "@/lib/payments/cash-list";
import { ReceiptEntry } from "./receipt-entry";
import { CashListTable } from "./cash-list-table";

export type CashSearchParams = Record<string, string | string[] | undefined>;
export async function CashListPage({
  section,
  params,
}: {
  section: "payments" | "receipts" | "installments";
  params: CashSearchParams;
}) {
  const user = await requireUser();
  const text = (key: string) => firstQueryValue(params, key);
  const client =
    section === "receipts" ||
    (section === "installments" && text("tab") === "client");
  const kind =
    section === "installments"
      ? client
        ? "client-installment"
        : "supplier-installment"
      : client
        ? "receipt"
        : "payment";
  const title =
    section === "payments"
      ? "Payments"
      : section === "receipts"
        ? "Receipts"
        : "Installments";
  const pathname = "/" + section;
  const projectId = optionalUuid(text("projectId"));
  const counterpartyId = optionalUuid(
    text("counterpartyId") ?? text(client ? "clientId" : "supplierId"),
  );
  const dateFrom = text("dateFrom") ?? text("dueFrom"),
    dateTo = text("dateTo") ?? text("dueTo");
  const direction = parseSortDirection(
    text("direction") ?? text("sortDirection"),
  );
  const paging = parsePageInput(params);
  const db = getDatabase();
  const [projects, currencies, parties, result] = await Promise.all([
    db.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.currency.findMany({ select: { code: true }, orderBy: { code: "asc" } }),
    client
      ? db.client.findMany({
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : db.supplier.findMany({
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        }),
    listCashRecords({
      status: selectedValue(installmentStatuses, text("status")),
      kind,
      orderId: optionalUuid(text("orderId")),
      billingId: optionalUuid(text("billingId")),
      query: text("query") ?? text("reference") ?? "",
      projectId,
      counterpartyId,
      dateFrom: dateFrom && isDateOnly(dateFrom) ? dateFrom : undefined,
      dateTo: dateTo && isDateOnly(dateTo) ? dateTo : undefined,
      direction,
      ...paging,
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={
          section === "installments"
            ? "Planned Supplier payments and Client collections."
            : client
              ? "Actual Client receipts recorded against Billing."
              : "Actual Supplier payments recorded against Orders."
        }
        actions={
          canEditMasterData(user.role) && section !== "installments" ? (
            <ReceiptEntry
              projects={projects}
              currencies={currencies}
              today={businessToday()}
              initialType={client ? "CLIENT" : "SUPPLIER"}
              initialProjectId={projectId ?? ""}
              initiallyOpen={text("tab") === "entry"}
            />
          ) : undefined
        }
      />
      {section === "installments" && (
        <NavigationTabs
          label="Installment type"
          tabs={["supplier", "client"].map((tab) => {
            const query = new URLSearchParams(queryStringFromParams(params));
            query.set("tab", tab);
            query.delete("page");
            query.delete("counterpartyId");
            query.delete("supplierId");
            query.delete("clientId");
            return {
              id: tab,
              label: tab === "supplier" ? "Supplier" : "Client",
              active: client === (tab === "client"),
              href: pathname + "?" + query,
            };
          })}
        />
      )}
      <FilterBar>
        {text("orderId") && (
          <input type="hidden" name="orderId" value={text("orderId")} />
        )}
        {text("billingId") && (
          <input type="hidden" name="billingId" value={text("billingId")} />
        )}
        {section === "installments" && (
          <input
            type="hidden"
            name="tab"
            value={client ? "client" : "supplier"}
          />
        )}
        <FilterField label="Search">
          <input
            name="query"
            className={filterControlClassName}
            defaultValue={text("query") ?? text("reference") ?? ""}
            placeholder="Reference or document"
          />
        </FilterField>
        <FilterField label="Project">
          <select
            name="projectId"
            className={filterControlClassName}
            defaultValue={projectId ?? ""}
          >
            <option value="">All Projects</option>
            {projects.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label={client ? "Client" : "Supplier"}>
          <select
            name="counterpartyId"
            className={filterControlClassName}
            defaultValue={counterpartyId ?? ""}
          >
            <option value="">All</option>
            {parties.map((row) => (
              <option key={row.id} value={row.id}>
                {row.displayName}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From">
          <DateInput name="dateFrom" defaultValue={dateFrom ?? ""} />
        </FilterField>
        <FilterField label="To">
          <DateInput name="dateTo" defaultValue={dateTo ?? ""} />
        </FilterField>
        <FilterField label="Date order">
          <select
            name="direction"
            className={filterControlClassName}
            defaultValue={direction}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </FilterField>
        {section === "installments" && (
          <FilterField label="Status">
            <select
              name="status"
              className={filterControlClassName}
              defaultValue={text("status") ?? ""}
            >
              <option value="">All statuses</option>
              {installmentStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
          </FilterField>
        )}
        <PageSizeField value={paging.pageSize} />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </FilterBar>
      <CashListTable
        items={result.items}
        title={title}
        kind={kind}
        canEdit={canEditMasterData(user.role)}
      />
      <Pagination
        pathname={pathname}
        queryString={queryStringFromParams(params)}
        {...paging}
        total={result.total}
      />
    </div>
  );
}
