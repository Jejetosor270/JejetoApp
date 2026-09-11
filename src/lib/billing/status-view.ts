import { billingStatus } from "@/domain/billing/status";
import { businessToday, dateToDateOnly } from "@/domain/payments/dates";
import { earliestUnpaidTermDate } from "@/domain/payments/terms";
import Decimal from "decimal.js";
import type { Prisma } from "@/generated/prisma/client";

const term = {
  dueDate: true,
  isCancelled: true,
  scheduledAmount: true,
  receipts: { select: { id: true, amount: true } },
} as const;
export const billingStatusSelect = {
  workflowStatus: true,
  documentType: true,
  isCancelled: true,
  totalTtc: true,
  dueDate: true,
  receipts: { select: { id: true, amount: true } },
  matchedInstallment: { select: term },
  paymentInstallments: { select: term },
} satisfies Prisma.ClientBillingDocumentSelect;

export function billingRecordStatus(
  record: Prisma.ClientBillingDocumentGetPayload<{
    select: typeof billingStatusSelect;
  }>,
  today = businessToday(),
) {
  const receipts = [
    ...new Map(
      [...record.receipts, ...(record.matchedInstallment?.receipts ?? [])].map(
        (r) => [r.id, r],
      ),
    ).values(),
  ];
  const terms = record.matchedInstallment
    ? [record.matchedInstallment]
    : record.paymentInstallments;
  return billingStatus({
    ...record,
    totalTtc: record.totalTtc.toString(),
    paid: receipts
      .reduce((sum, r) => sum.plus(r.amount), new Decimal(0))
      .toString(),
    today,
    dueDate: earliestUnpaidTermDate(
      terms.map((t) => ({
        dueDate: dateToDateOnly(t.dueDate),
        isCancelled: t.isCancelled,
        scheduledAmount: t.scheduledAmount.toString(),
        payments: t.receipts.map((r) => ({ amount: r.amount.toString() })),
      })),
      dateToDateOnly(record.dueDate),
    ),
  });
}
