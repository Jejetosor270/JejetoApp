import { billingStatus } from "@/domain/billing/status";
import { businessToday, dateToDateOnly } from "@/domain/payments/dates";
import { earliestUnpaidTermDate } from "@/domain/payments/terms";
import Decimal from "decimal.js";
import type { Prisma } from "@/generated/prisma/client";
import { activeCreditsInclude } from "@/lib/credits/select";
import { getClientCreditPosition } from "@/domain/billing/credits";

const term = {
  dueDate: true,
  isCancelled: true,
  scheduledAmount: true,
  receipts: { select: { id: true, amount: true } },
} as const;
export const billingStatusSelect = {
  credits: activeCreditsInclude,
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
  const terms = record.matchedInstallment
    ? [record.matchedInstallment]
    : record.paymentInstallments;
  const position = getClientCreditPosition(record);
  return billingStatus({
    ...record,
    totalTtc: position.netDue,
    paid: position.netPaid,
    today,
    dueDate: new Decimal(position.outstanding).isZero()
      ? null
      : earliestUnpaidTermDate(
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
