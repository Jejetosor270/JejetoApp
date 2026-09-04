import type { Metadata } from "next";

import { PaymentInstallmentTable } from "@/components/payments/payment-installment-table";
import { PageSizeField, Pagination } from "@/components/listing/pagination";
import {
  FilterField,
  filterControlClassName,
} from "@/components/listing/filter-field";
import { ExportLink } from "@/components/export/export-link";
import { PaymentDirection } from "@/generated/prisma/client";
import type { DerivedPaymentStatus } from "@/domain/payments/calculations";
import { isDateOnly } from "@/domain/payments/dates";
import { formatEnumLabel } from "@/domain/presentation/labels";
import {
  firstQueryValue,
  optionalUuid,
  parsePageInput,
  parseSort,
  parseSortDirection,
  queryStringFromParams,
} from "@/domain/listing/validation";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import {
  listPaymentInstallmentsPage,
  listPaymentOptions,
} from "@/lib/payments/payments";

export const metadata: Metadata = { title: "Supplier Payments" };

const statuses: readonly DerivedPaymentStatus[] = [
  "OVERDUE",
  "DUE",
  "PARTIALLY_PAID",
  "UPCOMING",
  "PAID",
  "CANCELLED",
];

function selected<T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | undefined {
  return values.find((item) => item === value);
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const text = (name: string) => firstQueryValue(params, name);
  const dueFrom = text("dueFrom");
  const dueTo = text("dueTo");
  const pageInput = parsePageInput(params);
  const sort = parseSort(
    ["dueDate", "amount"] as const,
    text("sort"),
    "dueDate",
  );
  const sortDirection = parseSortDirection(text("sortDirection"));
  const [user, options, result] = await Promise.all([
    requireUser(),
    listPaymentOptions(),
    listPaymentInstallmentsPage({
      currencyCode: text("currencyCode"),
      direction: PaymentDirection.SUPPLIER_PAYMENT,
      dueFrom: dueFrom && isDateOnly(dueFrom) ? dueFrom : undefined,
      dueTo: dueTo && isDateOnly(dueTo) ? dueTo : undefined,
      orderId: optionalUuid(text("orderId")),
      projectId: optionalUuid(text("projectId")),
      sort,
      sortDirection,
      status: selected(statuses, text("status")),
      supplierId: optionalUuid(text("supplierId")),
      ...pageInput,
    }),
  ]);
  const exportQuery = new URLSearchParams(queryStringFromParams(params));
  exportQuery.set("direction", PaymentDirection.SUPPLIER_PAYMENT);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
            Operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Supplier Payments
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Supplier cash-out installments, settlements, and outstanding
            balances.
          </p>
        </div>
        <ExportLink entity="payments" queryString={exportQuery.toString()} />
      </header>
      <form className="grid items-end gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <FilterField label="Supplier Order">
          <select
            className={filterControlClassName}
            defaultValue={text("orderId") ?? ""}
            name="orderId"
          >
            <option value="">All Supplier Orders</option>
            {options.orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select
            className={filterControlClassName}
            defaultValue={text("status") ?? ""}
            name="status"
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {formatEnumLabel(status)}
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
            <option value="dueDate">Due date</option>
            <option value="amount">Scheduled amount</option>
          </select>
        </FilterField>
        <FilterField label="Sort direction">
          <select
            className={filterControlClassName}
            defaultValue={sortDirection}
            name="sortDirection"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </FilterField>
        <PageSizeField value={pageInput.pageSize} />
        <FilterField label="Project">
          <select
            className={filterControlClassName}
            defaultValue={text("projectId") ?? ""}
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
        <FilterField label="Supplier">
          <select
            className={filterControlClassName}
            defaultValue={text("supplierId") ?? ""}
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
        <FilterField label="Currency">
          <select
            className={filterControlClassName}
            defaultValue={text("currencyCode") ?? ""}
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
        <FilterField label="Due from">
          <input
            className={filterControlClassName}
            defaultValue={dueFrom ?? ""}
            name="dueFrom"
            type="date"
          />
        </FilterField>
        <div className="flex items-end gap-2">
          <FilterField label="Due to">
            <input
              className={filterControlClassName}
              defaultValue={dueTo ?? ""}
              name="dueTo"
              type="date"
            />
          </FilterField>
          <button
            className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
            type="submit"
          >
            Filter
          </button>
        </div>
      </form>
      <PaymentInstallmentTable
        canEdit={canEditMasterData(user.role)}
        installments={result.items.map((item) => ({
          actualDate: item.actualDate,
          currencyCode: item.currencyCode,
          dueDate: item.dueDate,
          id: item.id,
          label: item.label,
          notes: item.notes,
          orderId: item.orderId,
          orderNumber: item.orderNumber,
          outstandingAmount: item.outstandingAmount,
          paidAmount: item.paidAmount,
          projectName: item.projectName,
          scheduledAmount: item.scheduledAmount,
          settlementCount: item.settlements.length,
          status: item.status,
          supplierName: item.supplierName,
        }))}
      />
      <Pagination
        page={pageInput.page}
        pageSize={pageInput.pageSize}
        pathname="/payments"
        queryString={queryStringFromParams(params)}
        selectionIsPageScoped={canEditMasterData(user.role)}
        total={result.total}
      />
    </div>
  );
}
