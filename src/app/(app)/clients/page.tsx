import type { Metadata } from "next";

import { ClientManagement } from "@/app/(app)/clients/client-management";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listClients } from "@/lib/master-data/clients";
import { listActiveCurrencies } from "@/lib/master-data/lookups";

export const metadata: Metadata = { title: "Clients" };

function activeFilter(
  value: string | undefined,
): "active" | "inactive" | "all" {
  return value === "inactive" || value === "all" ? value : "active";
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ active?: string; query?: string }>;
}) {
  const params = await searchParams;
  const query = typeof params.query === "string" ? params.query : "";
  const active = activeFilter(
    typeof params.active === "string" ? params.active : undefined,
  );
  const [user, clients, currencies] = await Promise.all([
    requireUser(),
    listClients(query, active),
    listActiveCurrencies(),
  ]);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Directory
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Client master data and project ownership.
        </p>
      </header>
      <form className="flex flex-col gap-2 sm:flex-row">
        <input
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm sm:w-80"
          defaultValue={query}
          name="query"
          placeholder="Search name, contact, or VAT"
        />
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={active}
          name="active"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All clients</option>
        </select>
        <button
          className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
          type="submit"
        >
          Filter
        </button>
      </form>
      <ClientManagement
        canEdit={canEditMasterData(user.role)}
        clients={clients}
        currencies={currencies}
      />
    </div>
  );
}
