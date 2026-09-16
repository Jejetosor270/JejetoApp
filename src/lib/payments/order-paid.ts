import "server-only";
import Decimal from "decimal.js";
import type { Prisma } from "@/generated/prisma/client";
import { getOrderInTransaction } from "@/lib/procurement/orders";
import { nextInstallmentSequence } from "./sequence";
import { recordSettlementInTransaction } from "./payments";
import { settlementSchema } from "@/domain/payments/validation";
import { businessToday } from "@/domain/payments/dates";
import { PaymentValidationError } from "./errors";
import { writeAuditEvent } from "@/lib/audit/events";

export async function payOrderRemaining(
  tx: Prisma.TransactionClient,
  actorId: string,
  input: {
    id: string;
    amount?: string | undefined;
    paymentDate?: string | undefined;
    paymentFx?: string | undefined;
  },
) {
  const order = await getOrderInTransaction(tx, input.id);
  if (!order || order.status === "CANCELLED")
    throw new PaymentValidationError("Select an active Order.");
  const remaining = order.supplierPayment.outstanding;
  if (remaining === null)
    throw new PaymentValidationError(
      "Reconcile the Order payment currencies before marking Paid.",
    );
  if (new Decimal(remaining).lessThanOrEqualTo(0)) return;
  const requested = input.amount
    ? new Decimal(settlementSchema.shape.amount.parse(input.amount))
    : new Decimal(remaining);
  if (
    !requested.isFinite() ||
    requested.lessThanOrEqualTo(0) ||
    requested.greaterThan(remaining)
  )
    throw new PaymentValidationError(
      "Enter a positive amount no greater than the remaining balance.",
    );
  const terms = await tx.paymentInstallment.findMany({
    where: {
      orderId: input.id,
      direction: "SUPPLIER_PAYMENT",
      isCancelled: false,
    },
    include: { settlements: true },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });
  if (terms.some((t) => t.currencyCode !== order.orderCurrencyCode))
    throw new PaymentValidationError(
      "Mixed-currency terms must be paid individually.",
    );
  if (
    order.orderCurrencyCode !== order.project.reportingCurrencyCode &&
    !input.paymentFx
  )
    throw new PaymentValidationError(
      "Enter actual payment FX to record this foreign-currency payment.",
    );
  let unrecorded = requested;
  const record = async (installmentId: string, amount: Decimal) =>
    recordSettlementInTransaction(
      tx,
      actorId,
      settlementSchema.parse({
        installmentId,
        amount: amount.toFixed(4),
        settledAt: input.paymentDate || businessToday(),
        fxRate: input.paymentFx,
      }),
    );
  for (const term of terms) {
    const unpaid = Decimal.max(
      0,
      new Decimal(term.scheduledAmount.toString()).minus(
        term.settlements.reduce(
          (sum, row) => sum.plus(row.amount.toString()),
          new Decimal(0),
        ),
      ),
    );
    const amount = Decimal.min(unpaid, unrecorded);
    if (amount.greaterThan(0)) {
      await record(term.id, amount);
      unrecorded = unrecorded.minus(amount);
    }
  }
  if (unrecorded.greaterThan(0)) {
    const term = await tx.paymentInstallment.create({
      data: {
        orderId: input.id,
        direction: "SUPPLIER_PAYMENT",
        basis: "FIXED_AMOUNT",
        label: "Remaining balance",
        scheduledAmount: unrecorded.toFixed(4),
        currencyCode: order.orderCurrencyCode,
        sequence: await nextInstallmentSequence(
          tx,
          input.id,
          "SUPPLIER_PAYMENT",
        ),
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await writeAuditEvent(tx, actorId, {
      action: "CREATED",
      entityType: "INSTALLMENT",
      entityId: term.id,
      entityReference: term.label,
      summary: "Created remaining Supplier payment term for actual settlement.",
      metadata: { amount: unrecorded.toFixed(4), orderId: input.id },
    });
    await record(term.id, unrecorded);
  }
}
