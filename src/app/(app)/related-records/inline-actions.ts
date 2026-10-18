"use server";
import { z } from "zod";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import {
  updateInstallmentInline,
  updateSettlement,
} from "@/lib/payments/payments";
import { PaymentValidationError } from "@/lib/payments/errors";
import {
  ClientBillingValidationError,
  updateClientBillingInstallment,
  updateClientReceipt,
  updateOrderBillingLink,
} from "@/lib/billing/billing";
import {
  isPaymentWriteConflict,
  paymentTermEditVersion,
  paymentVersionMatches,
  stalePaymentMessage,
} from "@/lib/payments/edit-version";
import {
  updateSettlementSchema,
  inlineInstallmentSchema,
} from "@/domain/payments/validation";
import {
  clientBillingInstallmentUpdateSchema,
  clientReceiptUpdateSchema,
  orderBillingLinkSchema,
} from "@/domain/billing/validation";
import { dateOnlyToDate } from "@/domain/payments/dates";
import type { BulkActionState } from "@/domain/deletion/action-state";

/** Small row editors keep currencies, FX and all fields outside the row unchanged. */
export async function editRelatedFinancialRowAction(
  kind: string,
  parentId: string | undefined,
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const input = z
    .object({
      id: z.uuid(),
      value: z.string().trim().max(200),
      date: z.string().optional(),
      amount: z.string(),
      freight: z.string().optional(),
      expectedVersion: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!input.success)
    return { status: "error", message: "Check the row fields." };
  const { id, value, date, amount, expectedVersion } = input.data;
  try {
    const db = getDatabase();
    if (kind === "payment") {
      const row = await db.paymentSettlement.findUniqueOrThrow({
        where: { id },
      });
      await updateSettlement(
        actor.id,
        updateSettlementSchema.parse({
          id,
          expectedVersion,
          installmentId: row.installmentId,
          reference: value,
          amount,
          settledAt: date,
          fxRate: row.fxRateToReporting?.toString(),
          notes: row.notes ?? undefined,
        }),
      );
    } else if (kind === "receipt") {
      const row = await db.clientReceipt.findUniqueOrThrow({ where: { id } });
      await updateClientReceipt(
        actor.id,
        clientReceiptUpdateSchema.parse({
          id,
          expectedVersion,
          billingDocumentId: row.billingDocumentId,
          installmentId: row.installmentId ?? undefined,
          reference: value,
          amount,
          receivedAt: date,
          fxRate: row.fxRateToReporting?.toString(),
          notes: row.notes ?? undefined,
        }),
      );
    } else if (kind === "allocation" || kind === "allocation-order") {
      const billingId = z.uuid().parse(kind === "allocation" ? parentId : id);
      const orderId = z.uuid().parse(kind === "allocation" ? id : parentId);
      const billing = await db.clientBillingDocument.findUniqueOrThrow({
        where: { id: billingId },
      });
      await updateOrderBillingLink(
        actor.id,
        orderBillingLinkSchema.parse({
          billingDocumentId: billingId,
          orderId,
          remove: false,
          basis: "FIXED_AMOUNT",
          allocatedAmount: amount,
          freightCoverageHt: input.data.freight,
          isProjectRemainderApproved: billing.isProjectRemainderApproved,
        }),
      );
    } else if (kind === "supplier-installment") {
      const row = await db.paymentInstallment.findUniqueOrThrow({
        where: { id },
      });
      await updateInstallmentInline(
        actor.id,
        inlineInstallmentSchema.parse({
          id,
          expectedVersion,
          label: value,
          dueDate: date,
          scheduledAmount: amount,
          notes: row.notes ?? undefined,
        }),
      );
    } else if (kind === "client-installment") {
      const draft = inlineInstallmentSchema.parse({
        id,
        expectedVersion,
        label: value,
        dueDate: date,
        scheduledAmount: amount,
      });
      const current = await db.clientPaymentInstallment.findUniqueOrThrow({
        where: { id },
      });
      if (current.billingDocumentId) {
        const amountChanged = !new Decimal(amount).equals(
          current.scheduledAmount.toString(),
        );
        await updateClientBillingInstallment(
          actor.id,
          clientBillingInstallmentUpdateSchema.parse({
            ...draft,
            billingDocumentId: current.billingDocumentId,
            basis: amountChanged ? "FIXED_AMOUNT" : current.basis,
            percentageRate: amountChanged
              ? undefined
              : current.percentageRate?.mul(100).toString(),
            notes: current.notes ?? undefined,
          }),
        );
      } else
        await db.$transaction(
          async (tx) => {
            const row = await tx.clientPaymentInstallment.findUniqueOrThrow({
              where: { id },
              include: { receipts: true },
            });
            if (
              row.billingDocumentId ||
              !paymentVersionMatches(
                expectedVersion,
                paymentTermEditVersion(row, null),
              )
            )
              throw new ClientBillingValidationError(stalePaymentMessage);
            const settled = row.receipts.reduce(
              (sum, cash) => sum.plus(cash.amount.toString()),
              new Decimal(0),
            );
            const nextAmount = new Decimal(draft.scheduledAmount);
            if (nextAmount.lessThan(settled))
              throw new ClientBillingValidationError(
                "Scheduled amount cannot be lower than recorded cash.",
              );
            const data = {
              label: draft.label,
              dueDate: draft.dueDate ? dateOnlyToDate(draft.dueDate) : null,
              scheduledAmount: draft.scheduledAmount,
              updatedById: actor.id,
              ...(!nextAmount.equals(row.scheduledAmount.toString())
                ? { basis: "FIXED_AMOUNT" as const, percentageRate: null }
                : {}),
            };
            await tx.clientPaymentInstallment.update({ where: { id }, data });
            await writeAuditEvent(tx, actor.id, {
              action: "UPDATED",
              entityId: id,
              entityType: "INSTALLMENT",
              entityReference: value,
              summary:
                "Edited installment label, due date and scheduled amount inline.",
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    } else
      return { status: "error", message: "Choose an editable record type." };
    revalidatePath("/", "layout");
    return { status: "success", message: "Row saved." };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Check the row fields.")
          : isPaymentWriteConflict(error)
            ? stalePaymentMessage
            : error instanceof PaymentValidationError ||
                error instanceof ClientBillingValidationError
              ? error.message
              : "The row could not be saved. Check amounts against the document and recorded cash. Your draft is retained.",
    };
  }
}
