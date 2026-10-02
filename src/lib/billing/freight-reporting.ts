import "server-only";
import { getDatabase } from "@/lib/db";
import { summarizeFreightCoverage } from "@/domain/billing/freight-reporting";
import { activeCreditsInclude } from "@/lib/credits/select";
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
      include: {
        billingDocument: { include: { credits: activeCreditsInclude } },
      },
    });
    return summarizeFreightCoverage(
      allocations.flatMap((row) => [
        {
          freightCoverageHt: row.freightCoverageHt.toString(),
          currencyCode: row.billingDocument.currencyCode,
          fxRate: row.billingDocument.fxRateToReporting?.toString() ?? null,
          documentType: row.billingDocument.documentType,
          isCancelled: row.billingDocument.isCancelled,
          workflowStatus: row.billingDocument.workflowStatus,
        },
        ...(row.billingDocument.credits ?? []).flatMap((credit) =>
          credit.allocations
            .filter((allocation) => allocation.orderId === scope.orderId)
            .map((allocation) => ({
              freightCoverageHt: allocation.freightCoverageHt.toString(),
              creditAdjustment: true,
              currencyCode: credit.currencyCode,
              fxRate: credit.fxRateToReporting?.toString() ?? null,
              documentType: "INVOICE",
              isCancelled: credit.isCancelled,
              workflowStatus: "INVOICED",
            })),
        ),
      ]),
      currency,
    );
  }
  const documents = await db.clientBillingDocument.findMany({
    where: { projectId: scope.projectId, isCancelled: false },
    select: {
      credits: activeCreditsInclude,
      freightCoverageHt: true,
      currencyCode: true,
      fxRateToReporting: true,
      documentType: true,
      isCancelled: true,
      workflowStatus: true,
    },
  });
  return summarizeFreightCoverage(
    documents.flatMap((row) => [
      {
        ...row,
        freightCoverageHt: row.freightCoverageHt.toString(),
        fxRate: row.fxRateToReporting?.toString() ?? null,
      },
      ...(row.credits ?? []).map((credit) => ({
        freightCoverageHt: credit.freightCoverageHt.toString(),
        creditAdjustment: true,
        currencyCode: credit.currencyCode,
        fxRate: credit.fxRateToReporting?.toString() ?? null,
        documentType: "INVOICE",
        isCancelled: credit.isCancelled,
        workflowStatus: "INVOICED",
      })),
    ]),
    currency,
  );
}
