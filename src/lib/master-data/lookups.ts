import "server-only";

import { ProjectStatus } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

export async function listActiveCurrencies() {
  return getDatabase().currency.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { code: true, name: true },
  });
}

export async function listProjectFormOptions() {
  const database = getDatabase();
  const [clients, currencies, managers, suppliers] = await Promise.all([
    database.client.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { displayName: true, id: true },
    }),
    listActiveCurrencies(),
    database.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    database.supplier.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { displayName: true, id: true },
    }),
  ]);

  return {
    clients,
    currencies,
    managers,
    suppliers,
    statuses: Object.values(ProjectStatus),
  };
}
