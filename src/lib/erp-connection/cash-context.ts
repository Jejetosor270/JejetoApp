import "server-only";
import Decimal from "decimal.js";
import type { Prisma } from "@/generated/prisma/client";
import { loadCreditSource, sourceCreditPosition } from "@/lib/credits/source";
import { assertCreditSafeMutation } from "@/lib/credits/mutation-guards";
import { editVersion } from "@/lib/edit-version";
import { cashEditVersion } from "@/lib/payments/edit-version";
import { dateToDateOnly } from "@/domain/payments/dates";
import type { CashChange } from "./cash-contract";

export class CashProposalError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}
export const isSupplierChange = (action: string) =>
  action.endsWith("SUPPLIER_PAYMENT");
export const isCancellation = (action: string) => action.startsWith("CANCEL_");
export const isCreation = (action: string) => action.startsWith("RECORD_");
const sum = (rows: readonly { amount: Decimal.Value }[]) =>
  rows.reduce((total, row) => total.plus(row.amount), new Decimal(0));

interface CashSnapshot {
  id: string;
  amount: string;
  date: string;
  fxRate: string | null;
  reference: string | null;
  notes: string | null;
  version: string;
}

export async function cashChangeContext(
  tx: Prisma.TransactionClient,
  change: CashChange,
) {
  const supplier = isSupplierChange(change.action);
  const creation = isCreation(change.action);
  const cancel = isCancellation(change.action);
  const payment = "amount" in change ? change : null;
  let documentId: string;
  let installmentId: string | null;
  let cash: CashSnapshot | null = null;
  if (supplier) {
    const row = creation
      ? null
      : await tx.paymentSettlement.findUnique({
          where: { id: change.targetId },
        });
    if (!creation && !row)
      throw new CashProposalError("The payment is no longer available.", 404);
    installmentId = row?.installmentId ?? change.targetId;
    if (row)
      cash = {
        id: row.id,
        amount: row.amount.toString(),
        date: dateToDateOnly(row.settledAt),
        fxRate: row.fxRateToReporting?.toString() ?? null,
        reference: row.reference,
        notes: row.notes,
        version: cashEditVersion(row),
      };
    const term = await tx.paymentInstallment.findUnique({
      where: { id: installmentId },
    });
    if (!term?.orderId || term.direction !== "SUPPLIER_PAYMENT")
      throw new CashProposalError(
        "Choose a Supplier payment term linked to an Order.",
      );
    documentId = term.orderId;
  } else {
    const row = creation
      ? null
      : await tx.clientReceipt.findUnique({ where: { id: change.targetId } });
    if (!creation && !row)
      throw new CashProposalError("The receipt is no longer available.", 404);
    documentId = row?.billingDocumentId ?? change.targetId;
    installmentId =
      row?.installmentId ??
      (change.action === "RECORD_CLIENT_RECEIPT"
        ? (change.installmentId ?? null)
        : null);
    if (row)
      cash = {
        id: row.id,
        amount: row.amount.toString(),
        date: dateToDateOnly(row.receivedAt),
        fxRate: row.fxRateToReporting?.toString() ?? null,
        reference: row.reference,
        notes: row.notes,
        version: cashEditVersion(row),
      };
  }
  const source = await loadCreditSource(tx, {
    side: supplier ? "SUPPLIER" : "CLIENT",
    sourceId: documentId,
  });
  if (!source.eligible || !source.projectId || source.blockedReason)
    throw new CashProposalError(
      "Review this record in the ERP: an active, assigned Order or issued Client Invoice with unambiguous currency and links is required.",
    );
  const project = await tx.project.findUnique({
    where: { id: source.projectId },
    select: { id: true, name: true, status: true, reportingCurrencyCode: true },
  });
  const party = supplier
    ? await tx.procurementOrder
        .findUnique({
          where: { id: documentId },
          select: { supplier: { select: { id: true, displayName: true } } },
        })
        .then((row) => row?.supplier)
    : await tx.clientBillingDocument
        .findUnique({
          where: { id: documentId },
          select: { client: { select: { id: true, displayName: true } } },
        })
        .then((row) => row?.client);
  if (!project || !party)
    throw new CashProposalError(
      "The Project or counterparty is no longer available.",
    );
  const supplierTerm =
    supplier && installmentId
      ? await tx.paymentInstallment.findUnique({
          where: { id: installmentId },
          include: { settlements: true },
        })
      : null;
  const clientTerm =
    !supplier && installmentId
      ? await tx.clientPaymentInstallment.findUnique({
          where: { id: installmentId },
          include: {
            receipts: true,
            matchedInvoices: {
              select: { id: true, isCancelled: true, workflowStatus: true },
            },
          },
        })
      : null;
  const term = supplierTerm ?? clientTerm;
  if (installmentId && !term)
    throw new CashProposalError("The payment term is no longer available.");
  if (
    term &&
    (term.currencyCode !== source.currencyCode || (!cancel && term.isCancelled))
  )
    throw new CashProposalError(
      "Choose an active payment term in the document currency.",
    );
  if (clientTerm) {
    const invoice = await tx.clientBillingDocument.findUnique({
      where: { id: documentId },
      select: { matchedInstallmentId: true },
    });
    if (
      clientTerm.billingDocumentId !== documentId &&
      invoice?.matchedInstallmentId !== clientTerm.id
    )
      throw new CashProposalError(
        "The payment term does not belong to this Invoice.",
      );
    if (
      clientTerm.matchedInvoices.filter(
        (row) =>
          !row.isCancelled &&
          !["DRAFT", "CANCELLED"].includes(row.workflowStatus),
      ).length > 1
    )
      throw new CashProposalError(
        "Review the payment term's multiple Invoice links in the ERP.",
      );
  }
  if (!creation && cash)
    await assertCreditSafeMutation(
      tx,
      supplier ? "PaymentSettlement" : "ClientReceipt",
      [cash.id],
      cancel,
    );
  const position = sourceCreditPosition(source);
  const remaining = new Decimal(position.cash.outstanding);
  const termRemaining = term
    ? new Decimal(term.scheduledAmount).minus(
        sum(supplierTerm?.settlements ?? clientTerm?.receipts ?? []),
      )
    : remaining;
  const available = Decimal.max(0, Decimal.min(remaining, termRemaining));
  const proposed = payment
    ? new Decimal(payment.amount === "REMAINING" ? available : payment.amount)
    : new Decimal(cash?.amount ?? 0);
  if (proposed.lte(0))
    throw new CashProposalError("There is no remaining amount to record.");
  const previous = new Decimal(cash?.amount ?? 0);
  if (
    !cancel &&
    proposed.gt(
      Decimal.min(remaining.plus(previous), termRemaining.plus(previous)),
    )
  )
    throw new CashProposalError(
      "The amount exceeds the current document or payment-term balance.",
    );
  if (payment && payment.currency !== source.currencyCode)
    throw new CashProposalError(
      "The currency must match the selected document and payment term.",
    );
  const foreign = source.currencyCode !== project.reportingCurrencyCode;
  if (payment && foreign && !payment.fxRate)
    throw new CashProposalError(
      "Enter the actual cash FX rate to the Project currency. Expected FX is not reused.",
    );
  if (
    payment &&
    !foreign &&
    payment.fxRate &&
    !new Decimal(payment.fxRate).eq(1)
  )
    throw new CashProposalError("Same-currency cash uses FX 1.");
  const fxRate = payment
    ? foreign
      ? (payment.fxRate ?? null)
      : null
    : (cash?.fxRate ?? null);
  const date = payment?.date ?? cash?.date;
  if (!date) throw new CashProposalError("The actual payment date is missing.");
  return {
    source,
    documentId,
    installmentId,
    projectId: project.id,
    projectName: project.name,
    partyName: party.displayName,
    recordReference: source.reference,
    termLabel: term?.label ?? null,
    cash,
    stateHash: editVersion({
      source: source.snapshot,
      term,
      cash,
      project,
      party,
    }),
    amount: proposed.toFixed(4),
    currencyCode: source.currencyCode,
    reportingCurrencyCode: project.reportingCurrencyCode,
    date,
    fxRate,
    reference: payment?.reference ?? cash?.reference ?? null,
    notes: payment?.notes ?? cash?.notes ?? null,
    remainingBefore: remaining.toFixed(4),
    remainingAfter: (cancel
      ? remaining.plus(previous)
      : remaining.plus(previous).minus(proposed)
    ).toFixed(4),
  };
}
