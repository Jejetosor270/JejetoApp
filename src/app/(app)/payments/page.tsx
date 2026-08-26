import type { Metadata } from "next";

import { PaymentInstallmentTable } from "@/components/payments/payment-installment-table";
import { PaymentDirection } from "@/generated/prisma/client";
import type { DerivedPaymentStatus } from "@/domain/payments/calculations";
import { isDateOnly } from "@/domain/payments/dates";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
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
  const [user, options, installments] = await Promise.all([
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
      <PaymentInstallmentTable
        canEdit={canEditMasterData(user.role)}
        installments={installments.map((item) => ({
          clientName: item.clientName,
          currencyCode: item.currencyCode,
          direction: item.direction,
          dueDate: item.dueDate,
          id: item.id,
          label: item.label,
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
    </div>
  );
}
