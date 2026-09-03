import "server-only";

import {
  FreightTreatment,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";

export async function listQuoteIntakeOptions() {
  const database = getDatabase();
  const [billingDocuments, projects, suppliers, currencies] = await Promise.all(
    [
      database.clientBillingDocument.findMany({
        where: { isCancelled: false },
        orderBy: [{ documentDate: "desc" }, { reference: "asc" }],
        select: {
          currencyCode: true,
          documentType: true,
          id: true,
          isProjectRemainderApproved: true,
          projectId: true,
          reference: true,
          totalHt: true,
        },
      }),
      database.project.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          buildings: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              isActive: true,
              name: true,
              rooms: {
                orderBy: { name: "asc" },
                select: { buildingId: true, id: true, name: true },
                where: { isActive: true },
              },
              shortCode: true,
            },
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
    ],
  );
  return {
    billingDocuments: billingDocuments.map((document) => ({
      ...document,
      totalHt: document.totalHt.toString(),
    })),
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
