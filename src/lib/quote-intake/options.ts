import "server-only";

import {
  FreightTreatment,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

export async function listQuoteIntakeOptions() {
  const database = getDatabase();
  const [projects, suppliers, currencies] = await Promise.all([
    database.project.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        buildings: {
          orderBy: { name: "asc" },
          select: { id: true, isActive: true, name: true, shortCode: true },
        },
        id: true,
        name: true,
        reportingCurrencyCode: true,
      },
    }),
    database.supplier.findMany({
      orderBy: { displayName: "asc" },
      where: { isActive: true },
      select: { displayName: true, id: true },
    }),
    database.currency.findMany({
      orderBy: { code: "asc" },
      where: { isActive: true },
      select: { code: true, name: true },
    }),
  ]);
  return {
    currencies,
    freightTreatments: Object.values(FreightTreatment),
    projects,
    suppliers,
    vatRecoverabilities: Object.values(VatRecoverability),
    vatTreatments: Object.values(VatTreatment),
  };
}

export type QuoteIntakeOptions = Awaited<
  ReturnType<typeof listQuoteIntakeOptions>
>;
