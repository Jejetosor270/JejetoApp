"use client";

import { businessToday } from "@/domain/payments/dates";
import { paymentAmountToRecord } from "@/domain/payments/terms";
import { billingTermPresentation } from "@/domain/billing/term-presentation";
import type { ClientBillingView } from "@/lib/billing/billing";
import { TermPaymentActions } from "@/components/payments/term-payment-actions";
import { TermStatusAction } from "@/components/payments/term-status-action";
import { BillingTermForm } from "./billing-term-form";

export function BillingTermActions({
  document,
  term,
  open,
  onOpenChange,
}: {
  document: ClientBillingView;
  term: ClientBillingView["paymentInstallments"][number];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const state = billingTermPresentation({
    amount: term.scheduledAmount,
    payments: term.receipts,
    dueDate: term.dueDate,
    cancelled: term.isCancelled || document.isCancelled,
    today: businessToday(),
    cappedRemaining: term.creditOutstandingAmount,
    balanceReviewRequired: term.balanceReviewRequired,
    hasCredits: Boolean(document.creditPosition),
  });
  const remaining = paymentAmountToRecord(
    state.remaining ?? "0",
    document.outstanding,
  );
  return (
    <TermPaymentActions
      label={term.label}
      document={document}
      termId={term.id}
      remaining={remaining}
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
      editor={(onSaved) => (
        <BillingTermForm
          document={document}
          installment={term}
          onSaved={onSaved}
        />
      )}
      canPay={
        !document.isCancelled &&
        !term.isCancelled &&
        remaining !== "0" &&
        document.documentType === "INVOICE" &&
        !["DRAFT", "TO_BE_INVOICED", "CANCELLED"].includes(document.status)
      }
    >
      {!document.isCancelled && (term.isCancelled || remaining !== "0") && (
        <TermStatusAction
          id={term.id}
          kind="client"
          cancelled={term.isCancelled}
        />
      )}
    </TermPaymentActions>
  );
}
