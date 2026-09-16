import "server-only";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { retainedCurrency } from "@/lib/related-records/context";
import { recordSettlementInTransaction } from "./payments";
import { recordClientReceiptInTransaction } from "@/lib/billing/billing";
import { businessToday } from "@/domain/payments/dates";
import { PaymentValidationError } from "./errors";
import { settlementSchema } from "@/domain/payments/validation";
import { clientReceiptSchema } from "@/domain/billing/validation";

/** Reads and settles the current balance atomically; retries never duplicate cash. */
export async function payTermRemaining(
  actorId: string,
  input: {
    kind: "supplier" | "client";
    id: string;
    documentId?: string | undefined;
    fxRate?: string | undefined;
    date?: string | undefined;
  },
) {
  return getDatabase().$transaction(
    async (tx) => {
      if (input.kind === "supplier") {
        const term = await tx.paymentInstallment.findUniqueOrThrow({
          where: { id: input.id },
          include: { settlements: true, order: { include: { project: true } } },
        });
        if (term.direction !== "SUPPLIER_PAYMENT")
          throw new PaymentValidationError("Select a Supplier payment term.");
        const remaining = new Decimal(term.scheduledAmount).minus(
          term.settlements.reduce(
            (sum, row) => sum.plus(row.amount),
            new Decimal(0),
          ),
        );
        if (remaining.lte(0)) return;
        if (
          term.currencyCode !==
            retainedCurrency(
              term.order?.project?.reportingCurrencyCode,
              term.order?.detachedReportingCurrencyCode ??
                term.detachedReportingCurrencyCode,
            ) &&
          !input.fxRate
        )
          throw new PaymentValidationError(
            "Enter actual payment FX before recording this foreign-currency payment.",
          );
        await recordSettlementInTransaction(
          tx,
          actorId,
          settlementSchema.parse({
            installmentId: term.id,
            amount: remaining.toFixed(4),
            settledAt: input.date || businessToday(),
            fxRate: input.fxRate,
          }),
        );
      } else {
        if (!input.documentId)
          throw new PaymentValidationError(
            "Select the Invoice for this payment term.",
          );
        const term = await tx.clientPaymentInstallment.findUniqueOrThrow({
          where: { id: input.id },
          include: { receipts: true },
        });
        const remaining = new Decimal(term.scheduledAmount).minus(
          term.receipts.reduce(
            (sum, row) => sum.plus(row.amount),
            new Decimal(0),
          ),
        );
        if (remaining.lte(0)) return;
        // Receipt validation checks Invoice ownership, currency/FX, cancellation and limits.
        await recordClientReceiptInTransaction(
          tx,
          actorId,
          clientReceiptSchema.parse({
            installmentId: term.id,
            billingDocumentId: input.documentId,
            amount: remaining.toFixed(4),
            receivedAt: input.date || businessToday(),
            fxRate: input.fxRate,
          }),
        );
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
