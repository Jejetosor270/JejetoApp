import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { PaymentDirection } from "@/generated/prisma/client";
import type { DerivedPaymentStatus } from "@/domain/payments/calculations";
import { formatDateOnly, isDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { requireUser } from "@/lib/auth/current-user";
import {
  listPaymentInstallments,
  listPaymentOptions,
} from "@/lib/payments/payments";

export const metadata: Metadata = { title: "Payments" };

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
  const text = (name: string) =>
    typeof params[name] === "string" ? params[name] : undefined;
  const dueFrom = text("dueFrom");
  const dueTo = text("dueTo");
  const [, options, installments] = await Promise.all([
    requireUser(),
    listPaymentOptions(),
    listPaymentInstallments({
      clientId: text("clientId"),
      currencyCode: text("currencyCode"),
      direction: selected(Object.values(PaymentDirection), text("direction")),
      dueFrom: dueFrom && isDateOnly(dueFrom) ? dueFrom : undefined,
      dueTo: dueTo && isDateOnly(dueTo) ? dueTo : undefined,
      projectId: text("projectId"),
      status: selected(statuses, text("status")),
      supplierId: text("supplierId"),
    }),
  ]);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Operations
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Supplier cash out and client cash in, ordered by due date.
        </p>
      </header>
      <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={text("direction") ?? ""}
          name="direction"
        >
          <option value="">Both directions</option>
          <option value="SUPPLIER_PAYMENT">Supplier payments — cash out</option>
          <option value="CLIENT_RECEIPT">Client receipts — cash in</option>
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={text("status") ?? ""}
          name="status"
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
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
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
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
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={text("clientId") ?? ""}
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
        <input
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={dueFrom ?? ""}
          name="dueFrom"
          type="date"
          aria-label="Due from"
        />
        <div className="flex gap-2">
          <input
            className="border-input bg-background h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm"
            defaultValue={dueTo ?? ""}
            name="dueTo"
            type="date"
            aria-label="Due to"
          />
          <button
            className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
            type="submit"
          >
            Filter
          </button>
        </div>
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[70rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Project / Order</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Installment</th>
              <th className="px-3 py-2 text-right">Scheduled</th>
              <th className="px-3 py-2 text-right">Paid / Received</th>
              <th className="px-3 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {installments.map((item) => {
              const cashOut =
                item.direction === PaymentDirection.SUPPLIER_PAYMENT;
              return (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <Badge variant={cashOut ? "destructive" : "default"}>
                      {cashOut ? "CASH OUT" : "CASH IN"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{formatDateOnly(item.dueDate)}</td>
                  <td className="px-3 py-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/orders/${item.orderId}#payments`}
                    >
                      {item.projectName}
                    </Link>
                    <p className="text-muted-foreground font-mono text-xs">
                      {item.orderNumber}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    {cashOut ? item.supplierName : item.clientName}
                  </td>
                  <td className="px-3 py-2">{item.label}</td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(item.scheduledAmount, item.currencyCode)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(item.paidAmount, item.currencyCode)}
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(item.outstandingAmount, item.currencyCode)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        item.status === "OVERDUE" ? "destructive" : "outline"
                      }
                    >
                      {item.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                </tr>
              );
            })}
            {installments.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground px-3 py-12 text-center"
                  colSpan={9}
                >
                  No payment installments match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
