import type { Metadata } from "next";
import Link from "next/link";

import { OrderForm } from "@/components/procurement/order-form";
import { OrderTable } from "@/components/procurement/order-table";
import { ProcurementOrderStatus } from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listOrderOptions, listOrders } from "@/lib/procurement/orders";

export const metadata: Metadata = { title: "Procurement orders" };

function statusValue(
  value: string | undefined,
): ProcurementOrderStatus | undefined {
  return Object.values(ProcurementOrderStatus).find(
    (status) => status === value,
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    projectId?: string;
    query?: string;
    status?: string;
    supplierId?: string;
  }>;
}) {
  const params = await searchParams;
  const query = typeof params.query === "string" ? params.query : "";
  const projectId =
    typeof params.projectId === "string" && params.projectId
      ? params.projectId
      : undefined;
  const supplierId =
    typeof params.supplierId === "string" && params.supplierId
      ? params.supplierId
      : undefined;
  const status = statusValue(
    typeof params.status === "string" ? params.status : undefined,
  );
  const [user, options, orders] = await Promise.all([
    requireUser(),
    listOrderOptions(),
    listOrders({ projectId, query, status, supplierId }),
  ]);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Procurement
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Procurement orders
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Supplier-level packages, cost progression, and commercial margin.
        </p>
      </header>
      <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <input
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={query}
          name="query"
          placeholder="Search reference, package, supplier"
        />
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={projectId ?? ""}
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
          defaultValue={supplierId ?? ""}
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
          defaultValue={status ?? ""}
          name="status"
        >
          <option value="">All statuses</option>
          {options.statuses.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
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
      {canEditMasterData(user.role) ? (
        <div className="flex flex-wrap items-start gap-2">
          <details className="group">
            <summary className="bg-primary text-primary-foreground inline-flex h-9 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium">
              Create order
            </summary>
            <div className="mt-4">
              <OrderForm options={options} />
            </div>
          </details>
          <Link
            className="border-input bg-background hover:bg-muted inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium"
            href="/orders/import"
          >
            Import supplier quote
          </Link>
        </div>
      ) : null}
      <OrderTable canEdit={canEditMasterData(user.role)} orders={orders} />
    </div>
  );
}
