import "server-only";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { requireMasterDataEditor, requireUser } from "@/lib/auth/current-user";
import { writeAuditEvent } from "@/lib/audit/events";
import { editVersion } from "@/lib/edit-version";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { assertCreditAllocations } from "@/domain/credits/allocations";
import {
  creditAmounts,
  remainingAfterCredits,
  supplierCreditEffect,
} from "@/domain/credits/calculations";
import {
  cancelCreditRefundSchema,
  cancelCreditSchema,
  createCreditSchema,
  creditRefundSchema,
  creditSourceSchema,
} from "@/domain/credits/validation";
import {
  asCreditAmount,
  assertCreditSourceReady,
  CreditError,
  loadCreditSource,
  sourceCreditPosition,
  type CreditRecord,
  type CreditScope,
  type CreditSource,
} from "./source";
export { CreditError } from "./source";

const activeCredits = (source: CreditSource) =>
  source.credits.filter((row) => !row.isCancelled);
const allocations = (credit: CreditRecord) =>
  credit.allocations.map((row) => ({
    orderId: row.orderId,
    amountHt: row.amountHt.toString(),
    freightCoverageHt: row.freightCoverageHt.toString(),
    otherCoverageHt: row.otherCoverageHt.toString(),
  }));
const result = (source: CreditSource, id: string) => ({
  id,
  side: source.side,
  sourceId: source.sourceId,
  projectId: source.projectId,
});

async function assertActor(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { isActive: true, role: true },
  });
  if (!actor?.isActive || !["ADMIN", "MANAGER"].includes(actor.role))
    throw new CreditError(
      "Only an active Administrator or Manager can record credits and refunds.",
    );
}
async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  source: CreditSource,
  summary: string,
  metadata: Prisma.InputJsonObject,
) {
  await writeAuditEvent(tx, actorId, {
    action: "UPDATED",
    entityType: source.side === "CLIENT" ? "BILLING_DOCUMENT" : "ORDER",
    entityId: source.sourceId,
    entityReference: source.reference,
    summary,
    metadata,
  });
}
async function inTransaction<T>(
  work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>,
): Promise<T> {
  const actor = await requireMasterDataEditor();
  try {
    return await getDatabase().$transaction(
      async (tx) => {
        await assertActor(tx, actor.id);
        return work(tx, actor.id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof RangeError) throw new CreditError(error.message);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    )
      throw new CreditError(
        "This credit or its financial record changed during saving. Reopen and review it before retrying.",
      );
    throw error;
  }
}

export async function getCreditWorkspace(raw: unknown) {
  await requireUser();
  const source = await loadCreditSource(
    getDatabase(),
    creditSourceSchema.parse(raw),
  );
  if (!source.eligible && source.credits.length === 0) return null;
  const blockedReason = source.eligible
    ? source.blockedReason
    : "Credit and refund history is read-only because the original record is cancelled, no longer issued, or no longer assigned.";
  // A blocked match must remain reviewable even when its cash cannot be compared.
  const position = blockedReason
    ? {
        remaining: remainingAfterCredits(
          source.original,
          activeCredits(source).map(asCreditAmount),
        ),
        cash: null,
        expectedVersion: editVersion(source.snapshot),
      }
    : sourceCreditPosition(source);
  return {
    side: source.side,
    sourceId: source.sourceId,
    reference: source.reference,
    currencyCode: source.currencyCode,
    reportingCurrencyCode: source.reportingCurrencyCode,
    expectedVersion: position.expectedVersion,
    original: source.original,
    remaining: position.remaining,
    cash: blockedReason ? null : position.cash,
    blockedReason,
    supplierVatEntry: source.supplierVatEntry,
    orderAllocations: source.orderAllocations.map((row) => {
      const remaining = remainingAfterCredits(
        {
          totalHt: row.amountHt,
          vatAmount: "0",
          freightCoverageHt: row.freightCoverageHt,
          otherCoverageHt: row.otherCoverageHt,
        },
        activeCredits(source).flatMap((credit) =>
          allocations(credit)
            .filter((allocation) => allocation.orderId === row.orderId)
            .map((allocation) => ({
              totalHt: allocation.amountHt,
              vatAmount: "0",
              freightCoverageHt: allocation.freightCoverageHt,
              otherCoverageHt: allocation.otherCoverageHt,
            })),
        ),
      );
      return {
        ...row,
        amountHt: remaining.totalHt,
        freightCoverageHt: remaining.freightCoverageHt,
        otherCoverageHt: remaining.otherCoverageHt,
      };
    }),
    credits: source.credits
      .toSorted(
        (a, b) =>
          b.creditDate.getTime() - a.creditDate.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((credit) => ({
        id: credit.id,
        reference: credit.reference,
        creditDate: dateToDateOnly(credit.creditDate),
        reason: credit.reason,
        currencyCode: credit.currencyCode,
        reportingCurrencyCode: credit.reportingCurrencyCode,
        ...creditAmounts(asCreditAmount(credit)),
        isCancelled: credit.isCancelled,
        allocations: allocations(credit),
        refunds: credit.refunds.map((refund) => ({
          id: refund.id,
          amount: refund.amount.toString(),
          refundDate: dateToDateOnly(refund.refundDate),
          fxRateToReporting: refund.fxRateToReporting?.toString() ?? null,
          reference: refund.reference,
          notes: refund.notes,
          isCancelled: refund.isCancelled,
        })),
      })),
  };
}
export type CreditWorkspace = NonNullable<
  Awaited<ReturnType<typeof getCreditWorkspace>>
>;

export async function createCredit(raw: unknown) {
  const input = createCreditSchema.parse(raw);
  return inTransaction(async (tx, actorId) => {
    const source = await loadCreditSource(tx, input);
    assertCreditSourceReady(source, input.expectedVersion);
    if (source.credits.some((credit) => credit.reference === input.reference))
      throw new CreditError(
        "This credit reference already exists on the original document, including cancelled history.",
      );
    remainingAfterCredits(source.original, [
      ...activeCredits(source).map(asCreditAmount),
      input,
    ]);
    assertCreditAllocations({
      original: source.original,
      originalAllocations: source.orderAllocations,
      previous: activeCredits(source).map((credit) => ({
        ...asCreditAmount(credit),
        allocations: allocations(credit),
      })),
      credit: input,
      allocations: input.allocations,
    });
    let supplierRecoverableRate: string | null = null;
    let supplierVatEntryId: string | null = null;
    if (source.side === "SUPPLIER" && new Decimal(input.vatAmount).gt(0)) {
      const vat = source.supplierVatEntry;
      if (
        !vat ||
        vat.id !== input.supplierVatEntryId ||
        !["DOMESTIC", "CUSTOM"].includes(vat.treatment)
      )
        throw new CreditError(
          "Select the original invoice-payable Supplier input VAT entry for a VAT credit.",
        );
      if (vat.recoverableRate === null)
        throw new CreditError(
          "Review the original input VAT recoverability before crediting VAT.",
        );
      supplierCreditEffect({
        purchaseAmountHt: input.totalHt,
        vatAmount: input.vatAmount,
        recoverableRate: vat.recoverableRate,
      });
      supplierRecoverableRate = vat.recoverableRate;
      supplierVatEntryId = vat.id;
    }
    const credit = await tx.financialCredit.create({
      data: {
        side: source.side,
        billingDocumentId: source.side === "CLIENT" ? source.sourceId : null,
        orderId: source.side === "SUPPLIER" ? source.sourceId : null,
        reference: input.reference,
        creditDate: dateOnlyToDate(input.creditDate),
        reason: input.reason,
        totalHt: input.totalHt,
        vatAmount: input.vatAmount,
        freightCoverageHt: input.freightCoverageHt,
        otherCoverageHt: input.otherCoverageHt,
        currencyCode: source.currencyCode,
        reportingCurrencyCode: source.reportingCurrencyCode,
        fxRateToReporting:
          source.currencyCode === source.reportingCurrencyCode
            ? null
            : source.fxRateToReporting,
        supplierVatEntryId,
        supplierRecoverableRate,
        createdById: actorId,
        updatedById: actorId,
        allocations: { create: input.allocations.map((row) => ({ ...row })) },
      },
    });
    await audit(
      tx,
      actorId,
      source,
      "Recorded a reviewed credit; original document and actual cash retained.",
      {
        creditId: credit.id,
        reference: input.reference,
        totalHt: input.totalHt,
        vatAmount: input.vatAmount,
        allocations: input.allocations,
      },
    );
    return result(source, credit.id);
  });
}

function scopeFromCredit(credit: {
  side: string;
  billingDocumentId: string | null;
  orderId: string | null;
}): CreditScope {
  if (credit.side === "CLIENT" && credit.billingDocumentId)
    return { side: "CLIENT", sourceId: credit.billingDocumentId };
  if (credit.side === "SUPPLIER" && credit.orderId)
    return { side: "SUPPLIER", sourceId: credit.orderId };
  throw new CreditError("The credit's original document link needs review.");
}

export async function recordCreditRefund(raw: unknown) {
  const input = creditRefundSchema.parse(raw);
  return inTransaction(async (tx, actorId) => {
    const credit = await tx.financialCredit.findUnique({
      where: { id: input.creditId },
      include: { refunds: true },
    });
    if (!credit || credit.isCancelled || credit.side !== input.side)
      throw new CreditError("Choose an active credit on the correct side.");
    const source = await loadCreditSource(tx, scopeFromCredit(credit));
    assertCreditSourceReady(source, input.expectedVersion);
    const { cash } = sourceCreditPosition(source);
    const creditRefunded = credit.refunds
      .filter((refund) => !refund.isCancelled)
      .reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
    if (
      new Decimal(input.amount).gt(cash.refundDue) ||
      creditRefunded
        .plus(input.amount)
        .gt(new Decimal(credit.totalHt).plus(credit.vatAmount))
    )
      throw new CreditError(
        "The refund exceeds actual refundable cash after credits or the remaining credit amount.",
      );
    if (
      credit.currencyCode !== source.currencyCode ||
      credit.reportingCurrencyCode !== source.reportingCurrencyCode
    )
      throw new CreditError(
        "The original currency context changed. Review the credit before refunding.",
      );
    if (credit.currencyCode !== credit.reportingCurrencyCode && !input.fxRate)
      throw new CreditError(
        "Enter the actual refund FX rate; credit FX is not an actual cash rate.",
      );
    const refund = await tx.financialCreditRefund.create({
      data: {
        creditId: credit.id,
        amount: input.amount,
        refundDate: dateOnlyToDate(input.refundDate),
        fxRateToReporting:
          credit.currencyCode === credit.reportingCurrencyCode
            ? null
            : (input.fxRate ?? null),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await audit(
      tx,
      actorId,
      source,
      source.side === "CLIENT"
        ? "Recorded an actual Client refund (cash out)."
        : "Recorded an actual Supplier refund (cash in).",
      {
        creditId: credit.id,
        refundId: refund.id,
        amount: input.amount,
        refundDate: input.refundDate,
      },
    );
    return result(source, refund.id);
  });
}

export async function cancelCredit(raw: unknown) {
  const input = cancelCreditSchema.parse(raw);
  return inTransaction(async (tx, actorId) => {
    const credit = await tx.financialCredit.findUnique({
      where: { id: input.creditId },
      include: { refunds: true },
    });
    if (!credit || credit.isCancelled)
      throw new CreditError("This credit is unavailable or already cancelled.");
    const source = await loadCreditSource(tx, scopeFromCredit(credit));
    assertCreditSourceReady(source, input.expectedVersion);
    if (credit.refunds.some((refund) => !refund.isCancelled))
      throw new CreditError(
        "Cancel the credit's actual refund entries before cancelling this credit.",
      );
    // Another credit's refund may rely on the combined credited balance.
    sourceCreditPosition({
      ...source,
      credits: source.credits.filter((row) => row.id !== credit.id),
    });
    await tx.financialCredit.update({
      where: { id: credit.id },
      data: { isCancelled: true, updatedById: actorId },
    });
    await audit(
      tx,
      actorId,
      source,
      "Cancelled a credit as an explicit correction; original history retained.",
      { creditId: credit.id, reason: input.reason },
    );
    return result(source, credit.id);
  });
}

export async function cancelRefund(raw: unknown) {
  const input = cancelCreditRefundSchema.parse(raw);
  return inTransaction(async (tx, actorId) => {
    const refund = await tx.financialCreditRefund.findUnique({
      where: { id: input.refundId },
      include: { credit: true },
    });
    if (!refund || refund.isCancelled)
      throw new CreditError("This refund is unavailable or already cancelled.");
    const source = await loadCreditSource(tx, scopeFromCredit(refund.credit));
    assertCreditSourceReady(source, input.expectedVersion);
    await tx.financialCreditRefund.update({
      where: { id: refund.id },
      data: { isCancelled: true, updatedById: actorId },
    });
    await audit(
      tx,
      actorId,
      source,
      "Cancelled a refund as an explicit cash correction; original entry retained.",
      { creditId: refund.creditId, refundId: refund.id, reason: input.reason },
    );
    return result(source, refund.id);
  });
}
