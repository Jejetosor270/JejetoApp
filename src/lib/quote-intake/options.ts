import "server-only";

import Decimal from "decimal.js";

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
          allocations: { select: { allocatedAmount: true } },
          currencyCode: true,
          documentType: true,
          fxRateToReporting: true,
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
          defaultFreightMarkupRate: true,
          defaultOtherCostMarkupRate: true,
          defaultProductMarkupRate: true,
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
      allocatedHt: document.allocations
        .reduce(
          (total, allocation) => total.plus(allocation.allocatedAmount),
          new Decimal(0),
        )
        .toFixed(4),
      currencyCode: document.currencyCode,
      documentType: document.documentType,
      fxRateToReporting: document.fxRateToReporting?.toString() ?? null,
      id: document.id,
      isProjectRemainderApproved: document.isProjectRemainderApproved,
      projectId: document.projectId,
      reference: document.reference,
      totalHt: document.totalHt.toString(),
    })),
    currencies,
    freightTreatments: Object.values(FreightTreatment),
    projects: projects.map((project) => ({
      ...project,
      defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
      defaultOtherCostMarkupRate: project.defaultOtherCostMarkupRate.toString(),
      defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
    })),
    suppliers,
    vatRecoverabilities: Object.values(VatRecoverability),
    vatTreatments: Object.values(VatTreatment),
  };
}

export type QuoteIntakeOptions = Awaited<
  ReturnType<typeof listQuoteIntakeOptions>
>;
