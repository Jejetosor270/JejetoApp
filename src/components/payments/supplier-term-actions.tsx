"use client";

import { businessToday } from "@/domain/payments/dates";
import {
  paymentAmountToRecord,
  paymentTermState,
} from "@/domain/payments/terms";
import type { PaymentInstallmentView } from "@/lib/payments/payments";
import { InstallmentForm } from "./payment-forms";
import { TermPaymentActions } from "./term-payment-actions";
import { TermStatusAction } from "./term-status-action";

/** All Supplier term entry points use the creation form and the same payment controls. */
export function SupplierTermActions({
  installment,
  baseAmount,
  currencies,
  canPay = true,
  open,
  onOpenChange,
}: {
  installment: PaymentInstallmentView;
  baseAmount: string;
  currencies: readonly { code: string }[];
  canPay?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const state = paymentTermState({
    amount: installment.scheduledAmount,
    payments: installment.settlements,
    dueDate: installment.dueDate,
    cancelled: installment.isCancelled,
    today: businessToday(),
  });
  const remaining = paymentAmountToRecord(
    state.remaining,
    installment.outstandingAmount,
  );
  return (
    <TermPaymentActions
      label={installment.label}
      supplier={{ ...installment, outstandingAmount: remaining }}
      canPay={
        canPay &&
        installment.direction === "SUPPLIER_PAYMENT" &&
        !installment.isCancelled &&
        remaining !== "0"
      }
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
      editor={(onSaved) => (
        <InstallmentForm
          baseAmount={baseAmount}
          currencies={currencies}
          defaultCurrencyCode={installment.currencyCode}
          direction={installment.direction}
          orderId={installment.orderId}
          reportingCurrencyCode={installment.reportingCurrencyCode}
          installment={installment}
          onSaved={onSaved}
        />
      )}
    >
      {(installment.isCancelled || state.remaining !== "0") && (
        <TermStatusAction
          id={installment.id}
          kind="supplier"
          cancelled={installment.isCancelled}
        />
      )}
    </TermPaymentActions>
  );
}
