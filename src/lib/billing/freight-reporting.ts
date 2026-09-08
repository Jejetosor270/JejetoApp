import "server-only";
import { getDatabase } from "@/lib/db";
import { summarizeFreightCoverage } from "@/domain/billing/freight-reporting";
export async function getBilledFreight(
  scope: { projectId: string; orderId?: string },
  currency: string,
) {
  const db = getDatabase();
  if (scope.orderId) {
    const allocations = await db.clientBillingAllocation.findMany({
      where: {
        orderId: scope.orderId,
        billingDocument: { projectId: scope.projectId, isCancelled: false },
      },
      include: { billingDocument: true },
    });
    return summarizeFreightCoverage(
      allocations.map((row) => ({
        freightCoverageHt: row.freightCoverageHt.toString(),
        currencyCode: row.billingDocument.currencyCode,
        fxRate: row.billingDocument.fxRateToReporting?.toString() ?? null,
        documentType: row.billingDocument.documentType,
        isCancelled: row.billingDocument.isCancelled,
      })),
      currency,
    );
  }
  const documents = await db.clientBillingDocument.findMany({
    where: { projectId: scope.projectId, isCancelled: false },
    select: {
      freightCoverageHt: true,
      currencyCode: true,
      fxRateToReporting: true,
      documentType: true,
      isCancelled: true,
    },
  });
  return summarizeFreightCoverage(
    documents.map((row) => ({
      ...row,
      freightCoverageHt: row.freightCoverageHt.toString(),
      fxRate: row.fxRateToReporting?.toString() ?? null,
    })),
    currency,
  );
}
