import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";

export class UnassignedCashError extends Error {}

/** Move the same cash identity, never duplicate an authoritative cash amount. */
export async function unassignCash(
  actorId: string,
  kind: "payment" | "receipt",
  ids: string[],
) {
  return getDatabase().$transaction(
    (tx) => unassignCashInTransaction(tx, actorId, kind, ids),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function unassignCashInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  kind: "payment" | "receipt",
  ids: string[],
) {
  for (const id of [...new Set(ids)]) {
    const payment =
      kind === "payment"
        ? await tx.paymentSettlement.findUnique({
            where: { id },
            include: {
              installment: {
                include: { order: { include: { project: true } } },
              },
            },
          })
        : null;
    const receipt =
      kind === "receipt"
        ? await tx.clientReceipt.findUnique({
            where: { id },
            include: { billingDocument: { include: { project: true } } },
          })
        : null;
    const source = payment ?? receipt;
    if (!source)
      throw new UnassignedCashError(
        "A selected cash record is no longer available. Refresh and try again.",
      );
    if (payment && payment.installment.direction !== "SUPPLIER_PAYMENT")
      throw new UnassignedCashError(
        "Historical planning settlements cannot become actual cash records.",
      );
    const currencyCode =
      payment?.installment.currencyCode ??
      receipt?.billingDocument.currencyCode;
    const reportingCurrencyCode =
      payment?.installment.order?.project?.reportingCurrencyCode ??
      payment?.installment.order?.detachedReportingCurrencyCode ??
      payment?.installment.detachedReportingCurrencyCode ??
      receipt?.billingDocument.project?.reportingCurrencyCode ??
      receipt?.billingDocument.detachedReportingCurrencyCode;
    const cashDate = payment?.settledAt ?? receipt?.receivedAt;
    if (!currencyCode || !reportingCurrencyCode || !cashDate)
      throw new UnassignedCashError(
        "The cash record has incomplete currency or date information.",
      );
    await tx.unassignedCashRecord.create({
      data: {
        id: source.id,
        direction: kind === "payment" ? "SUPPLIER_PAYMENT" : "CLIENT_RECEIPT",
        amount: source.amount,
        currencyCode,
        reportingCurrencyCode,
        cashDate,
        fxRateToReporting: source.fxRateToReporting,
        reference: source.reference,
        notes: source.notes,
        createdAt: source.createdAt,
        createdById: source.createdById,
        updatedById: actorId,
      },
    });
    // A transactional transfer between normalized cash states, not deletion into Trash.
    // The UUID, amount and audit identity survive; only one cash source remains on commit.
    if (kind === "payment")
      await tx.paymentSettlement.delete({ where: { id } });
    else await tx.clientReceipt.delete({ where: { id } });
    await writeAuditEvent(tx, actorId, {
      action: "UPDATED",
      entityId: id,
      entityType: kind === "payment" ? "SETTLEMENT" : "CLIENT_RECEIPT",
      entityReference: source.reference ?? "Cash record",
      summary:
        "Removed cash assignment; retained the original record in Unassigned cash records.",
      metadata: {
        previousInstallmentId:
          payment?.installmentId ?? receipt?.installmentId ?? null,
        previousBillingId: receipt?.billingDocumentId ?? null,
        destination: "UNASSIGNED_CASH",
      },
    });
  }
}
